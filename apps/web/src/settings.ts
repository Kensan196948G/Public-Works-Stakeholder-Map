import { getChecklistStorage } from './checklist.js';

/**
 * システム設定（Issue #17）。ブラウザ内（local storage）のみで保持し、
 * サーバーへ送信しない。免責表示は設定で無効化できない（FR-007）。
 */

export interface AppSettings {
  /** 検索フォームの既定検索半径（m、0〜5000） */
  defaultRadiusMeters: number;
}

export const SETTINGS_STORAGE_KEY = 'pwsm-settings-v1';
export const DEFAULT_SETTINGS: AppSettings = { defaultRadiusMeters: 500 };

export function loadSettings(): AppSettings {
  const raw = getChecklistStorage().getItem(SETTINGS_STORAGE_KEY);
  if (raw === null) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const radius = parsed.defaultRadiusMeters;
    if (typeof radius === 'number' && Number.isInteger(radius) && radius >= 0 && radius <= 5000) {
      return { defaultRadiusMeters: radius };
    }
  } catch {
    // 破損時は既定値へ
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  getChecklistStorage().setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
