// [upstream-compat] Adaptation layer surface. Generated from upstream upstream-v2026.9.6.
// See manifest.json + README.md. Upgrade: bump the tag, re-run
// scripts/assemble_compat_layer.py, `pnpm tsgo`, `pnpm config:schema:gen`.
import type { z } from "zod";
import { CloudWorkersConfigSchema } from "./zod-schema.cloud-workers.js";
import { DesktopConfigSchema } from "./zod-schema.desktop.js";
import { ProxyConfigSchema } from "./zod-schema.proxy.js";
import { SecuritySchema, AccessGroupsSchema } from "./zod-schema.root-support.js";
import { TelemetryConfigSchema } from "./zod-schema.telemetry.js";

export const UPSTREAM_COMPAT_VERSION = "upstream-v2026.9.6";

/**
 * New top-level config sections introduced upstream after the fork base
 * (2026.3.27). Spread into OpenClawSchemaShape by src/config/zod-schema.ts.
 * Keys the fork already defines (session, memory, gateway, hooks, ...) are
 * deliberately NOT included — the fork's own schema stays authoritative for
 * those, keeping its runtime types consistent.
 */
export const upstreamCompatSections: Record<string, z.ZodTypeAny> = {
  telemetry: TelemetryConfigSchema,
  desktop: DesktopConfigSchema,
  proxy: ProxyConfigSchema,
  security: SecuritySchema,
  accessGroups: AccessGroupsSchema,
  cloudWorkers: CloudWorkersConfigSchema,
};

/**
 * Version-adaptive access to the extra sections.
 *
 * - Default (fork gateway): sections are added so the 2026.3-based core can
 *   validate/store settings authored for newer OpenClaw releases.
 * - OPENCLAW_DISABLE_UPSTREAM_COMPAT=1: layer fully off — the gateway runs as
 *   vanilla OpenClaw (independent mode / other gateway cores).
 * - Keys already defined by the running core are never overridden, so the
 *   same layer is safe across different OpenClaw versions.
 */
export function upstreamCompatSectionList(): Record<string, z.ZodTypeAny> {
  if (process.env.OPENCLAW_DISABLE_UPSTREAM_COMPAT === "1") {
    return {};
  }
  return upstreamCompatSections;
}
