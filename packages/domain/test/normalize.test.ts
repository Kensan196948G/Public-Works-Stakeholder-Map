import { describe, expect, it } from 'vitest';
import { normalizePhone, normalizeText, normalizeUrl } from '../src/normalize.js';

describe('normalizeText', () => {
  it('NFKC 正規化で全角英数を半角へ統一する', () => {
    expect(normalizeText('ＡＢＣ１２３')).toBe('ABC123');
  });

  it('全半角空白・連続空白を半角 1 つへ統合する', () => {
    expect(normalizeText('東京都　千代田区   霞が関')).toBe('東京都 千代田区 霞が関');
  });

  it('制御文字を除去する', () => {
    expect(normalizeText('\u0001道路 管理課\ttab\u007f')).toBe('道路 管理課 tab');
  });

  it('前後の空白を除去する', () => {
    expect(normalizeText('  川の管理者  ')).toBe('川の管理者');
  });
});

describe('normalizePhone', () => {
  it('ハイフン付き番号を数字のみへ正規化し、表示用原文を保持する', () => {
    const result = normalizePhone('03-1234-5678');
    expect(result.normalized).toBe('0312345678');
    expect(result.display).toBe('03-1234-5678');
    expect(result.extension).toBeNull();
  });

  it('+81 国番号を国内プレフィックス 0 へ変換する', () => {
    expect(normalizePhone('+81-3-1234-5678').normalized).toBe('0312345678');
  });

  it('内線番号を分離する', () => {
    const result = normalizePhone('03-1234-5678 内線 234');
    expect(result.normalized).toBe('0312345678');
    expect(result.extension).toBe('234');
  });

  it('全角数字も正規化する', () => {
    expect(normalizePhone('０３－１２３４－５６７８').normalized).toBe('0312345678');
  });

  it('桁数が不正な場合は正規化値を空にする（推測補完しない）', () => {
    expect(normalizePhone('1234').normalized).toBe('');
    expect(normalizePhone('012345678901234').normalized).toBe('');
  });
});

describe('normalizeUrl', () => {
  it('fragment を除去する', () => {
    expect(normalizeUrl('https://example.jp/page#section').normalized).toBe(
      'https://example.jp/page',
    );
  });

  it('追跡パラメータを除去し、通常パラメータを保持する', () => {
    const result = normalizeUrl('https://example.jp/p?utm_source=x&id=42&gclid=abc');
    expect(result.normalized).toBe('https://example.jp/p?id=42');
  });

  it('ホスト名を小文字化する', () => {
    expect(normalizeUrl('https://Example.JP/Path').normalized).toBe('https://example.jp/Path');
  });

  it('HTTP を検出する（HTTPS 優先方針のため品質ゲートで扱う）', () => {
    const result = normalizeUrl('http://example.jp/');
    expect(result.valid).toBe(true);
    expect(result.isHttps).toBe(false);
  });

  it('不正な URL / 危険スキームは valid=false を返す', () => {
    expect(normalizeUrl('not a url').valid).toBe(false);
    expect(normalizeUrl('javascript:alert(1)').valid).toBe(false);
    expect(normalizeUrl('ftp://example.jp/file').valid).toBe(false);
  });
});
