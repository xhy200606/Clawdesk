// [upstream-compat] Minimal local replacements for upstream helper packages
// (@openclaw/normalization-core, @openclaw/net-policy) and for a handful of
// secrets/ref-contract helpers, so the adaptation layer stays self-contained.
// Semantic source: upstream upstream-v2026.9.6.
import { z } from "zod";

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:";
  } catch {
    return false;
  }
}

export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidAgentId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

export function normalizeAgentId(value: string | undefined | null): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : "main";
}

export function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeStringifiedOptionalString(value: unknown): string | undefined {
  const raw =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : undefined;
  if (raw === undefined) {
    return undefined;
  }
  const v = raw.trim();
  return v.length > 0 ? v : undefined;
}

export function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Upstream ConfigUiHint shape (upstream-v2026.9.6, src/config/schema.ts) — compat subset. */
export interface ConfigUiHint {
  label?: string;
  help?: string;
  placeholder?: string;
  advanced?: boolean;
  sensitive?: boolean;
  presentation?: string;
  tags?: string[];
  docsUrl?: string;
  groups?: unknown;
}

/** Upstream attaches per-field UI metadata through this zod registry. */
export const configUiMetadata = z.registry<ConfigUiHint, z.ZodTypeAny>();

// ---- secrets ref-contract helpers (back-ported verbatim from upstream-v2026.9.6) ----

export const SECRET_PROVIDER_ALIAS_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const EXEC_SECRET_REF_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;

/** Canonical id for file secret providers that expose exactly one value. */

export const ENV_SECRET_REF_ID_RE = /^[A-Z][A-Z0-9_]{0,127}$/;

/** Return whether an env SecretRef id is a supported uppercase environment variable name. */

export function formatExecSecretRefIdValidationMessage(): string {
  return [
    "Exec secret reference id must match /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/",
    'and must not include "." or ".." path segments',
    '(example: "vault/openai/api-key" or "aws/secret#json_key").',
  ].join(" ");
}

export function isValidExecSecretRefId(value: string): boolean {
  return validateExecSecretRefId(value).ok;
}

/** Validates a complete SecretRef against the shared provider/source/id grammar. */

export function isValidFileSecretRefId(value: string): boolean {
  if (value === SINGLE_VALUE_FILE_REF_ID) {
    return true;
  }
  if (!value.startsWith("/")) {
    return false;
  }
  // File refs mirror JSON Pointer segment escaping; keep this in parity with gateway/schema
  // patterns so config, plugin SDK, and remote gateway validation accept the same ids.
  return value
    .slice(1)
    .split("/")
    .every((segment) => FILE_SECRET_REF_SEGMENT_PATTERN.test(segment));
}

/** Validates a secret provider alias against the shared config/gateway grammar. */

export function isSecretRef(value: unknown): value is SecretRef {
  if (!isRecord(value)) {
    return false;
  }
  if (Object.keys(value).length !== 3) {
    return false;
  }
  return (
    (value.source === "env" ||
      value.source === "file" ||
      value.source === "exec" ||
      value.source === "store") &&
    typeof value.provider === "string" &&
    value.provider.trim().length > 0 &&
    typeof value.id === "string" &&
    value.id.trim().length > 0
  );
}

/**
 * Runtime secret-reference grammar shared by config parsing, plugin SDK schemas,
 * gateway parity checks, and resolver planning.
 */

const FILE_SECRET_REF_SEGMENT_PATTERN = /^(?:[^~]|~0|~1)*$/;
/** Shared alias grammar for env/file/exec/store secret provider names. */

export function isValidSecretRef(ref: SecretRef): boolean {
  if (!isSecretRef(ref)) {
    return false;
  }
  if (!isValidSecretProviderAlias(ref.provider)) {
    return false;
  }
  if (ref.source === "env") {
    return isValidEnvSecretRefId(ref.id);
  }
  if (ref.source === "file") {
    return isValidFileSecretRefId(ref.id);
  }
  if (ref.source === "store") {
    return isValidEnvSecretRefId(ref.id);
  }
  return isValidExecSecretRefId(ref.id);
}

/** Formats the user-facing validation message for rejected exec secret ref ids. */

export type SecretRef = {
  source: SecretRefSource;
  provider: string;
  id: string;
};

/** Secret-bearing config input: either a literal string or a structured SecretRef. */

export type SecretRefSource = "env" | "file" | "exec" | "store"; // pragma: allowlist secret

/**
 * Stable identifier for a secret in a configured source.
 * Examples:
 * - env source: provider "default", id "OPENAI_API_KEY"
 * - file source: provider "mounted-json", id "/providers/openai/apiKey"
 * - exec source: provider "vault", id "openai/api-key"
 * - store source: provider "default", id "OPENAI_API_KEY"
 */

export type SecretInput = string | SecretRef;

/** Provider alias used when a SecretRef omits a source-specific provider. */

export function isValidSecretProviderAlias(value: string): boolean {
  return SECRET_PROVIDER_ALIAS_PATTERN.test(value);
}

/** Validates exec secret ref ids and reports why invalid ids failed. */

export function isValidEnvSecretRefId(value: string): boolean {
  return ENV_SECRET_REF_ID_RE.test(value);
}

/** Narrow a value to the canonical SecretRef object shape. */

export function validateExecSecretRefId(value: string): ExecSecretRefIdValidationResult {
  if (!EXEC_SECRET_REF_ID_PATTERN.test(value)) {
    return { ok: false, reason: "pattern" };
  }
  // The JSON schema uses a negative lookahead for traversal. Runtime validation keeps the same
  // rule explicit so UI/doctor flows can explain the safer failure class.
  for (const segment of value.split("/")) {
    if (segment === "." || segment === "..") {
      return { ok: false, reason: "traversal-segment" };
    }
  }
  return { ok: true };
}

/** Boolean convenience wrapper for callers that only need accept/reject behavior. */

export const SINGLE_VALUE_FILE_REF_ID = "value";

/** Failure class returned when an exec secret ref id is syntactically invalid. */
type ExecSecretRefIdValidationReason = "pattern" | "traversal-segment";

/** Result for callers that need to distinguish grammar failures from traversal attempts. */
type ExecSecretRefIdValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: ExecSecretRefIdValidationReason;
    };

/** Builds the stable map key used to cache or compare resolved secret refs. */

/** Upstream: src/infra/node-runner-inventory.ts @ upstream-v2026.9.6 */
export const NODE_WORKER_CAPACITY_MAX = 8;
