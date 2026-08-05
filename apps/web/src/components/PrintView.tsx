import type { SearchResponse } from '@pwsm/contracts';
import type { ChecklistEntries } from '../checklist.js';
import { buildPrintTable } from '../print.js';

/** 印刷・PDF 用の候補一覧（FR-010）。画面では非表示、印刷時のみ表示する。 */
export function PrintView({
  response,
  checklist,
  exportedAt,
}: {
  response: SearchResponse;
  checklist: ChecklistEntries;
  exportedAt: Date;
}) {
  const table = buildPrintTable(response, exportedAt, checklist);
  return (
    <div className="print-area" aria-label="印刷用候補一覧" aria-hidden="true">
      <header>
        <h1>🗺️ 公共工事ステークホルダー整理マップ 候補一覧</h1>
        <p>データ版: {table.datasetVersion} ／ ルール版: {table.ruleVersion}</p>
        <p>出力日時: {table.exportedAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
      </header>
      <p className="print-disclaimer">{table.disclaimer}</p>
      <table>
        <thead>
          <tr>
            {table.headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
