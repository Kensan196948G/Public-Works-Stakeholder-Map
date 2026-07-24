import { neon } from '@neondatabase/serverless';
import type {
  CreateImportRequest,
  DataSourceSummary,
  ImportRecord,
  QualityReport,
  ReviewState,
} from '@pwsm/contracts';
import { demoDataset } from '@pwsm/fixtures';

/**
 * 管理機能リポジトリ（SCR-06〜08、Phase 2）。
 * - fixture: DATABASE_URL 未設定の開発モード。demoDataset からソース台帳を導出し、
 *   取込ステージングはメモリ保持（再起動で消える。検証用）
 * - db: staging.import_records / provenance.* を正本とする
 */
export interface AdminRepository {
  listSources(): Promise<DataSourceSummary[]>;
  listImports(state: ReviewState | undefined, limit: number): Promise<ImportRecord[]>;
  getImport(id: string): Promise<ImportRecord | null>;
  createImport(request: CreateImportRequest): Promise<ImportRecord | 'source_not_found'>;
  updateImportState(
    id: string,
    nextState: ReviewState,
    note: string | undefined,
  ): Promise<ImportRecord | null>;
  qualityReport(datasetVersion: string): Promise<QualityReport>;
}

/* ------------------------------------------------------------------ */
/* fixture 実装                                                        */
/* ------------------------------------------------------------------ */

function addDays(iso: string, days: number): Date {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function createFixtureAdminRepository(now: () => Date): AdminRepository {
  // demoDataset の組織ごとに 1 公式ソースを導出（seed 生成と同じ考え方）
  const organizations = demoDataset.organizations;
  const sources: DataSourceSummary[] = organizations.map((org, index) => ({
    id: `src-${org.id}`,
    name: `${org.name} 公式情報`,
    publisher: org.name,
    baseUrl: org.officialUrl,
    authority: org.authority,
    format: 'HTML',
    fetchMode: 'manual',
    ttlDays: org.ttlDays,
    // 最終の 1 件は利用条件未記録のデモ（§9.3: リンク+索引限定の対象を可視化）
    licenseText: index === organizations.length - 1 ? null : '出典明記のうえ利用可（デモ）',
    licenseUrl: null,
    active: true,
    lastFetchedAt: new Date(org.sourceCheckedAt).toISOString(),
    // 最後から 2 件目は取得失敗のデモ（SCR-06 のエラー表示確認用）
    lastFetchResult: index === organizations.length - 2 ? 'failed' : 'success',
    lastErrorCode: index === organizations.length - 2 ? 'HTTP_404' : null,
  }));

  const baseTime = '2026-07-20T00:00:00.000Z';
  const imports: ImportRecord[] = [
    {
      id: 'imp-demo-0001',
      sourceId: sources[0]?.id ?? 'src-unknown',
      sourceName: sources[0]?.name ?? null,
      entityKind: 'organization',
      rawPayload: { name: 'みらい市 下水道課（デモ）', url: 'https://example.com/demo/mirai-city/sewer' },
      normalizedPayload: null,
      qualityFlags: [],
      reviewState: 'pending',
      reviewerNote: null,
      createdAt: baseTime,
      updatedAt: baseTime,
    },
    {
      id: 'imp-demo-0002',
      sourceId: sources[1]?.id ?? 'src-unknown',
      sourceName: sources[1]?.name ?? null,
      entityKind: 'jurisdiction',
      rawPayload: { assetName: 'みらい市道 3 号線（デモ）', boundary: 'estimated' },
      normalizedPayload: { assetName: 'みらい市道3号線（デモ）' },
      qualityFlags: ['boundary_estimated'],
      reviewState: 'in_review',
      reviewerNote: null,
      createdAt: baseTime,
      updatedAt: baseTime,
    },
    {
      id: 'imp-demo-0003',
      sourceId: sources[2]?.id ?? 'src-unknown',
      sourceName: sources[2]?.name ?? null,
      entityKind: 'office',
      rawPayload: { officeName: '道路維持担当（デモ・重複疑い）' },
      normalizedPayload: null,
      qualityFlags: ['possible_duplicate'],
      reviewState: 'rejected',
      reviewerNote: '既存窓口と重複の可能性（デモ）',
      createdAt: baseTime,
      updatedAt: baseTime,
    },
  ];

  return {
    listSources: () => Promise.resolve([...sources]),

    listImports: (state, limit) =>
      Promise.resolve(
        imports
          .filter((r) => state === undefined || r.reviewState === state)
          .slice()
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, limit),
      ),

    getImport: (id) => Promise.resolve(imports.find((r) => r.id === id) ?? null),

    createImport: (request) => {
      const source = sources.find((s) => s.id === request.sourceId);
      if (source === undefined) return Promise.resolve('source_not_found');
      const timestamp = now().toISOString();
      const record: ImportRecord = {
        id: crypto.randomUUID(),
        sourceId: source.id,
        sourceName: source.name,
        entityKind: request.entityKind,
        rawPayload: request.rawPayload,
        normalizedPayload: null,
        qualityFlags: [],
        reviewState: 'pending',
        reviewerNote: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      imports.unshift(record);
      return Promise.resolve(record);
    },

    updateImportState: (id, nextState, note) => {
      const record = imports.find((r) => r.id === id);
      if (record === undefined) return Promise.resolve(null);
      record.reviewState = nextState;
      if (note !== undefined) record.reviewerNote = note;
      record.updatedAt = now().toISOString();
      return Promise.resolve({ ...record });
    },

    qualityReport: (datasetVersion) => {
      const current = now();
      const published = organizations.filter((o) => o.reviewStatus === 'published');
      const overdue = published.filter(
        (o) => addDays(o.sourceCheckedAt, o.ttlDays).getTime() < current.getTime(),
      ).length;
      const jurisdictionCount = published.reduce((sum, o) => sum + o.regionCodes.length, 0);
      const estimatedJurisdictions = published
        .filter((o) => o.estimated)
        .reduce((sum, o) => sum + o.regionCodes.length, 0);
      const importCounts = { pending: 0, in_review: 0, approved: 0, rejected: 0, quarantined: 0 };
      for (const record of imports) importCounts[record.reviewState] += 1;
      return Promise.resolve({
        generatedAt: current.toISOString(),
        datasetVersion,
        sources: {
          total: sources.length,
          active: sources.filter((s) => s.active).length,
          missingLicense: sources.filter((s) => s.licenseText === null && s.licenseUrl === null)
            .length,
        },
        published: { organizations: published.length, jurisdictions: jurisdictionCount },
        freshness: { overdue, withinTtl: published.length - overdue },
        evidence: { withEvidence: jurisdictionCount, missingEvidence: 0 },
        estimatedJurisdictions,
        imports: importCounts,
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Neon PostgreSQL 実装                                                */
/* ------------------------------------------------------------------ */

function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : new Date(String(value)).toISOString();
}

interface ImportRow {
  id: string;
  source_id: string;
  source_name: string | null;
  entity_kind: string;
  raw_payload: Record<string, unknown>;
  normalized_payload: Record<string, unknown> | null;
  quality_flags: unknown;
  review_state: string;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
}

function toImportRecord(row: ImportRow): ImportRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    entityKind: row.entity_kind as ImportRecord['entityKind'],
    rawPayload: row.raw_payload,
    normalizedPayload: row.normalized_payload,
    qualityFlags: Array.isArray(row.quality_flags) ? (row.quality_flags as string[]) : [],
    reviewState: row.review_state as ReviewState,
    reviewerNote: row.reviewer_note,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const IMPORT_SELECT = `
  SELECT r.id, r.source_id, s.name AS source_name, r.entity_kind,
         r.raw_payload, r.normalized_payload, r.quality_flags,
         r.review_state, r.reviewer_note, r.created_at, r.updated_at
  FROM staging.import_records r
  JOIN provenance.data_sources s ON s.id = r.source_id
`;

export function createDbAdminRepository(databaseUrl: string, now: () => Date): AdminRepository {
  const sql = neon(databaseUrl);

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async function getImportById(id: string): Promise<ImportRecord | null> {
    // uuid 形式でない ID は Postgres の型エラー（500）にせず not found 扱いにする
    if (!UUID_PATTERN.test(id)) return null;
    const rows = (await sql.query(`${IMPORT_SELECT} WHERE r.id = $1`, [id])) as ImportRow[];
    const row = rows[0];
    return row === undefined ? null : toImportRecord(row);
  }

  return {
    async listSources() {
      const rows = (await sql`
        SELECT s.id, s.name, s.publisher, s.base_url, s.authority::text AS authority,
               s.format, s.fetch_mode::text AS fetch_mode, s.ttl_days,
               s.license_text, s.license_url, s.active,
               snap.fetched_at, snap.result, snap.error_code
        FROM provenance.data_sources s
        LEFT JOIN LATERAL (
          SELECT fetched_at, result, error_code
          FROM provenance.source_snapshots
          WHERE source_id = s.id
          ORDER BY fetched_at DESC
          LIMIT 1
        ) snap ON true
        ORDER BY s.name
      `) as Record<string, unknown>[];
      return rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        publisher: String(row.publisher),
        baseUrl: String(row.base_url),
        authority: row.authority as DataSourceSummary['authority'],
        format: String(row.format),
        fetchMode: row.fetch_mode as DataSourceSummary['fetchMode'],
        ttlDays: Number(row.ttl_days),
        licenseText: (row.license_text as string | null) ?? null,
        licenseUrl: (row.license_url as string | null) ?? null,
        active: Boolean(row.active),
        lastFetchedAt: isoOrNull(row.fetched_at),
        lastFetchResult: (row.result as DataSourceSummary['lastFetchResult']) ?? null,
        lastErrorCode: (row.error_code as string | null) ?? null,
      }));
    },

    async listImports(state, limit) {
      // SQL 断片は tagged template の式に埋め込めない（パラメータ化される）ため query() を使う
      const rows = (state === undefined
        ? await sql.query(`${IMPORT_SELECT} ORDER BY r.created_at DESC LIMIT $1`, [limit])
        : await sql.query(
            `${IMPORT_SELECT} WHERE r.review_state = $1 ORDER BY r.created_at DESC LIMIT $2`,
            [state, limit],
          )) as ImportRow[];
      return rows.map(toImportRecord);
    },

    getImport: getImportById,

    async createImport(request) {
      const found = (await sql`
        SELECT id FROM provenance.data_sources WHERE id = ${request.sourceId}
      `) as { id: string }[];
      if (found.length === 0) return 'source_not_found';
      const inserted = (await sql`
        INSERT INTO staging.import_records (source_id, entity_kind, raw_payload)
        VALUES (${request.sourceId}, ${request.entityKind}, ${JSON.stringify(request.rawPayload)}::jsonb)
        RETURNING id
      `) as { id: string }[];
      const id = inserted[0]?.id;
      if (id === undefined) throw new Error('import insert returned no id');
      const record = await getImportById(id);
      if (record === null) throw new Error('inserted import not found');
      return record;
    },

    async updateImportState(id, nextState, note) {
      const updated = (await sql`
        UPDATE staging.import_records
        SET review_state = ${nextState},
            reviewer_note = COALESCE(${note ?? null}, reviewer_note)
        WHERE id = ${id}
        RETURNING id
      `) as { id: string }[];
      if (updated.length === 0) return null;
      return getImportById(id);
    },

    async qualityReport(datasetVersion) {
      const [summary] = (await sql`
        SELECT
          (SELECT count(*) FROM provenance.data_sources) AS total_sources,
          (SELECT count(*) FROM provenance.data_sources WHERE active) AS active_sources,
          (SELECT count(*) FROM provenance.data_sources
            WHERE license_text IS NULL AND license_url IS NULL) AS missing_license,
          (SELECT count(*) FROM core.organizations WHERE status = 'published') AS pub_orgs,
          (SELECT count(*) FROM core.jurisdictions WHERE status = 'published') AS pub_jur,
          (SELECT count(*) FROM core.organizations
            WHERE status = 'published' AND freshness_due_at < now()) AS overdue,
          (SELECT count(*) FROM core.organizations
            WHERE status = 'published'
              AND (freshness_due_at IS NULL OR freshness_due_at >= now())) AS within_ttl,
          (SELECT count(*) FROM core.jurisdictions
            WHERE status = 'published' AND evidence_id IS NOT NULL) AS with_evidence,
          (SELECT count(*) FROM core.jurisdictions
            WHERE status = 'published' AND evidence_id IS NULL) AS missing_evidence,
          (SELECT count(*) FROM core.jurisdictions
            WHERE status = 'published' AND estimated) AS estimated_jur
      `) as Record<string, unknown>[];
      const stateRows = (await sql`
        SELECT review_state, count(*) AS count
        FROM staging.import_records
        GROUP BY review_state
      `) as { review_state: ReviewState; count: unknown }[];
      const importCounts = { pending: 0, in_review: 0, approved: 0, rejected: 0, quarantined: 0 };
      for (const row of stateRows) importCounts[row.review_state] = Number(row.count);
      const n = (key: string): number => Number(summary?.[key] ?? 0);
      return {
        generatedAt: now().toISOString(),
        datasetVersion,
        sources: {
          total: n('total_sources'),
          active: n('active_sources'),
          missingLicense: n('missing_license'),
        },
        published: { organizations: n('pub_orgs'), jurisdictions: n('pub_jur') },
        freshness: { overdue: n('overdue'), withinTtl: n('within_ttl') },
        evidence: { withEvidence: n('with_evidence'), missingEvidence: n('missing_evidence') },
        estimatedJurisdictions: n('estimated_jur'),
        imports: importCounts,
      };
    },
  };
}
