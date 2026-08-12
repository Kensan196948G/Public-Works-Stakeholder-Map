import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { JurisdictionMapResponse, Location } from '@pwsm/contracts';
import { demoDataset } from '@pwsm/fixtures';

/**
 * 地図による地点指定（FR-001/FR-003、Issue #9）。
 * - ベースマップ: 地理院タイル（出典表示必須: https://maps.gsi.go.jp/development/ichiran.html）
 * - クリックで地点を設定。地図は視覚補助であり、候補一覧は DOM 側で保持する（§9.1）
 * - デモ区域（架空）を面レイヤーで表示し、検証範囲を可視化する
 */

interface MapPickerProps {
  location: Location;
  onPick: (location: Location) => void;
  /** 検索結果の候補機関が持つ管轄区域（GeoJSON）。null ならハイライトしない */
  highlightRegions?: JurisdictionMapResponse | null;
}

const GSI_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    gsi: {
      type: 'raster',
      tiles: ['https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>',
    },
  },
  layers: [{ id: 'gsi', type: 'raster', source: 'gsi' }],
};

/** 架空デモ区域の GeoJSON（bbox → Polygon） */
const DEMO_REGIONS_GEOJSON: FeatureCollection = {
  type: 'FeatureCollection',
  features: demoDataset.regions.map((region) => ({
    type: 'Feature',
    properties: { name: region.name },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [region.bbox.minLon, region.bbox.minLat],
          [region.bbox.maxLon, region.bbox.minLat],
          [region.bbox.maxLon, region.bbox.maxLat],
          [region.bbox.minLon, region.bbox.maxLat],
          [region.bbox.minLon, region.bbox.minLat],
        ],
      ],
    },
  })),
};

export function MapPicker({ location, onPick, highlightRegions }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const highlightRef = useRef<JurisdictionMapResponse | null | undefined>(highlightRegions);
  highlightRef.current = highlightRegions;
  // クリックハンドラから常に最新の onPick を呼ぶための参照
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  /** ハイライトレイヤーを現在の highlightRef の内容へ合わせる（style 読込済み前提） */
  function applyHighlight(map: maplibregl.Map): void {
    const regions = highlightRef.current;
    if (regions === null || regions === undefined) {
      for (const layerId of ['highlight-regions-fill', 'highlight-regions-line']) {
        if (map.getLayer(layerId) !== undefined) map.removeLayer(layerId);
      }
      if (map.getSource('highlight-regions') !== undefined) {
        map.removeSource('highlight-regions');
      }
      return;
    }
    if (map.getSource('highlight-regions') === undefined) {
      map.addSource('highlight-regions', {
        type: 'geojson',
        data: regions as unknown as FeatureCollection,
      });
      map.addLayer({
        id: 'highlight-regions-fill',
        type: 'fill',
        source: 'highlight-regions',
        paint: { 'fill-color': '#b45309', 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: 'highlight-regions-line',
        type: 'line',
        source: 'highlight-regions',
        paint: { 'line-color': '#b45309', 'line-width': 2, 'line-dasharray': [3, 2] },
      });
    } else {
      (map.getSource('highlight-regions') as maplibregl.GeoJSONSource).setData(
        regions as unknown as FeatureCollection,
      );
    }
  }

  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: GSI_STYLE,
      center: [location.lon, location.lat],
      zoom: 9,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      map.addSource('demo-regions', { type: 'geojson', data: DEMO_REGIONS_GEOJSON });
      map.addLayer({
        id: 'demo-regions-fill',
        type: 'fill',
        source: 'demo-regions',
        paint: { 'fill-color': '#0369a1', 'fill-opacity': 0.08 },
      });
      map.addLayer({
        id: 'demo-regions-line',
        type: 'line',
        source: 'demo-regions',
        paint: { 'line-color': '#0369a1', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      });
      applyHighlight(map);
    });

    map.on('click', (e) => {
      onPickRef.current({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });

    markerRef.current = new maplibregl.Marker({ color: '#b91c1c' })
      .setLngLat([location.lon, location.lat])
      .addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // 初期化は 1 回のみ（location 変更は下の effect で追従）
  }, []);

  useEffect(() => {
    markerRef.current?.setLngLat([location.lon, location.lat]);
    // プリセット選択・手入力による地点変更にも地図中心を追従させる
    mapRef.current?.easeTo({ center: [location.lon, location.lat], duration: 400 });
  }, [location.lat, location.lon]);

  // 検索結果の管轄区域をハイライトする（FR-003 拡張）。
  // 地図の style 読込前に描画を試みても失敗するため、style 読込後に初期化する
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !map.isStyleLoaded()) return;
    applyHighlight(map);
  }, [highlightRegions]);

  return (
    <div className="map-picker">
      <div
        ref={containerRef}
        className="map-container"
        role="img"
        aria-label="地図（クリックで地点を指定）"
        aria-describedby="map-fallback-note"
      />
      <p id="map-fallback-note" className="map-note">
        地図が操作できない環境では、上の「住所で検索」または緯度・経度の直接入力で地点を指定できます。
      </p>
      <p className="map-note">
        🗺️ 地図クリックで地点を設定できます。青の点線は検証用の架空デモ区域、オレンジは
        検索結果の管轄区域です。
      </p>
    </div>
  );
}
