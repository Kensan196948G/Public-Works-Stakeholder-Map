import postgres from 'postgres';

type PgClient = ReturnType<typeof postgres>;
type JsonValue = Parameters<PgClient['json']>[0];

/**
 * postgres.js 接続（タグ付きテンプレート + query(text, params) 互換）。
 * 動的SQL断片（ORDER BY / LIMIT の可変句など）は tagged template の式に
 * 埋め込めない（パラメータ化される）ため、query(text, params) で実行する。
 */
export type Sql = PgClient & {
  query: (text: string, params?: unknown[]) => Promise<unknown[]>;
};

/**
 * jsonb 列へ挿入するオブジェクトのパラメータ化。
 * 文字列（JSON.stringify 済み）を直接渡すと postgres.js が JSON エスケープして
 * 「jsonb 文字列」として保存されてしまうため、必ず sql.json() 経由で送る。
 */
export function jsonParam(
  sql: Sql,
  value: Record<string, unknown> | null | undefined,
): ReturnType<PgClient['json']> {
  return sql.json((value ?? {}) as unknown as JsonValue);
}

const pgPools = new Map<string, Sql>();

/**
 * ローカル PostgreSQL 接続を返す（postgres.js・TCP ドライバ）。
 * Neon HTTP ドライバ（@neondatabase/serverless）は使用しない。
 * 接続先は DATABASE_URL 形式（例: postgresql://user:pass@127.0.0.1:5432/pwsm）。
 * 同一 URL への接続はプールを再利用する。
 */
export function getSql(databaseUrl: string): Sql {
  let sql = pgPools.get(databaseUrl);
  if (!sql) {
    const client = postgres(databaseUrl, { max: 5 });
    sql = Object.assign(client, {
      query: (text: string, params: unknown[] = []) =>
        client.unsafe(text, params as never[]) as Promise<unknown[]>,
    });
    pgPools.set(databaseUrl, sql);
  }
  return sql;
}
