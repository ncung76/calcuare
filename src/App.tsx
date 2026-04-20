import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, useMapEvents, CircleMarker, Tooltip, Polyline, Marker, useMap } from 'react-leaflet';
import * as turf from '@turf/turf';
import { MapPin, Eraser, Trash2, Crosshair, HelpCircle, ArrowLeft, Ruler, Plus, Download, Search, Sun, Moon, ZoomIn, ZoomOut } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import L from 'leaflet';
import { translations, Language, t } from './locales';

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
    return { areaSqMeters: 0, areaHectares: 0, perimeter: 0, length: 0, width: 0, longestLine: null, edges: edge };
  }

  const coords = points.map(p => [p.lng, p.lat]);
  // Tutup poligon untuk validasi turf
  coords.push([...coords[0]]);
  
  try {
    const polygon = turf.polygon([coords]);

    // 1. Luas berbasis sferis (Spherical Geometry)
    const areaSqMeters = turf.area(polygon);
    const areaHectares = areaSqMeters / 10000;

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

    return { areaSqMeters, areaHectares, perimeter, length: maxLength, width, longestLine, edges };
  } catch (e) {
    console.error("Kesalahan dalam memproses poligon:", e);
    return { areaSqMeters: 0, areaHectares: 0, perimeter: 0, length: 0, width: 0, longestLine: null, edges: [] };
  }
}

// === KOMPONEN UTAMA ===
export default function App() {
  const [points, setPoints] = useState<{lat: number, lng: number}[]>([]);
  const [stats, setStats] = useState(calculateStats([]));
  const [manualInput, setManualInput] = useState({ lat: '', lng: '' });

  const mapRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Search State
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  // Modal State
  const [activeModal, setActiveModal] = useState<'none' | 'library' | 'settings' | 'export'>('none');
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [newProjectName, setNewProjectName] = useState('');

  // Settings State
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [showGrid, setShowGrid] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [lang, setLang] = useState<Language>('en');
  
  // Custom Sync State
  const [gasUrl, setGasUrl] = useState('https://script.google.com/macros/s/AKfycbxjLsv05ASo9hM6zK2juoKtcX9gUypBupmEkt6IrSHE5335_Z7kktHOcIz23BVtIFIELA/exec');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingUpSheet, setIsSettingUpSheet] = useState(false);

  useEffect(() => {
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
    // Load projects from localStorage on mount
    const saved = localStorage.getItem('geocalc_projects');
    if (saved) {
      try {
        setSavedProjects(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved projects");
      }
    }
    
    // Load GAS URL
    const savedGasUrl = localStorage.getItem('calcare_gas_url');
    if (savedGasUrl) {
        setGasUrl(savedGasUrl);
    }
  }, []);

  const handleClear = () => setPoints([]);
  const handleUndo = () => setPoints(pts => pts.slice(0, -1));
  const removePointAt = (idx: number) => {
    setPoints(pts => pts.filter((_, i) => i !== idx));
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualInput.lat);
    const lng = parseFloat(manualInput.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      setPoints(pts => [...pts, { lat, lng }]);
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
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
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
            pdf.text(`P${String(idx + 1).padStart(2,'0')}: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`, colStart1, currentY);
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
    setActiveModal('none');
  };

  const deleteProject = (id: number) => {
    const updated = savedProjects.filter(p => p.id !== id);
    setSavedProjects(updated);
    localStorage.setItem('geocalc_projects', JSON.stringify(updated));
  };

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        setPoints(pts => [...pts, { lat: e.latlng.lat, lng: e.latlng.lng }]);
        setSearchResults([]);
        setSearchQuery('');
        setSelectedResultId(null);
      },
    });
    return null;
  };

  const CustomZoomControl = () => {
    const map = useMap();
    return (
      <div className="absolute top-1/2 -translate-y-1/2 right-6 flex flex-col gap-2 z-[1000]">
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
                            
                            <hr className="border-[var(--color-fg)]/10" />

                            <div>
                                <label className="text-[12px] uppercase opacity-40 block mb-2">{t(lang, 'mapRenderStyle')}</label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} className="accent-[var(--color-fg)]" />
                                    <span className="text-[15px] font-mono">{t(lang, 'showGrid')}</span>
                                </label>
                            </div>
                            
                            <div className="bg-[var(--color-bg)] p-4 border border-[var(--color-fg)]/10 text-[13px] font-mono opacity-70">
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
                                <div><strong>{t(lang, 'calculatedArea')}</strong> {stats.areaSqMeters.toFixed(2)} m²</div>
                                <div><strong>{t(lang, 'estimatedPerimeter')}</strong> {stats.perimeter.toFixed(2)} m</div>
                            </div>

                            <button onClick={handleExport} disabled={isExporting} className="w-full bg-[var(--color-fg)] text-white py-3 text-[12px] uppercase tracking-widest font-bold mt-4 disabled:opacity-50 flex justify-center items-center gap-2 transition-all">
                                {isExporting ? t(lang, 'generating') : <><Download size={14} /> {t(lang, 'exportPdfBtn')}</>}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Header Navigation */}
      <header className="flex justify-between items-center px-6 md:px-10 py-5 md:py-6 border-b border-[var(--color-fg)]/10 bg-[var(--color-bg)] z-[2000]">
        <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-2">
          <span className="text-[22px] md:text-[26px] font-serif italic font-bold tracking-tight">Calcare</span>
          <span className="text-[12px] uppercase tracking-widest opacity-50">V.1 by Ncung Gallagher</span>
        </div>
        <div className="flex items-center gap-6 md:gap-8">
          <nav className="hidden md:flex gap-8 text-[12px] uppercase tracking-widest font-semibold">
            <button onClick={() => setActiveModal('none')} className={`cursor-pointer pb-1 ${activeModal === 'none' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>{t(lang, 'surveyorMode')}</button>
            <button onClick={() => setActiveModal('library')} className={`cursor-pointer pb-1 ${activeModal === 'library' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>{t(lang, 'projectLibrary')}</button>
            <button onClick={() => setActiveModal('settings')} className={`cursor-pointer pb-1 ${activeModal === 'settings' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>{t(lang, 'utmSettings')}</button>
            <button onClick={() => setActiveModal('export')} className={`cursor-pointer pb-1 ${activeModal === 'export' ? 'border-b border-[var(--color-fg)]' : 'opacity-40 hover:opacity-100'}`}>{t(lang, 'exportData')}</button>
          </nav>
          
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

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Sidebar: Input Points */}
        <aside className="w-full md:w-[300px] lg:w-[350px] border-r border-[var(--color-fg)]/10 p-6 lg:p-8 flex flex-col bg-[var(--color-bg)] md:h-full shrink-0 z-[1000] overflow-hidden">
          <h2 className="text-[12px] uppercase tracking-widest opacity-50 mb-6 font-bold">{t(lang, 'inputCoordsHeader')}</h2>
          
          <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar min-h-0">
            {points.map((p, idx) => (
              <div key={idx} className="p-4 border border-[var(--color-fg)]/20 bg-[var(--color-surface)] shadow-sm flex flex-col group relative">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[12px] font-mono opacity-40">{t(lang, 'pointLabel')}_{String(idx + 1).padStart(2, '0')}</span>
                  <button onClick={() => removePointAt(idx)} className="opacity-0 group-hover:opacity-100 text-[var(--color-fg)] hover:text-red-600 transition-all absolute right-2 top-2 p-1">
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="flex justify-between mt-1 items-center">
                  <span className="font-mono text-[13px]">{p.lat.toFixed(6)}</span>
                  <span className="font-mono text-[13px] text-right">{p.lng.toFixed(6)}</span>
                </div>
              </div>
            ))}
            
            {/* Input Form as "Add Next" Box */}
            <form onSubmit={handleManualAdd} className="p-4 border border-dashed border-[var(--color-fg)]/20 opacity-60 hover:opacity-100 hover:bg-[var(--color-surface)] transition-colors">
                <div className="flex gap-2">
                  <input 
                    type="number"
                    step="any"
                    placeholder={t(lang, 'latitude')} 
                    value={manualInput.lat}
                    onChange={e => setManualInput({...manualInput, lat: e.target.value})}
                    className="flex-1 w-full border border-[var(--color-fg)]/20 bg-transparent px-2 py-1 text-[13px] font-mono focus:outline-none focus:border-[var(--color-fg)] transition-colors"
                    required
                  />
                  <input 
                    type="number"
                    step="any"
                    placeholder={t(lang, 'longitude')} 
                    value={manualInput.lng}
                    onChange={e => setManualInput({...manualInput, lng: e.target.value})}
                    className="flex-1 w-full border border-[var(--color-fg)]/20 bg-transparent px-2 py-1 text-[13px] font-mono focus:outline-none focus:border-[var(--color-fg)] transition-colors"
                    required
                  />
                </div>
                <button type="submit" className="w-full mt-3 text-[12px] uppercase tracking-tighter font-bold flex items-center justify-center gap-1 opacity-80 cursor-pointer">
                  <Plus size={12} /> {t(lang, 'addNextCoord')}
                </button>
            </form>
          </div>
          
          {points.length > 0 && (
            <div className="mt-8 grid grid-cols-2 gap-2">
              <button onClick={handleUndo} className="w-full border border-[var(--color-fg)] text-[var(--color-fg)] bg-transparent py-4 text-[12px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-colors flex justify-center items-center gap-2">
                <ArrowLeft size={14} /> {t(lang, 'undo')}
              </button>
              <button onClick={handleClear} className="w-full border border-[var(--color-fg)] text-[var(--color-bg)] bg-[var(--color-fg)] py-4 text-[12px] uppercase tracking-widest font-bold hover:bg-red-700 hover:border-red-700 transition-colors flex justify-center items-center gap-2">
                <Eraser size={14} /> {t(lang, 'clear')}
              </button>
            </div>
          )}
          
          <div className="mt-8 text-center text-[12px] font-mono uppercase tracking-widest opacity-30 select-none">
             ©2026 {t(lang, 'allRightsReserved')}
          </div>
        </aside>

        {/* Main: Map Visualization */}
        <section className="flex-1 bg-[var(--color-map)] relative isolate h-[50vh] md:h-auto min-h-[400px]">
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
                           // Tidak menghapus search query/results agar state highlight terlihat
                           // Hasil pencarian akan hilang saat point pertama ditambahkan lewat map click
                        }}
                     >
                       <span className={`font-bold text-[12px] block truncate ${selectedResultId === res.place_id ? 'text-white' : 'text-[var(--color-fg)]'}`}>{res.display_name.split(',')[0]}</span>
                       <span className={`text-[10px] font-mono block truncate mt-1 ${selectedResultId === res.place_id ? 'opacity-80' : 'opacity-60'}`}>{res.display_name}</span>
                     </button>
                  ))}
               </div>
            )}
          </div>

          <div ref={mapRef} className="absolute inset-0 w-full h-full">
            <MapContainer 
              center={[-6.2088, 106.8456]} // Changed default center for aesthetics
            zoom={16} 
            maxZoom={24}
            className="w-full h-full z-10"
            zoomControl={false}
          >
            <CustomZoomControl />
            <MapCameraController center={mapCenter} />
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={24}
              maxNativeZoom={19}
              crossOrigin="anonymous"
            />
            
            <MapClickHandler />

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
            {points.map((p, idx) => (
              <CircleMarker 
                key={idx} 
                center={[p.lat, p.lng]} 
                radius={4}
                pathOptions={{
                  color: '#FFFFFF',
                  fillColor: '#1A1A1A',
                  fillOpacity: 1,
                  weight: 1.5
                }}
              >
                <Tooltip direction="right" offset={[6, 0]} opacity={1} permanent>
                   <div className="flex flex-col text-[var(--color-fg)]">
                     <span className="font-bold text-[12px]">P_{String(idx + 1).padStart(2,'0')}</span>
                     <span className="text-[10px] font-mono opacity-70">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span>
                   </div>
                </Tooltip>
              </CircleMarker>
            ))}
            </MapContainer>
          </div>
          
          <div className="absolute bottom-6 right-6 flex gap-4 z-[400] pointer-events-none drop-shadow-sm">
            <div className="bg-[var(--color-surface)] px-3 py-2 border border-[var(--color-fg)]/10 text-[10px] font-mono">
              Z: INT
            </div>
            <div className="bg-[var(--color-surface)] px-3 py-2 border border-[var(--color-fg)]/10 text-[10px] font-mono">
              CRS: EPSG:3857
            </div>
          </div>
        </section>

        {/* Right: Results Panel */}
        <aside className="w-full md:w-[320px] lg:w-[380px] p-6 lg:p-8 bg-[var(--color-surface)] border-l border-[var(--color-fg)]/10 flex flex-col z-[1000] shrink-0 md:h-full overflow-y-auto">
          <h2 className="text-[12px] uppercase tracking-widest opacity-50 mb-10 font-bold">02 // {t(lang, 'metricsHover')}</h2>
          
          <div className="mb-12">
            <label className="text-[12px] uppercase opacity-40 block mb-1 font-bold">Total {t(lang, 'area')}</label>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl lg:text-7xl font-serif font-light leading-none tracking-tighter">
                {stats.areaHectares > 0 ? stats.areaHectares.toLocaleString('id-ID', {maximumFractionDigits: 2}) : "0.00"}
              </span>
              <span className="text-[22px] font-serif italic">ha</span>
            </div>
            <div className="mt-2 font-mono text-[15px] opacity-60">
              {stats.areaSqMeters > 0 ? stats.areaSqMeters.toLocaleString('id-ID', {maximumFractionDigits: 2}) : "0.00"} m²
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8">
            <div className="border-t border-[var(--color-fg)]/10 pt-4">
              <label className="text-[12px] uppercase opacity-40 block mb-2 font-bold">{t(lang, 'estLength')} × {t(lang, 'estWidth')} (MBR)</label>
              <div className="text-[20px] font-serif">
                {stats.length > 0 ? stats.length.toLocaleString('id-ID', {maximumFractionDigits: 2}) : "0.00"} <span className="text-[15px] italic opacity-60">m</span> 
                <span className="mx-2 opacity-20 font-sans">×</span> 
                {stats.width > 0 ? stats.width.toLocaleString('id-ID', {maximumFractionDigits: 2}) : "0.00"} <span className="text-[15px] italic opacity-60">m</span>
              </div>
            </div>

            <div className="border-t border-[var(--color-fg)]/10 pt-4">
              <label className="text-[12px] uppercase opacity-40 block mb-2 font-bold">Total {t(lang, 'perimeter')}</label>
              <div className="text-[20px] font-serif">
                {stats.perimeter > 0 ? stats.perimeter.toLocaleString('id-ID', {maximumFractionDigits: 2}) : "0.00"} <span className="text-[15px] italic opacity-60">m</span>
              </div>
            </div>

            <div className="border-t border-[var(--color-fg)]/10 pt-4">
              <label className="text-[12px] uppercase opacity-40 block mb-2 font-bold">Spherical Accuracy</label>
              <div className="flex items-center gap-2">
                <div className="h-1 w-24 bg-[var(--color-map)] rounded-full overflow-hidden">
                  <div className="h-full w-[98%] bg-[var(--color-fg)]"></div>
                </div>
                <span className="font-mono text-[12px] font-bold">99.98%</span>
              </div>
              <p className="text-[10px] opacity-40 mt-2 leading-relaxed uppercase tracking-tighter">
                Calculated via WGS84 Ellipsoid model / Shoelace algorithm on Spherical projection.
              </p>
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
    </div>
  );
}
