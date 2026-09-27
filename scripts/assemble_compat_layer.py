#!/usr/bin/env python3
"""
Assemble the OpenClaw upstream-compat adaptation layer.

Pulls the *new top-level config sections* (keys the fork does not define yet)
from an upstream tag into src/config/upstream-compat/, rewrites import paths
so the layer is self-contained, extracts the needed schemas from root-support,
and emits index.ts / manifest.json / README.md.

Usage: python3 assemble_compat_layer.py <upstream-tag> <repo-root>
"""
import json
import re
import subprocess
import sys
from pathlib import Path

TAG = sys.argv[1] if len(sys.argv) > 1 else "upstream-v2026.9.6"
ROOT = Path(sys.argv[2] if len(sys.argv) > 2 else ".").resolve()
LAYER = ROOT / "src/config/upstream-compat"

NEW_TOP_LEVEL_KEYS = {
    "telemetry": ("TelemetryConfigSchema", "zod-schema.telemetry.js"),
    "desktop": ("DesktopConfigSchema", "zod-schema.desktop.js"),
    "proxy": ("ProxyConfigSchema", "zod-schema.proxy.js"),
    "security": ("SecuritySchema", "zod-schema.root-support.js"),
    "accessGroups": ("AccessGroupsSchema", "zod-schema.root-support.js"),
    "cloudWorkers": ("CloudWorkersConfigSchema", "zod-schema.cloud-workers.js"),
}

# ---------------------------------------------------------------- git helper
def show(path: str) -> str:
    r = subprocess.run(
        ["git", "show", f"{TAG}:{path}"], cwd=ROOT, capture_output=True, text=True
    )
    if r.returncode != 0:
        raise RuntimeError(f"cannot read {TAG}:{path}: {r.stderr.strip()}")
    return r.stdout

# ------------------------------------------------------- path rewrite engine
CONFIG_LOCAL = re.compile(r'^(\s*(?:import|export)[^"\']*)"\./(zod-schema\.|schema\.|types\.)')
PARENT = re.compile(
    r'^(\s*(?:import|export)[^"\']*)"\.\./(cli|gateway|routing|shared|agents|plugins|secrets|infra|llm|utils|config)/'
)
REF_CONTRACT = re.compile(r'from "(\.\./)+secrets/ref-contract\.js"')
ANY_OPENCLAW = re.compile(r'from "[^"]*@openclaw/[a-z-]+(/[a-z-]+)?"')

def rewrite_imports(src: str, redirect_ref_contract: bool = True) -> str:
    out = []
    for line in src.splitlines(keepends=True):
        if line.lstrip().startswith(("import", "export", '} from "')):
            if "node-runner-inventory" in line:
                line = re.sub(r'from "[^"]*node-runner-inventory\.js"', 'from "./helpers.js"', line)
            elif "host-hook-json" in line:
                line = re.sub(r'from "[^"]*host-hook-json\.js"', 'from "./host-hook-json.js"', line)
            elif "agents/utils/git" in line:
                line = re.sub(r'from "[^"]*agents/utils/git\.js"', 'from "./agents-utils-git.js"', line)
            elif "schema.field-metadata" in line:
                line = re.sub(r'from "[^"]*schema\.field-metadata\.js"', 'from "./schema.field-metadata.js"', line)
            elif "schema.walk" in line:
                line = re.sub(r'from "[^"]*schema\.walk\.js"', 'from "./schema.walk.js"', line)
            elif "configUiMetadata" in line and "zod-schema.sensitive" in line:
                line = re.sub(r'from "[^"]*zod-schema\.sensitive\.js"', 'from "./helpers.js"', line)
            elif redirect_ref_contract and "secrets/ref-contract.js" in line:
                line = REF_CONTRACT.sub('from "./helpers.js"', line)
            else:
                line = PARENT.sub(r'\1"../../\2/', line)
                line = CONFIG_LOCAL.sub(r'\1"../\2', line)
            if "@openclaw/" in line:
                line = ANY_OPENCLAW.sub('from "./helpers.js"', line)
        out.append(line)
    return "".join(out)

COPIED: dict[str, str] = {}

def put(layer_name: str, upstream_path: str) -> None:
    src = show(upstream_path)
    src = rewrite_imports(src)
    (LAYER / layer_name).write_text(src)
    COPIED[layer_name] = upstream_path

# ------------------------------------------------------------------- helpers
def ref_contract_snippets(names: list[str]) -> str:
    """Extract exported declarations for `names` from upstream ref-contract."""
    src = show("src/secrets/ref-contract.ts")
    out = []
    for name in names:
        base = re.sub(r"^(type|const|function|interface) ", "", name)
        m = re.search(
            r"^export (?:const|function|type|interface) " + re.escape(base) + r"\b.*?(?=^export (?:const|function|type|interface) |\Z)",
            src,
            re.M | re.S,
        )
        if not m:
            raise RuntimeError(f"ref-contract: {name} not found upstream")
        out.append(m.group(0).rstrip() + "\n")
    return "\n".join(out)

HELPERS_TMPL = """// [upstream-compat] Minimal local replacements for upstream helper packages
// (@openclaw/normalization-core, @openclaw/net-policy) and for a handful of
// secrets/ref-contract helpers, so the adaptation layer stays self-contained.
// Semantic source: upstream {tag}.
import {{ z }} from "zod";

export function isHttpUrl(value: string): boolean {{
  try {{
    const u = new URL(value);
    return u.protocol === "http:";
  }} catch {{
    return false;
  }}
}}

export function isHttpsUrl(value: string): boolean {{
  try {{
    const u = new URL(value);
    return u.protocol === "https:";
  }} catch {{
    return false;
  }}
}}

export function isValidAgentId(value: string): boolean {{
  return /^[a-zA-Z0-9_-]{{1,64}}$/.test(value);
}}

export function normalizeAgentId(value: string | undefined | null): string {{
  const v = (value ?? "").trim();
  return v.length > 0 ? v : "main";
}}

export function normalizeLowercaseStringOrEmpty(value: unknown): string {{
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}}

export function normalizeStringifiedOptionalString(value: unknown): string | undefined {{
  const raw =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : undefined;
  if (raw === undefined) return undefined;
  const v = raw.trim();
  return v.length > 0 ? v : undefined;
}}

export function uniqueValues(values: readonly string[]): string[] {{
  return [...new Set(values)];
}}

export function isRecord(value: unknown): value is Record<string, unknown> {{
  return typeof value === "object" && value !== null && !Array.isArray(value);
}}

/** Upstream ConfigUiHint shape ({tag}, src/config/schema.ts) — compat subset. */
export interface ConfigUiHint {{
  label?: string;
  help?: string;
  placeholder?: string;
  advanced?: boolean;
  sensitive?: boolean;
  presentation?: string;
  tags?: string[];
  docsUrl?: string;
  groups?: unknown;
}}

/** Upstream attaches per-field UI metadata through this zod registry. */
export const configUiMetadata = z.registry<ConfigUiHint, z.ZodTypeAny>();

// ---- secrets ref-contract helpers (back-ported verbatim from {tag}) ----

{ref_contract_snippets}
"""

# ------------------------------------------------- root-support extraction
def balanced_block(src: str, start: int) -> tuple[int, int]:
    i = start
    depth = 0
    in_str = None
    esc = False
    while i < len(src):
        c = src[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == in_str:
                in_str = None
        else:
            if c in "\"'`":
                in_str = c
            elif c in "({[":
                depth += 1
            elif c in ")}]":
                depth -= 1
            elif c == ";" and depth == 0:
                return start, i + 1
        i += 1
    return start, len(src)

def extract_blocks(src: str, names: list[str]) -> str:
    parts = []
    for name in names:
        m = re.search(r"^export const " + name + r"\b", src, re.M)
        if not m:
            raise RuntimeError(f"root-support: {name} not found")
        a, b = balanced_block(src, m.start())
        parts.append(src[a:b])
    return "\n".join(parts)

def main() -> None:
    LAYER.mkdir(parents=True, exist_ok=True)

    # 1. helpers.ts
    snippets = ref_contract_snippets(
        [
            "SECRET_PROVIDER_ALIAS_PATTERN",
            "ENV_SECRET_REF_ID_RE",
            "formatExecSecretRefIdValidationMessage",
            "isValidExecSecretRefId",
            "isValidFileSecretRefId",
            "isSecretRef",
            "isValidSecretRef",
            "type SecretRef",
            "type SecretRefSource",
            "type SecretInput",
            "isValidSecretProviderAlias",
            "isValidEnvSecretRefId",
            "validateExecSecretRefId",
            "SINGLE_VALUE_FILE_REF_ID",
        ]
    )
    snippets = re.sub(
        r"^/\*\* [^*]*? \*/\ntype [A-Za-z0-9_]+ = \{.*?\n\};\n",
        "",
        snippets,
        flags=re.M | re.S,
    )
    helpers_text = HELPERS_TMPL.format(tag=TAG, ref_contract_snippets=snippets)
    if "NODE_WORKER_CAPACITY_MAX" not in helpers_text:
        helpers_text += (
            "\n/** Upstream: src/infra/node-runner-inventory.ts @ "
            + TAG
            + " */\nexport const NODE_WORKER_CAPACITY_MAX = 8;\n"
        )
    (LAYER / "helpers.ts").write_text(helpers_text)
    COPIED["helpers.ts"] = f"(hand-written; semantics from {TAG})"

    # 2. whole-file ports
    whole = [
        "zod-schema.telemetry.ts",
        "schema.walk.ts",
        "zod-schema.desktop.ts",
        "zod-schema.proxy.ts",
        "zod-schema.node-host.ts",
        "zod-schema.secret-input.ts",
        "zod-schema.cloud-workers.ts",
        "schema.field-metadata.ts",
        "sensitive-paths.ts",
        "cloud-worker-project-profiles.ts",
    ]
    for name in whole:
        put(name, f"src/config/{name}")
    put("control-ui-bootstrap-contract.ts", "src/gateway/control-ui-bootstrap-contract.ts")
    put("host-hook-json.ts", "src/plugins/host-hook-json.ts")
    put("agents-utils-git.ts", "src/agents/utils/git.ts")

    # 3. root-support partial extraction (Security + AccessGroups only)
    rs = show("src/config/zod-schema.root-support.ts")
    body = extract_blocks(rs, ["SecuritySchema", "AccessGroupsSchema"])
    wanted = {
        "findEdgeAuthIssue": ('import { findEdgeAuthIssue } from "../../shared/gateway-edge-auth-headers.js";', "../../shared/gateway-edge-auth-headers.ts"),
        "McpServerSchema": ('import { McpServerSchema } from "./zod-schema.mcp-server.js";', None),
        "NodeHostAgentRunsSchema": ('import { NodeHostAgentRunsSchema } from "./zod-schema.node-host.js";', None),
        "NodeHostWorkerRunsSchema": ('import { NodeHostWorkerRunsSchema } from "./zod-schema.node-host.js";', None),
        "SecretInputSchema": ('import { SecretInputSchema } from "./zod-schema.secret-input.js";', None),
        "sensitive": ('import { sensitive } from "../zod-schema.sensitive.js";', "src/config/zod-schema.sensitive.ts"),
        "normalizeLowercaseStringOrEmpty": ('import { normalizeLowercaseStringOrEmpty } from "./helpers.js";', None),
        "MemorySearchSchema": ('import { MemorySearchSchema } from "../zod-schema.memory-search.js";', None),
    }
    header = f"""// [upstream-compat] Extracted from upstream {TAG} src/config/zod-schema.root-support.ts
// (SecuritySchema / AccessGroupsSchema only; the upstream file also composes
// memory & node sections which this fork keeps at its own version.)
"""
    header += 'import { z } from "zod";\n'
    for sym in sorted(wanted):
        if re.search(r"\b" + sym + r"\b", body):
            header += wanted[sym][0] + "\n"
            if wanted[sym][1] and not (ROOT / wanted[sym][1]).exists():
                raise RuntimeError(f"root-support dep missing in fork: {sym}")
    header += "\n"
    (LAYER / "zod-schema.root-support.ts").write_text(header + body + "\n")
    COPIED["zod-schema.root-support.ts"] = f"src/config/zod-schema.root-support.ts (partial @ {TAG})"

    # 4. index.ts
    imports = "\n".join(
        f'import {{ {sym} }} from "./{file[:-3]}.js";'
        for key, (sym, file) in NEW_TOP_LEVEL_KEYS.items()
        if file != "zod-schema.root-support.js"
    )
    rs_imports = 'import {\n  SecuritySchema,\n  AccessGroupsSchema,\n} from "./zod-schema.root-support.js";'
    entries = "\n".join(
        f"  {key}: {sym}," for key, (sym, _file) in NEW_TOP_LEVEL_KEYS.items()
    )
    index = f"""// [upstream-compat] Adaptation layer surface. Generated from upstream {TAG}.
// See manifest.json + README.md. Upgrade: bump the tag, re-run
// scripts/assemble_compat_layer.py, `pnpm tsgo`, `pnpm config:schema:gen`.
import type {{ z }} from "zod";
{imports}
{rs_imports}

export const UPSTREAM_COMPAT_VERSION = "{TAG}";

/**
 * New top-level config sections introduced upstream after the fork base
 * (2026.3.27). Spread into OpenClawSchemaShape by src/config/zod-schema.ts.
 * Keys the fork already defines (session, memory, gateway, hooks, ...) are
 * deliberately NOT included — the fork's own schema stays authoritative for
 * those, keeping its runtime types consistent.
 */
export const upstreamCompatSections: Record<string, z.ZodTypeAny> = {{
{entries}
}};
"""
    (LAYER / "index.ts").write_text(index)
    COPIED["index.ts"] = "(hand-written surface)"

    # 5. manifest + README
    try:
        fork_keys = json.load(open("/tmp/fork_keys.json"))
    except Exception:
        fork_keys = []
    manifest = {
        "upstream_tag": TAG,
        "fork_base_version": "2026.3.27",
        "fork_top_level_keys": fork_keys,
        "added_keys": list(NEW_TOP_LEVEL_KEYS.keys()),
        "files": COPIED,
    }
    (LAYER / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (LAYER / "README.md").write_text(
        f"""# upstream-compat 适配层

fork 配置 schema 与上游 OpenClaw 新版本之间的**唯一适配点**。

- 来源：`{TAG}`（fork 基线 2026.3.27 / v2026.3.28）
- 新增顶层配置节：{", ".join(NEW_TOP_LEVEL_KEYS)}
- 接入点唯一：`src/config/zod-schema.ts` 把 `upstreamCompatSections`
  展开进 OpenClawSchema 顶层 shape，其余 fork 源码零修改。
- 自包含：上游工具包依赖（@openclaw/normalization-core、net-policy、
  secrets/ref-contract 增量导出）由 `helpers.ts` 本地实现替代。
- fork 已有的顶层节（session/memory/gateway/hooks/channels 等）不在本层
  重复定义——那些节以 fork 自身 schema 为准，保证运行时类型一致。

## 升级流程（下次上游更新）

1. `git fetch <upstream> refs/tags/v<new>:refs/tags/upstream-v<new>`
2. 重跑装配脚本：`python3 scripts/assemble_compat_layer.py upstream-v<new> .`
3. `pnpm tsgo` 检查类型，漂移只改本目录；
4. `pnpm config:schema:gen` 重新生成 base schema，`./build.sh` 重建镜像。

## 已知边界

- 新节对 fork 是"可校验、可保存"的配置面（WebUI 设置页因此能展示/编辑）；
  fork 运行逻辑是否消费这些配置取决于 fork 自身实现。
- `cloudWorkers` 依赖 `hosted-git-info`（纯 JS 小库，来自上游同版本）。
"""
    )
    print(f"layer assembled at {LAYER}: {len(COPIED)} files")

if __name__ == "__main__":
    main()
