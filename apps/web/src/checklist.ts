/**
 * 協議チェックリストの一時保持（FR-009、設計 §10）。
 * - 保存先: local storage（サーバへ送信しない）
 * - 保持期間: 7 日で失効（設計 §10: 24時間〜7日）
 * - 実案件名・個人情報を含めない前提（UI 側で注意表示する）
 */

/** 利用者による候補の判断状態 */
export type DecisionState = 'candidate' | 'needs_inquiry' | 'excluded';

export interface ChecklistEntry {
  state: DecisionState | null;
  note: string;
  decidedAt: string;
}

export type ChecklistEntries = Record<string, ChecklistEntry>;

interface StoredChecklist {
  version: 1;
  savedAt: string;
  entries: ChecklistEntries;
}

export const CHECKLIST_STORAGE_KEY = 'pwsm-checklist-v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** local storage が使えない環境（プライベートモード等）向けの in-memory フォールバック */
function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

let fallbackStorage: StorageLike | null = null;

function memoryFallback(): StorageLike {
  fallbackStorage ??= createMemoryStorage();
  return fallbackStorage;
}

/**
 * 利用可能なストレージを返す。local storage が取得不可、または各操作が
 * 実行時に失敗する環境（プライベートモード・容量超過等）では in-memory へ退避する。
 */
export function getChecklistStorage(): StorageLike {
  let storage: Storage;
  try {
    storage = window.localStorage;
    if (typeof storage?.getItem !== 'function') return memoryFallback();
  } catch {
    return memoryFallback();
  }
  // 操作単位でも失敗し得るため、例外時は in-memory へフォールバックする
  return {
    getItem: (key) => {
      try {
        return storage.getItem(key);
      } catch {
        return memoryFallback().getItem(key);
      }
    },
    setItem: (key, value) => {
      try {
        storage.setItem(key, value);
      } catch {
        memoryFallback().setItem(key, value);
      }
    },
    removeItem: (key) => {
      try {
        storage.removeItem(key);
      } catch {
        memoryFallback().removeItem(key);
      }
    },
  };
}

/** 保存済みチェックリストを読み込む。破損・期限切れは破棄して空を返す。 */
export function loadChecklist(storage: StorageLike, now: Date): ChecklistEntries {
  const raw = storage.getItem(CHECKLIST_STORAGE_KEY);
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw) as StoredChecklist;
    if (parsed.version !== 1 || typeof parsed.savedAt !== 'string') {
      storage.removeItem(CHECKLIST_STORAGE_KEY);
      return {};
    }
    const savedAt = Date.parse(parsed.savedAt);
    if (Number.isNaN(savedAt) || now.getTime() - savedAt > TTL_MS) {
      storage.removeItem(CHECKLIST_STORAGE_KEY);
      return {};
    }
    return parsed.entries ?? {};
  } catch {
    storage.removeItem(CHECKLIST_STORAGE_KEY);
    return {};
  }
}

/** チェックリストを保存する。空になった場合はキーごと削除する。 */
export function saveChecklist(storage: StorageLike, entries: ChecklistEntries, now: Date): void {
  if (Object.keys(entries).length === 0) {
    storage.removeItem(CHECKLIST_STORAGE_KEY);
    return;
  }
  const payload: StoredChecklist = { version: 1, savedAt: now.toISOString(), entries };
  storage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(payload));
}

/** 1 候補の判断を更新した新しいエントリ集合を返す（状態 null + メモ空なら削除） */
export function updateEntry(
  entries: ChecklistEntries,
  organizationId: string,
  patch: Partial<Pick<ChecklistEntry, 'state' | 'note'>>,
  now: Date,
): ChecklistEntries {
  const current = entries[organizationId] ?? { state: null, note: '', decidedAt: now.toISOString() };
  const next: ChecklistEntry = {
    state: patch.state !== undefined ? patch.state : current.state,
    note: patch.note !== undefined ? patch.note : current.note,
    decidedAt: now.toISOString(),
  };
  const result = { ...entries };
  if (next.state === null && next.note === '') {
    delete result[organizationId];
  } else {
    result[organizationId] = next;
  }
  return result;
}

export const DECISION_LABELS: Record<DecisionState, string> = {
  candidate: '協議候補',
  needs_inquiry: '要照会',
  excluded: '対象外',
};
