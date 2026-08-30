// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MapPicker } from '../src/components/MapPicker.js';

/**
 * MapPicker の WebGL 非対応フォールバック（Deep Debug 検出: 地図初期化失敗時に
 * 画面全体が白画面になる問題の回帰防止）。
 * - maplibre-gl の Map コンストラクタが例外を投げる環境（WebGL 無効等）でも
 *   フォールバック表示に切り替わり、クラッシュしないことを検証する。
 */

// maplibre-gl をモックし、Map コンストラクタの挙動をテストごとに制御する
const mapCtor = vi.fn();
vi.mock('maplibre-gl', () => {
  class MockMap {
    addControl = vi.fn();
    on = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    getLayer = vi.fn(() => undefined);
    getSource = vi.fn(() => undefined);
    removeLayer = vi.fn();
    removeSource = vi.fn();
    setData = vi.fn();
    easeTo = vi.fn();
    isStyleLoaded = vi.fn(() => true);
    remove = vi.fn();
    constructor(...args: unknown[]) {
      mapCtor(...args);
    }
  }
  class MockMarker {
    setLngLat = vi.fn(() => this);
    addTo = vi.fn(() => this);
  }
  class MockNavigationControl {}
  return {
    default: {
      Map: MockMap,
      Marker: MockMarker,
      NavigationControl: MockNavigationControl,
    },
  };
});

describe('MapPicker（WebGL フォールバック）', () => {
  afterEach(() => {
    cleanup();
    mapCtor.mockReset();
  });

  it('Map 初期化成功時は地図コンテナを表示する', () => {
    mapCtor.mockImplementation(() => {});
    render(
      <MapPicker location={{ lat: 35.05, lon: 139.05 }} onPick={() => {}} />,
    );
    expect(screen.getByRole('img', { name: '地図（クリックで地点を指定）' })).toBeTruthy();
    expect(screen.queryByText(/WebGL/)).toBeNull();
  });

  it('Map 初期化失敗（WebGL 非対応等）時はフォールバックを表示しクラッシュしない', () => {
    mapCtor.mockImplementation(() => {
      throw new Error('Failed to initialize WebGL');
    });
    render(
      <MapPicker location={{ lat: 35.05, lon: 139.05 }} onPick={() => {}} />,
    );
    expect(screen.getByText(/この環境では地図（WebGL）を表示できません/)).toBeTruthy();
    // フォールバック内の案内が表示される（候補一覧の利用を継続できる旨）
    expect(screen.getByText(/地図は視覚補助であり、候補一覧には影響しません/)).toBeTruthy();
    // 地図コンテナは表示されない
    expect(screen.queryByRole('img', { name: '地図（クリックで地点を指定）' })).toBeNull();
  });
});
