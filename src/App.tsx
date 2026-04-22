import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, useMapEvents, CircleMarker, Tooltip, Polyline, Marker, useMap, Popup, LayersControl, LayerGroup } from 'react-leaflet';
import * as turf from '@turf/turf';
import { MapPin, Eraser, Trash2, Crosshair, HelpCircle, ArrowLeft, Ruler, Plus, Download, Search, Sun, Moon, ZoomIn, ZoomOut, Info, Pencil, MousePointer2, Check, Settings, Layers, FileJson, Table, Layout, BarChart2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import L from 'leaflet';
import { motion, AnimatePresence } from 'motion/react';
import { translations, Language, t } from './locales';

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
    <div className="absolute inset-0 pointer-events-none z-[1500] overflow-hidden opacity-[0.18] select-none flex flex-wrap content-start justify-center gap-16 p-4">
      {Array.from({ length: 200 }).map((_, i) => (
        <div 
          key={i} 
          className="whitespace-nowrap transform -rotate-12 text-[10px] font-bold uppercase tracking-[0.3em] text-[#FFD700]"
          style={{ width: 'fit-content' }}
        >
          Ncung Gallagher
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

// === HELPER UNTUK MENGHITUNG SPASIAL (TURF.JS) ===
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

    // 1. Luas berbasis sferis (Spherical Geometry)
    const areaSqMeters = turf.area(polygon);
    const areaHectares = areaSqMeters / 10000;
    const areaAre = areaSqMeters / 100;

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

    return { areaSqMeters, areaHectares, areaAre, perimeter, length: maxLength, width, longestLine, edges };
  } catch (e) {
    console.error("Kesalahan dalam memproses poligon:", e);
    return { areaSqMeters: 0, areaHectares: 0, areaAre: 0, perimeter: 0, length: 0, width: 0, longestLine: null, edges: [] };
  }
}

// === KOMPONEN UTAMA ===
export default function App() {
  const [points, setPoints] = useState<{lat: number, lng: number, color: string}[]>([]);
  const [stats, setStats] = useState(calculateStats([]));
  const [manualInput, setManualInput] = useState({ lat: '', lng: '' });

  const mapRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Search State
  const [mapCenter, setMapCenter] = useState<[number, number] | null>([-8.6705, 115.2126]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [isFreehand, setIsFreehand] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  // Modal State
  const [activeModal, setActiveModal] = useState<'none' | 'library' | 'settings' | 'export'>('none');
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [newProjectName, setNewProjectName] = useState('');

  // Settings State
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [showGrid, setShowGrid] = useState(true);
  const [areaUnit, setAreaUnit] = useState<'are' | 'ha' | 'sqm'>('are');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [lang, setLang] = useState<Language>('en');
  const [areaPrecision, setAreaPrecision] = useState<number>(() => Number(localStorage.getItem('calcare_area_precision')) || 4);
  const [arePrecision, setArePrecision] = useState<number>(() => {
    const val = localStorage.getItem('calcare_are_precision');
    return val === null ? 2 : Number(val);
  });
  const [mobileTab, setMobileTab] = useState<'map' | 'points' | 'stats'>('map');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  
  // Custom Sync State
  const [gasUrl, setGasUrl] = useState('https://script.google.com/macros/s/AKfycbxjLsv05ASo9hM6zK2juoKtcX9gUypBupmEkt6IrSHE5335_Z7kktHOcIz23BVtIFIELA/exec');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingUpSheet, setIsSettingUpSheet] = useState(false);

  useEffect(() => {
    localStorage.setItem('calcare_area_unit', areaUnit);
  }, [areaUnit]);

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

  useEffect(() => {
    // Auto-save logic
    if (points.length === 0) {
      if (currentProjectId) {
          // If points are cleared manually, maybe we don't auto-clear the project in library?
          // But we should clear the draft.
          localStorage.removeItem('calcare_points_draft');
      }
      return;
    }

    setAutoSaveStatus('saving');
    const timer = setTimeout(() => {
      // 1. Save to draft workspace
      localStorage.setItem('calcare_points_draft', JSON.stringify(points));
      localStorage.setItem('calcare_current_id', String(currentProjectId));

      // 2. If editing a library project, update it
      if (currentProjectId) {
        setSavedProjects(prev => {
          const updated = prev.map(p => {
            if (p.id === currentProjectId) {
              return { 
                ...p, 
                points, 
                date: new Date().toISOString(),
                areaSqMeters: stats.areaSqMeters,
                perimeter: stats.perimeter
              };
            }
            return p;
          });
          localStorage.setItem('geocalc_projects', JSON.stringify(updated));
          return updated;
        });
      }
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    }, 2000); // 2 second debounce

    return () => clearTimeout(timer);
  }, [points, currentProjectId, stats.areaSqMeters, stats.perimeter]);

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

  const handlePointDrag = (index: number, newLat: number, newLng: number) => {
    // Clamp or ignore invalid values
    const lat = Math.max(-90, Math.min(90, newLat));
    const lng = Math.max(-180, Math.min(180, newLng));
    
    setPoints(prev => {
      const next = [...prev];
      next[index] = { ...next[index], lat, lng };
      return next;
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

  const handleSearch = async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!searchQuery.trim()) return;
      try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(searchQuery)}`);
          const data = await res.json();
          setSearchResults(data);
      } catch (err) {
          console.error("Search failed", err);
      }
  };

  // Nav Handlers
  const handleExport = async () => {
    if (!mapRef.current) return;
    setIsExporting(true);
    
    try {
        // Capture Map Div using html-to-image to support modern CSS like oklab
        const imgData = await toPng(mapRef.current, { 
            cacheBust: true,
            backgroundColor: '#EBEBE8',
            pixelRatio: 2 // High res export
        });
        
        // Generate PDF
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        // Title Header
        const margin = 15;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(22);
        pdf.setTextColor(26, 26, 26);
        pdf.text("Calcare Surveyor Report", margin, 22);
        
        pdf.setLineWidth(0.5);
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, 26, pdfWidth - margin, 26);
        
        // Format datetime nicely
        const readableDate = new Intl.DateTimeFormat('en-US', {
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(new Date());
        
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(100);
        pdf.text(`Generated: ${readableDate}`, margin, 32);
        pdf.text(`Project Ref: GEO-${Date.now().toString().slice(-6)}`, pdfWidth - margin, 32, { align: "right" });
        
        // Draw Image
        const imgProps = pdf.getImageProperties(imgData);
        const imgY = 40;
        const widthToDraw = pdfWidth - (margin * 2);
        const heightToDraw = (imgProps.height * widthToDraw) / imgProps.width;
        
        pdf.addImage(imgData, 'PNG', margin, imgY, widthToDraw, heightToDraw);
        
        // Draw border around the map image
        pdf.setDrawColor(150, 150, 150);
        pdf.setLineWidth(0.3);
        pdf.rect(margin, imgY, widthToDraw, heightToDraw);
        
        // Draw Metrics Header
        let currentY = imgY + heightToDraw + 15;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(26, 26, 26);
        pdf.text("GEOSPATIAL METRICS", margin, currentY);
        
        currentY += 4;
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, currentY, pdfWidth - margin, currentY);
        currentY += 8;
        
        // Metrics Content
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
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
        pdf.text(areaText, margin + 40, currentY);
        currentY += 6;

        pdf.text(`Total Perimeter:`, margin, currentY);
        pdf.text(`${stats.perimeter.toFixed(2)} m`, margin + 40, currentY);
        currentY += 6;
        
        if (stats.length > 0) {
            pdf.text(`Max Dimensions:`, margin, currentY);
            pdf.text(`${stats.length.toFixed(2)} m (L) x ${stats.width.toFixed(2)} m (W)`, margin + 40, currentY);
            currentY += 6;
        }
        
        // Left Column: Boundary Coordinates | Right Column: Edge Measurements
        currentY += 10;
        const colStart1 = margin;
        const colStart2 = margin + (widthToDraw / 2) + 5;
        
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(26, 26, 26);
        pdf.text("BOUNDARY COORDINATES", colStart1, currentY);
        if (stats.edges && stats.edges.length > 0) {
            pdf.text("EDGE MEASUREMENTS", colStart2, currentY);
        }
        
        currentY += 4;
        pdf.line(colStart1, currentY, colStart1 + (widthToDraw / 2) - 10, currentY);
        if (stats.edges && stats.edges.length > 0) {
            pdf.line(colStart2, currentY, colStart2 + (widthToDraw / 2) - 10, currentY);
        }
        currentY += 7;
        
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(50, 50, 50);
        
        const listStartY = currentY;
        
        // Draw Coordinates in Left Column
        points.forEach((p, idx) => {
            if (currentY > pdfHeight - 20) { 
                pdf.addPage(); 
                currentY = 20; 
            }
            // Draw color indicator
            const colorRgb = hexToRgb(p.color || DEFAULT_POINT_COLOR);
            if (colorRgb) {
                pdf.setFillColor(colorRgb.r, colorRgb.g, colorRgb.b);
                pdf.rect(colStart1, currentY - 3, 2, 2, 'F');
            }
            pdf.text(`P${String(idx + 1).padStart(2,'0')}: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`, colStart1 + 4, currentY);
            currentY += 6; // Ditingkatkan spasi vertikal agar tidak sempit
        });
        
        // Reset Y and Draw Edges in Right Column
        let rightY = listStartY;
        if (stats.edges && stats.edges.length > 0) {
            stats.edges.forEach((e: any, idx: number) => {
                if (rightY > pdfHeight - 20) { 
                    /* Simplified logic: assumes edges fit on same page as coords or breaks similarly */
                    if(currentY <= 20) { rightY = 20; } 
                }
                const nextIdx = (idx + 1) === points.length ? 0 : idx + 1;
                // Menggunakan '->' alih-alih lambang panah unicode agar tidak bug font encoding di jsPDF
                pdf.text(`P${idx+1} -> P${nextIdx+1}: ${e.distance.toFixed(2)} m`, colStart2, rightY);
                rightY += 6; // Menambahkan sedikit ruang untuk spacing line yang lebih lega
            });
        }
        
        pdf.save(`Calcare_Report_${Date.now()}.pdf`);
        setActiveModal('none');
    } catch (err) {
        console.error("PDF generation failed:", err);
        alert("Gagal membuat PDF. Coba kembali.");
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

     const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
     const url = URL.createObjectURL(blob);
     const link = document.createElement("a");
     link.href = url;
     link.download = `calcare_points_${new Date().getTime()}.csv`;
     link.click();
     URL.revokeObjectURL(url);
     setActiveModal('none');
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    
    setIsSyncing(true);

    const newProj = { 
        id: Date.now(), 
        name: newProjectName, 
        points, 
        date: new Date().toISOString(),
        areaSqMeters: stats.areaSqMeters,
        perimeter: stats.perimeter
    };
    
    // Local Save
    const updated = [newProj, ...savedProjects];
    setSavedProjects(updated);
    localStorage.setItem('geocalc_projects', JSON.stringify(updated));
    setNewProjectName('');
    setCurrentProjectId(newProj.id);
    setActiveModal('none');

    // Google Sheets Sync
    if (gasUrl.trim()) {
        try {
            await fetch(gasUrl, {
                method: "POST",
                headers: {
                   "Content-Type": "text/plain;charset=utf-8",
                },
                body: JSON.stringify(newProj)
            });
            console.log("Sync request sent");
        } catch (err: any) {
            console.error("Failed to sync to Google Sheets", err);
        }
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
    setPoints(proj.points);
    setCurrentProjectId(proj.id);
    localStorage.setItem('calcare_points_draft', JSON.stringify(proj.points));
    localStorage.setItem('calcare_current_id', String(proj.id));
    setActiveModal('none');
    setSearchResults([]);
    setSearchQuery('');
  };

  const deleteProject = (id: number) => {
    const updated = savedProjects.filter(p => p.id !== id);
    setSavedProjects(updated);
    localStorage.setItem('geocalc_projects', JSON.stringify(updated));
  };

  const MapClickHandler = ({ disabled }: { disabled?: boolean }) => {
    useMapEvents({
      click(e) {
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
                <CircleMarker 
                    key={`measure-p-${i}`} 
                    center={p} 
                    radius={5} 
                    pathOptions={{ color: '#EAB308', fillColor: '#EAB308', fillOpacity: 0.8 }} 
                >
                    <Tooltip permanent direction="top" offset={[0, -5]}>
                        <span className="text-[9px] font-bold uppercase">M_{i+1}</span>
                    </Tooltip>
                </CircleMarker>
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
                            className: 'bg-[var(--color-surface)] border border-[#EAB308]/40 px-2 py-1 rounded text-[11px] font-bold text-[#EAB308] shadow-lg !w-auto !h-auto whitespace-nowrap text-center',
                            html: `<div>Total: ${calculateTotalMeasureDistance(measurePoints).toFixed(2)} m</div>`
                        })}
                        offset={[0, -20]}
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

const CustomZoomControl = () => {
    const map = useMap();
    return (
      <div className="absolute top-1/2 -translate-y-1/2 right-6 flex flex-col gap-2 z-[1000]">
        <button 
          onClick={(e) => { 
            e.preventDefault(); 
            e.stopPropagation(); 
            setIsMeasuring(!isMeasuring);
            if (!isMeasuring) {
                setIsFreehand(false);
                setIsEditMode(false);
                setMeasurePoints([]);
            }
          }}
          className={`w-10 h-10 border shadow-lg flex items-center justify-center transition-all ${isMeasuring ? 'bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]' : 'bg-white dark:bg-black border-[#1A1A1A]/20 dark:border-white/20 text-[#1A1A1A] dark:text-white hover:bg-[#F7F7F5] dark:hover:bg-[#121212]'}`}
          title={t(lang, 'measureTool')}
        >
          <Ruler size={18} />
        </button>

        <div className="h-px bg-[var(--color-fg)]/10 my-1 mx-2" />

        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); map.zoomIn(); }}
          className="w-10 h-10 bg-white dark:bg-black border border-[#1A1A1A]/20 dark:border-white/20 shadow-lg flex items-center justify-center text-[#1A1A1A] dark:text-white hover:bg-[#F7F7F5] dark:hover:bg-[#121212] transition-colors"
          title="Zoom In"
        >
          <ZoomIn size={18} />
        </button>
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); map.zoomOut(); }}
          className="w-10 h-10 bg-white dark:bg-black border border-[#1A1A1A]/20 dark:border-white/20 shadow-lg flex items-center justify-center text-[#1A1A1A] dark:text-white hover:bg-[#F7F7F5] dark:hover:bg-[#121212] transition-colors"
          title="Zoom Out"
        >
          <ZoomOut size={18} />
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[var(--color-bg)] font-sans text-[var(--color-fg)] overflow-hidden">
      
      {/* Modals Overlay */}
      {activeModal !== 'none' && (
        <div className="fixed inset-0 bg-[var(--color-bg)]/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-fg)]/20 shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-6 border-b border-[var(--color-fg)]/10">
                    <h3 className="font-serif italic text-[22px]">
                        {activeModal === 'library' && 'Project Library'}
                        {activeModal === 'settings' && 'UTM Settings'}
                        {activeModal === 'export' && 'Export Data'}
                    </h3>
                    <button onClick={() => setActiveModal('none')} className="text-[12px] uppercase tracking-widest font-bold opacity-50 hover:opacity-100">Close [X]</button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {/* Library Modal */}
                    {activeModal === 'library' && (
                        <div className="space-y-8">
                            <div>
                                <form onSubmit={handleSaveProject} className="flex gap-2">
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
                                            <div key={proj.id} className="border border-[var(--color-fg)]/10 p-3 flex justify-between flex-col gap-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="font-bold text-[15px] tracking-tight">{proj.name}</div>
                                                        <div className="text-[12px] font-mono opacity-50">{new Date(proj.date).toLocaleDateString()} • {proj.points.length} {t(lang, 'points')}</div>
                                                    </div>
                                                    <button onClick={() => deleteProject(proj.id)} className="text-red-500 opacity-60 hover:opacity-100 text-[12px] uppercase font-bold">{t(lang, 'delete')}</button>
                                                </div>
                                                <button onClick={() => loadProject(proj)} className="w-full border border-[var(--color-fg)]/20 py-2 text-[12px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-white transition-colors">{t(lang, 'loadProject')}</button>
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
                            
                            <div className="bg-[var(--color-bg)] p-4 border border-[var(--color-fg)]/10 text-[13px] font-mono opacity-70 whitespace-pre-line">
                                <strong>{t(lang, 'crsInfoTitle')}</strong><br/>
                                {t(lang, 'crsInfoText')}
                            </div>
                        </div>
                    )}

                    {/* Export Modal */}
                    {activeModal === 'export' && (
                        <div className="space-y-4">
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

                            <button onClick={handleExport} disabled={isExporting} className="w-full bg-[var(--color-fg)] text-white py-3 text-[12px] uppercase tracking-widest font-bold mt-4 disabled:opacity-50 flex justify-center items-center gap-2 transition-all">
                                {isExporting ? t(lang, 'generating') : <><Download size={14} /> {t(lang, 'exportPdfBtn')}</>}
                            </button>

                            <div className="grid grid-cols-2 gap-2 mt-4">
                               <button onClick={handleExportGeoJSON} disabled={points.length < 3} className="bg-transparent border border-[var(--color-fg)]/20 text-[var(--color-fg)] py-2 text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-white transition-all flex justify-center items-center gap-2 disabled:opacity-30">
                                  <FileJson size={14} /> {t(lang, 'exportGeoJSON')}
                               </button>
                               <button onClick={handleExportCSV} disabled={points.length === 0} className="bg-transparent border border-[var(--color-fg)]/20 text-[var(--color-fg)] py-2 text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-white transition-all flex justify-center items-center gap-2 disabled:opacity-30">
                                  <Table size={14} /> {t(lang, 'exportCSV')}
                               </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      <header className="flex justify-between items-center px-4 md:px-10 py-4 md:py-6 border-b border-[var(--color-fg)]/10 bg-[var(--color-bg)] z-[2000] sticky top-0">
        <div className="flex flex-col md:flex-row md:items-baseline gap-0 md:gap-2">
          <span className="text-[20px] md:text-[26px] font-serif italic font-bold tracking-tight">Calcare</span>
          <span className="text-[10px] md:text-[12px] uppercase tracking-widest opacity-50 hidden sm:inline">V.1 by Rifky Rangga</span>
        </div>
        <div className="flex items-center gap-3 md:gap-8">
          <nav className="hidden lg:flex gap-8 text-[12px] uppercase tracking-widest font-semibold">
            <button onClick={() => setActiveModal('none')} className={`cursor-pointer pb-1 ${activeModal === 'none' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>{t(lang, 'surveyorMode')}</button>
            <button onClick={() => setActiveModal('library')} className={`cursor-pointer pb-1 ${activeModal === 'library' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>{t(lang, 'projectLibrary')}</button>
            <button onClick={() => setActiveModal('settings')} className={`cursor-pointer pb-1 ${activeModal === 'settings' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>{t(lang, 'utmSettings')}</button>
            <button onClick={() => setActiveModal('export')} className={`cursor-pointer pb-1 ${activeModal === 'export' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>{t(lang, 'exportData')}</button>
          </nav>

          <div className="flex lg:hidden items-center gap-2">
             <button onClick={() => setActiveModal('library')} className="p-2 border border-[var(--color-fg)]/10 rounded"><Layers size={16} className="opacity-70"/></button>
             <button onClick={() => setActiveModal('settings')} className="p-2 border border-[var(--color-fg)]/10 rounded"><Settings size={16} className="opacity-70" /></button>
          </div>
          
          <div className="flex items-center gap-2">
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
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative mb-[64px] md:mb-0">
        
        {/* Sidebar: Input Points */}
        <aside className={`${mobileTab === 'points' ? 'flex' : 'hidden md:flex'} w-full md:w-[300px] lg:w-[350px] border-r border-[var(--color-fg)]/10 p-5 lg:p-8 flex flex-col bg-[var(--color-bg)] md:h-full shrink-0 z-[1000] overflow-hidden`}>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[12px] uppercase tracking-widest opacity-50 font-bold">{t(lang, 'inputCoordsHeader')}</h2>
            <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${isFreehand ? 'bg-orange-500 text-white' : isEditMode ? 'bg-blue-500 text-white' : 'bg-green-500 text-white'}`}>
              {isFreehand ? t(lang, 'freehand') : isEditMode ? t(lang, 'editMode') : t(lang, 'addMode')}
            </div>
          </div>
          
          <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar min-h-0">
            {points.map((p, idx) => (
              <div 
                key={idx} 
                onClick={() => {
                   setMapCenter([p.lat, p.lng]);
                   setSelectedPointIndex(idx);
                }}
                className={`p-4 border shadow-sm flex flex-col group relative transition-all cursor-pointer hover:border-[var(--color-fg)]/40 hover:shadow-md ${selectedPointIndex === idx ? 'border-[var(--color-fg)] ring-1 ring-[var(--color-fg)] ring-inset' : ''} ${isEditMode ? 'border-[var(--color-fg)] bg-[var(--color-fg)]/5' : 'border-[var(--color-fg)]/20 bg-[var(--color-surface)]'}`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-[12px] font-mono font-bold ${isEditMode ? 'opacity-100' : 'opacity-40'}`}>
                    {t(lang, 'pointLabel')}_{String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-2 pr-6">
                    <input 
                      type="color" 
                      value={p.color || DEFAULT_POINT_COLOR}
                      onChange={(e) => { e.stopPropagation(); handleColorChange(idx, e.target.value); }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded-full overflow-hidden cursor-pointer border-none p-0 bg-transparent"
                      title="Point Color"
                    />
                    <button 
                      onClick={(e) => { e.stopPropagation(); removePointAt(idx); }} 
                      className={`${isEditMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} text-[var(--color-fg)] hover:text-red-600 transition-all absolute right-2 top-2 p-1`}
                    >
                      <Trash2 size={14} />
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
                              // Allow partial input like '-'
                              setPoints(prev => {
                                const next = [...prev];
                                // We use a hacky way to store non-numeric temporary state or just keep the previous value
                                return prev; 
                              });
                            }
                          }}
                          className={`bg-transparent border-b font-mono text-[13px] focus:outline-none transition-colors ${
                            isNaN(p.lat) || p.lat < -90 || p.lat > 90
                              ? 'border-red-500 text-red-500'
                              : 'border-[var(--color-fg)]/20 focus:border-[var(--color-fg)]'
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
                          className={`bg-transparent border-b font-mono text-[13px] text-right focus:outline-none transition-colors ${
                            isNaN(p.lng) || p.lng < -180 || p.lng > 180
                              ? 'border-red-500 text-red-500'
                              : 'border-[var(--color-fg)]/20 focus:border-[var(--color-fg)]'
                          }`}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-[13px]">{p.lat.toFixed(6)}</span>
                      <span className="font-mono text-[13px] text-right">{p.lng.toFixed(6)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {/* Input Form as "Add Next" Box - Hidden in Edit Mode */}
            {!isEditMode && (
              <form onSubmit={handleManualAdd} className="p-4 border border-dashed border-[var(--color-fg)]/20 opacity-60 hover:opacity-100 hover:bg-[var(--color-surface)] transition-colors">
                <div className="flex gap-2">
                  <input 
                    type="text"
                    inputMode="decimal"
                    placeholder={t(lang, 'latitude')} 
                    value={manualInput.lat}
                    onChange={e => setManualInput({...manualInput, lat: e.target.value})}
                    className={`flex-1 w-full border bg-transparent px-2 py-1 text-[13px] font-mono focus:outline-none transition-colors ${
                      manualInput.lat && (isNaN(parseFloat(manualInput.lat)) || parseFloat(manualInput.lat) < -90 || parseFloat(manualInput.lat) > 90)
                        ? 'border-red-500 text-red-500' 
                        : 'border-[var(--color-fg)]/20 focus:border-[var(--color-fg)]'
                    }`}
                    required
                  />
                  <input 
                    type="text"
                    inputMode="decimal"
                    placeholder={t(lang, 'longitude')} 
                    value={manualInput.lng}
                    onChange={e => setManualInput({...manualInput, lng: e.target.value})}
                    className={`flex-1 w-full border bg-transparent px-2 py-1 text-[13px] font-mono focus:outline-none transition-colors ${
                      manualInput.lng && (isNaN(parseFloat(manualInput.lng)) || parseFloat(manualInput.lng) < -180 || parseFloat(manualInput.lng) > 180)
                        ? 'border-red-500 text-red-500' 
                        : 'border-[var(--color-fg)]/20 focus:border-[var(--color-fg)]'
                    }`}
                    required
                  />
                </div>
                <button type="submit" className="w-full mt-3 text-[12px] uppercase tracking-tighter font-bold flex items-center justify-center gap-1 opacity-80 cursor-pointer">
                  <Plus size={12} /> {t(lang, 'addNextCoord')}
                </button>
              </form>
            )}
            
            {!isEditMode && points.length === 0 && (
              <div className="text-center py-12 px-4 border border-dashed border-[var(--color-fg)]/10">
                <p className="text-[12px] uppercase tracking-widest opacity-30 italic">{t(lang, 'noPointsYet')}</p>
              </div>
            )}
          </div>
          
          {(points.length > 0 || measurePoints.length > 0) && (
            <div className="mt-8 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button 
                   onClick={() => {
                     const next = !isEditMode;
                     setIsEditMode(next);
                     if (next) {
                       setIsFreehand(false);
                       setIsMeasuring(false);
                     }
                   }}
                   className={`w-full border py-4 text-[12px] uppercase tracking-widest font-bold transition-colors flex justify-center items-center gap-2 ${isEditMode ? 'bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]' : 'bg-transparent border-[var(--color-fg)] text-[var(--color-fg)] hover:bg-[var(--color-fg)]/5'}`}
                >
                  <MousePointer2 size={14} /> 
                  {isEditMode ? t(lang, 'editModeActive') : t(lang, 'editMode')}
                </button>
                <button 
                  onClick={() => {
                    const next = !isFreehand;
                    setIsFreehand(next);
                    if (next) {
                      setIsEditMode(false);
                      setIsMeasuring(false);
                    }
                  }}
                  className={`w-full border py-4 text-[12px] uppercase tracking-widest font-bold transition-colors flex justify-center items-center gap-2 ${isFreehand ? 'bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]' : 'bg-transparent border-[var(--color-fg)] text-[var(--color-fg)] hover:bg-[var(--color-fg)]/5'}`}
                >
                  <Pencil size={14} /> 
                  {isFreehand ? t(lang, 'freehandActive') : t(lang, 'freehand')}
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={handleUndo} 
                  className="w-full border border-[var(--color-fg)] text-[var(--color-fg)] bg-transparent py-4 text-[12px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-colors flex justify-center items-center gap-2"
                >
                  <ArrowLeft size={14} /> {t(lang, 'undo')}
                </button>
                <button 
                  onClick={handleClear} 
                  className="w-full border border-[var(--color-fg)] text-[var(--color-bg)] bg-[var(--color-fg)] py-4 text-[12px] uppercase tracking-widest font-bold hover:bg-red-700 hover:border-red-700 transition-colors flex justify-center items-center gap-2"
                >
                  <Eraser size={14} /> {t(lang, 'clear')}
                </button>
              </div>
            </div>
          )}
          
          <div className="mt-8 text-center text-[12px] font-mono uppercase tracking-widest opacity-30 select-none">
             ©2026 All Rights Reserved
          </div>
        </aside>

        {/* Main: Map Visualization */}
        <section className={`${mobileTab === 'map' ? 'block' : 'hidden md:block'} flex-1 bg-[var(--color-map)] relative isolate h-full md:h-auto`}>
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#1A1A1A 1px, transparent 1px)', backgroundSize: '20px 20px', zIndex: 0 }}></div>
          
          {/* Floating Search Container */}
          <div className="absolute top-4 left-4 right-4 md:left-6 md:right-auto md:w-[320px] z-[2000] flex flex-col gap-1">
            <form onSubmit={handleSearch} className="bg-[var(--color-surface)] border border-[var(--color-fg)]/30 shadow-md flex items-center px-4 py-3 group focus-within:border-[var(--color-fg)]">
              <Search size={14} className="opacity-50 mr-3 group-focus-within:opacity-100 transition-opacity" />
              <input 
                 type="text" 
                 placeholder={t(lang, 'searchPlaceholder')} 
                 className="bg-transparent text-[13px] outline-none flex-1 font-sans text-[var(--color-fg)] placeholder:opacity-50"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            <AnimatePresence>
              {isFreehand && (
                <motion.div
                  key="done-drawing-container"
                  initial={{ opacity: 0, y: 20, x: '-50%' }}
                  animate={{ opacity: 1, y: 0, x: '-50%' }}
                  exit={{ opacity: 0, y: 20, x: '-50%' }}
                  className="fixed bottom-24 md:bottom-10 left-1/2 z-[3000] w-auto pointer-events-auto"
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
               <div className="bg-[var(--color-surface)] border border-[var(--color-fg)]/20 shadow-lg max-h-64 overflow-y-auto custom-scrollbar flex flex-col divide-y divide-[var(--color-fg)]/10">
                  {searchResults.map(res => (
                     <button 
                        key={res.place_id} 
                        type="button"
                        className={`text-left px-5 py-3 transition-colors ${selectedResultId === res.place_id ? 'bg-[var(--color-fg)] text-white' : 'hover:bg-[var(--color-bg)] text-[var(--color-fg)]'}`}
                        onClick={() => {
                           setMapCenter([parseFloat(res.lat), parseFloat(res.lon)]);
                           setSelectedResultId(res.place_id);
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

            <MapContainer 
              center={[-8.6705, 115.2126]} 
            zoom={12} 
            maxZoom={24}
            className={`w-full h-full z-10 ${isFreehand || isMeasuring ? 'cursor-crosshair' : ''}`}
            zoomControl={false}
            attributionControl={false}
          >
            <CustomZoomControl />
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
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="Terrain (Esri)">
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: USGS, Esri, TANA, DeLorme, and NPS'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={13}
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="Monotone (Toner)">
                <TileLayer
                  attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
                  url="https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png"
                  maxZoom={20}
                />
              </LayersControl.BaseLayer>

              <LayersControl.Overlay checked name="Survey Layers">
                <LayerGroup>
                  <>
                    {/* Polygon */}
                    {points.length > 2 && (
                      <Polygon 
                        positions={points.map(p => [p.lat, p.lng])} 
                        pathOptions={{ 
                          color: '#FFFFFF', 
                          fillColor: '#FFFFFF', 
                          fillOpacity: 0.15,
                          weight: 2,
                          lineJoin: 'miter'
                        }} 
                      />
                    )}

                    {/* Dimensional Marker Line */}
                    {points.length > 2 && stats.longestLine && (
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
                    {stats.edges?.map((e: any, idx: number) => {
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
                        className: `custom-div-icon ${selectedPointIndex === idx ? 'selected' : ''}`,
                        html: `<div class="marker-inner" style="background-color: ${p.color || DEFAULT_POINT_COLOR}; width: 10px; height: 10px; border: 2px solid white; border-radius: 50%;"></div>`,
                        iconSize: [10, 10],
                        iconAnchor: [5, 5]
                      });

                      return (
                        <Marker 
                          key={`point-${idx}-${p.lat}-${p.lng}`} 
                          position={[p.lat, p.lng]} 
                          draggable={isEditMode && !isFreehand && selectedPointIndex === idx}
                          icon={markerIcon}
                          zIndexOffset={selectedPointIndex === idx ? 1000 : 0}
                          eventHandlers={{
                            click: () => {
                              setSelectedPointIndex(idx);
                              setIsEditMode(true);
                              setIsFreehand(false);
                            },
                            dragstart: () => {
                              setSelectedPointIndex(idx);
                              setIsEditMode(true);
                            },
                            drag: (e) => {
                              const marker = e.target;
                              const position = marker.getLatLng();
                              handlePointDrag(idx, position.lat, position.lng);
                            },
                            dragend: (e) => {
                              const marker = e.target;
                              const position = marker.getLatLng();
                              handlePointDrag(idx, position.lat, position.lng);
                            }
                          }}
                        >
                          <Tooltip direction="right" offset={[6, 0]} opacity={1} permanent={points.length < (window.innerWidth < 768 ? 10 : 20)}>
                            <div className="flex flex-col text-[var(--color-fg)]">
                              <span className="font-bold text-[12px]">P_{String(idx + 1).padStart(2,'0')}</span>
                              <span className="text-[10px] font-mono opacity-70">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span>
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
            
            <MapClickHandler disabled={isFreehand || isEditMode || isMeasuring} />
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
          </div>
          
          
        </section>

        {/* Right: Results Panel */}
        <aside className={`${mobileTab === 'stats' ? 'flex' : 'hidden md:flex'} w-full md:w-[320px] lg:w-[380px] p-5 lg:p-8 bg-[var(--color-surface)] border-l border-[var(--color-fg)]/10 flex flex-col z-[1000] shrink-0 md:h-full overflow-y-auto`}>
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-[12px] uppercase tracking-widest opacity-50 font-bold">02 // {t(lang, 'metricsHover')}</h2>
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
              <span className="text-6xl lg:text-7xl font-serif font-light leading-none tracking-tighter">
                {areaUnit === 'are' 
                  ? (stats.areaAre.toLocaleString('id-ID', {maximumFractionDigits: arePrecision, minimumFractionDigits: arePrecision}))
                  : areaUnit === 'ha'
                  ? (stats.areaHectares.toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision}))
                  : (stats.areaSqMeters.toLocaleString('id-ID', {maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision}))
                }
              </span>
              <span className="text-[22px] font-serif italic">
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
          </div>

          <div className="grid grid-cols-1 gap-8">
            <div className="border-t border-[var(--color-fg)]/10 pt-4 text-[var(--color-fg)]">
              <label className="text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold">
                {t(lang, 'estLength')} × {t(lang, 'estWidth')} (MBR)
                <MetricTooltip content={t(lang, 'mbrTooltip')} />
              </label>
              <div className="text-[20px] font-serif">
                {stats.length > 0 ? stats.length.toLocaleString('id-ID', {maximumFractionDigits: 2}) : "0.00"} <span className="text-[15px] italic opacity-60">m</span> 
                <span className="mx-2 opacity-20 font-sans">×</span> 
                {stats.width > 0 ? stats.width.toLocaleString('id-ID', {maximumFractionDigits: 2}) : "0.00"} <span className="text-[15px] italic opacity-60">m</span>
              </div>
            </div>

            <div className="border-t border-[var(--color-fg)]/10 pt-4 text-[var(--color-fg)]">
              <label className="text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold">
                Total {t(lang, 'perimeter')}
                <MetricTooltip content={t(lang, 'perimeterTooltip')} />
              </label>
              <div className="text-[20px] font-serif">
                {stats.perimeter > 0 ? stats.perimeter.toLocaleString('id-ID', {maximumFractionDigits: 2}) : "0.00"} <span className="text-[15px] italic opacity-60">m</span>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-8">
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
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-fg)]/10 z-[3000] flex justify-around items-center px-2 py-3 shadow-[0_-5px_25px_rgba(0,0,0,0.1)]">
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
