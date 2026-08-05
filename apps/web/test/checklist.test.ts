import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_STORAGE_KEY,
  exportChecklistJson,
  importChecklistJson,
  loadChecklist,
  saveChecklist,
  updateEntry,
  type ChecklistEntries,
} from '../src/checklist.js';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

const NOW = new Date('2026-07-18T00:00:00Z');

describe('checklist（FR-009 / 設計 §10）', () => {
  it('保存 → 読込の round trip', () => {
    const storage = fakeStorage();
    const entries: ChecklistEntries = {
      'org-1': { state: 'candidate', note: '掘削範囲を確認', decidedAt: NOW.toISOString() },
    };
    saveChecklist(storage, entries, NOW);
    expect(loadChecklist(storage, NOW)).toEqual(entries);
  });

  it('7 日超過で失効し、ストレージからも削除される', () => {
    const storage = fakeStorage();
    saveChecklist(storage, { 'org-1': { state: 'candidate', note: '', decidedAt: NOW.toISOString() } }, NOW);
    const eightDaysLater = new Date(NOW.getTime() + 8 * 86_400_000);
    expect(loadChecklist(storage, eightDaysLater)).toEqual({});
    expect(storage.getItem(CHECKLIST_STORAGE_KEY)).toBeNull();
  });

  it('破損データは破棄して空を返す', () => {
    const storage = fakeStorage({ [CHECKLIST_STORAGE_KEY]: '{broken json' });
    expect(loadChecklist(storage, NOW)).toEqual({});
    expect(storage.getItem(CHECKLIST_STORAGE_KEY)).toBeNull();
  });

  it('updateEntry: 状態とメモを更新し、空になったら削除する', () => {
    let entries: ChecklistEntries = {};
    entries = updateEntry(entries, 'org-1', { state: 'needs_inquiry' }, NOW);
    expect(entries['org-1']?.state).toBe('needs_inquiry');

    entries = updateEntry(entries, 'org-1', { note: '管轄不明' }, NOW);
    expect(entries['org-1']?.note).toBe('管轄不明');
    expect(entries['org-1']?.state).toBe('needs_inquiry');

    entries = updateEntry(entries, 'org-1', { state: null, note: '' }, NOW);
    expect(entries['org-1']).toBeUndefined();
  });

  it('空のエントリ保存はキーを削除する', () => {
    const storage = fakeStorage();
    saveChecklist(storage, { 'org-1': { state: 'candidate', note: '', decidedAt: NOW.toISOString() } }, NOW);
    saveChecklist(storage, {}, NOW);
    expect(storage.getItem(CHECKLIST_STORAGE_KEY)).toBeNull();
  });

  it('exportChecklistJson → importChecklistJson の round trip', () => {
    const entries: ChecklistEntries = {
      'org-1': { state: 'candidate', note: '確認済み', decidedAt: NOW.toISOString() },
    };
    const raw = exportChecklistJson(entries, NOW);
    expect(importChecklistJson(raw, NOW)).toEqual(entries);
  });

  it('不正 JSON・版違い・期限切れは null を返す', () => {
    expect(importChecklistJson('{broken', NOW)).toBeNull();
    expect(importChecklistJson('{"version":2,"exportedAt":"2026-07-18T00:00:00Z","entries":{}}', NOW)).toBeNull();
    const expired = exportChecklistJson(
      { 'org-1': { state: 'candidate', note: '', decidedAt: NOW.toISOString() } },
      NOW,
    );
    expect(
      importChecklistJson(expired, new Date(NOW.getTime() + 8 * 86_400_000)),
    ).toBeNull();
  });

  it('不正なエントリだけ除外して復元する', () => {
    const raw = JSON.stringify({
      version: 1,
      exportedAt: NOW.toISOString(),
      entries: {
        'org-ok': { state: 'excluded', note: '', decidedAt: NOW.toISOString() },
        'org-bad': { state: 'invalid', note: '', decidedAt: NOW.toISOString() },
        'org-missing': { state: null, note: 123, decidedAt: NOW.toISOString() },
      },
    });
    expect(importChecklistJson(raw, NOW)).toEqual({
      'org-ok': { state: 'excluded', note: '', decidedAt: NOW.toISOString() },
    });
  });
});
