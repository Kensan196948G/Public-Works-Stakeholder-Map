import { buildCsv } from '@pwsm/domain';
import type { SearchResponse } from '@pwsm/contracts';
import {
  CONFIDENCE_LABELS,
  ORGANIZATION_TYPE_LABELS,
  PRECISION_LABELS,
  VERIFICATION_STATE_LABELS,
} from './labels.js';

/**
 * 候補一覧の CSV 生成（要件 FR-010 / §11.1）。
 * 出典・取得日時・免責・データ版・出力日時を必ず含める。
 * セルの無害化（数式注入対策）とエスケープは @pwsm/domain の buildCsv が行う。
 */
export function buildCandidatesCsv(response: SearchResponse, exportedAt: Date): string {
  const rows: string[][] = [
    ['公共工事ステークホルダー整理マップ 候補一覧'],
    ['免責', response.disclaimer],
    ['データ版', response.datasetVersion],
    ['ルール版', String(response.ruleVersion)],
    ['出力日時', exportedAt.toISOString()],
    [],
    [
      '機関種別',
      '機関名',
      '部署',
      '信頼度',
      '確認状態',
      'データ精度',
      '推定区域',
      '一致理由',
      '出典タイトル',
      '出典URL',
      '原典確認日',
      '確認期限',
    ],
    ...response.candidates.flatMap((candidate) =>
      candidate.evidence.map((evidence, index) => [
        ORGANIZATION_TYPE_LABELS[candidate.type],
        candidate.name,
        candidate.officeName ?? '',
        CONFIDENCE_LABELS[candidate.confidence],
        VERIFICATION_STATE_LABELS[candidate.verificationState],
        PRECISION_LABELS[candidate.precision],
        candidate.estimated ? '推定' : '',
        // 理由は先頭 evidence 行のみに出力し、重複行を避ける
        index === 0 ? candidate.reasons.join(' / ') : '',
        evidence.title,
        evidence.url,
        candidate.sourceCheckedAt ?? '不明',
        candidate.freshnessDueAt ?? '不明',
      ]),
    ),
  ];
  return buildCsv(rows);
}

/** CSV をブラウザからダウンロードさせる */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
