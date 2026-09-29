'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface PandoraMapProps {
  data: any;
  activeLayers: Record<string, boolean>;
  onEntityClick?: (entity: any) => void;
  onMouseCoords?: (coords: { lat: number; lng: number }) => void;
  onRightClick?: (coords: { lat: number; lng: number }) => void;
  onViewStateChange?: (vs: { zoom: number; latitude: number; longitude: number }) => void;
  flyToLocation?: { lat: number; lng: number; zoom?: number; ts: number } | null;
  projection?: 'mercator' | 'globe';
  mapStyle?: string;
  sweepData?: any;
  scanTargets?: any[];
  fusionHotspots?: any[];
}

function computeSolarTerminator(): [number, number][] {
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const declination = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
  const decRad = declination * Math.PI / 180;
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const subsolarLng = (12 - utcHours) * 15;
  const points: [number, number][] = [];
  for (let lng = -180; lng <= 180; lng += 2) {
    const lngRad = (lng - subsolarLng) * Math.PI / 180;
    const lat = Math.atan(-Math.cos(lngRad) / Math.tan(decRad)) * 180 / Math.PI;
    points.push([lng, lat]);
  }
  const darkSide = declination >= 0 ? -90 : 90;
  points.push([180, darkSide]);
  points.push([-180, darkSide]);
  points.push(points[0]);
  return points;
}

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

function bboxToPolygon(bbox: any): [number, number][][] | null {
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  const [minLng, minLat, maxLng, maxLat] = bbox.map(Number);
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
  return [[
    [minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat],
  ]];
}

function sceneToFeature(scene: any, bucket: 'SCENE' | 'SAR' | 'OPTICAL') {
  const coordinates = bboxToPolygon(scene?.bbox);
  if (!coordinates) return null;
  return {
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates },
    properties: {
      id: scene.id,
      datetime: scene.datetime,
      platform: scene.platform,
      orbit: scene.orbit,
      polarization: Array.isArray(scene.polarization) ? scene.polarization.join(', ') : scene.polarization,
      mode: scene.mode,
      cloud_cover: scene.cloud_cover,
      area_km2: scene.area_km2,
      preview: scene.preview || scene.thumbnail,
      bucket,
    },
  };
}

function collectGeoFeatures(input: any): any[] {
  const out: any[] = [];
  const visit = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
      value.features.forEach(visit);
      return;
    }
    if (value.type === 'Feature' && value.geometry) {
      out.push(value);
      return;
    }
    if (value.geometry?.type && value.geometry?.coordinates) {
      out.push({ type: 'Feature', geometry: value.geometry, properties: value.properties || {} });
      return;
    }
    if (value.geojson || value.geoJson || value.data || value.features || value.objects || value.lines || value.polygons) {
      visit(value.geojson || value.geoJson || value.data || value.features || value.objects || value.lines || value.polygons);
    }
  };
  visit(input);
  return out;
}

function PandoraMap({ data, activeLayers, onEntityClick, onMouseCoords, onRightClick, onViewStateChange, flyToLocation, projection = 'globe', mapStyle = 'dark', sweepData, scanTargets = [], fusionHotspots = [] }: PandoraMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const prevStyleRef = useRef(mapStyle);

  // Create aircraft icon on canvas (for WebGL symbol layer)
  const createIcon = useCallback((map: maplibregl.Map, id: string, color: string, size: number) => {
    if (map.hasImage(id)) return;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2, cy = size / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.4);
    ctx.lineTo(cx - size * 0.12, cy + size * 0.1);
    ctx.lineTo(cx - size * 0.4, cy + size * 0.2);
    ctx.lineTo(cx - size * 0.4, cy + size * 0.3);
    ctx.lineTo(cx - size * 0.12, cy + size * 0.15);
    ctx.lineTo(cx, cy + size * 0.35);
    ctx.lineTo(cx + size * 0.12, cy + size * 0.15);
    ctx.lineTo(cx + size * 0.4, cy + size * 0.3);
    ctx.lineTo(cx + size * 0.4, cy + size * 0.2);
    ctx.lineTo(cx + size * 0.12, cy + size * 0.1);
    ctx.closePath();
    ctx.fill();
    map.addImage(id, { width: size, height: size, data: new Uint8Array(ctx.getImageData(0, 0, size, size).data) });
  }, []);

  const createDot = useCallback((map: maplibregl.Map, id: string, color: string, size: number) => {
    if (map.hasImage(id)) return;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
    ctx.fill();
    map.addImage(id, { width: size, height: size, data: new Uint8Array(ctx.getImageData(0, 0, size, size).data) });
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [25.48, 42.70], zoom: 6.5, minZoom: 1.5, maxZoom: 18,
      attributionControl: false,
      maxPitch: 85,
    });

    map.on('load', () => {
      mapRef.current = map;
      // Create icons
      createIcon(map, 'plane-cyan', '#00E5FF', 24);
      createIcon(map, 'plane-green', '#00E676', 24);
      createIcon(map, 'plane-pink', '#FF69B4', 24);
      createIcon(map, 'plane-red', '#FF3D3D', 24);
      createIcon(map, 'plane-orange', '#FF9500', 24);
      createIcon(map, 'plane-grey', '#555555', 24);
      createDot(map, 'dot-gold', '#D4AF37', 8);
      createDot(map, 'dot-red', '#FF3D3D', 10);
      createDot(map, 'dot-orange', '#FF9500', 10);
      createDot(map, 'dot-green', '#00E676', 10);
      createDot(map, 'dot-fire', '#FF6B00', 10);
      createDot(map, 'dot-cctv', '#39FF14', 10);

      // Sources
      const sources = ['flights','military','tankers-isr','jets','private-fl','satellites','sentinel-scenes','sentinel-sar','sentinel-optical','frontlines','military-events','naval-bases','airbases','french-airbases','air-quality','disaster-ops','country-risk','cyber-geo','port-congestion','maritime-dark-activity','risk-heatmap','space-weather-points','osm-critical','earthquakes','gdelt','gps-jamming','day-night','cctv','fires','weather','infrastructure','maritime','maritime-choke','maritime-ships','live-news','sigint-news','conflict-zones', 'war-alerts-targets', 'war-alerts-lines', 'balloons', 'radiation', 'ip-sweep-devices', 'ip-sweep-pulse', 'ip-sweep-connections', 'scan-targets', 'fusion-hotspots'];
      sources.forEach(s => map.addSource(s, { type: 'geojson', data: EMPTY_FC }));

      // ── CONFLICT ZONES — small warning markers (not polygons) ──
      // Create warning triangle icon
      const warnSize = 20;
      const warnCanvas = document.createElement('canvas');
      warnCanvas.width = warnSize; warnCanvas.height = warnSize;
      const warnCtx = warnCanvas.getContext('2d')!;
      // Triangle
      warnCtx.fillStyle = '#FF1744';
      warnCtx.beginPath();
      warnCtx.moveTo(warnSize/2, 1);
      warnCtx.lineTo(warnSize - 1, warnSize - 1);
      warnCtx.lineTo(1, warnSize - 1);
      warnCtx.closePath();
      warnCtx.fill();
      // Exclamation mark
      warnCtx.fillStyle = '#000';
      warnCtx.font = 'bold 11px sans-serif';
      warnCtx.textAlign = 'center';
      warnCtx.fillText('!', warnSize/2, warnSize - 4);
      map.addImage('warn-icon', { width: warnSize, height: warnSize, data: new Uint8Array(warnCtx.getImageData(0, 0, warnSize, warnSize).data) });

      // Orange warning
      const warnOCanvas = document.createElement('canvas');
      warnOCanvas.width = warnSize; warnOCanvas.height = warnSize;
      const warnOCtx = warnOCanvas.getContext('2d')!;
      warnOCtx.fillStyle = '#FF9500';
      warnOCtx.beginPath();
      warnOCtx.moveTo(warnSize/2, 1);
      warnOCtx.lineTo(warnSize - 1, warnSize - 1);
      warnOCtx.lineTo(1, warnSize - 1);
      warnOCtx.closePath();
      warnOCtx.fill();
      warnOCtx.fillStyle = '#000';
      warnOCtx.font = 'bold 11px sans-serif';
      warnOCtx.textAlign = 'center';
      warnOCtx.fillText('!', warnSize/2, warnSize - 4);
      map.addImage('warn-orange', { width: warnSize, height: warnSize, data: new Uint8Array(warnOCtx.getImageData(0, 0, warnSize, warnSize).data) });

      // Yellow warning
      const warnYCanvas = document.createElement('canvas');
      warnYCanvas.width = warnSize; warnYCanvas.height = warnSize;
      const warnYCtx = warnYCanvas.getContext('2d')!;
      warnYCtx.fillStyle = '#FFD500';
      warnYCtx.beginPath();
      warnYCtx.moveTo(warnSize/2, 1);
      warnYCtx.lineTo(warnSize - 1, warnSize - 1);
      warnYCtx.lineTo(1, warnSize - 1);
      warnYCtx.closePath();
      warnYCtx.fill();
      warnYCtx.fillStyle = '#000';
      warnYCtx.font = 'bold 11px sans-serif';
      warnYCtx.textAlign = 'center';
      warnYCtx.fillText('!', warnSize/2, warnSize - 4);
      map.addImage('warn-yellow', { width: warnSize, height: warnSize, data: new Uint8Array(warnYCtx.getImageData(0, 0, warnSize, warnSize).data) });

      map.addLayer({ id: 'conflict-icons', type: 'symbol', source: 'conflict-zones', layout: {
        'icon-image': ['match', ['get','severity'], 'war','warn-icon', 'high','warn-orange', 'warn-yellow'],
        'icon-size': ['interpolate',['linear'],['zoom'], 1,0.6, 4,0.8, 8,1],
        'icon-allow-overlap': true,
        'text-field': ['get','label'],
        'text-size': ['interpolate',['linear'],['zoom'], 1,7, 4,9, 8,11],
        'text-font': ['Open Sans Bold'],
        'text-offset': [0, 1.4],
        'text-allow-overlap': false,
      }, paint: {
        'text-color': ['match', ['get','severity'], 'war','#FF1744', 'high','#FF9500', '#FFD500'],
        'text-halo-color': '#000', 'text-halo-width': 1.5, 'text-opacity': 0.9,
      }});


      // Day/Night
      map.addLayer({ id: 'day-night-fill', type: 'fill', source: 'day-night', paint: { 'fill-color': '#000022', 'fill-opacity': 0.35 }});

      // Sentinel satellite scene footprints (real STAC scenes)
      [
        { id: 'sentinel-scenes', color: '#D4AF37', opacity: 0.10 },
        { id: 'sentinel-sar', color: '#00E5FF', opacity: 0.12 },
        { id: 'sentinel-optical', color: '#76FF03', opacity: 0.10 },
      ].forEach((cfg) => {
        map.addLayer({ id: `${cfg.id}-fill`, type: 'fill', source: cfg.id, paint: {
          'fill-color': cfg.color, 'fill-opacity': cfg.opacity,
        }});
        map.addLayer({ id: `${cfg.id}-line`, type: 'line', source: cfg.id, paint: {
          'line-color': cfg.color, 'line-width': 1.5, 'line-opacity': 0.85, 'line-dasharray': [2, 2],
        }});
      });

      // Public frontlines / war map GeoJSON (when upstream provides geometry)
      map.addLayer({ id: 'frontlines-fill', type: 'fill', source: 'frontlines', paint: {
        'fill-color': '#FF1744', 'fill-opacity': 0.08,
      }});
      map.addLayer({ id: 'frontlines-line', type: 'line', source: 'frontlines', paint: {
        'line-color': '#FF1744', 'line-width': 2, 'line-opacity': 0.9,
      }});

      // Earthquakes
      map.addLayer({ id: 'eq-circles', type: 'circle', source: 'earthquakes', paint: {
        'circle-radius': ['interpolate',['linear'],['get','magnitude'], 2.5,4, 5,12, 7,24],
        'circle-color': ['interpolate',['linear'],['get','magnitude'], 2.5,'#FFD700', 4,'#FF9500', 6,'#FF1744'],
        'circle-opacity': 0.6, 'circle-blur': 0.3, 'circle-stroke-width': 1, 'circle-stroke-color': '#FFD700', 'circle-stroke-opacity': 0.3,
      }});
      map.addLayer({ id: 'eq-label', type: 'symbol', source: 'earthquakes', filter: ['>=',['get','magnitude'],4.5], layout: {
        'text-field': ['concat','M',['to-string',['get','magnitude']]], 'text-size': 9, 'text-font': ['Open Sans Regular'], 'text-offset': [0,1.5],
      }, paint: { 'text-color': '#FFD700', 'text-halo-color': '#000', 'text-halo-width': 1 }});

      // Air quality — real OpenAQ measurements
      map.addLayer({ id: 'air-quality-glow', type: 'circle', source: 'air-quality', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,8, 5,14, 10,26],
        'circle-color': ['get','color'], 'circle-opacity': 0.12, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'air-quality-dots', type: 'circle', source: 'air-quality', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,5, 10,9],
        'circle-color': ['get','color'], 'circle-opacity': 0.85,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-opacity': 0.35,
      }});

      // Disaster Ops — derived from real EONET/FIRMS/USGS data
      map.addLayer({ id: 'disaster-ops-glow', type: 'circle', source: 'disaster-ops', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,10, 5,18, 10,32],
        'circle-color': ['match',['get','layer_type'], 'fire','#FF6B00', 'earthquake','#FF9500', '#FFD700'],
        'circle-opacity': 0.16, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'disaster-ops-dots', type: 'circle', source: 'disaster-ops', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,7, 10,12],
        'circle-color': ['match',['get','layer_type'], 'fire','#FF6B00', 'earthquake','#FF9500', '#FFD700'],
        'circle-opacity': 0.9,
        'circle-stroke-width': 2, 'circle-stroke-color': '#000000', 'circle-stroke-opacity': 0.6,
      }});

      // Country risk index — geocoded country/capital points
      map.addLayer({ id: 'country-risk-glow', type: 'circle', source: 'country-risk', paint: {
        'circle-radius': ['interpolate',['linear'],['get','risk_score'], 30,14, 100,46],
        'circle-color': ['match',['get','risk_level'], 'CRITICAL','#FF1744', 'HIGH','#FF9500', 'ELEVATED','#FFD700', '#00E676'],
        'circle-opacity': 0.14, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'country-risk-dots', type: 'circle', source: 'country-risk', paint: {
        'circle-radius': ['interpolate',['linear'],['get','risk_score'], 30,4, 100,12],
        'circle-color': ['match',['get','risk_level'], 'CRITICAL','#FF1744', 'HIGH','#FF9500', 'ELEVATED','#FFD700', '#00E676'],
        'circle-opacity': 0.9, 'circle-stroke-width': 2, 'circle-stroke-color': '#F5F0E0', 'circle-stroke-opacity': 0.5,
      }});

      // Cyber geo threats — only IPs with verified public geolocation
      map.addLayer({ id: 'cyber-geo-glow', type: 'circle', source: 'cyber-geo', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,8, 5,16, 10,30],
        'circle-color': ['get','color'], 'circle-opacity': 0.14, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'cyber-geo-dots', type: 'circle', source: 'cyber-geo', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,6, 10,10],
        'circle-color': ['get','color'], 'circle-opacity': 0.9,
        'circle-stroke-width': 2, 'circle-stroke-color': '#00E5FF', 'circle-stroke-opacity': 0.45,
      }});

      // Port congestion — derived from real AIS ship positions around real ports
      map.addLayer({ id: 'port-congestion-glow', type: 'circle', source: 'port-congestion', paint: {
        'circle-radius': ['interpolate',['linear'],['get','score'], 0,8, 100,42],
        'circle-color': ['match',['get','level'], 'CRITICAL','#FF1744', 'HIGH','#FF9500', 'WATCH','#FFD700', '#00BCD4'],
        'circle-opacity': 0.16, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'port-congestion-dots', type: 'circle', source: 'port-congestion', paint: {
        'circle-radius': ['interpolate',['linear'],['get','score'], 0,3, 100,12],
        'circle-color': ['match',['get','level'], 'CRITICAL','#FF1744', 'HIGH','#FF9500', 'WATCH','#FFD700', '#00BCD4'],
        'circle-opacity': 0.92, 'circle-stroke-width': 2, 'circle-stroke-color': '#00BCD4', 'circle-stroke-opacity': 0.5,
      }});

      // Maritime dark activity — AIS-derived heuristics, no synthetic vessels
      map.addLayer({ id: 'maritime-dark-glow', type: 'circle', source: 'maritime-dark-activity', paint: {
        'circle-radius': ['interpolate',['linear'],['get','vessel_count'], 0,14, 20,52],
        'circle-color': ['match',['get','severity'], 'CRITICAL','#FF1744', 'HIGH','#FF6B00', 'WATCH','#FFD700', '#00BCD4'],
        'circle-opacity': 0.18, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'maritime-dark-dots', type: 'circle', source: 'maritime-dark-activity', paint: {
        'circle-radius': ['interpolate',['linear'],['get','vessel_count'], 0,5, 20,14],
        'circle-color': ['match',['get','severity'], 'CRITICAL','#FF1744', 'HIGH','#FF6B00', 'WATCH','#FFD700', '#00BCD4'],
        'circle-opacity': 0.95, 'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-opacity': 0.45,
      }});

      // Global risk heatmap — grid score derived from real active layers
      map.addLayer({ id: 'risk-heatmap-heat', type: 'heatmap', source: 'risk-heatmap', paint: {
        'heatmap-weight': ['interpolate',['linear'],['get','score'], 0,0, 100,1],
        'heatmap-intensity': ['interpolate',['linear'],['zoom'], 1,0.7, 6,1.8, 10,2.8],
        'heatmap-radius': ['interpolate',['linear'],['zoom'], 1,18, 5,38, 10,70],
        'heatmap-opacity': 0.72,
        'heatmap-color': ['interpolate',['linear'],['heatmap-density'], 0,'rgba(0,0,0,0)', 0.25,'rgba(255,213,0,0.35)', 0.55,'rgba(255,149,0,0.55)', 0.8,'rgba(255,23,68,0.75)', 1,'rgba(255,255,255,0.9)'],
      }});
      map.addLayer({ id: 'risk-heatmap-dots', type: 'circle', source: 'risk-heatmap', minzoom: 4, paint: {
        'circle-radius': ['interpolate',['linear'],['get','score'], 0,3, 100,11],
        'circle-color': ['interpolate',['linear'],['get','score'], 10,'#FFD700', 45,'#FF9500', 75,'#FF1744'],
        'circle-opacity': 0.75, 'circle-stroke-width': 1, 'circle-stroke-color': '#000', 'circle-stroke-opacity': 0.5,
      }});

      // Space weather ops — NOAA SWPC operational markers
      map.addLayer({ id: 'space-weather-glow', type: 'circle', source: 'space-weather-points', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,24, 5,42, 10,70],
        'circle-color': ['get','color'], 'circle-opacity': 0.11, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'space-weather-dots', type: 'circle', source: 'space-weather-points', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,5, 5,9, 10,14],
        'circle-color': ['get','color'], 'circle-opacity': 0.9,
        'circle-stroke-width': 2, 'circle-stroke-color': '#D4AF37', 'circle-stroke-opacity': 0.6,
      }});

      // OSM critical infrastructure — viewport/radius Overpass lookup
      map.addLayer({ id: 'osm-critical-glow', type: 'circle', source: 'osm-critical', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,6, 5,10, 10,18],
        'circle-color': '#76FF03', 'circle-opacity': 0.11, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'osm-critical-dots', type: 'circle', source: 'osm-critical', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,5, 10,8],
        'circle-color': '#76FF03', 'circle-opacity': 0.85,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#000', 'circle-stroke-opacity': 0.65,
      }});

      // Fires
      map.addLayer({ id: 'fires-heat', type: 'circle', source: 'fires', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2, 5,4, 10,8],
        'circle-color': '#FF6B00', 'circle-opacity': 0.5, 'circle-blur': 0.5,
      }});

      // CCTV — outer glow ring
      map.addLayer({ id: 'cctv-glow', type: 'circle', source: 'cctv', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,5, 5,8, 10,14, 14,20],
        'circle-color': '#39FF14', 'circle-opacity': 0.08, 'circle-blur': 1,
      }});
      // CCTV — main dot
      map.addLayer({ id: 'cctv-dots', type: 'circle', source: 'cctv', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,5, 10,8, 14,12],
        'circle-color': '#39FF14', 'circle-opacity': 0.8,
        'circle-stroke-width': 2, 'circle-stroke-color': '#39FF14', 'circle-stroke-opacity': 0.5,
      }});
      // CCTV — labels at zoom 10+
      map.addLayer({ id: 'cctv-label', type: 'symbol', source: 'cctv', minzoom: 10, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.8], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#39FF14', 'text-halo-color': '#000', 'text-halo-width': 1, 'text-opacity': 0.7 }});

      // GDELT
      map.addLayer({ id: 'gdelt-dots', type: 'circle', source: 'gdelt', paint: {
        'circle-radius': 4, 'circle-color': '#FF3D3D', 'circle-opacity': 0.5, 'circle-stroke-width': 1, 'circle-stroke-color': '#FF3D3D', 'circle-stroke-opacity': 0.3,
      }});

      // Military-specific OSINT events derived from the same real RSS/GDELT feed
      map.addLayer({ id: 'mil-events-glow', type: 'circle', source: 'military-events', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,8, 5,14, 10,24],
        'circle-color': '#FF6B00', 'circle-opacity': 0.12, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'mil-events-dots', type: 'circle', source: 'military-events', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,6, 10,10],
        'circle-color': '#FF6B00', 'circle-opacity': 0.85,
        'circle-stroke-width': 2, 'circle-stroke-color': '#FF1744', 'circle-stroke-opacity': 0.45,
      }});

      // Fusion Hotspots — AIP risk heat markers
      map.addLayer({ id: 'fusion-hotspot-glow', type: 'circle', source: 'fusion-hotspots', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,18, 5,34, 10,60],
        'circle-color': ['match', ['get','level'], 'CRITICAL','#FF3D3D', 'ELEVATED','#FF9500', 'WATCH','#00E5FF', '#00E676'],
        'circle-opacity': ['interpolate',['linear'],['get','score'], 20,0.08, 100,0.24],
        'circle-blur': 1,
      }});
      map.addLayer({ id: 'fusion-hotspot-core', type: 'circle', source: 'fusion-hotspots', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,7, 10,12],
        'circle-color': ['match', ['get','level'], 'CRITICAL','#FF3D3D', 'ELEVATED','#FF9500', 'WATCH','#00E5FF', '#00E676'],
        'circle-opacity': 0.92,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#F5F0E0',
        'circle-stroke-opacity': 0.6,
      }});
      map.addLayer({ id: 'fusion-hotspot-label', type: 'symbol', source: 'fusion-hotspots', minzoom: 3, layout: {
        'text-field': ['concat', 'AIP ', ['to-string', ['get','scoreLabel']]],
        'text-size': 9, 'text-font': ['Open Sans Bold'], 'text-offset': [0, 1.7], 'text-allow-overlap': false,
      }, paint: { 'text-color': '#00E5FF', 'text-halo-color': '#000', 'text-halo-width': 1.2, 'text-opacity': 0.9 }});

      // GPS Jamming
      map.addLayer({ id: 'jam-fill', type: 'circle', source: 'gps-jamming', paint: { 'circle-radius': 30, 'circle-color': '#FF0000', 'circle-opacity': 0.15, 'circle-blur': 1 }});
      map.addLayer({ id: 'jam-label', type: 'symbol', source: 'gps-jamming', layout: {
        'text-field': ['concat','GPS JAM ',['to-string',['get','severity']],'%'], 'text-size': 10, 'text-font': ['Open Sans Bold'], 'text-allow-overlap': true,
      }, paint: { 'text-color': '#FF4444', 'text-halo-color': '#000', 'text-halo-width': 1 }});

      // Weather Events (NASA EONET — storms, volcanoes)
      map.addLayer({ id: 'weather-glow', type: 'circle', source: 'weather', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,12, 5,20, 10,30],
        'circle-color': '#E040FB', 'circle-opacity': 0.1, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'weather-dots', type: 'circle', source: 'weather', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,5, 5,8, 10,14],
        'circle-color': ['match', ['get','icon'], 'cyclone','#E040FB', 'volcano','#FF1744', '#E040FB'],
        'circle-opacity': 0.8,
        'circle-stroke-width': 2, 'circle-stroke-color': '#E040FB', 'circle-stroke-opacity': 0.4,
      }});
      map.addLayer({ id: 'weather-label', type: 'symbol', source: 'weather', layout: {
        'text-field': ['get','title'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 2], 'text-max-width': 14, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#E040FB', 'text-halo-color': '#000', 'text-halo-width': 1, 'text-opacity': 0.8 }});

      // Nuclear Infrastructure
      map.addLayer({ id: 'infra-glow', type: 'circle', source: 'infrastructure', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,8, 5,14, 10,22],
        'circle-color': '#76FF03', 'circle-opacity': 0.08, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'infra-dots', type: 'circle', source: 'infrastructure', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,6, 10,10],
        'circle-color': ['match', ['get','status'], 'Active Conflict Zone','#FF1744', 'Destroyed / Decommissioning','#757575', '#76FF03'],
        'circle-opacity': 0.8,
        'circle-stroke-width': 2, 'circle-stroke-color': '#76FF03', 'circle-stroke-opacity': 0.4,
      }});
      map.addLayer({ id: 'infra-label', type: 'symbol', source: 'infrastructure', minzoom: 5, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 2], 'text-max-width': 14, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#76FF03', 'text-halo-color': '#000', 'text-halo-width': 1, 'text-opacity': 0.7 }});

      // Satellites
      map.addLayer({ id: 'sat-dots', type: 'circle', source: 'satellites', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,1.5, 5,3], 'circle-color': ['get','color'], 'circle-opacity': 0.7,
      }});

      // Maritime — ports & naval bases
      map.addLayer({ id: 'maritime-glow', type: 'circle', source: 'maritime', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,6, 5,12, 10,20],
        'circle-color': ['match', ['get','type'], 'naval','#FF3D3D', 'energy','#FF9500', '#00BCD4'],
        'circle-opacity': 0.1, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'maritime-dots', type: 'circle', source: 'maritime', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,5, 10,9],
        'circle-color': ['match', ['get','type'], 'naval','#FF3D3D', 'energy','#FF9500', '#00BCD4'],
        'circle-opacity': 0.85,
        'circle-stroke-width': 2, 'circle-stroke-color': ['match', ['get','type'], 'naval','#FF3D3D', 'energy','#FF9500', '#00BCD4'], 'circle-stroke-opacity': 0.4,
      }});
      map.addLayer({ id: 'maritime-label', type: 'symbol', source: 'maritime', minzoom: 4, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.8], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#00BCD4', 'text-halo-color': '#000', 'text-halo-width': 1, 'text-opacity': 0.7 }});

      // Maritime chokepoints — pulsing warning diamonds
      map.addLayer({ id: 'choke-glow', type: 'circle', source: 'maritime-choke', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,10, 5,18, 10,28],
        'circle-color': '#FF9500', 'circle-opacity': 0.12, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'choke-dots', type: 'circle', source: 'maritime-choke', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,7, 10,12],
        'circle-color': ['match', ['get','risk'], 'CRITICAL','#FF1744', 'HIGH','#FF9500', 'ELEVATED','#FFD700', '#00E676'],
        'circle-opacity': 0.9,
        'circle-stroke-width': 2, 'circle-stroke-color': '#FF9500', 'circle-stroke-opacity': 0.5,
      }});
      map.addLayer({ id: 'choke-label', type: 'symbol', source: 'maritime-choke', minzoom: 3, layout: {
        'text-field': ['get','name'], 'text-size': 10, 'text-font': ['Open Sans Bold'],
        'text-offset': [0, 2], 'text-max-width': 14, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#FF9500', 'text-halo-color': '#000', 'text-halo-width': 1, 'text-opacity': 0.9 }});

      // Naval bases split out as defense layer (from real /api/maritime data)
      map.addLayer({ id: 'naval-base-glow', type: 'circle', source: 'naval-bases', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,10, 5,18, 10,30],
        'circle-color': '#00BCD4', 'circle-opacity': 0.13, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'naval-base-dots', type: 'circle', source: 'naval-bases', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,7, 10,12],
        'circle-color': '#00BCD4', 'circle-opacity': 0.9,
        'circle-stroke-width': 2, 'circle-stroke-color': '#FF3D3D', 'circle-stroke-opacity': 0.45,
      }});
      map.addLayer({ id: 'naval-base-label', type: 'symbol', source: 'naval-bases', minzoom: 4, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Bold'],
        'text-offset': [0, 1.8], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#00BCD4', 'text-halo-color': '#000', 'text-halo-width': 1, 'text-opacity': 0.85 }});

      // Global air bases — real public Wikidata SPARQL data only, no mockdata
      map.addLayer({ id: 'airbase-glow', type: 'circle', source: 'airbases', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,10, 5,18, 10,30],
        'circle-color': '#60A5FA', 'circle-opacity': 0.12, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'airbase-dots', type: 'circle', source: 'airbases', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,7, 10,12],
        'circle-color': '#60A5FA', 'circle-opacity': 0.92,
        'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-opacity': 0.42,
      }});
      map.addLayer({ id: 'airbase-label', type: 'symbol', source: 'airbases', minzoom: 5, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Bold'],
        'text-offset': [0, 1.8], 'text-max-width': 14, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#BFDBFE', 'text-halo-color': '#000', 'text-halo-width': 1, 'text-opacity': 0.85 }});

      // French air bases — real public OSM/Overpass data only, no mockdata
      map.addLayer({ id: 'french-airbase-glow', type: 'circle', source: 'french-airbases', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,10, 5,18, 10,30],
        'circle-color': '#3B82F6', 'circle-opacity': 0.14, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'french-airbase-dots', type: 'circle', source: 'french-airbases', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,7, 10,12],
        'circle-color': '#3B82F6', 'circle-opacity': 0.95,
        'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-opacity': 0.45,
      }});
      map.addLayer({ id: 'french-airbase-label', type: 'symbol', source: 'french-airbases', minzoom: 5, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Bold'],
        'text-offset': [0, 1.8], 'text-max-width': 14, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#93C5FD', 'text-halo-color': '#000', 'text-halo-width': 1, 'text-opacity': 0.9 }});

      // Live News — broadcast dots
      map.addLayer({ id: 'news-glow', type: 'circle', source: 'live-news', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,8, 5,14, 10,22],
        'circle-color': '#FF4081', 'circle-opacity': 0.1, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'news-dots', type: 'circle', source: 'live-news', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,6, 10,10],
        'circle-color': '#FF4081', 'circle-opacity': 0.85,
        'circle-stroke-width': 2, 'circle-stroke-color': '#FF4081', 'circle-stroke-opacity': 0.5,
      }});
      map.addLayer({ id: 'news-label', type: 'symbol', source: 'live-news', minzoom: 4, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.8], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#FF4081', 'text-halo-color': '#000', 'text-halo-width': 1, 'text-opacity': 0.8 }});

      // SIGINT RSS news - gold markers
      map.addLayer({ id: 'sigint-news-glow', type: 'circle', source: 'sigint-news', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,6, 5,10, 10,18],
        'circle-color': '#D4AF37', 'circle-opacity': 0.12, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'sigint-news-dots', type: 'circle', source: 'sigint-news', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,5, 10,8],
        'circle-color': '#D4AF37', 'circle-opacity': 0.9,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#FFF8DC', 'circle-stroke-opacity': 0.6,
      }});
      map.addLayer({ id: 'sigint-news-label', type: 'symbol', source: 'sigint-news', minzoom: 5, layout: {
        'text-field': ['get','source'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.6], 'text-max-width': 10, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#D4AF37', 'text-halo-color': '#000', 'text-halo-width': 1, 'text-opacity': 0.85 }});

      // ══ IP SWEEP — Neighborhood device visualization ══
      map.addLayer({ id: 'sweep-connections', type: 'line', source: 'ip-sweep-connections', paint: {
        'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.3, 'line-dasharray': [2, 4],
      }});
      map.addLayer({ id: 'sweep-pulse-ring', type: 'circle', source: 'ip-sweep-pulse', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 8,40, 12,80, 16,160],
        'circle-color': 'transparent', 'circle-opacity': 0.6,
        'circle-stroke-width': 2, 'circle-stroke-color': '#FF3D3D', 'circle-stroke-opacity': 0.4,
      }});
      map.addLayer({ id: 'sweep-device-glow', type: 'circle', source: 'ip-sweep-devices', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 8,8, 12,16, 16,30],
        'circle-color': ['get', 'color'], 'circle-opacity': 0.15, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'sweep-device-dots', type: 'circle', source: 'ip-sweep-devices', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 8,3, 12,6, 16,10],
        'circle-color': ['get', 'color'], 'circle-opacity': 0.95,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-opacity': 0.6,
      }});
      map.addLayer({ id: 'sweep-device-labels', type: 'symbol', source: 'ip-sweep-devices', minzoom: 13, layout: {
        'text-field': ['concat', ['get', 'device_type'], '\n', ['get', 'ip']],
        'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 2.2], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: {
        'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1.5, 'text-opacity': 0.9,
      }});

      // ══ SCAN TARGETS — Geolocated individual scans ══
      map.addLayer({ id: 'scan-targets-glow', type: 'circle', source: 'scan-targets', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,12, 5,25, 10,40],
        'circle-color': '#FF3D3D', 'circle-opacity': 0.2, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'scan-targets-dots', type: 'circle', source: 'scan-targets', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,5, 5,8, 10,12],
        'circle-color': '#FF3D3D', 'circle-opacity': 0.95,
        'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-opacity': 0.8,
      }});
      map.addLayer({ id: 'scan-targets-label', type: 'symbol', source: 'scan-targets', layout: {
        'text-field': ['get', 'id'], 'text-size': 11, 'text-font': ['Open Sans Bold'],
        'text-offset': [0, 2], 'text-max-width': 14, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#FF3D3D', 'text-halo-color': '#000', 'text-halo-width': 1.5, 'text-opacity': 0.9 }});

      // Flight layers (WebGL symbol — GPU rendered, handles 50K+ smooth)
      const flightLayers = [
        { id: 'fl-commercial', src: 'flights', icon: 'plane-cyan' },
        { id: 'fl-private', src: 'private-fl', icon: 'plane-green' },
        { id: 'fl-jets', src: 'jets', icon: 'plane-pink' },
        { id: 'fl-military', src: 'military', icon: 'plane-red' },
        { id: 'fl-tankers-isr', src: 'tankers-isr', icon: 'plane-orange' },
      ];
      flightLayers.forEach(l => {
        map.addLayer({ id: l.id, type: 'symbol', source: l.src, layout: {
          'icon-image': l.icon, 'icon-size': ['interpolate',['linear'],['zoom'], 1,0.4, 5,0.7, 10,1],
          'icon-rotate': ['get','heading'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        }, paint: { 'icon-opacity': 0.85 }});
      });

      // Balloons (moving entities)
      map.addLayer({ id: 'balloon-dots', type: 'circle', source: 'balloons', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,5, 10,7],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-stroke-opacity': 0.5,
      }});
      map.addLayer({ id: 'balloon-label', type: 'symbol', source: 'balloons', minzoom: 4, layout: {
        'text-field': ['get','callsign'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.2], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 }});

      // Radiation (glow based on reading level)
      map.addLayer({ id: 'rad-glow', type: 'circle', source: 'radiation', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,10, 5,20, 10,40],
        'circle-color': ['match', ['get','status'], 'DANGER','#FF1744', 'WARNING','#FF9500', '#AB47BC'],
        'circle-opacity': 0.15, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'rad-dots', type: 'circle', source: 'radiation', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,6, 10,8],
        'circle-color': ['match', ['get','status'], 'DANGER','#FF1744', 'WARNING','#FF9500', '#AB47BC'],
        'circle-opacity': 0.9,
        'circle-stroke-width': 2, 'circle-stroke-color': ['match', ['get','status'], 'DANGER','#FF1744', 'WARNING','#FF9500', '#AB47BC'], 'circle-stroke-opacity': 0.4,
      }});
      map.addLayer({ id: 'rad-label', type: 'symbol', source: 'radiation', minzoom: 5, layout: {
        'text-field': ['concat', ['to-string', ['get','reading']], ' nSv/h'], 'text-size': 9, 'text-font': ['Open Sans Bold'],
        'text-offset': [0, 1.5], 'text-allow-overlap': false,
      }, paint: { 'text-color': ['match', ['get','status'], 'DANGER','#FF1744', 'WARNING','#FF9500', '#AB47BC'], 'text-halo-color': '#000', 'text-halo-width': 1 }});

      // Maritime Ships (moving entities)
      map.addLayer({ id: 'ship-dots', type: 'circle', source: 'maritime-ships', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2, 5,4, 10,6],
        'circle-color': ['match', ['get','type'], 'military','#FF1744', 'tanker','#FF9500', 'cargo','#00BCD4', '#fff'],
        'circle-opacity': 0.8,
      }});
      map.addLayer({ id: 'ship-label', type: 'symbol', source: 'maritime-ships', minzoom: 5, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.2], 'text-allow-overlap': false,
      }, paint: { 'text-color': ['match', ['get','type'], 'military','#FF1744', 'tanker','#FF9500', 'cargo','#00BCD4', '#fff'], 'text-halo-color': '#000', 'text-halo-width': 1 }});

      setMapReady(true);
    });

    // Events
    let lastMove = 0;
    map.on('mousemove', e => {
      const now = Date.now();
      if (now - lastMove > 100) {
        lastMove = now;
        onMouseCoords?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      }
    });
    map.on('contextmenu', e => { e.preventDefault(); onRightClick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }); });
    map.on('moveend', () => { const c = map.getCenter(); onViewStateChange?.({ zoom: map.getZoom(), latitude: c.lat, longitude: c.lng }); });

    // ── POPUP HELPER ──
    const popup = (coords: any, html: string) => {
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '420px', offset: 14 }).setLngLat(coords).setHTML(html).addTo(map);
    };
    const pStyle = `background:rgba(12,14,26,0.95);backdrop-filter:blur(16px);border-radius:10px;padding:16px;font-family:'JetBrains Mono',monospace;`;
    const linkStyle = `display:inline-block;margin-top:8px;padding:5px 12px;font-size:10px;letter-spacing:0.12em;text-decoration:none;border-radius:5px;font-family:'JetBrains Mono',monospace;`;

    // ── Flights (with FlightAware + ADS-B Exchange links) ──
    ['fl-commercial','fl-private','fl-jets','fl-military','fl-tankers-isr'].forEach(layer => {
      map.on('click', layer, e => {
        if (!e.features?.length) return;
        const p = e.features[0].properties as any;
        const coords = (e.features[0].geometry as any).coordinates;
        const cs = (p.callsign||'').trim();
        popup(coords, `<div style="${pStyle}border:1px solid rgba(212,175,55,0.3);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#D4AF37;font-size:16px;font-weight:700;letter-spacing:0.1em;">${cs}</span>
            <span style="color:#5C5A54;font-size:10px;">${p.icao24||''}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px;">
            <div><span style="color:#5C5A54;font-size:9px;">MODEL</span><br/><span style="color:#E8E6E0;">${p.model||'—'}</span></div>
            <div><span style="color:#5C5A54;font-size:9px;">ALT</span><br/><span style="color:#00E5FF;">${p.alt?Math.round(p.alt)+'m':'—'}</span></div>
            <div><span style="color:#5C5A54;font-size:9px;">SPEED</span><br/><span style="color:#E8E6E0;">${p.speed_knots||'—'}kt</span></div>
            <div><span style="color:#5C5A54;font-size:9px;">HDG</span><br/><span style="color:#E8E6E0;">${Math.round(p.heading||0)}°</span></div>
            <div><span style="color:#5C5A54;font-size:9px;">REG</span><br/><span style="color:#E8E6E0;">${p.registration||'—'}</span></div>
            <div><span style="color:#5C5A54;font-size:9px;">POS</span><br/><span style="color:#E8E6E0;">${coords[1].toFixed(2)},${coords[0].toFixed(2)}</span></div>
            ${p.mission_hint ? `<div><span style="color:#5C5A54;font-size:9px;">MISSION</span><br/><span style="color:#FF9500;">${p.mission_hint}</span></div>` : ''}
          </div>
          <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;">
            <a href="https://www.flightaware.com/live/flight/${cs}" target="_blank" style="${linkStyle}color:#D4AF37;border:1px solid rgba(212,175,55,0.4);background:rgba(212,175,55,0.1);">⚡ FLIGHTAWARE</a>
            <a href="https://globe.adsbexchange.com/?icao=${p.icao24||''}" target="_blank" style="${linkStyle}color:#00E5FF;border:1px solid rgba(0,229,255,0.4);background:rgba(0,229,255,0.1);">📡 ADS-B</a>
            <a href="https://www.radarbox.com/data/flights/${cs}" target="_blank" style="${linkStyle}color:#FF69B4;border:1px solid rgba(255,105,180,0.4);background:rgba(255,105,180,0.1);">📍 RADARBOX</a>
          </div>
        </div>`);
        onEntityClick?.(p);
      });
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    });

    // ── CCTV (opens CameraViewer panel) ──
    map.on('click', 'cctv-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      // Emit the camera data so the CameraViewer opens
      onEntityClick?.({
        type: 'cctv',
        id: p.id,
        name: p.name,
        city: p.city,
        country: p.country,
        source: p.source,
        feed_url: p.feed_url,
        stream_url: p.stream_url,
        stream_type: p.stream_type,
        external_url: p.external_url,
        lat: coords[1],
        lng: coords[0],
      });
      // Also fly to the camera
      map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 13), duration: 1000 });
    });

    // ── Earthquakes (with USGS link) ──
    map.on('click', 'eq-circles', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,149,0,0.3);">
        <div style="color:#FF9500;font-size:14px;font-weight:700;margin-bottom:4px;">M${p.magnitude} EARTHQUAKE</div>
        <div style="font-size:9px;color:#E8E6E0;margin-bottom:8px;">${p.place||'Unknown location'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;">
          <div><span style="color:#5C5A54;">DEPTH</span><br/><span style="color:#E8E6E0;">${p.depth||'—'}km</span></div>
          <div><span style="color:#5C5A54;">COORDS</span><br/><span style="color:#E8E6E0;">${coords[1].toFixed(3)}, ${coords[0].toFixed(3)}</span></div>
        </div>
        <a href="${p.source === 'NIGGG-BAS' ? 'https://ndc.niggg.bas.bg/' : `https://earthquake.usgs.gov/earthquakes/eventpage/${p.id||''}`}" target="_blank" style="${linkStyle}color:#FF9500;border:1px solid rgba(255,149,0,0.4);background:rgba(255,149,0,0.1);">📊 ${p.source === 'NIGGG-BAS' ? 'NIGGG-BAS' : 'USGS DETAILS'}</a>
      </div>`);
    });

    // ── Satellites (CelesTrak TLE, no API key) ──
    map.on('click', 'sat-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid rgba(212,175,55,0.3);">
        <div style="color:#D4AF37;font-size:12px;font-weight:700;letter-spacing:0.1em;margin-bottom:4px;">🛰️ ${p.name}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#5C5A54;">MISSION</span><br/><span style="color:${p.color||'#aaa'};">${p.mission||'Unknown'}</span></div>
          <div><span style="color:#5C5A54;">POS</span><br/><span style="color:#E8E6E0;">${coords[1].toFixed(2)}°, ${coords[0].toFixed(2)}°</span></div>
        </div>
        <a href="https://celestrak.org/NORAD/elements/" target="_blank" style="${linkStyle}color:#D4AF37;border:1px solid rgba(212,175,55,0.4);background:rgba(212,175,55,0.1);">🔭 CELESTRAK TLE</a>
      </div>`);
    });

    // ── Fires (with NASA FIRMS link) ──
    map.on('click', 'fires-heat', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,107,0,0.3);">
        <div style="color:#FF6B00;font-size:12px;font-weight:700;margin-bottom:6px;">🔥 ACTIVE FIRE DETECTED</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#5C5A54;">BRIGHTNESS</span><br/><span style="color:#FF6B00;">${p.brightness||'—'}K</span></div>
          <div><span style="color:#5C5A54;">COORDS</span><br/><span style="color:#E8E6E0;">${coords[1].toFixed(3)}°, ${coords[0].toFixed(3)}°</span></div>
        </div>
        <a href="https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;l:noaa20-viirs,viirs,modis_a,modis_t;@${coords[0]},${coords[1]},10z" target="_blank" style="${linkStyle}color:#FF6B00;border:1px solid rgba(255,107,0,0.4);background:rgba(255,107,0,0.1);">🛰️ NASA FIRMS MAP</a>
      </div>`);
    });

    // ── GDELT Conflicts (with source article) ──
    map.on('click', 'gdelt-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,61,61,0.3);">
        <div style="color:#FF3D3D;font-size:12px;font-weight:700;margin-bottom:6px;">⚠️ CONFLICT EVENT</div>
        <div style="font-size:9px;color:#E8E6E0;margin-bottom:8px;line-height:1.4;">${p.name||'Unclassified incident'}</div>
        <div style="display:flex;gap:6px;">
          ${p.url ? `<a href="${p.url}" target="_blank" style="${linkStyle}color:#FF3D3D;border:1px solid rgba(255,61,61,0.4);background:rgba(255,61,61,0.1);">SOURCE</a>` : ''}
          <a href="https://www.google.com/maps/@${coords[1]},${coords[0]},12z" target="_blank" style="${linkStyle}color:#448AFF;border:1px solid rgba(68,138,255,0.4);background:rgba(68,138,255,0.1);">MAP</a>
        </div>
      </div>`);
    });

    map.on('click', 'mil-events-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,107,0,0.35);">
        <div style="color:#FF6B00;font-size:12px;font-weight:700;margin-bottom:6px;">🎖️ MILITARY OSINT EVENT</div>
        <div style="font-size:9px;color:#E8E6E0;margin-bottom:8px;line-height:1.4;">${p.name||'Military event'}</div>
        ${p.url ? `<a href="${p.url}" target="_blank" style="${linkStyle}color:#FF6B00;border:1px solid rgba(255,107,0,0.4);background:rgba(255,107,0,0.1);">SOURCE</a>` : ''}
      </div>`);
    });

    ['sentinel-scenes-fill','sentinel-sar-fill','sentinel-optical-fill'].forEach(layer => {
      map.on('click', layer, e => {
        if (!e.features?.length) return;
        const p = e.features[0].properties as any;
        const coords = (e.lngLat ? [e.lngLat.lng, e.lngLat.lat] : [0, 0]) as [number, number];
        const color = p.bucket === 'SAR' ? '#00E5FF' : p.bucket === 'OPTICAL' ? '#76FF03' : '#D4AF37';
        popup(coords, `<div style="${pStyle}border:1px solid ${color}55;">
          <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:6px;">🛰️ ${p.bucket || 'SENTINEL'} SCENE</div>
          <div style="font-size:9px;color:#E8E6E0;margin-bottom:8px;line-height:1.4;">${p.id || 'STAC scene'}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;margin-bottom:8px;">
            <div><span style="color:#5C5A54;">PLATFORM</span><br/><span style="color:#E8E6E0;">${p.platform || 'Sentinel'}</span></div>
            <div><span style="color:#5C5A54;">DATE</span><br/><span style="color:#E8E6E0;">${p.datetime ? new Date(p.datetime).toISOString().slice(0,10) : '—'}</span></div>
            <div><span style="color:#5C5A54;">CLOUD</span><br/><span style="color:${color};">${p.cloud_cover ?? '—'}%</span></div>
            <div><span style="color:#5C5A54;">AREA</span><br/><span style="color:#E8E6E0;">${p.area_km2 || '—'} km²</span></div>
          </div>
          ${p.preview ? `<a href="${p.preview}" target="_blank" style="${linkStyle}color:${color};border:1px solid ${color}66;background:${color}1A;">PREVIEW</a>` : ''}
        </div>`);
      });
    });

    map.on('click', 'frontlines-line', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      popup([e.lngLat.lng, e.lngLat.lat], `<div style="${pStyle}border:1px solid rgba(255,23,68,0.4);">
        <div style="color:#FF1744;font-size:12px;font-weight:700;margin-bottom:6px;">⚔️ PUBLIC FRONTLINE GEOMETRY</div>
        <div style="font-size:9px;color:#E8E6E0;line-height:1.4;">${p.name || p.title || p.description || 'Geometry from public frontline feed.'}</div>
        <a href="https://deepstatemap.live/" target="_blank" style="${linkStyle}color:#FF1744;border:1px solid rgba(255,23,68,0.4);background:rgba(255,23,68,0.1);">DEEPSTATE MAP</a>
      </div>`);
    });

    // ── Air Quality / Pollution ──
    map.on('click', 'air-quality-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid ${p.color || '#00E676'}55;">
        <div style="color:${p.color || '#00E676'};font-size:12px;font-weight:700;margin-bottom:6px;">🌬️ AIR QUALITY</div>
        <div style="font-size:10px;color:#E8E6E0;margin-bottom:8px;">${p.name || 'OpenAQ station'} — ${p.city || ''} ${p.country || ''}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;">
          <div><span style="color:#5C5A54;">PM2.5</span><br/><span style="color:${p.color || '#00E676'};font-weight:bold;">${p.pm25 ?? '—'} ${p.unit || ''}</span></div>
          <div><span style="color:#5C5A54;">LEVEL</span><br/><span style="color:${p.color || '#00E676'};">${p.level || '—'}</span></div>
        </div>
        <div style="font-size:8px;color:#8A8880;margin-top:8px;">Source: OpenAQ · ${p.lastUpdated || ''}</div>
      </div>`);
    });

    // ── Disaster Ops ──
    map.on('click', 'disaster-ops-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const color = p.layer_type === 'fire' ? '#FF6B00' : p.layer_type === 'earthquake' ? '#FF9500' : '#FFD700';
      popup(coords, `<div style="${pStyle}border:1px solid ${color}55;">
        <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:6px;">🚨 DISASTER OPS</div>
        <div style="font-size:10px;color:#E8E6E0;margin-bottom:8px;line-height:1.4;">${p.title || p.type || 'Disaster signal'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;">
          <div><span style="color:#5C5A54;">TYPE</span><br/><span style="color:${color};">${p.layer_type || p.type || '—'}</span></div>
          <div><span style="color:#5C5A54;">SOURCE</span><br/><span style="color:#E8E6E0;">${p.source || 'NASA/USGS/FIRMS'}</span></div>
        </div>
      </div>`);
    });

    // ── Country Risk ──
    map.on('click', 'country-risk-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const color = p.risk_level === 'CRITICAL' ? '#FF1744' : p.risk_level === 'HIGH' ? '#FF9500' : p.risk_level === 'ELEVATED' ? '#FFD700' : '#00E676';
      popup(coords, `<div style="${pStyle}border:1px solid ${color}55;">
        <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:6px;">${p.flag || ''} COUNTRY RISK INDEX</div>
        <div style="font-size:11px;color:#E8E6E0;margin-bottom:8px;">${p.name || p.code} ${p.capital ? `— ${p.capital}` : ''}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;">
          <div><span style="color:#5C5A54;">SCORE</span><br/><span style="color:${color};font-weight:bold;">${p.risk_score}/100</span></div>
          <div><span style="color:#5C5A54;">LEVEL</span><br/><span style="color:${color};">${p.risk_level}</span></div>
        </div>
        <div style="font-size:8px;color:#8A8880;margin-top:8px;line-height:1.4;">${p.tags || ''}</div>
      </div>`);
    });

    // ── Cyber Geo Threats ──
    map.on('click', 'cyber-geo-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid ${p.color || '#00E5FF'}55;">
        <div style="color:${p.color || '#00E5FF'};font-size:12px;font-weight:700;margin-bottom:6px;">🛡️ CYBER GEO THREAT</div>
        <div style="font-size:11px;color:#E8E6E0;margin-bottom:8px;">${p.ip || 'IOC'} — ${p.malware || p.threatType || 'ThreatFox IOC'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;">
          <div><span style="color:#5C5A54;">LOCATION</span><br/><span style="color:#E8E6E0;">${p.city || '—'}, ${p.country || '—'}</span></div>
          <div><span style="color:#5C5A54;">CONF</span><br/><span style="color:${p.color || '#00E5FF'};">${p.confidence || '—'}%</span></div>
          <div><span style="color:#5C5A54;">ASN</span><br/><span style="color:#E8E6E0;">${p.asn || '—'}</span></div>
          <div><span style="color:#5C5A54;">ORG</span><br/><span style="color:#E8E6E0;">${p.org || p.isp || '—'}</span></div>
        </div>
        ${p.reference ? `<a href="${p.reference}" target="_blank" style="${linkStyle}color:${p.color || '#00E5FF'};border:1px solid ${p.color || '#00E5FF'}66;background:rgba(0,229,255,0.1);">REFERENCE</a>` : ''}
      </div>`);
    });

    // ── Port Congestion ──
    map.on('click', 'port-congestion-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const color = p.level === 'CRITICAL' ? '#FF1744' : p.level === 'HIGH' ? '#FF9500' : p.level === 'WATCH' ? '#FFD700' : '#00BCD4';
      popup(coords, `<div style="${pStyle}border:1px solid ${color}55;">
        <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:6px;">⚓ PORT CONGESTION</div>
        <div style="font-size:11px;color:#E8E6E0;margin-bottom:8px;">${p.name || 'Port'} — ${p.country || ''}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;">
          <div><span style="color:#5C5A54;">VESSELS</span><br/><span style="color:${color};font-weight:bold;">${p.vessel_count || 0}</span></div>
          <div><span style="color:#5C5A54;">SCORE</span><br/><span style="color:${color};">${p.score || 0}/100</span></div>
        </div>
      </div>`);
    });

    // ── Maritime Dark Activity ──
    map.on('click', 'maritime-dark-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const color = p.severity === 'CRITICAL' ? '#FF1744' : p.severity === 'HIGH' ? '#FF6B00' : '#FFD700';
      popup(coords, `<div style="${pStyle}border:1px solid ${color}55;">
        <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:6px;">🕳️ AIS DARK ACTIVITY HEURISTIC</div>
        <div style="font-size:11px;color:#E8E6E0;margin-bottom:8px;">${p.title || 'Maritime anomaly'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;">
          <div><span style="color:#5C5A54;">SEVERITY</span><br/><span style="color:${color};font-weight:bold;">${p.severity || 'WATCH'}</span></div>
          <div><span style="color:#5C5A54;">VESSELS</span><br/><span style="color:${color};">${p.vessel_count || 0}</span></div>
        </div>
        <div style="font-size:8px;color:#8A8880;margin-top:8px;line-height:1.4;">${p.context || ''}<br/>Source: ${p.source || 'AIS-derived heuristic'}</div>
      </div>`);
    });

    // ── Global Air Bases (public Wikidata only) ──
    map.on('click', 'airbase-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid rgba(96,165,250,0.55);">
        <div style="color:#BFDBFE;font-size:12px;font-weight:700;margin-bottom:6px;">🌐 GLOBAL AIR BASE — WIKIDATA PUBLIC</div>
        <div style="font-size:11px;color:#E8E6E0;margin-bottom:8px;">${p.name || 'Public air base'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;">
          <div><span style="color:#5C5A54;">COUNTRY</span><br/><span style="color:#BFDBFE;font-weight:bold;">${p.country || '—'}</span></div>
          <div><span style="color:#5C5A54;">CLASS</span><br/><span style="color:#E8E6E0;">${p.class || 'air base'}</span></div>
          <div><span style="color:#5C5A54;">OPERATOR</span><br/><span style="color:#E8E6E0;">${p.operator || '—'}</span></div>
          <div><span style="color:#5C5A54;">WIKIDATA</span><br/><span style="color:#E8E6E0;">${p.wikidata || '—'}</span></div>
        </div>
        <div style="font-size:8px;color:#8A8880;margin-top:8px;line-height:1.4;">Source: ${p.source || 'Wikidata SPARQL'} · no mockdata</div>
        ${p.source_url ? `<a href="${p.source_url}" target="_blank" style="${linkStyle}color:#BFDBFE;border:1px solid rgba(191,219,254,0.5);background:rgba(96,165,250,0.14);">OPEN WIKIDATA SOURCE</a>` : ''}
      </div>`);
    });

    // ── French Air Bases (public OSM/Overpass only) ──
    map.on('click', 'french-airbase-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid rgba(59,130,246,0.55);">
        <div style="color:#93C5FD;font-size:12px;font-weight:700;margin-bottom:6px;">🇫🇷 BASE AÉRIENNE FR — OSM PUBLIC</div>
        <div style="font-size:11px;color:#E8E6E0;margin-bottom:8px;">${p.name || 'Aérodrome militaire public OSM'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;">
          <div><span style="color:#5C5A54;">REF</span><br/><span style="color:#93C5FD;font-weight:bold;">${p.ref || '—'}</span></div>
          <div><span style="color:#5C5A54;">ICAO</span><br/><span style="color:#E8E6E0;">${p.icao || '—'}</span></div>
          <div><span style="color:#5C5A54;">MILITARY</span><br/><span style="color:#E8E6E0;">${p.military || '—'}</span></div>
          <div><span style="color:#5C5A54;">OPERATOR</span><br/><span style="color:#E8E6E0;">${p.operator || '—'}</span></div>
        </div>
        <div style="font-size:8px;color:#8A8880;margin-top:8px;line-height:1.4;">Source: ${p.source || 'OpenStreetMap Overpass'} · no mockdata</div>
        ${p.source_url ? `<a href="${p.source_url}" target="_blank" style="${linkStyle}color:#93C5FD;border:1px solid rgba(147,197,253,0.5);background:rgba(59,130,246,0.14);">OPEN OSM SOURCE</a>` : ''}
      </div>`);
    });

    // ── Risk Heatmap cells ──
    map.on('click', 'risk-heatmap-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const score = Number(p.score || 0);
      const color = score >= 75 ? '#FF1744' : score >= 45 ? '#FF9500' : '#FFD700';
      popup(coords, `<div style="${pStyle}border:1px solid ${color}55;">
        <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:6px;">🔥 GLOBAL RISK SURFACE</div>
        <div style="font-size:11px;color:#E8E6E0;margin-bottom:8px;">Grid risk score: <span style="color:${color};font-weight:bold;">${score}/100</span></div>
        <div style="font-size:9px;color:#8A8880;line-height:1.4;">Drivers: ${p.drivers || 'multi-source OSINT'}</div>
      </div>`);
    });

    // ── Space Weather Ops ──
    map.on('click', 'space-weather-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid ${p.color || '#D4AF37'}55;">
        <div style="color:${p.color || '#D4AF37'};font-size:12px;font-weight:700;margin-bottom:6px;">☀️ SPACE WEATHER OPS</div>
        <div style="font-size:10px;color:#E8E6E0;margin-bottom:8px;">${p.name || 'NOAA SWPC marker'}</div>
        <div style="font-size:9px;color:#aaa;">Kp Index: <span style="color:${p.color || '#D4AF37'};font-weight:bold;">${p.kp ?? '—'}</span> · Level: ${p.level || '—'}</div>
        <a href="https://www.swpc.noaa.gov/" target="_blank" style="${linkStyle}color:#D4AF37;border:1px solid rgba(212,175,55,0.4);background:rgba(212,175,55,0.1);">NOAA SWPC</a>
      </div>`);
    });

    // ── OSM Critical Infrastructure ──
    map.on('click', 'osm-critical-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid rgba(118,255,3,0.4);">
        <div style="color:#76FF03;font-size:12px;font-weight:700;margin-bottom:6px;">🏛️ OSM CRITICAL FACILITY</div>
        <div style="font-size:11px;color:#E8E6E0;margin-bottom:8px;">${p.name || p.type || 'Facility'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;">
          <div><span style="color:#5C5A54;">TYPE</span><br/><span style="color:#76FF03;">${p.type || '—'}</span></div>
          <div><span style="color:#5C5A54;">OPERATOR</span><br/><span style="color:#E8E6E0;">${p.operator || '—'}</span></div>
        </div>
        <a href="https://www.openstreetmap.org/?mlat=${coords[1]}&mlon=${coords[0]}#map=16/${coords[1]}/${coords[0]}" target="_blank" style="${linkStyle}color:#76FF03;border:1px solid rgba(118,255,3,0.4);background:rgba(118,255,3,0.1);">OPENSTREETMAP</a>
      </div>`);
    });

    // ── Global Event / Conflict Markers ──
    map.on('click', 'conflict-icons', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const color = p.severity === 'war' ? '#FF1744' : p.severity === 'high' ? '#FF9500' : '#FFD500';
      popup(coords, `<div style="${pStyle}border:1px solid ${color}40;">
        <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:6px;">⚠️ ${p.label || 'WARNING EVENT'}</div>
        <div style="font-size:10px;color:#E8E6E0;margin-bottom:8px;line-height:1.4;">${p.description || 'Global event detected at this location.'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#5C5A54;">SEVERITY</span><br/><span style="color:${color};">${(p.severity||'unknown').toUpperCase()}</span></div>
          <div><span style="color:#5C5A54;">COORDS</span><br/><span style="color:#E8E6E0;">${coords[1].toFixed(3)}°, ${coords[0].toFixed(3)}°</span></div>
        </div>
      </div>`);
    });


    // ── Generic hover for clickables ──
      ['conflict-icons','cctv-dots','eq-circles','sat-dots','fires-heat','gdelt-dots','mil-events-dots','frontlines-line','sentinel-scenes-fill','sentinel-sar-fill','sentinel-optical-fill','air-quality-dots','disaster-ops-dots','country-risk-dots','cyber-geo-dots','port-congestion-dots','maritime-dark-dots','risk-heatmap-dots','space-weather-dots','osm-critical-dots','naval-base-dots','airbase-dots','french-airbase-dots','fusion-hotspot-core','weather-dots','infra-dots','maritime-dots','choke-dots','news-dots','sigint-news-dots','balloon-dots','rad-dots','ship-dots','sweep-device-dots','scan-targets-dots'].forEach(layer => {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    });

    // ── Scan Targets click ──
    map.on('click', 'scan-targets-dots', (e: any) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const coords = e.features[0].geometry.coordinates.slice();
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,61,61,0.5);">
        <div style="color:#FF3D3D;font-size:12px;font-weight:700;margin-bottom:6px;">🎯 TARGET: ${p.id}</div>
        <div style="font-size:9px;color:#E8E6E0;margin-bottom:8px;">${p.city || 'Unknown'}, ${p.country || 'Unknown'} — ${p.isp || 'Unknown ISP'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;">
          <div><span style="color:#5C5A54;">TYPE</span><br/><span style="color:#00E5FF;">${(p.type || 'UNKNOWN').toUpperCase()}</span></div>
          <div><span style="color:#5C5A54;">COORDS</span><br/><span style="color:#E8E6E0;">${coords[1].toFixed(3)}°, ${coords[0].toFixed(3)}°</span></div>
        </div>
      </div>`);
    });

    // ── Fusion Hotspots click ──
    map.on('click', 'fusion-hotspot-core', (e: any) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const coords = e.features[0].geometry.coordinates.slice();
      const color = p.level === 'CRITICAL' ? '#FF3D3D' : p.level === 'ELEVATED' ? '#FF9500' : p.level === 'WATCH' ? '#00E5FF' : '#00E676';
      popup(coords, `<div style="${pStyle}border:1px solid ${color}55;">
        <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:6px;">🧠 AIP FUSION HOTSPOT</div>
        <div style="font-size:10px;color:#E8E6E0;margin-bottom:8px;line-height:1.4;">${p.label || 'Hotspot'} — ${p.level} / ${p.scoreLabel}</div>
        <div style="font-size:9px;color:#8A8880;">Drivers: ${p.drivers || 'OSINT'}</div>
      </div>`);
    });

    // ── IP Sweep device click ──
    map.on('click', 'sweep-device-dots', (e: any) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const coords = e.features[0].geometry.coordinates.slice();
      const ports = JSON.parse(p.ports || '[]');
      const vulns = JSON.parse(p.vulns || '[]');
      const hostnames = JSON.parse(p.hostnames || '[]');
      const riskColors: Record<string, string> = { CRITICAL: '#FF3D3D', HIGH: '#FF6B00', MEDIUM: '#FFD700', LOW: '#76FF03', INFO: '#5C5A54' };
      popup(coords, `<div style="font-family:monospace;font-size:11px;color:#E8E6E0;">
        <div style="font-size:13px;font-weight:bold;margin-bottom:6px;color:${p.color};">${p.device_type}</div>
        <div style="font-size:12px;margin-bottom:8px;color:#fff;">${p.ip}</div>
        ${hostnames.length > 0 ? `<div style="font-size:9px;color:#8A8880;margin-bottom:6px;">${hostnames.join(', ')}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
          <div><span style="color:#5C5A54;">PORTS</span><br/><span style="color:#E8E6E0;">${ports.length}</span></div>
          <div><span style="color:#5C5A54;">RISK</span><br/><span style="color:${riskColors[p.risk_level] || '#666'};">${p.risk_level}</span></div>
        </div>
        <div style="font-size:9px;color:#8A8880;margin-bottom:6px;">Open: ${ports.slice(0, 12).join(', ')}${ports.length > 12 ? ' ...' : ''}</div>
        ${vulns.length > 0 ? `<div style="font-size:9px;color:#FF3D3D;margin-bottom:6px;">⚠ CVEs: ${vulns.slice(0, 5).join(', ')}${vulns.length > 5 ? ` +${vulns.length - 5} more` : ''}</div>` : ''}
      </div>`);
    });

    // ── Balloons / Sondes ──
    map.on('click', 'balloon-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid ${p.color}40;">
        <div style="color:${p.color};font-size:12px;font-weight:700;letter-spacing:0.1em;margin-bottom:4px;">🎈 ${p.callsign}</div>
        <div style="font-size:9px;color:#aaa;margin-bottom:8px;">${p.type.toUpperCase()} / STATUS: ${p.status.toUpperCase()}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;">
          <div><span style="color:#5C5A54;">ALTITUDE</span><br/><span style="color:#E8E6E0;">${p.altitude} m</span></div>
          <div><span style="color:#5C5A54;">SPEED</span><br/><span style="color:#E8E6E0;">${Math.round(p.speed)} km/h</span></div>
          <div><span style="color:#5C5A54;">VERT RATE</span><br/><span style="color:${p.verticalRate > 0 ? '#00E676' : '#FF3D3D'};">${p.verticalRate.toFixed(1)} m/s</span></div>
          <div><span style="color:#5C5A54;">TEMP</span><br/><span style="color:#E8E6E0;">${p.temperature}°C</span></div>
        </div>
      </div>`);
    });

    // ── Radiation ──
    map.on('click', 'rad-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const color = p.status === 'DANGER' ? '#FF1744' : p.status === 'WARNING' ? '#FF9500' : '#AB47BC';
      popup(coords, `<div style="${pStyle}border:1px solid ${color}40;">
        <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:4px;">☢️ ${p.name}</div>
        <div style="font-size:9px;color:#aaa;margin-bottom:8px;">${p.city}, ${p.country}</div>
        <div style="display:grid;grid-template-columns:1fr;gap:4px;font-size:11px;">
          <div><span style="color:#5C5A54;font-size:9px;">READING</span><br/><span style="color:${color};font-weight:bold;">${p.reading} nSv/h</span></div>
          <div><span style="color:#5C5A54;font-size:9px;">STATUS</span><br/><span style="color:${color};">${p.status}</span></div>
          <div><span style="color:#5C5A54;font-size:9px;">NETWORK</span><br/><span style="color:#E8E6E0;">${p.network}</span></div>
        </div>
      </div>`);
    });

    // ── Maritime Ships ──
    map.on('click', 'ship-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const color = p.type === 'military' ? '#FF1744' : p.type === 'tanker' ? '#FF9500' : '#00BCD4';
      popup(coords, `<div style="${pStyle}border:1px solid ${color}40;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="color:${color};font-size:12px;font-weight:700;letter-spacing:0.1em;">🚢 ${p.name}</span>
          <span style="color:#aaa;font-size:9px;">${p.flag}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;">
          <div><span style="color:#5C5A54;">TYPE</span><br/><span style="color:${color};">${p.type.toUpperCase()}</span></div>
          <div><span style="color:#5C5A54;">SPEED</span><br/><span style="color:#E8E6E0;">${p.speed} knots</span></div>
          <div><span style="color:#5C5A54;">HEADING</span><br/><span style="color:#E8E6E0;">${p.heading}°</span></div>
          <div><span style="color:#5C5A54;">DEST</span><br/><span style="color:#E8E6E0;">${p.destination || 'UNKNOWN'}</span></div>
        </div>
      </div>`);
    });

    // ── Weather Events (NASA EONET) ──
    map.on('click', 'weather-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const iconEmoji = p.icon === 'cyclone' ? '🌀' : p.icon === 'volcano' ? '🌋' : '⚡';
      popup(coords, `<div style="${pStyle}border:1px solid rgba(224,64,251,0.3);">
        <div style="color:#E040FB;font-size:14px;font-weight:700;margin-bottom:6px;">${iconEmoji} ${p.type || 'Weather Event'}</div>
        <div style="font-size:10px;color:#E8E6E0;margin-bottom:8px;line-height:1.4;">${p.title || 'Unknown event'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#5C5A54;">SEVERITY</span><br/><span style="color:${p.severity === 'high' ? '#FF1744' : '#FFD700'};">${(p.severity||'low').toUpperCase()}</span></div>
          <div><span style="color:#5C5A54;">COORDS</span><br/><span style="color:#E8E6E0;">${coords[1].toFixed(3)}°, ${coords[0].toFixed(3)}°</span></div>
        </div>
        <div style="display:flex;gap:6px;">
          ${p.source ? `<a href="${p.source}" target="_blank" style="${linkStyle}color:#E040FB;border:1px solid rgba(224,64,251,0.4);background:rgba(224,64,251,0.1);">📡 SOURCE</a>` : ''}
          <a href="https://eonet.gsfc.nasa.gov/api/v3/events/${p.id || ''}" target="_blank" style="${linkStyle}color:#D4AF37;border:1px solid rgba(212,175,55,0.4);background:rgba(212,175,55,0.1);">🛰️ NASA EONET</a>
        </div>
      </div>`);
    });

    // ── Nuclear Infrastructure ──
    map.on('click', 'infra-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const statusColor = p.status === 'Active Conflict Zone' ? '#FF1744' : p.status === 'Operational' ? '#76FF03' : '#757575';
      popup(coords, `<div style="${pStyle}border:1px solid rgba(118,255,3,0.3);">
        <div style="color:#76FF03;font-size:14px;font-weight:700;margin-bottom:4px;">☢️ ${p.name || 'Nuclear Facility'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#5C5A54;">STATUS</span><br/><span style="color:${statusColor};">${p.status || '—'}</span></div>
          <div><span style="color:#5C5A54;">CITY</span><br/><span style="color:#E8E6E0;">${p.city || '—'}, ${p.country || ''}</span></div>
          <div><span style="color:#5C5A54;">REACTORS</span><br/><span style="color:#76FF03;">${p.reactors || '—'}</span></div>
          <div><span style="color:#5C5A54;">CAPACITY</span><br/><span style="color:#E8E6E0;">${p.capacityMW ? p.capacityMW.toLocaleString() + ' MW' : '—'}</span></div>
          <div><span style="color:#5C5A54;">OWNER</span><br/><span style="color:#E8E6E0;">${p.owner || '—'}</span></div>
          <div><span style="color:#5C5A54;">COORDS</span><br/><span style="color:#E8E6E0;">${coords[1].toFixed(3)}°, ${coords[0].toFixed(3)}°</span></div>
        </div>
        <a href="https://www.google.com/maps/@${coords[1]},${coords[0]},14z/data=!3m1!1e3" target="_blank" style="${linkStyle}color:#76FF03;border:1px solid rgba(118,255,3,0.4);background:rgba(118,255,3,0.1);">SATELLITE VIEW</a>
      </div>`);
    });

    // ── Maritime Ports & Naval Bases ──
    map.on('click', 'maritime-dots', e => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const coords = (e.features![0].geometry as any).coordinates;
      const typeColor = p.type === 'naval' ? '#FF3D3D' : p.type === 'energy' ? '#FF9500' : '#00BCD4';
      const typeLabel = p.type === 'naval' ? 'NAVAL BASE' : p.type === 'energy' ? 'ENERGY PORT' : 'CONTAINER PORT';
      popup(coords, `<div style="${pStyle}border:1px solid ${typeColor}40;">
        <div style="color:${typeColor};font-weight:bold;font-size:11px;margin-bottom:4px;">${p.name}</div>
        <div style="color:#999;font-size:9px;margin-bottom:6px;">${typeLabel} — ${p.country}</div>
        ${p.volume ? `<div style="font-size:9px;color:#aaa;">Volume: <span style="color:${typeColor};font-weight:bold;">${p.volume}</span></div>` : ''}
        ${p.fleet ? `<div style="font-size:9px;color:#aaa;">Fleet: <span style="color:${typeColor};font-weight:bold;">${p.fleet}</span></div>` : ''}
        ${p.rank ? `<div style="font-size:9px;color:#aaa;">Global Rank: <span style="color:${typeColor};font-weight:bold;">#${p.rank}</span></div>` : ''}
      </div>`);
    });

    // ── Maritime Chokepoints ──
    map.on('click', 'choke-dots', e => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const coords = (e.features![0].geometry as any).coordinates;
      const riskCol = p.risk === 'CRITICAL' ? '#FF1744' : p.risk === 'HIGH' ? '#FF9500' : p.risk === 'ELEVATED' ? '#FFD700' : '#00E676';
      popup(coords, `<div style="${pStyle}border:1px solid ${riskCol}40;">
        <div style="color:#FF9500;font-weight:bold;font-size:11px;margin-bottom:4px;">${p.name}</div>
        <div style="font-size:9px;color:#aaa;">Traffic: <span style="color:#fff;">${p.traffic}</span></div>
        <div style="font-size:9px;color:#aaa;">Risk: <span style="color:${riskCol};font-weight:bold;">${p.risk}</span></div>
      </div>`);
    });

    // ── Live News (opens feed viewer) ──
    map.on('click', 'news-dots', e => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      onEntityClick?.({
        type: 'live_news',
        name: p.name,
        city: p.city,
        country: p.country,
        url: p.url,
        category: p.category,
        embed_allowed: p.embed_allowed !== false && p.embed_allowed !== 'false',
      });
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Day/Night
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const update = () => {
      const src = map.getSource('day-night') as any;
      if (!src) return;
      if (!activeLayers.day_night) { src.setData(EMPTY_FC); return; }
      src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [computeSolarTerminator()] }, properties: {} }] });
    };
    update();
    const iv = setInterval(update, 300000); // 5 min (was 1 min — shadow barely moves)
    return () => clearInterval(iv);
  }, [mapReady, activeLayers.day_night]);

  // Helper to set GeoJSON
  const setGeo = useCallback((source: string, features: any[]) => {
    const src = mapRef.current?.getSource(source) as any;
    if (src) src.setData({ type: 'FeatureCollection', features });
  }, []);

  const setVis = useCallback((ids: string[], visible: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    ids.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'); });
  }, []);

  // Flight data → GeoJSON (GPU rendered)
  useEffect(() => {
    if (!mapReady) return;
    const toFeatures = (arr: any[]) => (arr || []).map((f: any) => ({
      type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [f.lng, f.lat] },
      properties: { callsign: f.callsign, heading: f.heading || 0, alt: f.alt, model: f.model, speed_knots: f.speed_knots, registration: f.registration, icao24: f.icao24, mission_hint: f.mission_hint },
    }));
    setGeo('flights', activeLayers.flights ? toFeatures(data.commercial_flights) : []);
    setGeo('private-fl', activeLayers.private ? toFeatures(data.private_flights) : []);
    setGeo('jets', activeLayers.jets ? toFeatures(data.private_jets) : []);
    setGeo('military', activeLayers.military ? toFeatures(data.military_flights) : []);
    setGeo('tankers-isr', activeLayers.tankers_isr ? toFeatures(data.tankers_isr) : []);
  }, [mapReady, data.commercial_flights, data.private_flights, data.private_jets, data.military_flights, data.tankers_isr, activeLayers.flights, activeLayers.private, activeLayers.jets, activeLayers.military, activeLayers.tankers_isr, setGeo]);

  // ── DECOUPLED LAYER RENDERERS (Performance Optimized) ──

  useEffect(() => {
    if (!mapReady) return;
    setGeo('earthquakes', activeLayers.earthquakes && data.earthquakes ? data.earthquakes.map((eq: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [eq.lng, eq.lat] }, properties: { magnitude: eq.magnitude, place: eq.place } })) : []);
  }, [mapReady, data.earthquakes, activeLayers.earthquakes, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('satellites', activeLayers.satellites && data.satellites ? data.satellites.map((s: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] }, properties: { name: s.name, color: s.color, mission: s.mission } })) : []);
  }, [mapReady, data.satellites, activeLayers.satellites, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('gdelt', activeLayers.global_incidents && data.gdelt ? data.gdelt.map((e: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] }, properties: { name: e.name, url: e.url, type: e.type } })) : []);
  }, [mapReady, data.gdelt, activeLayers.global_incidents, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('military-events', activeLayers.mil_conflict_events && data.military_events ? data.military_events.map((e: any) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
      properties: { name: e.name, url: e.url, type: e.type },
    })) : []);
  }, [mapReady, data.military_events, activeLayers.mil_conflict_events, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    const toSceneFeatures = (items: any[], bucket: 'SCENE' | 'SAR' | 'OPTICAL') => (items || [])
      .map((scene: any) => sceneToFeature(scene, bucket))
      .filter(Boolean);
    setGeo('sentinel-scenes', activeLayers.satellite_scenes ? toSceneFeatures(data.sentinel_scenes, 'SCENE') : []);
    setGeo('sentinel-sar', activeLayers.sar_watch ? toSceneFeatures(data.sentinel_sar, 'SAR') : []);
    setGeo('sentinel-optical', activeLayers.optical_watch ? toSceneFeatures(data.sentinel_optical, 'OPTICAL') : []);
  }, [mapReady, data.sentinel_scenes, data.sentinel_sar, data.sentinel_optical, activeLayers.satellite_scenes, activeLayers.sar_watch, activeLayers.optical_watch, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    const features = activeLayers.frontlines ? collectGeoFeatures(data.frontlines) : [];
    setGeo('frontlines', features);
  }, [mapReady, data.frontlines, activeLayers.frontlines, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('gps-jamming', activeLayers.gps_jamming && data.gps_jamming ? data.gps_jamming.map((z: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [z.lng, z.lat] }, properties: { severity: z.severity } })) : []);
  }, [mapReady, data.gps_jamming, activeLayers.gps_jamming, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('cctv', activeLayers.cctv && data.cameras ? data.cameras.map((c: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lng, c.lat] }, properties: { id: c.id, name: c.name, city: c.city, country: c.country, source: c.source, feed_url: c.feed_url, stream_url: c.stream_url, stream_type: c.stream_type, external_url: c.external_url } })) : []);
  }, [mapReady, data.cameras, activeLayers.cctv, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('fires', activeLayers.fires && data.fires ? data.fires.map((f: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] }, properties: { brightness: f.brightness } })) : []);
  }, [mapReady, data.fires, activeLayers.fires, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('weather', activeLayers.weather && data.weather_events ? data.weather_events.map((w: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [w.lng, w.lat] }, properties: { title: w.title, type: w.type, icon: w.icon, severity: w.severity, source: w.source, id: w.id } })) : []);
  }, [mapReady, data.weather_events, activeLayers.weather, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('air-quality', activeLayers.air_quality && data.air_quality ? data.air_quality.map((a: any) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
      properties: { name: a.name, city: a.city, country: a.country, pm25: a.pm25, unit: a.unit, level: a.level, color: a.color, lastUpdated: a.lastUpdated },
    })) : []);
  }, [mapReady, data.air_quality, activeLayers.air_quality, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('disaster-ops', activeLayers.disaster_ops && data.disaster_ops ? data.disaster_ops.map((d: any) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
      properties: { title: d.title || d.place || d.type, type: d.type, layer_type: d.layer_type, severity: d.severity, magnitude: d.magnitude, source: d.source },
    })) : []);
  }, [mapReady, data.disaster_ops, activeLayers.disaster_ops, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('country-risk', activeLayers.country_risk && data.country_risk ? data.country_risk.map((c: any) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      properties: { name: c.name, code: c.code, flag: c.flag, capital: c.capital, risk_score: c.risk_score, risk_level: c.risk_level, tags: (c.tags || []).join(', ') },
    })) : []);
  }, [mapReady, data.country_risk, activeLayers.country_risk, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('cyber-geo', activeLayers.cyber_geo && data.cyber_geo_threats ? data.cyber_geo_threats.map((t: any) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
      properties: { ip: t.ip, malware: t.malware, threatType: t.threatType, confidence: t.confidence, severity: t.severity, color: t.color, city: t.city, country: t.country, isp: t.isp, org: t.org, asn: t.asn, reference: t.reference, source: t.source },
    })) : []);
  }, [mapReady, data.cyber_geo_threats, activeLayers.cyber_geo, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('port-congestion', activeLayers.port_congestion && data.port_congestion ? data.port_congestion.map((p: any) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { name: p.name, country: p.country, type: p.type, vessel_count: p.vessel_count, score: p.score, level: p.level, volume: p.volume },
    })) : []);
  }, [mapReady, data.port_congestion, activeLayers.port_congestion, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('maritime-dark-activity', activeLayers.maritime_dark_activity && data.maritime_dark_activity ? data.maritime_dark_activity.map((e: any) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
      properties: { id: e.id, title: e.title, type: e.type, severity: e.severity, vessel_count: e.vessel_count, context: e.context, source: e.source },
    })) : []);
  }, [mapReady, data.maritime_dark_activity, activeLayers.maritime_dark_activity, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('risk-heatmap', activeLayers.risk_heatmap && data.risk_heatmap ? data.risk_heatmap.map((cell: any) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [cell.lng, cell.lat] },
      properties: { score: cell.score, drivers: cell.drivers },
    })) : []);
  }, [mapReady, data.risk_heatmap, activeLayers.risk_heatmap, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('space-weather-points', activeLayers.space_weather_layer && data.space_weather_points ? data.space_weather_points.map((s: any) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: { name: s.name, kp: s.kp, level: s.level, color: s.color },
    })) : []);
  }, [mapReady, data.space_weather_points, activeLayers.space_weather_layer, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('osm-critical', activeLayers.osm_critical && data.osm_critical ? data.osm_critical.map((f: any) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
      properties: { id: f.id, name: f.name, type: f.type, operator: f.operator, source: f.source },
    })) : []);
  }, [mapReady, data.osm_critical, activeLayers.osm_critical, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('infrastructure', activeLayers.infrastructure && data.infrastructure ? data.infrastructure.map((i: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [i.lng, i.lat] }, properties: { name: i.name, city: i.city, country: i.country, status: i.status, reactors: i.reactors, capacityMW: i.capacityMW, owner: i.owner } })) : []);
  }, [mapReady, data.infrastructure, activeLayers.infrastructure, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('maritime', activeLayers.maritime && data.maritime_ports ? data.maritime_ports.map((p: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { name: p.name, country: p.country, type: p.type, volume: p.volume, fleet: p.fleet, rank: p.rank } })) : []);
    setGeo('maritime-choke', activeLayers.maritime && data.maritime_chokepoints ? data.maritime_chokepoints.map((c: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lng, c.lat] }, properties: { name: c.name, traffic: c.traffic, risk: c.risk } })) : []);
    setGeo('maritime-ships', activeLayers.maritime && data.maritime_ships ? data.maritime_ships.map((s: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] }, properties: { name: s.name || s.mmsi?.toString(), type: s.type || 'cargo', speed: s.speed, heading: s.heading, destination: s.destination, flag: s.flag } })) : []);
    setGeo('naval-bases', activeLayers.naval_bases && data.naval_bases ? data.naval_bases.map((p: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { name: p.name, country: p.country, type: p.type, fleet: p.fleet } })) : []);
  }, [mapReady, data.maritime_ports, data.maritime_chokepoints, data.maritime_ships, data.naval_bases, activeLayers.maritime, activeLayers.naval_bases, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('airbases', activeLayers.airbases && data.airbases ? data.airbases.map((b: any) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
      properties: { id: b.id, name: b.name, country: b.country, operator: b.operator, class: b.class, wikidata: b.wikidata, source: b.source, source_url: b.source_url },
    })) : []);
  }, [mapReady, data.airbases, activeLayers.airbases, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('french-airbases', activeLayers.french_airbases && data.french_airbases ? data.french_airbases.map((b: any) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
      properties: { id: b.id, name: b.name, ref: b.ref, operator: b.operator, aeroway: b.aeroway, military: b.military, icao: b.icao, wikidata: b.wikidata, wikipedia: b.wikipedia, source: b.source, source_url: b.source_url },
    })) : []);
  }, [mapReady, data.french_airbases, activeLayers.french_airbases, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('balloons', activeLayers.balloons && data.balloons ? data.balloons.map((b: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [b.lng, b.lat] }, properties: { callsign: b.callsign, type: b.type, status: b.status, altitude: b.altitude, speed: b.speed, verticalRate: b.verticalRate, temperature: b.temperature, color: b.color } })) : []);
  }, [mapReady, data.balloons, activeLayers.balloons, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('radiation', activeLayers.radiation && data.radiation ? data.radiation.map((r: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lng, r.lat] }, properties: { name: r.name, city: r.city, country: r.country, reading: r.reading, status: r.status, network: r.network } })) : []);
  }, [mapReady, data.radiation, activeLayers.radiation, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('live-news', activeLayers.live_news && data.live_feeds ? data.live_feeds.map((f: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] }, properties: { name: f.name, city: f.city, country: f.country, url: f.url, category: f.category, embed_allowed: f.embed_allowed !== false } })) : []);
  }, [mapReady, data.live_feeds, activeLayers.live_news, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    const items = data.news || [];
    setGeo('sigint-news', activeLayers.news_intel && items.length > 0
      ? items.filter((n: any) => n.coords?.length === 2).map((n: any) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [n.coords[1], n.coords[0]] },
          properties: { title: n.title, source: n.source, risk_score: n.risk_score, link: n.link }
        }))
      : []);
  }, [mapReady, data.news, activeLayers.news_intel, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    // ── CONFLICT ZONES — center-point warning markers ──
    const CONFLICT_ZONES = [
      { label: 'UKRAINE WAR', severity: 'war', lat: 48.5, lng: 31.2 },
      { label: 'GAZA CONFLICT', severity: 'war', lat: 31.35, lng: 34.35 },
      { label: 'LEBANON BORDER', severity: 'high', lat: 33.4, lng: 35.8 },
      { label: 'SUDAN CIVIL WAR', severity: 'war', lat: 15.0, lng: 30.0 },
      { label: 'MYANMAR CONFLICT', severity: 'war', lat: 19.5, lng: 96.5 },
      { label: 'DRC EASTERN CONFLICT', severity: 'war', lat: -1.0, lng: 28.5 },
      { label: 'YEMEN WAR', severity: 'war', lat: 15.5, lng: 48.0 },
      { label: 'SYRIA', severity: 'high', lat: 35.0, lng: 38.5 },
      { label: 'TAIWAN STRAIT', severity: 'elevated', lat: 24.0, lng: 119.5 },
      { label: 'KOREAN DMZ', severity: 'elevated', lat: 38.3, lng: 127.0 },
      { label: 'SAHEL INSTABILITY', severity: 'high', lat: 14.0, lng: 5.0 },
      { label: 'SOMALIA', severity: 'high', lat: 5.0, lng: 46.0 },
      { label: 'RED SEA THREAT', severity: 'high', lat: 16.0, lng: 40.0 },
    ];
    const conflictFeatures = CONFLICT_ZONES.map(z => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [z.lng, z.lat] },
      properties: { label: z.label, severity: z.severity },
    }));
    setGeo('conflict-zones', conflictFeatures);
  }, [mapReady, setGeo]);


  // Visibility
  useEffect(() => {
    if (!mapReady) return;
    setVis(['eq-circles','eq-label'], activeLayers.earthquakes);
    setVis(['sat-dots'], activeLayers.satellites);
    setVis(['gdelt-dots'], activeLayers.global_incidents);
    setVis(['jam-fill','jam-label'], activeLayers.gps_jamming);
    setVis(['day-night-fill'], activeLayers.day_night);
    setVis(['fl-commercial'], activeLayers.flights);
    setVis(['fl-private'], activeLayers.private);
    setVis(['fl-jets'], activeLayers.jets);
    setVis(['fl-military'], activeLayers.military);
    setVis(['fl-tankers-isr'], activeLayers.tankers_isr);
    setVis(['sentinel-scenes-fill','sentinel-scenes-line'], activeLayers.satellite_scenes);
    setVis(['sentinel-sar-fill','sentinel-sar-line'], activeLayers.sar_watch);
    setVis(['sentinel-optical-fill','sentinel-optical-line'], activeLayers.optical_watch);
    setVis(['frontlines-fill','frontlines-line'], activeLayers.frontlines);
    setVis(['mil-events-glow','mil-events-dots'], activeLayers.mil_conflict_events);
    setVis(['naval-base-glow','naval-base-dots','naval-base-label'], activeLayers.naval_bases);
    setVis(['airbase-glow','airbase-dots','airbase-label'], activeLayers.airbases);
    setVis(['french-airbase-glow','french-airbase-dots','french-airbase-label'], activeLayers.french_airbases);
    setVis(['cctv-glow','cctv-dots','cctv-label'], activeLayers.cctv);
    setVis(['fires-heat'], activeLayers.fires);
    setVis(['weather-glow','weather-dots','weather-label'], activeLayers.weather);
    setVis(['air-quality-glow','air-quality-dots'], activeLayers.air_quality);
    setVis(['disaster-ops-glow','disaster-ops-dots'], activeLayers.disaster_ops);
    setVis(['country-risk-glow','country-risk-dots'], activeLayers.country_risk);
    setVis(['cyber-geo-glow','cyber-geo-dots'], activeLayers.cyber_geo);
    setVis(['port-congestion-glow','port-congestion-dots'], activeLayers.port_congestion);
    setVis(['maritime-dark-glow','maritime-dark-dots'], activeLayers.maritime_dark_activity);
    setVis(['risk-heatmap-heat','risk-heatmap-dots'], activeLayers.risk_heatmap);
    setVis(['space-weather-glow','space-weather-dots'], activeLayers.space_weather_layer);
    setVis(['osm-critical-glow','osm-critical-dots'], activeLayers.osm_critical);
    setVis(['infra-glow','infra-dots','infra-label'], activeLayers.infrastructure);
    setVis(['maritime-glow','maritime-dots','maritime-label'], activeLayers.maritime);
    setVis(['choke-glow','choke-dots','choke-label'], activeLayers.maritime);
    setVis(['ship-dots','ship-label'], activeLayers.maritime);
    setVis(['news-glow','news-dots','news-label'], activeLayers.live_news);
    setVis(['sigint-news-glow','sigint-news-dots','sigint-news-label'], activeLayers.news_intel);
    setVis(['conflict-icons'], activeLayers.conflict_zones !== false);
    setVis(['fusion-hotspot-glow','fusion-hotspot-core','fusion-hotspot-label'], true);

    setVis(['balloon-dots','balloon-label'], activeLayers.balloons);
    setVis(['rad-glow','rad-dots','rad-label'], activeLayers.radiation);
    // Sweep layers always visible when data is present (controlled by useEffect)
    setVis(['sweep-connections','sweep-pulse-ring','sweep-device-glow','sweep-device-dots','sweep-device-labels'], true);
  }, [mapReady, activeLayers, setVis]);

  // Fusion hotspots from Pandora AIP
  useEffect(() => {
    if (!mapReady) return;
    setGeo('fusion-hotspots', fusionHotspots.map((h: any) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
      properties: { label: h.label, level: h.level, score: h.score, scoreLabel: Math.round(h.score), drivers: (h.drivers || []).join(', ') },
    })));
  }, [mapReady, fusionHotspots, setGeo]);

  // IP Sweep visualization
  useEffect(() => {
    if (!mapReady) return;
    if (!sweepData?.devices?.length) {
      setGeo('ip-sweep-devices', []);
      setGeo('ip-sweep-pulse', []);
      setGeo('ip-sweep-connections', []);
      return;
    }

    const map = mapRef.current;
    if (!map) return;

    const { center, devices } = sweepData;
    const centerCoord: [number, number] = [center.lng, center.lat];

    // Switch to globe and fly to the sweep location
    try {
      (map as any).setProjection({ type: 'globe' });
      map.setSky({ 'sky-color': '#0A0A0F', 'sky-horizon-blend': 0.02, 'horizon-color': '#0A0A0F', 'horizon-fog-blend': 0.02 });
    } catch { /* projection may not be supported */ }

    map.flyTo({ center: centerCoord, zoom: 14, pitch: 50, bearing: -20, duration: 3000, essential: true });

    // Set center pulse
    setGeo('ip-sweep-pulse', [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: centerCoord },
      properties: { ip: sweepData.target_ip },
    }]);

    // Build device features spread in a circle around center
    const allDeviceFeatures = devices.map((d: any, i: number) => {
      const angle = (i / devices.length) * Math.PI * 2;
      const radius = 0.001 + (Math.random() * 0.003);
      const dLng = centerCoord[0] + Math.cos(angle) * radius * (1 / Math.cos(center.lat * Math.PI / 180));
      const dLat = centerCoord[1] + Math.sin(angle) * radius;
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [dLng, dLat] },
        properties: {
          ip: d.ip, device_type: d.device_type, device_icon: d.device_icon,
          color: d.device_color, risk_level: d.risk_level,
          ports: JSON.stringify(d.ports), hostnames: JSON.stringify(d.hostnames),
          vulns: JSON.stringify(d.vulns), cpes: JSON.stringify(d.cpes), tags: JSON.stringify(d.tags),
        },
      };
    });

    // Connection lines from center to each device
    const connectionFeatures = allDeviceFeatures.map((f: any) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [centerCoord, f.geometry.coordinates] },
      properties: { color: f.properties.color },
    }));

    // Stagger the appearance after 3s flyTo completes
    const timer = setTimeout(() => {
      setGeo('ip-sweep-connections', connectionFeatures);
      const batchSize = 5;
      const batches = Math.ceil(allDeviceFeatures.length / batchSize);
      for (let b = 0; b < batches; b++) {
        setTimeout(() => {
          setGeo('ip-sweep-devices', allDeviceFeatures.slice(0, (b + 1) * batchSize));
        }, b * 100);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [mapReady, sweepData, setGeo]);

  // Scan Targets visualization
  useEffect(() => {
    if (!mapReady || !mapRef.current || !scanTargets) return;
    const map = mapRef.current;
    
    const features = scanTargets.map(t => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [t.lng, t.lat] },
      properties: { ...t }
    }));
    
    const src = map.getSource('scan-targets') as maplibregl.GeoJSONSource;
    if (src) src.setData({ type: 'FeatureCollection', features });
  }, [scanTargets, mapReady]);

  // Fly-to
  useEffect(() => {
    if (!mapReady || !mapRef.current || !flyToLocation) return;
    mapRef.current.flyTo({ center: [flyToLocation.lng, flyToLocation.lat], zoom: flyToLocation.zoom ?? 8, duration: 2000 });
  }, [mapReady, flyToLocation]);

  // Dynamic projection switching (lightweight — no terrain DEM)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    try {
      (map as any).setProjection({ type: projection });
      if (projection === 'globe') {
        map.easeTo({ pitch: 20, duration: 1200 });
        try {
          (map as any).setSky({
            'sky-color': '#04040A',
            'sky-horizon-blend': 0.5,
            'horizon-color': '#0a0a1a',
            'horizon-fog-blend': 0.3,
            'fog-color': '#04040A',
            'fog-ground-blend': 0.9,
          });
        } catch (e) { console.warn('[PANDORA] Suppressed error:', e instanceof Error ? e.message : e); }
      } else {
        map.easeTo({ pitch: 0, duration: 800 });
      }
    } catch (e) {
      console.warn('Projection switch failed:', e);
    }
  }, [mapReady, projection]);

  // Satellite / Dark style switching
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (mapStyle === prevStyleRef.current) return;
    prevStyleRef.current = mapStyle;
    const map = mapRef.current;

    try {
      if (mapStyle !== 'dark') {
        // Add satellite raster tiles
        if (!map.getSource('satellite-tiles')) {
          map.addSource('satellite-tiles', {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            maxzoom: 18,
          });
          map.addLayer({ id: 'satellite-layer', type: 'raster', source: 'satellite-tiles', paint: { 'raster-opacity': 0.85 } }, 'day-night-fill');
        } else {
          map.setLayoutProperty('satellite-layer', 'visibility', 'visible');
        }
      } else {
        if (map.getLayer('satellite-layer')) {
          map.setLayoutProperty('satellite-layer', 'visibility', 'none');
        }
      }
    } catch (e) {
      console.warn('Style switch failed:', e);
    }
  }, [mapReady, mapStyle]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
}

export default memo(PandoraMap);
