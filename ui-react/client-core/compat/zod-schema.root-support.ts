// [upstream-compat] Extracted from upstream upstream-v2026.9.6 src/config/zod-schema.root-support.ts
// (SecuritySchema / AccessGroupsSchema only; the upstream file also composes
// memory & node sections which this fork keeps at its own version.)
import { z } from "zod";
import { sensitive } from "../zod-schema.sensitive.js";

export const SecuritySchema = z
  .strictObject({
    audit: z
      .strictObject({
        suppressions: z
          .array(
            z.strictObject({
              checkId: z.string().min(1),
              titleIncludes: z.string().min(1).optional(),
              detailIncludes: z.string().min(1).optional(),
              reason: z.string().min(1).optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    installPolicy: z
      .strictObject({
        enabled: z.boolean().optional(),
        targets: z
          .array(z.union([z.literal("skill"), z.literal("plugin")]))
          .min(1)
          .optional(),
        exec: z
          .strictObject({
            source: z.literal("exec"),
            command: z.string().min(1),
            args: z.array(z.string()).optional(),
            timeoutMs: z.number().int().min(1).optional(),
            noOutputTimeoutMs: z.number().int().min(1).optional(),
            maxOutputBytes: z.number().int().min(1).optional(),
            env: z.record(z.string(), z.string().register(sensitive)).optional(),
            passEnv: z.array(z.string()).optional(),
            trustedDirs: z.array(z.string()).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .optional();
export const AccessGroupsSchema = z
  .record(
    z.string().min(1),
    z.discriminatedUnion("type", [
      z.strictObject({
        type: z.literal("discord.channelAudience"),
        guildId: z.string().min(1),
        channelId: z.string().min(1),
        membership: z.literal("canViewChannel").optional(),
      }),
      z.strictObject({
        type: z.literal("message.senders"),
        members: z.record(z.string().min(1), z.array(z.string().min(1))),
      }),
    ]),
  )
  .optional();
