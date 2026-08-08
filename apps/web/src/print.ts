import type { SearchResponse } from '@pwsm/contracts';
import { DECISION_LABELS, type ChecklistEntries } from './checklist.js';
import {
  CONFIDENCE_LABELS,
  ORGANIZATION_TYPE_LABELS,
  PRECISION_LABELS,
  VERIFICATION_STATE_LABELS,
} from './labels.js';
import { toIndexText } from './licensing.js';

/**
 * 印刷・PDF 用テーブル生成（要件 FR-010 / §11.1）。
 * 出典・取得日時・免責・データ版・出力日時を含め、CSV と同じ情報設計を保つ。
 * 出典タイトルは情報源由来のため索引長へ丸める（§9.3・画面/CSV と同一ポリシー）。
 */

export interface PrintTable {
  exportedAt: Date;
  datasetVersion: string;
  ruleVersion: number;
  disclaimer: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}

export function buildPrintTable(
  response: SearchResponse,
  exportedAt: Date,
  decisions: ChecklistEntries = {},
): PrintTable {
  const headers = [
    '機関種別',
    '機関名',
    '部署',
    '信頼度',
    '確認状態',
    'データ精度',
    '推定区域',
    '一致理由',
    '利用者判断',
    '確認メモ',
    '出典タイトル',
    '出典URL',
    '原典確認日',
    '確認期限',
  ] as const;

  const rows = response.candidates.flatMap((candidate) =>
    candidate.evidence.map((evidence, index) => {
      const state = decisions[candidate.organizationId]?.state;
      return [
        ORGANIZATION_TYPE_LABELS[candidate.type],
        candidate.name,
        candidate.officeName ?? '',
        CONFIDENCE_LABELS[candidate.confidence],
        VERIFICATION_STATE_LABELS[candidate.verificationState],
        PRECISION_LABELS[candidate.precision],
        candidate.estimated ? '推定' : '',
        index === 0 ? candidate.reasons.join(' / ') : '',
        index === 0 && state !== undefined && state !== null ? DECISION_LABELS[state] : '',
        index === 0 ? (decisions[candidate.organizationId]?.note ?? '') : '',
        toIndexText(evidence.title),
        evidence.url,
        candidate.sourceCheckedAt ?? '不明',
        candidate.freshnessDueAt ?? '不明',
      ];
    }),
  );

  return {
    exportedAt,
    datasetVersion: response.datasetVersion,
    ruleVersion: response.ruleVersion,
    disclaimer: response.disclaimer,
    headers,
    rows,
  };
}
