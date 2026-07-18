/**
 * 正規化処理（詳細設計仕様書 §8.3）。
 * 原文は呼び出し側で必ず別途保存する。ここでは検索・重複判定用の正規化値のみ生成する。
 */

/** 制御文字（改行・タブ含む）を除去し、NFKC 正規化、連続空白を半角 1 つへ統合する。 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 法人格・組織種別の表記（前後の空白ゆらぎを吸収する対象） */
const CORPORATE_DESIGNATORS =
  /(株式会社|有限会社|合同会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|特定非営利活動法人|独立行政法人|地方独立行政法人)/g;

/**
 * 組織名の正規化。NFKC + 空白統合に加え、法人格表記の前後空白ゆらぎを吸収する
 * （§8.3: 「株式会社 サンプル」と「株式会社サンプル」を同一視して重複判定に用いる）。
 */
export function normalizeOrganizationName(input: string): string {
  return normalizeText(input).replace(
    new RegExp(`\\s*${CORPORATE_DESIGNATORS.source}\\s*`, 'g'),
    '$1',
  );
}

export interface NormalizedPhone {
  /** 原典の表示用文字列（そのまま） */
  display: string;
  /** 数字のみの正規化値。重複判定・検索用 */
  normalized: string;
  /** 内線番号（「内線123」等から分離） */
  extension: string | null;
}

/**
 * 電話番号正規化。表示用と正規化値を分離し、内線を別項目にする（データ品質ルール）。
 * +81 は国内プレフィックス 0 へ変換する。判定不能な文字列は normalized を空にする。
 */
export function normalizePhone(input: string): NormalizedPhone {
  const display = input.trim();
  const nfkc = display.normalize('NFKC');

  // Extract extension: 「内線123」「(内線 123)」「ext.123」
  let extension: string | null = null;
  let main = nfkc;
  const extMatch = nfkc.match(/(?:内線|ext\.?)\s*([0-9]+)/i);
  if (extMatch?.[1] !== undefined) {
    extension = extMatch[1];
    main = nfkc.slice(0, extMatch.index);
  }

  let digits = main.replace(/[^0-9+]/g, '');
  if (digits.startsWith('+81')) {
    digits = `0${digits.slice(3)}`;
  }
  digits = digits.replace(/[^0-9]/g, '');

  // 日本の電話番号は 10〜11 桁。範囲外は正規化失敗として空を返す（推測補完しない）。
  const normalized = digits.length >= 10 && digits.length <= 11 ? digits : '';
  return { display, normalized, extension };
}

export interface NormalizedUrl {
  /** fragment・追跡パラメータを除去した正規化 URL */
  normalized: string;
  /** HTTPS かどうか。HTTP は品質ゲートで要確認扱いにする */
  isHttps: boolean;
  /** パース失敗時 false。失敗した URL は公開対象にしない */
  valid: boolean;
}

const TRACKING_PARAMS = /^(utm_|gclid$|fbclid$|yclid$|mc_)/i;

/** URL 正規化。fragment 除去・追跡パラメータ除去・ホスト小文字化。canonical はここで書き換えない。 */
export function normalizeUrl(input: string): NormalizedUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { normalized: '', isHttps: false, valid: false };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { normalized: '', isHttps: false, valid: false };
  }
  url.hash = '';
  const toDelete: string[] = [];
  url.searchParams.forEach((_v, k) => {
    if (TRACKING_PARAMS.test(k)) toDelete.push(k);
  });
  for (const k of toDelete) url.searchParams.delete(k);
  url.hostname = url.hostname.toLowerCase();
  return { normalized: url.toString(), isHttps: url.protocol === 'https:', valid: true };
}
