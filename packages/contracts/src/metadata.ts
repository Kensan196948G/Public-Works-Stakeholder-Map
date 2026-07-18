import { z } from 'zod';

/** GET /metadata 応答（詳細設計仕様書 §6.2）。秘密情報を含めない。 */
export const metadataResponseSchema = z.object({
  datasetVersion: z.string(),
  ruleVersion: z.number().int(),
  lastPublishedAt: z.iso.datetime({ offset: true }).nullable(),
  disclaimer: z.string(),
  appEnv: z.enum(['local', 'preview', 'staging', 'production']),
});
export type MetadataResponse = z.infer<typeof metadataResponseSchema>;
