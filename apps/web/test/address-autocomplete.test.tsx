// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GeocodeResponse } from '@pwsm/contracts';
import { SearchForm } from '../src/components/SearchForm.js';
import { geocode } from '../src/api.js';

vi.mock('../src/api.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
    }
  },
  geocode: vi.fn(),
}));

const geocodeResponse = {
  results: [
    { label: '東京都千代田区', location: { lat: 35.694003, lon: 139.753595 } },
    { label: '東京都中央区', location: { lat: 35.670651, lon: 139.771861 } },
  ],
  attribution: '国土地理院 住所検索API',
} as GeocodeResponse;

/** lat/lon は App が保持する設計のため、テストでは制御用ハーネスで包む */
function Harness() {
  const [lat, setLat] = useState('35');
  const [lon, setLon] = useState('139');
  return (
    <>
      <SearchForm
        onSearch={() => {}}
        searching={false}
        lat={lat}
        lon={lon}
        onLatChange={setLat}
        onLonChange={setLon}
        initialRadius={500}
      />
      <output data-testid="latlon">{`${lat},${lon}`}</output>
    </>
  );
}

function addressInput(): HTMLInputElement {
  // 「デモ地点」の <select> も暗黙の combobox role を持つため、ラベル名で特定する
  return screen.getByRole('combobox', { name: /住所で検索/ }) as HTMLInputElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(geocode).mockResolvedValue(geocodeResponse);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('住所検索の補完（オートコンプリート）', () => {
  it('2文字以上の入力後、debounce を経て候補が自動表示される', async () => {
    render(<Harness />);
    fireEvent.change(addressInput(), { target: { value: '東京都' } });
    expect(geocode).not.toHaveBeenCalled(); // debounce 中は呼ばれない
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(geocode).toHaveBeenCalledWith('東京都');
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByText(/東京都千代田区/)).toBeTruthy();
  });

  it('最小文字数（2文字）未満では自動検索しない', async () => {
    render(<Harness />);
    fireEvent.change(addressInput(), { target: { value: '東' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(geocode).not.toHaveBeenCalled();
  });

  it('候補の選択（マウス）で緯度経度が反映され、リストが閉じる', async () => {
    render(<Harness />);
    fireEvent.change(addressInput(), { target: { value: '東京都' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    fireEvent.mouseDown(screen.getByText(/東京都中央区/));
    expect(screen.getByTestId('latlon').textContent).toBe('35.670651,139.771861');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(addressInput().value).toBe('東京都中央区');
  });

  it('ArrowDown + Enter で 2 番目の候補を選択できる', async () => {
    render(<Harness />);
    const input = addressInput();
    fireEvent.change(input, { target: { value: '東京都' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // 先頭 → 2 番目
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('latlon').textContent).toBe('35.670651,139.771861');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Escape で候補リストを閉じる（入力値は保持）', async () => {
    render(<Harness />);
    const input = addressInput();
    fireEvent.change(input, { target: { value: '東京都' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('東京都');
  });

  it('選択直後は自動再検索が走らない（suppress 制御）', async () => {
    render(<Harness />);
    fireEvent.change(addressInput(), { target: { value: '東京都' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    fireEvent.mouseDown(screen.getByText(/東京都千代田区/));
    vi.mocked(geocode).mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(geocode).not.toHaveBeenCalled();
  });
});
