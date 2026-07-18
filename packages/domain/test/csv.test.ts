import { describe, expect, it } from 'vitest';
import { buildCsv, CSV_BOM, escapeCsvCell, sanitizeCsvCell, toCsvCell } from '../src/csv.js';

describe('sanitizeCsvCell', () => {
  it.each(['=HYPERLINK("https://evil.example/")', '+1+2', '-3', '@cmd', '\tx', '\rx', '\nx'])(
    '数式トリガー %j にアポストロフィを前置する',
    (value) => {
      expect(sanitizeCsvCell(value)).toBe(`'${value}`);
    },
  );

  it('通常の文字列は変更しない', () => {
    expect(sanitizeCsvCell('東京都建設局')).toBe('東京都建設局');
    expect(sanitizeCsvCell('a=b')).toBe('a=b');
  });
});

describe('escapeCsvCell', () => {
  it('カンマ・引用符・改行を含むセルを二重引用符で包む', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('通常セルはそのまま', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
  });
});

describe('toCsvCell / buildCsv', () => {
  it('設計 §17.2 ケース6: =HYPERLINK を含むメモが数式実行されない形で出力される', () => {
    const cell = toCsvCell('=HYPERLINK("https://evil.example/",\'click\')');
    expect(cell.startsWith('"\'=HYPERLINK')).toBe(true);
  });

  it('BOM 付き CRLF 区切りの CSV を生成する', () => {
    const csv = buildCsv([
      ['機関名', 'メモ'],
      ['デモ機関', '=SUM(1)'],
    ]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toBe(`${CSV_BOM}機関名,メモ\r\nデモ機関,'=SUM(1)\r\n`);
  });
});
