// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { REQUIRED_DISCLAIMER, type Candidate, type SearchResponse } from '@pwsm/contracts';
import { CandidateCard } from '../src/components/CandidateCard.js';
import { ReviewPage } from '../src/components/ReviewPage.js';
import { fetchAdminImports } from '../src/api.js';
import { buildCandidatesCsv } from '../src/csv.js';
import { buildPrintTable } from '../src/print.js';
import {
  INDEX_SAFE_CANDIDATE_KEYS,
  INDEX_TEXT_MAX_LENGTH,
  contractCandidateKeys,
  findNonIndexCandidateKeys,
  previewPayloadJson,
  toIndexText,
} from '../src/licensing.js';

vi.mock('../src/api.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number = 500,
      readonly code: string | null = null,
    ) {
      super(message);
    }
  },
  fetchAdminImports: vi.fn(),
  reviewAdminImport: vi.fn(),
}));

/** 情報源の本文を貼り付けた想定の長文（reference_only では複製できない・索引長を超える） */
const SOURCE_BODY_TEXT =
  '道路使用許可の申請は、道路において工事若しくは作業をしようとする者が、' +
  '当該場所を管轄する警察署長の許可を受けなければならないものとされており、' +
  '申請書は所定の様式により正副二通を提出するものとする。なお手数料の額は条例で定める。' +
  'また、許可を受けた者は、許可証を現場に備え付け、係員の求めに応じて提示しなければならない。' +
  '工事の内容を変更しようとするときは、あらかじめ変更の許可を受ける必要がある。';

const candidate: Candidate = {
  organizationId: 'org-license-test',
  name: 'あおぞら県警察 みらい警察署（デモ）',
  type: 'police',
  officeName: '交通課',
  confidence: 'B',
  confidenceBreakdown: {
    authority: 25,
    freshness: 25,
    boundaryPrecision: 5,
    reviewState: 15,
    conflictingSourcesPenalty: 0,
    linkFailurePenalty: 0,
    total: 70,
  },
  verificationState: 'unverified',
  reasons: ['交通規制・交通影響を伴う条件が選択されています'],
  precision: 'estimated',
  estimated: true,
  sourceCheckedAt: '2026-06-19T15:00:00.000Z',
  freshnessDueAt: '2026-09-17T15:00:00.000Z',
  evidence: [
    {
      title: SOURCE_BODY_TEXT,
      url: 'https://example.com/demo/aozora-police/mirai',
      sourceCheckedAt: '2026-06-20T00:00:00+09:00',
    },
  ],
};

const response: SearchResponse = {
  queryId: 'q-license-test',
  datasetVersion: '2026-07-18.fixture.1',
  ruleVersion: 1,
  disclaimerRequired: true,
  disclaimer: REQUIRED_DISCLAIMER,
  candidates: [candidate],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('表示コンプライアンス（要件 §9.3・reference_only のリンク+索引限定）', () => {
  it('契約の候補フィールドが索引許可リストと一致する（本文フィールド追加の回帰検知）', () => {
    // 契約に説明文・抜粋・全文等のフィールドが追加された場合、ここが失敗する。
    // 追加時は §9.3 の観点で描画可否を判断してから許可リストを更新すること。
    expect([...contractCandidateKeys()].sort()).toEqual([...INDEX_SAFE_CANDIDATE_KEYS].sort());
  });

  it('索引として許可されないフィールドを検出する', () => {
    const withBody = { ...candidate, description: SOURCE_BODY_TEXT };
    expect(findNonIndexCandidateKeys(withBody)).toEqual(['description']);
    expect(findNonIndexCandidateKeys(candidate)).toEqual([]);
  });

  it('候補カードは本文相当の長文を索引長へ丸め、原典リンクへ誘導する', () => {
    render(
      <CandidateCard candidate={candidate} decision={undefined} onDecisionChange={() => {}} />,
    );
    // 本文がそのまま複製されていないこと
    expect(screen.queryByText(SOURCE_BODY_TEXT)).toBeNull();
    const link = screen.getByRole('link', { name: /道路使用許可の申請は/ });
    expect(link.textContent!.length).toBeLessThanOrEqual(INDEX_TEXT_MAX_LENGTH + 1);
    // 出典 URL は全経路で必須（§9.1 / FR-010）
    expect(link.getAttribute('href')).toBe('https://example.com/demo/aozora-police/mirai');
  });

  it('候補カードは契約外フィールドの本文を描画しない', () => {
    // API が契約外の本文を返しても api.ts の zod parse で strip されるが、
    // 万一 UI へ到達した場合も描画しないことを保証する。
    const injectedBody = '本文相当の説明文がここに入る（契約外フィールド）';
    const injected = { ...candidate, description: injectedBody } as Candidate;
    render(
      <CandidateCard candidate={injected} decision={undefined} onDecisionChange={() => {}} />,
    );
    expect(screen.queryByText(injectedBody)).toBeNull();
  });

  it('CSV は出典タイトルを索引長へ丸め、出典 URL と免責を含む', () => {
    const csv = buildCandidatesCsv(response, new Date('2026-07-18T00:00:00Z'));
    expect(csv).not.toContain(SOURCE_BODY_TEXT);
    expect(csv).toContain(toIndexText(SOURCE_BODY_TEXT));
    expect(csv).toContain('https://example.com/demo/aozora-police/mirai');
    expect(csv).toContain(REQUIRED_DISCLAIMER);
  });

  it('印刷テーブルは出典タイトルを索引長へ丸め、出典 URL 列を保持する', () => {
    const table = buildPrintTable(response, new Date('2026-07-18T00:00:00Z'));
    const row = table.rows[0]!;
    expect(row).not.toContain(SOURCE_BODY_TEXT);
    expect(row).toContain(toIndexText(SOURCE_BODY_TEXT));
    expect(table.headers).toContain('出典URL');
    expect(table.disclaimer).toBe(REQUIRED_DISCLAIMER);
  });
});

describe('toIndexText / previewPayloadJson', () => {
  it('短い索引情報はそのまま返す', () => {
    expect(toIndexText('道路使用許可の手続')).toBe('道路使用許可の手続');
  });

  it('改行・連続空白を畳み、上限を超える本文を丸める', () => {
    const multiline = `行1\n\n行2   行3`;
    expect(toIndexText(multiline)).toBe('行1 行2 行3');
    const long = 'あ'.repeat(INDEX_TEXT_MAX_LENGTH + 50);
    const result = toIndexText(long);
    expect(result).toHaveLength(INDEX_TEXT_MAX_LENGTH + 1);
    expect(result.endsWith('…')).toBe(true);
  });

  it('長大な取込ペイロードは既定で丸められる', () => {
    const small = previewPayloadJson({ name: '窓口' });
    expect(small.truncated).toBe(false);
    const large = previewPayloadJson({ body: SOURCE_BODY_TEXT.repeat(10) });
    expect(large.truncated).toBe(true);
    expect(large.text.length).toBeLessThan(JSON.stringify({ body: SOURCE_BODY_TEXT.repeat(10) }).length);
  });
});

describe('SCR-07 取込レビューの既定表示', () => {
  const record = {
    id: 'imp-license-1',
    sourceId: 'src-1',
    sourceName: '東京都建設局 道路占用（reference_only 想定）',
    entityKind: 'office' as const,
    rawPayload: { body: SOURCE_BODY_TEXT.repeat(5) },
    normalizedPayload: null,
    qualityFlags: [],
    reviewState: 'pending' as const,
    reviewerNote: null,
    createdAt: '2026-07-18T00:00:00Z',
    updatedAt: '2026-07-18T00:00:00Z',
  };

  it('既定では取込ペイロードの全文を描画せず、明示操作で全文表示する', async () => {
    vi.mocked(fetchAdminImports).mockResolvedValue({ records: [record] });
    render(<ReviewPage />);

    const payload = await screen.findByText(/道路使用許可の申請は/);
    const fullLength = JSON.stringify(record.rawPayload, null, 2).length;
    expect(payload.textContent!.length).toBeLessThan(fullLength);

    fireEvent.click(screen.getByRole('button', { name: /全文を表示/ }));
    expect(screen.getByText(/道路使用許可の申請は/).textContent).toHaveLength(fullLength);
  });

  it('本文複製不可の可能性を運用者へ明示する', async () => {
    vi.mocked(fetchAdminImports).mockResolvedValue({ records: [] });
    render(<ReviewPage />);
    expect(await screen.findByText(/複製・転載不可/)).toBeTruthy();
  });
});
