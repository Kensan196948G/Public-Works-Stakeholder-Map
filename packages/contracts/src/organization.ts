import { z } from 'zod';
import {
  boundaryPrecisionSchema,
  organizationTypeSchema,
  recordStatusSchema,
} from './enums.js';
import { evidenceSchema } from './search.js';

/**
 * 機関詳細 API 契約（FR-005 候補詳細・詳細設計仕様書 §6.2 GET /organizations/:id）。
 * 公開（published）データのみを返す。連絡先は緊急用を除外し、個人名・個人メールを含まない。
 */

export const officeDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  roleSummary: z.string().nullable(),
  addressRaw: z.string().nullable(),
  receptionNote: z.string().nullable(),
});
export type OfficeDetail = z.infer<typeof officeDetailSchema>;

export const contactPointDetailSchema = z.object({
  id: z.string(),
  contactType: z.enum(['phone', 'web', 'email', 'counter']),
  label: z.string(),
  /** 表示用の原典表記（正規化値は返さない） */
  displayValue: z.string(),
  extension: z.string().nullable(),
  sourceCheckedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type ContactPointDetail = z.infer<typeof contactPointDetailSchema>;

export const jurisdictionDetailSchema = z.object({
  id: z.string(),
  assetType: z.string(),
  assetName: z.string().nullable(),
  precision: boundaryPrecisionSchema,
  estimated: z.boolean(),
  scaleNote: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  evidence: z.array(evidenceSchema).min(1),
});
export type JurisdictionDetail = z.infer<typeof jurisdictionDetailSchema>;

export const organizationDetailSchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  type: organizationTypeSchema,
  officialUrl: z.string().nullable(),
  status: recordStatusSchema,
  sourceCheckedAt: z.iso.datetime({ offset: true }).nullable(),
  freshnessDueAt: z.iso.datetime({ offset: true }).nullable(),
  offices: z.array(officeDetailSchema),
  contactPoints: z.array(contactPointDetailSchema),
  jurisdictions: z.array(jurisdictionDetailSchema),
});
export type OrganizationDetail = z.infer<typeof organizationDetailSchema>;
