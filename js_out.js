import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, WMSTileLayer, Polygon, useMapEvents, Tooltip, Polyline, Marker, useMap, Popup, LayersControl, LayerGroup, GeoJSON } from "react-leaflet";
import * as turf from "@turf/turf";
import { LogOut, MapPin, Eraser, Trash2, Crosshair, HelpCircle, ArrowLeft, Plus, Download, Search, Sun, Moon, ZoomIn, ZoomOut, Pencil, MousePointer2, Check, Settings, Layers, FileJson, Table, Layout, BarChart2, Share2, Link, Menu } from "lucide-react";
import { jsPDF } from "jspdf";
import L from "leaflet";
import { motion, AnimatePresence } from "motion/react";
import { t } from "./locales";
import Drawing from "dxf-writer";
import * as utm from "utm";
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};
const MetricTooltip = ({ content }) => {
  const [isVisible, setIsVisible] = useState(false);
  return /* @__PURE__ */ jsxs("div", { className: "relative inline-block ml-1.5 group", children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        onMouseEnter: () => setIsVisible(true),
        onMouseLeave: () => setIsVisible(false),
        className: "opacity-40 hover:opacity-100 transition-opacity p-0.5",
        children: /* @__PURE__ */ jsx(HelpCircle, { size: 11 })
      }
    ),
    /* @__PURE__ */ jsx(AnimatePresence, { children: isVisible && /* @__PURE__ */ jsx(
      motion.div,
      {
        initial: { opacity: 0, scale: 0.95, y: 5 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 5 },
        transition: { duration: 0.15, ease: "easeOut" },
        className: "absolute bottom-full left-0 mb-2 w-48 bg-[var(--color-fg)] text-[var(--color-bg)] p-3 text-[10px] font-sans font-medium uppercase tracking-tight leading-relaxed shadow-xl z-[3000] rounded-sm after:content-[''] after:absolute after:top-full after:left-2 after:border-8 after:border-transparent after:border-t-[var(--color-fg)]",
        children: content
      }
    ) })
  ] });
};
const Toggle = ({ checked, onChange, label }) => /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between cursor-pointer group", onClick: () => onChange(!checked), children: [
  /* @__PURE__ */ jsx("span", { className: "text-[15px] font-mono", children: label }),
  /* @__PURE__ */ jsx(
    "div",
    {
      className: `relative w-10 h-5 transition-colors duration-200 rounded-full ${checked ? "bg-[var(--color-fg)]" : "bg-[var(--color-fg)]/20"}`,
      children: /* @__PURE__ */ jsx("div", { className: `absolute top-1 left-1 w-3 h-3 transition-transform duration-200 bg-[var(--color-bg)] rounded-full ${checked ? "translate-x-5" : "translate-x-0"}` })
    }
  )
] });
const SurveyGrid = ({ active }) => {
  const map = useMap();
  const [gridLines, setGridLines] = useState({ latLines: [], lngLines: [] });
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
      if (zoom >= 18) step = 1e-4;
      else if (zoom >= 15) step = 1e-3;
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
    map.on("moveend zoomend", updateGrid);
    updateGrid();
    return () => {
      map.off("moveend zoomend", updateGrid);
    };
  }, [active, map]);
  return /* @__PURE__ */ jsxs(LayerGroup, { children: [
    gridLines.latLines.map((line, idx) => /* @__PURE__ */ jsx(Polyline, { positions: line, pathOptions: { color: "#FFFFFF", weight: 0.5, opacity: 0.1, dashArray: "5, 5", interactive: false } }, `lat-${idx}`)),
    gridLines.lngLines.map((line, idx) => /* @__PURE__ */ jsx(Polyline, { positions: line, pathOptions: { color: "#FFFFFF", weight: 0.5, opacity: 0.1, dashArray: "5, 5", interactive: false } }, `lng-${idx}`))
  ] });
};
const MapWatermark = () => {
  return /* @__PURE__ */ jsx("div", { className: "absolute inset-0 pointer-events-none z-[1500] overflow-hidden opacity-[0.33] select-none flex flex-wrap content-start justify-center gap-16 p-4", children: Array.from({ length: 200 }).map((_, i) => /* @__PURE__ */ jsx(
    "div",
    {
      className: "whitespace-nowrap transform -rotate-12 text-[10px] font-bold uppercase tracking-[0.3em] text-[#FFD700]",
      style: { width: "fit-content" },
      children: "Rifky Rangga"
    },
    i
  )) });
};
const DEFAULT_POINT_COLOR = "#1A1A1A";
const FreehandHandler = ({
  active,
  isDrawing,
  setIsDrawing,
  setPoints
}) => {
  const map = useMap();
  const lastShiftRef = useRef(false);
  useEffect(() => {
    if (!active) return;
    const mapContainer = map.getContainer();
    const handleMouseDown = (e) => {
      if (active) {
        setIsDrawing(true);
        const rect = mapContainer.getBoundingClientRect();
        const latlng = map.containerPointToLatLng(L.point(e.clientX - rect.left, e.clientY - rect.top));
        setPoints((prev) => [...prev, { lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }]);
        lastShiftRef.current = e.shiftKey;
      }
    };
    const handleMouseMove = (e) => {
      if (active && isDrawing) {
        const rect = mapContainer.getBoundingClientRect();
        const latlng = map.containerPointToLatLng(L.point(e.clientX - rect.left, e.clientY - rect.top));
        setPoints((prev) => {
          if (prev.length === 0) return [{ lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }];
          const next = [...prev];
          const isNowShift = e.shiftKey;
          if (isNowShift) {
            if (!lastShiftRef.current) {
              lastShiftRef.current = true;
              return [...prev, { lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }];
            } else {
              next[next.length - 1] = { ...next[next.length - 1], lat: latlng.lat, lng: latlng.lng };
              return next;
            }
          } else {
            if (lastShiftRef.current) {
              lastShiftRef.current = false;
              return [...prev, { lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }];
            }
            const last = prev[prev.length - 1];
            const dist = turf.distance(
              turf.point([last.lng, last.lat]),
              turf.point([latlng.lng, latlng.lat]),
              { units: "meters" }
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
    const handleTouchStart = (e) => {
      if (active && e.touches.length === 1) {
        setIsDrawing(true);
        const rect = mapContainer.getBoundingClientRect();
        const latlng = map.containerPointToLatLng(L.point(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top));
        setPoints((prev) => [...prev, { lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }]);
      }
    };
    const handleTouchMove = (e) => {
      if (active && isDrawing && e.touches.length === 1) {
        const rect = mapContainer.getBoundingClientRect();
        const latlng = map.containerPointToLatLng(L.point(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top));
        setPoints((prev) => {
          if (prev.length === 0) return [{ lat: latlng.lat, lng: latlng.lng, color: DEFAULT_POINT_COLOR }];
          const last = prev[prev.length - 1];
          const dist = turf.distance(
            turf.point([last.lng, last.lat]),
            turf.point([latlng.lng, latlng.lat]),
            { units: "meters" }
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
    mapContainer.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    mapContainer.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    mapContainer.style.cursor = "crosshair";
    return () => {
      mapContainer.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      mapContainer.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      mapContainer.style.cursor = "";
    };
  }, [active, isDrawing, map, setIsDrawing, setPoints]);
  return null;
};
const MapCameraController = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 18);
    }
  }, [center, map]);
  return null;
};
function calculateStats(points) {
  if (points.length < 3) {
    let edge = [];
    if (points.length === 2) {
      const dist = turf.distance(turf.point([points[0].lng, points[0].lat]), turf.point([points[1].lng, points[1].lat]), { units: "meters" });
      const mid = turf.midpoint(turf.point([points[0].lng, points[0].lat]), turf.point([points[1].lng, points[1].lat]));
      edge.push({ distance: dist, midpoint: { lat: mid.geometry.coordinates[1], lng: mid.geometry.coordinates[0] } });
    }
    return { areaSqMeters: 0, areaHectares: 0, areaAre: 0, perimeter: 0, length: 0, width: 0, longestLine: null, edges: edge };
  }
  const coords = points.map((p) => [p.lng, p.lat]);
  coords.push([...coords[0]]);
  try {
    const polygon = turf.polygon([coords]);
    const areaSqMeters = turf.area(polygon);
    const areaHectares = areaSqMeters / 1e4;
    const areaAre = areaSqMeters / 100;
    const perimeter = turf.length(polygon, { units: "meters" });
    let maxLength = 0;
    let longestLine = null;
    let p1Coords = [];
    let p2Coords = [];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const pt1 = turf.point([points[i].lng, points[i].lat]);
        const pt2 = turf.point([points[j].lng, points[j].lat]);
        const dist = turf.distance(pt1, pt2, { units: "meters" });
        if (dist > maxLength) {
          maxLength = dist;
          p1Coords = [points[i].lng, points[i].lat];
          p2Coords = [points[j].lng, points[j].lat];
          longestLine = turf.lineString([p1Coords, p2Coords]);
        }
      }
    }
    let maxLeft = 0;
    let maxRight = 0;
    if (longestLine) {
      const lineBearing = turf.bearing(turf.point(p1Coords), turf.point(p2Coords));
      points.forEach((p) => {
        const pt = turf.point([p.lng, p.lat]);
        const dist = turf.pointToLineDistance(pt, longestLine, { units: "meters" });
        const ptBearing = turf.bearing(turf.point(p1Coords), pt);
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
    const edges = [];
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const pt1 = turf.point([p1.lng, p1.lat]);
      const pt2 = turf.point([p2.lng, p2.lat]);
      const dist = turf.distance(pt1, pt2, { units: "meters" });
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
function subdividePolygon(points, roadWidth, minArea, minFront, baseEdgeIndex = -1, roadPos = "tengah") {
  try {
    if (points.length < 3) return [];
    const coords = points.map((p) => [p.lng, p.lat]);
    coords.push([...coords[0]]);
    const poly = turf.polygon([coords]);
    const centroid = turf.centroid(poly);
    let maxDist = 0;
    let angle = 0;
    let actualBaseEdge = baseEdgeIndex;
    if (baseEdgeIndex >= 0 && baseEdgeIndex < points.length) {
      const p1 = points[baseEdgeIndex];
      const p2 = points[(baseEdgeIndex + 1) % points.length];
      angle = turf.bearing([p1.lng, p1.lat], [p2.lng, p2.lat]);
    } else {
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const d = turf.distance([p1.lng, p1.lat], [p2.lng, p2.lat]);
        if (d > maxDist) {
          maxDist = d;
          angle = turf.bearing([p1.lng, p1.lat], [p2.lng, p2.lat]);
          actualBaseEdge = i;
        }
      }
    }
    const rotatedPoly = turf.transformRotate(poly, -angle + 90, { pivot: centroid });
    const bbox = turf.bbox(rotatedPoly);
    const minX = bbox[0], minY = bbox[1], maxX = bbox[2], maxY = bbox[3];
    const ptCenter = centroid.geometry.coordinates;
    const lenX = turf.distance([minX, ptCenter[1]], [maxX, ptCenter[1]], { units: "meters" });
    const lenY = turf.distance([ptCenter[0], minY], [ptCenter[0], maxY], { units: "meters" });
    const degXToMeter = lenX / Math.abs(maxX - minX);
    const degYToMeter = lenY / Math.abs(maxY - minY);
    const frontP1 = points[actualBaseEdge];
    const rotatedFP1 = turf.transformRotate(turf.point([frontP1.lng, frontP1.lat]), -angle + 90, { pivot: centroid }).geometry.coordinates;
    const isFrontAtMinY = Math.abs(rotatedFP1[1] - minY) < Math.abs(rotatedFP1[1] - maxY);
    const roadWidthDeg = roadWidth / (degYToMeter || 1);
    const centerY = (minY + maxY) / 2;
    let roadCenterY = centerY;
    if (roadPos === "depan") {
      roadCenterY = isFrontAtMinY ? minY + roadWidthDeg / 2 : maxY - roadWidthDeg / 2;
    } else if (roadPos === "belakang") {
      roadCenterY = isFrontAtMinY ? maxY - roadWidthDeg / 2 : minY + roadWidthDeg / 2;
    }
    let leftThetas = [];
    let rightThetas = [];
    const rotCoords = rotatedPoly.geometry.coordinates[0];
    for (let i = 0; i < rotCoords.length - 1; i++) {
      const p1 = rotCoords[i];
      const p2 = rotCoords[i + 1];
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      if (Math.abs(dy) > Math.abs(dx) * 0.1) {
        let theta = Math.atan2(dx, dy);
        if (theta > Math.PI / 2) theta -= Math.PI;
        else if (theta < -Math.PI / 2) theta += Math.PI;
        const midX = (p1[0] + p2[0]) / 2;
        if (midX < (minX + maxX) / 2) leftThetas.push(theta);
        else rightThetas.push(theta);
      }
    }
    const avgLeftTheta = leftThetas.length > 0 ? leftThetas.reduce((a, b) => a + b, 0) / leftThetas.length : 0;
    const avgRightTheta = rightThetas.length > 0 ? rightThetas.reduce((a, b) => a + b, 0) / rightThetas.length : 0;
    const getTheta = (x) => {
      const t2 = (x - minX) / (maxX - minX || 1);
      return avgLeftTheta * (1 - t2) + avgRightTheta * t2;
    };
    const roadBox = turf.bboxPolygon([minX, roadCenterY - roadWidthDeg / 2, maxX, roadCenterY + roadWidthDeg / 2]);
    let roadFeature = null;
    try {
      roadFeature = turf.intersect(turf.featureCollection([rotatedPoly, roadBox]));
    } catch (e) {
      console.warn("Intersection failed on road", e);
    }
    const newKavlings = [];
    if (roadFeature) {
      const realRoad = turf.transformRotate(roadFeature, angle - 90, { pivot: centroid });
      newKavlings.push({
        id: "road-1",
        type: "road",
        polygon: realRoad,
        area: turf.area(realRoad)
      });
    }
    const doSlice = (startY, endY, prefix) => {
      const blockHeightMeters = Math.abs(endY - startY) * degYToMeter;
      if (blockHeightMeters <= 2) return;
      let startX = minX;
      let count = 0;
      const spanY = (maxY - minY) * 1.5;
      const botY = roadCenterY - spanY;
      const topY = roadCenterY + spanY;
      while (startX < maxX) {
        let lotWidthMeters = minArea / blockHeightMeters;
        if (lotWidthMeters < minFront) lotWidthMeters = minFront;
        const lotWidthDeg = lotWidthMeters / (degXToMeter || 1);
        const endX = Math.min(startX + lotWidthDeg, maxX);
        const thStart = getTheta(startX);
        const thEnd = getTheta(endX);
        const lotPoly = turf.polygon([[
          [startX - (roadCenterY - botY) * Math.tan(thStart), botY],
          [startX + (topY - roadCenterY) * Math.tan(thStart), topY],
          [endX + (topY - roadCenterY) * Math.tan(thEnd), topY],
          [endX - (roadCenterY - botY) * Math.tan(thEnd), botY],
          [startX - (roadCenterY - botY) * Math.tan(thStart), botY]
        ]]);
        try {
          const targetBbox = turf.bboxPolygon([minX - spanY, Math.min(startY, endY), maxX + spanY, Math.max(startY, endY)]);
          let lotInSide = null;
          lotInSide = turf.intersect(turf.featureCollection([lotPoly, targetBbox]));
          if (!lotInSide) {
            startX = endX;
            count++;
            continue;
          }
          const intersectFeat = turf.intersect(turf.featureCollection([rotatedPoly, lotInSide]));
          if (intersectFeat) {
            const realLot = turf.transformRotate(intersectFeat, angle - 90, { pivot: centroid });
            const lotArea = turf.area(realLot);
            if (lotArea > 5) {
              const lotCenter = turf.centroid(realLot).geometry.coordinates;
              const lotDepthMeters = lotArea / lotWidthMeters;
              let edges = [];
              if (realLot.geometry.type === "Polygon" || realLot.geometry.type === "MultiPolygon") {
                const polyCoords = realLot.geometry.type === "Polygon" ? realLot.geometry.coordinates[0] : realLot.geometry.coordinates[0][0];
                for (let i = 0; i < polyCoords.length - 1; i++) {
                  const p1 = polyCoords[i];
                  const p2 = polyCoords[i + 1];
                  const dist = turf.distance(p1, p2, { units: "meters" });
                  if (dist > 1) {
                    edges.push({
                      midpoint: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2],
                      length: Math.round(dist * 10) / 10
                    });
                  }
                }
              }
              newKavlings.push({
                id: `${prefix}-${count}`,
                type: lotArea >= minArea * 0.8 ? "lot" : "remnant",
                polygon: realLot,
                area: lotArea,
                center: lotCenter,
                // [lng, lat]
                widthStr: Math.round(lotWidthMeters),
                depthStr: Math.round(lotDepthMeters),
                edges
              });
            }
          }
        } catch (e) {
        }
        startX = endX;
        count++;
      }
    };
    if (roadPos === "tengah") {
      doSlice(minY, roadCenterY - roadWidthDeg / 2, "bot");
      doSlice(roadCenterY + roadWidthDeg / 2, maxY, "top");
    } else if (roadPos === "depan") {
      if (isFrontAtMinY) doSlice(roadCenterY + roadWidthDeg / 2, maxY, "A");
      else doSlice(minY, roadCenterY - roadWidthDeg / 2, "A");
    } else {
      if (isFrontAtMinY) doSlice(minY, roadCenterY - roadWidthDeg / 2, "A");
      else doSlice(roadCenterY + roadWidthDeg / 2, maxY, "A");
    }
    return newKavlings;
  } catch (err) {
    console.error("Error generating kavlings:", err);
    return [];
  }
}
const DEFAULT_WMS_LAYERS = [
  { name: "Geo Server - Plot_only", layers: "dorado:plot_only" }
];
export default function App() {
  const [isAuth, setIsAuth] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const authGasUrl = "https://script.google.com/macros/s/AKfycbylEEGenZcZelINy1KBn9P6mL5S5gGBtdYKpUsBQOdHx_qxOfa-GtiiGkAbw_lFwnTtsw/exec";
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  useEffect(() => {
    const savedAuth = localStorage.getItem("calcare_auth_token");
    if (savedAuth === "true") {
      setIsAuth(true);
    }
  }, []);
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!authGasUrl) {
      setAuthError("Google Apps Script URL is not configured.");
      return;
    }
    setIsLoadingAuth(true);
    setAuthError("");
    try {
      const response = await fetch(`${authGasUrl}?action=login&username=${encodeURIComponent(authUsername)}&password=${encodeURIComponent(authPassword)}`);
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      const data = await response.json();
      if (data.success) {
        setIsAuth(true);
        localStorage.setItem("calcare_auth_token", "true");
      } else {
        setAuthError(data.message || "Invalid credentials");
      }
    } catch (error) {
      setAuthError('Failed to fetch from GAS. Please ensure your Google Apps Script is deployed as Web App accessible to "Anyone" and handles GET requests properly. ' + error.message);
    } finally {
      setIsLoadingAuth(false);
    }
  };
  const handleLogout = () => {
    setIsAuth(false);
    localStorage.removeItem("calcare_auth_token");
  };
  const [points, setPoints] = useState([]);
  const [stats, setStats] = useState(calculateStats([]));
  const [manualInput, setManualInput] = useState({ lat: "", lng: "" });
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportClientName, setExportClientName] = useState("");
  const [exportNIB, setExportNIB] = useState("");
  const [exportSurveyor, setExportSurveyor] = useState("");
  const [exportNotes, setExportNotes] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState(0);
  const [kavlingSettings, setKavlingSettings] = useState({ minArea: 100, minFront: 5, roadWidth: 5, baseEdgeIndex: -1, roadPlacement: "tengah" });
  const [kavlings, setKavlings] = useState([]);
  const [showKavlings, setShowKavlings] = useState(true);
  const [mapCenter, setMapCenter] = useState([-8.6705, 115.2126]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedResultId, setSelectedResultId] = useState(null);
  const [selectedSearchResult, setSelectedSearchResult] = useState(null);
  const [isFreehand, setIsFreehand] = useState(false);
  const [isAutoDetect, setIsAutoDetect] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showPlotSizes, setShowPlotSizes] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState("idle");
  const [selectedPointIndex, setSelectedPointIndex] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeModal, setActiveModal] = useState("none");
  const [savedProjects, setSavedProjects] = useState([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [importText, setImportText] = useState("");
  const [wmsOpacity, setWmsOpacity] = useState(0.7);
  const [wmsHue, setWmsHue] = useState(0);
  const [wmsInvert, setWmsInvert] = useState(false);
  const [units, setUnits] = useState("metric");
  const [wmsLayersList, setWmsLayersList] = useState([]);
  const [showGrid, setShowGrid] = useState(true);
  const [areaUnit, setAreaUnit] = useState("are");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [lang, setLang] = useState("en");
  const [userLocation, setUserLocation] = useState(null);
  const [areaPrecision, setAreaPrecision] = useState(() => Number(localStorage.getItem("calcare_area_precision")) || 4);
  const [arePrecision, setArePrecision] = useState(() => {
    const val = localStorage.getItem("calcare_are_precision");
    return val === null ? 2 : Number(val);
  });
  const [mobileTab, setMobileTab] = useState("map");
  const [activeKey, setActiveKey] = useState(null);
  const [isSharing, setIsSharing] = useState(null);
  const [shareStatus, setShareStatus] = useState({});
  const user = null;
  const isAuthLoading = false;
  const handleNewProject = useCallback(() => {
    setPoints([]);
    setCurrentProjectId(null);
    setSelectedPointIndex(null);
    setAutoSaveStatus("idle");
    setSelectedSearchResult(null);
    setSelectedResultId(null);
    setNewProjectName("");
    setMeasurePoints([]);
    setIsFreehand(false);
    setIsEditMode(false);
    setIsDrawing(false);
    setIsMeasuring(false);
    localStorage.removeItem("calcare_points_draft");
    localStorage.removeItem("calcare_current_id");
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("share")) {
        url.searchParams.delete("share");
        window.history.pushState({}, "", url.toString());
      }
    } catch (e) {
    }
    setActiveModal("none");
    setMobileTab("map");
  }, [setPoints, setCurrentProjectId, setSelectedPointIndex, setAutoSaveStatus, setSelectedSearchResult, setSelectedResultId, setNewProjectName, setMeasurePoints, setIsFreehand, setIsEditMode, setIsDrawing, setIsMeasuring, setActiveModal, setMobileTab]);
  const [gasUrl, setGasUrl] = useState("https://script.google.com/macros/s/AKfycbxjLsv05ASo9hM6zK2juoKtcX9gUypBupmEkt6IrSHE5335_Z7kktHOcIz23BVtIFIELA/exec");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingUpSheet, setIsSettingUpSheet] = useState(false);
  useEffect(() => {
    localStorage.setItem("calcare_area_unit", areaUnit);
  }, [areaUnit]);
  useEffect(() => {
    setWmsLayersList(DEFAULT_WMS_LAYERS);
  }, []);
  useEffect(() => {
    localStorage.setItem("calcare_area_precision", String(areaPrecision));
  }, [areaPrecision]);
  useEffect(() => {
    localStorage.setItem("calcare_are_precision", String(arePrecision));
  }, [arePrecision]);
  useEffect(() => {
    localStorage.setItem("calcare_dark_mode", String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);
  useEffect(() => {
    setStats(calculateStats(points));
  }, [points]);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (isEditMode && selectedPointIndex !== null && points[selectedPointIndex]) {
        const step = 1e-5;
        let handled = false;
        if (e.key === "ArrowUp") {
          handlePointDrag(selectedPointIndex, points[selectedPointIndex].lat + step, points[selectedPointIndex].lng);
          handled = true;
        } else if (e.key === "ArrowDown") {
          handlePointDrag(selectedPointIndex, points[selectedPointIndex].lat - step, points[selectedPointIndex].lng);
          handled = true;
        } else if (e.key === "ArrowLeft") {
          handlePointDrag(selectedPointIndex, points[selectedPointIndex].lat, points[selectedPointIndex].lng - step);
          handled = true;
        } else if (e.key === "ArrowRight") {
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
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditMode, selectedPointIndex, points]);
  const handleQuickSave = () => {
    if (points.length === 0) return;
    setAutoSaveStatus("saving");
    localStorage.setItem("calcare_points_draft", JSON.stringify(points));
    setSavedProjects((prev) => {
      let updated;
      if (currentProjectId) {
        updated = prev.map((p) => {
          if (p.id === currentProjectId) {
            return {
              ...p,
              points,
              date: (/* @__PURE__ */ new Date()).toISOString(),
              areaSqMeters: stats.areaSqMeters,
              perimeter: stats.perimeter
            };
          }
          return p;
        });
      } else {
        const newId = `proj_${Date.now()}`;
        const newProject = {
          id: newId,
          name: `Survey ${(/* @__PURE__ */ new Date()).toLocaleDateString()} ${(/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          points,
          date: (/* @__PURE__ */ new Date()).toISOString(),
          areaSqMeters: stats.areaSqMeters,
          perimeter: stats.perimeter,
          unit: areaUnit,
          shared: false
        };
        updated = [newProject, ...prev];
        setCurrentProjectId(newId);
        localStorage.setItem("calcare_current_id", newId);
      }
      localStorage.setItem("geocalc_projects", JSON.stringify(updated));
      return updated;
    });
    setAutoSaveStatus("saved");
    setTimeout(() => setAutoSaveStatus("idle"), 2e3);
  };
  useEffect(() => {
    localStorage.setItem("calcare_area_unit", areaUnit);
  }, [areaUnit]);
  useEffect(() => {
    localStorage.setItem("calcare_lang", lang);
  }, [lang]);
  useEffect(() => {
    localStorage.setItem("calcare_show_grid", String(showGrid));
  }, [showGrid]);
  useEffect(() => {
    const saved = localStorage.getItem("geocalc_projects");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrated = parsed.map((proj) => ({
          ...proj,
          points: proj.points.map((p) => ({
            ...p,
            color: p.color || DEFAULT_POINT_COLOR
          }))
        }));
        setSavedProjects(migrated);
      } catch (e) {
        console.error("Failed to parse saved projects");
      }
    }
    const draft = localStorage.getItem("calcare_points_draft");
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        const migrated = parsed.map((p) => ({
          ...p,
          color: p.color || DEFAULT_POINT_COLOR
        }));
        setPoints(migrated);
      } catch (e) {
        console.error("Failed to parse draft points");
      }
    }
    const savedId = localStorage.getItem("calcare_current_id");
    if (savedId && savedId !== "null") {
      setCurrentProjectId(Number(savedId));
    }
    const savedGasUrl = localStorage.getItem("calcare_gas_url");
    if (savedGasUrl) {
      setGasUrl(savedGasUrl);
    }
    const savedAreaUnit = localStorage.getItem("calcare_area_unit");
    if (savedAreaUnit) setAreaUnit(savedAreaUnit);
    const savedDarkMode = localStorage.getItem("calcare_dark_mode");
    if (savedDarkMode) setIsDarkMode(savedDarkMode === "true");
    const savedLang = localStorage.getItem("calcare_lang");
    if (savedLang) setLang(savedLang);
    const savedShowGrid = localStorage.getItem("calcare_show_grid");
    if (savedShowGrid) setShowGrid(savedShowGrid === "true");
  }, []);
  const handleClear = () => {
    setPoints([]);
    setMeasurePoints([]);
    setKavlings([]);
    setCurrentProjectId(null);
    localStorage.removeItem("calcare_points_draft");
    localStorage.removeItem("calcare_current_id");
    setIsEditMode(false);
    setIsFreehand(false);
    setIsMeasuring(false);
  };
  const handleUndo = () => setPoints((pts) => pts.slice(0, -1));
  const removePointAt = (idx) => {
    setPoints((pts) => pts.filter((_, i) => i !== idx));
  };
  const handleColorChange = (index, color) => {
    setPoints((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], color };
      return next;
    });
  };
  const handlePointDrag = (index, newLat, newLng) => {
    const lat = Math.max(-90, Math.min(90, newLat));
    const lng = Math.max(-180, Math.min(180, newLng));
    setPoints((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], lat, lng };
      return next;
    });
  };
  const handleManualAdd = (e) => {
    e.preventDefault();
    const lat = parseFloat(manualInput.lat);
    const lng = parseFloat(manualInput.lng);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      setPoints((pts) => [...pts, { lat, lng, color: DEFAULT_POINT_COLOR }]);
      setManualInput({ lat: "", lng: "" });
      setMapCenter([lat, lng]);
      setSearchResults([]);
      setSearchQuery("");
      setSelectedResultId(null);
    }
  };
  const handleSearch = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const coordRegex = /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/;
    const match = searchQuery.trim().match(coordRegex);
    if (match) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
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
        setSearchResults([]);
        return;
      }
    }
    setIsSearching(true);
    try {
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
  const handleGenerateKavling = () => {
    const k = subdividePolygon(points, kavlingSettings.roadWidth, kavlingSettings.minArea, kavlingSettings.minFront, kavlingSettings.baseEdgeIndex, kavlingSettings.roadPlacement);
    setKavlings(k);
    setShowKavlings(true);
    setActiveModal("none");
  };
  const handleExport = async () => {
    if (!mapInstanceRef.current) {
      alert("Map instance not ready");
      return;
    }
    setIsExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    try {
      let locName = "Custom Location";
      try {
        const locLat = points.length > 0 ? points[0].lat : selectedSearchResult ? selectedSearchResult.lat : mapCenter ? mapCenter[0] : null;
        const locLng = points.length > 0 ? points[0].lng : selectedSearchResult ? selectedSearchResult.lon : mapCenter ? mapCenter[1] : null;
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
              const parts = data.display_name.split(",");
              locName = parts.slice(0, 2).map((p) => p.trim()).join(", ");
            }
          }
        }
      } catch (e) {
        console.warn("Reverse geocoding failed", e);
      }
      if (locName === "Custom Location") {
        if (selectedSearchResult && selectedSearchResult.display_name) {
          const parts = selectedSearchResult.display_name.split(",");
          locName = parts.slice(0, 2).map((p) => p.trim()).join(", ");
        } else if (searchQuery) {
          locName = searchQuery;
        } else if (points.length > 0) {
          locName = "Area based on points";
        }
      }
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const readableDate = new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(/* @__PURE__ */ new Date());
      const projectRef = exportNIB ? `NIB-${exportNIB}` : `GEO-${Date.now().toString().slice(-6)}`;
      const drawHeader = (pageNum) => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(22);
        pdf.setTextColor(26, 26, 26);
        pdf.text("Calcare Surveyor Report", margin, 22);
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
      const drawGridRow = (label, val, yPos) => {
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
      const boxWidth = pdfWidth - margin * 2;
      const boxHeight = pdfHeight - sketchY - 25;
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.rect(margin, sketchY, boxWidth, boxHeight);
      pdf.setFontSize(10);
      pdf.setTextColor(150);
      pdf.text("SKETSA AREA (TIDAK BERSKALA TEPAT)", margin + 5, sketchY + 8);
      if (points.length > 1) {
        const lats = points.map((p) => p.lat);
        const lngs = points.map((p) => p.lng);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const latDiff = maxLat - minLat || 1e-5;
        const lngDiff = maxLng - minLng || 1e-5;
        const pad = 20;
        const drawBoxW = boxWidth - 2 * pad;
        const drawBoxH = boxHeight - 2 * pad;
        const meterPerLat = 111320;
        const meterPerLng = 40075e3 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180) / 360;
        const realWidthMeters = lngDiff * meterPerLng;
        const realHeightMeters = latDiff * meterPerLat;
        const scaleX = drawBoxW / realWidthMeters;
        const scaleY = drawBoxH / realHeightMeters;
        const scale = Math.min(scaleX, scaleY);
        const scaledW = realWidthMeters * scale;
        const scaledH = realHeightMeters * scale;
        const cx = margin + pad + (drawBoxW - scaledW) / 2;
        const cy = sketchY + pad + (drawBoxH - scaledH) / 2;
        const getX = (lng) => cx + (lng - minLng) * meterPerLng * scale;
        const getY = (lat) => cy + scaledH - (lat - minLat) * meterPerLat * scale;
        pdf.setDrawColor(0, 102, 204);
        pdf.setLineWidth(0.6);
        for (let i = 0; i < points.length; i++) {
          const p1 = points[i];
          if (i === points.length - 1 && points.length > 2) {
            const p2 = points[0];
            pdf.line(getX(p1.lng), getY(p1.lat), getX(p2.lng), getY(p2.lat));
          } else if (i < points.length - 1) {
            const p2 = points[i + 1];
            pdf.line(getX(p1.lng), getY(p1.lat), getX(p2.lng), getY(p2.lat));
          }
        }
        if (showKavlings && kavlings && kavlings.length > 0) {
          pdf.setLineWidth(0.3);
          kavlings.forEach((k) => {
            const isRoad = k.type === "road";
            const isRemnant = k.type === "remnant";
            pdf.setDrawColor(150, 150, 150);
            const geoms = k.polygon.geometry.type === "MultiPolygon" ? k.polygon.geometry.coordinates : [k.polygon.geometry.coordinates];
            geoms.forEach((polyCoords) => {
              const exterior = polyCoords[0];
              for (let i = 0; i < exterior.length - 1; i++) {
                const p1 = exterior[i];
                const p2 = exterior[i + 1];
                pdf.line(getX(p1[0]), getY(p1[1]), getX(p2[0]), getY(p2[1]));
              }
            });
            if (!isRoad && k.center) {
              pdf.setFontSize(5);
              pdf.setTextColor(150, 150, 150);
              const txtArea = `${Math.round(k.area)} m2`;
              const txtDim = `${k.widthStr}m x ${k.depthStr}m`;
              pdf.text(txtArea, getX(k.center[0]), getY(k.center[1]) - 1, { align: "center" });
              pdf.text(txtDim, getX(k.center[0]), getY(k.center[1]) + 1, { align: "center" });
              if (k.edges) {
                pdf.setFontSize(4);
                pdf.setTextColor(0, 80, 180);
                k.edges.forEach((edge) => {
                  pdf.text(`${edge.length}m`, getX(edge.midpoint[0]), getY(edge.midpoint[1]), { align: "center" });
                });
              }
            }
          });
        }
        if (stats.edges && stats.edges.length > 0) {
          pdf.setFontSize(8);
          pdf.setTextColor(80, 80, 80);
          for (let i = 0; i < stats.edges.length; i++) {
            const edge = stats.edges[i];
            const ex = getX(edge.midpoint.lng);
            const ey = getY(edge.midpoint.lat);
            const distText = `${edge.distance.toFixed(1)}m`;
            const tW = pdf.getTextWidth(distText);
            pdf.setFillColor(255, 255, 255);
            pdf.rect(ex - tW / 2 - 1, ey - 3.5, tW + 2, 5, "F");
            pdf.text(distText, ex, ey, { align: "center" });
          }
        }
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "bold");
        const usedPos = [];
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const x = getX(p.lng);
          const y = getY(p.lat);
          pdf.setFillColor(255, 100, 100);
          pdf.setDrawColor(200, 0, 0);
          pdf.circle(x, y, 1.5, "FD");
          let ly = y - 3;
          pdf.setTextColor(200, 0, 0);
          pdf.text(`P${i + 1}`, x, ly, { align: "center" });
        }
      }
      drawFooter();
      pdf.addPage();
      let currentPage = 2;
      drawHeader(currentPage);
      const availableWidth = pdfWidth - margin * 2;
      let currentY = 45;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(26, 26, 26);
      pdf.text("LOCATION DETAILS", margin, currentY);
      currentY += 4;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, currentY, margin + availableWidth, currentY);
      currentY += 10;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(50, 50, 50);
      pdf.text(`Location Name:`, margin, currentY);
      pdf.setFont("helvetica", "normal");
      const splitName = pdf.splitTextToSize(locName, availableWidth - 45);
      pdf.text(splitName, margin + 45, currentY);
      currentY += splitName.length * 6;
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
        pdf.setTextColor(50, 50, 50);
      } else {
        pdf.text("-", margin + 45, currentY);
      }
      currentY += 15;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(26, 26, 26);
      pdf.text("GEOSPATIAL METRICS", margin, currentY);
      currentY += 4;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, currentY, margin + availableWidth, currentY);
      currentY += 10;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(50, 50, 50);
      pdf.text(`Total Area:`, margin, currentY);
      let areaText = "";
      if (areaUnit === "are") {
        areaText = `${stats.areaAre.toFixed(arePrecision)} are / ${stats.areaSqMeters.toFixed(areaPrecision)} m2 (${stats.areaHectares.toFixed(areaPrecision)} ha)`;
      } else if (areaUnit === "ha") {
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
        const refArea = areaUnit === "are" ? stats.areaAre : areaUnit === "ha" ? stats.areaHectares : stats.areaSqMeters;
        const totalValue = refArea * pricePerUnit;
        const formattedValue = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(totalValue);
        const formattedPrice = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(pricePerUnit);
        pdf.text(`${formattedValue} (at ${formattedPrice} per ${areaUnit === "are" ? "are" : areaUnit === "ha" ? "ha" : "m\xB2"})`, margin + 45, currentY);
        currentY += 8;
      }
      currentY += 10;
      const colStart1 = margin;
      const colStart2 = margin + availableWidth / 2 + 5;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(26, 26, 26);
      pdf.text("BOUNDARY COORDINATES", colStart1, currentY);
      if (stats.edges && stats.edges.length > 0) {
        pdf.text("EDGE MEASUREMENTS", colStart2, currentY);
      }
      currentY += 4;
      pdf.line(colStart1, currentY, colStart1 + availableWidth / 2 - 5, currentY);
      if (stats.edges && stats.edges.length > 0) {
        pdf.line(colStart2, currentY, colStart2 + availableWidth / 2 - 5, currentY);
      }
      currentY += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(50, 50, 50);
      const listStartY = currentY;
      let coordY = currentY;
      points.forEach((p, idx) => {
        if (coordY > pdfHeight - 25) {
          drawFooter();
          pdf.addPage();
          currentPage++;
          drawHeader(currentPage);
          coordY = 45;
        }
        const colorRgb = hexToRgb(p.color || DEFAULT_POINT_COLOR);
        if (colorRgb) {
          pdf.setFillColor(colorRgb.r, colorRgb.g, colorRgb.b);
          pdf.rect(colStart1, coordY - 3, 2, 2, "F");
        }
        pdf.text(`P${String(idx + 1).padStart(2, "0")}: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`, colStart1 + 4, coordY);
        coordY += 4;
        try {
          const utmCoords = utm.fromLatLon(p.lat, p.lng);
          pdf.setFontSize(7);
          pdf.setTextColor(120, 120, 120);
          pdf.text(`UTM ${utmCoords.zoneNum}${utmCoords.zoneLetter}: ${utmCoords.easting.toFixed(2)}E, ${utmCoords.northing.toFixed(2)}N`, colStart1 + 4, coordY);
        } catch (e) {
        }
        pdf.setFontSize(9);
        pdf.setTextColor(50, 50, 50);
        coordY += 7;
      });
      let edgeY = listStartY;
      if (stats.edges && stats.edges.length > 0) {
        stats.edges.forEach((e, idx) => {
          if (edgeY > pdfHeight - 25) {
          }
          const nextIdx = idx + 1 === points.length ? 0 : idx + 1;
          pdf.text(`P${idx + 1} -> P${nextIdx + 1}: ${e.distance.toFixed(2)} m`, colStart2, edgeY);
          edgeY += 6;
        });
      }
      drawFooter();
      pdf.save(`Calcare_Report_${Date.now()}.pdf`);
      setActiveModal("none");
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert(`PDF generation failed:
${err instanceof Error ? err.message : String(err)}`);
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
            exportedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          geometry: {
            type: "Polygon",
            coordinates: [[...points.map((p) => [p.lng, p.lat]), [points[0].lng, points[0].lat]]]
          }
        }
      ]
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `calcare_survey_${(/* @__PURE__ */ new Date()).getTime()}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
    setActiveModal("none");
  };
  const handleExportCSV = () => {
    if (points.length === 0) return;
    let csvContent = "";
    csvContent += "Point,Latitude,Longitude,Color\n";
    points.forEach((p, idx) => {
      csvContent += `${idx + 1},${p.lat},${p.lng},${p.color || DEFAULT_POINT_COLOR}
`;
    });
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `calcare_points_${(/* @__PURE__ */ new Date()).getTime()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setActiveModal("none");
  };
  const handleExportDXF = () => {
    if (points.length < 3) return;
    try {
      const d = new Drawing();
      d.setUnits("Meters");
      d.addLayer("boundary", Drawing.ACI.GREEN, "CONTINUOUS");
      d.setActiveLayer("boundary");
      const dxfPoints = points.map((p) => {
        const coords = utm.fromLatLon(p.lat, p.lng);
        return [coords.easting, coords.northing];
      });
      d.drawPolyline(dxfPoints, true);
      if (kavlings && kavlings.length > 0) {
        d.addLayer("kavlings", Drawing.ACI.CYAN, "CONTINUOUS");
        d.setActiveLayer("kavlings");
        kavlings.forEach((k) => {
          const geoms = k.polygon.geometry.type === "MultiPolygon" ? k.polygon.geometry.coordinates : [k.polygon.geometry.coordinates];
          geoms.forEach((polyCoords) => {
            const exterior = polyCoords[0];
            const kDxfPts = exterior.map((pt) => {
              const c = utm.fromLatLon(pt[1], pt[0]);
              return [c.easting, c.northing];
            });
            d.drawPolyline(kDxfPts, true);
          });
        });
      }
      const areaText = `${stats.areaSqMeters.toFixed(2)} m2`;
      const centroidEasting = dxfPoints.reduce((sum, p) => sum + p[0], 0) / dxfPoints.length;
      const centroidNorthing = dxfPoints.reduce((sum, p) => sum + p[1], 0) / dxfPoints.length;
      d.addLayer("labels", Drawing.ACI.CYAN, "CONTINUOUS");
      d.setActiveLayer("labels");
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      dxfPoints.forEach((p) => {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      });
      const width = maxX - minX;
      const height = maxY - minY;
      const textHeight = Math.max(1, width * 0.05);
      d.drawText(centroidEasting, centroidNorthing, textHeight, 0, areaText, "center", "middle");
      d.addLayer("north_arrow", Drawing.ACI.RED, "CONTINUOUS");
      d.setActiveLayer("north_arrow");
      const arrowSize = Math.max(2, Math.max(width, height) * 0.08);
      const arrowBaseX = maxX + arrowSize * 1.5;
      const arrowBaseY = maxY;
      d.drawLine(arrowBaseX, arrowBaseY, arrowBaseX, arrowBaseY + arrowSize);
      d.drawLine(arrowBaseX - arrowSize * 0.25, arrowBaseY + arrowSize * 0.6, arrowBaseX, arrowBaseY + arrowSize);
      d.drawLine(arrowBaseX + arrowSize * 0.25, arrowBaseY + arrowSize * 0.6, arrowBaseX, arrowBaseY + arrowSize);
      d.drawLine(arrowBaseX - arrowSize * 0.1, arrowBaseY, arrowBaseX + arrowSize * 0.1, arrowBaseY);
      const nTextHeight = arrowSize * 0.4;
      d.drawText(arrowBaseX, arrowBaseY + arrowSize + nTextHeight * 0.8, nTextHeight, 0, "N", "center", "middle");
      const blob = new Blob([d.toDxfString()], { type: "application/dxf;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `calcare_survey_${(/* @__PURE__ */ new Date()).getTime()}.dxf`;
      link.click();
      URL.revokeObjectURL(url);
      setActiveModal("none");
    } catch (e) {
      console.error("Export DXF error:", e);
      alert("Failed to export DXF. Please ensure coordinates are valid.");
    }
  };
  const extractCoords = (obj) => {
    let coords = [];
    if (Array.isArray(obj)) {
      if (obj.length >= 2 && typeof obj[0] === "number" && typeof obj[1] === "number") {
        coords.push(obj);
      } else {
        for (const item of obj) {
          coords = coords.concat(extractCoords(item));
        }
      }
    } else if (typeof obj === "object" && obj !== null) {
      if (obj.coordinates) {
        coords = coords.concat(extractCoords(obj.coordinates));
      } else if (obj.geometry) {
        coords = coords.concat(extractCoords(obj.geometry));
      } else if (obj.features) {
        coords = coords.concat(extractCoords(obj.features));
      }
    }
    return coords;
  };
  const handleImportJSON = () => {
    try {
      if (!importText.trim()) return;
      const data = JSON.parse(importText);
      const coords = extractCoords(data);
      let newPts = coords.map((c) => ({
        lat: c[1],
        lng: c[0],
        color: DEFAULT_POINT_COLOR
      })).filter((p) => p.lat !== void 0 && p.lng !== void 0 && !isNaN(p.lat) && !isNaN(p.lng));
      if (newPts.length > 2) {
        const first = newPts[0];
        const last = newPts[newPts.length - 1];
        if (Math.abs(first.lat - last.lat) < 1e-6 && Math.abs(first.lng - last.lng) < 1e-6) {
          newPts.pop();
        }
      }
      if (newPts.length > 0) {
        setPoints(newPts);
        setMapCenter([newPts[0].lat, newPts[0].lng]);
        setImportText("");
        setActiveModal("none");
        setCurrentProjectId(null);
      } else {
        alert("Tidak menemukan data titik koordinat dalam format: [longitude, latitude]");
      }
    } catch (e) {
      alert("Error parsing JSON. Pastikan format JSON benar.");
    }
  };
  const handleSaveProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setIsSyncing(true);
    const newProj = {
      id: `proj_${Date.now()}`,
      name: newProjectName,
      points,
      date: (/* @__PURE__ */ new Date()).toISOString(),
      areaSqMeters: stats.areaSqMeters,
      perimeter: stats.perimeter,
      unit: areaUnit,
      shared: false
    };
    const updated = [newProj, ...savedProjects];
    setSavedProjects(updated);
    localStorage.setItem("geocalc_projects", JSON.stringify(updated));
    setNewProjectName("");
    setCurrentProjectId(newProj.id);
    setActiveModal("none");
    if (gasUrl.trim()) {
      try {
        await fetch(gasUrl, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8"
          },
          body: JSON.stringify(newProj)
        });
        console.log("Sync request sent");
      } catch (err) {
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
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({ action: "setup" })
      });
      alert("Setup request terkirim! Silakan cek Google Spreadsheet Anda.");
    } catch (err) {
      console.error("Failed to setup sheet", err);
      alert(`Setup gagal: ${err.message}`);
    }
    setIsSettingUpSheet(false);
  };
  const loadProject = (proj) => {
    setPoints(proj.points);
    setCurrentProjectId(proj.id);
    setNewProjectName(proj.name || "");
    localStorage.setItem("calcare_points_draft", JSON.stringify(proj.points));
    localStorage.setItem("calcare_current_id", String(proj.id));
    setActiveModal("none");
    setSearchResults([]);
    setSearchQuery("");
  };
  const deleteProject = async (id) => {
    const updated = savedProjects.filter((p) => p.id !== id);
    setSavedProjects(updated);
    localStorage.setItem("geocalc_projects", JSON.stringify(updated));
  };
  const handleShareProject = async (proj) => {
    setIsSharing(proj.id);
    const newShareStatus = !proj.shared;
    try {
      const updatedProjects = savedProjects.map(
        (p) => p.id === proj.id ? { ...p, shared: newShareStatus } : p
      );
      setSavedProjects(updatedProjects);
      localStorage.setItem("geocalc_projects", JSON.stringify(updatedProjects));
      if (newShareStatus) {
        const shareUrl = `${window.location.origin}${window.location.pathname}?share=${proj.id}`;
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus((prev) => ({ ...prev, [proj.id]: true }));
        setTimeout(() => {
          setShareStatus((prev) => ({ ...prev, [proj.id]: false }));
        }, 3e3);
      }
    } catch (err) {
      console.error("Sharing failed:", err);
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
          const newLoc = [latitude, longitude];
          setUserLocation(newLoc);
        },
        (err) => console.warn("Geolocation error:", err),
        { enableHighAccuracy: true, timeout: 1e4, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }, []);
    if (!userLocation) return null;
    const locationIcon = L.divIcon({
      className: "user-location-marker",
      html: `
            <div class="relative flex items-center justify-center">
                <div class="absolute w-4 h-4 bg-blue-500 rounded-full animate-ping opacity-75"></div>
                <div class="relative w-3 h-3 bg-blue-500 border-2 border-white rounded-full shadow-lg"></div>
            </div>
        `,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    return /* @__PURE__ */ jsx(Marker, { position: userLocation, icon: locationIcon, zIndexOffset: 2e3, children: /* @__PURE__ */ jsx(Tooltip, { direction: "top", offset: [0, -10], children: "Your Location" }) });
  };
  const MapClickHandler = ({ disabled, autoDetectActive }) => {
    const map = useMap();
    useMapEvents({
      click: async (e) => {
        if (autoDetectActive) {
          setIsDetecting(true);
          try {
            const bounds = map.getBounds();
            const size = map.getSize();
            const x = Math.round(e.containerPoint.x);
            const y = Math.round(e.containerPoint.y);
            const queryLayers = wmsLayersList.map((l) => l.layers).slice(0, 20).join(",");
            const u = `https://geo2.perare.io/geoserver/dorado/wms?request=GetFeatureInfo&service=WMS&srs=EPSG:4326&version=1.1.1&format=image/png&bbox=${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}&height=${size.y}&width=${size.x}&layers=${queryLayers}&query_layers=${queryLayers}&info_format=application/json&x=${x}&y=${y}&feature_count=1`;
            const response = await fetch(u);
            if (!response.ok) throw new Error("Network error");
            const data = await response.json();
            if (data.features && data.features.length > 0) {
              const feature = data.features[0];
              if (feature.geometry && (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")) {
                let coords = feature.geometry.coordinates;
                if (feature.geometry.type === "MultiPolygon") {
                  coords = coords[0];
                }
                const ring = coords[0];
                const newPoints = ring.map((pt) => ({ lat: pt[1], lng: pt[0], color: DEFAULT_POINT_COLOR }));
                if (newPoints.length > 1 && newPoints[0].lat === newPoints[newPoints.length - 1].lat && newPoints[0].lng === newPoints[newPoints.length - 1].lng) {
                  newPoints.pop();
                }
                setPoints(newPoints);
                setShowPlotSizes(false);
                setIsAutoDetect(false);
              } else {
                alert(t(lang, "plotNotFound") || "Plot tidak ditemukan atau geometri tidak sesuai.");
              }
            } else {
              alert(t(lang, "plotNotFound") || "Tidak ada plot di koordinat tersebut.");
            }
          } catch (err) {
            console.error("Auto detect failed", err);
            alert("Gagal mengambil data dari GeoServer");
          } finally {
            setIsDetecting(false);
          }
          return;
        }
        if (disabled) return;
        setPoints((pts) => [...pts, { lat: e.latlng.lat, lng: e.latlng.lng, color: DEFAULT_POINT_COLOR }]);
        setSearchResults([]);
        setSearchQuery("");
        setSelectedResultId(null);
      }
    });
    return null;
  };
  const MeasureHandler = ({ active, measurePoints: measurePoints2, setMeasurePoints: setMeasurePoints2, t: t2, lang: lang2 }) => {
    useMapEvents({
      click(e) {
        if (!active) return;
        const { lat, lng } = e.latlng;
        setMeasurePoints2((prev) => [...prev, [lat, lng]]);
      }
    });
    if (!active || measurePoints2.length === 0) return null;
    return /* @__PURE__ */ jsxs(LayerGroup, { children: [
      measurePoints2.map((p, i) => /* @__PURE__ */ jsx(
        Marker,
        {
          position: p,
          draggable: true,
          eventHandlers: {
            drag: (e) => {
              const marker = e.target;
              const pos = marker.getLatLng();
              const newPts = [...measurePoints2];
              newPts[i] = [pos.lat, pos.lng];
              setMeasurePoints2(newPts);
            },
            dragend: (e) => {
              const marker = e.target;
              const pos = marker.getLatLng();
              const newPts = [...measurePoints2];
              newPts[i] = [pos.lat, pos.lng];
              setMeasurePoints2(newPts);
            }
          },
          icon: L.divIcon({
            className: "",
            html: `<div style="background-color: #EAB308; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5]
          }),
          children: /* @__PURE__ */ jsx(Tooltip, { permanent: true, direction: "top", offset: [0, -5], children: /* @__PURE__ */ jsxs("span", { className: "text-[9px] font-bold uppercase", children: [
            "M_",
            i + 1
          ] }) })
        },
        `measure-p-${i}`
      )),
      measurePoints2.length > 1 && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          Polyline,
          {
            positions: measurePoints2,
            pathOptions: { color: "#EAB308", weight: 2, dashArray: "5, 5" }
          }
        ),
        /* @__PURE__ */ jsx(
          Marker,
          {
            position: measurePoints2[measurePoints2.length - 1],
            icon: L.divIcon({
              className: "bg-[var(--color-surface)] border border-[#EAB308]/40 px-2 py-1 rounded text-[11px] font-bold text-[#EAB308] shadow-lg !w-auto !h-auto whitespace-nowrap text-center",
              html: `<div>Total: ${calculateTotalMeasureDistance(measurePoints2).toFixed(2)} m</div>`
            }),
            offset: [0, -20]
          }
        )
      ] })
    ] });
  };
  const calculateTotalMeasureDistance = (pts) => {
    let total = 0;
    if (pts.length > 1) {
      for (let i = 0; i < pts.length - 1; i++) {
        total += turf.distance(
          turf.point([pts[i][1], pts[i][0]]),
          turf.point([pts[i + 1][1], pts[i + 1][0]]),
          { units: "meters" }
        );
      }
    }
    return total;
  };
  const CustomZoomControl = () => {
    const map = useMap();
    return /* @__PURE__ */ jsxs("div", { className: "absolute top-1/2 -translate-y-1/2 right-6 flex flex-col gap-2 z-[1000]", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            map.zoomIn();
          },
          className: "w-10 h-10 bg-white dark:bg-black border border-[#1A1A1A]/20 dark:border-white/20 shadow-lg flex items-center justify-center text-[#1A1A1A] dark:text-white hover:bg-[#F7F7F5] dark:hover:bg-[#121212] transition-colors",
          title: "Zoom In",
          children: /* @__PURE__ */ jsx(ZoomIn, { size: 18 })
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            map.zoomOut();
          },
          className: "w-10 h-10 bg-white dark:bg-black border border-[#1A1A1A]/20 dark:border-white/20 shadow-lg flex items-center justify-center text-[#1A1A1A] dark:text-white hover:bg-[#F7F7F5] dark:hover:bg-[#121212] transition-colors",
          title: "Zoom Out",
          children: /* @__PURE__ */ jsx(ZoomOut, { size: 18 })
        }
      )
    ] });
  };
  if (!isAuth) {
    return /* @__PURE__ */ jsxs("div", { className: "relative min-h-screen flex items-center justify-center p-4 font-sans text-[var(--color-fg)] overflow-hidden", children: [
      /* @__PURE__ */ jsx(
        "video",
        {
          autoPlay: true,
          loop: true,
          muted: true,
          playsInline: true,
          className: "absolute inset-0 w-full h-full object-cover z-0",
          children: /* @__PURE__ */ jsx("source", { src: "https://v1.pinimg.com/videos/mc/720p/52/e1/ac/52e1accbbaac96e667a23a6de9006789.mp4", type: "video/mp4" })
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-black/50 z-10" }),
      /* @__PURE__ */ jsxs("div", { className: "relative z-20 bg-[var(--color-surface)]/80 backdrop-blur-md border border-[var(--color-fg)]/20 shadow-2xl p-8 max-w-sm w-full mx-4", children: [
        /* @__PURE__ */ jsx("div", { className: "flex justify-between items-center mb-8", children: /* @__PURE__ */ jsx("h1", { className: "font-serif italic text-3xl font-bold tracking-tight", children: "Calcare" }) }),
        /* @__PURE__ */ jsxs("form", { onSubmit: handleLogin, className: "space-y-6", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-[10px] uppercase tracking-widest opacity-60 mb-2", children: "Username" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: authUsername,
                  onChange: (e) => setAuthUsername(e.target.value),
                  required: true,
                  className: "w-full bg-[var(--color-surface)] border-b border-[var(--color-fg)]/20 p-2 pl-0 text-md focus:outline-none focus:border-[var(--color-fg)] transition-colors"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-[10px] uppercase tracking-widest opacity-60 mb-2", children: "Password" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "password",
                  value: authPassword,
                  onChange: (e) => setAuthPassword(e.target.value),
                  required: true,
                  className: "w-full bg-[var(--color-surface)] border-b border-[var(--color-fg)]/20 p-2 pl-0 text-md focus:outline-none focus:border-[var(--color-fg)] transition-colors"
                }
              )
            ] })
          ] }),
          authError && /* @__PURE__ */ jsx("div", { className: "text-red-500 text-[11px] font-medium bg-red-500/10 p-3 rounded-sm border border-red-500/20", children: authError }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "submit",
              disabled: isLoadingAuth,
              className: "w-full bg-[var(--color-fg)] text-[var(--color-bg)] py-3 uppercase tracking-widest text-[12px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50",
              children: isLoadingAuth ? "Authenticating..." : "Sign In"
            }
          )
        ] })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col h-[100dvh] w-full bg-[var(--color-bg)] font-sans text-[var(--color-fg)] overflow-hidden", children: [
    activeModal !== "none" && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-[var(--color-bg)]/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-4", children: /* @__PURE__ */ jsxs("div", { className: "bg-[var(--color-surface)] border border-[var(--color-fg)]/20 shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] md:max-h-[85vh]", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center p-6 border-b border-[var(--color-fg)]/10 shrink-0", children: [
        /* @__PURE__ */ jsxs("h3", { className: "font-serif italic text-[22px]", children: [
          activeModal === "library" && "Project Library",
          activeModal === "settings" && "UTM Settings",
          activeModal === "export" && "Export Data",
          activeModal === "import" && "Import Data",
          activeModal === "kavling" && "Auto Kavling",
          activeModal === "menu" && "Menu"
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: () => setActiveModal("none"), className: "text-[12px] uppercase tracking-widest font-bold opacity-50 hover:opacity-100", children: "Close [X]" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0", children: [
        activeModal === "menu" && /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-4 text-[12px] uppercase tracking-widest font-semibold", children: [
          /* @__PURE__ */ jsxs("button", { onClick: () => {
            setActiveModal("none");
          }, className: "p-3 text-left border-b border-[var(--color-fg)]/10 hover:bg-[var(--color-fg)]/5 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(MapPin, { size: 16 }),
            " ",
            t(lang, "surveyorMode")
          ] }),
          /* @__PURE__ */ jsxs("button", { onClick: () => {
            setActiveModal("library");
          }, className: "p-3 text-left border-b border-[var(--color-fg)]/10 hover:bg-[var(--color-fg)]/5 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Layers, { size: 16 }),
            " ",
            t(lang, "projectLibrary")
          ] }),
          /* @__PURE__ */ jsxs("button", { onClick: () => {
            setActiveModal("settings");
          }, className: "p-3 text-left border-b border-[var(--color-fg)]/10 hover:bg-[var(--color-fg)]/5 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Settings, { size: 16 }),
            " ",
            t(lang, "utmSettings")
          ] }),
          /* @__PURE__ */ jsxs("button", { onClick: () => {
            setActiveModal("import");
          }, className: "p-3 text-left border-b border-[var(--color-fg)]/10 hover:bg-[var(--color-fg)]/5 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(FileJson, { size: 16 }),
            " Import Data"
          ] }),
          /* @__PURE__ */ jsxs("button", { onClick: () => {
            setActiveModal("export");
          }, className: "p-3 text-left border-b border-[var(--color-fg)]/10 hover:bg-[var(--color-fg)]/5 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Download, { size: 16 }),
            " ",
            t(lang, "exportData")
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "pt-4 mt-2 flex flex-col gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "opacity-50 font-bold ml-3 text-[10px]", children: "PREFERENCES" }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 px-3", children: [
              /* @__PURE__ */ jsxs("button", { onClick: () => setLang(lang === "en" ? "id" : "en"), className: "flex items-center gap-2 p-2 border border-[var(--color-fg)]/20 rounded w-full justify-center", children: [
                "Language: ",
                lang.toUpperCase()
              ] }),
              /* @__PURE__ */ jsxs("button", { onClick: () => setIsDarkMode(!isDarkMode), className: "flex items-center gap-2 p-2 border border-[var(--color-fg)]/20 rounded w-full justify-center", children: [
                isDarkMode ? /* @__PURE__ */ jsx(Sun, { size: 14 }) : /* @__PURE__ */ jsx(Moon, { size: 14 }),
                " ",
                isDarkMode ? "LIGHT" : "DARK"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "pt-4 mt-2 flex flex-col gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "opacity-50 font-bold ml-3 text-[10px]", children: "ACCOUNT" }),
            /* @__PURE__ */ jsxs("div", { className: "px-3", children: [
              /* @__PURE__ */ jsx("div", { className: "mb-2", children: /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold uppercase tracking-widest leading-none px-2 py-1 bg-[var(--color-fg)]/10 rounded-sm", children: "LOCAL MODE" }) }),
              /* @__PURE__ */ jsxs("button", { onClick: handleLogout, className: "flex items-center gap-2 w-full p-3 justify-center text-red-500 border border-red-500/30 rounded hover:bg-red-500/10", children: [
                /* @__PURE__ */ jsx(LogOut, { size: 14 }),
                " Log Out"
              ] })
            ] })
          ] })
        ] }),
        activeModal === "library" && /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: handleNewProject,
              className: "w-full py-3 border-2 border-dashed border-[var(--color-fg)]/20 rounded flex items-center justify-center gap-2 text-[12px] uppercase tracking-widest font-bold opacity-60 hover:opacity-100 hover:border-[var(--color-fg)] hover:bg-[var(--color-fg)]/5 transition-all",
              children: [
                /* @__PURE__ */ jsx(Plus, { size: 14 }),
                " ",
                t(lang, "newProject")
              ]
            }
          ),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("form", { onSubmit: handleSaveProject, className: "flex gap-2", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: newProjectName,
                  onChange: (e) => setNewProjectName(e.target.value),
                  placeholder: t(lang, "newProjectName"),
                  className: "flex-1 border border-[var(--color-fg)]/20 bg-transparent px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-[var(--color-fg)]",
                  disabled: isSyncing
                }
              ),
              /* @__PURE__ */ jsx("button", { type: "submit", disabled: points.length === 0 || isSyncing, className: "bg-[var(--color-fg)] text-white px-4 text-[12px] uppercase tracking-widest font-bold disabled:opacity-30", children: isSyncing ? t(lang, "saving") : t(lang, "save") })
            ] }),
            points.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-[10px] text-red-500 mt-2 uppercase tracking-widest opacity-80", children: t(lang, "addPointsFirst") })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h4", { className: "text-[12px] uppercase opacity-40 mb-3", children: t(lang, "savedProjects") }),
            savedProjects.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-[13px] font-mono opacity-50 italic", children: t(lang, "noSavedProjects") }) : /* @__PURE__ */ jsx("div", { className: "space-y-3", children: savedProjects.map((proj) => /* @__PURE__ */ jsxs("div", { className: "border border-[var(--color-fg)]/10 p-3 flex justify-between flex-col gap-2", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start", children: [
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("div", { className: "font-bold text-[15px] tracking-tight", children: proj.name }),
                  /* @__PURE__ */ jsxs("div", { className: "text-[12px] font-mono opacity-50", children: [
                    new Date(proj.date).toLocaleDateString(),
                    " \u2022 ",
                    proj.points.length,
                    " ",
                    t(lang, "points")
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => handleShareProject(proj),
                      disabled: isSharing === proj.id,
                      className: `p-1.5 border rounded transition-all flex items-center justify-center ${proj.shared ? "bg-green-500/10 border-green-500/30 text-green-600" : "border-[var(--color-fg)]/20 opacity-60 hover:opacity-100"}`,
                      title: proj.shared ? t(lang, "unshare") : t(lang, "share"),
                      children: isSharing === proj.id ? /* @__PURE__ */ jsx("div", { className: "w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full" }) : shareStatus[proj.id] ? /* @__PURE__ */ jsx(Check, { size: 14 }) : /* @__PURE__ */ jsx(Share2, { size: 14 })
                    }
                  ),
                  /* @__PURE__ */ jsx("button", { onClick: () => deleteProject(proj.id), className: "text-red-500 opacity-60 hover:opacity-100 p-1.5 border border-red-500/20 rounded", children: /* @__PURE__ */ jsx(Trash2, { size: 14 }) })
                ] })
              ] }),
              proj.shared && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-2 px-2 py-1 bg-green-500/5 border border-green-500/10 rounded", children: [
                /* @__PURE__ */ jsx(Link, { size: 10, className: "text-green-600 shrink-0" }),
                /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono text-green-700 truncate opacity-80", children: shareStatus[proj.id] ? t(lang, "linkCopied") : `${window.location.origin}/?share=${proj.id}` })
              ] }),
              /* @__PURE__ */ jsx("button", { onClick: () => loadProject(proj), className: "w-full border border-[var(--color-fg)]/20 py-2 text-[12px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-white transition-colors", children: t(lang, "loadProject") })
            ] }, proj.id)) })
          ] })
        ] }),
        activeModal === "settings" && /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-[12px] uppercase opacity-40 block mb-2", children: t(lang, "measurementUnit") }),
            /* @__PURE__ */ jsxs("div", { className: "flex gap-4", children: [
              /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [
                /* @__PURE__ */ jsx("input", { type: "radio", checked: units === "metric", onChange: () => setUnits("metric"), className: "accent-[var(--color-fg)]" }),
                /* @__PURE__ */ jsx("span", { className: "text-[15px] font-mono", children: t(lang, "metric") })
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 cursor-pointer opacity-50", title: "Coming soon", children: [
                /* @__PURE__ */ jsx("input", { type: "radio", disabled: true, checked: units === "imperial", onChange: () => setUnits("imperial"), className: "accent-[var(--color-fg)]" }),
                /* @__PURE__ */ jsx("span", { className: "text-[15px] font-mono", children: t(lang, "imperial") })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-[12px] uppercase opacity-40 block mb-3 font-bold", children: t(lang, "areaDisplayUnit") }),
            /* @__PURE__ */ jsx("div", { className: "grid grid-cols-3 gap-2", children: ["sqm", "are", "ha"].map((unit) => /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => setAreaUnit(unit),
                className: `py-2 text-[13px] font-mono border transition-all ${areaUnit === unit ? "bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]" : "bg-transparent border-[var(--color-fg)]/20 opacity-60 hover:opacity-100"}`,
                children: t(lang, unit === "sqm" ? "sqmUnit" : unit === "are" ? "areUnit" : "hectaresUnit")
              },
              unit
            )) })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-[12px] uppercase opacity-40 block mb-3 font-bold", children: t(lang, "calcPrecision") }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("span", { className: "text-[11px] uppercase opacity-50 block mb-1", children: t(lang, "haSqmPrecision") }),
                /* @__PURE__ */ jsx("div", { className: "flex gap-2", children: [2, 4, 6].map((p) => /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => setAreaPrecision(p),
                    className: `flex-1 py-1.5 text-[11px] font-mono border transition-all ${areaPrecision === p ? "bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]" : "bg-transparent border-[var(--color-fg)]/20 opacity-60 hover:opacity-100"}`,
                    children: [
                      p,
                      " ",
                      t(lang, "decimalPlaces")
                    ]
                  },
                  p
                )) })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("span", { className: "text-[11px] uppercase opacity-50 block mb-1", children: t(lang, "arePrecisionLabel") }),
                /* @__PURE__ */ jsx("div", { className: "flex gap-2", children: [0, 1, 2].map((p) => /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => setArePrecision(p),
                    className: `flex-1 py-1.5 text-[11px] font-mono border transition-all ${arePrecision === p ? "bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]" : "bg-transparent border-[var(--color-fg)]/20 opacity-60 hover:opacity-100"}`,
                    children: [
                      p,
                      " ",
                      t(lang, "decimalPlaces")
                    ]
                  },
                  p
                )) })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx("hr", { className: "border-[var(--color-fg)]/10" }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-[12px] uppercase opacity-40 block mb-2", children: t(lang, "mapRenderStyle") }),
            /* @__PURE__ */ jsx(
              Toggle,
              {
                checked: showGrid,
                onChange: setShowGrid,
                label: t(lang, "showGrid")
              }
            )
          ] }),
          /* @__PURE__ */ jsx("hr", { className: "border-[var(--color-fg)]/10" }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-[12px] uppercase opacity-40 block mb-4", children: "WMS Layer Config" }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsxs("div", { className: "flex justify-between mb-1", children: [
                  /* @__PURE__ */ jsx("span", { className: "text-[12px]", children: "Opacity" }),
                  /* @__PURE__ */ jsxs("span", { className: "text-[12px] font-mono", children: [
                    Math.round(wmsOpacity * 100),
                    "%"
                  ] })
                ] }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "range",
                    min: "0",
                    max: "1",
                    step: "0.1",
                    value: wmsOpacity,
                    onChange: (e) => setWmsOpacity(parseFloat(e.target.value)),
                    className: "w-full accent-[var(--color-fg)]"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsxs("div", { className: "flex justify-between mb-1", children: [
                  /* @__PURE__ */ jsx("span", { className: "text-[12px]", children: "Hue Filter" }),
                  /* @__PURE__ */ jsxs("span", { className: "text-[12px] font-mono", children: [
                    wmsHue,
                    "deg"
                  ] })
                ] }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "range",
                    min: "0",
                    max: "360",
                    step: "10",
                    value: wmsHue,
                    onChange: (e) => setWmsHue(parseFloat(e.target.value)),
                    className: "w-full accent-[var(--color-fg)]"
                  }
                )
              ] }),
              /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(
                Toggle,
                {
                  checked: wmsInvert,
                  onChange: setWmsInvert,
                  label: "Invert Colors"
                }
              ) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "bg-[var(--color-bg)] p-4 border border-[var(--color-fg)]/10 text-[13px] font-mono opacity-70 whitespace-pre-line", children: [
            /* @__PURE__ */ jsx("strong", { children: t(lang, "crsInfoTitle") }),
            /* @__PURE__ */ jsx("br", {}),
            t(lang, "crsInfoText")
          ] })
        ] }),
        activeModal === "import" && /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsx("p", { className: "text-[15px] opacity-80 mb-2", children: "Import data polygon menggunakan GeoJSON atau raw array koordinat." }),
          /* @__PURE__ */ jsx("div", { className: "bg-[var(--color-fg)]/5 p-4 border-l-2 border-[var(--color-fg)] font-mono text-[11px] mb-4 overflow-x-auto", children: `Contoh Format (Bisa didapat dari Network Tab):
{
  "coordinates": [
    [ [115.184..., -8.808...], [115.185..., -8.808...] ]
  ]
}` }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              value: importText,
              onChange: (e) => setImportText(e.target.value),
              placeholder: "Paste JSON response di sini...",
              className: "w-full h-48 p-3 text-[12px] font-mono border border-[var(--color-fg)]/20 bg-transparent rounded focus:outline-none focus:border-[var(--color-fg)]"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: handleImportJSON,
              disabled: !importText.trim(),
              className: "w-full bg-[var(--color-fg)] text-[var(--color-bg)] py-3 text-[12px] uppercase tracking-widest font-bold mt-2 disabled:opacity-50 transition-all",
              children: "Parse & Import Data"
            }
          )
        ] }),
        activeModal === "kavling" && /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsx("p", { className: "text-[15px] opacity-80 mb-4", children: "Secara otomatis subdivisi area menjadi kavling perumahan dengan akses jalan di tengah atau samping." }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-4 pt-2 border-t border-[var(--color-fg)]/10", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block", children: "Luas Min. Kavling (m\xB2)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  value: kavlingSettings.minArea,
                  onChange: (e) => setKavlingSettings((prev) => ({ ...prev, minArea: Number(e.target.value) })),
                  className: "w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block", children: "Lebar Depan Min. (m)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  value: kavlingSettings.minFront,
                  onChange: (e) => setKavlingSettings((prev) => ({ ...prev, minFront: Number(e.target.value) })),
                  className: "w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block", children: "Lebar Jalan Akses (m)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  value: kavlingSettings.roadWidth,
                  onChange: (e) => setKavlingSettings((prev) => ({ ...prev, roadWidth: Number(e.target.value) })),
                  className: "w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block", children: "Garis Referensi (Depan)" }),
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: kavlingSettings.baseEdgeIndex,
                    onChange: (e) => setKavlingSettings((prev) => ({ ...prev, baseEdgeIndex: Number(e.target.value) })),
                    className: "w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]",
                    children: [
                      /* @__PURE__ */ jsx("option", { value: -1, children: "Otomatis (Terpanjang)" }),
                      points.map((p, idx) => {
                        const next = points[(idx + 1) % points.length];
                        const d = turf.distance([p.lng, p.lat], [next.lng, next.lat], { units: "meters" });
                        return /* @__PURE__ */ jsxs("option", { value: idx, children: [
                          "P",
                          idx + 1,
                          " - P",
                          (idx + 1) % points.length + 1,
                          " (",
                          d.toFixed(1),
                          "m)"
                        ] }, idx);
                      })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2 block", children: "Posisi Jalan Akses" }),
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: kavlingSettings.roadPlacement,
                    onChange: (e) => setKavlingSettings((prev) => ({ ...prev, roadPlacement: e.target.value })),
                    className: "w-full p-3 text-[14px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:border-[var(--color-fg)]",
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "tengah", children: "Tengah (Membelah)" }),
                      /* @__PURE__ */ jsx("option", { value: "depan", children: "Depan (Sepanjang Garis)" }),
                      /* @__PURE__ */ jsx("option", { value: "belakang", children: "Belakang (Seberang Garis)" })
                    ]
                  }
                )
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "bg-[var(--color-fg)]/5 p-4 border-l-2 border-[var(--color-fg)]", children: /* @__PURE__ */ jsx("p", { className: "text-[11px] font-mono opacity-80 leading-relaxed", children: "Hasil kavling akan tergambar langsung di peta dan juga akan ikut diexport dalam file DXF maupun PDF secara otomatis." }) }),
          /* @__PURE__ */ jsx("button", { onClick: handleGenerateKavling, className: "w-full bg-[var(--color-fg)] text-[var(--color-bg)] py-4 text-[12px] uppercase tracking-widest font-bold mt-4 shadow-lg hover:opacity-90", children: "Eksekusi Kavling" }),
          kavlings.length > 0 && /* @__PURE__ */ jsx("button", { onClick: () => {
            setKavlings([]);
            setActiveModal("none");
          }, className: "w-full border-2 border-[var(--color-fg)]/20 text-[var(--color-fg)] py-3 text-[12px] uppercase tracking-widest font-bold mt-2 hover:bg-[var(--color-fg)]/5", children: "Hapus Garis Kavling" })
        ] }),
        activeModal === "export" && /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsx("p", { className: "text-[15px] opacity-80 mb-4", children: t(lang, "exportDesc") }),
          /* @__PURE__ */ jsxs("div", { className: "bg-[var(--color-fg)]/5 p-4 border-l-2 border-[var(--color-fg)] font-mono text-[12px] space-y-2", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("strong", { children: t(lang, "pointsToProcess") }),
              " ",
              points.length
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("strong", { children: t(lang, "calculatedArea") }),
              " ",
              areaUnit === "are" ? stats.areaAre.toFixed(arePrecision) + " are" : areaUnit === "ha" ? stats.areaHectares.toFixed(areaPrecision) + " ha" : stats.areaSqMeters.toFixed(areaPrecision) + " m\xB2"
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("strong", { children: t(lang, "estimatedPerimeter") }),
              " ",
              stats.perimeter.toFixed(2),
              " m"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-3 mt-4 pt-4 border-t border-[var(--color-fg)]/10", children: [
            /* @__PURE__ */ jsx("h4", { className: "text-[12px] uppercase tracking-widest font-bold opacity-70", children: "Project Details (Optional)" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                placeholder: "Client Name",
                value: exportClientName,
                onChange: (e) => setExportClientName(e.target.value),
                className: "w-full p-2 text-[12px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:outline-none focus:border-[var(--color-fg)]"
              }
            ),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                placeholder: "NIB / Certificate Number",
                value: exportNIB,
                onChange: (e) => setExportNIB(e.target.value),
                className: "w-full p-2 text-[12px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:outline-none focus:border-[var(--color-fg)]"
              }
            ),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                placeholder: "Surveyor Name",
                value: exportSurveyor,
                onChange: (e) => setExportSurveyor(e.target.value),
                className: "w-full p-2 text-[12px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:outline-none focus:border-[var(--color-fg)]"
              }
            ),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "number",
                placeholder: `Price per ${areaUnit === "are" ? "Are" : areaUnit === "ha" ? "Hectare" : "m\xB2"} (Rp)`,
                value: pricePerUnit || "",
                onChange: (e) => setPricePerUnit(Number(e.target.value)),
                className: "w-full p-2 text-[12px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:outline-none focus:border-[var(--color-fg)]"
              }
            ),
            /* @__PURE__ */ jsx(
              "textarea",
              {
                placeholder: "Field Notes",
                value: exportNotes,
                onChange: (e) => setExportNotes(e.target.value),
                className: "w-full h-20 p-2 text-[12px] border border-[var(--color-fg)]/20 rounded bg-transparent focus:outline-none focus:border-[var(--color-fg)] resize-none"
              }
            )
          ] }),
          /* @__PURE__ */ jsx("button", { onClick: handleExport, disabled: isExporting, className: "w-full bg-[var(--color-fg)] text-white py-3 text-[12px] uppercase tracking-widest font-bold mt-4 disabled:opacity-50 flex justify-center items-center gap-2 transition-all", children: isExporting ? t(lang, "generating") : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Download, { size: 14 }),
            " ",
            t(lang, "exportPdfBtn")
          ] }) }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-3 gap-2 mt-4", children: [
            /* @__PURE__ */ jsxs("button", { onClick: handleExportGeoJSON, disabled: points.length < 3, className: "bg-transparent border border-[var(--color-fg)]/20 text-[var(--color-fg)] py-2 text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-white transition-all flex justify-center items-center gap-2 disabled:opacity-30", children: [
              /* @__PURE__ */ jsx(FileJson, { size: 14 }),
              " ",
              t(lang, "exportGeoJSON")
            ] }),
            /* @__PURE__ */ jsxs("button", { onClick: handleExportCSV, disabled: points.length === 0, className: "bg-transparent border border-[var(--color-fg)]/20 text-[var(--color-fg)] py-2 text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-white transition-all flex justify-center items-center gap-2 disabled:opacity-30", children: [
              /* @__PURE__ */ jsx(Table, { size: 14 }),
              " ",
              t(lang, "exportCSV")
            ] }),
            /* @__PURE__ */ jsxs("button", { onClick: handleExportDXF, disabled: points.length < 3, className: "col-span-2 lg:col-span-1 bg-transparent border border-[var(--color-fg)]/20 text-[var(--color-fg)] py-2 text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-white transition-all flex justify-center items-center gap-2 disabled:opacity-30", children: [
              /* @__PURE__ */ jsx(Layers, { size: 14 }),
              " Export DXF"
            ] })
          ] })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("header", { className: "flex justify-between items-center px-4 md:px-10 py-4 md:py-6 border-b border-[var(--color-fg)]/10 bg-[var(--color-bg)] z-[2000] sticky top-0", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col md:flex-row md:items-baseline gap-0 md:gap-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-baseline gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[20px] md:text-[26px] font-serif italic font-bold tracking-tight", children: "Calcare" }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: handleQuickSave,
              disabled: points.length === 0,
              className: "ml-2 px-2 py-1 bg-[var(--color-fg)] text-[var(--color-bg)] rounded text-[10px] font-bold uppercase tracking-widest disabled:opacity-30 hover:opacity-80 transition-opacity",
              children: "SAVE"
            }
          ),
          /* @__PURE__ */ jsx(AnimatePresence, { children: autoSaveStatus !== "idle" && /* @__PURE__ */ jsxs(
            motion.div,
            {
              initial: { opacity: 0, x: -10 },
              animate: { opacity: 1, x: 0 },
              exit: { opacity: 0, x: -10 },
              className: "flex items-center gap-1.5",
              children: [
                /* @__PURE__ */ jsx("div", { className: `w-1.5 h-1.5 rounded-full ${autoSaveStatus === "saving" ? "bg-orange-500 animate-pulse" : "bg-green-500"}` }),
                /* @__PURE__ */ jsx("span", { className: "text-[9px] uppercase tracking-widest font-bold opacity-40", children: autoSaveStatus === "saving" ? "SAVING..." : "SAVED" })
              ]
            }
          ) })
        ] }),
        /* @__PURE__ */ jsx("span", { className: "text-[10px] md:text-[12px] uppercase tracking-widest opacity-50 block md:inline font-mono", children: "V.1 by Rifky Rangga" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 md:gap-8", children: [
        /* @__PURE__ */ jsxs("nav", { className: "hidden lg:flex gap-8 text-[12px] uppercase tracking-widest font-semibold", children: [
          /* @__PURE__ */ jsx("button", { onClick: () => setActiveModal("none"), className: `cursor-pointer pb-1 ${activeModal === "none" ? "border-b border-[var(--color-fg)]" : "opacity-40 hover:opacity-100"}`, children: t(lang, "surveyorMode") }),
          /* @__PURE__ */ jsx("button", { onClick: () => setActiveModal("library"), className: `cursor-pointer pb-1 ${activeModal === "library" ? "border-b border-[var(--color-fg)]" : "opacity-40 hover:opacity-100"}`, children: t(lang, "projectLibrary") }),
          /* @__PURE__ */ jsx("button", { onClick: () => setActiveModal("settings"), className: `cursor-pointer pb-1 ${activeModal === "settings" ? "border-b border-[var(--color-fg)]" : "opacity-40 hover:opacity-100"}`, children: t(lang, "utmSettings") }),
          /* @__PURE__ */ jsx("button", { onClick: () => setActiveModal("import"), className: `cursor-pointer pb-1 ${activeModal === "import" ? "border-b border-[var(--color-fg)]" : "opacity-40 hover:opacity-100"}`, children: "Import Data" }),
          /* @__PURE__ */ jsx("button", { onClick: () => setActiveModal("export"), className: `cursor-pointer pb-1 ${activeModal === "export" ? "border-b border-[var(--color-fg)]" : "opacity-40 hover:opacity-100"}`, children: t(lang, "exportData") })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "hidden lg:flex items-center gap-2 md:gap-4 ml-2 md:ml-0 md:border-l border-[var(--color-fg)]/10 md:pl-4", children: [
          /* @__PURE__ */ jsx("div", { className: "flex items-center gap-3", children: /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold uppercase tracking-widest leading-none px-2 py-1 bg-[var(--color-fg)]/10 rounded-sm", children: "LOCAL MODE" }) }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: handleLogout,
              className: "p-1.5 border border-[var(--color-fg)]/20 rounded hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-colors opacity-80 hover:opacity-100 flex items-center justify-center text-red-500 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/30",
              title: "Logout",
              children: /* @__PURE__ */ jsx(LogOut, { size: 14 })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "hidden lg:flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setLang(lang === "en" ? "id" : "en"),
              className: "px-2 py-1 text-[11px] font-bold border border-[var(--color-fg)]/20 rounded hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-colors opacity-80 hover:opacity-100",
              title: t(lang, "toggleLang"),
              children: lang === "en" ? "EN" : "ID"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setIsDarkMode(!isDarkMode),
              className: "p-1.5 border border-[var(--color-fg)]/20 rounded hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-colors opacity-80 hover:opacity-100 flex items-center justify-center",
              title: t(lang, "toggleTheme"),
              children: isDarkMode ? /* @__PURE__ */ jsx(Sun, { size: 14 }) : /* @__PURE__ */ jsx(Moon, { size: 14 })
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex lg:hidden items-center", children: /* @__PURE__ */ jsx("button", { onClick: () => setActiveModal("menu"), className: "p-2 border border-[var(--color-fg)]/10 rounded", title: "Menu", children: /* @__PURE__ */ jsx(Menu, { size: 20, className: "opacity-70" }) }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("main", { className: "flex-1 flex flex-col md:flex-row overflow-hidden relative mb-[64px] md:mb-0", children: [
      /* @__PURE__ */ jsxs("aside", { className: `${mobileTab === "points" ? "flex" : "hidden md:flex"} w-full md:w-[300px] lg:w-[350px] border-r border-[var(--color-fg)]/10 p-5 lg:p-8 flex flex-col bg-[var(--color-bg)] h-full shrink-0 z-[1000] overflow-hidden`, children: [
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-6", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-[12px] uppercase tracking-widest opacity-50 font-bold", children: t(lang, "inputCoordsHeader") }),
          /* @__PURE__ */ jsx("div", { className: `px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${isFreehand ? "bg-orange-500 text-white" : isEditMode ? "bg-blue-500 text-white" : "bg-green-500 text-white"}`, children: isFreehand ? t(lang, "freehand") : isEditMode ? t(lang, "editMode") : t(lang, "addMode") })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar min-h-0", children: [
          points.map((p, idx) => /* @__PURE__ */ jsxs(
            "div",
            {
              onClick: () => {
                setMapCenter([p.lat, p.lng]);
                setSelectedPointIndex(idx);
              },
              className: `p-4 border shadow-sm flex flex-col group relative transition-all cursor-pointer hover:border-[var(--color-fg)]/40 hover:shadow-md ${selectedPointIndex === idx ? "border-[var(--color-fg)] ring-1 ring-[var(--color-fg)] ring-inset" : ""} ${isEditMode ? "border-[var(--color-fg)] bg-[var(--color-fg)]/5" : "border-[var(--color-fg)]/20 bg-[var(--color-surface)]"}`,
              children: [
                /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-2", children: [
                  /* @__PURE__ */ jsxs("span", { className: `text-[12px] font-mono font-bold ${isEditMode ? "opacity-100" : "opacity-40"}`, children: [
                    t(lang, "pointLabel"),
                    "_",
                    String(idx + 1).padStart(2, "0")
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 pr-6", children: [
                    /* @__PURE__ */ jsx(
                      "input",
                      {
                        type: "color",
                        value: p.color || DEFAULT_POINT_COLOR,
                        onChange: (e) => {
                          e.stopPropagation();
                          handleColorChange(idx, e.target.value);
                        },
                        onClick: (e) => e.stopPropagation(),
                        className: "w-4 h-4 rounded-full overflow-hidden cursor-pointer border-none p-0 bg-transparent",
                        title: "Point Color"
                      }
                    ),
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        onClick: (e) => {
                          e.stopPropagation();
                          removePointAt(idx);
                        },
                        className: `${isEditMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"} text-[var(--color-fg)] hover:text-red-600 transition-all absolute right-2 top-2 p-1`,
                        children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "flex flex-col gap-2", children: isEditMode ? /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1", children: [
                    /* @__PURE__ */ jsx("label", { className: "text-[9px] uppercase opacity-40 font-bold", children: "Lat" }),
                    /* @__PURE__ */ jsx(
                      "input",
                      {
                        type: "text",
                        inputMode: "decimal",
                        value: p.lat,
                        onClick: (e) => e.stopPropagation(),
                        onChange: (e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            handlePointDrag(idx, val, p.lng);
                          } else if (e.target.value === "" || e.target.value === "-") {
                            setPoints((prev) => {
                              const next = [...prev];
                              return prev;
                            });
                          }
                        },
                        className: `bg-transparent border-b font-mono text-[13px] focus:outline-none transition-colors ${isNaN(p.lat) || p.lat < -90 || p.lat > 90 ? "border-red-500 text-red-500" : "border-[var(--color-fg)]/20 focus:border-[var(--color-fg)]"}`
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1", children: [
                    /* @__PURE__ */ jsx("label", { className: "text-[9px] uppercase opacity-40 font-bold", children: "Lng" }),
                    /* @__PURE__ */ jsx(
                      "input",
                      {
                        type: "text",
                        inputMode: "decimal",
                        value: p.lng,
                        onClick: (e) => e.stopPropagation(),
                        onChange: (e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            handlePointDrag(idx, p.lat, val);
                          }
                        },
                        className: `bg-transparent border-b font-mono text-[13px] text-right focus:outline-none transition-colors ${isNaN(p.lng) || p.lng < -180 || p.lng > 180 ? "border-red-500 text-red-500" : "border-[var(--color-fg)]/20 focus:border-[var(--color-fg)]"}`
                      }
                    )
                  ] })
                ] }) : /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
                  /* @__PURE__ */ jsx("span", { className: "font-mono text-[13px]", children: p.lat.toFixed(6) }),
                  /* @__PURE__ */ jsx("span", { className: "font-mono text-[13px] text-right", children: p.lng.toFixed(6) })
                ] }) })
              ]
            },
            idx
          )),
          !isEditMode && /* @__PURE__ */ jsxs("form", { onSubmit: handleManualAdd, className: "p-4 border border-dashed border-[var(--color-fg)]/20 opacity-60 hover:opacity-100 hover:bg-[var(--color-surface)] transition-colors", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  inputMode: "decimal",
                  placeholder: t(lang, "latitude"),
                  value: manualInput.lat,
                  onChange: (e) => setManualInput({ ...manualInput, lat: e.target.value }),
                  className: `flex-1 w-full border bg-transparent px-2 py-1 text-[13px] font-mono focus:outline-none transition-colors ${manualInput.lat && (isNaN(parseFloat(manualInput.lat)) || parseFloat(manualInput.lat) < -90 || parseFloat(manualInput.lat) > 90) ? "border-red-500 text-red-500" : "border-[var(--color-fg)]/20 focus:border-[var(--color-fg)]"}`,
                  required: true
                }
              ),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  inputMode: "decimal",
                  placeholder: t(lang, "longitude"),
                  value: manualInput.lng,
                  onChange: (e) => setManualInput({ ...manualInput, lng: e.target.value }),
                  className: `flex-1 w-full border bg-transparent px-2 py-1 text-[13px] font-mono focus:outline-none transition-colors ${manualInput.lng && (isNaN(parseFloat(manualInput.lng)) || parseFloat(manualInput.lng) < -180 || parseFloat(manualInput.lng) > 180) ? "border-red-500 text-red-500" : "border-[var(--color-fg)]/20 focus:border-[var(--color-fg)]"}`,
                  required: true
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("button", { type: "submit", className: "w-full mt-3 text-[12px] uppercase tracking-tighter font-bold flex items-center justify-center gap-1 opacity-80 cursor-pointer", children: [
              /* @__PURE__ */ jsx(Plus, { size: 12 }),
              " ",
              t(lang, "addNextCoord")
            ] })
          ] }),
          !isEditMode && points.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-center py-12 px-4 border border-dashed border-[var(--color-fg)]/10", children: /* @__PURE__ */ jsx("p", { className: "text-[12px] uppercase tracking-widest opacity-30 italic", children: t(lang, "noPointsYet") }) })
        ] }),
        (points.length > 0 || measurePoints.length > 0) && /* @__PURE__ */ jsxs("div", { className: "mt-8 space-y-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: () => {
                  const next = !isEditMode;
                  setIsEditMode(next);
                  if (next) {
                    setIsFreehand(false);
                    setIsMeasuring(false);
                  }
                },
                className: `w-full border py-4 text-[12px] uppercase tracking-widest font-bold transition-colors flex justify-center items-center gap-2 ${isEditMode ? "bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]" : "bg-transparent border-[var(--color-fg)] text-[var(--color-fg)] hover:bg-[var(--color-fg)]/5"}`,
                children: [
                  /* @__PURE__ */ jsx(MousePointer2, { size: 14 }),
                  isEditMode ? t(lang, "editModeActive") : t(lang, "editMode")
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: () => {
                  const next = !isFreehand;
                  setIsFreehand(next);
                  if (next) {
                    setIsEditMode(false);
                    setIsMeasuring(false);
                  }
                },
                className: `w-full border py-4 text-[12px] uppercase tracking-widest font-bold transition-colors flex justify-center items-center gap-2 ${isFreehand ? "bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]" : "bg-transparent border-[var(--color-fg)] text-[var(--color-fg)] hover:bg-[var(--color-fg)]/5"}`,
                children: [
                  /* @__PURE__ */ jsx(Pencil, { size: 14 }),
                  isFreehand ? t(lang, "freehandActive") : t(lang, "freehand")
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsx("div", { className: "mb-2", children: /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => {
                const next = !isAutoDetect;
                setIsAutoDetect(next);
                if (next) {
                  setIsFreehand(false);
                  setIsEditMode(false);
                  setIsMeasuring(false);
                  setIsDrawing(false);
                }
              },
              className: `w-full border py-4 text-[12px] uppercase tracking-widest font-bold transition-all flex justify-center items-center gap-2 shadow-sm ${isAutoDetect || isDetecting ? "bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)]" : "bg-transparent border-[var(--color-fg)] text-[var(--color-fg)] hover:bg-[var(--color-fg)]/5"}`,
              children: [
                isDetecting ? /* @__PURE__ */ jsx("div", { className: "w-3 h-3 border-2 border-inherit border-t-transparent animate-spin rounded-full" }) : /* @__PURE__ */ jsx(Crosshair, { size: 14 }),
                isAutoDetect ? "CLICK MAP TO DETECT" : isDetecting ? "DETECTING..." : "AUTO DETECT PLOT"
              ]
            }
          ) }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: handleUndo,
                className: "w-full border border-[var(--color-fg)] text-[var(--color-fg)] bg-transparent py-4 text-[12px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] transition-colors flex justify-center items-center gap-2",
                children: [
                  /* @__PURE__ */ jsx(ArrowLeft, { size: 14 }),
                  " ",
                  t(lang, "undo")
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: handleClear,
                className: "w-full border border-[var(--color-fg)] text-[var(--color-bg)] bg-[var(--color-fg)] py-4 text-[12px] uppercase tracking-widest font-bold hover:bg-red-700 hover:border-red-700 transition-colors flex justify-center items-center gap-2",
                children: [
                  /* @__PURE__ */ jsx(Eraser, { size: 14 }),
                  " ",
                  t(lang, "clear")
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "mt-8 text-center text-[12px] font-mono uppercase tracking-widest opacity-30 select-none", children: "\xA92026 All Rights Reserved" })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: `${mobileTab === "map" ? "block" : "hidden md:block"} flex-1 bg-[var(--color-map)] relative isolate h-full md:h-auto`, children: [
        /* @__PURE__ */ jsx("div", { className: "absolute inset-0 opacity-20 pointer-events-none", style: { backgroundImage: "radial-gradient(#1A1A1A 1px, transparent 1px)", backgroundSize: "20px 20px", zIndex: 0 } }),
        /* @__PURE__ */ jsxs("div", { className: "absolute top-4 left-4 right-16 md:left-6 md:right-auto md:w-[320px] z-[2000] flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxs("form", { onSubmit: handleSearch, className: "bg-[var(--color-surface)] border border-[var(--color-fg)]/30 shadow-md flex items-center px-4 py-3 group focus-within:border-[var(--color-fg)]", children: [
            isSearching ? /* @__PURE__ */ jsx("div", { className: "w-3.5 h-3.5 border-2 border-[var(--color-fg)]/30 border-t-[var(--color-fg)] rounded-full animate-spin mr-3" }) : /* @__PURE__ */ jsx(Search, { size: 14, className: "opacity-50 mr-3 group-focus-within:opacity-100 transition-opacity" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                placeholder: t(lang, "searchPlaceholder"),
                className: "bg-transparent text-[13px] outline-none flex-1 font-sans text-[var(--color-fg)] placeholder:opacity-50",
                value: searchQuery,
                onChange: (e) => setSearchQuery(e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsx(AnimatePresence, { children: isSearching && searchQuery.length > 2 && searchResults.length === 0 && /* @__PURE__ */ jsxs(
            motion.div,
            {
              initial: { opacity: 0, y: -10 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -10 },
              className: "bg-[var(--color-bg)]/80 backdrop-blur-sm px-4 py-2 text-[10px] uppercase tracking-widest font-bold border-x border-b border-[var(--color-fg)]/10",
              children: [
                t(lang, "searching"),
                "..."
              ]
            }
          ) }),
          /* @__PURE__ */ jsx(AnimatePresence, { children: isFreehand && /* @__PURE__ */ jsx(
            motion.div,
            {
              initial: { opacity: 0, y: 20, x: "-50%" },
              animate: { opacity: 1, y: 0, x: "-50%" },
              exit: { opacity: 0, y: 20, x: "-50%" },
              className: "fixed bottom-24 md:bottom-10 left-1/2 z-[3000] w-auto pointer-events-auto",
              children: /* @__PURE__ */ jsxs(
                "button",
                {
                  onClick: () => setIsFreehand(false),
                  className: "bg-[var(--color-fg)] text-[var(--color-bg)] shadow-[0_10px_30px_rgba(0,0,0,0.3)] flex items-center justify-center gap-3 px-8 py-5 group hover:scale-[1.05] active:scale-95 transition-all rounded-full",
                  children: [
                    /* @__PURE__ */ jsx(
                      motion.div,
                      {
                        animate: { scale: [1, 1.2, 1] },
                        transition: { duration: 1.5, repeat: Infinity },
                        className: "bg-green-500 w-2.5 h-2.5 rounded-full"
                      }
                    ),
                    /* @__PURE__ */ jsx(Check, { size: 18, className: "text-[var(--color-bg)]" }),
                    /* @__PURE__ */ jsx("span", { className: "text-[14px] font-bold uppercase tracking-[0.2em]", children: t(lang, "doneDrawing") })
                  ]
                }
              )
            },
            "done-drawing-container"
          ) }),
          searchResults.length > 0 && /* @__PURE__ */ jsx("div", { className: "bg-[var(--color-surface)] border border-[var(--color-fg)]/20 shadow-lg max-h-64 overflow-y-auto custom-scrollbar flex flex-col divide-y divide-[var(--color-fg)]/10", children: searchResults.map((res) => /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: `text-left px-5 py-3 transition-colors ${selectedResultId === res.place_id ? "bg-[var(--color-fg)] text-white" : "hover:bg-[var(--color-bg)] text-[var(--color-fg)]"}`,
              onClick: () => {
                setMapCenter([parseFloat(res.lat), parseFloat(res.lon)]);
                setSelectedResultId(res.place_id);
                setSelectedSearchResult(res);
                setSearchResults([]);
              },
              children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
                /* @__PURE__ */ jsx("span", { className: `font-bold text-[12px] block truncate ${selectedResultId === res.place_id ? "text-white" : "text-[var(--color-fg)]"}`, children: res.address?.name || res.display_name.split(",")[0] }),
                /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-x-2 gap-y-1 mt-1.5", children: [
                  res.address && /* @__PURE__ */ jsxs(Fragment, { children: [
                    res.address.village && /* @__PURE__ */ jsxs("span", { className: `text-[9px] uppercase tracking-tighter px-1.5 py-0.5 border border-[var(--color-fg)]/10 rounded font-bold ${selectedResultId === res.place_id ? "border-white/40 text-white bg-white/10" : "bg-[var(--color-fg)]/5 text-[var(--color-fg)]"}`, children: [
                      "Desa: ",
                      res.address.village
                    ] }),
                    res.address.suburb && /* @__PURE__ */ jsxs("span", { className: `text-[9px] uppercase tracking-tighter px-1.5 py-0.5 border border-[var(--color-fg)]/10 rounded font-bold ${selectedResultId === res.place_id ? "border-white/40 text-white bg-white/10" : "bg-[var(--color-fg)]/5 text-[var(--color-fg)]"}`, children: [
                      "Kec: ",
                      res.address.suburb
                    ] }),
                    res.address.city && /* @__PURE__ */ jsxs("span", { className: `text-[9px] uppercase tracking-tighter px-1.5 py-0.5 border border-[var(--color-fg)]/10 rounded font-bold ${selectedResultId === res.place_id ? "border-white/40 text-white bg-white/10" : "bg-[var(--color-fg)]/5 text-[var(--color-fg)]"}`, children: [
                      "Kota: ",
                      res.address.city
                    ] }),
                    res.address.state && /* @__PURE__ */ jsx("span", { className: `text-[9px] uppercase tracking-tighter px-1.5 py-0.5 border border-[var(--color-fg)]/10 rounded font-bold ${selectedResultId === res.place_id ? "border-white/40 text-white bg-white/10" : "bg-[var(--color-fg)]/5 text-[var(--color-fg)]"}`, children: res.address.state }),
                    res.address.country && /* @__PURE__ */ jsx("span", { className: `text-[9px] uppercase tracking-tighter px-1.5 py-0.5 border border-[var(--color-fg)]/20 rounded font-bold ${selectedResultId === res.place_id ? "border-white/60 text-white bg-white/20" : "bg-[var(--color-fg)]/10 text-[var(--color-fg)]"}`, children: res.address.country })
                  ] }),
                  !res.address && /* @__PURE__ */ jsx("span", { className: `text-[10px] font-mono block truncate ${selectedResultId === res.place_id ? "opacity-80" : "opacity-60"}`, children: res.display_name })
                ] })
              ] })
            },
            res.place_id
          )) })
        ] }),
        /* @__PURE__ */ jsxs("div", { ref: mapRef, className: "absolute inset-0 w-full h-full overflow-hidden", children: [
          /* @__PURE__ */ jsx(MapWatermark, {}),
          /* @__PURE__ */ jsxs(AnimatePresence, { children: [
            isFreehand && /* @__PURE__ */ jsxs(
              motion.div,
              {
                initial: { opacity: 0, y: -20, x: "-50%" },
                animate: { opacity: 1, y: 0, x: "-50%" },
                exit: { opacity: 0, y: -20, x: "-50%" },
                className: "fixed top-6 left-1/2 z-[2500] px-4 py-2 bg-[var(--color-fg)] text-[var(--color-bg)] text-[10px] uppercase font-bold tracking-[0.2em] shadow-2xl flex items-center gap-3 border border-white/20 rounded-full",
                children: [
                  /* @__PURE__ */ jsx("div", { className: `w-2 h-2 rounded-full ${isDrawing ? "bg-red-500 animate-pulse" : "bg-green-500"}` }),
                  isDrawing ? "DRAWING ACTIVE" : "FREEHAND MODE ACTIVE"
                ]
              }
            ),
            isMeasuring && /* @__PURE__ */ jsxs(
              motion.div,
              {
                initial: { opacity: 0, y: -20, x: "-50%" },
                animate: { opacity: 1, y: 0, x: "-50%" },
                exit: { opacity: 0, y: -20, x: "-50%" },
                className: "fixed top-6 left-1/2 z-[2500] px-4 py-2 bg-[var(--color-fg)] text-[var(--color-bg)] text-[10px] uppercase font-bold tracking-[0.2em] shadow-2xl flex items-center gap-3 border border-white/20 rounded-full",
                children: [
                  /* @__PURE__ */ jsx("div", { className: `w-2 h-2 rounded-full ${measurePoints.length >= 2 ? "bg-green-500" : "bg-yellow-500 animate-pulse"}` }),
                  measurePoints.length === 0 ? "CLICK MAP TO START MEASURING" : measurePoints.length === 1 ? "CLICK SECOND POINT" : `TOTAL DISTANCE: ${calculateTotalMeasureDistance(measurePoints).toFixed(2)} m (${measurePoints.length} PTS)`
                ]
              }
            ),
            activeKey && /* @__PURE__ */ jsxs(
              motion.div,
              {
                initial: { opacity: 0, scale: 0.8 },
                animate: { opacity: 1, scale: 1 },
                exit: { opacity: 0, scale: 0.8 },
                className: "fixed bottom-32 left-1/2 -translate-x-1/2 z-[4000] px-3 py-1.5 bg-[var(--color-fg)] text-[var(--color-bg)] text-[9px] uppercase font-bold tracking-widest shadow-2xl border border-white/20 rounded flex items-center gap-2",
                children: [
                  /* @__PURE__ */ jsx(MousePointer2, { size: 10, className: "animate-bounce" }),
                  "Adjusting: ",
                  activeKey.replace("Arrow", "")
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsx("style", { children: `
              .leaflet-layer.custom-wms-layer {
                 filter: hue-rotate(${wmsHue}deg) invert(${wmsInvert ? 1 : 0}) !important;
              }
            ` }),
          /* @__PURE__ */ jsxs(
            MapContainer,
            {
              ref: mapInstanceRef,
              center: [-8.6705, 115.2126],
              zoom: 12,
              maxZoom: 24,
              preferCanvas: true,
              className: `w-full h-full z-10 ${!isEditMode || isFreehand || isMeasuring ? "cursor-crosshair" : ""} ${isAutoDetect ? "cursor-help" : ""}`,
              zoomControl: false,
              attributionControl: false,
              children: [
                /* @__PURE__ */ jsx(CustomZoomControl, {}),
                /* @__PURE__ */ jsx(UserLocationManager, {}),
                /* @__PURE__ */ jsx(MapCameraController, { center: mapCenter }),
                /* @__PURE__ */ jsxs(LayersControl, { position: "topright", children: [
                  /* @__PURE__ */ jsx(LayersControl.BaseLayer, { checked: true, name: "Google Satellite (HD)", children: /* @__PURE__ */ jsx(
                    TileLayer,
                    {
                      attribution: "\xA9 Google",
                      url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
                      maxZoom: 24,
                      crossOrigin: "anonymous"
                    }
                  ) }),
                  /* @__PURE__ */ jsx(LayersControl.BaseLayer, { name: "Satellite (Esri)", children: /* @__PURE__ */ jsx(
                    TileLayer,
                    {
                      attribution: "Tiles \xA9 Esri \u2014 Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
                      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                      maxZoom: 24,
                      maxNativeZoom: 19,
                      crossOrigin: "anonymous"
                    }
                  ) }),
                  /* @__PURE__ */ jsx(LayersControl.BaseLayer, { name: "Street View", children: /* @__PURE__ */ jsx(
                    TileLayer,
                    {
                      attribution: '\xA9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                      maxZoom: 19,
                      crossOrigin: "anonymous"
                    }
                  ) }),
                  /* @__PURE__ */ jsx(LayersControl.BaseLayer, { name: "Terrain (Esri)", children: /* @__PURE__ */ jsx(
                    TileLayer,
                    {
                      attribution: "Tiles \xA9 Esri \u2014 Source: USGS, Esri, TANA, DeLorme, and NPS",
                      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
                      maxZoom: 13,
                      crossOrigin: "anonymous"
                    }
                  ) }),
                  /* @__PURE__ */ jsx(LayersControl.BaseLayer, { name: "Monotone (Toner)", children: /* @__PURE__ */ jsx(
                    TileLayer,
                    {
                      attribution: '\xA9 <a href="https://stadiamaps.com/">Stadia Maps</a>, \xA9 <a href="https://openmaptiles.org/">OpenMapTiles</a> \xA9 <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
                      url: "https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png",
                      maxZoom: 20,
                      crossOrigin: "anonymous"
                    }
                  ) }),
                  wmsLayersList.map((layer, idx) => /* @__PURE__ */ jsx(LayersControl.Overlay, { name: layer.name.startsWith("GeoServer") ? layer.name : `GeoServer - ${layer.name}`, children: /* @__PURE__ */ jsx(
                    WMSTileLayer,
                    {
                      url: "https://geo2.perare.io/geoserver/dorado/wms",
                      layers: layer.layers,
                      format: "image/png",
                      transparent: true,
                      maxZoom: 24,
                      opacity: wmsOpacity,
                      className: "custom-wms-layer",
                      crossOrigin: "anonymous"
                    }
                  ) }, idx)),
                  /* @__PURE__ */ jsx(LayersControl.Overlay, { checked: true, name: "Survey Layers", children: /* @__PURE__ */ jsx(LayerGroup, { children: /* @__PURE__ */ jsxs(Fragment, { children: [
                    selectedSearchResult && /* @__PURE__ */ jsx(
                      Marker,
                      {
                        position: [parseFloat(selectedSearchResult.lat), parseFloat(selectedSearchResult.lon)],
                        icon: L.divIcon({
                          className: "search-result-marker",
                          html: `<div class="relative">
                                  <div class="absolute -top-8 -left-4 bg-red-500 w-8 h-8 rounded-full rounded-bl-none rotate-45 border-2 border-white shadow-xl flex items-center justify-center">
                                    <div class="-rotate-45 text-white"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
                                  </div>
                                </div>`,
                          iconSize: [0, 0],
                          iconAnchor: [0, 0]
                        }),
                        children: /* @__PURE__ */ jsx(Popup, { className: "custom-popup", children: /* @__PURE__ */ jsxs("div", { className: "p-2 min-w-[200px]", children: [
                          /* @__PURE__ */ jsx("h3", { className: "font-bold text-[14px] mb-1", children: selectedSearchResult.address?.name || selectedSearchResult.display_name.split(",")[0] }),
                          /* @__PURE__ */ jsx("p", { className: "text-[11px] opacity-70 mb-3 leading-relaxed", children: selectedSearchResult.display_name }),
                          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2 mb-3", children: [
                            /* @__PURE__ */ jsxs("div", { className: "bg-gray-100 p-2 rounded", children: [
                              /* @__PURE__ */ jsx("span", { className: "text-[8px] uppercase opacity-50 block", children: "Latitude" }),
                              /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono", children: parseFloat(selectedSearchResult.lat).toFixed(6) })
                            ] }),
                            /* @__PURE__ */ jsxs("div", { className: "bg-gray-100 p-2 rounded", children: [
                              /* @__PURE__ */ jsx("span", { className: "text-[8px] uppercase opacity-50 block", children: "Longitude" }),
                              /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono", children: parseFloat(selectedSearchResult.lon).toFixed(6) })
                            ] })
                          ] }),
                          /* @__PURE__ */ jsx(
                            "button",
                            {
                              onClick: () => {
                                const newPoint = {
                                  lat: parseFloat(selectedSearchResult.lat),
                                  lng: parseFloat(selectedSearchResult.lon),
                                  color: DEFAULT_POINT_COLOR
                                };
                                setPoints([...points, newPoint]);
                                setSelectedSearchResult(null);
                                setSelectedResultId(null);
                              },
                              className: "w-full py-2 bg-[var(--color-fg)] text-[var(--color-bg)] rounded text-[10px] uppercase tracking-widest font-bold hover:opacity-90 transition-opacity",
                              children: "Tambah Titik (Center)"
                            }
                          ),
                          selectedSearchResult.geojson && selectedSearchResult.geojson.type === "Polygon" && /* @__PURE__ */ jsxs(
                            "button",
                            {
                              onClick: () => {
                                const coords = selectedSearchResult.geojson.coordinates[0];
                                const newPoints = coords.slice(0, -1).map((c) => ({
                                  lat: c[1],
                                  lng: c[0],
                                  color: DEFAULT_POINT_COLOR
                                }));
                                setPoints(newPoints);
                                if (newPoints.length > 0) {
                                  setMapCenter([newPoints[0].lat, newPoints[0].lng]);
                                }
                                setSelectedSearchResult(null);
                                setSelectedResultId(null);
                              },
                              className: "w-full mt-2 py-2 bg-orange-500 text-white rounded text-[10px] uppercase tracking-widest font-bold hover:bg-orange-600 transition-colors",
                              children: [
                                "Ambil Polygon Area (",
                                selectedSearchResult.geojson.coordinates[0].length - 1,
                                " Titik)"
                              ]
                            }
                          ),
                          selectedSearchResult.geojson && selectedSearchResult.geojson.type === "MultiPolygon" && /* @__PURE__ */ jsxs(
                            "button",
                            {
                              onClick: () => {
                                const coords = selectedSearchResult.geojson.coordinates[0][0];
                                const newPoints = coords.slice(0, -1).map((c) => ({
                                  lat: c[1],
                                  lng: c[0],
                                  color: DEFAULT_POINT_COLOR
                                }));
                                setPoints(newPoints);
                                if (newPoints.length > 0) {
                                  setMapCenter([newPoints[0].lat, newPoints[0].lng]);
                                }
                                setSelectedSearchResult(null);
                                setSelectedResultId(null);
                              },
                              className: "w-full mt-2 py-2 bg-orange-500 text-white rounded text-[10px] uppercase tracking-widest font-bold hover:bg-orange-600 transition-colors",
                              children: [
                                "Ambil Polygon Area Utama (",
                                selectedSearchResult.geojson.coordinates[0][0].length - 1,
                                " Titik)"
                              ]
                            }
                          ),
                          /* @__PURE__ */ jsx(
                            "button",
                            {
                              onClick: () => setSelectedSearchResult(null),
                              className: "w-full mt-2 py-2 border border-[var(--color-fg)]/10 text-[var(--color-fg)] rounded text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--color-fg)]/5 transition-colors",
                              children: "Tutup"
                            }
                          )
                        ] }) })
                      }
                    ),
                    points.length > 2 && /* @__PURE__ */ jsx(
                      Polygon,
                      {
                        positions: points.map((p) => [p.lat, p.lng]),
                        pathOptions: {
                          color: "#FFFFFF",
                          fillColor: "#FFFFFF",
                          fillOpacity: 0.15,
                          weight: 2,
                          lineJoin: "miter"
                        },
                        eventHandlers: {
                          click: (e) => {
                            L.DomEvent.stopPropagation(e);
                            setShowPlotSizes((prev) => !prev);
                          }
                        }
                      }
                    ),
                    showKavlings && kavlings.map((k) => /* @__PURE__ */ jsxs(React.Fragment, { children: [
                      /* @__PURE__ */ jsx(
                        GeoJSON,
                        {
                          data: k.polygon,
                          style: {
                            color: k.type === "road" ? "#cbd5e1" : k.type === "remnant" ? "#f59e0b" : "#3b82f6",
                            weight: 1,
                            fillColor: k.type === "road" ? "#cbd5e1" : k.type === "remnant" ? "#fef3c7" : "#dbeafe",
                            fillOpacity: 0.7
                          }
                        }
                      ),
                      k.center && k.type !== "road" && /* @__PURE__ */ jsx(Marker, { position: [k.center[1], k.center[0]], opacity: 0, children: /* @__PURE__ */ jsxs(Tooltip, { permanent: true, direction: "center", className: "bg-transparent border-0 shadow-none text-blue-900 font-bold opacity-80", style: { fontSize: "10px" }, children: [
                        Math.round(k.area),
                        " m\xB2",
                        /* @__PURE__ */ jsx("br", {}),
                        /* @__PURE__ */ jsxs("span", { className: "text-[8px] opacity-70 font-mono", children: [
                          k.widthStr,
                          "m x ",
                          k.depthStr,
                          "m"
                        ] })
                      ] }) }),
                      k.edges && k.edges.map((edge, eIdx) => /* @__PURE__ */ jsx(Marker, { position: [edge.midpoint[1], edge.midpoint[0]], opacity: 0, children: /* @__PURE__ */ jsxs(Tooltip, { permanent: true, direction: "center", className: "bg-transparent border-0 shadow-none text-[#3b82f6] font-bold opacity-60", style: { fontSize: "8px", padding: 0 }, children: [
                        edge.length,
                        "m"
                      ] }) }, `edge-${k.id}-${eIdx}`))
                    ] }, k.id)),
                    points.length > 2 && stats.longestLine && showPlotSizes && /* @__PURE__ */ jsx(
                      Polyline,
                      {
                        positions: [
                          [stats.longestLine.geometry.coordinates[0][1], stats.longestLine.geometry.coordinates[0][0]],
                          [stats.longestLine.geometry.coordinates[1][1], stats.longestLine.geometry.coordinates[1][0]]
                        ],
                        pathOptions: {
                          color: "#FFFFFF",
                          dashArray: "4, 4",
                          weight: 1.5,
                          opacity: 0.8
                        }
                      }
                    ),
                    showPlotSizes && stats.edges?.map((e, idx) => {
                      const labelIcon = L.divIcon({
                        className: "bg-[var(--color-surface)] border border-[var(--color-fg)]/10 px-1.5 py-0.5 rounded text-[12px] font-mono font-bold text-[var(--color-fg)] whitespace-nowrap shadow-md text-center !ml-[-50%] !mt-[-12px] opacity-90",
                        html: `<div>${e.distance.toFixed(1)}m</div>`,
                        iconSize: void 0
                      });
                      return /* @__PURE__ */ jsx(Marker, { position: [e.midpoint.lat, e.midpoint.lng], icon: labelIcon }, `edge-${idx}`);
                    }),
                    points.map((p, idx) => {
                      const markerIcon = L.divIcon({
                        className: `custom-div-icon group ${selectedPointIndex === idx ? "selected" : ""}`,
                        html: `<div class="marker-inner shadow-lg transition-all duration-300" style="background-color: ${p.color || DEFAULT_POINT_COLOR}; width: 12px; height: 12px; border: 2.5px solid white; border-radius: 50%;"></div>`,
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                      });
                      return /* @__PURE__ */ jsxs(
                        Marker,
                        {
                          position: [p.lat, p.lng],
                          draggable: isEditMode && !isFreehand,
                          icon: markerIcon,
                          zIndexOffset: selectedPointIndex === idx ? 1e3 : 0,
                          eventHandlers: {
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
                              handlePointDrag(idx, position.lat, position.lng);
                            },
                            dragend: (e) => {
                              const marker = e.target;
                              const position = marker.getLatLng();
                              handlePointDrag(idx, position.lat, position.lng);
                            }
                          },
                          children: [
                            /* @__PURE__ */ jsx(Tooltip, { direction: "right", offset: [6, 0], opacity: 1, permanent: points.length < (window.innerWidth < 768 ? 10 : 20), children: /* @__PURE__ */ jsx("div", { className: "flex flex-col text-[var(--color-fg)]", children: /* @__PURE__ */ jsxs("span", { className: "font-bold text-[12px]", children: [
                              "P_",
                              String(idx + 1).padStart(2, "0")
                            ] }) }) }),
                            /* @__PURE__ */ jsx(Popup, { offset: [0, -5], minWidth: 180, children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 p-2 min-w-[160px] text-[var(--color-fg)]", children: [
                              /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-[var(--color-fg)]/10 pb-2 mb-1", children: [
                                /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-bold uppercase tracking-widest opacity-50", children: [
                                  t(lang, "pointLabel"),
                                  " #",
                                  idx + 1
                                ] }),
                                /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full shadow-sm", style: { backgroundColor: p.color || DEFAULT_POINT_COLOR } })
                              ] }),
                              /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-2", children: [
                                /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1", children: [
                                  /* @__PURE__ */ jsx("label", { className: "text-[9px] uppercase opacity-40 font-bold", children: t(lang, "latitude") }),
                                  /* @__PURE__ */ jsx(
                                    "input",
                                    {
                                      type: "text",
                                      inputMode: "decimal",
                                      value: p.lat,
                                      onChange: (e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val)) handlePointDrag(idx, val, p.lng);
                                      },
                                      className: `bg-[var(--color-bg)] border px-2 py-1 font-mono text-[11px] focus:outline-none rounded w-full text-[var(--color-fg)] transition-colors ${isNaN(p.lat) || p.lat < -90 || p.lat > 90 ? "border-red-500 text-red-500" : "border-[var(--color-fg)]/10 focus:border-[var(--color-fg)]/40"}`
                                    }
                                  )
                                ] }),
                                /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1", children: [
                                  /* @__PURE__ */ jsx("label", { className: "text-[9px] uppercase opacity-40 font-bold", children: t(lang, "longitude") }),
                                  /* @__PURE__ */ jsx(
                                    "input",
                                    {
                                      type: "text",
                                      inputMode: "decimal",
                                      value: p.lng,
                                      onChange: (e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val)) handlePointDrag(idx, p.lat, val);
                                      },
                                      className: `bg-[var(--color-bg)] border px-2 py-1 font-mono text-[11px] focus:outline-none rounded w-full text-[var(--color-fg)] transition-colors ${isNaN(p.lng) || p.lng < -180 || p.lng > 180 ? "border-red-500 text-red-500" : "border-[var(--color-fg)]/10 focus:border-[var(--color-fg)]/40"}`
                                    }
                                  )
                                ] })
                              ] }),
                              /* @__PURE__ */ jsx("div", { className: "flex gap-2 pt-1", children: /* @__PURE__ */ jsxs(
                                "button",
                                {
                                  onClick: (e) => {
                                    removePointAt(idx);
                                  },
                                  className: "flex-1 bg-red-600/10 text-red-600 hover:bg-red-600 hover:text-white px-2 py-1.5 text-[10px] font-bold uppercase tracking-tighter flex items-center justify-center gap-2 transition-all rounded shadow-sm",
                                  children: [
                                    /* @__PURE__ */ jsx(Trash2, { size: 12 }),
                                    " ",
                                    t(lang, "delete")
                                  ]
                                }
                              ) })
                            ] }) })
                          ]
                        },
                        `point-${idx}`
                      );
                    })
                  ] }) }) })
                ] }),
                /* @__PURE__ */ jsx(MapClickHandler, { disabled: isFreehand || isEditMode || isMeasuring, autoDetectActive: isAutoDetect }),
                /* @__PURE__ */ jsx(
                  FreehandHandler,
                  {
                    active: isFreehand,
                    isDrawing,
                    setIsDrawing,
                    setPoints
                  }
                ),
                /* @__PURE__ */ jsx(SurveyGrid, { active: showGrid }),
                /* @__PURE__ */ jsx(
                  MeasureHandler,
                  {
                    active: isMeasuring,
                    measurePoints,
                    setMeasurePoints,
                    t,
                    lang
                  }
                )
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("aside", { className: `${mobileTab === "stats" ? "flex" : "hidden md:flex"} w-full md:w-[320px] lg:w-[380px] p-5 lg:p-8 bg-[var(--color-surface)] border-l border-[var(--color-fg)]/10 flex flex-col z-[1000] shrink-0 h-full overflow-y-auto`, children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-10", children: [
          /* @__PURE__ */ jsxs("h2", { className: "text-[12px] uppercase tracking-widest opacity-50 font-bold", children: [
            "02 // ",
            t(lang, "metricsHover")
          ] }),
          /* @__PURE__ */ jsx(AnimatePresence, { children: autoSaveStatus !== "idle" && /* @__PURE__ */ jsx(
            motion.div,
            {
              initial: { opacity: 0, x: 10 },
              animate: { opacity: 1, x: 0 },
              exit: { opacity: 0 },
              className: "flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-tighter opacity-40",
              children: autoSaveStatus === "saving" ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(motion.div, { animate: { rotate: 360 }, transition: { repeat: Infinity, duration: 1, ease: "linear" }, children: /* @__PURE__ */ jsx(Settings, { size: 10 }) }),
                " ",
                t(lang, "autoSaving")
              ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Check, { size: 10, className: "text-green-500" }),
                " ",
                t(lang, "autoSaved")
              ] })
            }
          ) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mb-12", children: [
          /* @__PURE__ */ jsxs("label", { className: "text-[12px] uppercase opacity-40 flex items-center justify-between mb-1 font-bold", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center", children: [
              "Total ",
              t(lang, "area"),
              /* @__PURE__ */ jsx(MetricTooltip, { content: t(lang, "areaTooltip") })
            ] }),
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: () => setAreaUnit((prev) => prev === "sqm" ? "are" : prev === "are" ? "ha" : "sqm"),
                className: "text-[9px] uppercase tracking-tighter opacity-40 hover:opacity-100 hover:text-[var(--color-fg)] transition-all font-bold flex items-center gap-1",
                title: t(lang, "toggleUnits"),
                children: [
                  /* @__PURE__ */ jsx(Layers, { size: 10 }),
                  " ",
                  t(lang, "toggleUnits")
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-baseline gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "text-6xl lg:text-7xl font-serif font-light leading-none tracking-tighter", children: areaUnit === "are" ? stats.areaAre.toLocaleString("id-ID", { maximumFractionDigits: arePrecision, minimumFractionDigits: arePrecision }) : areaUnit === "ha" ? stats.areaHectares.toLocaleString("id-ID", { maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision }) : stats.areaSqMeters.toLocaleString("id-ID", { maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision }) }),
            /* @__PURE__ */ jsx("span", { className: "text-[22px] font-serif italic", children: areaUnit === "are" ? "are" : areaUnit === "ha" ? "ha" : "m\xB2" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "mt-2 font-mono text-[15px] opacity-60", children: areaUnit === "are" ? /* @__PURE__ */ jsxs(Fragment, { children: [
            stats.areaSqMeters.toLocaleString("id-ID", { maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision }),
            " m\xB2 (",
            stats.areaHectares.toFixed(areaPrecision),
            " ha)"
          ] }) : areaUnit === "ha" ? /* @__PURE__ */ jsxs(Fragment, { children: [
            stats.areaSqMeters.toLocaleString("id-ID", { maximumFractionDigits: areaPrecision, minimumFractionDigits: areaPrecision }),
            " m\xB2 (",
            stats.areaAre.toFixed(arePrecision),
            " are)"
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            stats.areaAre.toFixed(arePrecision),
            " are (",
            stats.areaHectares.toFixed(areaPrecision),
            " ha)"
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-8 border-t border-[var(--color-fg)]/10 pt-4", children: [
          /* @__PURE__ */ jsxs("label", { className: "text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold justify-between", children: [
            /* @__PURE__ */ jsx("span", { children: "Estimated Land Value" }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxs("span", { className: "opacity-60 text-[10px] lowercase", children: [
                "Rp / ",
                areaUnit
              ] }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  value: pricePerUnit || "",
                  onChange: (e) => setPricePerUnit(Number(e.target.value)),
                  className: "w-24 px-1 py-0.5 text-right bg-transparent border-b border-[var(--color-fg)]/20 focus:outline-none focus:border-[var(--color-fg)] text-[12px] font-mono text-[var(--color-fg)]",
                  placeholder: "0"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "text-[28px] font-serif tracking-tight text-[var(--color-accent)]", children: pricePerUnit > 0 ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(pricePerUnit * (areaUnit === "are" ? stats.areaAre : areaUnit === "ha" ? stats.areaHectares : stats.areaSqMeters)) : /* @__PURE__ */ jsx("span", { className: "opacity-30", children: "Rp 0,00" }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-8 mt-6", children: [
          /* @__PURE__ */ jsxs("div", { className: "border-t border-[var(--color-fg)]/10 pt-4 text-[var(--color-fg)]", children: [
            /* @__PURE__ */ jsxs("label", { className: "text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold", children: [
              t(lang, "estLength"),
              " \xD7 ",
              t(lang, "estWidth"),
              " (MBR)",
              /* @__PURE__ */ jsx(MetricTooltip, { content: t(lang, "mbrTooltip") })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "text-[20px] font-serif", children: [
              stats.length > 0 ? stats.length.toLocaleString("id-ID", { maximumFractionDigits: 2 }) : "0.00",
              " ",
              /* @__PURE__ */ jsx("span", { className: "text-[15px] italic opacity-60", children: "m" }),
              /* @__PURE__ */ jsx("span", { className: "mx-2 opacity-20 font-sans", children: "\xD7" }),
              stats.width > 0 ? stats.width.toLocaleString("id-ID", { maximumFractionDigits: 2 }) : "0.00",
              " ",
              /* @__PURE__ */ jsx("span", { className: "text-[15px] italic opacity-60", children: "m" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "border-t border-[var(--color-fg)]/10 pt-4 text-[var(--color-fg)]", children: [
            /* @__PURE__ */ jsxs("label", { className: "text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold", children: [
              "Total ",
              t(lang, "perimeter"),
              /* @__PURE__ */ jsx(MetricTooltip, { content: t(lang, "perimeterTooltip") })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "text-[20px] font-serif", children: [
              stats.perimeter > 0 ? stats.perimeter.toLocaleString("id-ID", { maximumFractionDigits: 2 }) : "0.00",
              " ",
              /* @__PURE__ */ jsx("span", { className: "text-[15px] italic opacity-60", children: "m" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "border-t border-[var(--color-fg)]/10 pt-4 text-[var(--color-fg)]", children: [
            /* @__PURE__ */ jsxs("label", { className: "text-[12px] uppercase opacity-40 flex items-center mb-2 font-bold", children: [
              "Auto Kavling (BETA)",
              /* @__PURE__ */ jsx(MetricTooltip, { content: "Automatically subdivide area with a road" })
            ] }),
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: () => setActiveModal("kavling"),
                disabled: points.length < 3,
                className: "w-full mt-1 py-3 bg-[var(--color-fg)]/5 hover:bg-[var(--color-fg)]/10 border border-[var(--color-fg)]/20 text-[12px] uppercase tracking-widest font-bold transition-all text-[var(--color-fg)] disabled:opacity-30 flex items-center justify-center gap-2",
                children: [
                  /* @__PURE__ */ jsx(MapPin, { size: 14 }),
                  " Setup Subdivision"
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-auto pt-8 space-y-4", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setActiveModal("export"),
              disabled: points.length === 0,
              className: "w-full py-4 bg-[var(--color-fg)] text-[var(--color-bg)] text-[12px] uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg",
              children: [
                /* @__PURE__ */ jsx(Download, { size: 16 }),
                " ",
                t(lang, "exportData")
              ]
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "p-4 bg-[var(--color-bg)] border-l-2 border-[var(--color-fg)] flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("span", { className: "text-[12px] uppercase tracking-wider font-bold", children: "Project Status" }),
            points.length < 3 ? /* @__PURE__ */ jsx("span", { className: "text-[12px] uppercase px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-bold", children: "Draft" }) : /* @__PURE__ */ jsx("span", { className: "text-[12px] uppercase px-2 py-1 bg-[var(--color-fg)]/10 text-[var(--color-fg)] rounded font-bold", children: "Verified" })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "md:hidden fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-fg)]/10 z-[3000] flex justify-around items-center px-2 py-3 shadow-[0_-5px_25px_rgba(0,0,0,0.1)]", children: ["map", "points", "stats"].map((tab) => /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: () => setMobileTab(tab),
        className: `flex flex-col items-center gap-1.5 min-w-[80px] transition-all relative ${mobileTab === tab ? "text-[var(--color-fg)]" : "text-[var(--color-fg)]/40"}`,
        children: [
          /* @__PURE__ */ jsxs("div", { className: `p-2 rounded-xl transition-all duration-300 ${mobileTab === tab ? "bg-[var(--color-fg)] text-[var(--color-bg)] scale-110 shadow-lg" : "hover:bg-[var(--color-fg)]/5"}`, children: [
            tab === "map" && /* @__PURE__ */ jsx(Layout, { size: 22 }),
            tab === "points" && /* @__PURE__ */ jsx(MapPin, { size: 22 }),
            tab === "stats" && /* @__PURE__ */ jsx(BarChart2, { size: 22 })
          ] }),
          /* @__PURE__ */ jsx("span", { className: `text-[10px] font-bold uppercase tracking-wider transition-opacity duration-300 ${mobileTab === tab ? "opacity-100" : "opacity-60"}`, children: t(lang, `${tab}Tab`) }),
          mobileTab === tab && /* @__PURE__ */ jsx(
            motion.div,
            {
              layoutId: "activeTabIndicator",
              className: "absolute -bottom-1.5 w-1 h-1 rounded-full bg-[var(--color-fg)]"
            }
          )
        ]
      },
      tab
    )) })
  ] });
}
