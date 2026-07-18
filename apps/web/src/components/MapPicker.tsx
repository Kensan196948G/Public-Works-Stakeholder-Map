import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { Location } from '@pwsm/contracts';
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

export function MapPicker({ location, onPick }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // クリックハンドラから常に最新の onPick を呼ぶための参照
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

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
  }, [location.lat, location.lon]);

  return (
    <div className="map-picker">
      <div ref={containerRef} className="map-container" aria-label="地図（クリックで地点指定）" />
      <p className="map-note">
        🗺️ 地図クリックで地点を設定できます。点線の枠は検証用の架空デモ区域です。
      </p>
    </div>
  );
}
