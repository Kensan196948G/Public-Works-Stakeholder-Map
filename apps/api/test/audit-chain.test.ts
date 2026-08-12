import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUDIT_GENESIS_HASH,
  __internalMemoryAuditEventsForTest,
  canonicalJson,
  clearMemoryAuditEvents,
  recordAuditEvent,
  verifyAuditChain,
} from '../src/repositories/audit-repository.js';

const FIXED_NOW = new Date('2026-08-12T00:00:00Z');

describe('canonicalJson（migration 0003 と同一の正準 JSON）', () => {
  it('キーを辞書順にし、空白なしで直列化する', () => {
    expect(canonicalJson({ b: 1, a: { z: 2, y: 3 }, c: null })).toBe(
      '{"a":{"y":3,"z":2},"b":1,"c":null}',
    );
  });

  it('配列は順序を保持する', () => {
    expect(canonicalJson([3, 1, { b: 2, a: 1 }])).toBe('[3,1,{"a":1,"b":2}]');
  });
});

describe('監査チェーン（migration 0003・メモリモード）', () => {
  beforeEach(() => {
    clearMemoryAuditEvents();
  });

  function input(overrides: Partial<Parameters<typeof recordAuditEvent>[1]> = {}) {
    return {
      actor: 'anonymous',
      action: 'stakeholder.search',
      targetKind: 'search',
      result: 'success' as const,
      correlationId: 'corr-1',
      metadata: { candidateCount: 3, datasetVersion: 'v1' },
      ...overrides,
    };
  }

  it('2 件記録して検証すると valid=true になる', async () => {
    await recordAuditEvent(undefined, input(), FIXED_NOW);
    await recordAuditEvent(undefined, input({ correlationId: 'corr-2' }), FIXED_NOW);
    const result = await verifyAuditChain(undefined);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(2);
    expect(result.store).toBe('memory');
  });

  it('先頭イベントの prev_hash は genesis と一致する', async () => {
    await recordAuditEvent(undefined, input(), FIXED_NOW);
    const events = __internalMemoryAuditEventsForTest();
    expect(events[0]?.prevHash).toBe(AUDIT_GENESIS_HASH);
  });

  it('イベントを改ざんすると valid=false で検出される', async () => {
    await recordAuditEvent(undefined, input(), FIXED_NOW);
    const events = __internalMemoryAuditEventsForTest();
    // 最新イベントの actor を書き換える（改ざんの再現）
    events[0]!.actor = 'tampered-actor';
    const result = await verifyAuditChain(undefined);
    expect(result.valid).toBe(false);
    expect(result.brokenAtEventId).toBe(events[0]?.id);
    expect(result.reason).toContain('不正');
  });
});
