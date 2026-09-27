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
