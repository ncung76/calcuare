import React, { useState, useEffect, useRef, useCallback, startTransition, useReducer } from 'react';

import { Map3D } from './components/Map3D';
import { DXFPreview } from './components/DXFPreview';
import { NorthArrow } from './components/NorthArrow';
import { MeasureHandler } from './components/MeasureHandler';
import { MapContainer, TileLayer, WMSTileLayer, Polygon, useMapEvents, CircleMarker, Tooltip, Polyline, Marker, useMap, Popup, LayersControl, LayerGroup, GeoJSON } from 'react-leaflet';
import * as turf from '@turf/turf';
import { LogIn, LogOut, User as UserIcon, MapPin, Eraser, Trash2, Crosshair, HelpCircle, ArrowLeft, Ruler, Plus, Download, Search, Sun, Moon, ZoomIn, ZoomOut, Info, Pencil, MousePointer2, Check, Settings, Layers, FileJson, Table, Layout, BarChart2, Share2, Link, Navigation, Menu, X, Lock, Unlock, ChevronLeft, ChevronRight } from 'lucide-react';
import { jsPDF } from 'jspdf';
import L from 'leaflet';
import proj4 from 'proj4';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { translations, Language, t } from './locales';
import Drawing from 'dxf-writer';
import * as utm from 'utm';


// Helper functions for sharing
export const encodeProject = (proj: any) => {
    const data = JSON.stringify({
        points: proj.points,
        kavlings: proj.kavlings,
        kavlingOverrides: proj.kavlingOverrides,
        kavlingSettings: proj.kavlingSettings,
        name: proj.name
    });
    return encodeURIComponent(btoa(data));
};
  
export const decodeProject = (encoded: string) => {
    try {
        const data = JSON.parse(atob(decodeURIComponent(encoded)));
        return data;
    } catch (e) {
        console.error("Failed to decode project:", e);
        return null;
    }
};

export const generateThumbnail = (pts: { lat: number, lng: number }[]): string => {
    if (pts.length < 3) return "";
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) return "";

    const lats = pts.map(p => p.lat);
    const lngs = pts.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;
    const padding = 10;
    // Handle cases where range is 0 to avoid division by zero
    const scale = Math.min((canvas.width - 2 * padding) / (lngRange || 1), (canvas.height - 2 * padding) / (latRange || 1));

    ctx.fillStyle = '#f3f4f6'; // background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.beginPath();
    pts.forEach((p, i) => {
        const x = padding + (p.lng - minLng) * scale;
        const y = canvas.height - padding - (p.lat - minLat) * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = '#f97316';
    ctx.strokeStyle = '#f97316';
    ctx.fill();
    ctx.stroke();

    return canvas.toDataURL('image/png');
};

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

const MetricTooltip = ({ content }: { content: string }) => {
    const [isVisible, setIsVisible] = useState(false);
    
    return (
        <div className="relative inline-block ml-1.5 group">
            <button 
                onMouseEnter={() => setIsVisible(true)}
                onMouseLeave={() => setIsVisible(false)}
                className="opacity-40 hover:opacity-100 transition-opacity p-0.5"
            >
                <HelpCircle size={11} />
            </button>
            
            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 5 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute bottom-full left-0 mb-2 w-48 bg-[var(--color-fg)] text-[var(--color-bg)] p-3 text-[10px] font-sans font-medium uppercase tracking-tight leading-relaxed shadow-xl z-[3000] rounded-sm after:content-[''] after:absolute after:top-full after:left-2 after:border-8 after:border-transparent after:border-t-[var(--color-fg)]"
                    >
                        {content}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const Toggle = ({ checked, onChange, label }: { checked: boolean, onChange: (v: boolean) => void, label: string }) => (
    <div className="flex items-center justify-between cursor-pointer group" onClick={() => onChange(!checked)}>
        <span className="text-[15px] font-mono">{label}</span>
        <div 
            className={`relative w-10 h-5 transition-colors duration-200 rounded-full ${checked ? 'bg-[var(--color-fg)]' : 'bg-[var(--color-fg)]/20'}`}
        >
            <div className={`absolute top-1 left-1 w-3 h-3 transition-transform duration-200 bg-[var(--color-bg)] rounded-full ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
    </div>
);

const SurveyGrid = ({ active }: { active: boolean }) => {
    const map = useMap();
    const [gridLines, setGridLines] = useState<{latLines: any[], lngLines: any[]}>({ latLines: [], lngLines: [] });

    useEffect(() => {
        if (!active) {
            setGridLines({ latLines: [], lngLines: [] });
            return;
        }

        const updateGrid = () => {
            const zoom = map.getZoom();
            const bounds = map.getBounds();
            const west = bounds.getWest();
            const east = bounds.getEast();
            const north = bounds.getNorth();
            const south = bounds.getSouth();

            let step = 0.01;
            if (zoom >= 18) step = 0.0001;
            else if (zoom >= 15) step = 0.001;
            else if (zoom >= 12) step = 0.01;
            else step = 0.1;

            const startLat = Math.floor(south / step) * step;
            const endLat = Math.ceil(north / step) * step;
            const startLng = Math.floor(west / step) * step;
            const endLng = Math.ceil(east / step) * step;

            const latLines = [];
            for (let lat = startLat; lat <= endLat; lat += step) {
                latLines.push([[lat, west], [lat, east]]);
            }
            const lngLines = [];
            for (let lng = startLng; lng <= endLng; lng += step) {
                lngLines.push([[south, lng], [north, lng]]);
            }
            setGridLines({ latLines, lngLines });
        };

        map.on('moveend zoomend', updateGrid);
        updateGrid();
        return () => {
            map.off('moveend zoomend', updateGrid);
        };
    }, [active, map]);

    return (
        <LayerGroup>
            {gridLines.latLines.map((line, idx) => (
                <Polyline key={`lat-${idx}`} positions={line} pathOptions={{ color: '#FFFFFF', weight: 0.5, opacity: 0.1, dashArray: '5, 5', interactive: false }} />
            ))}
            {gridLines.lngLines.map((line, idx) => (
                <Polyline key={`lng-${idx}`} positions={line} pathOptions={{ color: '#FFFFFF', weight: 0.5, opacity: 0.1, dashArray: '5, 5', interactive: false }} />
            ))}
        </LayerGroup>
    );
};

const MapWatermark = () => {
  return (
    <div className="absolute inset-0 pointer-events-none z-[1500] overflow-hidden opacity-[0.33] select-none flex flex-wrap content-start justify-center gap-16 p-4">
      {Array.from({ length: 200 }).map((_, i) => (
        <div 
          key={i} 
          className="whitespace-nowrap transform -rotate-12 text-[10px] font-bold uppercase tracking-[0.3em] text-[#FFD700]"
          style={{ width: 'fit-content' }}
        >
          Rifky Rangga
        </div>
      ))}
    </div>
  );
};

const DEFAULT_POINT_COLOR = '#1A1A1A';

const FreehandHandler = ({ 
    active, 
    isDrawing, 
    setIsDrawing, 
    setPoints 
}: { 
    active: boolean, 
    isDrawing: boolean, 
    setIsDrawing: (v: boolean) => void,
    setPoints: React.Dispatch<React.SetStateAction<{lat: number, lng: number, color: string}[]>>
}) => {
    const map = useMap();
    const lastShiftRef = useRef(false);

    useEffect(() => {
        if (!active) return;
        
        const mapContainer = map.getContainer();
        
        const handleMouseDown = (e: MouseEvent) => {
            if (active) {
                setIsDrawing(true);
                const rect = mapContainer.getBoundingClientRect();
                const latlng = map.containerPointToLatLng(L.point(e.clientX - rect.left, e.clientY - rect.top));
                setPoints(prev => [...prev, { lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }]);
                lastShiftRef.current = e.shiftKey;
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (active && isDrawing) {
                const rect = mapContainer.getBoundingClientRect();
                const latlng = map.containerPointToLatLng(L.point(e.clientX - rect.left, e.clientY - rect.top));
                
                setPoints(prev => {
                    if (prev.length === 0) return [{ lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }];
                    
                    const next = [...prev];
                    const isNowShift = e.shiftKey;

                    if (isNowShift) {
                        if (!lastShiftRef.current) {
                            // Start straight segment: add new point
                            lastShiftRef.current = true;
                            return [...prev, { lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }];
                        } else {
                            // Update straight segment tip
                            next[next.length - 1] = { ...next[next.length - 1], lat: latlng.lat, lng: latlng.lng };
                            return next;
                        }
                    } else {
                        if (lastShiftRef.current) {
                            // Release shift: add one more to lock segment
                            lastShiftRef.current = false;
                            return [...prev, { lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }];
                        }
                        
                        // Normal freehand smoothing
                        const last = prev[prev.length - 1];
                        const dist = turf.distance(
                            turf.point([last.lng, last.lat]), 
                            turf.point([latlng.lng, latlng.lat]), 
                            { units: 'meters' }
                        );
                        if (dist > 2) {
                            return [...prev, { lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }];
                        }
                    }
                    
                    return prev;
                });
            }
        };

        const handleMouseUp = () => {
            if (active) {
                setIsDrawing(false);
            }
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (active && e.touches.length === 1) {
                setIsDrawing(true);
                const rect = mapContainer.getBoundingClientRect();
                const latlng = map.containerPointToLatLng(L.point(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top));
                setPoints(prev => [...prev, { lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }]);
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (active && isDrawing && e.touches.length === 1) {
                const rect = mapContainer.getBoundingClientRect();
                const latlng = map.containerPointToLatLng(L.point(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top));
                
                setPoints(prev => {
                    if (prev.length === 0) return [{ lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }];
                    const last = prev[prev.length - 1];
                    const dist = turf.distance(
                        turf.point([last.lng, last.lat]), 
                        turf.point([latlng.lng, latlng.lat]), 
                        { units: 'meters' }
                    );
                    if (dist > 2) {
                        return [...prev, { lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }];
                    }
                    return prev;
                });
            }
        };

        const handleTouchEnd = () => {
            if (active) {
                setIsDrawing(false);
            }
        };

        mapContainer.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        
        mapContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleTouchEnd);

        // Map CSS modification for pencil cursor
        mapContainer.style.cursor = 'crosshair';

        return () => {
            mapContainer.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            
            mapContainer.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
            mapContainer.style.cursor = '';
        };
    }, [active, isDrawing, map, setIsDrawing, setPoints]);

    return null;
};

const MapCameraController = ({ center }: { center: [number, number] | null }) => {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo(center, 18);
        }
    }, [center, map]);
    return null;
};

// === Land Use Settings ===
const LAND_USE_OPTIONS = [
  { label: 'Residential', value: 'residential', color: '#3b82f6' },
  { label: 'Agricultural', value: 'agricultural', color: '#22c55e' },
  { label: 'Commercial', value: 'commercial', color: '#f59e0b' },
];

// === HELPER UNTUK MENGHITUNG SPASIAL (TURF.JS) ===
function calculateTotalMeasureDistance(pts: [number, number][]) {
    if (pts.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        dist += turf.distance(turf.point([pts[i][1], pts[i][0]]), turf.point([pts[i+1][1], pts[i+1][0]]), { units: 'meters' });
    }
    return dist;
}

function calculateStats(points: {lat: number, lng: number}[]) {
  if (points.length < 3) {
    let edge: any[] = [];
    if (points.length === 2) {
      const dist = turf.distance(turf.point([points[0].lng, points[0].lat]), turf.point([points[1].lng, points[1].lat]), { units: 'meters' });
      const mid = turf.midpoint(turf.point([points[0].lng, points[0].lat]), turf.point([points[1].lng, points[1].lat]));
      edge.push({ distance: dist, midpoint: { lat: mid.geometry.coordinates[1], lng: mid.geometry.coordinates[0] } });
    }
    return { areaSqMeters: 0, areaHectares: 0, areaAre: 0, perimeter: 0, length: 0, width: 0, longestLine: null, edges: edge };
  }

  const coords = points.map(p => [p.lng, p.lat]);
  // Tutup poligon untuk validasi turf
  coords.push([...coords[0]]);
  
  try {
    const polygon = turf.polygon([coords]);

    // 1. Luas berbasis UTM (Shoelace formula) untuk akurasi lokal
    let areaSqMeters = 0;
    try {
        const primaryZone = utm.fromLatLon(points[0].lat, points[0].lng).zoneNum;
        const utmCoords = points.map(p => {
             // forceZoneNum is the 3rd param for fromLatLon if available, 
             // but let's check if the library supports it, or just use standard conversion
             // Actually utm package from npm: utm.fromLatLon(lat, lon, zoneNum) handles forcing.
             return utm.fromLatLon(p.lat, p.lng, primaryZone);
        });
        
        // Ensure same UTM zone
        let area = 0;
        const n = utmCoords.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            // Shoelace calculation on Cartesian coordinates in meters
            area += utmCoords[i].easting * utmCoords[j].northing;
            area -= utmCoords[j].easting * utmCoords[i].northing;
        }
        areaSqMeters = Math.abs(area) / 2.0;
    } catch (e) {
        // Fallback to Turf spherical geometry if UTM conversion fails (e.g. crossing zones badly)
        areaSqMeters = turf.area(polygon);
    }
    const areaHectares = areaSqMeters / 10000;
    const areaAre = areaSqMeters / 100;

    // Check for self intersections
    const kinks = turf.kinks(polygon);
    const isSelfIntersecting = kinks.features.length > 0;

    // 2. Keliling (Perimeter)
    const perimeter = turf.length(polygon, { units: 'meters' });

    // 3. Estimasi Panjang (Jarak terjauh antar titik manapun)
    let maxLength = 0;
    let longestLine: ReturnType<typeof turf.lineString> | null = null;
    let p1Coords: number[] = [];
    let p2Coords: number[] = [];

    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const pt1 = turf.point([points[i].lng, points[i].lat]);
            const pt2 = turf.point([points[j].lng, points[j].lat]);
            const dist = turf.distance(pt1, pt2, { units: 'meters' });
            if (dist > maxLength) {
                maxLength = dist;
                p1Coords = [points[i].lng, points[i].lat];
                p2Coords = [points[j].lng, points[j].lat];
                longestLine = turf.lineString([p1Coords, p2Coords]);
            }
        }
    }

    // 4. Estimasi Lebar (Jarak tegak lurus terjauh dari garis panjang)
    let maxLeft = 0;
    let maxRight = 0;

    if (longestLine) {
        const lineBearing = turf.bearing(turf.point(p1Coords), turf.point(p2Coords));

        points.forEach(p => {
            const pt = turf.point([p.lng, p.lat]);
            const dist = turf.pointToLineDistance(pt, longestLine, { units: 'meters' });
            const ptBearing = turf.bearing(turf.point(p1Coords), pt);

            // Normalisasi perbedaan sudut (-180 ke 180) untuk menentukan posisi kiri/kanan
            let diff = ptBearing - lineBearing;
            while (diff <= -180) diff += 360;
            while (diff > 180) diff -= 360;

            if (diff > 0) {
                if (dist > maxRight) maxRight = dist;
            } else {
                if (dist > maxLeft) maxLeft = dist;
            }
        });
    }

    const width = maxLeft + maxRight;

    const edges: any[] = [];
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const pt1 = turf.point([p1.lng, p1.lat]);
        const pt2 = turf.point([p2.lng, p2.lat]);
        const dist = turf.distance(pt1, pt2, { units: 'meters' });
        const mid = turf.midpoint(pt1, pt2);
        edges.push({
            distance: dist,
            midpoint: { lat: mid.geometry.coordinates[1], lng: mid.geometry.coordinates[0] }
        });
    }

    return { areaSqMeters, areaHectares, areaAre, perimeter, length: maxLength, width, longestLine, edges, isSelfIntersecting };
  } catch (e) {
    console.error("Kesalahan dalam memproses poligon:", e);
    return { areaSqMeters: 0, areaHectares: 0, areaAre: 0, perimeter: 0, length: 0, width: 0, longestLine: null, edges: [], isSelfIntersecting: false };
  }
}

function subdividePolygon(points: any[], roadWidth: number, minArea: number, minFront: number, entryEdgeIndex: string = "-1", exitEdgeIndex: string = "-1", layoutType: string = 'single_center', enableCulDeSac: boolean = false, cornerChamfer: boolean = false, maxDepth: number = 30, setbackGSB: number = 0, optMode: string = 'maximize', secondEntryEdgeIndex: string = "-1", targetAreas: Record<string, number> = {}) {
  try {
    if (points.length < 3) return [];
    
    const coords = points.map(p => [p.lng, p.lat]);
    coords.push([...coords[0]]);

    const poly = turf.polygon([coords]);
    const centroid = turf.centroid(poly);
    
    let maxDist = 0;
    let fallbackAngle = 0;
    let fallbackEdgeMidpoint = null;

    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i+1) % points.length];
        const d = turf.distance([p1.lng, p1.lat], [p2.lng, p2.lat]);
        if (d > maxDist) {
            maxDist = d;
            fallbackAngle = turf.bearing([p1.lng, p1.lat], [p2.lng, p2.lat]);
            fallbackEdgeMidpoint = turf.midpoint(
                turf.point([p1.lng, p1.lat]), 
                turf.point([p2.lng, p2.lat])
            ).geometry.coordinates;
        }
    }
    
    let rotationAngle = layoutType === 'no_road_split_2' ? 90 - fallbackAngle : -fallbackAngle;
    let edgeMidpoint = fallbackEdgeMidpoint;

    const parseIndex = (val: string | number) => {
        if (!val || val === "-1" || val === -1) return null;
        if (typeof val === 'string') {
            const pts = val.split(',');
            if (pts.length === 2 && !isNaN(parseInt(pts[0])) && !isNaN(parseInt(pts[1]))) {
                 return { a: parseInt(pts[0]), b: parseInt(pts[1]) };
            }
            if (!isNaN(parseInt(val))) {
                const num = parseInt(val);
                return { a: num, b: (num + 1) % points.length };
            }
        }
        if (typeof val === 'number') {
            return { a: val, b: (val + 1) % points.length };
        }
        return null;
    };

    const entry = parseIndex(entryEdgeIndex);
    const exit = parseIndex(exitEdgeIndex);

    if (entry && exit && entry.a !== exit.a) {
        const p1In = points[entry.a];
        const p1Out = points[entry.b];
        const entryMid = turf.midpoint(turf.point([p1In.lng, p1In.lat]), turf.point([p1Out.lng, p1Out.lat])).geometry.coordinates;

        const p2In = points[exit.a];
        const p2Out = points[exit.b];
        const exitMid = turf.midpoint(turf.point([p2In.lng, p2In.lat]), turf.point([p2Out.lng, p2Out.lat])).geometry.coordinates;
        
        edgeMidpoint = entryMid; // use entry point for Y-center
        const lineBearing = turf.bearing(entryMid, exitMid);
        // We want this line to be purely HORIZONTAL when rotated (East-West).
        // A bearing of 90 is East. We want rotated bearing to be 90 or -90.
        // rotationAngle = 90 - lineBearing -> line becomes 90.
        rotationAngle = 90 - lineBearing;
    } else if (entry) {
        const p1 = points[entry.a];
        const p2 = points[entry.b];
        const angle = turf.bearing([p1.lng, p1.lat], [p2.lng, p2.lat]);
        
        if (layoutType === 'no_road_split_2') {
            rotationAngle = 90 - angle;
        } else {
            rotationAngle = -angle;
        }
        
        edgeMidpoint = turf.midpoint(
            turf.point([p1.lng, p1.lat]), 
            turf.point([p2.lng, p2.lat])
        ).geometry.coordinates;
    }
    
    const rotatedPoly = turf.transformRotate(poly, rotationAngle, { pivot: centroid });
    const bbox = turf.bbox(rotatedPoly);
    const minX = bbox[0], minY = bbox[1], maxX = bbox[2], maxY = bbox[3];
    
    const ptCenter = centroid.geometry.coordinates;
    const rotatedMidpointPt = turf.transformRotate(turf.point(edgeMidpoint), rotationAngle, { pivot: centroid });
    const rotatedMidpoint = rotatedMidpointPt.geometry.coordinates;
    let centerY = rotatedMidpoint[1];

    const lenX = turf.distance([minX, ptCenter[1]], [maxX, ptCenter[1]], { units: 'meters' });
    const lenY = turf.distance([ptCenter[0], minY], [ptCenter[0], maxY], { units: 'meters' });
    
    const degXToMeter = lenX / Math.abs(maxX - minX);
    const degYToMeter = lenY / Math.abs(maxY - minY);
    
    const roadWidthDeg = roadWidth / (degYToMeter || 1);
    
    // Find side slants
    let leftThetas: number[] = [];
    let rightThetas: number[] = [];
    const rotCoords = rotatedPoly.geometry.coordinates[0];
    for(let i = 0; i < rotCoords.length - 1; i++) {
        const p1 = rotCoords[i];
        const p2 = rotCoords[i+1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        if (Math.abs(dy) > Math.abs(dx) * 0.1) {
            let theta = Math.atan2(dx, dy); 
            if (theta > Math.PI/2) theta -= Math.PI;
            else if (theta < -Math.PI/2) theta += Math.PI;
            
            const midX = (p1[0] + p2[0]) / 2;
            if (midX < (minX + maxX)/2) leftThetas.push(theta);
            else rightThetas.push(theta);
        }
    }
    
    const avgLeftTheta = leftThetas.length > 0 ? leftThetas.reduce((a,b)=>a+b,0)/leftThetas.length : 0;
    const avgRightTheta = rightThetas.length > 0 ? rightThetas.reduce((a,b)=>a+b,0)/rightThetas.length : 0;
    
    const getTheta = (x: number) => {
        const t = (x - minX) / (maxX - minX || 1);
        return avgLeftTheta * (1 - t) + avgRightTheta * t;
    };
    
    const newKavlings: any[] = [];
    
    const insertRoad = (roadBoxToIntersect: any, rId: string) => {
        try {
            const rdFeature = turf.intersect(turf.featureCollection([rotatedPoly, roadBoxToIntersect]));
            if (rdFeature) {
                const realRoad = turf.transformRotate(rdFeature, -rotationAngle, { pivot: centroid });
                newKavlings.push({
                    id: `road-${rId}`,
                    type: 'road',
                    polygon: realRoad,
                    area: turf.area(realRoad)
                });
            }
        } catch(e) {
            console.warn("Intersection failed on road", e);
        }
    };


    const doSlice = (startY: number, endY: number, prefix: string, boundMinX: number = minX, boundMaxX: number = maxX) => {
        const blockHeightMeters = Math.abs(endY - startY) * degYToMeter;
        if (blockHeightMeters <= 2) return; 
        
        const spanY = (maxY - minY) * 1.5; 
        const botY = Math.min(startY, endY) - spanY;
        const topY = Math.max(startY, endY) + spanY;
        const targetBbox = turf.bboxPolygon([boundMinX, Math.min(startY, endY), boundMaxX, Math.max(startY, endY)]);
        
        const fullBlock = turf.intersect(turf.featureCollection([rotatedPoly, targetBbox]));
        if (!fullBlock) return;
        const blockArea = turf.area(fullBlock);
        
        let numLots = Math.max(1, Math.floor(blockArea / minArea));
        if (targetAreas && targetAreas[`${prefix}-numLots`]) {
            numLots = targetAreas[`${prefix}-numLots`];
        }

        let defaultTargetArea = blockArea / numLots;
        if (optMode === 'maximize') {
            defaultTargetArea = minArea;
        }
        
        let startX = boundMinX - 0.0001; // start slightly before to cover edge
        let count = 0;
        
        for (let i = 0; i < numLots; i++) {
            const key = `${prefix}-${i}`;
            let targetArea = defaultTargetArea;
            if (targetAreas && targetAreas[key] !== undefined) {
                 targetArea = targetAreas[key];
            }
            targetArea = Math.max(1, targetArea);
            
            let endX = boundMaxX + 0.0001;
            
            if (i < numLots - 1) {
                // binary search for endX such that area ~ targetArea
                let lowX = startX + 0.000001;
                let highX = boundMaxX + 0.0001;
                for (let step = 0; step < 20; step++) {
                    const midX = (lowX + highX) / 2;
                    const lotPolyTest = turf.polygon([[
                        [startX, botY],
                        [startX, topY],
                        [midX, topY],
                        [midX, botY],
                        [startX, botY]
                    ]]);
                    const testIntersect = turf.intersect(turf.featureCollection([fullBlock, lotPolyTest]));
                    const testArea = testIntersect ? turf.area(testIntersect) : 0;
                    if (testArea < targetArea) lowX = midX;
                    else highX = midX;
                }
                endX = (lowX + highX) / 2;
            }
            
            const lotPoly = turf.polygon([[
                [startX, botY],
                [startX, topY],
                [endX, topY],
                [endX, botY],
                [startX, botY]
            ]]);
            
            try {
                const intersectFeat = turf.intersect(turf.featureCollection([fullBlock, lotPoly]));
                
                if (intersectFeat) {
                    const realLot = turf.transformRotate(intersectFeat, -rotationAngle, { pivot: centroid });
                    const lotArea = turf.area(realLot);
                    
                    if (lotArea > 5) {
                        const lotCenter = turf.centroid(realLot).geometry.coordinates; // [lng, lat]
                        
                        const lotEdges = [];
                        const lotCoords: any[] = realLot.geometry.coordinates[0];
                        for(let j=0; j<lotCoords.length-1; j++) {
                            const p1 = turf.point(lotCoords[j]);
                            const p2 = turf.point(lotCoords[j+1]);
                            const dist = turf.distance(p1, p2, {units: 'meters'});
                            if (dist >= 1) { // only show text for edges >= 1meter
                                const mid = turf.midpoint(p1, p2);
                                const bearing = turf.bearing(p1, p2);
                                let cssAngle = bearing - 90;
                                // Keep text right-side up
                                if (cssAngle > 90 || cssAngle < -90) {
                                    cssAngle += 180;
                                }
                                lotEdges.push({
                                    dist,
                                    mid: mid.geometry.coordinates,
                                    angle: cssAngle
                                });
                            }
                        }

                        // Calculate Setback (Garis Sempadan)
                        let setbackPoly = null;
                        if (setbackGSB > 0) {
                            try {
                                const buffered = turf.buffer(realLot, -setbackGSB, { units: 'meters' });
                                if (buffered && turf.area(buffered) > 0) {
                                    setbackPoly = buffered;
                                }
                            } catch(e) {}
                        }

                        // Use a nicer numbering A1, A2 instead of top-1
                        const finalPrefix = prefix === "top" ? "A" : "B";
                        const lotDepthMeters = blockHeightMeters;
                        const lotFrontMeters = lotArea / blockHeightMeters;
                        
                        newKavlings.push({
                            id: `${prefix}-${count}`,
                            label: `${finalPrefix}${count + 1}`,
                            type: lotArea >= minArea * 0.8 ? 'lot' : 'remnant',
                            polygon: realLot,
                            setbackPolygon: setbackPoly,
                            area: lotArea,
                            center: lotCenter, // [lng, lat]
                            widthStr: Math.round(lotFrontMeters),
                            depthStr: Math.round(lotDepthMeters),
                            edges: lotEdges
                        });
                    }
                }
            } catch(e) {}
            
            startX = endX;
            count++;
        }
    };
    
    if (layoutType === 'double_parallel') {
        let topRoadY = centerY + (maxY - minY) / 6;
        let botRoadY = centerY - (maxY - minY) / 6;

        const secondEntry = parseIndex(secondEntryEdgeIndex);
        if (secondEntry) {
            const p2In = points[secondEntry.a];
            const p2Out = points[secondEntry.b];
            const secondMidpoint = turf.midpoint(
                turf.point([p2In.lng, p2In.lat]), 
                turf.point([p2Out.lng, p2Out.lat])
            ).geometry.coordinates;
             
            const rotatedSecondMidpointPt = turf.transformRotate(turf.point(secondMidpoint), rotationAngle, { pivot: centroid });
            const secondY = rotatedSecondMidpointPt.geometry.coordinates[1];
            
            topRoadY = Math.max(centerY, secondY);
            botRoadY = Math.min(centerY, secondY);
        }

        insertRoad(turf.bboxPolygon([minX - 0.001, topRoadY - roadWidthDeg/2, maxX + 0.001, topRoadY + roadWidthDeg/2]), 't');
        insertRoad(turf.bboxPolygon([minX - 0.001, botRoadY - roadWidthDeg/2, maxX + 0.001, botRoadY + roadWidthDeg/2]), 'b');
        
        doSlice(minY, botRoadY - roadWidthDeg/2, "bot");
        doSlice(botRoadY + roadWidthDeg/2, topRoadY - roadWidthDeg/2, "mid");
        doSlice(topRoadY + roadWidthDeg/2, maxY, "top");
        
    } else if (layoutType === 't_shape') {
        const centerX = (minX + maxX) / 2;
        // Main horizontal road up to center
        insertRoad(turf.bboxPolygon([minX - 0.001, centerY - roadWidthDeg/2, centerX + roadWidthDeg/2, centerY + roadWidthDeg/2]), 'h');
        // Vertical road from center down/up
        insertRoad(turf.bboxPolygon([centerX - roadWidthDeg/2, centerY - roadWidthDeg/2, centerX + roadWidthDeg/2, maxY + 0.001]), 'v');
        
        doSlice(minY, centerY - roadWidthDeg/2, "bot"); // full bottom
        doSlice(centerY + roadWidthDeg/2, maxY, "topL", minX, centerX - roadWidthDeg/2); // top left
        doSlice(centerY + roadWidthDeg/2, maxY, "topR", centerX + roadWidthDeg/2, maxX); // top right
        
    } else if (layoutType === 'no_road_split_2') {
        doSlice(minY, centerY, "bot");
        doSlice(centerY, maxY, "top");
    } else {
        // single_center
        insertRoad(turf.bboxPolygon([minX - 0.001, centerY - roadWidthDeg / 2, maxX + 0.001, centerY + roadWidthDeg / 2]), '1');
        doSlice(minY, centerY - roadWidthDeg/2, "bot");
        doSlice(centerY + roadWidthDeg/2, maxY, "top");
    }
    
    return newKavlings;

  } catch(err) {
    console.error("Error generating kavlings:", err);
    return [];
  }
}

// === KOMPONEN UTAMA ===
const DEFAULT_WMS_LAYERS = [
  { name: 'Plot Per View', layers: 'dorado:plot_only' },
];

export default function App() {
  const [isAuth, setIsAuth] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const authGasUrl = 'https://script.google.com/macros/s/AKfycbylEEGenZcZelINy1KBn9P6mL5S5gGBtdYKpUsBQOdHx_qxOfa-GtiiGkAbw_lFwnTtsw/exec';
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  useEffect(() => {
    const savedAuth = localStorage.getItem('calcare_auth_token');
    if (savedAuth === 'true') {
      setIsAuth(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authGasUrl) {
      setAuthError('Google Apps Script URL is not configured.');
      return;
    }
    
    setIsLoadingAuth(true);
    setAuthError('');
    
    try {
      const response = await fetch(`${authGasUrl}?action=login&username=${encodeURIComponent(authUsername)}&password=${encodeURIComponent(authPassword)}`);
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      // We expect the GAS script to return a JSON containing {"success": true/false, "message": "..."}
      const data = await response.json();
      
      if (data.success) {
        setIsAuth(true);
        localStorage.setItem('calcare_auth_token', 'true');
      } else {
        setAuthError(data.message || 'Invalid credentials');
      }
    } catch (error: any) {
      setAuthError('Failed to fetch from GAS. Please ensure your Google Apps Script is deployed as Web App accessible to "Anyone" and handles GET requests properly. ' + error.message);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleLogout = () => {
    setIsAuth(false);
    localStorage.removeItem('calcare_auth_token');
  };

  const pointsReducer = (state: { history: any[][], index: number }, action: any): { history: any[][], index: number } => {
      switch(action.type) {
          case 'SET':
              const currentPoints = state.history[state.index];
              const nextPoints = typeof action.payload === 'function' ? action.payload(currentPoints) : action.payload;
              if (JSON.stringify(currentPoints) === JSON.stringify(nextPoints)) return state;
              
              const newHistory = state.history.slice(0, state.index + 1);
              newHistory.push(nextPoints);
              if (newHistory.length > 11) newHistory.shift();
              return { history: newHistory, index: newHistory.length - 1 };
          case 'UNDO':
              return { ...state, index: Math.max(0, state.index - 1) };
          case 'REDO':
              return { ...state, index: Math.min(state.history.length - 1, state.index + 1) };
          default:
              return state;
      }
  }

  const [pointsState, dispatch] = useReducer(pointsReducer, { history: [[]], index: 0 });
  const points = pointsState.history[pointsState.index];
  const [is3D, setIs3D] = useState(false);
  
  const setPoints = (newVal: any) => dispatch({ type: 'SET', payload: newVal });
  const undo = () => dispatch({ type: 'UNDO' });
  const redo = () => dispatch({ type: 'REDO' });

  const [stats, setStats] = useState(calculateStats([]));
  const [manualInput, setManualInput] = useState({ lat: '', lng: '' });

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Export Settings State
  const [exportClientName, setExportClientName] = useState("");
  const [exportNIB, setExportNIB] = useState("");
  const [exportSurveyor, setExportSurveyor] = useState("");
  const [exportNotes, setExportNotes] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState<number>(0);
  const [njopEstimate, setNjopEstimate] = useState<string>('');
  
  // Smart Import State
  const [importError, setImportError] = useState("");

  const handleSmartImport = () => {
    setImportError("");
    if (!importText.trim()) {
        setImportError("Teks kosong.");
        return;
    }
    
    try {
        let extractedPoints: {lat: number, lng: number}[] = [];

        try {
            const parsed = JSON.parse(importText);
            
            const findGeoJSONPoints = (obj: any) => {
                if (!obj) return;
                if (obj.type === 'FeatureCollection' && obj.features) {
                    obj.features.forEach(findGeoJSONPoints);
                } else if (obj.type === 'Feature' && obj.geometry) {
                    findGeoJSONPoints(obj.geometry);
                } else if ((obj.type === 'Polygon' || obj.type === 'MultiPolygon') && obj.coordinates) {
                    let coordsArr = obj.type === 'Polygon' ? [obj.coordinates] : obj.coordinates;
                    coordsArr.forEach((poly: any) => {
                         if (poly.length > 0) {
                             poly[0].forEach((coord: number[]) => {
                                 if (coord.length >= 2) {
                                     extractedPoints.push({ lng: coord[0], lat: coord[1] });
                                 }
                             });
                         }
                    });
                }
            };
            
            findGeoJSONPoints(parsed);

            if (extractedPoints.length === 0) {
                if (Array.isArray(parsed)) {
                    parsed.forEach(p => {
                        if (p.lat && p.lng) extractedPoints.push({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) });
                        else if (p.latitude && p.longitude) extractedPoints.push({ lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) });
                        else if (Array.isArray(p) && p.length >= 2) {
                             if (Math.abs(p[0]) > 90) extractedPoints.push({ lat: p[1], lng: p[0] });
                             else extractedPoints.push({ lat: p[0], lng: p[1] });
                        }
                    });
                }
            }
            
            if (extractedPoints.length === 0) {
                 const extractDeepCoords = (obj: any) => {
                     if (!obj || typeof obj !== 'object') return;
                     if (Array.isArray(obj)) {
                         obj.forEach(extractDeepCoords);
                     } else {
                         if (obj.lat && obj.lng) extractedPoints.push({lat: parseFloat(obj.lat), lng: parseFloat(obj.lng)});
                         else {
                             for (let key in obj) {
                                 if (key === 'coordinates' && Array.isArray(obj[key]) && obj[key].length > 0 && Array.isArray(obj[key][0])) {
                                      obj[key][0].forEach((c:any) => {
                                           if(Array.isArray(c) && c.length>=2) {
                                                if (c[0] > -90 && c[0] < 90 && c[1] > -180 && c[1] < 180 && c[0] !== c[1]) {
                                                     if (Math.abs(c[0]) > 90) extractedPoints.push({lat: c[1], lng: c[0]});
                                                     else extractedPoints.push({lat: c[0], lng: c[1]});
                                                }
                                           }
                                      });
                                 }
                                 else {
                                      extractDeepCoords(obj[key]);
                                 }
                             }
                         }
                     }
                 }
                 extractDeepCoords(parsed);
            }
        } catch (e) {
            // Regex fallback
            const regex = /(-?\d+\.\d+)[\s,;]+(-?\d+\.\d+)/g;
            let match;
            while ((match = regex.exec(importText)) !== null) {
                const a = parseFloat(match[1]);
                const b = parseFloat(match[2]);
                if (!isNaN(a) && !isNaN(b)) {
                    if (Math.abs(a) <= 90 && Math.abs(b) >= 90) {
                        extractedPoints.push({ lat: a, lng: b }); 
                    } else if (Math.abs(b) <= 90 && Math.abs(a) >= 90) {
                        extractedPoints.push({ lat: b, lng: a }); 
                    } else {
                        extractedPoints.push({ lat: a, lng: b });
                    }
                }
            }
        }

        if (extractedPoints.length > 0) {
            // remove duplicates next to each other
            const uniquePts = extractedPoints.filter((p, i, arr) => {
                if(i === 0) return true;
                return p.lat !== arr[i-1].lat || p.lng !== arr[i-1].lng;
            });
            // remove last point if it's the same as first logic? GeoJSON does this. Let's keep it clean
            if(uniquePts.length > 3 && uniquePts[0].lat === uniquePts[uniquePts.length-1].lat && uniquePts[0].lng === uniquePts[uniquePts.length-1].lng) {
                 uniquePts.pop();
            }

            setPoints(uniquePts);
            setActiveModal('none');
            setImportText("");
            setMapCenter([uniquePts[0].lat, uniquePts[0].lng]);
            alert(`Berhasil mengimpor ${uniquePts.length} titik koordinat.`);
        } else {
             setImportError("Tidak menemukan data koordinat valid. Pastikan format teks JSON, GeoJSON, atau list koordinat.");
        }
    } catch(e: any) {
        setImportError("Error processing: " + e.message);
    }
  };
  
  const [exportMode, setExportMode] = useState<'current' | 'batch'>('current');
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);

  // Kavling State
  const [kavlingSettings, setKavlingSettings] = useState({ 
      minArea: 100, 
      minFront: 5, 
      roadWidth: 5, 
      entryEdgeIndex: "-1", 
      exitEdgeIndex: "-1", 
      secondEntryEdgeIndex: "-1",
      layoutType: 'single_center',
      enableCulDeSac: false,
      cornerChamfer: false,
      maxDepth: 30,
      setbackGSB: 3,
      optMode: 'maximize'
  });
  const [kavlings, setKavlings] = useState<any[]>([]);
  const [showKavlings, setShowKavlings] = useState(true);
  const [kavlingOverrides, setKavlingOverrides] = useState<Record<string, number>>({});

  // New Feature States
  const [markers, setMarkers] = useState<{lat: number, lng: number, label: string, color?: string}[]>([]);
  const [selectedAnnotationColor, setSelectedAnnotationColor] = useState("red");
  const [isAddingMarker, setIsAddingMarker] = useState(false);
  const [pendingAnnotationPos, setPendingAnnotationPos] = useState<{lat: number, lng: number} | null>(null);
  const [inputAnnotationLabel, setInputAnnotationLabel] = useState("");
  const [annotationToDeleteIdx, setAnnotationToDeleteIdx] = useState<number | null>(null);
  const [confirmProjectToLoad, setConfirmProjectToLoad] = useState<any | null>(null);
  const [snapStatus, setSnapStatus] = useState<{lat: number, lng: number, type: 'vertex' | 'edge'} | null>(null);
  const [elevationProfile, setElevationProfile] = useState<{distance: number, elevation: number}[]>([]);
  const [elevationStats, setElevationStats] = useState<{min: number, max: number, diff: number} | null>(null);
  const [isFetchingElevation, setIsFetchingElevation] = useState(false);
  const [showElevation, setShowElevation] = useState(false);
  
  const [slopeGridData, setSlopeGridData] = useState<any[]>([]);
  const [isFetchingSlope, setIsFetchingSlope] = useState(false);
  const [showSlopeHeatmap, setShowSlopeHeatmap] = useState(false);

  // ITR State


  // RDTR (Rencana Detail Tata Ruang) States
  const [sidebarActiveTab, setSidebarActiveTab] = useState<'kavling' | 'rdtr'>('kavling');
  const [isRdtrActive, setIsRdtrActive] = useState(false);
  const [selectedRdtrWilayah, setSelectedRdtrWilayah] = useState("5171000000"); // default Denpasar
  const [rdtrLoading, setRdtrLoading] = useState(false);
  const [rdtrResult, setRdtrResult] = useState<any | null>(null);
  const [rdtrClickedPoint, setRdtrClickedPoint] = useState<{lat: number, lng: number} | null>(null);
  const [rdtrTujuanLahan, setRdtrTujuanLahan] = useState('');
  const [rdtrHistory, setRdtrHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("calcare_rdtr_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [rdtrFavorites, setRdtrFavorites] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("calcare_rdtr_favorites");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [mapCenter, setMapCenter] = useState<[number, number] | null>([-8.6705, 115.2126]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [selectedSearchResult, setSelectedSearchResult] = useState<any | null>(null);
  const [isFreehand, setIsFreehand] = useState(false);
  const [isAutoDetect, setIsAutoDetect] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showPlotSizes, setShowPlotSizes] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | number | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Modal State
  const [activeModal, setActiveModal] = useState<'none' | 'library' | 'settings' | 'export' | 'import' | 'dxfPreview' | 'kavling' | 'menu'>('none');
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectDetails, setProjectDetails] = useState('');
  const [importText, setImportText] = useState('');

  // WMS Filter State
  const [wmsOpacity, setWmsOpacity] = useState(() => Number(localStorage.getItem('calcare_wms_opacity') ?? 0.7));
  const [wmsHue, setWmsHue] = useState(() => Number(localStorage.getItem('calcare_wms_hue') ?? 0));
  const [wmsInvert, setWmsInvert] = useState(() => localStorage.getItem('calcare_wms_invert') === 'true');

  // Land Use State
  const [landUseType, setLandUseType] = useState('residential');

  // Reverse Geocoding State (ArcGIS Integration)
  const [reverseGeocodeAddress, setReverseGeocodeAddress] = useState<string>('');
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);

  const fetchAddressForCoordinates = useCallback(async (lat: number, lng: number) => {
    setIsGeocoding(true);
    try {
      const response = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
      if (!response.ok) throw new Error('Failed to fetch address');
      const data = await response.json();
      if (data && data.address && data.address.Match_addr) {
        setReverseGeocodeAddress(data.address.Match_addr);
      } else {
        setReverseGeocodeAddress('');
      }
    } catch (err) {
      console.error(err);
      setReverseGeocodeAddress('');
    } finally {
      setIsGeocoding(false);
    }
  }, []);

  useEffect(() => {
    if (points.length >= 1) {
      const lats = points.map(p => p.lat);
      const lngs = points.map(p => p.lng);
      const avgLat = lats.reduce((sum, val) => sum + val, 0) / points.length;
      const avgLng = lngs.reduce((sum, val) => sum + val, 0) / points.length;
      
      const timer = setTimeout(() => {
        fetchAddressForCoordinates(avgLat, avgLng);
      }, 700);
      return () => clearTimeout(timer);
    } else {
      setReverseGeocodeAddress('');
    }
  }, [points, fetchAddressForCoordinates]);

  useEffect(() => {
    localStorage.setItem('calcare_wms_opacity', String(wmsOpacity));
    localStorage.setItem('calcare_wms_hue', String(wmsHue));
    localStorage.setItem('calcare_wms_invert', String(wmsInvert));
  }, [wmsOpacity, wmsHue, wmsInvert]);

  // Settings State
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [wmsLayersList, setWmsLayersList] = useState<{name: string, layers: string}[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [areaUnit, setAreaUnit] = useState<'are' | 'ha' | 'sqm'>('are');
  const [zoning, setZoning] = useState({ residential: 50, agricultural: 25, commercial: 25 });
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [lang, setLang] = useState<Language>('en');
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [areaPrecision, setAreaPrecision] = useState<number>(() => Number(localStorage.getItem('calcare_area_precision')) || 4);
  const [arePrecision, setArePrecision] = useState<number>(() => {
    const val = localStorage.getItem('calcare_are_precision');
    return val === null ? 2 : Number(val);
  });
  const [mobileTab, setMobileTab] = useState<'map' | 'points' | 'stats'>('map');
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<{[key: string]: boolean}>({});

  const user = null;
  const isAuthLoading = false;

  const handleNewProject = useCallback(() => {
     // Clear current workspace completely and immediately
     setPoints([]);
     setCurrentProjectId(null);
     setSelectedPointIndex(null);
     setAutoSaveStatus('idle');
     setSelectedSearchResult(null);
     setSelectedResultId(null);
     setNewProjectName("");
     
     // Reset all interactive tools/states
     setMeasurePoints([]);
     setIsFreehand(false);
     setIsEditMode(false);
     setIsDrawing(false);
     setIsMeasuring(false);
     
     // Persistence cleanup
     localStorage.removeItem('calcare_points_draft');
     localStorage.removeItem('calcare_current_id');

     // Smooth URL cleanup
     try {
       const url = new URL(window.location.href);
       if (url.searchParams.has('share')) {
         url.searchParams.delete('share');
         window.history.pushState({}, '', url.toString());
       }
     } catch (e) {}
     
     // Direct UI feedback: close modal and return to map
     setActiveModal('none');
     setMobileTab('map');
  }, [setPoints, setCurrentProjectId, setSelectedPointIndex, setAutoSaveStatus, setSelectedSearchResult, setSelectedResultId, setNewProjectName, setMeasurePoints, setIsFreehand, setIsEditMode, setIsDrawing, setIsMeasuring, setActiveModal, setMobileTab]);
  
  // Custom Sync State
  const [gasUrl, setGasUrl] = useState('https://script.google.com/macros/s/AKfycbxjLsv05ASo9hM6zK2juoKtcX9gUypBupmEkt6IrSHE5335_Z7kktHOcIz23BVtIFIELA/exec');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingUpSheet, setIsSettingUpSheet] = useState(false);



  useEffect(() => {
    localStorage.setItem('calcare_area_unit', areaUnit);
  }, [areaUnit]);

  // Hardcoded GeoServer Layers
  useEffect(() => {
    setWmsLayersList(DEFAULT_WMS_LAYERS);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encodedData = params.get('share');
    if (encodedData) {
        const proj = decodeProject(encodedData);
        if (proj) {
            loadProject(proj);
        } else {
            alert("Gagal memuat proyek dari tautan.");
        }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('calcare_area_precision', String(areaPrecision));
  }, [areaPrecision]);

  useEffect(() => {
    localStorage.setItem('calcare_are_precision', String(arePrecision));
  }, [arePrecision]);

  useEffect(() => {
    localStorage.setItem('calcare_dark_mode', String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    setStats(calculateStats(points));
  }, [points]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (isEditMode && selectedPointIndex !== null && points[selectedPointIndex]) {
        const step = 0.00001;
        let handled = false;

        if (e.key === 'ArrowUp') {
          handlePointDrag(selectedPointIndex, points[selectedPointIndex].lat + step, points[selectedPointIndex].lng);
          handled = true;
        } else if (e.key === 'ArrowDown') {
          handlePointDrag(selectedPointIndex, points[selectedPointIndex].lat - step, points[selectedPointIndex].lng);
          handled = true;
        } else if (e.key === 'ArrowLeft') {
          handlePointDrag(selectedPointIndex, points[selectedPointIndex].lat, points[selectedPointIndex].lng - step);
          handled = true;
        } else if (e.key === 'ArrowRight') {
          handlePointDrag(selectedPointIndex, points[selectedPointIndex].lat, points[selectedPointIndex].lng + step);
          handled = true;
        }

        if (handled) {
          e.preventDefault();
          setActiveKey(e.key);
          setTimeout(() => setActiveKey(null), 100);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditMode, selectedPointIndex, points]);

  const handleQuickSave = (isManual: boolean = false) => {
    if (points.length === 0) return;
    
    // If it's an auto-save and there's no project ID, do not create a new project
    if (!currentProjectId && !isManual) {
        return;
    }

    setAutoSaveStatus('saving');
    // Save to draft workspace immediately
    localStorage.setItem('calcare_points_draft', JSON.stringify(points));
    localStorage.setItem('calcare_kavlings_draft', JSON.stringify(kavlings));
    
    // Manage Library Entry
    setSavedProjects(prev => {
      let updated;
      if (currentProjectId) {
        // Update existing
        updated = prev.map(p => {
          if (p.id === currentProjectId) {
            return { 
              ...p, 
              points, 
              kavlings,
              kavlingOverrides,
              kavlingSettings,
              date: new Date().toISOString(),
              areaSqMeters: stats.areaSqMeters,
              perimeter: stats.perimeter
            };
          }
          return p;
        });
      } else {
        // Create new entry in library
        const newId = `proj_${Date.now()}`;
        const newProject = {
          id: newId,
          name: `Survey ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          points,
          kavlings,
          kavlingOverrides,
          kavlingSettings,
          date: new Date().toISOString(),
          areaSqMeters: stats.areaSqMeters,
          perimeter: stats.perimeter,
          unit: areaUnit,
          shared: false
        };
        updated = [newProject, ...prev];
        setCurrentProjectId(newId);
        localStorage.setItem('calcare_current_id', newId);
      }
      
      localStorage.setItem('geocalc_projects', JSON.stringify(updated));
      return updated;
    });

    setAutoSaveStatus('saved');
    setTimeout(() => setAutoSaveStatus('idle'), 2000);
  };

  useEffect(() => {
    if (points.length === 0) return;
    const t = setTimeout(() => {
      handleQuickSave(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [points, kavlings, kavlingOverrides, kavlingSettings]);



  useEffect(() => {
    localStorage.setItem('calcare_area_unit', areaUnit);
  }, [areaUnit]);

  useEffect(() => {
    localStorage.setItem('calcare_lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('calcare_show_grid', String(showGrid));
  }, [showGrid]);

  useEffect(() => {
    // Load projects from localStorage on mount
    const saved = localStorage.getItem('geocalc_projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrated = parsed.map((proj: any) => ({
          ...proj,
          points: proj.points.map((p: any) => ({
            ...p,
            color: p.color || DEFAULT_POINT_COLOR
          }))
        }));
        setSavedProjects(migrated);
      } catch (e) {
        console.error("Failed to parse saved projects");
      }
    }

    // Load workspace draft
    const draft = localStorage.getItem('calcare_points_draft');
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        const migrated = parsed.map((p: any) => ({
          ...p,
          color: p.color || DEFAULT_POINT_COLOR
        }));
        setPoints(migrated);
      } catch (e) {
        console.error("Failed to parse draft points");
      }
    }
    const savedId = localStorage.getItem('calcare_current_id');
    if (savedId && savedId !== 'null') {
      setCurrentProjectId(Number(savedId));
    }
    
    // Load GAS URL
    const savedGasUrl = localStorage.getItem('calcare_gas_url');
    if (savedGasUrl) {
        setGasUrl(savedGasUrl);
    }

    const savedAreaUnit = localStorage.getItem('calcare_area_unit');
    if (savedAreaUnit) setAreaUnit(savedAreaUnit as 'are' | 'ha' | 'sqm');

    const savedDarkMode = localStorage.getItem('calcare_dark_mode');
    if (savedDarkMode) setIsDarkMode(savedDarkMode === 'true');

    const savedLang = localStorage.getItem('calcare_lang');
    if (savedLang) setLang(savedLang as Language);

    const savedShowGrid = localStorage.getItem('calcare_show_grid');
    if (savedShowGrid) setShowGrid(savedShowGrid === 'true');
  }, []);

  const handleClear = () => {
    setPoints([]);
    setMeasurePoints([]);
    setMarkers([]);
    setKavlings([]);
    setCurrentProjectId(null);
    localStorage.removeItem('calcare_points_draft');
    localStorage.removeItem('calcare_current_id');
    setIsEditMode(false);
    setIsFreehand(false);
    setIsMeasuring(false);
  };
  const handleUndo = () => setPoints(pts => pts.slice(0, -1));
  const removePointAt = (idx: number) => {
    setPoints(pts => pts.filter((_, i) => i !== idx));
  };

  const handleColorChange = (index: number, color: string) => {
    setPoints(prev => {
      const next = [...prev];
      next[index] = { ...next[index], color };
      return next;
    });
  };

  const dragRaf = useRef<number | null>(null);

  const getSnappedLatLng = (index: number, lat: number, lng: number) => {
    const map = mapInstanceRef.current;
    if (!map) return { lat, lng, isSnapped: false, snapType: null };

    const T_VERTEX = 15; // pixel threshold for vertex snap
    const T_EDGE = 15;   // pixel threshold for edge snap

    const q = map.latLngToContainerPoint([lat, lng]);

    let bestVertex: { lat: number; lng: number; dist: number } | null = null;
    let bestEdge: { lat: number; lng: number; dist: number } | null = null;

    // 1. Gather other boundary points as vertices
    points.forEach((p, idx) => {
      if (idx === index) return;
      const vPt = map.latLngToContainerPoint([p.lat, p.lng]);
      const dx = q.x - vPt.x;
      const dy = q.y - vPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < T_VERTEX) {
        if (!bestVertex || dist < bestVertex.dist) {
          bestVertex = { lat: p.lat, lng: p.lng, dist };
        }
      }
    });

    // 2. Gather kavling vertices and segments
    if (kavlings && kavlings.length > 0) {
      kavlings.forEach(k => {
        if (!k.polygon || !k.polygon.geometry) return;
        const geom = k.polygon.geometry;
        const geoms = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
        
        geoms.forEach((polyCoords: any[]) => {
          const exterior = polyCoords[0];
          if (!exterior || exterior.length < 2) return;

          // Process vertices
          exterior.forEach((coords: [number, number]) => {
            const vPt = map.latLngToContainerPoint([coords[1], coords[0]]);
            const dx = q.x - vPt.x;
            const dy = q.y - vPt.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < T_VERTEX) {
              if (!bestVertex || dist < bestVertex.dist) {
                bestVertex = { lat: coords[1], lng: coords[0], dist };
              }
            }
          });

          // Process edges (segments)
          for (let i = 0; i < exterior.length - 1; i++) {
            const p1 = exterior[i];
            const p2 = exterior[i+1];
            
            const ptA = map.latLngToContainerPoint([p1[1], p1[0]]);
            const ptB = map.latLngToContainerPoint([p2[1], p2[0]]);

            const abX = ptB.x - ptA.x;
            const abY = ptB.y - ptA.y;
            const aqX = q.x - ptA.x;
            const aqY = q.y - ptA.y;

            const abLenSq = abX * abX + abY * abY;
            if (abLenSq < 0.01) continue;

            let t = (aqX * abX + aqY * abY) / abLenSq;
            t = Math.max(0, Math.min(1, t));

            const projX = ptA.x + t * abX;
            const projY = ptA.y + t * abY;

            const dx = q.x - projX;
            const dy = q.y - projY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < T_EDGE) {
              if (!bestEdge || dist < bestEdge.dist) {
                const snappedLatLng = map.containerPointToLatLng([projX, projY]);
                bestEdge = { lat: snappedLatLng.lat, lng: snappedLatLng.lng, dist };
              }
            }
          }
        });
      });
    }

    // 3. Current boundary non-adjacent segments
    if (points.length >= 3) {
      for (let i = 0; i < points.length; i++) {
        const nextId = (i + 1) % points.length;
        if (i === index || nextId === index) {
          continue;
        }

        const p1 = points[i];
        const p2 = points[nextId];

        const ptA = map.latLngToContainerPoint([p1.lat, p1.lng]);
        const ptB = map.latLngToContainerPoint([p2.lat, p2.lng]);

        const abX = ptB.x - ptA.x;
        const abY = ptB.y - ptA.y;
        const aqX = q.x - ptA.x;
        const aqY = q.y - ptA.y;

        const abLenSq = abX * abX + abY * abY;
        if (abLenSq < 0.01) continue;

        let t = (aqX * abX + aqY * abY) / abLenSq;
        t = Math.max(0, Math.min(1, t));

        const projX = ptA.x + t * abX;
        const projY = ptA.y + t * abY;

        const dx = q.x - projX;
        const dy = q.y - projY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < T_EDGE) {
          if (!bestEdge || dist < bestEdge.dist) {
            const snappedLatLng = map.containerPointToLatLng([projX, projY]);
            bestEdge = { lat: snappedLatLng.lat, lng: snappedLatLng.lng, dist };
          }
        }
      }
    }

    if (bestVertex) {
      return { lat: bestVertex.lat, lng: bestVertex.lng, isSnapped: true, snapType: 'vertex' as const };
    }
    if (bestEdge) {
      return { lat: bestEdge.lat, lng: bestEdge.lng, isSnapped: true, snapType: 'edge' as const };
    }

    return { lat, lng, isSnapped: false, snapType: null };
  };

  const handlePointDrag = (index: number, newLat: number, newLng: number) => {
    // Clamp or ignore invalid values
    const lat = Math.max(-90, Math.min(90, newLat));
    const lng = Math.max(-180, Math.min(180, newLng));
    
    if (dragRaf.current) cancelAnimationFrame(dragRaf.current);
    dragRaf.current = requestAnimationFrame(() => {
      startTransition(() => {
        setPoints(prev => {
          const next = [...prev];
          next[index] = { ...next[index], lat, lng };
          return next;
        });
      });
    });
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualInput.lat);
    const lng = parseFloat(manualInput.lng);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      setPoints(pts => [...pts, { lat, lng, color: DEFAULT_POINT_COLOR }]);
      setManualInput({ lat: '', lng: '' });
      setMapCenter([lat, lng]);
      setSearchResults([]);
      setSearchQuery('');
      setSelectedResultId(null);
    }
  };

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!searchQuery.trim()) {
          setSearchResults([]);
          setIsSearching(false);
          return;
      }

      // Detect if search query is a coordinate (e.g. -8.779214, 115.189608 or (-8,7281430, 115,1732980))
      const coordRegex = /^\s*[\(\[]?\s*(-?\d+[.,]\d+)[,\s]+(-?\d+[.,]\d+)\s*[\)\]]?\s*$/;
      const match = searchQuery.trim().match(coordRegex);

      if (match) {
          const lat = parseFloat(match[1].replace(',', '.'));
          const lon = parseFloat(match[2].replace(',', '.'));
          
          if (!isNaN(lat) && !isNaN(lon)) {
              const coordResult = {
                  place_id: `coord_${lat}_${lon}`,
                  lat: lat.toString(),
                  lon: lon.toString(),
                  display_name: `${lat}, ${lon} (Koordinat)`,
                  address: { name: "Lokasi Koordinat" }
              };
              setSearchResults([coordResult]);
              setMapCenter([lat, lon]);
              setSelectedSearchResult(coordResult);
              setSelectedResultId(coordResult.place_id);
              setSearchResults([]); // Hide list and show detail instead
              return;
          }
      }

      setIsSearching(true);
      try {
          // Tambahkan bounded, countrycodes, namedetails dan polygon_geojson untuk hasil yang lebih akurat dan poligon
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&namedetails=1&countrycodes=id&limit=10&polygon_geojson=1&q=${encodeURIComponent(searchQuery)}`);
          const data = await res.json();
          if (Array.isArray(data)) {
              setSearchResults(data);
          }
      } catch (err) {
          console.error("Search failed", err);
      } finally {
          setIsSearching(false);
      }
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
        handleSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [handleSearch]);

  const estimateNJOP = (addressText: string): string => {
    if (!addressText) return "";
    const addr = addressText.toLowerCase();

    // Area prime tourism
    if (addr.match(/(canggu|seminyak|berawa|uluwatu|kuta|legian|tuban|pecatu|ungasan|nusa dua|jimbaran bay)/)) {
        return "± Rp 3.000.000 – 15.000.000+/m² (Area Prime Tourism)";
    }
    // Lokasi premium Denpasar
    if (addr.match(/(renon|sanur|denpasar m|denpasar p|denpasar s|denpasar t)/) || addr.match(/denpasar(?!.*(barat|utara))/)) {
        return "± Rp 2.000.000 – 10.000.000+/m² (Lokasi Premium Denpasar)";
    }
    // Area Badung pinggiran
    if (addr.match(/(mengwi|jimbaran|sempidi|dalung|kerobokan|abiansemal)/)) {
        return "± Rp 1.000.000 – 5.000.000/m² (Area Badung Pinggiran)";
    }
    // Area berkembang
    if (addr.match(/(gianyar|klungkung|ubud|kediri|denpasar barat|denpasar utara)/)) {
        return "± Rp 500.000 – 3.000.000/m² (Area Berkembang)";
    }
    // Area pedesaan / luar pusat wisata
    if (addr.match(/(tabanan|buleleng|jembrana|singaraja|negara|karangasem|bangli|payangan|tegallalang)/)) {
        return "± Rp 100.000 – 1.500.000/m² (Area Pedesaan / Luar Pusat Wisata)";
    }
    // Fallback Bali
    if (addr.match(/bali/)) {
        return "Menunggu klasifikasi NJOP spesifik (Hanya estimasi dasar tersedia)";
    }
    return "Estimasi NJOP di luar area Bali belum tersedia.";
  };

  useEffect(() => {
    if (points.length === 0 || isDrawing || isEditMode) {
        if (points.length === 0) setNjopEstimate('');
        return;
    }
    
    // Debounce to fetch only when points are stable
    const timer = setTimeout(async () => {
        try {
            const locLat = points[0].lat;
            const locLng = points[0].lng;
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${locLat}&lon=${locLng}&zoom=14&addressdetails=1&accept-language=id`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.display_name) {
                    const estimate = estimateNJOP(data.display_name);
                    setNjopEstimate(estimate);
                }
            }
        } catch (err) {
            console.error("Failed to estimate NJOP", err);
        }
    }, 2000);
    return () => clearTimeout(timer);
  }, [points, isDrawing, isEditMode]);

  useEffect(() => {
    if (points.length < 3 || isDrawing || isEditMode) {
        if (points.length === 0) {
            setElevationProfile([]);
            setElevationStats(null);
        }
        return;
    }

    const timer = setTimeout(async () => {
        setIsFetchingElevation(true);
        try {
            // Sampling up to 50 points along the perimeter to avoid massive URL
            const pts = [...points, points[0]]; // close polygon
            const lats = [];
            const lngs = [];
            
            // Simple sub-sampling strategy for elevation profile
            const maxSamples = 30;
            const step = Math.max(1, Math.floor(pts.length / maxSamples));
            
            let currentDist = 0;
            const profile = [];

            for (let i = 0; i < pts.length; i += step) {
                lats.push(pts[i].lat);
                lngs.push(pts[i].lng);
            }

            const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("Elevation API Error");
            const data = await res.json();
            
            if (data && data.elevation) {
                let min = Infinity;
                let max = -Infinity;
                
                data.elevation.forEach((el: number, i: number) => {
                    min = Math.min(min, el);
                    max = Math.max(max, el);
                    
                    if (i > 0) {
                        currentDist += mapInstanceRef.current?.distance([lats[i-1], lngs[i-1]], [lats[i], lngs[i]]) || 0;
                    }
                    
                    profile.push({
                        distance: currentDist,
                        elevation: el
                    });
                });
                
                setElevationProfile(profile);
                setElevationStats({ min, max, diff: max - min });
            }
        } catch (err) {
            console.error(err);
            setElevationProfile([]);
            setElevationStats(null);
        } finally {
            setIsFetchingElevation(false);
        }
    }, 2500);

    return () => clearTimeout(timer);
  }, [points, isDrawing, isEditMode]);

  // Nav Handlers
  const handleGenerateKavling = (closeModal: boolean = false, overrideAreas: Record<string, number> | null = null) => {
      const areasToPass = overrideAreas !== null ? overrideAreas : (Object.keys(kavlingOverrides).length > 0 ? kavlingOverrides : {});
      
      const k = subdividePolygon(
          points, 
          kavlingSettings.roadWidth, 
          kavlingSettings.minArea, 
          kavlingSettings.minFront, 
          kavlingSettings.entryEdgeIndex, 
          kavlingSettings.exitEdgeIndex, 
          kavlingSettings.layoutType,
          kavlingSettings.enableCulDeSac,
          kavlingSettings.cornerChamfer,
          kavlingSettings.maxDepth,
          kavlingSettings.setbackGSB,
          kavlingSettings.optMode,
          kavlingSettings.secondEntryEdgeIndex,
          areasToPass
      );
      setKavlings(k);
      setShowKavlings(true);
      
      if (overrideAreas === null && Object.keys(kavlingOverrides).length === 0) {
         const newAreas: Record<string, number> = {};
         const numLotsMap: Record<string, number> = {};
         k.forEach(lot => {
             if (lot.type !== 'road') {
                 newAreas[lot.id] = lot.area;
                 const prefix = lot.id.split('-')[0];
                 numLotsMap[prefix] = (numLotsMap[prefix] || 0) + 1;
             }
         });
         Object.keys(numLotsMap).forEach(prefix => {
             newAreas[`${prefix}-numLots`] = numLotsMap[prefix];
         });
         setKavlingOverrides(newAreas);
      }
      
      if (closeModal && activeModal === 'kavling') setActiveModal('none');
  };

  const handleAreaChange = (id: string, newArea: number) => {
      if (kavlings.length === 0) return;
      const prefix = id.split('-')[0];
      const index = parseInt(id.split('-')[1]);
      
      const nextAreas = { ...kavlingOverrides };
      const oldArea = nextAreas[id] || 0;
      const diff = newArea - oldArea;
      
      nextAreas[id] = newArea;
      
      let siblingId = `${prefix}-${index + 1}`;
      if (nextAreas[siblingId] === undefined) {
          siblingId = `${prefix}-${index - 1}`;
      }
      
      if (nextAreas[siblingId] !== undefined) {
          nextAreas[siblingId] = Math.max(1, nextAreas[siblingId] - diff);
      }
      
      setKavlingOverrides(nextAreas);
      handleGenerateKavling(false, nextAreas);
  };

  const handleGenerateSlopeHeatmap = async () => {
    if (points.length < 3) return;
    setIsFetchingSlope(true);
    setSlopeGridData([]);
    
    try {
        const coords = points.map(p => [p.lng, p.lat]);
        coords.push([...coords[0]]); // close ring
        const poly = turf.polygon([coords]);
        const bbox = turf.bbox(poly);
        
        // Let's use 8x8 grid to keep points below 100
        const cols = 8;
        const rows = 8;
        const dx = (bbox[2] - bbox[0]) / cols;
        const dy = (bbox[3] - bbox[1]) / rows;
        
        const lats: number[] = [];
        const lngs: number[] = [];
        const gridCells: any[] = [];
        
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                const minX = bbox[0] + i * dx;
                const maxX = minX + dx;
                const minY = bbox[1] + j * dy;
                const maxY = minY + dy;
                
                const cellPoly = turf.polygon([[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]]);
                const intersect = turf.intersect(turf.featureCollection([cellPoly, poly]));
                
                if (intersect) {
                    const center = turf.center(intersect);
                    const centerLat = center.geometry.coordinates[1];
                    const centerLng = center.geometry.coordinates[0];
                    lats.push(centerLat);
                    lngs.push(centerLng);
                    gridCells.push({
                        poly: intersect, // Keep intersection for rendering precise heatmap
                        i, j,
                        lat: centerLat,
                        lng: centerLng,
                        elevation: 0,
                        slope: 0
                    });
                }
            }
        }

        if (lats.length === 0) throw new Error("No grid cells generated");
        // Open-Meteo accepts up to 100 points
        if (lats.length > 100) {
            // Failsafe trimming
            lats.splice(100);
            lngs.splice(100);
            gridCells.splice(100);
        }

        const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Elevation API error");
        const data = await res.json();
        
        if (data && data.elevation) {
            gridCells.forEach((cell, idx) => {
                cell.elevation = data.elevation[idx];
            });
            
            const p1 = turf.point([bbox[0], bbox[1]]);
            const p2 = turf.point([bbox[0] + dx, bbox[1]]);
            const distanceX = turf.distance(p1, p2) * 1000; // meters
            
            const p3 = turf.point([bbox[0], bbox[1] + dy]);
            const distanceY = turf.distance(p1, p3) * 1000;
            
            gridCells.forEach(cell => {
                const rightCell = gridCells.find(c => c.i === cell.i + 1 && c.j === cell.j);
                const topCell = gridCells.find(c => c.i === cell.i && c.j === cell.j + 1);
                
                let dzdx = 0;
                let dzdy = 0;
                
                if (rightCell) {
                    dzdx = (rightCell.elevation - cell.elevation) / distanceX;
                }
                if (topCell) {
                    dzdy = (topCell.elevation - cell.elevation) / distanceY;
                }
                
                cell.slope = Math.sqrt(dzdx*dzdx + dzdy*dzdy) * 100;
            });
            
            setSlopeGridData(gridCells);
            setShowSlopeHeatmap(true);
        }
    } catch (err) {
        console.error("Slope generation failed:", err);
        setSlopeGridData([]);
        setShowSlopeHeatmap(false);
    } finally {
        setIsFetchingSlope(false);
    }
  };

  const handleExport = async () => {
    if (!mapInstanceRef.current) {
        alert("Map instance not ready");
        return;
    }
    setIsExporting(true);
    
    // Give time for UI controls to hide and map tiles to be fully ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
        let locName = "Custom Location";
        try {
            const locLat = points.length > 0 ? points[0].lat : (selectedSearchResult ? selectedSearchResult.lat : (mapCenter ? mapCenter[0] : null));
            const locLng = points.length > 0 ? points[0].lng : (selectedSearchResult ? selectedSearchResult.lon : (mapCenter ? mapCenter[1] : null));
            
            if (locLat && locLng) {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${locLat}&lon=${locLng}&zoom=14&addressdetails=1&accept-language=id`);
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.address) {
                        const village = data.address.village || data.address.suburb || data.address.town || "";
                        const district = data.address.city_district || data.address.county || data.address.municipality || data.address.city || "";
                        
                        let formattedName = "";
                        if (village && district && village !== district) {
                            formattedName = `${village}, ${district}`;
                        } else if (village) {
                            formattedName = village;
                        } else if (district) {
                            formattedName = district;
                        }
                        
                        if (formattedName) {
                            locName = formattedName;
                        }
                    } else if (data && data.display_name) {
                        const parts = data.display_name.split(',');
                        locName = parts.slice(0, 2).map((p: string) => p.trim()).join(', ');
                    }
                }
            }
        } catch (e) {
            console.warn("Reverse geocoding failed", e);
        }
        
        if (locName === "Custom Location") {
            if (selectedSearchResult && selectedSearchResult.display_name) {
                const parts = selectedSearchResult.display_name.split(',');
                locName = parts.slice(0, 2).map((p: string) => p.trim()).join(', ');
            } else if (searchQuery) {
                locName = searchQuery;
            } else if (points.length > 0) {
                locName = "Area based on points";
            }
        }

        // Generate PDF
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 15;

        // Format datetime once
        const readableDate = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(new Date());
        const projectRef = exportNIB ? `NIB-${exportNIB}` : `GEO-${Date.now().toString().slice(-6)}`;

        const drawHeader = (pageNum: number) => {
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(22);
            pdf.setTextColor(26, 26, 26);
            pdf.text("Calcuare Surveyor Report", margin, 22);
            
            pdf.setLineWidth(0.5);
            pdf.setDrawColor(200, 200, 200);
            pdf.line(margin, 26, pdfWidth - margin, 26);
            
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(9);
            pdf.setTextColor(100);
            pdf.text(`Generated: ${readableDate}`, margin, 32);
            pdf.text(`Project Ref: ${projectRef}`, pdfWidth - margin, 32, { align: "right" });
            pdf.text(`Page ${pageNum}`, pdfWidth / 2, pdfHeight - 10, { align: "center" });
        };

        const drawFooter = () => {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(8);
            pdf.setTextColor(150);
            pdf.text(`Prepared by ${exportSurveyor || "Rifky Rangga"}`, margin, pdfHeight - 10);
        };

        // --- PAGE 1: GEOMETRY SKETCH ---
        drawHeader(1);
        
        // PROJECT SUMMARY (NEW)
        let summaryY = 42;
        
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(26, 26, 26);
        pdf.text("Project Summary", margin, summaryY);
        
        summaryY += 6;
        pdf.setFontSize(9);
        
        const drawGridRow = (label: string, val: string, yPos: number) => {
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(100, 100, 100);
            pdf.text(label, margin, yPos);
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(30, 30, 30);
            
            const splitVal = pdf.splitTextToSize(val, pdfWidth - margin - 50);
            pdf.text(splitVal, margin + 40, yPos);
            return splitVal.length * 4.5;
        };
        
        summaryY += drawGridRow("Client / Owner:", exportClientName || "-", summaryY);
        if (exportNIB) summaryY += drawGridRow("NIB / Cert:", exportNIB, summaryY);
        summaryY += drawGridRow("Location:", locName, summaryY);
        if (exportNotes) summaryY += drawGridRow("Field Notes:", exportNotes, summaryY);
        
        summaryY += 4;
        
        const sketchY = summaryY + 8;
        const boxWidth = pdfWidth - (margin * 2);
        const boxHeight = pdfHeight - sketchY - 25; 
        
        // Draw border around the sketch area
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.3);
        pdf.rect(margin, sketchY, boxWidth, boxHeight);
        
        pdf.setFontSize(10);
        pdf.setTextColor(150);
        pdf.text("SKETSA AREA (TIDAK BERSKALA TEPAT)", margin + 5, sketchY + 8);
        
        if (points.length > 1) {
            // Calculate scale and translation
            const lats = points.map(p => p.lat);
            const lngs = points.map(p => p.lng);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);
            
            const latDiff = maxLat - minLat || 0.00001;
            const lngDiff = maxLng - minLng || 0.00001;
            
            // padding inside the box
            const pad = 20;
            const drawBoxW = boxWidth - 2*pad;
            const drawBoxH = boxHeight - 2*pad;
            
            // Turf distance for aspect ratio preservation (meters per lat/lng degree roughly)
            const meterPerLat = 111320;
            const meterPerLng = 40075000 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180) / 360;
            
            const realWidthMeters = lngDiff * meterPerLng;
            const realHeightMeters = latDiff * meterPerLat;
            
            const scaleX = drawBoxW / realWidthMeters;
            const scaleY = drawBoxH / realHeightMeters;
            const scale = Math.min(scaleX, scaleY); // uniform scale
            
            const scaledW = realWidthMeters * scale;
            const scaledH = realHeightMeters * scale;
            
            // center offsets
            const cx = margin + pad + (drawBoxW - scaledW) / 2;
            const cy = sketchY + pad + (drawBoxH - scaledH) / 2;
            
            const getX = (lng: number) => cx + ((lng - minLng) * meterPerLng * scale);
            const getY = (lat: number) => cy + scaledH - ((lat - minLat) * meterPerLat * scale); // inverse Y for canvas
            
            // Draw Edges (polygon or path)
            pdf.setDrawColor(0, 102, 204);
            pdf.setLineWidth(0.6);
            for (let i = 0; i < points.length; i++) {
                const p1 = points[i];
                // if closing polygon
                if (i === points.length - 1 && points.length > 2) {
                    const p2 = points[0];
                    pdf.line(getX(p1.lng), getY(p1.lat), getX(p2.lng), getY(p2.lat));
                } else if (i < points.length - 1) {
                    const p2 = points[i+1];
                    pdf.line(getX(p1.lng), getY(p1.lat), getX(p2.lng), getY(p2.lat));
                }
            }
            
            // Draw Kavlings in Sketch
            if (showKavlings && kavlings && kavlings.length > 0) {
                pdf.setLineWidth(0.3);
                kavlings.forEach(k => {
                    const isRoad = k.type === 'road';
                    const isRemnant = k.type === 'remnant';
                    pdf.setDrawColor(150, 150, 150);
                    
                    const geoms = k.polygon.geometry.type === 'MultiPolygon' ? k.polygon.geometry.coordinates : [k.polygon.geometry.coordinates];
                    geoms.forEach((polyCoords: any[]) => {
                        const exterior = polyCoords[0];
                        // draw polygon lines
                        for (let i = 0; i < exterior.length - 1; i++) {
                            const p1 = exterior[i];
                            const p2 = exterior[i+1];
                            pdf.line(getX(p1[0]), getY(p1[1]), getX(p2[0]), getY(p2[1]));
                        }
                    });
                    
                    if (!isRoad && k.center) {
                        pdf.setFontSize(6);
                        pdf.setTextColor(150, 150, 150);
                        const txtArea = `${Math.round(k.area)} m2`;
                        const txtDim = `${k.widthStr}m x ${k.depthStr}m`;
                        pdf.text(txtArea, getX(k.center[0]), getY(k.center[1]) - 1, { align: "center" });
                        pdf.text(txtDim, getX(k.center[0]), getY(k.center[1]) + 2, { align: "center" });
                    }
                });
            }
            
            // Draw Edge Distances
            if (stats.edges && stats.edges.length > 0) {
                pdf.setFontSize(8);
                pdf.setTextColor(80, 80, 80);
                
                for (let i = 0; i < stats.edges.length; i++) {
                    const edge = stats.edges[i];
                    // we need to place text at midpoint
                    const ex = getX(edge.midpoint.lng);
                    const ey = getY(edge.midpoint.lat);
                    
                    // Simple white background for text (simulated with standard text for now)
                    // We'll just draw the text offset slightly
                    const distText = `${edge.distance.toFixed(1)}m`;
                    const tW = pdf.getTextWidth(distText);
                    pdf.setFillColor(255, 255, 255);
                    pdf.rect(ex - tW/2 - 1, ey - 3.5, tW + 2, 5, 'F');
                    pdf.text(distText, ex, ey, { align: "center" });
                }
            }
            
            // Draw Points
            pdf.setFontSize(9);
            pdf.setFont("helvetica", "bold");
            const usedPos: {x:number, y:number}[] = [];
            
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const x = getX(p.lng);
                const y = getY(p.lat);
                
                pdf.setFillColor(255, 100, 100);
                pdf.setDrawColor(200, 0, 0);
                pdf.circle(x, y, 1.5, 'FD');
                
                // collision-avoidant label
                let ly = y - 3;
                pdf.setTextColor(200, 0, 0);
                pdf.text(`P${i+1}`, x, ly, { align: "center" });
            }
        }
        
        drawFooter();

        // --- PAGE 2: DATA & METRICS ---
        pdf.addPage();
        let currentPage = 2;
        drawHeader(currentPage);

        const availableWidth = pdfWidth - (margin * 2);

        // Draw Location Details Header
        let currentY = 45;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(14);
        pdf.setTextColor(26, 26, 26);
        pdf.text("LOCATION DETAILS", margin, currentY);
        
        currentY += 4;
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, currentY, margin + availableWidth, currentY);
        currentY += 10;
        
        // Location Content
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(50, 50, 50);
        pdf.text(`Location Name:`, margin, currentY);
        pdf.setFont("helvetica", "normal");
        
        const splitName = pdf.splitTextToSize(locName, availableWidth - 45);
        pdf.text(splitName, margin + 45, currentY);
        currentY += (splitName.length * 6);
        currentY += 2;
        
        pdf.setFont("helvetica", "bold");
        pdf.text(`Google Maps:`, margin, currentY);
        pdf.setFont("helvetica", "normal");
        
        let mapLink = "";
        if (points.length > 0) {
            mapLink = `https://www.google.com/maps?q=${points[0].lat},${points[0].lng}`;
        } else if (selectedSearchResult) {
            mapLink = `https://www.google.com/maps?q=${selectedSearchResult.lat},${selectedSearchResult.lon}`;
        } else if (mapCenter) {
            mapLink = `https://www.google.com/maps?q=${mapCenter[0]},${mapCenter[1]}`;
        }
        
        if (mapLink) {
            pdf.setTextColor(0, 102, 204);
            pdf.textWithLink("View on Google Maps", margin + 45, currentY, { url: mapLink });
            pdf.setTextColor(50, 50, 50); // reset color
        } else {
            pdf.text("-", margin + 45, currentY);
        }
        
        currentY += 15;

        // Draw Metrics Header
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(14);
        pdf.setTextColor(26, 26, 26);
        pdf.text("GEOSPATIAL METRICS", margin, currentY);
        
        currentY += 4;
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, currentY, margin + availableWidth, currentY);
        currentY += 10;
        
        // Metrics Content
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.setTextColor(50, 50, 50);
        
        pdf.text(`Total Area:`, margin, currentY);
        let areaText = "";
        if (areaUnit === 'are') {
            areaText = `${stats.areaAre.toFixed(arePrecision)} are / ${stats.areaSqMeters.toFixed(areaPrecision)} m2 (${stats.areaHectares.toFixed(areaPrecision)} ha)`;
        } else if (areaUnit === 'ha') {
            areaText = `${stats.areaHectares.toFixed(areaPrecision)} ha / ${stats.areaSqMeters.toFixed(areaPrecision)} m2 (${stats.areaAre.toFixed(arePrecision)} are)`;
        } else {
            areaText = `${stats.areaSqMeters.toFixed(areaPrecision)} m2 / ${stats.areaAre.toFixed(arePrecision)} are (${stats.areaHectares.toFixed(areaPrecision)} ha)`;
        }
        pdf.text(areaText, margin + 45, currentY);
        currentY += 8;

        pdf.text(`Total Perimeter:`, margin, currentY);
        pdf.text(`${stats.perimeter.toFixed(2)} m`, margin + 45, currentY);
        currentY += 8;
        
        if (stats.length > 0) {
            pdf.text(`Max Dimensions:`, margin, currentY);
            pdf.text(`${stats.length.toFixed(2)} m (L) x ${stats.width.toFixed(2)} m (W)`, margin + 45, currentY);
            currentY += 8;
        }
        
        if (pricePerUnit && pricePerUnit > 0) {
            pdf.text(`Estimated Value:`, margin, currentY);
            const refArea = areaUnit === 'are' ? stats.areaAre : (areaUnit === 'ha' ? stats.areaHectares : stats.areaSqMeters);
            const totalValue = refArea * pricePerUnit;
            const formattedValue = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(totalValue);
            const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(pricePerUnit);
            pdf.text(`${formattedValue} (at ${formattedPrice} per ${areaUnit === 'are' ? 'are' : areaUnit === 'ha' ? 'ha' : 'm²'})`, margin + 45, currentY);
            currentY += 8;
        }

        if (kavlings && kavlings.length > 0) {
            pdf.text(`Subdivision (Kavling):`, margin, currentY);
            const totalPlots = kavlings.filter(k => k.type !== 'road').length;
            const roadArea = kavlings.filter(k => k.type === 'road').reduce((sum, k) => sum + (k.area || 0), 0);
            const plotArea = kavlings.filter(k => k.type !== 'road').reduce((sum, k) => sum + (k.area || 0), 0);
            pdf.text(`${totalPlots} Plots (${Math.round(plotArea)} m2) + Road/Fasum (${Math.round(roadArea)} m2)`, margin + 45, currentY);
            currentY += 8;
        }
        
        // Columns for Coordinates and Edges
        currentY += 10;
        const colStart1 = margin;
        const colStart2 = margin + (availableWidth / 2) + 5;
        
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(26, 26, 26);
        pdf.text("BOUNDARY COORDINATES", colStart1, currentY);
        if (stats.edges && stats.edges.length > 0) {
            pdf.text("EDGE MEASUREMENTS", colStart2, currentY);
        }
        
        currentY += 4;
        pdf.line(colStart1, currentY, colStart1 + (availableWidth / 2) - 5, currentY);
        if (stats.edges && stats.edges.length > 0) {
            pdf.line(colStart2, currentY, colStart2 + (availableWidth / 2) - 5, currentY);
        }
        currentY += 7;
        
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(50, 50, 50);
        
        const listStartY = currentY;
        let coordY = currentY;
        
        // Draw Coordinates in Left Column
        points.forEach((p, idx) => {
            if (coordY > pdfHeight - 25) { 
                drawFooter();
                pdf.addPage();
                currentPage++;
                drawHeader(currentPage);
                coordY = 45; 
            }
            // Draw color indicator
            const colorRgb = hexToRgb(p.color || DEFAULT_POINT_COLOR);
            if (colorRgb) {
                pdf.setFillColor(colorRgb.r, colorRgb.g, colorRgb.b);
                pdf.rect(colStart1, coordY - 3, 2, 2, 'F');
            }
            pdf.text(`P${String(idx + 1).padStart(2,'0')}: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`, colStart1 + 4, coordY);
            coordY += 4;
            
            try {
                const utmCoords = utm.fromLatLon(p.lat, p.lng);
                pdf.setFontSize(7);
                pdf.setTextColor(120, 120, 120);
                // Print UTM Zone + Easting/Northing
                pdf.text(`UTM ${utmCoords.zoneNum}${utmCoords.zoneLetter}: ${utmCoords.easting.toFixed(2)}E, ${utmCoords.northing.toFixed(2)}N`, colStart1 + 4, coordY);
            } catch (e) {
                // Ignore if conversion fails
            }
            
            // Reset for next point
            pdf.setFontSize(9);
            pdf.setTextColor(50, 50, 50);
            coordY += 7;
        });
        
        // Reset Y and Draw Edges in Right Column (starting from the same Top Y as coords on page 2)
        let edgeY = listStartY;
        // Note: For simplicity, if edges overflow Page 2, they will just follow the coord-page breaking or overlap.
        // Given the scale, it's unlikely to have 100+ points often.
        if (stats.edges && stats.edges.length > 0) {
            stats.edges.forEach((e: any, idx: number) => {
                if (edgeY > pdfHeight - 25) { 
                    // This is tricky if coords and edges break differently. 
                    // For now, let's just make sure we don't draw off page.
                    // If we have hundreds of points, we'd need a more robust grid system.
                }
                const nextIdx = (idx + 1) === points.length ? 0 : idx + 1;
                pdf.text(`P${idx+1} -> P${nextIdx+1}: ${e.distance.toFixed(2)} m`, colStart2, edgeY);
                edgeY += 6;
            });
        }
        
        drawFooter();
        
        pdf.save(`Calcare_Report_${Date.now()}.pdf`);
        setActiveModal('none');
    } catch (err) {
        console.error("PDF generation failed:", err);
        alert(`PDF generation failed:\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setIsExporting(false);
    }
  };

  const handleBatchExportPDF = async () => {
    if (batchSelectedIds.length === 0) return;
    setIsExporting(true);

    try {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 15;

        // Format datetime once
        const readableDate = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(new Date());

        const selectedProjects = savedProjects.filter(p => batchSelectedIds.includes(p.id));

        for (let idx = 0; idx < selectedProjects.length; idx++) {
            const proj = selectedProjects[idx];
            if (idx > 0) pdf.addPage();

            const projectRef = `Batch-${proj.id.slice(-6)}`;

            const drawHeader = (pageNum: number) => {
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(22);
                pdf.setTextColor(26, 26, 26);
                pdf.text("Calcuare Surveyor Report", margin, 22);
                
                pdf.setLineWidth(0.5);
                pdf.setDrawColor(200, 200, 200);
                pdf.line(margin, 26, pdfWidth - margin, 26);
                
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(9);
                pdf.setTextColor(100);
                pdf.text(`Generated: ${readableDate}`, margin, 32);
                pdf.text(`Project Ref: ${projectRef}`, pdfWidth - margin, 32, { align: "right" });
                pdf.text(`Page ${pageNum}`, pdfWidth / 2, pdfHeight - 10, { align: "center" });
            };

            const drawFooter = () => {
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(8);
                pdf.setTextColor(150);
                pdf.text(`Prepared by ${exportSurveyor || "Rifky Rangga"}`, margin, pdfHeight - 10);
            };

            drawHeader(1);
            
            let summaryY = 42;
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(11);
            pdf.setTextColor(26, 26, 26);
            pdf.text("Project Summary", margin, summaryY);
            
            summaryY += 6;
            pdf.setFontSize(9);
            
            const drawGridRow = (label: string, val: string, yPos: number) => {
                pdf.setFont("helvetica", "bold");
                pdf.setTextColor(100, 100, 100);
                pdf.text(label, margin, yPos);
                pdf.setFont("helvetica", "normal");
                pdf.setTextColor(30, 30, 30);
                
                const splitVal = pdf.splitTextToSize(val, pdfWidth - margin - 50);
                pdf.text(splitVal, margin + 40, yPos);
                return splitVal.length * 4.5;
            };
            
            summaryY += drawGridRow("Project Name:", proj.name || "-", summaryY);
            summaryY += drawGridRow("Client / Owner:", exportClientName || "-", summaryY);
            if (exportNIB) summaryY += drawGridRow("NIB / Cert:", exportNIB, summaryY);
            if (exportNotes) summaryY += drawGridRow("Field Notes:", exportNotes, summaryY);
            
            summaryY += 4;
            
            const sketchY = summaryY + 8;
            const boxWidth = pdfWidth - (margin * 2);
            const boxHeight = pdfHeight - sketchY - 25; 
            
            // Draw border 
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.3);
            pdf.rect(margin, sketchY, boxWidth, boxHeight);
            
            pdf.setFontSize(10);
            pdf.setTextColor(150);
            pdf.text("SKETSA AREA (TIDAK BERSKALA TEPAT)", margin + 5, sketchY + 8);
            
            const pPoints = proj.points || [];
            if (pPoints.length > 1) {
                const lats = pPoints.map((p: any) => p.lat);
                const lngs = pPoints.map((p: any) => p.lng);
                const minLat = Math.min(...lats);
                const maxLat = Math.max(...lats);
                const minLng = Math.min(...lngs);
                const maxLng = Math.max(...lngs);
                
                const latDiff = maxLat - minLat || 0.00001;
                const lngDiff = maxLng - minLng || 0.00001;
                
                const pad = 20;
                const drawBoxW = boxWidth - 2*pad;
                const drawBoxH = boxHeight - 2*pad;
                
                const meterPerLat = 111320;
                const meterPerLng = 40075000 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180) / 360;
                
                const realWidthMeters = lngDiff * meterPerLng;
                const realHeightMeters = latDiff * meterPerLat;
                
                const scaleX = drawBoxW / realWidthMeters;
                const scaleY = drawBoxH / realHeightMeters;
                const scale = Math.min(scaleX, scaleY); 
                
                const scaledW = realWidthMeters * scale;
                const scaledH = realHeightMeters * scale;
                
                const cx = margin + pad + (drawBoxW - scaledW) / 2;
                const cy = sketchY + pad + (drawBoxH - scaledH) / 2;
                
                const getX = (lng: number) => cx + ((lng - minLng) * meterPerLng * scale);
                const getY = (lat: number) => cy + scaledH - ((lat - minLat) * meterPerLat * scale); 
                
                pdf.setDrawColor(0, 102, 204);
                pdf.setLineWidth(0.6);
                for (let i = 0; i < pPoints.length; i++) {
                    const p1 = pPoints[i];
                    if (i === pPoints.length - 1 && pPoints.length > 2) {
                        const p2 = pPoints[0];
                        pdf.line(getX(p1.lng), getY(p1.lat), getX(p2.lng), getY(p2.lat));
                    } else if (i < pPoints.length - 1) {
                        const p2 = pPoints[i+1];
                        pdf.line(getX(p1.lng), getY(p1.lat), getX(p2.lng), getY(p2.lat));
                    }
                }
                
                pdf.setFontSize(8);
                const statText = `Area: ${proj.areaSqMeters.toFixed(2)} m2 | Perimeter: ${proj.perimeter.toFixed(2)} m`;
                pdf.text(statText, margin + boxWidth / 2, sketchY + boxHeight - 5, { align: "center" });
            }
            drawFooter();
        }

        pdf.save(`Batch_Report_GEO-${Date.now().toString().slice(-6)}.pdf`);
    } catch (e) {
        console.error(e);
        alert("Failed to generate batch export");
    } finally {
        setIsExporting(false);
    }
  };

  const handleExportGeoJSON = () => {
    if (points.length < 3) return;
    
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            name: newProjectName || "Calcare Survey",
            areaAre: stats.areaAre,
            areaHectares: stats.areaHectares,
            areaSqMeters: stats.areaSqMeters,
            perimeter: stats.perimeter,
            length: stats.length,
            width: stats.width,
            exportedAt: new Date().toISOString()
          },
          geometry: {
            type: "Polygon",
            coordinates: [[...points.map(p => [p.lng, p.lat]), [points[0].lng, points[0].lat]]]
          }
        }
      ]
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `calcare_survey_${new Date().getTime()}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
    setActiveModal('none');
  };

  const handleExportCSV = () => {
     if (points.length === 0) return;
     
     let csvContent = "";
     // Header
     csvContent += "Point,Latitude,Longitude,Color\n";
     points.forEach((p, idx) => {
       csvContent += `${idx + 1},${p.lat},${p.lng},${p.color || DEFAULT_POINT_COLOR}\n`;
     });

     if (kavlings && kavlings.length > 0) {
         csvContent += "\n\n--- AUTO KAVLINGS ---\n";
         csvContent += "Label,Type,Area(m2)\n";
         kavlings.forEach(k => {
             csvContent += `${k.label || k.id},${k.type},${k.area ? Math.round(k.area) : 0}\n`;
         });
     }

     if (slopeGridData && slopeGridData.length > 0) {
         csvContent += "\n\n--- SLOPE DATA ---\n";
         csvContent += "GridX,GridY,Latitude,Longitude,Elevation(m),Slope(%)\n";
         slopeGridData.forEach(cell => {
             csvContent += `${cell.i},${cell.j},${cell.lat.toFixed(6)},${cell.lng.toFixed(6)},${cell.elevation ? cell.elevation.toFixed(2) : 0},${cell.slope ? cell.slope.toFixed(2) : 0}\n`;
         });
     }

     const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
     const url = URL.createObjectURL(blob);
     const link = document.createElement("a");
     link.href = url;
     link.download = `calcare_data_${new Date().getTime()}.csv`;
     link.click();
     URL.revokeObjectURL(url);
     setActiveModal('none');
  };

  const handleExportDXF = () => {
     if (points.length < 3) return;
     try {
       const d = new Drawing();
       d.setUnits('Meters');
       d.addLayer('boundary', Drawing.ACI.GREEN, 'CONTINUOUS');
       d.setActiveLayer('boundary');

       const dxfPoints = points.map(p => {
         const coords = utm.fromLatLon(p.lat, p.lng);
         return [coords.easting, coords.northing] as [number, number];
       });

       d.drawPolyline(dxfPoints, true);

       if (kavlings && kavlings.length > 0) {
           d.addLayer('kavlings', Drawing.ACI.CYAN, 'CONTINUOUS');
           d.setActiveLayer('kavlings');
           let dxKavTextHeight = 1;
           kavlings.forEach((k: any) => {
               const geoms = k.polygon.geometry.type === 'MultiPolygon' ? k.polygon.geometry.coordinates : [k.polygon.geometry.coordinates];
               geoms.forEach((polyCoords: any[]) => {
                    const exterior = polyCoords[0];
                    const kDxfPts = exterior.map((pt: any[]) => {
                        const c = utm.fromLatLon(pt[1], pt[0]);
                        return [c.easting, c.northing] as [number, number];
                    });
                    d.drawPolyline(kDxfPts, true);
                    
                    if (k.type === 'lot' || k.type === 'remnant') {
                        // Calculate bounding box for text height
                        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                        kDxfPts.forEach((p: any) => {
                            if (p[0] < minX) minX = p[0];
                            if (p[0] > maxX) maxX = p[0];
                            if (p[1] < minY) minY = p[1];
                            if (p[1] > maxY) maxY = p[1];
                        });
                        dxKavTextHeight = Math.max(0.5, (maxX - minX) * 0.15);
                    }
               });
               
               if (k.center && k.type !== 'road') {
                   const c = utm.fromLatLon(k.center[1], k.center[0]);
                   d.drawText(c.easting, c.northing + dxKavTextHeight, dxKavTextHeight, 0, k.label, 'center', 'middle');
                   d.drawText(c.easting, c.northing - dxKavTextHeight, dxKavTextHeight * 0.8, 0, `${Math.round(k.area)} m2`, 'center', 'middle');
               }

               if (k.edges) {
                   k.edges.forEach((e: any) => {
                       const mid = utm.fromLatLon(e.mid[1], e.mid[0]);
                       // Convert bearing CSS angle to DXF orientation?
                       // Turf angle was counter-clockwise from easting? DXF rotation is counter-clockwise where 0 is East.
                       // Since we used cssAngle = bearing - 90. 
                       // bearing = 90 (East), DXF = 0.
                       // bearing = 0 (North), DXF = 90.
                       // DXF angle = (90 - bearing + 360) % 360
                       const baseBearing = e.angle + 90; // Since cssAngle = bearing - 90
                       let dxfAngle = 90 - baseBearing;
                       if (dxfAngle < 0) dxfAngle += 360;
                       
                       d.drawText(mid.easting, mid.northing, dxKavTextHeight * 0.6, dxfAngle, `${e.dist.toFixed(1)}m`, 'center', 'middle');
                   });
               }
           });
       }

       const areaText = `${stats.areaSqMeters.toFixed(2)} m2`;
       const centroidEasting = dxfPoints.reduce((sum, p) => sum + p[0], 0) / dxfPoints.length;
       const centroidNorthing = dxfPoints.reduce((sum, p) => sum + p[1], 0) / dxfPoints.length;

       d.addLayer('labels', Drawing.ACI.CYAN, 'CONTINUOUS');
       d.setActiveLayer('labels');
       // Approximate text height
       let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
       dxfPoints.forEach(p => {
         if (p[0] < minX) minX = p[0];
         if (p[0] > maxX) maxX = p[0];
         if (p[1] < minY) minY = p[1];
         if (p[1] > maxY) maxY = p[1];
       });
       const width = maxX - minX;
       const height = maxY - minY;
       const textHeight = Math.max(1, width * 0.05);

       d.drawText(centroidEasting, centroidNorthing, textHeight, 0, areaText, 'center', 'middle');

       // Draw North Arrow
       d.addLayer('north_arrow', Drawing.ACI.RED, 'CONTINUOUS');
       d.setActiveLayer('north_arrow');
       
       const arrowSize = Math.max(2, Math.max(width, height) * 0.08);
       // Place it to the top right of the polygon
       const arrowBaseX = maxX + arrowSize * 1.5;
       const arrowBaseY = maxY;
       
       // Vertical line
       d.drawLine(arrowBaseX, arrowBaseY, arrowBaseX, arrowBaseY + arrowSize);
       // Left wing
       d.drawLine(arrowBaseX - arrowSize * 0.25, arrowBaseY + arrowSize * 0.6, arrowBaseX, arrowBaseY + arrowSize);
       // Right wing
       d.drawLine(arrowBaseX + arrowSize * 0.25, arrowBaseY + arrowSize * 0.6, arrowBaseX, arrowBaseY + arrowSize);
       // Horizontal bottom line of the arrow body to make it look nicer
       d.drawLine(arrowBaseX - arrowSize * 0.1, arrowBaseY, arrowBaseX + arrowSize * 0.1, arrowBaseY);
       
       const nTextHeight = arrowSize * 0.4;
       d.drawText(arrowBaseX, arrowBaseY + arrowSize + nTextHeight * 0.8, nTextHeight, 0, 'N', 'center', 'middle');

       const blob = new Blob([d.toDxfString()], { type: "application/dxf;charset=utf-8;" });
       const url = URL.createObjectURL(blob);
       const link = document.createElement("a");
       link.href = url;
       link.download = `calcare_survey_${new Date().getTime()}.dxf`;
       link.click();
       URL.revokeObjectURL(url);
       setActiveModal('none');
     } catch (e) {
       console.error("Export DXF error:", e);
       alert("Failed to export DXF. Please ensure coordinates are valid.");
     }
  };



  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    
    setIsSyncing(true);

    const newProj = { 
        id: `proj_${Date.now()}`, 
        name: newProjectName, 
        details: projectDetails,
        points, 
        thumbnail: generateThumbnail(points),
        date: new Date().toISOString(),
        areaSqMeters: stats.areaSqMeters,
        perimeter: stats.perimeter,
        unit: areaUnit,
        shared: false
    };
    
    // Local Save
    const updated = [newProj, ...savedProjects];
    setSavedProjects(updated);
    localStorage.setItem('geocalc_projects', JSON.stringify(updated));
    setNewProjectName('');
    setProjectDetails('');
    setCurrentProjectId(newProj.id);
    setActiveModal('none');

    // Google Sheets Sync
    try {
        const response = await fetch("/api/sync-sheets", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(newProj)
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `Sync failed: ${response.statusText}`);
        }
        console.log("Sync request sent via proxy");
    } catch (err: any) {
        console.error("Failed to sync to Google Sheets", err);
        alert(`Gagal sync ke Google Sheets: ${err.message}`);
    }

    setIsSyncing(false);
  };

  const handleSetupSheet = async () => {
    if (!gasUrl.trim()) return;
    setIsSettingUpSheet(true);
    
    try {
        await fetch(gasUrl, {
            method: "POST",
            headers: {
               "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify({ action: "setup" })
        });
        alert("Setup request terkirim! Silakan cek Google Spreadsheet Anda.");
    } catch (err: any) {
        console.error("Failed to setup sheet", err);
        alert(`Setup gagal: ${err.message}`);
    }
    
    setIsSettingUpSheet(false);
  };

  const loadProject = (proj: any) => {
    setPoints(proj.points || []);
    if (proj.kavlings) {
        setKavlings(proj.kavlings);
        setShowKavlings(true);
    } else {
        setKavlings([]);
    }
    if (proj.kavlingOverrides) setKavlingOverrides(proj.kavlingOverrides); else setKavlingOverrides({});
    if (proj.kavlingSettings) setKavlingSettings(proj.kavlingSettings);
    setCurrentProjectId(proj.id);
    setNewProjectName(proj.name || "");
    setProjectDetails(proj.details || "");
    localStorage.setItem('calcare_points_draft', JSON.stringify(proj.points));
    localStorage.setItem('calcare_current_id', String(proj.id));
    setActiveModal('none');
    setSearchResults([]);
    setSearchQuery('');
  };

  const deleteProject = async (id: any) => {
    // Local Delete
    const updated = savedProjects.filter(p => p.id !== id);
    setSavedProjects(updated);
    localStorage.setItem('geocalc_projects', JSON.stringify(updated));
  };

  const handleShareProject = async (proj: any) => {
    setIsSharing(proj.id);
    
    try {
        const encoded = encodeProject(proj);
        const shareUrl = `${window.location.origin}${window.location.pathname}?share=${encoded}`;
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus(prev => ({ ...prev, [proj.id]: true }));
        alert("Link berbagi berhasil disalin!");
        setTimeout(() => {
          setShareStatus(prev => ({ ...prev, [proj.id]: false }));
        }, 3000);
      
      // Update local storage status
      const updatedProjects = savedProjects.map(p => 
        p.id === proj.id ? { ...p, shared: true } : p
      );
      setSavedProjects(updatedProjects);
      localStorage.setItem('geocalc_projects', JSON.stringify(updatedProjects));
      
    } catch (err) {
      console.error("Sharing failed:", err);
      alert("Gagal berbagi proyek.");
    } finally {
      setIsSharing(null);
    }
  };

  const UserLocationManager = () => {
    useEffect(() => {
        if (!("geolocation" in navigator)) return;

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                const newLoc: [number, number] = [latitude, longitude];
                setUserLocation(newLoc);
            },
            (err) => console.warn("Geolocation error:", err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    if (!userLocation) return null;

    const locationIcon = L.divIcon({
        className: 'user-location-marker',
        html: `
            <div class="relative flex items-center justify-center">
                <div class="absolute w-4 h-4 bg-blue-500 rounded-full animate-ping opacity-75"></div>
                <div class="relative w-3 h-3 bg-blue-500 border-2 border-white rounded-full shadow-lg"></div>
            </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    return (
        <Marker position={userLocation} icon={locationIcon} zIndexOffset={2000}>
            <Tooltip direction="top" offset={[0, -10]} className="leaflet-tooltip-transparent">Your Location</Tooltip>
        </Marker>
    );
  };

  // GISTARU Region Codes mapping dictionary
  const RDTR_REGION_CODES: Record<string, string> = {
    "denpasar": "5171000000",
    "badung": "5103000000",
    "gianyar": "5104000000",
    "tabanan": "5102000000",
    "buleleng": "5108000000",
    "karangasem": "5107000000",
    "klungkung": "5105000000",
    "bangli": "5106000000",
    "jembrana": "5101000000"
  };

  const RDTR_REGION_PRESETS = [
    { id: "5171000000", name: "Kota Denpasar", province: "Bali" },
    { id: "5103000000", name: "Kabupaten Badung", province: "Bali" },
    { id: "5104000000", name: "Kabupaten Gianyar", province: "Bali" },
    { id: "5102000000", name: "Kabupaten Tabanan", province: "Bali" },
    { id: "5108000000", name: "Kabupaten Buleleng", province: "Bali" },
    { id: "5107000000", name: "Kabupaten Karangasem", province: "Bali" },
    { id: "5105000000", name: "Kabupaten Klungkung", province: "Bali" },
    { id: "5101000000", name: "Kabupaten Jembrana", province: "Bali" },
    { id: "5106000000", name: "Kabupaten Bangli", province: "Bali" },
    { id: "3171000000", name: "Jakarta Pusat", province: "DKI Jakarta" },
    { id: "3173000000", name: "Jakarta Barat", province: "DKI Jakarta" },
    { id: "3174000000", name: "Jakarta Selatan", province: "DKI Jakarta" },
    { id: "3273000000", name: "Kota Bandung", province: "Jawa Barat" },
    { id: "3578000000", name: "Kota Surabaya", province: "Jawa Timur" }
  ];

  const exportRdtrToPdf = (result: any) => {
    if (!result) return;
    const doc = new jsPDF();
    
    // Header banner with solid deep purple color
    doc.setFillColor(124, 58, 237); // violet-600
    doc.rect(0, 0, 210, 42, "F");
    
    // Title of the report
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("LAPORAN ANALISIS DETAIL TATA RUANG (RDTR)", 15, 18);
    
    // Subtext inside header
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("GEO PORTAL TATA RUANG - DI GENERATE SECARA OTOMATIS", 15, 26);
    doc.text(`WAKTU CETAK: ${new Date().toLocaleString("id-ID")}`, 15, 33);
    
    // Section 1: Lokasi & Koordinat
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("1. INFORMASI KOORDINAT GEOGRAFIS", 15, 55);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Garis Lintang (Latitude)   : ${result.lat.toFixed(6)}`, 20, 64);
    doc.text(`Garis Bujur (Longitude)   : ${result.lng.toFixed(6)}`, 20, 71);
    doc.text(`Kode Referensi Wilayah    : ${result.wilayahId || "5171000000"}`, 20, 78);
    
    // Section 2: Hasil Analisis Tata Ruang
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("2. HASIL ANALISIS ZONASI DETAIL TATA RUANG (RDTR)", 15, 95);
    
    // Draw a colored highlight box for the zone
    const rawColor = result.color || "#db2777";
    let r = 219, g = 39, b = 119; // pink-600
    if (rawColor.startsWith("#")) {
      const hex = rawColor.replace("#", "");
      if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      }
    }
    
    // Colored classification ribbon
    doc.setFillColor(r, g, b);
    doc.rect(15, 101, 180, 10, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`KLASIFIKASI: ${result.zona} [KODE: ${result.kode}]`, 20, 107.5);
    
    // Pola Ruang deskripsi text box
    doc.setTextColor(31, 41, 55);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Deskripsi / Peruntukan Lahan:", 15, 122);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const splitText = doc.splitTextToSize(result.deskripsi || "Tidak ada deskripsi peraturan daerah untuk titik koordinat ini.", 175);
    doc.text(splitText, 15, 129);
    
    // Section 3: Regulasi & Koefisien Bangunan
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("3. PARAMETER INTENSITAS PEMANFAATAN RUANG (REGULASI)", 15, 160);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`- Koefisien Dasar Bangunan Maksimum (KDB)        : ${result.koefisien || "60%"}`, 20, 169);
    doc.text(`- Koefisien Lantai Bangunan Maksimum (KLB)      : ${result.klb || "2.4"}`, 20, 176);
    doc.text(`- Koefisien Dasar Hijau Minimum (KDH)            : ${result.kdh || "30%"}`, 20, 183);
    doc.text(`- Batas Maksimum Ketinggian Bangun               : ${result.ketinggian || "Maksimum 15 Meter / 4 Lantai"}`, 20, 190);
    doc.text(`- Status Kelayakan Tata Ruang Wilayah            : ${result.status || "Sesuai / Layak Dibangun"}`, 20, 197);
    doc.text(`- Rencana / Tujuan Penggunaan Lahan              : ${rdtrTujuanLahan || "-"}`, 20, 204);
    
    // Section 4: Catatan Penting
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("4. CATATAN & DISCLAIMER RESMI", 15, 215);
    
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const disclaimerLines = [
      "1. Hasil laporan adalah indikasi awal berdasarkan data GIS interaktif dan data geospasial ATR/BPN RI.",
      "2. Untuk keperluan legalitas formal IMB / PBG, silakan berkonsultasi langsung ke Dinas Tata Ruang Pemerintah Daerah setempat.",
      "3. Laporan ini sah dicetak secara digital dan tidak memerlukan tanda tangan basah pejabat berwenang."
    ];
    let disclaimerY = 223;
    disclaimerLines.forEach(line => {
      const splitLine = doc.splitTextToSize(line, 175);
      doc.text(splitLine, 15, disclaimerY);
      disclaimerY += 6;
    });
    
    // Save report
    doc.save(`Laporan_RDTR_${result.kode}_${result.lat.toFixed(5)}.pdf`);
  };

  const handleMapClickForRdtr = async (lat: number, lng: number) => {
    setRdtrLoading(true);
    setRdtrResult(null);
    setRdtrClickedPoint({ lat, lng });

    let matchedWilayah = selectedRdtrWilayah; // start with default selection
    
    // Attempt reverse geocoding to auto-guess the county/city region
    try {
      const geoRes = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData && geoData.address && geoData.address.Match_addr) {
          const addr = geoData.address.Match_addr.toLowerCase();
          for (const [name, code] of Object.entries(RDTR_REGION_CODES)) {
            if (addr.includes(name)) {
              matchedWilayah = code;
              setSelectedRdtrWilayah(code); // Update reactive selector too
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error("Auto geocode check failed:", err);
    }

    try {
      const response = await fetch(`/api/rdtr?latitude=${lat}&longitude=${lng}&id_wilayah=${matchedWilayah}`);
      if (!response.ok) {
        throw new Error("Gagal mengambil data dari server");
      }
      
      const data = await response.json();
      
      // Map standard responses beautifully
      const resultObj = {
        lat,
        lng,
        wilayahId: matchedWilayah,
        raw: data,
        timestamp: Date.now(),
        zona: data.zona || data.sub_zona || data.pola_ruang || data.subzona || data.nama_zona || (data.data && (data.data.nama_zona || data.data.sub_zona || data.data.namasubzon)) || "Zona Perumahan (R-4)",
        kode: data.kode || data.kode_sub_zona || (data.data && (data.data.kode_sub_zona || data.data.kdsubz)) || "R-4",
        deskripsi: data.deskripsi || data.keterangan || (data.data && (data.data.keterangan || data.data.fungsi_utama)) || "Zonasi tata ruang yang ditujukan untuk pengembangan pemukiman vertikal dan rumah tapak berkepadatan sedang.",
        color: data.color || data.hex_color || data.warna || (data.data && (data.data.warna || data.data.color)) || "#eab308",
        status: data.status || (data.data && data.data.status) || "Diizinkan bersyarat (Konstruksi Terbatas)",
        koefisien: data.kdb || (data.data && (data.data.kdb || data.data.kdb_maks)) || "60% KDB",
        klb: data.klb || (data.data && data.data.klb) || "1.8 KLB",
        kdh: data.kdh || (data.data && data.data.kdh) || "30% KDH",
        ketinggian: data.ketinggian || (data.data && data.data.ketinggian_maks) || "15 meter (3 Lantai)"
      };

      setRdtrResult(resultObj);

      // Save in history (avoid duplicates)
      setRdtrHistory(prev => {
        const filtered = prev.filter(h => Math.abs(h.lat - lat) > 0.0001 || Math.abs(h.lng - lng) > 0.0001);
        const updated = [resultObj, ...filtered].slice(0, 20);
        localStorage.setItem("calcare_rdtr_history", JSON.stringify(updated));
        return updated;
      });

    } catch (err: any) {
      console.warn("Using smart simulated fallback for RDTR:", err);
      // Construct a highly polished context-rich response matching Bali coordinates
      const isDenpasar = matchedWilayah === "5171000000";
      const isBadung = matchedWilayah === "5103000000";
      
      const simulatedResult = {
        lat,
        lng,
        wilayahId: matchedWilayah,
        timestamp: Date.now(),
        zona: isDenpasar 
          ? "Zona Dagang & Jasa (K-2)" 
          : isBadung 
            ? "Zona Pariwisata & Penunjang (W-1)" 
            : "Zona Perumahan & Pemukiman (R-3)",
        kode: isDenpasar ? "K-2" : isBadung ? "W-1" : "R-3",
        deskripsi: isDenpasar
          ? "Kawasan perdagangan komersial perkotaan yang diizinkan untuk ruko, kantor swasta, kafe, restoran, rumah kos, dan hotel butik."
          : isBadung
            ? "Kawasan wisata pantai/budaya dengan pembatasan tinggi bangunan adat krama maksimal 15 meter (ketinggian pohon kelapa) guna melestarikan lansekap."
            : "Kawasan pemukiman tapak teratur dengan infrastruktur jalan minimum lebar 6 meter dan wajib menyediakan sumur resapan air hujan.",
        color: isDenpasar ? "#EF4444" : isBadung ? "#EC4899" : "#F59E0B",
        status: "Diizinkan Penuh (Sesuai KDB/KLB)",
        koefisien: isDenpasar ? "80% KDB" : isBadung ? "40% KDB" : "60% KDB",
        klb: isDenpasar ? "3.2 KLB" : isBadung ? "1.2 KLB" : "1.8 KLB",
        kdh: isDenpasar ? "15% KDH" : isBadung ? "40% KDH" : "30% KDH",
        ketinggian: "15 Meter (Maksimum 4 Lantai)",
        isSimulated: true
      };

      setRdtrResult(simulatedResult);

      setRdtrHistory(prev => {
        const filtered = prev.filter(h => Math.abs(h.lat - lat) > 0.0001 || Math.abs(h.lng - lng) > 0.0001);
        const updated = [simulatedResult, ...filtered].slice(0, 20);
        localStorage.setItem("calcare_rdtr_history", JSON.stringify(updated));
        return updated;
      });
    } finally {
      setRdtrLoading(false);
    }
  };

  const MarkerHandler = ({ 
    active 
  }: { 
    active: boolean
  }) => {
    useMapEvents({
      click: (e) => {
        if (!active) return;
        setPendingAnnotationPos({ lat: e.latlng.lat, lng: e.latlng.lng });
        setInputAnnotationLabel(lang === 'id' ? 'Pin Baru' : 'New Pin');
        setIsAddingMarker(false); 
      }
    });
    return null;
  };

  const MapClickHandler = ({ disabled, autoDetectActive }: { disabled?: boolean, autoDetectActive?: boolean }) => {
    const map = useMap();
    useMapEvents({
      click: async (e) => {
        if (isAddingMarker) return; // handled by MarkerHandler
        if (isRdtrActive) {
          handleMapClickForRdtr(e.latlng.lat, e.latlng.lng);
          return;
        }
        if (autoDetectActive) {
            setIsDetecting(true);
            try {
                const bounds = map.getBounds();
                const size = map.getSize();
                const x = Math.round(e.containerPoint.x);
                const y = Math.round(e.containerPoint.y);
                
                const crs = map.options.crs;
                const sw = crs.project(bounds.getSouthWest());
                const ne = crs.project(bounds.getNorthEast());
                const bboxStr = `${sw.x},${sw.y},${ne.x},${ne.y}`;

                // Target all mapped GeoServer layers for query
                const queryLayers = wmsLayersList.map(l => l.layers).slice(0, 20).join(',');

                const u = `https://geo2.perare.io/geoserver/dorado/wms?request=GetFeatureInfo&service=WMS&srs=EPSG:3857&version=1.1.1&format=image/png&bbox=${bboxStr}&height=${size.y}&width=${size.x}&layers=${queryLayers}&query_layers=${queryLayers}&info_format=application/json&x=${x}&y=${y}&feature_count=1`;
                
                const response = await fetch(u);
                if (!response.ok) throw new Error('Network error');
                const data = await response.json();
                
                if (data.features && data.features.length > 0) {
                   const feature = data.features[0];
                   if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                       let coords = feature.geometry.coordinates;
                       if (feature.geometry.type === 'MultiPolygon') {
                           coords = coords[0];
                       }
                       const ring = coords[0];
                       
                       const newPoints = ring.map((pt: number[]) => {
                           const ll = crs.unproject({ x: pt[0], y: pt[1] } as any);
                           return { lat: ll.lat, lng: ll.lng, color: DEFAULT_POINT_COLOR };
                       });
                       if (newPoints.length > 1 && newPoints[0].lat === newPoints[newPoints.length-1].lat && newPoints[0].lng === newPoints[newPoints.length-1].lng) {
                           newPoints.pop();
                       }
                       
                       setPoints(newPoints);
                       setShowPlotSizes(false); 
                       setIsAutoDetect(false);
                   } else {
                       alert(t(lang, 'plotNotFound') || "Plot tidak ditemukan atau geometri tidak sesuai.");
                   }
                } else {
                   alert(t(lang, 'plotNotFound') || "Tidak ada plot di koordinat tersebut.");
                }
            } catch(err) {
                console.error("Auto detect failed", err);
                alert("Gagal mengambil data dari GeoServer");
            } finally {
                setIsDetecting(false);
            }
            return;
        }

        if (disabled) return;
        setPoints(pts => [...pts, { lat: e.latlng.lat, lng: e.latlng.lng, color: DEFAULT_POINT_COLOR }]);
        setSearchResults([]);
        setSearchQuery('');
        setSelectedResultId(null);
      },
    });
    return null;
  };

  const MeasureHandler = ({ active, measurePoints, setMeasurePoints, t, lang }: { 
    active: boolean, 
    measurePoints: [number, number][],
    setMeasurePoints: React.Dispatch<React.SetStateAction<[number, number][]>>,
    t: any,
    lang: any
}) => {
    useMapEvents({
        click(e) {
            if (!active) return;
            const { lat, lng } = e.latlng;
            setMeasurePoints(prev => [...prev, [lat, lng]]);
        }
    });

    if (!active || measurePoints.length === 0) return null;

    return (
        <LayerGroup>
            {measurePoints.map((p, i) => (
                <Marker 
                    key={`measure-p-${i}`} 
                    position={p} 
                    draggable={true}
                    eventHandlers={{
                        drag: (e) => {
                            const marker = e.target;
                            const pos = marker.getLatLng();
                            const newPts = [...measurePoints];
                            newPts[i] = [pos.lat, pos.lng];
                            setMeasurePoints(newPts as [number, number][]);
                        },
                        dragend: (e) => {
                            const marker = e.target;
                            const pos = marker.getLatLng();
                            const newPts = [...measurePoints];
                            newPts[i] = [pos.lat, pos.lng];
                            setMeasurePoints(newPts as [number, number][]);
                        }
                    }}
                    icon={L.divIcon({
                        className: '',
                        html: `<div style="background-color: #EAB308; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
                        iconSize: [10, 10],
                        iconAnchor: [5, 5]
                    })}
                >
                    <Tooltip permanent direction="top" offset={[0, -5]} className="leaflet-tooltip-transparent">
                        <span className="text-[9px] font-bold uppercase">M_{i+1}</span>
                    </Tooltip>
                </Marker>
            ))}
            {measurePoints.length > 1 && (
                <>
                    <Polyline 
                        positions={measurePoints} 
                        pathOptions={{ color: '#EAB308', weight: 2, dashArray: '5, 5' }} 
                    />
                    <Marker 
                        position={measurePoints[measurePoints.length - 1]}
                        icon={L.divIcon({
                            className: 'bg-[var(--color-surface)] border border-[#EAB308]/40 px-2 py-1 rounded text-[11px] font-bold text-[#EAB308] shadow-lg !w-auto !h-auto whitespace-nowrap text-center !translate-y-[-100%] !translate-x-[-50%] mt-[-10px]',
                            html: `<div>Total: ${calculateTotalMeasureDistance(measurePoints).toFixed(2)} m</div>`
                        })}
                    />
                </>
            )}
        </LayerGroup>
    );
};

const calculateTotalMeasureDistance = (pts: [number, number][]) => {
    let total = 0;
    if (pts.length > 1) {
        for (let i = 0; i < pts.length - 1; i++) {
            total += turf.distance(
                turf.point([pts[i][1], pts[i][0]]),
                turf.point([pts[i + 1][1], pts[i + 1][0]]),
                { units: 'meters' }
            );
        }
    }
    return total;
};


  if (!isAuth) {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4 font-sans text-[var(--color-fg)] overflow-hidden">
        <video 
          autoPlay 
          loop 
          muted 
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
        >
          <source src="https://v1.pinimg.com/videos/mc/720p/52/e1/ac/52e1accbbaac96e667a23a6de9006789.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/50 z-10" />

        <div className="relative z-20 bg-[var(--color-surface)]/80 backdrop-blur-md border border-[var(--color-fg)]/20 shadow-2xl p-8 max-w-sm w-full mx-4">
          <div className="flex justify-between items-center mb-8">
            <h1 className="font-display text-2xl font-black tracking-tight uppercase text-[var(--color-fg)]">Calcuare</h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest opacity-60 mb-2">Username</label>
                  <input 
                    type="text" 
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    required
                    className="w-full bg-[var(--color-surface)] border-b border-[var(--color-fg)]/20 p-2 pl-0 text-md focus:outline-none focus:border-[var(--color-fg)] transition-colors" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest opacity-60 mb-2">Password</label>
                  <input 
                    type="password" 
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                    className="w-full bg-[var(--color-surface)] border-b border-[var(--color-fg)]/20 p-2 pl-0 text-md focus:outline-none focus:border-[var(--color-fg)] transition-colors" 
                  />
                </div>
              </div>

              {authError && (
                <div className="text-red-500 text-[11px] font-medium bg-red-500/10 p-3 rounded-sm border border-red-500/20">
                  {authError}
                </div>
              )}

              <button 
                type="submit" 
                disabled={isLoadingAuth}
                className="w-full bg-[var(--color-fg)] text-[var(--color-bg)] py-3 uppercase tracking-widest text-[12px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isLoadingAuth ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[var(--color-bg)] font-sans text-[var(--color-fg)] overflow-hidden">
      
      {/* Custom Dialog for Creating Annotation Pin Label */}
      {pendingAnnotationPos && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[4000] flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-fg)]/20 shadow-2xl w-full max-w-md rounded-xl overflow-hidden p-6 space-y-4">
            <h3 className="font-display text-[16px] font-bold tracking-wider uppercase text-[var(--color-fg)] flex items-center gap-2">
              <MapPin className="text-red-500" size={18} />
              {lang === 'id' ? 'Tambah Anotasi Baru' : 'Add New Annotation'}
            </h3>
            <p className="text-[12px] opacity-70">
              {lang === 'id' 
                ? 'Masukkan label nama penanda untuk posisi koordinat yang Anda pilih di peta:' 
                : 'Enter a label name for the marker at your selected map coordinate:'}
            </p>
            <input 
              type="text"
              autoFocus
              value={inputAnnotationLabel}
              onChange={(e) => setInputAnnotationLabel(e.target.value)}
              placeholder={lang === 'id' ? 'misal: Akses Jalan Tol, Sumber Air, View Sunset' : 'e.g. Highway Access, Water Source, Sunset View'}
              className="w-full bg-[var(--color-fg)]/5 border border-[var(--color-fg)]/10 rounded-lg p-3 text-[13px] font-medium outline-none focus:border-[var(--color-fg)] text-[var(--color-fg)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const label = inputAnnotationLabel.trim() || (lang === 'id' ? "Pin Baru" : "New Pin");
                  setMarkers(prev => [...prev, { lat: pendingAnnotationPos.lat, lng: pendingAnnotationPos.lng, label, color: selectedAnnotationColor }]);
                  setPendingAnnotationPos(null);
                  setInputAnnotationLabel("");
                }
              }}
            />
            <div className="space-y-2 pt-2 border-t border-[var(--color-fg)]/5 mt-2">
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                {lang === 'id' ? 'Warna & Kategori Pin' : 'Pin Color & Category'}
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  { name: 'red', hex: '#EF4444', labelId: 'Akses', labelEn: 'Access' },
                  { name: 'blue', hex: '#3B82F6', labelId: 'Air', labelEn: 'Water' },
                  { name: 'emerald', hex: '#10B981', labelId: 'Vegetasi', labelEn: 'Vegetation' },
                  { name: 'amber', hex: '#F59E0B', labelId: 'Fasilitas', labelEn: 'Amenity' },
                  { name: 'purple', hex: '#8B5CF6', labelId: 'Lainnya', labelEn: 'Other' },
                ].map((col) => {
                  const isActive = selectedAnnotationColor === col.name;
                  return (
                    <button 
                      key={col.name}
                      type="button"
                      onClick={() => setSelectedAnnotationColor(col.name)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold border transition-all duration-300 cursor-pointer ${
                        isActive 
                          ? 'border-[var(--color-fg)] bg-[var(--color-fg)]/10 text-[var(--color-fg)] shadow-sm' 
                          : 'border-[var(--color-fg)]/10 bg-transparent text-[var(--color-fg)]/65 hover:border-[var(--color-fg)]/30 hover:bg-[var(--color-fg)]/5'
                      }`}
                      title={lang === 'id' ? col.labelId : col.labelEn}
                    >
                      <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0 ring-2 ring-white/10" style={{ backgroundColor: col.hex }} />
                      <span className="capitalize">{lang === 'id' ? col.labelId : col.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => {
                  setPendingAnnotationPos(null);
                  setInputAnnotationLabel("");
                }}
                className="flex-1 py-2.5 rounded-lg border border-[var(--color-fg)]/15 text-[12px] uppercase tracking-wider font-bold opacity-75 hover:opacity-100 font-mono transition-all"
              >
                {lang === 'id' ? 'Batal' : 'Cancel'}
              </button>
              <button 
                onClick={() => {
                  const label = inputAnnotationLabel.trim() || (lang === 'id' ? "Pin Baru" : "New Pin");
                  setMarkers(prev => [...prev, { lat: pendingAnnotationPos.lat, lng: pendingAnnotationPos.lng, label, color: selectedAnnotationColor }]);
                  setPendingAnnotationPos(null);
                  setInputAnnotationLabel("");
                }}
                className="flex-1 py-2.5 rounded-lg bg-[var(--color-fg)] text-[var(--color-bg)] text-[12px] uppercase tracking-wider font-bold hover:opacity-90 font-mono transition-all"
              >
                {lang === 'id' ? 'Simpan' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Dialog for Deleting Annotation Pin */}
      {annotationToDeleteIdx !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[4000] flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-fg)]/20 shadow-2xl w-full max-w-sm rounded-xl overflow-hidden p-6 space-y-4">
            <h3 className="font-display text-[16px] font-bold tracking-wider uppercase text-[var(--color-fg)] flex items-center gap-2">
              <Trash2 className="text-red-500" size={18} />
              {lang === 'id' ? 'Hapus Anotasi' : 'Delete Annotation'}
            </h3>
            <p className="text-[13px] opacity-85">
              {lang === 'id' 
                ? `Apakah Anda yakin ingin menghapus lencana anotasi "${markers[annotationToDeleteIdx]?.label}"?` 
                : `Are you sure you want to delete the annotation "${markers[annotationToDeleteIdx]?.label}"?`}
            </p>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setAnnotationToDeleteIdx(null)}
                className="flex-1 py-2.5 rounded-lg border border-[var(--color-fg)]/15 text-[12px] uppercase tracking-wider font-bold opacity-75 hover:opacity-100 font-mono transition-all"
              >
                {lang === 'id' ? 'Batal' : 'Cancel'}
              </button>
              <button 
                onClick={() => {
                  setMarkers(prev => prev.filter((_, i) => i !== annotationToDeleteIdx));
                  setAnnotationToDeleteIdx(null);
                }}
                className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-[12px] uppercase tracking-wider font-bold hover:bg-red-600 font-mono transition-all"
              >
                {lang === 'id' ? 'Hapus' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Dialog for Confirming Project Load */}
      {confirmProjectToLoad && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[4000] flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-fg)]/20 shadow-2xl w-full max-w-md rounded-xl overflow-hidden p-6 space-y-4">
            <h3 className="font-display text-[16px] font-bold tracking-wider uppercase text-[var(--color-fg)] flex items-center gap-2">
              <Layers className="text-indigo-500" size={18} />
              {lang === 'id' ? 'Muat Proyek' : 'Load Project'}
            </h3>
            <p className="text-[13px] opacity-85">
              {lang === 'id' 
                ? `Apakah Anda yakin ingin memuat dan berpindah ke blok lahan "${confirmProjectToLoad.name || 'Tanpa Nama'}"? Proyek saat ini akan digantikan.` 
                : `Are you sure you want to move and load the land block "${confirmProjectToLoad.name || 'Untitled'}"? The active project draft will be replaced.`}
            </p>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setConfirmProjectToLoad(null)}
                className="flex-1 py-2.5 rounded-lg border border-[var(--color-fg)]/15 text-[12px] uppercase tracking-wider font-bold opacity-75 hover:opacity-100 font-mono transition-all"
              >
                {lang === 'id' ? 'Batal' : 'Cancel'}
              </button>
              <button 
                onClick={() => {
                  loadProject(confirmProjectToLoad);
                  setConfirmProjectToLoad(null);
                }}
                className="flex-1 py-2.5 rounded-lg bg-[var(--color-fg)] text-[var(--color-bg)] text-[12px] uppercase tracking-wider font-bold hover:opacity-90 font-mono transition-all"
              >
                {lang === 'id' ? 'Muat' : 'Load'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {activeModal !== 'none' && (
        <div className="fixed inset-0 bg-[var(--color-bg)]/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-fg)]/20 shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] lg:max-h-[85vh]">
                <div className="flex justify-between items-center p-6 border-b border-[var(--color-fg)]/10 shrink-0">
                    <h3 className="font-display text-[18px] font-bold tracking-wider uppercase text-[var(--color-fg)]">
                        {activeModal === 'library' && 'Project Library'}
                        {activeModal === 'settings' && 'UTM Settings'}
                        {activeModal === 'export' && 'Export Data'}
                        {activeModal === 'import' && 'Import Data'}
                        {activeModal === 'kavling' && 'Auto Kavling'}
                        {activeModal === 'menu' && 'Menu'}
                    </h3>
                    <button onClick={() => setActiveModal('none')} className="text-[12px] uppercase tracking-widest font-bold opacity-50 hover:opacity-100">Close [X]</button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    {/* Menu Modal (Mobile Only) */}
                    {activeModal === 'menu' && (
                        <div className="flex flex-col gap-4 text-[12px] uppercase tracking-widest font-semibold">
                            <button onClick={() => {setActiveModal('library');}} className="p-3 text-left border-b border-[var(--color-fg)]/10 hover:bg-[var(--color-fg)]/5 flex items-center gap-2"><Layers size={16}/> {t(lang, 'projectLibrary')}</button>
                            <button onClick={() => {setActiveModal('settings');}} className="p-3 text-left border-b border-[var(--color-fg)]/10 hover:bg-[var(--color-fg)]/5 flex items-center gap-2"><Settings size={16}/> {t(lang, 'utmSettings')}</button>
                            <button onClick={() => {setActiveModal('import');}} className="p-3 text-left border-b border-[var(--color-fg)]/10 hover:bg-[var(--color-fg)]/5 flex items-center gap-2"><FileJson size={16}/> Import Data</button>
                            <button onClick={() => {setActiveModal('export');}} className="p-3 text-left border-b border-[var(--color-fg)]/10 hover:bg-[var(--color-fg)]/5 flex items-center gap-2"><Download size={16}/> {t(lang, 'exportData')}</button>
                            
                            <div className="pt-4 mt-2 flex flex-col gap-3">
                                <span className="opacity-50 font-bold ml-3 text-[10px]">PREFERENCES</span>
                                <div className="flex items-center gap-4 px-3">
                                    <button onClick={() => setLang(lang === 'en' ? 'id' : 'en')} className="flex items-center gap-2 p-2 border border-[var(--color-fg)]/20 rounded w-full justify-center">
                                        Language: {lang.toUpperCase()}
                                    </button>
                                    <button onClick={() => setIsDarkMode(!isDarkMode)} className="flex items-center gap-2 p-2 border border-[var(--color-fg)]/20 rounded w-full justify-center">
                                        {isDarkMode ? <Sun size={14}/> : <Moon size={14}/>} {isDarkMode ? 'LIGHT' : 'DARK'}
                                    </button>
                                </div>
                            </div>
                            
                            <div className="pt-4 mt-2 flex flex-col gap-3">
                                <span className="opacity-50 font-bold ml-3 text-[10px]">ACCOUNT</span>
                                <div className="px-3">
                                   <div className="mb-2">
                                       <span className="text-[10px] font-bold uppercase tracking-widest leading-none px-2 py-1 bg-[var(--color-fg)]/10 rounded-sm">LOCAL MODE</span>
                                   </div>
                                   <button onClick={handleLogout} className="flex items-center gap-2 w-full p-3 justify-center text-red-500 border border-red-500/30 rounded hover:bg-red-500/10">
                                       <LogOut size={14}/> Log Out
                                   </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Library Modal */}
                    {activeModal === 'library' && (
                        <div className="space-y-8">
                            <button 
                                onClick={handleNewProject}
                                className="w-full py-3 border-2 border-dashed border-[var(--color-fg)]/20 rounded flex items-center justify-center gap-2 text-[12px] uppercase tracking-widest font-bold opacity-60 hover:opacity-100 hover:border-[var(--color-fg)] hover:bg-[var(--color-fg)]/5 transition-all"
                            >
                                <Plus size={14} /> {t(lang, 'newProject')}
                            </button>

                            <div>
                                <form onSubmit={handleSaveProject} className="flex flex-col gap-2">
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={newProjectName} 
                                            onChange={e => setNewProjectName(e.target.value)} 
                                            placeholder={t(lang, 'newProjectName')} 
                                            className="flex-1 border border-[var(--color-fg)]/20 bg-transparent px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-[var(--color-fg)]"
                                            disabled={isSyncing}
                                        />
                                        <button type="submit" disabled={points.length === 0 || isSyncing} className="bg-[var(--color-fg)] text-white px-4 text-[12px] uppercase tracking-widest font-bold disabled:opacity-30">
                                            {isSyncing ? t(lang, 'saving') : t(lang, 'save')}
                                        </button>
                                    </div>
                                    <textarea
                                        value={projectDetails}
                                        onChange={e => setProjectDetails(e.target.value)}
                                        placeholder="Project details (optional)"
                                        className="w-full border border-[var(--color-fg)]/20 bg-transparent px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-[var(--color-fg)]"
                                        rows={2}
                                        disabled={isSyncing}
                                    />
                                </form>
                                {points.length === 0 && (
                                    <p className="text-[10px] text-red-500 mt-2 uppercase tracking-widest opacity-80">{t(lang, 'addPointsFirst')}</p>
                                )}
                            </div>
                            
                            <div>
                                <h4 className="text-[12px] uppercase opacity-40 mb-3">{t(lang, 'savedProjects')}</h4>
                                {savedProjects.length === 0 ? (
                                    <p className="text-[13px] font-mono opacity-50 italic">{t(lang, 'noSavedProjects')}</p>
                                ) : (
                                    <div className="space-y-3">
                                        {savedProjects.map(proj => (
                                            <div key={proj.id} className="border border-[var(--color-fg)]/10 p-3 flex gap-3">
                                                {proj.thumbnail && <img src={proj.thumbnail} className="w-14 h-14 object-contain bg-[var(--color-fg)]/5 rounded border border-[var(--color-fg)]/10" />}
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="font-bold text-[15px] tracking-tight">{proj.name}</div>
                                                            <div className="text-[12px] font-mono opacity-50">{new Date(proj.date).toLocaleDateString()} • {proj.points.length} {t(lang, 'points')}</div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={() => handleShareProject(proj)} 
                                                                disabled={isSharing === proj.id}
                                                                className={`p-1.5 border rounded transition-all flex items-center justify-center ${proj.shared ? 'bg-green-500/10 border-green-500/30 text-green-600' : 'border-[var(--color-fg)]/20 opacity-60 hover:opacity-100'}`}
                                                                title={proj.shared ? t(lang, 'unshare') : t(lang, 'share')}
                                                            >
                                                                {isSharing === proj.id ? (
                                                                  <div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full" />
                                                                ) : shareStatus[proj.id] ? (
                                                                  <Check size={14} />
                                                                ) : (
                                                                  <Share2 size={14} />
                                                                )}
                                                            </button>
                                                            <button onClick={() => deleteProject(proj.id)} className="text-red-500 opacity-60 hover:opacity-100 p-1.5 border border-red-500/20 rounded">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {proj.shared && (
                                                      <div 
                                                        className="flex items-center gap-2 mt-2 px-2 py-1 bg-green-500/5 border border-green-500/10 rounded cursor-pointer hover:bg-green-500/10 transition-colors" 
                                                        onClick={() => {
                                                          navigator.clipboard.writeText(`${window.location.origin}/?share=${encodeURIComponent(encodeProject(proj))}`);
                                                          alert("Link berbagi disalin!");
                                                        }}
                                                      >
                                                        <Link size={10} className="text-green-600 shrink-0" />
                                                        <span className="text-[10px] font-mono text-green-700 truncate opacity-80">
                                                          Tautan Berbagi
                                                        </span>
                                                      </div>
                                                    )}
                                                    <button onClick={() => loadProject(proj)} className="w-full mt-2 border border-[var(--color-fg)]/20 py-2 text-[12px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-white transition-colors">{t(lang, 'loadProject')}</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Settings Modal */}
                    {activeModal === 'settings' && (
                        <div className="space-y-6">
                            <div>
                                <label className="text-[12px] uppercase opacity-40 block mb-2">{t(lang, 'measurementUnit')}</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" checked={units === 'metric'} onChange={() => setUnits('metric')} className="accent-[var(--color-fg)]" />
                                        <span className="text-[15px] font-mono">{t(lang, 'metric')}</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer opacity-50" title="Coming soon">
                                        <input type="radio" disabled checked={units === 'imperial'} onChange={() => setUnits('imperial')} className="accent-[var(--color-fg)]" />
                                        <span className="text-[15px] font-mono">{t(lang, 'imperial')}</span>
                                    </label>
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-[12px] uppercase opacity-40 block mb-3 font-bold">{t(lang, 'areaDisplayUnit')}</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['sqm', 'are', 'ha'] as const).map(unit => (
                                        <button
                                            key={unit}
                                            onClick={() => setAreaUnit(unit)}
                                            className={`py-2 text-[13px] font-mono border transition-all ${
                                                areaUnit === unit 
                                                ? 'bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]' 
                                                : 'bg-transparent border-[var(--color-fg)]/20 opacity-60 hover:opacity-100'
                                            }`}
                                        >
                                            {t(lang, unit === 'sqm' ? 'sqmUnit' : unit === 'are' ? 'areUnit' : 'hectaresUnit')}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[12px] uppercase opacity-40 block mb-3 font-bold">{t(lang, 'calcPrecision')}</label>
                                <div className="space-y-4">
                                    <div>
                                        <span className="text-[11px] uppercase opacity-50 block mb-1">{t(lang, 'haSqmPrecision')}</span>
                                        <div className="flex gap-2">
                                            {([2, 4, 6]).map(p => (
                                                <button 
                                                    key={p} 
                                                    onClick={() => setAreaPrecision(p)}
                                                    className={`flex-1 py-1.5 text-[11px] font-mono border transition-all ${areaPrecision === p ? 'bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]' : 'bg-transparent border-[var(--color-fg)]/20 opacity-60 hover:opacity-100'}`}
                                                >
                                                    {p} {t(lang, 'decimalPlaces')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-[11px] uppercase opacity-50 block mb-1">{t(lang, 'arePrecisionLabel')}</span>
                                        <div className="flex gap-2">
                                            {([0, 1, 2]).map(p => (
                                                <button 
                                                    key={p} 
                                                    onClick={() => setArePrecision(p)}
                                                    className={`flex-1 py-1.5 text-[11px] font-mono border transition-all ${arePrecision === p ? 'bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]' : 'bg-transparent border-[var(--color-fg)]/20 opacity-60 hover:opacity-100'}`}
                                                >
                                                    {p} {t(lang, 'decimalPlaces')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <hr className="border-[var(--color-fg)]/10" />

                            <div>
                                <label className="text-[12px] uppercase opacity-40 block mb-2">{t(lang, 'mapRenderStyle')}</label>
                                <Toggle 
                                    checked={showGrid} 
                                    onChange={setShowGrid} 
                                    label={t(lang, 'showGrid')} 
                                />
                            </div>

                            <hr className="border-[var(--color-fg)]/10" />

                            <div>
                                <label className="text-[12px] uppercase opacity-40 block mb-4">WMS Layer Config</label>
                                <div className="space-y-4">
                                  <div>
                                    <div className="flex justify-between mb-1">
                                      <span className="text-[12px]">Opacity</span>
                                      <span className="text-[12px] font-mono">{Math.round(wmsOpacity * 100)}%</span>
                                    </div>
                                    <input 
                                      type="range" min="0" max="1" step="0.1"
                                      value={wmsOpacity} onChange={(e) => setWmsOpacity(parseFloat(e.target.value))}
                                      className="w-full accent-[var(--color-fg)]"
                                    />
                                  </div>
                                  <div>
                                    <div className="flex justify-between mb-1">
                                      <span className="text-[12px]">Hue Filter</span>
                                      <span className="text-[12px] font-mono">{wmsHue}deg</span>
                                    </div>
                                    <input 
                                      type="range" min="0" max="360" step="10"
                                      value={wmsHue} onChange={(e) => setWmsHue(parseFloat(e.target.value))}
                                      className="w-full accent-[var(--color-fg)]"
                                    />
                                  </div>
                                  <div>
                                    <Toggle 
                                      checked={wmsInvert} 
                                      onChange={setWmsInvert} 
                                      label="Invert Colors" 
                                    />
                                  </div>
                                </div>
                            </div>
                            
                            <div className="bg-[var(--color-bg)] p-4 border border-[var(--color-fg)]/10 text-[13px] font-mono opacity-70 whitespace-pre-line">
                                <strong>{t(lang, 'crsInfoTitle')}</strong><br/>
                                {t(lang, 'crsInfoText')}
                            </div>
                        </div>
                    )}

                    {/* Import Modal */}
                    {activeModal === 'import' && (
                        <div className="space-y-4">
                            <p className="text-[15px] opacity-80 mb-2">Import data polygon menggunakan GeoJSON atau raw array koordinat.</p>
                            <div className="bg-[var(--color-fg)]/5 p-4 border-l-2 border-[var(--color-fg)] font-mono text-[11px] mb-4 overflow-x-auto">
                               {`Contoh Format (Bisa didapat dari Network Tab):
{
  "coordinates": [
    [ [115.184..., -8.808...], [115.185..., -8.808...] ]
  ]
}`}
                            </div>
                            <textarea 
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                placeholder="Paste format JSON, GeoJSON, KML(sebagian), atau array koordinat [lng, lat]..."
                                className="w-full h-48 p-3 text-[12px] font-mono border border-[var(--color-fg)]/20 bg-transparent rounded focus:outline-none focus:border-[var(--color-fg)]"
                            />
                            {importError && <p className="text-red-500 text-[10px] uppercase font-bold mt-1">{importError}</p>}
                            <button 
                                onClick={handleSmartImport} 
                                disabled={!importText.trim()} 
                                className="w-full bg-[var(--color-fg)] text-[var(--color-bg)] py-3 text-[12px] uppercase tracking-widest font-bold mt-2 disabled:opacity-50 transition-all"
                            >
                                Proses Smart Import
                            </button>
                        </div>
                    )}

                    {activeModal === 'dxfPreview' && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-bold">DXF Preview</h2>
                            <DXFPreview points={points} kavlings={kavlings} />
                            <div className="flex gap-2">
                                <button onClick={() => setActiveModal('none')} className="flex-1 py-3 border border-[var(--color-fg)]">Cancel</button>
                                <button onClick={handleExportDXF} className="flex-1 py-3 bg-[var(--color-fg)] text-[var(--color-bg)]">Download DXF</button>
                            </div>
                        </div>
                    )}

                    {activeModal === 'kavling' && (
                        <div className="space-y-4">
                            <p className="text-[15px] opacity-80 mb-4">Secara otomatis subdivisi area menjadi kavling perumahan dengan akses jalan di tengah atau samping.</p>
                            
                            <div className="space-y-4 pt-2 border-t border-[var(--color-fg)]/10">
                                <div>
                                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block">Luas Min. Kavling (m²)</label>
                                    <input 
                                        type="number" 
                                        value={kavlingSettings.minArea}
                                        onChange={(e) => setKavlingSettings(prev => ({...prev, minArea: Number(e.target.value)}))}
                                        className="w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block">Lebar Depan Min. (m)</label>
                                    <input 
                                        type="number" 
                                        value={kavlingSettings.minFront}
                                        onChange={(e) => setKavlingSettings(prev => ({...prev, minFront: Number(e.target.value)}))}
                                        className="w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                                    />
                                </div>
                                {kavlingSettings.layoutType !== 'no_road_split_2' && (
                                    <>
                                        <div>
                                            <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block">Lebar Jalan Akses (m)</label>
                                            <input 
                                                type="number" 
                                                value={kavlingSettings.roadWidth}
                                                onChange={(e) => setKavlingSettings(prev => ({...prev, roadWidth: Number(e.target.value)}))}
                                                className="w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block">Sisi Jalan Masuk</label>
                                            <select 
                                                value={kavlingSettings.entryEdgeIndex}
                                                onChange={(e) => setKavlingSettings(prev => ({...prev, entryEdgeIndex: e.target.value}))}
                                                className="w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                                            >
                                                <option value="-1">Otomatis (Sisi Terpanjang)</option>
                                                {points.map((p1, i) => 
                                                    points.map((p2, j) => {
                                                        if (i === j) return null;
                                                        return (
                                                            <option key={`${i}-${j}`} value={`${i},${j}`}>
                                                                Dari P{i+1} ke P{j+1}
                                                            </option>
                                                        );
                                                    })
                                                )}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block">Sisi Jalan Keluar (Tembus)</label>
                                            <select 
                                                value={kavlingSettings.exitEdgeIndex}
                                                onChange={(e) => setKavlingSettings(prev => ({...prev, exitEdgeIndex: e.target.value}))}
                                                className="w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                                            >
                                                <option value="-1">Otomatis / Buntu</option>
                                                {points.map((p1, i) => 
                                                    points.map((p2, j) => {
                                                        if (i === j) return null;
                                                        return (
                                                            <option key={`${i}-${j}`} value={`${i},${j}`}>
                                                                Dari P{i+1} ke P{j+1}
                                                            </option>
                                                        );
                                                    })
                                                )}
                                            </select>
                                        </div>
                                        {kavlingSettings.layoutType === 'double_parallel' && (
                                            <div>
                                                <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block">Titik Sisi Jalan Kedua</label>
                                                <select 
                                                    value={kavlingSettings.secondEntryEdgeIndex}
                                                    onChange={(e) => setKavlingSettings(prev => ({...prev, secondEntryEdgeIndex: e.target.value}))}
                                                    className="w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                                                >
                                                    <option value="-1">Otomatis Pararel</option>
                                                    {points.map((p1, i) => 
                                                        points.map((p2, j) => {
                                                            if (i === j) return null;
                                                            return (
                                                                <option key={`${i}-${j}`} value={`${i},${j}`}>
                                                                    Dari P{i+1} ke P{j+1}
                                                                </option>
                                                            );
                                                        })
                                                    )}
                                                </select>
                                            </div>
                                        )}
                                    </>
                                )}

                                {kavlingSettings.layoutType === 'no_road_split_2' && (
                                    <>
                                        <div>
                                            <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block">
                                                Arah Belahan Awal
                                            </label>
                                            <select 
                                                value={kavlingSettings.entryEdgeIndex}
                                                onChange={(e) => setKavlingSettings(prev => ({...prev, entryEdgeIndex: e.target.value}))}
                                                className="w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                                            >
                                                <option value="-1">Otomatis (Sisi Terpanjang)</option>
                                                {points.map((p1, i) => 
                                                    points.map((p2, j) => {
                                                        if (i === j) return null;
                                                        return (
                                                            <option key={`${i}-${j}`} value={`${i},${j}`}>
                                                                Dari P{i+1} ke P{j+1}
                                                            </option>
                                                        );
                                                    })
                                                )}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block">
                                                Arah Belahan Akhir (Tembus)
                                            </label>
                                            <select 
                                                value={kavlingSettings.exitEdgeIndex}
                                                onChange={(e) => setKavlingSettings(prev => ({...prev, exitEdgeIndex: e.target.value}))}
                                                className="w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                                            >
                                                <option value="-1">Otomatis / Lurus</option>
                                                {points.map((p1, i) => 
                                                    points.map((p2, j) => {
                                                        if (i === j) return null;
                                                        return (
                                                            <option key={`${i}-${j}`} value={`${i},${j}`}>
                                                                Dari P{i+1} ke P{j+1}
                                                            </option>
                                                        );
                                                    })
                                                )}
                                            </select>
                                        </div>
                                    </>
                                )}
                                <div>
                                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block">Tipe Layout</label>
                                    <select 
                                        value={kavlingSettings.layoutType}
                                        onChange={(e) => setKavlingSettings(prev => ({...prev, layoutType: e.target.value}))}
                                        className="w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                                    >
                                        <option value="single_center">1 Jalan Utama (Tengah)</option>
                                        <option value="double_parallel">2 Jalan Kembar (Pararel)</option>
                                        <option value="t_shape">Jalan Simpang T</option>
                                        <option value="no_road_split_2">Tanpa Jalan (Bagi 2)</option>
                                    </select>
                                </div>
                            </div>
                            
                            {/* ADVANCED SETTINGS */}
                            <div className="space-y-4 pt-4 border-t border-[var(--color-fg)]/10">
                                <label className="text-[12px] uppercase tracking-widest font-bold opacity-80 block">Advanced Preferences [BETA]</label>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold opacity-80">
                                        <input 
                                            type="checkbox"
                                            checked={kavlingSettings.enableCulDeSac}
                                            onChange={(e) => setKavlingSettings(prev => ({...prev, enableCulDeSac: e.target.checked}))}
                                            className="accent-[var(--color-fg)] w-4 h-4"
                                        />
                                        <div>
                                            Gunakan Cul-de-sac (Buntu)
                                            <span className="block text-[9px] font-normal opacity-50">Radius Putar Balik</span>
                                        </div>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold opacity-80">
                                        <input 
                                            type="checkbox"
                                            checked={kavlingSettings.cornerChamfer}
                                            onChange={(e) => setKavlingSettings(prev => ({...prev, cornerChamfer: e.target.checked}))}
                                            className="accent-[var(--color-fg)] w-4 h-4"
                                        />
                                        <div>
                                            Corner Chamfer
                                            <span className="block text-[9px] font-normal opacity-50">Toleransi Kavling Hook</span>
                                        </div>
                                    </label>
                                </div>

                                <div>
                                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 flex justify-between">
                                        <span>Batas Kedalaman Kavling (m)</span>
                                        <span>{kavlingSettings.maxDepth}m</span>
                                    </label>
                                    <input 
                                        type="range"
                                        min={10} max={100} step={1}
                                        value={kavlingSettings.maxDepth}
                                        onChange={(e) => setKavlingSettings(prev => ({...prev, maxDepth: Number(e.target.value)}))}
                                        className="w-full accent-[var(--color-fg)]"
                                    />
                                    <div className="flex justify-between text-[9px] opacity-40 font-mono mt-1">
                                        <span>10m</span><span>100m</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block">Garis Sempadan / GSB (m)</label>
                                    <input 
                                        type="number" 
                                        value={kavlingSettings.setbackGSB}
                                        onChange={(e) => setKavlingSettings(prev => ({...prev, setbackGSB: Number(e.target.value)}))}
                                        className="w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                                    />
                                    <p className="text-[9px] mt-1 opacity-50">Visualisasi area efektif bangunan (titik putus)</p>
                                </div>

                                <div>
                                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block">Prioritas Susunan Lot</label>
                                    <select 
                                        value={kavlingSettings.optMode}
                                        onChange={(e) => setKavlingSettings(prev => ({...prev, optMode: e.target.value}))}
                                        className="w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                                    >
                                        <option value="maximize">Maksimalkan Keuntungan (Dapatkan Lot Terbanyak)</option>
                                        <option value="even">Simetris (Ukuran Disamaratakan di Setiap Lajur)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="bg-[var(--color-fg)]/5 p-4 border-l-2 border-[var(--color-fg)] mt-4">
                                <p className="text-[11px] font-mono opacity-80 leading-relaxed">
                                    Hasil kavling akan tergambar langsung di peta dan juga akan ikut diexport dalam file DXF maupun PDF secara otomatis.
                                </p>
                            </div>

                            <button onClick={() => handleGenerateKavling(false)} className="w-full bg-[var(--color-fg)] text-[var(--color-bg)] py-4 text-[12px] uppercase tracking-widest font-bold mt-4 shadow-lg hover:opacity-90">
                                {kavlings.length > 0 ? "Kalkulasi Ulang" : "Preview & Kalkulasi"}
                            </button>
                            
                            {kavlings.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-[var(--color-fg)]/10 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-[12px] uppercase tracking-widest font-bold opacity-80">Daftar Kavling</h4>
                                        <span className="text-[9px] opacity-60 font-mono text-right max-w-[150px] leading-tight">Ubah angka untuk menggeser garis batas</span>
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                                        {kavlings.filter((k: any) => k.type !== 'road').map((k: any) => (
                                            <div key={k.id} className={`flex items-center justify-between p-2 border rounded border-[var(--color-fg)]/20 bg-[var(--color-fg)]/5`}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[12px] opacity-80 font-mono w-12 truncate">{k.label || k.id}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="number" 
                                                        className={`w-20 p-1 text-right text-[12px] border rounded bg-transparent focus:outline-none focus:border-[var(--color-fg)] border-transparent`}
                                                        value={Math.round(kavlingOverrides[k.id] || k.area).toString()}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value);
                                                            if (!isNaN(val) && val > 0) {
                                                                handleAreaChange(k.id, val);
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-[10px] opacity-50">m²</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <button onClick={() => setActiveModal('none')} className="w-1/2 border border-[var(--color-fg)] flex justify-center py-3 text-[12px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-colors">
                                            Selesai (Tutup)
                                        </button>
                                        <button onClick={() => { setKavlings([]); setKavlingOverrides({}); }} className="w-1/2 border border-red-500/20 text-red-500 flex justify-center py-3 text-[12px] uppercase tracking-widest font-bold hover:bg-red-500/10 transition-colors">
                                            Hapus Semua
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Export Modal */}
                    {activeModal === 'export' && (
                        <div className="space-y-4">
                            <div className="flex gap-4 border-b border-[var(--color-fg)]/10 pb-4 mb-4">
                                <button 
                                    onClick={() => setExportMode('current')}
                                    className={`flex-1 pb-2 text-[12px] uppercase font-bold tracking-widest border-b-2 transition-all ${exportMode === 'current' ? 'border-[var(--color-fg)] opacity-100' : 'border-transparent opacity-40 hover:opacity-100'}`}
                                >
                                    Current Project
                                </button>
                                <button 
                                    onClick={() => setExportMode('batch')}
                                    className={`flex-1 pb-2 text-[12px] uppercase font-bold tracking-widest border-b-2 transition-all ${exportMode === 'batch' ? 'border-[var(--color-fg)] opacity-100' : 'border-transparent opacity-40 hover:opacity-100'}`}
                                >
                                    Batch Export
                                </button>
                            </div>

                            {exportMode === 'current' ? (
                                <>
                                    <p className="text-[15px] opacity-80 mb-4">{t(lang, 'exportDesc')}</p>
                                    
                                    <div className="bg-[var(--color-fg)]/5 p-4 border-l-2 border-[var(--color-fg)] font-mono text-[12px] space-y-2">
                                        <div><strong>{t(lang, 'pointsToProcess')}</strong> {points.length}</div>
                                        <div><strong>{t(lang, 'calculatedArea')}</strong> {
                                            areaUnit === 'are' ? stats.areaAre.toFixed(arePrecision) + ' are' :
                                            areaUnit === 'ha' ? stats.areaHectares.toFixed(areaPrecision) + ' ha' :
                                            stats.areaSqMeters.toFixed(areaPrecision) + ' m²'
                                        }</div>
                                        <div><strong>{t(lang, 'estimatedPerimeter')}</strong> {stats.perimeter.toFixed(2)} m</div>
                                    </div>
                                    
                                    <div className="space-y-3 mt-4 pt-4 border-t border-[var(--color-fg)]/10">
                                        <h4 className="text-[12px] uppercase tracking-widest font-bold opacity-70">Project Details (Optional)</h4>
                                        <input
                                            type="text"
                                            placeholder="Client Name"
                                            value={exportClientName}
                                            onChange={(e) => setExportClientName(e.target.value)}
                                            className="w-full p-2 text-[12px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:outline-none focus:border-[var(--color-fg)]"
                                        />
                                        <input
                                            type="text"
                                            placeholder="NIB / Certificate Number"
                                            value={exportNIB}
                                            onChange={(e) => setExportNIB(e.target.value)}
                                            className="w-full p-2 text-[12px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:outline-none focus:border-[var(--color-fg)]"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Surveyor Name"
                                            value={exportSurveyor}
                                            onChange={(e) => setExportSurveyor(e.target.value)}
                                            className="w-full p-2 text-[12px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:outline-none focus:border-[var(--color-fg)]"
                                        />
                                        <input
                                            type="number"
                                            placeholder={`Price per ${areaUnit === 'are' ? 'Are' : areaUnit === 'ha' ? 'Hectare' : 'm²'} (Rp)`}
                                            value={pricePerUnit || ''}
                                            onChange={(e) => setPricePerUnit(Number(e.target.value))}
                                            className="w-full p-2 text-[12px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:outline-none focus:border-[var(--color-fg)]"
                                        />
                                        <textarea
                                            placeholder="Field Notes"
                                            value={exportNotes}
                                            onChange={(e) => setExportNotes(e.target.value)}
                                            className="w-full h-20 p-2 text-[12px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:outline-none focus:border-[var(--color-fg)] resize-none"
                                        />
                                    </div>

                                    <button onClick={handleExport} disabled={isExporting} className="w-full bg-[var(--color-fg)] text-white py-3 text-[12px] uppercase tracking-widest font-bold mt-4 disabled:opacity-50 flex justify-center items-center gap-2 transition-all">
                                        {isExporting ? t(lang, 'generating') : <><Download size={14} /> {t(lang, 'exportPdfBtn')}</>}
                                    </button>

                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
                                       <button onClick={handleExportGeoJSON} disabled={points.length < 3} className="bg-transparent border border-[var(--color-fg)]/20 text-[var(--color-fg)] py-2 text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-white transition-all flex justify-center items-center gap-2 disabled:opacity-30">
                                          <FileJson size={14} /> {t(lang, 'exportGeoJSON')}
                                       </button>
                                       <button onClick={handleExportCSV} disabled={points.length === 0} className="bg-transparent border border-[var(--color-fg)]/20 text-[var(--color-fg)] py-2 text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-white transition-all flex justify-center items-center gap-2 disabled:opacity-30">
                                          <Table size={14} /> {t(lang, 'exportCSV')}
                                       </button>
                                       <button onClick={() => setActiveModal('dxfPreview')} disabled={points.length < 3} className="col-span-2 lg:col-span-1 bg-transparent border border-[var(--color-fg)]/20 text-[var(--color-fg)] py-2 text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-white transition-all flex justify-center items-center gap-2 disabled:opacity-30">
                                          <Layers size={14} /> Export DXF
                                       </button>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-[13px] opacity-80 mb-2">Pilih beberapa project untuk digabung ke dalam satu laporan PDF. Halaman akan digenerate berurutan (tanpa kavling).</p>
                                    
                                    <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                        {savedProjects.length === 0 ? (
                                            <p className="text-[11px] opacity-50 italic text-center py-4">Belum ada project di library.</p>
                                        ) : (
                                            savedProjects.map(proj => (
                                                <label key={proj.id} className="flex items-center gap-3 p-3 border border-[var(--color-fg)]/10 rounded hover:bg-[var(--color-fg)]/5 cursor-pointer transition-colors">
                                                    <input 
                                                        type="checkbox" 
                                                        className="w-4 h-4 cursor-pointer accent-[var(--color-fg)]"
                                                        checked={batchSelectedIds.includes(proj.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setBatchSelectedIds(prev => [...prev, proj.id]);
                                                            else setBatchSelectedIds(prev => prev.filter(id => id !== proj.id));
                                                        }}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className="text-[12px] font-bold">{proj.name}</span>
                                                        <span className="text-[10px] opacity-60 font-mono">
                                                            {new Date(proj.date).toLocaleDateString()} • {proj.points?.length || 0} Points • {proj.areaSqMeters?.toFixed(1) || 0}m²
                                                        </span>
                                                    </div>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                    
                                    {savedProjects.length > 0 && (
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => setBatchSelectedIds(savedProjects.map(p => p.id))}
                                                className="text-[10px] uppercase font-bold tracking-widest opacity-60 hover:opacity-100"
                                            >
                                                Pilih Semua
                                            </button>
                                            <span className="opacity-30">•</span>
                                            <button 
                                                onClick={() => setBatchSelectedIds([])}
                                                className="text-[10px] uppercase font-bold tracking-widest opacity-60 hover:opacity-100"
                                            >
                                                Kosongkan
                                            </button>
                                        </div>
                                    )}

                                    <button 
                                        onClick={handleBatchExportPDF} 
                                        disabled={isExporting || batchSelectedIds.length === 0} 
                                        className="w-full bg-[var(--color-fg)] text-[var(--color-bg)] py-3 text-[12px] uppercase tracking-widest font-bold mt-4 disabled:opacity-50 flex justify-center items-center gap-2 transition-all hover:opacity-90"
                                    >
                                        {isExporting ? "GENERATING BATCH..." : `START BATCH EXPORT (${batchSelectedIds.length})`}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      <header className="flex justify-between items-center px-4 lg:px-10 py-4 lg:py-6 border-b border-[var(--color-fg)]/10 bg-[var(--color-bg)] z-[2000] sticky top-0">
        <div className="flex flex-col lg:flex-row lg:items-baseline gap-0 lg:gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[20px] lg:text-[24px] font-display font-black tracking-tight uppercase text-[var(--color-fg)]">Calcuare</span>
            <button 
              onClick={() => handleQuickSave(true)} 
              disabled={points.length === 0}
              className="ml-2 px-2 py-1 bg-[var(--color-fg)] text-[var(--color-bg)] rounded text-[10px] font-bold uppercase tracking-widest disabled:opacity-30 hover:opacity-80 transition-opacity"
            >
              SAVE
            </button>
            <AnimatePresence>
              {autoSaveStatus !== 'idle' && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center gap-1.5"
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${autoSaveStatus === 'saving' ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`} />
                  <span className="text-[9px] uppercase tracking-widest font-bold opacity-40">
                    {autoSaveStatus === 'saving' ? 'SAVING...' : 'SAVED'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <span className="text-[10px] lg:text-[12px] uppercase tracking-widest opacity-50 block lg:inline font-mono">V.1 by Rifky Rangga</span>
        </div>
        <div className="flex items-center gap-3 lg:gap-8">
          <nav className="hidden lg:flex gap-8 text-[12px] uppercase tracking-widest font-semibold">
            <button onClick={() => setActiveModal('library')} className={`cursor-pointer pb-1 ${activeModal === 'library' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>{t(lang, 'projectLibrary')}</button>
            <button onClick={() => setActiveModal('settings')} className={`cursor-pointer pb-1 ${activeModal === 'settings' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>{t(lang, 'utmSettings')}</button>
            <button onClick={() => setActiveModal('import')} className={`cursor-pointer pb-1 ${activeModal === 'import' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>Import Data</button>
            <button onClick={() => setActiveModal('export')} className={`cursor-pointer pb-1 ${activeModal === 'export' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>{t(lang, 'exportData')}</button>
          </nav>

          <div className="hidden lg:flex items-center gap-2 lg:gap-4 ml-2 lg:ml-0 lg:border-l border-[var(--color-fg)]/10 lg:pl-4">
            <button 
              onClick={handleLogout}
              className="p-1.5 border border-[var(--color-fg)]/20 rounded hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-colors opacity-80 hover:opacity-100 flex items-center justify-center text-red-500 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/30"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <button 
              onClick={() => setLang(lang === 'en' ? 'id' : 'en')} 
              className="px-2 py-1 text-[11px] font-bold border border-[var(--color-fg)]/20 rounded hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-colors opacity-80 hover:opacity-100"
              title={t(lang, 'toggleLang')}
            >
              {lang === 'en' ? 'EN' : 'ID'}
            </button>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              className="p-1.5 border border-[var(--color-fg)]/20 rounded hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-colors opacity-80 hover:opacity-100 flex items-center justify-center"
              title={t(lang, 'toggleTheme')}
            >
              {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
          
          <div className="flex lg:hidden items-center">
             <button onClick={() => setActiveModal('menu')} className="p-2 border border-[var(--color-fg)]/10 rounded" title="Menu">
                 <Menu size={20} className="opacity-70"/>
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative mb-[64px] lg:mb-0">
        
        {/* Sidebar: Input Points */}
        <aside className={`${mobileTab === 'points' ? 'flex' : (showLeftSidebar ? 'hidden lg:flex' : 'hidden')} w-full lg:w-[350px] border-r border-[var(--color-fg)]/10 p-5 lg:p-8 flex flex-col bg-[var(--color-bg)] h-full shrink-0 z-[1000] overflow-hidden`}>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <h2 className="text-[12px] uppercase tracking-widest opacity-50 font-bold">
                {sidebarActiveTab === 'rdtr' 
                  ? (lang === 'id' ? 'ANALISIS TATA RUANG' : 'RDTR ANALYSIS')
                  : t(lang, 'inputCoordsHeader')}
              </h2>
          <button className="hidden lg:block opacity-50 hover:opacity-100" onClick={() => setShowLeftSidebar(false)}>
                <X size={16} />
              </button>
            </div>
          </div>
          
          {/* Slide Segmented Tabs */}
          <div className="grid grid-cols-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-4 text-[10px] uppercase tracking-widest font-display font-extrabold shadow-inner shrink-0">
            <button
              onClick={() => {
                setSidebarActiveTab('kavling');
                setIsRdtrActive(false);
              }}
              className={`py-2 rounded-lg text-center cursor-pointer transition-all duration-300 flex items-center justify-center gap-1.5 ${sidebarActiveTab === 'kavling' ? 'bg-white dark:bg-gray-900 shadow-sm text-[var(--color-fg)] border border-black/5' : 'text-[var(--color-fg)]/45 hover:text-[var(--color-fg)]/75'}`}
            >
              📐 KAVLING
            </button>
            <button
              onClick={() => {
                setSidebarActiveTab('rdtr');
                setIsRdtrActive(true);
                setIsFreehand(false);
                setIsEditMode(false);
                setIsMeasuring(false);
                setIsAddingMarker(false);
                setIsAutoDetect(false);
              }}
              className={`py-2 rounded-lg text-center cursor-pointer transition-all duration-300 flex items-center justify-center gap-1.5 ${sidebarActiveTab === 'rdtr' ? 'bg-fuchsia-600 text-white shadow-sm font-black' : 'text-[var(--color-fg)]/45 hover:text-[var(--color-fg)]/75'}`}
            >
              🗺️ RDTR MAP
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {sidebarActiveTab === 'rdtr' ? (
              <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar min-h-0 pb-2">
                
                {/* 1. GISTARU Base Region Selector */}
                <div className="bg-[var(--color-surface)] border border-[var(--color-fg)]/10 p-4 rounded-xl space-y-2.5">
                  <label className="text-[9px] uppercase opacity-45 font-bold block tracking-wider">
                    {lang === 'id' ? 'KAWASAN / WILAYAH ACUAN (RDTR)' : 'BASE REGION REFERENCE'}
                  </label>
                  <select
                    value={selectedRdtrWilayah}
                    onChange={(e) => setSelectedRdtrWilayah(e.target.value)}
                    className="w-full bg-[var(--color-bg)] text-[12px] p-2.5 rounded-lg border border-[var(--color-fg)]/15 focus:outline-none focus:border-fuchsia-500 font-semibold"
                  >
                    {RDTR_REGION_PRESETS.map(preset => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name} ({preset.province})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] opacity-50 leading-relaxed font-sans">
                    {lang === 'id' 
                      ? '*Klik sebidang tanah di peta Bali. Sistem auto-deteksi batas Administrasi Kabupaten lokasinya.'
                      : '*Click any coordinate on the map. The system automatically detects localized regency boundaries.'}
                  </p>
                </div>

                {/* 2. Loading State */}
                {rdtrLoading && (
                  <div className="py-12 text-center flex flex-col justify-center items-center space-y-3">
                    <div className="w-8 h-8 rounded-full border-2 border-fuchsia-600 border-t-transparent animate-spin" />
                    <p className="text-[11px] font-mono tracking-widest text-fuchsia-600 uppercase font-bold animate-pulse">
                      {lang === 'id' ? 'MENYAMBUNGKAN GISTARU API...' : 'FETCHING GISTARU DATA...'}
                    </p>
                  </div>
                )}

                {/* 3. Empty Click State */}
                {!rdtrLoading && !rdtrResult && (
                  <div className="border border-dashed border-[var(--color-fg)]/15 rounded-xl p-8 text-center bg-[var(--color-surface)]/20 my-2">
                    <Layers className="mx-auto w-8 h-8 opacity-25 text-fuchsia-500 mb-3 animate-pulse" />
                    <h4 className="text-[11px] uppercase tracking-wider font-bold mb-1">
                      {lang === 'id' ? 'KLIK PETA LOKASI' : 'TAP MAP COORDINATES'}
                    </h4>
                    <p className="text-[10px] opacity-60 max-w-[200px] mx-auto leading-relaxed">
                      {lang === 'id' 
                        ? 'Klik daerah mana saja di Bali untuk memetakan zonasi kepemilikan, peruntukan KDB, dan status izin bangun.' 
                        : 'Click anywhere to run real-time structural audits of government masterplans, coefficients, and limits.'}
                    </p>
                  </div>
                )}

                {/* 4. Results Block */}
                {!rdtrLoading && rdtrResult && (
                  <div className="space-y-4">
                    {/* Primary Zone Badge Card */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-fg)]/10 p-4 rounded-xl shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: rdtrResult.color }} />
                      <div className="flex justify-between items-start mb-2.5 pl-2">
                        <span className="text-[9px] font-mono font-bold tracking-widest px-2 py-0.5 rounded text-white" style={{ backgroundColor: rdtrResult.color || '#a21caf' }}>
                          ZONA {rdtrResult.kode}
                        </span>
                        {rdtrResult.isSimulated && (
                          <span className="text-[8px] font-mono bg-fuchsia-50 text-fuchsia-700 px-1.5 py-0.5 rounded border border-fuchsia-100 font-bold uppercase tracking-widest">
                            SIMULASI fallBack
                          </span>
                        )}
                      </div>
                      <h3 className="text-[13px] font-display font-extrabold text-[var(--color-fg)] pl-2">
                        {rdtrResult.zona}
                      </h3>
                      <p className="text-[11px] opacity-75 mt-3 leading-relaxed pl-2 font-sans">
                        {rdtrResult.deskripsi}
                      </p>
                    </div>

                    {/* Zoning Parameter Indicators (Micro Bento Grid) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-fg)]/10 flex flex-col justify-between">
                        <span className="text-[8px] uppercase opacity-45 font-bold tracking-wider block">Max KDB</span>
                        <span className="text-[12px] font-mono font-extrabold text-fuchsia-700 dark:text-fuchsia-400 mt-1">{rdtrResult.koefisien}</span>
                      </div>
                      <div className="bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-fg)]/10 flex flex-col justify-between">
                        <span className="text-[8px] uppercase opacity-45 font-bold tracking-wider block">Max KLB</span>
                        <span className="text-[12px] font-mono font-extrabold text-fuchsia-700 dark:text-fuchsia-400 mt-1">{rdtrResult.klb}</span>
                      </div>
                      <div className="bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-fg)]/10 flex flex-col justify-between">
                        <span className="text-[8px] uppercase opacity-45 font-bold tracking-wider block">Min KDH</span>
                        <span className="text-[12px] font-mono font-extrabold text-fuchsia-700 dark:text-fuchsia-400 mt-1">{rdtrResult.kdh}</span>
                      </div>
                      <div className="bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-fg)]/10 flex flex-col justify-between">
                        <span className="text-[8px] uppercase opacity-45 font-bold tracking-wider block">Tinggi Maks</span>
                        <span className="text-[11px] font-display font-bold text-gray-800 dark:text-white mt-1 truncate">{rdtrResult.ketinggian}</span>
                      </div>
                    </div>

                    {/* Status Box */}
                    <div className="bg-[var(--color-surface)] p-3 rounded-xl border border-[var(--color-fg)]/15 flex items-center justify-between text-[11px] font-semibold">
                      <span className="opacity-55">{lang === 'id' ? 'Status Kelayakan:' : 'Status Eligibility:'}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1.5 shrink-0">
                        <Check size={13} strokeWidth={3} /> {rdtrResult.status}
                      </span>
                    </div>

                    {/* Optional Land Use Purpose Input */}
                    <div className="bg-[var(--color-surface)] p-3.5 rounded-xl border border-[var(--color-fg)]/10 space-y-1.5">
                      <label className="text-[9px] uppercase opacity-45 font-bold block tracking-wider">
                        {lang === 'id' ? 'RENCANA / TUJUAN PENGGUNAAN LAHAN (OPSIONAL):' : 'LAND USE PURPOSE (OPTIONAL):'}
                      </label>
                      <input
                        type="text"
                        value={rdtrTujuanLahan}
                        onChange={(e) => setRdtrTujuanLahan(e.target.value)}
                        placeholder={lang === 'id' ? 'Contoh: Pembangunan Villa, Kebun, Ruko...' : 'E.g., Villa development, Garden, Shop...'}
                        className="w-full bg-[var(--color-bg)] text-[12px] p-2.5 rounded-lg border border-[var(--color-fg)]/15 focus:outline-none focus:border-fuchsia-500 font-medium placeholder:opacity-50"
                      />
                    </div>

                    {/* Coordinates Indicator */}
                    <div className="bg-[var(--color-surface)]/60 p-2.5 rounded-lg border border-[var(--color-fg)]/5 text-[10px] font-mono flex justify-between items-center opacity-75">
                      <span className="truncate">Lat: {rdtrResult.lat.toFixed(6)}, Lng: {rdtrResult.lng.toFixed(6)}</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`${rdtrResult.lat}, ${rdtrResult.lng}`);
                          alert("Koordinat disalin!");
                        }}
                        className="text-[9px] hover:text-fuchsia-600 uppercase font-bold px-1.5 py-0.5 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950/20 rounded transition-all shrink-0 ml-2"
                      >
                        Copy
                      </button>
                    </div>

                    {/* Optional Land Use Purpose Input */}
                    <div className="bg-[var(--color-surface)] p-3 rounded-xl border border-[var(--color-fg)]/10 space-y-1.5 shadow-sm">
                      <label className="text-[9px] uppercase opacity-45 font-bold block tracking-wider">
                        {lang === 'id' ? 'TUJUAN PENGGUNAAN LAHAN (OPSIONAL)' : 'LAND USE PURPOSE (OPTIONAL)'}
                      </label>
                      <input
                        type="text"
                        value={rdtrTujuanLahan}
                        onChange={(e) => setRdtrTujuanLahan(e.target.value)}
                        placeholder={lang === 'id' ? 'Contoh: Villa, Resort, Toko, Ruko, dll' : 'e.g. Villa, Resort, Shop...'}
                        className="w-full bg-[var(--color-bg)] text-[11px] px-3 py-2 rounded-lg border border-[var(--color-fg)]/15 focus:outline-none focus:border-fuchsia-500 font-medium"
                      />
                    </div>

                    {/* Action buttons (Favorites & PDF Export) */}
                    <div className="grid grid-cols-2 gap-2">
                       <button
                        onClick={() => {
                          const isAlreadyFavorite = rdtrFavorites.some(f => Math.abs(f.lat - rdtrResult.lat) < 0.0001 && Math.abs(f.lng - rdtrResult.lng) < 0.0001);
                          let updated;
                          if (isAlreadyFavorite) {
                            updated = rdtrFavorites.filter(f => Math.abs(f.lat - rdtrResult.lat) >= 0.0001 || Math.abs(f.lng - rdtrResult.lng) >= 0.0001);
                          } else {
                            updated = [rdtrResult, ...rdtrFavorites];
                          }
                          setRdtrFavorites(updated);
                          localStorage.setItem("calcare_rdtr_favorites", JSON.stringify(updated));
                        }}
                        className={`py-2.5 rounded-xl border text-[9px] uppercase font-bold tracking-wider hover:bg-[var(--color-fg)]/5 flex justify-center items-center gap-1.5 transition-all cursor-pointer ${
                          rdtrFavorites.some(f => Math.abs(f.lat - rdtrResult.lat) < 0.0001 && Math.abs(f.lng - rdtrResult.lng) < 0.0001)
                            ? 'border-red-500 bg-red-500/5 text-red-600 font-extrabold'
                            : 'border-[var(--color-fg)]/15 text-[var(--color-fg)]'
                        }`}
                      >
                        {rdtrFavorites.some(f => Math.abs(f.lat - rdtrResult.lat) < 0.0001 && Math.abs(f.lng - rdtrResult.lng) < 0.0001) ? "❤️ DISIMPAN" : "🖤 SIMPAN"}
                      </button>
                      <button
                        onClick={() => exportRdtrToPdf(rdtrResult)}
                        className="py-2.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl text-[9px] uppercase font-extrabold tracking-wider flex justify-center items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-fuchsia-600/10"
                      >
                        <Download size={12} strokeWidth={2.5} /> EXPORT PDF
                      </button>
                    </div>
                  </div>
                )}

                {/* 5. Favorites List (if items exist) */}
                {rdtrFavorites.length > 0 && (
                  <div className="pt-2.5 space-y-2">
                    <h4 className="text-[9px] uppercase tracking-widest opacity-45 font-bold border-b border-[var(--color-fg)]/10 pb-1 flex items-center gap-1">
                      ⭐ {lang === 'id' ? 'LOKASI TERFAVORIT' : 'FAVOURITES'}
                    </h4>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                      {rdtrFavorites.map((fav, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setRdtrClickedPoint({ lat: fav.lat, lng: fav.lng });
                            setRdtrResult(fav);
                            setMapCenter([fav.lat, fav.lng]);
                          }}
                          className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-surface)] dark:bg-[var(--color-surface)] hover:bg-[var(--color-fg)]/5 hover:border-[var(--color-fg)]/25 border border-[var(--color-fg)]/10 cursor-pointer text-[11px] transition-all"
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: fav.color }} />
                            <span className="font-semibold truncate text-[var(--color-fg)]">{fav.zona}</span>
                          </div>
                          <span className="text-[9px] font-mono opacity-50 shrink-0">
                            {fav.lat.toFixed(4)}, {fav.lng.toFixed(4)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. Click Query History */}
                {rdtrHistory.length > 0 && (
                  <div className="pt-2.5 space-y-2">
                    <div className="flex justify-between items-center border-b border-[var(--color-fg)]/10 pb-1">
                      <h4 className="text-[9px] uppercase tracking-widest opacity-45 font-bold">
                        🕒 {lang === 'id' ? 'RIWAYAT ANALISIS' : 'CLICK HISTORY'}
                      </h4>
                      <button
                        onClick={() => {
                          setRdtrHistory([]);
                          localStorage.removeItem("calcare_rdtr_history");
                        }}
                        className="text-[9px] uppercase tracking-wide text-red-500 hover:underline cursor-pointer font-bold"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                      {rdtrHistory.map((hist, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setRdtrClickedPoint({ lat: hist.lat, lng: hist.lng });
                            setRdtrResult(hist);
                            setMapCenter([hist.lat, hist.lng]);
                          }}
                          className="p-2 rounded-lg bg-[var(--color-surface)]/40 hover:bg-[var(--color-fg)]/5 hover:border-[var(--color-fg)]/20 border border-[var(--color-fg)]/5 cursor-pointer flex justify-between items-center text-[10px] transition-all"
                        >
                          <span className="truncate max-w-[150px] font-medium text-[var(--color-fg)]/80">{hist.zona}</span>
                          <span className="text-[9px] font-mono opacity-40 shrink-0">
                            {hist.lat.toFixed(4)}, {hist.lng.toFixed(4)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar min-h-0">
            
            {points.map((p, idx) => (
              <div 
                key={idx} 
                onClick={() => {
                   setMapCenter([p.lat, p.lng]);
                   setSelectedPointIndex(idx);
                }}
                className={`p-4 rounded-xl border flex flex-col group relative transition-all duration-300 cursor-pointer hover:border-[var(--color-fg)]/40 hover:shadow-md ${selectedPointIndex === idx ? 'border-[var(--color-fg)] ring-1 ring-[var(--color-fg)] bg-[var(--color-surface)] shadow-md' : 'border-[var(--color-fg)]/10 bg-[var(--color-surface)]/70'}`}
              >
                <div className="flex justify-between items-center mb-2.5">
                  <span className={`text-[11px] font-mono font-bold tracking-wide ${selectedPointIndex === idx ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg)]/60'}`}>
                    {t(lang, 'pointLabel')}_{String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-2 pr-6">
                    <input 
                      type="color" 
                      value={p.color || DEFAULT_POINT_COLOR}
                      onChange={(e) => { e.stopPropagation(); handleColorChange(idx, e.target.value); }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-3.5 h-3.5 rounded-full overflow-hidden cursor-pointer border-none p-0 bg-transparent transition-transform hover:scale-110"
                      title="Point Color"
                    />
                    <button 
                      onClick={(e) => { e.stopPropagation(); removePointAt(idx); }} 
                      className={`${isEditMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} text-[var(--color-fg)]/55 hover:text-red-500 transition-all absolute right-2.5 top-2.5 p-1 hover:bg-red-500/10 rounded-md`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {isEditMode ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] uppercase opacity-40 font-bold">Lat</label>
                        <input 
                          type="text"
                          inputMode="decimal"
                          value={p.lat}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              handlePointDrag(idx, val, p.lng);
                            } else if (e.target.value === '' || e.target.value === '-') {
                              setPoints(prev => {
                                const next = [...prev];
                                return prev; 
                              });
                            }
                          }}
                          className={`bg-transparent border-b border-[var(--color-fg)]/10 px-0.5 py-1 font-mono text-[12px] focus:outline-none focus:border-[var(--color-fg)] transition-colors ${
                            isNaN(p.lat) || p.lat < -90 || p.lat > 90
                              ? 'border-red-500 text-red-500 font-bold'
                              : 'text-[var(--color-fg)]'
                          }`}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] uppercase opacity-40 font-bold">Lng</label>
                        <input 
                          type="text"
                          inputMode="decimal"
                          value={p.lng}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              handlePointDrag(idx, p.lat, val);
                            }
                          }}
                          className={`bg-transparent border-b border-[var(--color-fg)]/10 px-0.5 py-1 font-mono text-[12px] focus:outline-none focus:border-[var(--color-fg)] transition-colors ${
                            isNaN(p.lng) || p.lng < -180 || p.lng > 180
                              ? 'border-red-500 text-red-500 font-bold'
                              : 'text-[var(--color-fg)]'
                          }`}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center bg-[var(--color-fg)]/5 dark:bg-[var(--color-fg)]/5 px-3 py-2 rounded-lg border border-[var(--color-fg)]/5">
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase font-bold opacity-30">LATITUDE</span>
                        <span className="font-mono text-[11px] font-bold tracking-tight text-[var(--color-fg)]/95">{p.lat.toFixed(6)}</span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[8px] uppercase font-bold opacity-30">LONGITUDE</span>
                        <span className="font-mono text-[11px] font-bold tracking-tight text-[var(--color-fg)]/95">{p.lng.toFixed(6)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {/* Input Form as "Add Next" Box - Hidden in Edit Mode */}
            {!isEditMode && (
              <form onSubmit={handleManualAdd} className="p-4 border border-[var(--color-fg)]/10 bg-[var(--color-surface)] rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md transition-shadow duration-300">
                <span className="text-[9px] uppercase tracking-wider font-extrabold opacity-40 mb-2 block">
                  {lang === 'en' ? 'ADD COORDINATE' : 'TAMBAH KOORDINAT'}
                </span>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    inputMode="decimal"
                    placeholder={t(lang, 'latitude')} 
                    value={manualInput.lat}
                    onChange={e => setManualInput({...manualInput, lat: e.target.value})}
                    className={`flex-1 w-full border bg-[var(--color-bg)] rounded-xl px-2.5 py-1.5 text-[12px] font-mono focus:outline-none transition-colors ${
                      manualInput.lat && (isNaN(parseFloat(manualInput.lat)) || parseFloat(manualInput.lat) < -90 || parseFloat(manualInput.lat) > 90)
                        ? 'border-red-500 text-red-500' 
                        : 'border-[var(--color-fg)]/10 focus:border-[var(--color-fg)]/50'
                    }`}
                    required
                  />
                  <input 
                    type="text"
                    inputMode="decimal"
                    placeholder={t(lang, 'longitude')} 
                    value={manualInput.lng}
                    onChange={e => setManualInput({...manualInput, lng: e.target.value})}
                    className={`flex-1 w-full border bg-[var(--color-bg)] rounded-xl px-2.5 py-1.5 text-[12px] font-mono focus:outline-none transition-colors ${
                      manualInput.lng && (isNaN(parseFloat(manualInput.lng)) || parseFloat(manualInput.lng) < -180 || parseFloat(manualInput.lng) > 180)
                        ? 'border-red-500 text-red-500' 
                        : 'border-[var(--color-fg)]/10 focus:border-[var(--color-fg)]/50'
                    }`}
                    required
                  />
                </div>
                <button type="submit" className="w-full mt-3 bg-[var(--color-fg)] text-[var(--color-bg)] rounded-lg py-2 text-[10px] font-display font-extrabold uppercase tracking-widest flex items-center justify-center gap-1 hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer">
                  <Plus size={11} strokeWidth={3} /> {t(lang, 'addNextCoord')}
                </button>
              </form>
            )}
            
            {!isEditMode && points.length === 0 && (
              <div className="text-center py-12 px-4 border border-dashed border-[var(--color-fg)]/10">
                <p className="text-[12px] uppercase tracking-widest opacity-30 italic">{t(lang, 'noPointsYet')}</p>
              </div>
            )}
          </div>
          )}
          </div>
          
          {sidebarActiveTab === 'kavling' && (
            <div className="mt-8 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button 
                  title="Ukur jarak antar titik di peta"
                  onClick={() => {
                    const next = !isMeasuring;
                    setIsMeasuring(next);
                    if (next) {
                      setIsFreehand(false);
                      setIsEditMode(false);
                      setIsAddingMarker(false);
                      setIsRdtrActive(false);
                    }
                  }}
                  className={`w-full py-3 rounded-xl text-[10px] uppercase tracking-widest font-display font-extrabold transition-all duration-300 flex justify-center items-center gap-2 cursor-pointer ${isMeasuring ? 'bg-[var(--color-fg)] text-[var(--color-bg)] shadow-md border border-[var(--color-fg)] scale-[1.01]' : 'bg-[var(--color-surface)] border border-[var(--color-fg)]/10 text-[var(--color-fg)]/80 hover:bg-[var(--color-fg)]/5 hover:border-[var(--color-fg)]/20 shadow-sm'}`}
                >
                  <Ruler size={13} strokeWidth={2.5} /> 
                  {isMeasuring ? "UKUR AKTIF" : "UKUR"}
                </button>
                <button 
                  title="Tambahkan penanda lokasi kustom di peta"
                  onClick={() => {
                    const next = !isAddingMarker;
                    setIsAddingMarker(next);
                    if (next) {
                      setIsFreehand(false);
                      setIsEditMode(false);
                      setIsMeasuring(false);
                      setIsRdtrActive(false);
                    }
                  }}
                  className={`w-full py-3 rounded-xl text-[10px] uppercase tracking-widest font-display font-extrabold transition-all duration-300 flex justify-center items-center gap-2 cursor-pointer ${isAddingMarker ? 'bg-[var(--color-fg)] text-[var(--color-bg)] shadow-md border border-[var(--color-fg)] scale-[1.01]' : 'bg-[var(--color-surface)] border border-[var(--color-fg)]/10 text-[var(--color-fg)]/80 hover:bg-[var(--color-fg)]/5 hover:border-[var(--color-fg)]/20 shadow-sm'}`}
                >
                  <MapPin size={13} strokeWidth={2.5} /> 
                  {isAddingMarker ? "KLIK MAP" : "ANOTASI"}
                  {markers.length > 0 && (
                    <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold transition-all duration-200 ${isAddingMarker ? 'bg-[var(--color-bg)] text-[var(--color-fg)] opacity-90' : 'bg-[var(--color-fg)]/15 text-[var(--color-fg)]'}`}>
                      {markers.length}
                    </span>
                  )}
                </button>
              </div>

              {/* High-Contrast Premium RDTR Tool Button */}
              <button 
                title="Aktifkan mode klik peta untuk melihat rencana zonasi tata ruang RDTR / GISTARU"
                onClick={() => {
                  const next = !isRdtrActive;
                  setIsRdtrActive(next);
                  if (next) {
                    setIsFreehand(false);
                    setIsEditMode(false);
                    setIsMeasuring(false);
                    setIsAddingMarker(false);
                    setIsAutoDetect(false);
                    setSidebarActiveTab('rdtr');
                  } else {
                    setSidebarActiveTab('kavling');
                  }
                }}
                className={`w-full py-3.5 rounded-xl text-[10px] uppercase tracking-widest font-display font-extrabold transition-all duration-300 flex justify-center items-center gap-2 cursor-pointer ${
                  isRdtrActive 
                    ? 'bg-fuchsia-600 text-white shadow-lg border border-fuchsia-500 scale-[1.01]' 
                    : 'bg-[var(--color-surface)] border border-[var(--color-fg)]/10 text-[var(--color-fg)]/80 hover:bg-[var(--color-fg)]/5 hover:border-[var(--color-fg)]/20 shadow-sm'
                }`}
              >
                <Layers size={13} strokeWidth={2.5} className={isRdtrActive ? 'animate-pulse' : ''} />
                {isRdtrActive ? "RDTR INTERAKTIF: AKTIF" : "LIHAT RDTR INTERAKTIF"}
              </button>

              {/* Reverse Geocode / ArcGIS Location Address (Telemetry Style) */}
              <div className="mb-4 border border-[var(--color-fg)]/10 bg-[var(--color-surface)] rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between bg-[var(--color-fg)]/5 px-3 py-2 border-b border-[var(--color-fg)]/10">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={10} className="text-red-500 animate-pulse" />
                    <span className="text-[9px] uppercase tracking-wider font-bold opacity-60">
                      {lang === 'en' ? 'COORDINATE ADDRESS' : 'ALAMAT KOORDINAT'}
                    </span>
                  </div>
                  {isGeocoding ? (
                    <span className="text-[8px] animate-pulse text-blue-500 font-bold tracking-widest uppercase">RESOLVING...</span>
                  ) : (
                    <span className="text-[8px] font-mono opacity-40 font-bold uppercase">ARCGIS API</span>
                  )}
                </div>
                
                <div className="p-3">
                  {reverseGeocodeAddress ? (
                    <div className="space-y-3">
                      <p className="text-[11px] font-mono leading-relaxed text-[var(--color-fg)]/90 break-words">
                        {reverseGeocodeAddress}
                      </p>
                      <div className="grid grid-cols-3 gap-1 pt-1">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(reverseGeocodeAddress);
                            alert(lang === 'en' ? 'Address copied!' : 'Alamat disalin!');
                          }}
                          className="text-[9px] font-bold uppercase tracking-wider py-1.5 px-1 border border-[var(--color-fg)]/10 bg-[var(--color-bg)] rounded-md hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] hover:border-[var(--color-fg)] transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          {lang === 'en' ? 'Copy' : 'Salin'}
                        </button>
                        <button
                          onClick={() => {
                            setProjectDetails(reverseGeocodeAddress);
                            alert(lang === 'en' ? 'Set as project details!' : 'Ditetapkan sebagai rincian proyek!');
                          }}
                          className="text-[9px] font-bold uppercase tracking-wider py-1.5 px-1 border border-[var(--color-fg)]/10 bg-[var(--color-bg)] rounded-md hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] hover:border-[var(--color-fg)] transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          + {lang === 'en' ? 'Details' : 'Detil'}
                        </button>
                        <button
                          onClick={() => {
                            setExportNotes(reverseGeocodeAddress);
                            alert(lang === 'en' ? 'Set as field notes!' : 'Ditetapkan sebagai catatan lapangan!');
                          }}
                          className="text-[9px] font-bold uppercase tracking-wider py-1.5 px-1 border border-[var(--color-fg)]/10 bg-[var(--color-bg)] rounded-md hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] hover:border-[var(--color-fg)] transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          + {lang === 'en' ? 'Notes' : 'Catatan'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <p className="text-[10px] font-mono opacity-50 italic text-center">
                        {points.length > 0 
                          ? (lang === 'en' ? 'Resolving live WGS84 address...' : 'Menerjemahkan alamat WGS84 live...')
                          : (lang === 'en' ? 'Add land boundary points first' : 'Tambahkan titik batas lahan terlebih dulu')
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="mb-2 mt-2">
                <button 
                  title="Klik pada bidang / area di peta untuk mendeteksi batas lahan otomatis"
                  onClick={() => {
                    const next = !isAutoDetect;
                    setIsAutoDetect(next);
                    if (next) {
                      setIsFreehand(false);
                      setIsEditMode(false);
                      setIsMeasuring(false);
                      setIsDrawing(false);
                    }
                  }}
                  className={`w-full border py-4 text-[12px] uppercase tracking-widest font-bold transition-all flex justify-center items-center gap-2 shadow-sm ${(isAutoDetect || isDetecting) ? 'bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]' : 'bg-transparent border-[var(--color-fg)] text-[var(--color-fg)] hover:bg-[var(--color-fg)]/5'}`}
                >
                  {(isDetecting) ? (
                     <div className="w-3 h-3 border-2 border-inherit border-t-transparent animate-spin rounded-full" />
                  ) : (
                     <Crosshair size={14} /> 
                  )}
                  {isAutoDetect ? "CLICK MAP TO DETECT" : isDetecting ? "DETECTING..." : "AUTO DETECT PLOT"}
                </button>
              </div>
              
              {(points.length > 0 || measurePoints.length > 0 || markers.length > 0) && (
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button 
                    title="Batalkan aksi poin sebelumnya"
                    onClick={handleUndo} 
                    className="w-full border border-[var(--color-fg)] text-[var(--color-fg)] bg-transparent py-4 text-[12px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-colors flex justify-center items-center gap-2"
                  >
                    <ArrowLeft size={14} /> {t(lang, 'undo')}
                  </button>
                  <button 
                    title="Hapus semua data poin dan kavling"
                    onClick={handleClear} 
                    className="w-full border border-[var(--color-fg)] text-[var(--color-bg)] bg-[var(--color-fg)] py-4 text-[12px] uppercase tracking-widest font-bold hover:bg-red-700 hover:border-red-700 transition-colors flex justify-center items-center gap-2"
                  >
                    <Eraser size={14} /> {t(lang, 'clear')}
                  </button>
                </div>
              )}
            </div>
          )}
          
          <div className="mt-8 text-center text-[12px] font-mono uppercase tracking-widest opacity-30 select-none">
             ©2026 All Rights Reserved
          </div>
        </aside>

        {/* Main: Map Visualization */}
        <section className={`${mobileTab === 'map' ? 'block' : 'hidden lg:block'} flex-1 bg-[var(--color-map)] relative isolate h-full lg:h-auto`}>
          {!showLeftSidebar && (
            <button 
              onClick={() => setShowLeftSidebar(true)}
              className="absolute left-0 top-[15%] z-[2000] bg-[var(--color-surface)] text-[var(--color-fg)] p-2.5 rounded-r-xl border border-l-0 border-[var(--color-fg)]/10 shadow-lg flex items-center justify-center hover:bg-[var(--color-fg)]/5 hover:text-[var(--color-fg)] transition-all cursor-pointer hidden lg:flex"
              title="Tampilkan Panel Menu"
            >
              <ChevronRight size={15} strokeWidth={2.5} />
            </button>
          )}

          {!showRightSidebar && (
            <button 
              onClick={() => setShowRightSidebar(true)}
              className="absolute right-0 top-[15%] z-[2000] bg-[var(--color-surface)] text-[var(--color-fg)] p-2.5 rounded-l-xl border border-r-0 border-[var(--color-fg)]/10 shadow-lg flex items-center justify-center hover:bg-[var(--color-fg)]/5 hover:text-[var(--color-fg)] transition-all cursor-pointer hidden lg:flex"
              title="Tampilkan Panel Hasil"
            >
              <ChevronLeft size={15} strokeWidth={2.5} />
            </button>
          )}

          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#1A1A1A 1px, transparent 1px)', backgroundSize: '20px 20px', zIndex: 0 }}></div>
          
          {/* Floating Search Container */}
          <div className="absolute top-4 left-4 right-16 lg:left-6 lg:right-auto lg:w-[325px] z-[2000] flex flex-col gap-1">
            <form onSubmit={handleSearch} className="bg-[var(--color-surface)] border border-[var(--color-fg)]/10 shadow-md rounded-xl flex items-center px-4 py-3 group focus-within:border-[var(--color-fg)]/40 focus-within:shadow-lg transition-all duration-300">
              {isSearching ? (
                <div className="w-3.5 h-3.5 border-2 border-[var(--color-fg)]/20 border-t-[var(--color-fg)] rounded-full animate-spin mr-3"></div>
              ) : (
                <Search size={14} className="opacity-40 mr-3 group-focus-within:opacity-100 transition-opacity" />
              )}
              <input 
                 type="text" 
                 placeholder={t(lang, 'searchPlaceholder')} 
                 className="bg-transparent text-[12.5px] outline-none flex-1 font-sans text-[var(--color-fg)] placeholder:opacity-40"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            <AnimatePresence>
               {isSearching && searchQuery.length > 2 && searchResults.length === 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-[var(--color-bg)]/80 backdrop-blur-sm px-4 py-2 text-[10px] uppercase tracking-widest font-bold border-x border-b border-[var(--color-fg)]/10"
                  >
                     {t(lang, 'searching')}...
                  </motion.div>
               )}
            </AnimatePresence>
            <AnimatePresence>
              {isFreehand && (
                <motion.div
                  key="done-drawing-container"
                  initial={{ opacity: 0, y: 20, x: '-50%' }}
                  animate={{ opacity: 1, y: 0, x: '-50%' }}
                  exit={{ opacity: 0, y: 20, x: '-50%' }}
                  className="fixed bottom-24 lg:bottom-10 left-1/2 z-[3000] w-auto pointer-events-auto"
                >
                  <button
                    onClick={() => setIsFreehand(false)}
                    className="bg-[var(--color-fg)] text-[var(--color-bg)] shadow-[0_10px_30px_rgba(0,0,0,0.3)] flex items-center justify-center gap-3 px-8 py-5 group hover:scale-[1.05] active:scale-95 transition-all rounded-full"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="bg-green-500 w-2.5 h-2.5 rounded-full"
                    />
                    <Check size={18} className="text-[var(--color-bg)]" />
                    <span className="text-[14px] font-bold uppercase tracking-[0.2em]">{t(lang, 'doneDrawing')}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            {searchResults.length > 0 && (
               <div className="bg-[var(--color-surface)] border border-[var(--color-fg)]/10 shadow-lg rounded-xl max-h-64 overflow-y-auto custom-scrollbar flex flex-col divide-y divide-[var(--color-fg)]/5 mt-1 overflow-hidden">
                  {searchResults.map(res => (
                     <button 
                        key={res.place_id} 
                        type="button"
                        className={`text-left px-5 py-3 transition-colors text-[12px] ${selectedResultId === res.place_id ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'hover:bg-[var(--color-fg)]/5 text-[var(--color-fg)]/90'}`}
                        onClick={() => {
                           setMapCenter([parseFloat(res.lat), parseFloat(res.lon)]);
                           setSelectedResultId(res.place_id);
                           setSelectedSearchResult(res);
                           setSearchResults([]); // Sembunyikan hasil setelah memilih
                        }}
                     >
                       <div className="flex flex-col">
                          <span className={`font-bold text-[12px] block truncate ${selectedResultId === res.place_id ? 'text-white' : 'text-[var(--color-fg)]'}`}>
                             {res.address?.name || res.display_name.split(',')[0]}
                          </span>
                          <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1.5">
                             {/* Terjemahan label manual karena locales.ts belum mendukung dynamic address keys */}
                             {res.address && (
                                <>
                                   {res.address.village && <span className={`text-[9px] uppercase tracking-tighter px-1.5 py-0.5 border border-[var(--color-fg)]/10 rounded font-bold ${selectedResultId === res.place_id ? 'border-white/40 text-white bg-white/10' : 'bg-[var(--color-fg)]/5 text-[var(--color-fg)]'}`}>Desa: {res.address.village}</span>}
                                   {res.address.suburb && <span className={`text-[9px] uppercase tracking-tighter px-1.5 py-0.5 border border-[var(--color-fg)]/10 rounded font-bold ${selectedResultId === res.place_id ? 'border-white/40 text-white bg-white/10' : 'bg-[var(--color-fg)]/5 text-[var(--color-fg)]'}`}>Kec: {res.address.suburb}</span>}
                                   {res.address.city && <span className={`text-[9px] uppercase tracking-tighter px-1.5 py-0.5 border border-[var(--color-fg)]/10 rounded font-bold ${selectedResultId === res.place_id ? 'border-white/40 text-white bg-white/10' : 'bg-[var(--color-fg)]/5 text-[var(--color-fg)]'}`}>Kota: {res.address.city}</span>}
                                   {res.address.state && <span className={`text-[9px] uppercase tracking-tighter px-1.5 py-0.5 border border-[var(--color-fg)]/10 rounded font-bold ${selectedResultId === res.place_id ? 'border-white/40 text-white bg-white/10' : 'bg-[var(--color-fg)]/5 text-[var(--color-fg)]'}`}>{res.address.state}</span>}
                                   {res.address.country && <span className={`text-[9px] uppercase tracking-tighter px-1.5 py-0.5 border border-[var(--color-fg)]/20 rounded font-bold ${selectedResultId === res.place_id ? 'border-white/60 text-white bg-white/20' : 'bg-[var(--color-fg)]/10 text-[var(--color-fg)]'}`}>{res.address.country}</span>}
                                </>
                             )}
                             {!res.address && <span className={`text-[10px] font-mono block truncate ${selectedResultId === res.place_id ? 'opacity-80' : 'opacity-60'}`}>{res.display_name}</span>}
                          </div>
                       </div>
                     </button>
                  ))}
               </div>
            )}
          </div>

          <div ref={mapRef} className="absolute inset-0 w-full h-full overflow-hidden">
            <MapWatermark />
            
            <AnimatePresence>
                {isFreehand && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: -20, x: '-50%' }}
                        className="fixed top-6 left-1/2 z-[2500] px-4 py-2 bg-[var(--color-fg)] text-[var(--color-bg)] text-[10px] uppercase font-bold tracking-[0.2em] shadow-2xl flex items-center gap-3 border border-white/20 rounded-full"
                    >
                        <div className={`w-2 h-2 rounded-full ${isDrawing ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                        {isDrawing ? "DRAWING ACTIVE" : "FREEHAND MODE ACTIVE"}
                    </motion.div>
                )}
                {isMeasuring && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: -20, x: '-50%' }}
                        className="fixed top-6 left-1/2 z-[2500] px-4 py-2 bg-[var(--color-fg)] text-[var(--color-bg)] text-[10px] uppercase font-bold tracking-[0.2em] shadow-2xl flex items-center gap-3 border border-white/20 rounded-full"
                    >
                        <div className={`w-2 h-2 rounded-full ${measurePoints.length >= 2 ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                        {measurePoints.length === 0 
                            ? "CLICK MAP TO START MEASURING" 
                            : measurePoints.length === 1 
                                ? "CLICK SECOND POINT" 
                                : `TOTAL DISTANCE: ${calculateTotalMeasureDistance(measurePoints).toFixed(2)} m (${measurePoints.length} PTS)`}
                    </motion.div>
                )}
                {isAddingMarker && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: -20, x: '-50%' }}
                        className="fixed top-6 left-1/2 z-[2500] px-4 py-2 bg-indigo-600 text-white text-[10px] uppercase font-bold tracking-[0.2em] shadow-2xl flex items-center gap-3 border border-indigo-400/30 rounded-full"
                    >
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        {lang === 'id' ? "MODE ANOTASI: KLIK MAP UNTUK MENAMBAH PENANDA" : "ANNOTATION MODE: CLICK MAP TO ADD PIN"}
                    </motion.div>
                )}
                {activeKey && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[4000] px-3 py-1.5 bg-[var(--color-fg)] text-[var(--color-bg)] text-[9px] uppercase font-bold tracking-widest shadow-2xl border border-white/20 rounded flex items-center gap-2"
                    >
                        <MousePointer2 size={10} className="animate-bounce" />
                        Adjusting: {activeKey.replace('Arrow', '')}
                    </motion.div>
                )}
            </AnimatePresence>



            <style>{`
              .leaflet-layer.custom-wms-layer {
                 filter: hue-rotate(${wmsHue}deg) invert(${wmsInvert ? 1 : 0}) !important;
              }
              ${isAddingMarker || isMeasuring || isRdtrActive ? `
                .leaflet-container, .leaflet-container *, .leaflet-grab, .leaflet-interactive {
                  cursor: crosshair !important;
                }
              ` : ''}
            `}</style>



              <button
                onClick={() => setIs3D(!is3D)}
                className="absolute top-4 right-16 z-[2000] bg-white text-black p-2 rounded shadow-md border hover:bg-gray-100 font-mono text-[10px] uppercase font-bold"
              >
                {is3D ? '2D View' : '3D View'}
              </button>
              {is3D ? (
                  <Map3D points={points} kavlings={kavlings} />
              ) : (
                <MapContainer 
                    ref={mapInstanceRef}
                    center={[-8.6705, 115.2126]} 
                    zoom={12} 
                    maxZoom={24}
                    preferCanvas={true}
                    className={`w-full h-full z-10 ${(!isEditMode || isFreehand || isMeasuring || isAddingMarker || isRdtrActive) ? 'cursor-crosshair' : ''} ${isAutoDetect ? 'cursor-help' : ''}`}
                    zoomControl={false}
                    attributionControl={false}
                >

                  <NorthArrow />
                  <UserLocationManager />
                  <MapCameraController center={mapCenter} />
                  <LayersControl position="topright">
                      <LayersControl.BaseLayer checked name="Google Satellite (HD)">
                        <TileLayer
                          attribution='&copy; Google'
                          url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                          maxZoom={24}
                          crossOrigin="anonymous"
                        />
                      </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite (Esri)">
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={24}
                  maxNativeZoom={19}
                  crossOrigin="anonymous"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Street View">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                  crossOrigin="anonymous"
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="Terrain (Esri)">
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: USGS, Esri, TANA, DeLorme, and NPS'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={13}
                  crossOrigin="anonymous"
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="Monotone (Toner)">
                <TileLayer
                  attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
                  url="https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png"
                  maxZoom={20}
                  crossOrigin="anonymous"
                />
              </LayersControl.BaseLayer>

              {/* GeoServer Dorado WMS Layers */}
              {wmsLayersList.map((layer, idx) => (
                <LayersControl.Overlay key={idx} name={layer.name.startsWith('GeoServer') ? layer.name : `GeoServer - ${layer.name}`}>
                  <WMSTileLayer
                    url="https://geo2.perare.io/geoserver/dorado/wms"
                    layers={layer.layers}
                    format="image/png"
                    transparent={true}
                    maxZoom={24}
                    opacity={wmsOpacity}
                    className="custom-wms-layer"
                    crossOrigin="anonymous"
                  />
                </LayersControl.Overlay>
              ))}

              <LayersControl.Overlay checked name="Survey Layers">
                <LayerGroup>
                  <>
                    {/* Selected Search Result Marker */}
                    {selectedSearchResult && (
                      <Marker 
                        position={[parseFloat(selectedSearchResult.lat), parseFloat(selectedSearchResult.lon)]}
                        icon={L.divIcon({
                          className: 'search-result-marker',
                          html: `<div class="relative">
                                  <div class="absolute -top-8 -left-4 bg-red-500 w-8 h-8 rounded-full rounded-bl-none rotate-45 border-2 border-white shadow-xl flex items-center justify-center">
                                    <div class="-rotate-45 text-white"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
                                  </div>
                                </div>`,
                          iconSize: [0, 0],
                          iconAnchor: [0, 0]
                        })}
                      >
                        <Popup className="custom-popup">
                          <div className="p-2 min-w-[200px]">
                            <h3 className="font-bold text-[14px] mb-1">{selectedSearchResult.address?.name || selectedSearchResult.display_name.split(',')[0]}</h3>
                            <p className="text-[11px] opacity-70 mb-3 leading-relaxed">{selectedSearchResult.display_name}</p>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                              <div className="bg-gray-100 p-2 rounded">
                                <span className="text-[8px] uppercase opacity-50 block">Latitude</span>
                                <span className="text-[10px] font-mono">{parseFloat(selectedSearchResult.lat).toFixed(6)}</span>
                              </div>
                              <div className="bg-gray-100 p-2 rounded">
                                <span className="text-[8px] uppercase opacity-50 block">Longitude</span>
                                <span className="text-[10px] font-mono">{parseFloat(selectedSearchResult.lon).toFixed(6)}</span>
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                const newPoint = { 
                                  lat: parseFloat(selectedSearchResult.lat), 
                                  lng: parseFloat(selectedSearchResult.lon), 
                                  color: DEFAULT_POINT_COLOR 
                                };
                                setPoints([...points, newPoint]);
                                setSelectedSearchResult(null);
                                setSelectedResultId(null);
                              }}
                              className="w-full py-2 bg-[var(--color-fg)] text-[var(--color-bg)] rounded text-[10px] uppercase tracking-widest font-bold hover:opacity-90 transition-opacity"
                            >
                              Tambah Titik (Center)
                            </button>
                            {selectedSearchResult.geojson && selectedSearchResult.geojson.type === 'Polygon' && (
                              <button 
                                onClick={() => {
                                  const coords = selectedSearchResult.geojson.coordinates[0];
                                  const newPoints = coords.slice(0, -1).map((c: number[]) => ({
                                    lat: c[1],
                                    lng: c[0],
                                    color: DEFAULT_POINT_COLOR,
                                  }));
                                  setPoints(newPoints);
                                  if (newPoints.length > 0) {
                                    setMapCenter([newPoints[0].lat, newPoints[0].lng]);
                                  }
                                  setSelectedSearchResult(null);
                                  setSelectedResultId(null);
                                }}
                                className="w-full mt-2 py-2 bg-orange-500 text-white rounded text-[10px] uppercase tracking-widest font-bold hover:bg-orange-600 transition-colors"
                              >
                                Ambil Polygon Area ({selectedSearchResult.geojson.coordinates[0].length - 1} Titik)
                              </button>
                            )}
                            {selectedSearchResult.geojson && selectedSearchResult.geojson.type === 'MultiPolygon' && (
                              <button 
                                onClick={() => {
                                  // Mengambil polygon pertama (terluar)
                                  const coords = selectedSearchResult.geojson.coordinates[0][0];
                                  const newPoints = coords.slice(0, -1).map((c: number[]) => ({
                                    lat: c[1],
                                    lng: c[0],
                                    color: DEFAULT_POINT_COLOR,
                                  }));
                                  setPoints(newPoints);
                                  if (newPoints.length > 0) {
                                    setMapCenter([newPoints[0].lat, newPoints[0].lng]);
                                  }
                                  setSelectedSearchResult(null);
                                  setSelectedResultId(null);
                                }}
                                className="w-full mt-2 py-2 bg-orange-500 text-white rounded text-[10px] uppercase tracking-widest font-bold hover:bg-orange-600 transition-colors"
                              >
                                Ambil Polygon Area Utama ({selectedSearchResult.geojson.coordinates[0][0].length - 1} Titik)
                              </button>
                            )}
                            <button 
                              onClick={() => setSelectedSearchResult(null)}
                              className="w-full mt-2 py-2 border border-[var(--color-fg)]/10 text-[var(--color-fg)] rounded text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)]/5 transition-colors"
                            >
                              Tutup
                            </button>
                          </div>
                        </Popup>
                      </Marker>
                    )}

                    {/* Other Saved Projects Polygons */}
                    {savedProjects.filter(p => p.id !== currentProjectId && p.points && p.points.length > 2).map((proj) => (
                      <React.Fragment key={`saved-proj-group-${proj.id}`}>
                        <Polygon
                          key={`saved-proj-${proj.id}`}
                          positions={proj.points.map((p: any) => [p.lat, p.lng])}
                          pathOptions={{
                            color: '#f97316', // Orange color to distinguish
                            fillColor: '#f97316',
                            fillOpacity: 0.15,
                            weight: 2,
                            dashArray: '5, 5',
                            lineJoin: 'miter'
                          }}
                          eventHandlers={{
                            click: (e) => {
                              L.DomEvent.stopPropagation(e as unknown as Event);
                              setConfirmProjectToLoad(proj);
                            }
                          }}
                        >
                          <Tooltip sticky direction="center" className="bg-black/80 border-none text-white font-bold text-[10px] rounded p-1">
                             {proj.name || 'Tanpa Nama'} <br/>
                             {proj.areaSqMeters?.toLocaleString('id-ID', { maximumFractionDigits: 2 }) || 0} m²
                          </Tooltip>
                        </Polygon>
                        {proj.kavlings && proj.kavlings.length > 0 && proj.kavlings.map((k: any) => (
                            <GeoJSON 
                                key={`proj-${proj.id}-kavling-${k.id}`}
                                data={k.polygon} 
                                style={() => ({
                                    color: '#f97316',
                                    weight: 1,
                                    fillColor: k.type === 'road' ? '#fed7aa' : '#ffedd5',
                                    fillOpacity: 0.2
                                })}
                                interactive={false}
                            />
                        ))}
                      </React.Fragment>
                    ))}

                    {/* Polygon */}
                    {points.length > 2 && (
                      <Polygon 
                        positions={points.map(p => [p.lat, p.lng])} 
                        pathOptions={{ 
                          color: LAND_USE_OPTIONS.find(o => o.value === landUseType)?.color || '#FFFFFF', 
                          fillColor: LAND_USE_OPTIONS.find(o => o.value === landUseType)?.color || '#FFFFFF', 
                          fillOpacity: 0.4,
                          weight: 2,
                          lineJoin: 'miter'
                        }} 
                        eventHandlers={{ 
                            click: (e) => {
                                L.DomEvent.stopPropagation(e as unknown as Event);
                                setShowPlotSizes((prev) => !prev);
                            }
                        }}
                      />
                    )}
                    
                    {/* Slope Heatmap rendering */}
                    {showSlopeHeatmap && slopeGridData.map((cell, idx) => {
                        let color = '#22c55e'; // default green < 5%
                        if (cell.slope > 15) {
                            color = '#ef4444'; // red > 15%
                        } else if (cell.slope >= 5) {
                            color = '#eab308'; // yellow 5-15%
                        }
                        return (
                            <GeoJSON 
                                key={`slope-${idx}`}
                                data={cell.poly} 
                                style={() => ({
                                    color: color,
                                    weight: 0,
                                    fillColor: color,
                                    fillOpacity: 0.6
                                })}
                            >
                                <Popup>Slope: {cell.slope.toFixed(2)}%<br/>Elev: {cell.elevation.toFixed(1)}m</Popup>
                            </GeoJSON>
                        );
                    })}

                    {/* Kavlings rendering */}
                    {showKavlings && kavlings.map(k => {
                        return (
                            <React.Fragment key={k.id}>
                                <GeoJSON 
                                    data={k.polygon} 
                                    style={() => ({
                                        color: k.type === 'road' ? '#94a3b8' : (k.type === 'remnant' ? '#d97706' : '#EAB308'),
                                        weight: 2,
                                        fillColor: k.type === 'road' ? '#e2e8f0' : (k.type === 'remnant' ? '#fef3c7' : '#FFFFFF'),
                                        fillOpacity: 0.4
                                    })}
                                />
                                {k.setbackPolygon && (
                                    <GeoJSON 
                                        data={k.setbackPolygon} 
                                        style={() => ({
                                            color: '#ef4444', // red
                                            weight: 1,
                                            dashArray: '3, 4',
                                            fillOpacity: 0
                                        })}
                                    />
                                )}
                                {k.center && k.type !== 'road' && (
                                    <>
                                        {/* Center Label (e.g. A1, 110 M2) */}
                                        <Marker position={[k.center[1], k.center[0]]} opacity={0}>
                                            <Tooltip permanent direction="center" className="leaflet-tooltip-transparent text-white font-bold opacity-100 text-center">
                                                <div style={{ fontSize: '11px', textShadow: '0 0 4px black, 0 0 2px black' }}>
                                                    {k.label}<br/>
                                                    {Math.round(k.area)} M²
                                                </div>
                                            </Tooltip>
                                        </Marker>
                                        {/* Edge lengths */}
                                        {k.edges && k.edges.map((e: any, eId: number) => {
                                            const edgeIcon = L.divIcon({
                                                className: 'bg-transparent text-[8px] font-mono font-semibold text-white whitespace-nowrap text-center !ml-[-50%] !mt-[-6px] opacity-100 pointer-events-none',
                                                html: `<div style="transform: rotate(${e.angle}deg) translateY(-8px); transform-origin: center; display: inline-block; padding: 1px 4px; background: transparent; border-radius: 4px; text-shadow: 0px 0px 3px black, 0px 0px 3px black;">${e.dist.toFixed(1)}m</div>`,
                                                iconSize: [0, 0]
                                            });
                                            return (
                                                <Marker key={`edge-${k.id}-${eId}`} position={[e.mid[1], e.mid[0]]} icon={edgeIcon} interactive={false} />
                                            );
                                        })}
                                    </>
                                )}
                            </React.Fragment>
                        );
                    })}

                    {/* Dimensional Marker Line */}
                    {points.length > 2 && stats.longestLine && showPlotSizes && (
                      <Polyline 
                        positions={[
                           [stats.longestLine.geometry.coordinates[0][1], stats.longestLine.geometry.coordinates[0][0]],
                           [stats.longestLine.geometry.coordinates[1][1], stats.longestLine.geometry.coordinates[1][0]]
                        ]}
                        pathOptions={{
                          color: '#FFFFFF',
                          dashArray: '4, 4',
                          weight: 1.5,
                          opacity: 0.8
                        }}
                      />
                    )}

                    {/* Render Edge Lengths */}
                    {showPlotSizes && stats.edges?.map((e: any, idx: number) => {
                        const labelIcon = L.divIcon({
                            className: 'bg-[var(--color-surface)] border border-[var(--color-fg)]/10 px-1.5 py-0.5 rounded text-[12px] font-mono font-bold text-[var(--color-fg)] whitespace-nowrap shadow-md text-center !ml-[-50%] !mt-[-12px] opacity-90',
                            html: `<div>${e.distance.toFixed(1)}m</div>`,
                            iconSize: undefined
                        });
                        return <Marker key={`edge-${idx}`} position={[e.midpoint.lat, e.midpoint.lng]} icon={labelIcon} />;
                    })}

                    {/* Plot points */}
                    {points.map((p, idx) => {
                      const markerIcon = L.divIcon({
                        className: `custom-div-icon group ${selectedPointIndex === idx ? 'selected' : ''}`,
                        html: `<div class="marker-inner shadow-lg transition-all duration-300" style="background-color: ${p.color || DEFAULT_POINT_COLOR}; width: 12px; height: 12px; border: 2.5px solid white; border-radius: 50%;"></div>`,
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                      });

                      return (
                        <Marker 
                          key={`point-${idx}`} 
                          position={[p.lat, p.lng]} 
                          draggable={!isFreehand}
                          icon={markerIcon}
                          zIndexOffset={selectedPointIndex === idx ? 1000 : 0}
                          eventHandlers={{
                            click: () => {
                              setSelectedPointIndex(idx);
                              setIsEditMode(true);
                              setIsFreehand(false);
                              setMapCenter([p.lat, p.lng]);
                            },
                            dragstart: () => {
                              setSelectedPointIndex(idx);
                              setIsEditMode(true);
                            },
                            drag: (e) => {
                              const marker = e.target;
                              const position = marker.getLatLng();
                              const snapResult = getSnappedLatLng(idx, position.lat, position.lng);
                              if (snapResult.isSnapped) {
                                marker.setLatLng([snapResult.lat, snapResult.lng]);
                                setSnapStatus({ lat: snapResult.lat, lng: snapResult.lng, type: snapResult.snapType });
                                handlePointDrag(idx, snapResult.lat, snapResult.lng);
                              } else {
                                setSnapStatus(null);
                                handlePointDrag(idx, position.lat, position.lng);
                              }
                            },
                            dragend: (e) => {
                              const marker = e.target;
                              const position = marker.getLatLng();
                              const snapResult = getSnappedLatLng(idx, position.lat, position.lng);
                              if (snapResult.isSnapped) {
                                marker.setLatLng([snapResult.lat, snapResult.lng]);
                                handlePointDrag(idx, snapResult.lat, snapResult.lng);
                              } else {
                                handlePointDrag(idx, position.lat, position.lng);
                              }
                              setSnapStatus(null);
                            }
                          }}
                        >
                          <Tooltip direction="right" offset={[6, 0]} className="leaflet-tooltip-transparent" opacity={1} permanent={points.length < (window.innerWidth < 768 ? 10 : 20)}>
                            <div className="flex flex-col text-[var(--color-fg)]">
                              <span className="font-bold text-[12px]">P_{String(idx + 1).padStart(2,'0')}</span>
                            </div>
                          </Tooltip>
                          <Popup offset={[0, -5]} minWidth={180}>
                            <div className="flex flex-col gap-3 p-2 min-w-[160px] text-[var(--color-fg)]">
                              <div className="flex items-center justify-between border-b border-[var(--color-fg)]/10 pb-2 mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">{t(lang, 'pointLabel')} #{idx + 1}</span>
                                <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: p.color || DEFAULT_POINT_COLOR }} />
                              </div>
                              
                              <div className="grid grid-cols-1 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] uppercase opacity-40 font-bold">{t(lang, 'latitude')}</label>
                                  <input 
                                    type="text"
                                    inputMode="decimal"
                                    value={p.lat}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      if (!isNaN(val)) handlePointDrag(idx, val, p.lng);
                                    }}
                                    className={`bg-[var(--color-bg)] border px-2 py-1 font-mono text-[11px] focus:outline-none rounded w-full text-[var(--color-fg)] transition-colors ${
                                      isNaN(p.lat) || p.lat < -90 || p.lat > 90
                                        ? 'border-red-500 text-red-500'
                                        : 'border-[var(--color-fg)]/10 focus:border-[var(--color-fg)]/40'
                                    }`}
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] uppercase opacity-40 font-bold">{t(lang, 'longitude')}</label>
                                  <input 
                                    type="text"
                                    inputMode="decimal"
                                    value={p.lng}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      if (!isNaN(val)) handlePointDrag(idx, p.lat, val);
                                    }}
                                    className={`bg-[var(--color-bg)] border px-2 py-1 font-mono text-[11px] focus:outline-none rounded w-full text-[var(--color-fg)] transition-colors ${
                                      isNaN(p.lng) || p.lng < -180 || p.lng > 180
                                        ? 'border-red-500 text-red-500' 
                                        : 'border-[var(--color-fg)]/10 focus:border-[var(--color-fg)]/40'
                                    }`}
                                  />
                                </div>
                              </div>

                              <div className="flex gap-2 pt-1">
                                <button 
                                  onClick={(e) => { 
                                    // Use a slight delay or window.confirm if needed, but here we just delete
                                    removePointAt(idx);
                                  }}
                                  className="flex-1 bg-red-600/10 text-red-600 hover:bg-red-600 hover:text-white px-2 py-1.5 text-[10px] font-bold uppercase tracking-tighter flex items-center justify-center gap-2 transition-all rounded shadow-sm"
                                >
                                  <Trash2 size={12} /> {t(lang, 'delete')}
                                </button>
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}
                  </>
                </LayerGroup>
              </LayersControl.Overlay>
            </LayersControl>
            
            {/* Custom Annotations */}
            {markers.map((m, idx) => {
                const colorMap: Record<string, string> = {
                  red: '#EF4444',
                  blue: '#3B82F6',
                  emerald: '#10B981',
                  amber: '#F59E0B',
                  purple: '#8B5CF6',
                };
                const pinBg = colorMap[m.color || 'red'] || '#EF4444';
                return (
                  <Marker 
                      key={`custom-marker-${idx}`} 
                      position={[m.lat, m.lng]} 
                      draggable={!isFreehand && !isEditMode && !isMeasuring}
                      eventHandlers={{
                          dragend: (e) => {
                              const newPos = e.target.getLatLng();
                              setMarkers(prev => {
                                  const newM = [...prev];
                                  newM[idx].lat = newPos.lat;
                                  newM[idx].lng = newPos.lng;
                                  return newM;
                              });
                          },
                          click: () => {
                              setAnnotationToDeleteIdx(idx);
                          }
                      }}
                      icon={L.divIcon({
                          className: 'custom-annotation',
                          html: `<div class="relative group">
                              <div class="absolute -top-6 -left-3 w-6 h-6 rounded-full rounded-bl-none rotate-45 border-2 border-[var(--color-bg)] shadow-xl flex items-center justify-center" style="background-color: ${pinBg}">
                                <div class="-rotate-45 block w-2 h-2 rounded-full bg-[var(--color-bg)] opacity-40"></div>
                              </div>
                          </div>`,
                          iconSize: [0, 0]
                      })}
                  >
                    <Tooltip permanent direction="bottom" offset={[0, 4]} className="!bg-[var(--color-surface)] !text-[var(--color-fg)] !border-[var(--color-fg)]/20 !font-bold !text-[10px] !uppercase !tracking-widest !shadow-xl">
                        {m.label}
                    </Tooltip>
                  </Marker>
                );
            })}

            {/* Visual Snap Feedback Indicator */}
            {snapStatus && (
              <CircleMarker 
                center={[snapStatus.lat, snapStatus.lng]}
                radius={8}
                pathOptions={{
                  color: snapStatus.type === 'vertex' ? '#10B981' : '#3B82F6',
                  weight: 2.5,
                  fillColor: snapStatus.type === 'vertex' ? '#10B981' : '#3B82F6',
                  fillOpacity: 0.35,
                  interactive: false
                }}
              />
            )}

            {/* Active RDTR Clicked Pin with animated pulse beacon */}
            {rdtrClickedPoint && (
              <Marker 
                position={[rdtrClickedPoint.lat, rdtrClickedPoint.lng]}
                icon={L.divIcon({
                  html: `
                    <div class="relative flex items-center justify-center">
                      <div class="absolute w-8 h-8 ${rdtrLoading ? 'bg-indigo-500 animate-pulse' : 'bg-fuchsia-500 animate-ping'} rounded-full opacity-65"></div>
                      <div class="relative w-4 h-4 ${rdtrLoading ? 'bg-indigo-600' : 'bg-fuchsia-600'} border-2 border-white rounded-full shadow-xl"></div>
                    </div>
                  `,
                  className: 'bg-transparent border-0',
                  iconSize: [30, 30],
                  iconAnchor: [15, 15]
                })}
              >
                <Popup className="rdtr-popup">
                  <div className="p-1 font-sans text-xs w-[240px]">
                    <div className="flex items-center gap-1.5 font-bold mb-1 border-b border-[var(--color-fg)]/10 pb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: rdtrResult?.color || '#a21caf' }} />
                      <span className="truncate">{rdtrResult ? rdtrResult.zona : (lang === 'id' ? 'Memuat RDTR...' : 'Loading RDTR...')}</span>
                    </div>
                    <div className="text-[10px] opacity-75 mb-1.5 font-mono">
                      {rdtrClickedPoint.lat.toFixed(5)}, {rdtrClickedPoint.lng.toFixed(5)}
                    </div>
                    {rdtrResult && (
                      <p className="text-[10px] leading-relaxed mb-1 italic opacity-90">
                        {rdtrResult.deskripsi}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}

            <MarkerHandler active={isAddingMarker} />
            <MapClickHandler disabled={isFreehand || isEditMode || isMeasuring || isAddingMarker} autoDetectActive={isAutoDetect} />
            <FreehandHandler 
                active={isFreehand} 
                isDrawing={isDrawing} 
                setIsDrawing={setIsDrawing} 
                setPoints={setPoints} 
            />
            <SurveyGrid active={showGrid} />
            <MeasureHandler 
                active={isMeasuring} 
                measurePoints={measurePoints} 
                setMeasurePoints={setMeasurePoints}
                t={t}
                lang={lang}
            />
            </MapContainer>
          )}
          </div>
          
          
        </section>

        {/* Right: Results Panel */}
        <aside className={`${mobileTab === 'stats' ? 'flex' : (showRightSidebar ? 'hidden lg:flex' : 'hidden')} w-full lg:w-[380px] p-5 lg:p-8 bg-[var(--color-surface)] border-l border-[var(--color-fg)]/10 flex flex-col z-[1000] shrink-0 h-full overflow-y-auto`}>
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-[12px] uppercase tracking-widest opacity-50 font-bold">02 // {t(lang, 'metricsHover')}</h2>
            <div className="flex items-center gap-4">
              <AnimatePresence>
                  {autoSaveStatus !== 'idle' && (
                      <motion.div 
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-tighter opacity-40"
                      >
                          {autoSaveStatus === 'saving' ? (
                              <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><Settings size={10} /></motion.div> {t(lang, 'autoSaving')}</>
                          ) : (
                              <><Check size={10} className="text-green-500" /> {t(lang, 'autoSaved')}</>
                          )}
                      </motion.div>
                  )}
              </AnimatePresence>
              <button className="hidden lg:block opacity-50 hover:opacity-100" onClick={() => setShowRightSidebar(false)}>
                <X size={16} />
              </button>
            </div>
          </div>
          
          <div className="mb-12">
            <label className="text-[12px] uppercase opacity-40 flex items-center justify-between mb-1 font-bold">
              <div className="flex items-center">
                Total {t(lang, 'area')}
                <MetricTooltip content={t(lang, 'areaTooltip')} />
              </div>
              <button 
                onClick={() => setAreaUnit(prev => prev === 'sqm' ? 'are' : prev === 'are' ? 'ha' : 'sqm')}
                className="text-[9px] uppercase tracking-tighter opacity-40 hover:opacity-100 hover:text-[var(--color-fg)] transition-all font-bold flex items-center gap-1"
                title={t(lang, 'toggleUnits')}
              >
                <Layers size={10} /> {t(lang, 'toggleUnits')}
              </button>
            </label>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl lg:text-6xl font-display font-extrabold leading-none tracking-tight text-[var(--color-fg)]">
                {areaUnit === 'are' 
                  ? (stats.areaAre.toLocaleString('id-ID', {maximumFractionDigits: arePrecision, minimumFractionDigits: arePrecision}))
                  : areaUnit === 'ha'
                  ? (stats.areaHectares.toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision}))
                  : (stats.areaSqMeters.toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision}))
                }
              </span>
              <span className="text-[18px] lg:text-[22px] font-display font-extrabold text-[var(--color-fg)]/60 uppercase">
                {areaUnit === 'are' ? 'are' : areaUnit === 'ha' ? 'ha' : 'm²'}
              </span>
            </div>
            <div className="mt-2 font-mono text-[15px] opacity-60">
              {areaUnit === 'are' ? (
                <>{stats.areaSqMeters.toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision})} m² ({stats.areaHectares.toFixed(areaPrecision)} ha)</>
              ) : areaUnit === 'ha' ? (
                <>{stats.areaSqMeters.toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision})} m² ({stats.areaAre.toFixed(arePrecision)} are)</>
              ) : (
                <>{stats.areaAre.toFixed(arePrecision)} are ({stats.areaHectares.toFixed(areaPrecision)} ha)</>
              )}
            </div>
            {stats.isSelfIntersecting && (
              <div className="mt-3 text-[11px] font-mono text-red-500 border border-red-500/30 bg-red-500/10 p-2 rounded-sm">
                ⚠️ <strong>PERINGATAN:</strong> Coba rapikan titik-titik koordinat. Garis batas berpotongan satu sama lain (self-intersecting) menyebabkan perhitungan luas tidak akurat.
              </div>
            )}
          </div>

          <div className="mt-8 border-t border-[var(--color-fg)]/10 pt-4">
            <label className="text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold justify-between">
              <span>Estimated Land Value</span>
              <div className="flex items-center gap-2">
                 <span className="opacity-60 text-[10px] lowercase">Rp / {areaUnit}</span>
                 <input 
                   type="number"
                   value={pricePerUnit || ''}
                   onChange={e => setPricePerUnit(Number(e.target.value))}
                   className="w-24 px-1 py-0.5 text-right bg-transparent border-b border-[var(--color-fg)]/20 focus:outline-none focus:border-[var(--color-fg)] text-[12px] font-mono text-[var(--color-fg)]"
                   placeholder="0"
                  />
              </div>
            </label>
            <div className="text-2xl lg:text-3xl font-display font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
              {pricePerUnit > 0 
                ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(pricePerUnit * (areaUnit === 'are' ? stats.areaAre : areaUnit === 'ha' ? stats.areaHectares : stats.areaSqMeters))
                : <span className="opacity-30">Rp 0,00</span>
              }
            </div>
            {njopEstimate && (
              <div className="mt-3 text-[10px] font-mono opacity-60 bg-[var(--color-fg)]/5 p-2 border-l-2 border-[var(--color-accent)]">
                <strong className="block mb-1 text-[var(--color-fg)]">💡 Estimasi NJOP Regional:</strong>
                {njopEstimate}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-8 mt-6">
            <div className="border-t border-[var(--color-fg)]/10 pt-4 text-[var(--color-fg)]">
              <label className="text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold">
                {t(lang, 'estLength')} × {t(lang, 'estWidth')} (MBR)
                <MetricTooltip content={t(lang, 'mbrTooltip')} />
              </label>
              <div className="text-2xl font-display font-bold tracking-tight text-[var(--color-fg)]/90">
                {stats.length > 0 ? stats.length.toLocaleString('id-ID', {maximumFractionDigits: 2}) : "0.00"}<span className="text-[14px] font-medium opacity-50 ml-1">m</span> 
                <span className="mx-2 text-[14px] opacity-25">×</span> 
                {stats.width > 0 ? stats.width.toLocaleString('id-ID', {maximumFractionDigits: 2}) : "0.00"}<span className="text-[14px] font-medium opacity-50 ml-1">m</span>
              </div>
            </div>

            <div className="border-t border-[var(--color-fg)]/10 pt-4 text-[var(--color-fg)]">
              <label className="text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold">
                Total {t(lang, 'perimeter')}
                <MetricTooltip content={t(lang, 'perimeterTooltip')} />
              </label>
              <div className="text-2xl font-display font-bold tracking-tight text-[var(--color-fg)]/90">
                {stats.perimeter > 0 ? stats.perimeter.toLocaleString('id-ID', {maximumFractionDigits: 2}) : "0.00"}<span className="text-[14px] font-medium opacity-50 ml-1">m</span>
              </div>
            </div>

            {points.length >= 3 && (
            <div className="border-t border-[var(--color-fg)]/10 pt-4 text-[var(--color-fg)]">
              <label className="text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold justify-between">
                <div className="flex items-center gap-1">Elevasi / Topografi Lahan <MetricTooltip content="Profil elevasi/ketinggian disepanjang batas lahan (diambil via Open-Meteo API)." /></div>
                {isFetchingElevation && <div className="w-3 h-3 border-2 border-[var(--color-fg)] border-t-transparent animate-spin rounded-full" />}
              </label>
              {elevationStats ? (
                  <div className="mt-2">
                     <div className="flex gap-4 mb-2 text-[10px] font-mono opacity-80 uppercase">
                         <div>Min: <span className="font-bold text-[12px]">{elevationStats.min.toFixed(1)}m</span></div>
                         <div>Max: <span className="font-bold text-[12px]">{elevationStats.max.toFixed(1)}m</span></div>
                         <div>Diff: <span className="font-bold text-[12px] text-orange-500">{elevationStats.diff.toFixed(1)}m</span></div>
                     </div>
                     <div className="w-full h-24 mb-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={elevationProfile} margin={{top: 5, right:0, left:0, bottom:0}}>
                               <defs>
                                  <linearGradient id="colorElev" x1="0" y1="0" x2="0" y2="1">
                                     <stop offset="5%" stopColor="var(--color-fg)" stopOpacity={0.3}/>
                                     <stop offset="95%" stopColor="var(--color-fg)" stopOpacity={0}/>
                                  </linearGradient>
                               </defs>
                                <RechartsTooltip 
                                    contentStyle={{backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-fg)', fontSize:'10px', color: 'var(--color-fg)', fontFamily:'monospace'}} 
                                    labelFormatter={(val) => `Jarak: ${Number(val).toFixed(0)}m`} 
                                    formatter={(val: number) => [`${val.toFixed(1)}m`, 'Elevasi']}
                                />
                                <Area type="monotone" dataKey="elevation" stroke="var(--color-fg)" strokeWidth={1} fillOpacity={1} fill="url(#colorElev)" isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                     </div>
                  </div>
              ) : (
                  <div className="text-[10px] uppercase font-mono opacity-40 italic mt-2">Sedang memuat data elevasi...</div>
              )}
            </div>
            )}

            {points.length >= 3 && (
            <div className="border-t border-[var(--color-fg)]/10 pt-4 text-[var(--color-fg)]">
                <label className="text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold justify-between">
                  <span>Slope Heatmap (BETA)</span>
                </label>
                
                {!showSlopeHeatmap && slopeGridData.length === 0 ? (
                    <button 
                       onClick={handleGenerateSlopeHeatmap}
                       disabled={isFetchingSlope}
                       className="w-full bg-transparent border border-[var(--color-fg)]/20 py-2 text-[10px] uppercase font-bold hover:bg-[var(--color-fg)] hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                       {isFetchingSlope && <div className="w-3 h-3 border-2 border-[var(--color-fg)] border-t-transparent animate-spin rounded-full" />}
                       {isFetchingSlope ? "Menghitung Slope..." : "Tampilkan Slope Heatmap"}
                    </button>
                ) : (
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[10px] uppercase font-bold cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={showSlopeHeatmap}
                                onChange={(e) => setShowSlopeHeatmap(e.target.checked)}
                            />
                            Tampilkan Overlay Slope di Peta
                        </label>
                        <div className="flex gap-2">
                           <div className="w-1/3 text-center text-[9px]"><div className="h-2 w-full mb-1 opacity-60" style={{backgroundColor: '#22c55e'}}></div>{'< 5% (Datar)'}</div>
                           <div className="w-1/3 text-center text-[9px]"><div className="h-2 w-full mb-1 opacity-60" style={{backgroundColor: '#eab308'}}></div>{'5-15%'}</div>
                           <div className="w-1/3 text-center text-[9px]"><div className="h-2 w-full mb-1 opacity-60" style={{backgroundColor: '#ef4444'}}></div>{'> 15% (Curam)'}</div>
                        </div>
                        <button 
                           onClick={handleGenerateSlopeHeatmap}
                           disabled={isFetchingSlope}
                           className="mt-2 w-full bg-transparent border border-[var(--color-fg)]/20 py-2 text-[10px] uppercase font-bold hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-all disabled:opacity-50"
                        >
                           Hitung Ulang Slope
                        </button>
                    </div>
                )}
            </div>
            )}


            {points.length >= 3 && (
            <div className="border-t border-[var(--color-fg)]/10 pt-4 text-[var(--color-fg)]">
              <label className="text-[12px] uppercase opacity-40 flex items-center mb-1 font-bold justify-between">
                <span>{lang === 'id' ? 'Zonasi & Tutupan Lahan' : 'Zoning & Land Cover'}</span>
                <MetricTooltip content={lang === 'id' ? 'Estimasi persentase tutupan lahan berdasarkan kategori zonasi di dalam bidang tanah yang digambar.' : 'Estimated land cover percentage by zoning categories within the drawn land shape.'} />
              </label>

              {/* Stacked visualization bar */}
              <div className="h-3.5 w-full rounded-md overflow-hidden flex my-3 shadow-inner bg-gray-200 dark:bg-gray-800">
                {zoning.residential > 0 && (
                  <div 
                    title={`Residensial: ${zoning.residential}%`}
                    style={{ width: `${zoning.residential}%` }} 
                    className="bg-indigo-500 h-full transition-all duration-300"
                  />
                )}
                {zoning.agricultural > 0 && (
                  <div 
                    title={`Pertanian: ${zoning.agricultural}%`}
                    style={{ width: `${zoning.agricultural}%` }} 
                    className="bg-emerald-500 h-full transition-all duration-300"
                  />
                )}
                {zoning.commercial > 0 && (
                  <div 
                    title={`Komersial: ${zoning.commercial}%`}
                    style={{ width: `${zoning.commercial}%` }} 
                    className="bg-amber-500 h-full transition-all duration-300"
                  />
                )}
              </div>

              {/* Interactive sliders */}
              <div className="space-y-3 mb-4">
                {/* Residential slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono font-bold">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block"></span>{lang === 'id' ? 'Residensial' : 'Residential'}</span>
                    <span>{zoning.residential}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="100"
                    value={zoning.residential}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const remaining = 100 - val;
                      const currentOthersSum = zoning.agricultural + zoning.commercial;
                      let v1 = 0;
                      if (currentOthersSum === 0) {
                        v1 = Math.round(remaining / 2);
                      } else {
                        v1 = Math.round((zoning.agricultural / currentOthersSum) * remaining);
                      }
                      const v2 = remaining - v1;
                      setZoning({
                        residential: val,
                        agricultural: v1,
                        commercial: v2
                      });
                    }}
                    className="w-full h-1 bg-[var(--color-fg)]/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* Agricultural slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono font-bold">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>{lang === 'id' ? 'Pertanian' : 'Agricultural'}</span>
                    <span>{zoning.agricultural}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="100"
                    value={zoning.agricultural}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const remaining = 100 - val;
                      const currentOthersSum = zoning.residential + zoning.commercial;
                      let v1 = 0;
                      if (currentOthersSum === 0) {
                        v1 = Math.round(remaining / 2);
                      } else {
                        v1 = Math.round((zoning.residential / currentOthersSum) * remaining);
                      }
                      const v2 = remaining - v1;
                      setZoning({
                        residential: v2,
                        agricultural: val,
                        commercial: v1
                      });
                    }}
                    className="w-full h-1 bg-[var(--color-fg)]/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                {/* Commercial slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono font-bold">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>{lang === 'id' ? 'Komersial' : 'Commercial'}</span>
                    <span>{zoning.commercial}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="100"
                    value={zoning.commercial}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const remaining = 100 - val;
                      const currentOthersSum = zoning.residential + zoning.agricultural;
                      let v1 = 0;
                      if (currentOthersSum === 0) {
                        v1 = Math.round(remaining / 2);
                      } else {
                        v1 = Math.round((zoning.residential / currentOthersSum) * remaining);
                      }
                      const v2 = remaining - v1;
                      setZoning({
                        residential: v1,
                        agricultural: v2,
                        commercial: val
                      });
                    }}
                    className="w-full h-1 bg-[var(--color-fg)]/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              </div>

              {/* Statistics Table */}
              <div className="bg-[var(--color-fg)]/5 rounded-xl border border-[var(--color-fg)]/10 overflow-hidden font-mono text-[11px]">
                <table className="w-full divide-y divide-[var(--color-fg)]/10 text-left">
                  <thead className="bg-[var(--color-fg)]/5 text-[10px] uppercase font-bold tracking-wider opacity-60">
                    <tr>
                      <th className="px-3 py-2">{lang === 'id' ? 'Jenis Zonasi' : 'Zone Type'}</th>
                      <th className="px-3 py-2 text-right">Share</th>
                      <th className="px-3 py-2 text-right">{lang === 'id' ? 'Luas Bidang' : 'Calculated Area'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-fg)]/5">
                    {/* Residential Row */}
                    <tr>
                      <td className="px-3 py-2.5 font-bold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500"></span>{lang === 'id' ? 'Residensial' : 'Residential'}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{zoning.residential}%</td>
                      <td className="px-3 py-2.5 text-right text-[var(--color-fg)]/90">
                        {areaUnit === 'are' 
                          ? ((stats.areaAre * (zoning.residential / 100)).toLocaleString('id-ID', {maximumFractionDigits: arePrecision, minimumFractionDigits: arePrecision}))
                          : areaUnit === 'ha'
                          ? ((stats.areaHectares * (zoning.residential / 100)).toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision}))
                          : ((stats.areaSqMeters * (zoning.residential / 100)).toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision}))
                        } {areaUnit === 'are' ? 'are' : areaUnit === 'ha' ? 'ha' : 'm²'}
                      </td>
                    </tr>
                    {/* Agricultural Row */}
                    <tr>
                      <td className="px-3 py-2.5 font-bold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>{lang === 'id' ? 'Pertanian' : 'Agricultural'}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{zoning.agricultural}%</td>
                      <td className="px-3 py-2.5 text-right text-[var(--color-fg)]/90">
                        {areaUnit === 'are' 
                          ? ((stats.areaAre * (zoning.agricultural / 100)).toLocaleString('id-ID', {maximumFractionDigits: arePrecision, minimumFractionDigits: arePrecision}))
                          : areaUnit === 'ha'
                          ? ((stats.areaHectares * (zoning.agricultural / 100)).toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision}))
                          : ((stats.areaSqMeters * (zoning.agricultural / 100)).toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision}))
                        } {areaUnit === 'are' ? 'are' : areaUnit === 'ha' ? 'ha' : 'm²'}
                      </td>
                    </tr>
                    {/* Commercial Row */}
                    <tr>
                      <td className="px-3 py-2.5 font-bold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span>{lang === 'id' ? 'Komersial' : 'Commercial'}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{zoning.commercial}%</td>
                      <td className="px-3 py-2.5 text-right text-[var(--color-fg)]/90">
                        {areaUnit === 'are' 
                          ? ((stats.areaAre * (zoning.commercial / 100)).toLocaleString('id-ID', {maximumFractionDigits: arePrecision, minimumFractionDigits: arePrecision}))
                          : areaUnit === 'ha'
                          ? ((stats.areaHectares * (zoning.commercial / 100)).toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision}))
                          : ((stats.areaSqMeters * (zoning.commercial / 100)).toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision}))
                        } {areaUnit === 'are' ? 'are' : areaUnit === 'ha' ? 'ha' : 'm²'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            )}


            <div className="border-t border-[var(--color-fg)]/10 pt-4 text-[var(--color-fg)]">
              <label className="text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold">
                Auto Kavling (BETA)
                <MetricTooltip content="Automatically subdivide area with a road" />
              </label>
              
              {kavlings.length > 0 && (
                <div className="mb-3 space-y-2">
                    <div className="flex justify-between items-center text-[11px] font-mono border-b border-[var(--color-fg)]/10 pb-1">
                        <span>Total Plot Dijual:</span>
                        <span className="font-bold text-[13px]">{kavlings.filter(k => k.type !== 'road').length} Unit</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] uppercase tracking-wider">
                        <span>Fasos / Jalan:</span>
                        <span className="font-mono font-bold text-red-500">
                            {Math.round(kavlings.filter(k => k.type === 'road').reduce((a, b) => a + (b.area || 0), 0))} m²
                        </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] uppercase tracking-wider mb-2">
                        <span>Total Luas Kavling:</span>
                        <span className="font-mono font-bold text-green-600">
                            {Math.round(kavlings.filter(k => k.type !== 'road').reduce((a, b) => a + (b.area || 0), 0))} m²
                        </span>
                    </div>
                    <label className="flex items-center gap-2 text-[10px] uppercase font-bold cursor-pointer mt-2 pt-2 border-t border-[var(--color-fg)]/10">
                        <input 
                            type="checkbox" 
                            checked={showKavlings} 
                            onChange={(e) => setShowKavlings(e.target.checked)}
                            className="accent-[var(--color-fg)]"
                        />
                        Tampilkan Overlay Kavling
                    </label>
                </div>
              )}

              <button 
                  onClick={() => setActiveModal('kavling')}
                  disabled={points.length < 3}
                  className="w-full mt-1 py-3 bg-[var(--color-fg)]/5 hover:bg-[var(--color-fg)]/10 border border-[var(--color-fg)]/20 text-[12px] uppercase tracking-widest font-bold transition-all text-[var(--color-fg)] disabled:opacity-30 flex items-center justify-center gap-2"
              >
                  <MapPin size={14} /> Setup Subdivision
              </button>
            </div>
          </div>

          <div className="mt-auto pt-8 space-y-4">
            <button 
              onClick={() => setActiveModal('export')}
              disabled={points.length === 0}
              className="w-full py-4 bg-[var(--color-fg)] text-[var(--color-bg)] text-[12px] uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
            >
              <Download size={16} /> {t(lang, 'exportData')}
            </button>
            

            
            <div className="p-4 bg-[var(--color-bg)] border-l-2 border-[var(--color-fg)] flex items-center justify-between">
              <span className="text-[12px] uppercase tracking-wider font-bold">Project Status</span>
              {points.length < 3 ? (
                <span className="text-[12px] uppercase px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-bold">Draft</span>
              ) : (
                <span className="text-[12px] uppercase px-2 py-1 bg-[var(--color-fg)]/10 text-[var(--color-fg)] rounded font-bold">Verified</span>
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* Mobile Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-fg)]/10 z-[3000] flex justify-around items-center px-2 py-3 shadow-[0_-5px_25px_rgba(0,0,0,0.1)]">
        {(['map', 'points', 'stats'] as const).map((tab) => (
            <button 
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex flex-col items-center gap-1.5 min-w-[80px] transition-all relative ${mobileTab === tab ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg)]/40'}`}
            >
              <div className={`p-2 rounded-xl transition-all duration-300 ${mobileTab === tab ? 'bg-[var(--color-fg)] text-[var(--color-bg)] scale-110 shadow-lg' : 'hover:bg-[var(--color-fg)]/5'}`}>
                {tab === 'map' && <Layout size={22} />}
                {tab === 'points' && <MapPin size={22} />}
                {tab === 'stats' && <BarChart2 size={22} />}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider transition-opacity duration-300 ${mobileTab === tab ? 'opacity-100' : 'opacity-60'}`}>
                {t(lang, `${tab}Tab`)}
              </span>
              {mobileTab === tab && (
                <motion.div 
                  layoutId="activeTabIndicator"
                  className="absolute -bottom-1.5 w-1 h-1 rounded-full bg-[var(--color-fg)]" 
                />
              )}
            </button>
        ))}
      </div>
    </div>
  );
}
