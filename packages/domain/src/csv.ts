/**
 * CSV 出力の安全化（詳細設計仕様書 §12.3、要件 §9.2 CSV数式注入対策）。
 * - 先頭が = + - @ tab CR/LF のセルへアポストロフィを付与し数式実行を防ぐ
 * - RFC 4180 に沿って引用符・改行・カンマをエスケープする
 * - UTF-8 BOM 方針は「付与する」で固定（Excel の文字化け防止）
 */

export const CSV_BOM = '\uFEFF';

const FORMULA_TRIGGER = /^[=+\-@\t\r\n]/;

/** 1 セルを無害化する。数式トリガー文字で始まる場合はアポストロフィを前置する。 */
export function sanitizeCsvCell(value: string): string {
  if (FORMULA_TRIGGER.test(value)) {
    return `'${value}`;
  }
  return value;
}

/** RFC 4180 エスケープ。カンマ・引用符・改行を含むセルを二重引用符で包む。 */
export function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** 無害化 → エスケープの順で 1 セルを確定する。 */
export function toCsvCell(value: string): string {
  return escapeCsvCell(sanitizeCsvCell(value));
}

/**
 * 行列データから CSV 文字列を生成する。改行は CRLF、先頭に BOM。
 * 出力にはデータ版・出力時刻・免責を含めること（呼び出し側の責務、要件 FR-010）。
 */
export function buildCsv(rows: readonly (readonly string[])[]): string {
  const body = rows.map((row) => row.map(toCsvCell).join(',')).join('\r\n');
  return `${CSV_BOM}${body}\r\n`;
}
