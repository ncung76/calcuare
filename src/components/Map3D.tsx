import React, { useState, useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Line, Text, Html } from '@react-three/drei';
import * as turf from '@turf/turf';
import * as THREE from 'three';
import { 
  Sun, 
  Moon, 
  Compass, 
  Layers, 
  Trees, 
  Mountain, 
  Home, 
  Info,
  Sliders,
  Sparkles,
  Eye,
  X
} from 'lucide-react';

// === Helper for Procedural Terrain Elevation ===
export interface DEMData {
  imgData: Uint8ClampedArray;
  satData: Uint8ClampedArray | null;
  lngLeft: number;
  lngRight: number;
  latTop: number;
  latBottom: number;
  centerLng: number;
  centerLat: number;
  baseElevation: number;
}

export const getTerrainHeight = (x: number, z: number, slope: number, noise: number, direction: number, demData?: DEMData | null) => {
    if (demData) {
        const lng = demData.centerLng + x / 111320;
        const lat = demData.centerLat + z / -111320;
        
        const u = (lng - demData.lngLeft) / (demData.lngRight - demData.lngLeft);
        const v = (demData.latTop - lat) / (demData.latTop - demData.latBottom);
        
        const px = Math.floor(u * 255);
        const py = Math.floor(v * 255);
        
        if (px >= 0 && px <= 255 && py >= 0 && py <= 255) {
            const idx = (py * 256 + px) * 4;
            const R = demData.imgData[idx];
            const G = demData.imgData[idx + 1];
            const B = demData.imgData[idx + 2];
            const elevation = (R * 256 + G + B / 256) - 32768;
            return elevation - demData.baseElevation;
        }
        return 0;
    }

    // Slope contribution based on angle/direction (0: SW-NE, 1: W-E, 2: S-N, 3: NW-SE)
    let slopeContribution = 0;
    if (direction === 0) {
        slopeContribution = (x + z) * 0.04;
    } else if (direction === 1) {
        slopeContribution = x * 0.05;
    } else if (direction === 2) {
        slopeContribution = z * 0.05;
    } else {
        slopeContribution = (x - z) * 0.04;
    }
    
    // Low-frequency hills + high-frequency details
    const hill1 = Math.sin(x * 0.03) * Math.cos(z * 0.03) * 4.0;
    const hill2 = Math.sin(x * 0.01) * Math.sin(z * 0.01) * 6.0;
    const microDetail = Math.cos(x * 0.08) * Math.sin(z * 0.08) * 0.5;
    
    return (slopeContribution * slope) + ((hill1 + hill2 + microDetail) * noise);
};

// === Tree Component ===
const Tree = ({ position }: { position: [number, number, number] }) => {
    return (
        <group position={position}>
            {/* Trunk */}
            <mesh position={[0, 0.75, 0]} castShadow>
                <cylinderGeometry args={[0.1, 0.2, 1.5, 6]} />
                <meshStandardMaterial color="#78350f" roughness={0.9} />
            </mesh>
            {/* Foliage */}
            <mesh position={[0, 2, 0]} castShadow>
                <sphereGeometry args={[0.7, 6, 6]} />
                <meshStandardMaterial color="#15803d" roughness={0.7} flatShading />
            </mesh>
        </group>
    );
};

// === Building Component with Extrusion, pitched roofs and custom styles ===
const Building = ({ 
    coordinates, 
    height, 
    color, 
    isTusukSate, 
    buildingStyle, 
    roofType, 
    terrainSlope, 
    terrainNoise, 
    slopeDirection,
    demData
}: { 
    coordinates: [number, number, number][], 
    height: number, 
    color: string, 
    isTusukSate: boolean,
    buildingStyle: string,
    roofType: string,
    terrainSlope: number,
    terrainNoise: number,
    slopeDirection: number,
    demData?: DEMData | null
}) => {
    if (!coordinates || coordinates.length < 3) return null;

    const xs = coordinates.map(c => c[0]);
    const zs = coordinates.map(c => c[2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    // Snapped ground elevation at building center
    const groundY = getTerrainHeight(centerX, centerZ, terrainSlope, terrainNoise, slopeDirection, demData);
    
    // Build 2D shape for ExtrudeGeometry
    const shape = useMemo(() => {
        const s = new THREE.Shape();
        if (coordinates.length === 0) return s;
        
        // Apply local setback scale (shrink toward centroid)
        const scale = 0.85; 
        const localCoords = coordinates.map(c => [
            (c[0] - centerX) * scale,
            -(c[2] - centerZ) * scale // Map horizontal Z to 2D Y
        ]);
        
        s.moveTo(localCoords[0][0], localCoords[0][1]);
        for (let i = 1; i < localCoords.length; i++) {
            s.lineTo(localCoords[i][0], localCoords[i][1]);
        }
        s.closePath();
        return s;
    }, [coordinates, centerX, centerZ]);

    const extrudeSettings = useMemo(() => ({
        steps: 1,
        depth: height,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.04,
        bevelSegments: 2
    }), [height]);

    // Material Styling
    let wallColor = color;
    let roofColor = '#b91c1c'; // default rich red roof
    let metalness = 0.1;
    let roughness = 0.6;
    let opacity = 1.0;
    let transparent = false;
    
    if (buildingStyle === 'glass') {
        wallColor = '#0ea5e9';
        metalness = 0.95;
        roughness = 0.05;
        opacity = 0.8;
        transparent = true;
    } else if (buildingStyle === 'wood') {
        wallColor = '#b45309'; // Teak
        roofColor = '#3f1a04'; // dark brown roof
        roughness = 0.85;
    } else if (buildingStyle === 'cyber') {
        wallColor = '#1e1b4b'; // deep neon violet
        metalness = 0.8;
        roughness = 0.1;
        opacity = 0.7;
        transparent = true;
    }

    if (isTusukSate) {
        wallColor = '#ef4444'; // Red alarm for tusuk sate
    }

    return (
        <group position={[centerX, groundY, centerZ]}>
            {/* Building Wall Mesh */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
                <extrudeGeometry args={[shape, extrudeSettings]} />
                <meshStandardMaterial 
                    color={wallColor} 
                    metalness={metalness}
                    roughness={roughness}
                    opacity={opacity}
                    transparent={transparent}
                    flatShading
                />
            </mesh>
            
            {/* Gabled/Pitched Roof */}
            {roofType === 'pitched' && buildingStyle !== 'cyber' && (
                <mesh position={[0, height + 0.1, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                    <coneGeometry args={[Math.max(1.8, (maxX - minX) * 0.45), 1.8, 4]} />
                    <meshStandardMaterial color={roofColor} roughness={0.7} flatShading />
                </mesh>
            )}

            {/* Glowing neon wireframe for Cyberpunk style */}
            {buildingStyle === 'cyber' && (
                <lineSegments position={[0, height / 2, 0]}>
                    <boxGeometry args={[Math.max(1, maxX - minX - 0.2), height, Math.max(1, maxZ - minZ - 0.2)]} />
                    <lineBasicMaterial color={isTusukSate ? '#ef4444' : '#06b6d4'} />
                </lineSegments>
            )}
        </group>
    );
};

// === Road Component ===
const Road = ({ 
    coordinates, 
    terrainSlope, 
    terrainNoise, 
    slopeDirection,
    colorOption,
    demData
}: { 
    coordinates: [number, number, number][], 
    terrainSlope: number, 
    terrainNoise: number, 
    slopeDirection: number,
    colorOption: string,
    demData?: DEMData | null
}) => {
    if (!coordinates || coordinates.length < 3) return null;

    const xs = coordinates.map(c => c[0]);
    const zs = coordinates.map(c => c[2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    // Snapped ground elevation with a tiny lift to prevent z-fighting
    const groundY = getTerrainHeight(centerX, centerZ, terrainSlope, terrainNoise, slopeDirection, demData) + 0.03;

    const shape = useMemo(() => {
        const s = new THREE.Shape();
        if (coordinates.length === 0) return s;
        
        const localCoords = coordinates.map(c => [
            c[0] - centerX,
            -(c[2] - centerZ)
        ]);
        
        s.moveTo(localCoords[0][0], localCoords[0][1]);
        for (let i = 1; i < localCoords.length; i++) {
            s.lineTo(localCoords[i][0], localCoords[i][1]);
        }
        s.closePath();
        return s;
    }, [coordinates, centerX, centerZ]);

    // Colors matching standard palette
    const colors: Record<string, string> = {
        gray: '#475569',
        yellow: '#eab308',
        orange: '#f97316',
        red: '#ef4444',
        green: '#10b981',
        blue: '#3b82f6'
    };
    const roadColor = colors[colorOption] || '#475569';

    return (
        <group position={[centerX, groundY, centerZ]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <shapeGeometry args={[shape]} />
                <meshStandardMaterial 
                    color={roadColor} 
                    roughness={0.9} 
                    metalness={0.1}
                />
            </mesh>
        </group>
    );
};

// === Dynamic Topographic Terrain Mesh ===
const TerrainMesh = ({ 
    width, 
    depth, 
    slope, 
    noise, 
    direction, 
    preset,
    demData
}: { 
    width: number, 
    depth: number, 
    slope: number, 
    noise: number, 
    direction: number, 
    preset: string,
    demData?: DEMData | null
}) => {
    const segments = 45;
    
    const terrainGeo = useMemo(() => {
        const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
        geo.rotateX(-Math.PI / 2);
        
        const pos = geo.attributes.position;
        const colors: number[] = [];
        
        // Find min/max height in this grid first to normalize colors
        let minH = Infinity;
        let maxH = -Infinity;
        const tempHeights = [];
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const y = getTerrainHeight(x, z, slope, noise, direction, demData);
            tempHeights.push(y);
            if (y < minH) minH = y;
            if (y > maxH) maxH = y;
        }

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const y = tempHeights[i];
            pos.setY(i, y);
            
            // Generate Topographic / Relief Coloring
            const normH = (y - minH) / (maxH - minH || 1);
            const color = new THREE.Color();
            
            let mappedSatColor = false;
            if (demData?.satData && preset === 'satellite') {
                const lng = demData.centerLng + x / 111320;
                const lat = demData.centerLat + z / -111320;
                const u = (lng - demData.lngLeft) / (demData.lngRight - demData.lngLeft);
                const v = (demData.latTop - lat) / (demData.latTop - demData.latBottom);
                const px = Math.floor(u * 255);
                const py = Math.floor(v * 255);
                if (px >= 0 && px <= 255 && py >= 0 && py <= 255) {
                    const idx = (py * 256 + px) * 4;
                    color.setRGB(
                        demData.satData[idx] / 255, 
                        demData.satData[idx + 1] / 255, 
                        demData.satData[idx + 2] / 255
                    );
                    mappedSatColor = true;
                }
            }

            if (!mappedSatColor) {
                if (preset === 'cyberpunk') {
                    // Sleek futuristic grid ground
                    color.set('#0f172a');
                } else if (preset === 'topographic') {
                    // Altitude bands (topography map style)
                    const band = Math.floor(normH * 8) / 8;
                    if (band < 0.15) color.set('#2563eb'); // valleys (water/blue)
                    else if (band < 0.35) color.set('#16a34a'); // lowlands (green)
                    else if (band < 0.55) color.set('#84cc16'); // fields (light green)
                    else if (band < 0.7) color.set('#eab308'); // low hills (yellow)
                    else if (band < 0.85) color.set('#ea580c'); // ridges (orange)
                    else color.set('#dc2626'); // peak peaks (red)
                } else {
                    // Satellite realistic look
                    if (normH < 0.25) {
                        // Grass valleys
                        color.set('#15803d').lerp(new THREE.Color('#16a34a'), normH / 0.25);
                    } else if (normH < 0.6) {
                        // Lush fields to earth brown
                        color.set('#16a34a').lerp(new THREE.Color('#854d0e'), (normH - 0.25) / 0.35);
                    } else {
                        // Mountain/rocky peaks
                        color.set('#854d0e').lerp(new THREE.Color('#f1f5f9'), (normH - 0.6) / 0.4);
                    }
                }
            }
            colors.push(color.r, color.g, color.b);
        }
        
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        return geo;
    }, [width, depth, slope, noise, direction, preset]);

    return (
        <mesh geometry={terrainGeo} receiveShadow castShadow>
            <meshStandardMaterial 
                vertexColors 
                roughness={0.8} 
                metalness={0.1}
                flatShading={preset !== 'satellite'}
            />
        </mesh>
    );
};

// === MAIN MAP3D COMPONENT ===
export const Map3D = ({ 
  points, 
  kavlings, 
  savedProjects = [], 
  currentProjectId 
}: { 
  points: { lat: number, lng: number }[], 
  kavlings: any[], 
  savedProjects?: any[], 
  currentProjectId?: string | number | null 
}) => {
  // Use active project points if available, otherwise find the first saved project with points
  const activePoints = (points && points.length > 0)
    ? points
    : (savedProjects.find(p => p.points && p.points.length > 0)?.points || []);

  const activeKavlings = (points && points.length > 0)
    ? kavlings
    : (savedProjects.find(p => p.points && p.points.length > 0)?.kavlings || []);

  // --- UI Interactive States ---
  const [visualPreset, setVisualPreset] = useState<'satellite' | 'topographic' | 'cyberpunk'>('satellite');
  const [terrainSlope, setTerrainSlope] = useState<number>(3.0);
  const [terrainNoise, setTerrainNoise] = useState<number>(1.5);
  const [slopeDirection, setSlopeDirection] = useState<number>(0); // 0 to 3
  const [buildingStyle, setBuildingStyle] = useState<'glass' | 'wood' | 'cyber'>('glass');
  const [buildingHeight, setBuildingHeight] = useState<number>(4.5);
  const [roofType, setRoofType] = useState<'pitched' | 'flat'>('pitched');
  const [showContours, setShowContours] = useState<boolean>(true);
  const [showTrees, setShowTrees] = useState<boolean>(true);
  const [timeOfDay, setTimeOfDay] = useState<'sunrise' | 'noon' | 'sunset' | 'night'>('noon');
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState<boolean>(false);

  if (!activePoints || activePoints.length === 0) {
      return (
          <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-white p-6 rounded-2xl border border-slate-800">
              <Mountain className="w-12 h-12 text-slate-500 animate-pulse mb-3" />
              <div className="font-display font-bold uppercase tracking-wider text-sm text-slate-400">Belum Ada Titik Bidang</div>
              <p className="text-[11px] opacity-60 text-center max-w-[240px] mt-1">Silakan input beberapa titik di peta atau buka project library terlebih dahulu.</p>
          </div>
      );
  }

  // --- Coordinate Projection Helper ---
  const centerLat = activePoints.reduce((s, p) => s + p.lat, 0) / activePoints.length;
  const centerLng = activePoints.reduce((s, p) => s + p.lng, 0) / activePoints.length;
  
  const minLng = Math.min(...activePoints.map(p => p.lng));
  const maxLng = Math.max(...activePoints.map(p => p.lng));
  const minLat = Math.min(...activePoints.map(p => p.lat));
  const maxLat = Math.max(...activePoints.map(p => p.lat));

  // Width & Depth bounds of the active site in meters
  const widthX = (maxLng - minLng) * 111320;
  const depthZ = (maxLat - minLat) * 111320;

  // Let terrain plane be 3.5x larger to create realistic background scenery
  const terrainWidth = Math.max(120, widthX * 3.5);
  const terrainDepth = Math.max(120, depthZ * 3.5);

  const [useRealDEM, setUseRealDEM] = useState(false);
  const [demData, setDemData] = useState<DEMData | null>(null);
  const [isLoadingDEM, setIsLoadingDEM] = useState(false);

  React.useEffect(() => {
      if (!useRealDEM) {
          setDemData(null);
          return;
      }
      setIsLoadingDEM(true);
      const zoom = 14;
      const xTile = Math.floor((centerLng + 180) / 360 * Math.pow(2, zoom));
      const yTile = Math.floor((1 - Math.log(Math.tan(centerLat * Math.PI / 180) + 1 / Math.cos(centerLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
      
      const demUrl = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${xTile}/${yTile}.png`;
      const satUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${yTile}/${xTile}`;

      const loadImage = (url: string): Promise<HTMLImageElement> => {
          return new Promise((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = 'Anonymous';
              img.src = url;
              img.onload = () => resolve(img);
              img.onerror = reject;
          });
      };

      Promise.all([loadImage(demUrl), loadImage(satUrl).catch(() => null)])
          .then(([demImg, satImg]) => {
              const canvas = document.createElement('canvas');
              canvas.width = 256;
              canvas.height = 256;
              const ctx = canvas.getContext('2d');
              if (!ctx) return;
              
              ctx.drawImage(demImg, 0, 0);
              const imgData = ctx.getImageData(0, 0, 256, 256).data;
              
              let satData: Uint8ClampedArray | null = null;
              if (satImg) {
                  ctx.clearRect(0, 0, 256, 256);
                  ctx.drawImage(satImg, 0, 0);
                  satData = ctx.getImageData(0, 0, 256, 256).data;
              }
              
              const lngLeft = xTile / Math.pow(2, zoom) * 360 - 180;
              const lngRight = (xTile + 1) / Math.pow(2, zoom) * 360 - 180;
              const latTop = Math.atan(Math.sinh(Math.PI * (1 - 2 * yTile / Math.pow(2, zoom)))) * 180 / Math.PI;
              const latBottom = Math.atan(Math.sinh(Math.PI * (1 - 2 * (yTile + 1) / Math.pow(2, zoom)))) * 180 / Math.PI;
              
              const u = (centerLng - lngLeft) / (lngRight - lngLeft);
              const v = (latTop - centerLat) / (latTop - latBottom);
              const px = Math.floor(u * 255);
              const py = Math.floor(v * 255);
              let baseElevation = 0;
              if (px >= 0 && px <= 255 && py >= 0 && py <= 255) {
                  const idx = (py * 256 + px) * 4;
                  baseElevation = (imgData[idx] * 256 + imgData[idx + 1] + imgData[idx + 2] / 256) - 32768;
              }

              setDemData({ imgData, satData, lngLeft, lngRight, latTop, latBottom, centerLng, centerLat, baseElevation });
              setIsLoadingDEM(false);
          })
          .catch(err => {
              console.error("Failed to load DEM tile", err);
              setIsLoadingDEM(false);
              setUseRealDEM(false);
          });
  }, [useRealDEM, centerLat, centerLng]);

  // Projection logic
  const projectPoint = (lng: number, lat: number): [number, number] => {
      const x = (lng - centerLng) * 111320;
      const z = (lat - centerLat) * -111320;
      return [x, z];
  };

  const processedPoints = activePoints.map(p => {
      const [x, z] = projectPoint(p.lng, p.lat);
      return [x, 0.2, z] as [number, number, number];
  });

  const linePoints = [...processedPoints, processedPoints[0]];

  // --- Subdivisions Processing ---
  const subdivisions = useMemo(() => {
      return activeKavlings.map(k => {
          if (!k) return null;
          const poly = k.setbackPolygon || k.polygon;
          if (!poly || !poly.geometry || !poly.geometry.coordinates || !Array.isArray(poly.geometry.coordinates) || poly.geometry.coordinates.length === 0) return null;
          
          let rawCoords: any[] = [];
          if (poly.geometry.type === 'MultiPolygon') {
              const multi = poly.geometry.coordinates[0];
              if (multi && Array.isArray(multi) && multi.length > 0) {
                  rawCoords = multi[0] || [];
              }
          } else {
              rawCoords = poly.geometry.coordinates[0] || [];
          }

          if (!Array.isArray(rawCoords) || rawCoords.length === 0) return null;

          // Project coordinates to meters
          const coords3d = rawCoords.map((c: any) => {
              if (!c || c.length < 2) return [0, 0.5, 0] as [number, number, number];
              const [x, z] = projectPoint(c[0], c[1]);
              return [x, 0.5, z] as [number, number, number];
          });

          // Fallback center calculations
          let centerMeters: [number, number] = [0, 0];
          if (k.center && Array.isArray(k.center) && k.center.length >= 2) {
              centerMeters = projectPoint(k.center[0], k.center[1]);
          } else if (coords3d.length > 0) {
              const sumX = coords3d.reduce((sum, pt) => sum + pt[0], 0);
              const sumZ = coords3d.reduce((sum, pt) => sum + pt[2], 0);
              centerMeters = [sumX / coords3d.length, sumZ / coords3d.length];
          }

          return {
              id: k.id,
              label: k.label || `L${k.id}`,
              type: k.type || 'lot',
              area: k.area || 0,
              center: centerMeters,
              coordinates: coords3d,
              isTusukSate: k.isTusukSate || false,
              color: k.type === 'road' ? '#94a3b8' : (k.type === 'remnant' ? '#d97706' : '#22c55e')
          };
      }).filter(Boolean);
  }, [activeKavlings, centerLng, centerLat]);

  // --- Side Dimensions & Metrics ---
  const sideLabels = useMemo(() => {
      if (activePoints.length < 2) return [];
      return activePoints.map((p1, i) => {
          const p2 = activePoints[(i + 1) % activePoints.length];
          const pp1 = processedPoints[i];
          const pp2 = processedPoints[(i + 1) % processedPoints.length];
          
          const midpoint: [number, number, number] = [
              (pp1[0] + pp2[0]) / 2,
              getTerrainHeight((pp1[0] + pp2[0]) / 2, (pp1[2] + pp2[2]) / 2, terrainSlope, terrainNoise, slopeDirection, demData) + 1.2,
              (pp1[2] + pp2[2]) / 2
          ];
          
          const dist = turf.distance([p1.lng, p1.lat], [p2.lng, p2.lat], { units: 'meters' });
          return { midpoint, text: `${dist.toFixed(1)}m` };
      });
  }, [activePoints, processedPoints, terrainSlope, terrainNoise, slopeDirection]);

  // --- Procedural Trees Generator ---
  const treePositions = useMemo(() => {
      const positions: [number, number, number][] = [];
      // Scatter trees along parcel boundaries and around vacant remnants
      activePoints.forEach((p, i) => {
          const [bx, bz] = projectPoint(p.lng, p.lat);
          // Add some randomness
          const tx = bx + (Math.random() - 0.5) * 8;
          const tz = bz + (Math.random() - 0.5) * 8;
          const ty = getTerrainHeight(tx, tz, terrainSlope, terrainNoise, slopeDirection, demData);
          positions.push([tx, ty, tz]);
      });

      // Scatter some trees inside remnants / green zones
      subdivisions.forEach(s => {
          if (s && s.type === 'remnant') {
              const tx = s.center[0] + (Math.random() - 0.5) * 5;
              const tz = s.center[1] + (Math.random() - 0.5) * 5;
              const ty = getTerrainHeight(tx, tz, terrainSlope, terrainNoise, slopeDirection, demData);
              positions.push([tx, ty, tz]);
          }
      });
      return positions;
  }, [activePoints, subdivisions, terrainSlope, terrainNoise, slopeDirection]);

  // --- Sun Lighting & Color Environment ---
  const sunConfig = useMemo(() => {
      switch (timeOfDay) {
          case 'sunrise':
              return {
                  position: [-40, 10, -10] as [number, number, number],
                  color: '#f97316',
                  intensity: 1.1,
                  ambient: '#451a03',
                  skyColor: '#fdba74'
              };
          case 'sunset':
              return {
                  position: [40, 8, 30] as [number, number, number],
                  color: '#ea580c',
                  intensity: 1.0,
                  ambient: '#2e1065',
                  skyColor: '#f472b6'
              };
          case 'night':
              return {
                  position: [0, 50, 0] as [number, number, number],
                  color: '#38bdf8',
                  intensity: 0.15,
                  ambient: '#090d16',
                  skyColor: '#020617'
              };
          case 'noon':
          default:
              return {
                  position: [10, 50, 20] as [number, number, number],
                  color: '#ffffff',
                  intensity: 1.3,
                  ambient: '#1e293b',
                  skyColor: '#93c5fd'
              };
      }
  }, [timeOfDay]);

  // --- Topographic Analytics ---
  const totalArea = subdivisions.filter(s => s?.type === 'lot').reduce((sum, s) => sum + (s?.area || 0), 0);
  const greenSpaceRatio = (subdivisions.filter(s => s?.type === 'remnant').length / (subdivisions.length || 1) * 100).toFixed(0);

  return (
    <div className="w-full h-full relative flex flex-col lg:flex-row bg-slate-950 font-sans text-white select-none overflow-hidden rounded-2xl border border-slate-800 shadow-2xl">
      {/* 3D MAP CANVAS STAGE */}
      <div className="flex-1 h-full relative bg-[#090d16]">
        <Canvas camera={{ position: [0, 25, 30], fov: 45 }} shadows>
          <Suspense fallback={
            <Html center>
                <div className="text-white bg-slate-900/80 px-4 py-2 rounded-lg backdrop-blur text-xs font-bold whitespace-nowrap border border-slate-700">
                    Memuat 3D / Shader...
                </div>
            </Html>
          }>
          <ambientLight intensity={timeOfDay === 'night' ? 0.08 : 0.4} color={sunConfig.ambient} />
          <directionalLight 
              position={sunConfig.position} 
              intensity={sunConfig.intensity} 
              color={sunConfig.color}
              castShadow
              shadow-mapSize={[1024, 1024]}
          />
          <Sky 
              sunPosition={sunConfig.position} 
              turbidity={timeOfDay === 'night' ? 20 : 8}
              rayleigh={timeOfDay === 'night' ? 0.1 : 3}
          />
          <OrbitControls makeDefault enablePan={true} enableRotate={true} enableZoom={true} maxPolarAngle={Math.PI / 2.1} />
          
          {/* Topographic Ground Terrain */}
          <TerrainMesh 
              width={terrainWidth} 
              depth={terrainDepth} 
              slope={terrainSlope} 
              noise={terrainNoise} 
              direction={slopeDirection} 
              preset={visualPreset} 
              demData={demData}
          />

          {/* 3D Contour Level Helpers */}
          {showContours && Array.from({ length: 8 }).map((_, i) => {
              const h = -4 + (i * 2.2);
              return (
                  <gridHelper 
                      key={i} 
                      args={[terrainWidth, 20, '#0284c7', '#014f7c']} 
                      position={[0, h, 0]} 
                  />
              );
          })}

          {/* Site Boundary Outline */}
          {activePoints.length > 1 && (
              <Line 
                  points={linePoints.map(p => [p[0], getTerrainHeight(p[0], p[2], terrainSlope, terrainNoise, slopeDirection, demData) + 0.1, p[2]] as [number, number, number])} 
                  color={visualPreset === 'cyberpunk' ? '#06b6d4' : '#eab308'} 
                  lineWidth={3} 
              />
          )}

          {/* Boundary Corner Point Markers */}
          {processedPoints.map((p, i) => {
              const h = getTerrainHeight(p[0], p[2], terrainSlope, terrainNoise, slopeDirection, demData);
              return (
                  <mesh key={`p-${i}`} position={[p[0], h + 0.2, p[2]]}>
                    <sphereGeometry args={[0.4]} />
                    <meshStandardMaterial 
                        color={visualPreset === 'cyberpunk' ? '#22d3ee' : '#ffffff'} 
                        emissive={visualPreset === 'cyberpunk' ? '#0891b2' : '#ca8a04'}
                        roughness={0.2}
                    />
                  </mesh>
              );
          })}

          {/* Subdivided Building & Lots Extrusion */}
          {subdivisions.map((s, i) => {
              if (!s) return null;
              if (s.type === 'road') {
                  return (
                      <Road 
                          key={`road-${i}`}
                          coordinates={s.coordinates}
                          terrainSlope={terrainSlope}
                          terrainNoise={terrainNoise}
                          slopeDirection={slopeDirection}
                          colorOption="gray"
                          demData={demData}
                      />
                  );
              }
              return (
                  <Building 
                      key={`building-${s.id}-${i}`}
                      coordinates={s.coordinates}
                      height={s.type === 'remnant' ? 0.3 : buildingHeight}
                      color={s.isTusukSate ? '#f43f5e' : (s.type === 'remnant' ? '#d97706' : '#a8a29e')}
                      isTusukSate={s.isTusukSate}
                      buildingStyle={visualPreset === 'cyberpunk' ? 'cyber' : buildingStyle}
                      roofType={s.type === 'remnant' ? 'flat' : roofType}
                      terrainSlope={terrainSlope}
                      terrainNoise={terrainNoise}
                      slopeDirection={slopeDirection}
                      demData={demData}
                  />
              );
          })}

          {/* Interactive Text Labels on Building Lot Centers */}
          {subdivisions.map((s, i) => {
              if (!s) return null;
              const h = getTerrainHeight(s.center[0], s.center[1], terrainSlope, terrainNoise, slopeDirection, demData) + 
                        (s.type === 'remnant' ? 0.6 : buildingHeight + 1.2);
              return (
                  <Text
                      key={`lbl-${s.id}-${i}`}
                      position={[s.center[0], h, s.center[1]]}
                      fontSize={1.0}
                      color={s.isTusukSate ? '#ff3b3b' : '#ffffff'}
                      anchorX="center"
                      anchorY="middle"
                      font="https://fonts.gstatic.com/s/jetbrainsmono/v18/tU3ia801DK87R_1D-2fALSTZBY8.woff"
                  >
                      {s.label}
                  </Text>
              );
          })}

          {/* Boundary Dimension Side Labels */}
          {sideLabels.map((sl, i) => (
              <Text
                  key={`side-${i}`}
                  position={sl.midpoint}
                  fontSize={0.8}
                  color="#fbbf24"
                  anchorX="center"
                  anchorY="middle"
                  font="https://fonts.gstatic.com/s/jetbrainsmono/v18/tU3ia801DK87R_1D-2fALSTZBY8.woff"
              >
                  {sl.text}
              </Text>
          ))}

          {/* Vegetation Environments */}
          {showTrees && treePositions.map((p, i) => (
              <Tree key={`tree-${i}`} position={p} />
          ))}

          </Suspense>
        </Canvas>
        
        {/* COMPASS OVERLAY */}
        <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/50 flex items-center gap-2 text-[11px] font-semibold text-slate-300 shadow-lg pointer-events-none">
          <Compass className="w-4 h-4 text-amber-500 animate-[spin_12s_linear_infinite]" />
          <span>UTARA (N)</span>
        </div>

        {/* CONTROLS HELP QUICK DIAL */}
        <div className="absolute bottom-4 left-4 bg-slate-900/85 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/50 text-[10px] text-slate-400 flex flex-col gap-1 shadow-lg pointer-events-none max-w-[200px]">
          <div className="text-white font-bold text-[11px] uppercase tracking-wide flex items-center gap-1 mb-1">
             <Eye className="w-3 h-3 text-sky-400" /> Navigasi 3D
          </div>
          <div>• <span className="text-slate-200">Klik Kiri + Seret</span> : Putar Kamera</div>
          <div>• <span className="text-slate-200">Klik Kanan + Seret</span> : Geser Map</div>
          <div>• <span className="text-slate-200">Scroll</span> : Zoom In/Out</div>
        </div>

        {/* MOBILE SETTINGS TOGGLE BUTTON */}
        <button
          onClick={() => setIsMobileControlsOpen(!isMobileControlsOpen)}
          className="lg:hidden absolute bottom-4 right-4 z-[50] bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700/50 px-3.5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-[11px] font-bold tracking-wider uppercase active:scale-95 transition-all cursor-pointer"
        >
          <Sliders className="w-4 h-4 text-amber-400" />
          <span>{isMobileControlsOpen ? 'Sembunyikan' : 'Menu 3D'}</span>
        </button>
      </div>

      {/* INTERACTIVE DASHBOARD SIDEBAR */}
      <div className={`absolute bottom-0 left-0 right-0 z-[100] bg-slate-900/95 border-t border-slate-800 p-5 flex flex-col gap-5 overflow-y-auto max-h-[70%] rounded-t-2xl shadow-2xl transition-all duration-300 transform ${
        isMobileControlsOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'
      } lg:relative lg:translate-y-0 lg:pointer-events-auto lg:w-[360px] lg:max-h-full lg:rounded-none lg:border-t-0 lg:border-l lg:bg-slate-900 lg:z-10 scrollbar-thin scrollbar-thumb-slate-800`}>
        
        {/* Header Title */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 rounded-lg border border-amber-500/30">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-[13px] font-extrabold tracking-wider uppercase text-white leading-none">INTERACTIVE 3D VIEW</h2>
              <span className="text-[10px] opacity-40 uppercase">Topography & Terrain</span>
            </div>
          </div>
          {/* Mobile Close Button */}
          <button 
            onClick={() => setIsMobileControlsOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* SECTION 1: VISUAL PRESETS */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-sky-400" /> Visual Preset
          </label>
          <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setVisualPreset('satellite')}
              className={`py-2 text-[10px] uppercase tracking-wide font-bold rounded-lg transition-all flex flex-col items-center gap-1 ${
                visualPreset === 'satellite' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Mountain className="w-3.5 h-3.5" />
              Satellite
            </button>
            <button
              onClick={() => setVisualPreset('topographic')}
              className={`py-2 text-[10px] uppercase tracking-wide font-bold rounded-lg transition-all flex flex-col items-center gap-1 ${
                visualPreset === 'topographic' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              Contour
            </button>
            <button
              onClick={() => setVisualPreset('cyberpunk')}
              className={`py-2 text-[10px] uppercase tracking-wide font-bold rounded-lg transition-all flex flex-col items-center gap-1 ${
                visualPreset === 'cyberpunk' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              Cyber
            </button>
          </div>
        </div>

        {/* SECTION 2: TERRAIN PROFILE */}
        <div className="flex flex-col gap-3.5 bg-slate-950 p-4 rounded-xl border border-slate-800">
          <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 flex items-center gap-1 border-b border-slate-800 pb-1.5">
            <Sliders className="w-3.5 h-3.5 text-emerald-400" /> Parameter Kontur Tanah
          </label>

          {/* Real DEM Toggle */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input 
                type="checkbox" 
                className="sr-only" 
                checked={useRealDEM} 
                onChange={(e) => setUseRealDEM(e.target.checked)} 
              />
              <div className={`block w-10 h-6 rounded-full transition-colors ${useRealDEM ? 'bg-amber-500' : 'bg-slate-800'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${useRealDEM ? 'translate-x-4' : ''}`}></div>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-white flex items-center gap-2">
                Data Satelit (Real DEM) 
                {isLoadingDEM && <span className="text-[9px] text-amber-400 animate-pulse">Memuat...</span>}
              </span>
              <span className="text-[9px] text-slate-500">Gunakan elevasi kontur satelit asli</span>
            </div>
          </label>
          
          {/* Elevation Slider */}
          <div className={`flex flex-col gap-1.5 transition-opacity ${useRealDEM ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Kemiringan Lahan (Slope)</span>
              <span className="font-mono text-amber-400 font-bold">{terrainSlope.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="8.0"
              step="0.5"
              value={terrainSlope}
              onChange={(e) => setTerrainSlope(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          {/* Noise Relief Slider */}
          <div className={`flex flex-col gap-1.5 transition-opacity ${useRealDEM ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Kerataan Bukit (Relief)</span>
              <span className="font-mono text-amber-400 font-bold">{terrainNoise.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="5.0"
              step="0.2"
              value={terrainNoise}
              onChange={(e) => setTerrainNoise(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          {/* Slope Direction Selector */}
          <div className={`flex flex-col gap-1.5 transition-opacity ${useRealDEM ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <span className="text-[11px] text-slate-400">Arah Aliran Lereng</span>
            <div className="grid grid-cols-4 gap-1">
              {['SW-NE', 'B-T', 'S-U', 'NW-SE'].map((dir, idx) => (
                <button
                  key={dir}
                  onClick={() => setSlopeDirection(idx)}
                  className={`py-1 text-[9px] font-bold rounded border ${
                    slopeDirection === idx 
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' 
                        : 'border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 3: BUILDING PROFILE */}
        <div className="flex flex-col gap-3.5 bg-slate-950 p-4 rounded-xl border border-slate-800">
          <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 flex items-center gap-1 border-b border-slate-800 pb-1.5">
            <Home className="w-3.5 h-3.5 text-amber-400" /> Konfigurasi Bangunan
          </label>
          
          {/* Building Style Selectors */}
          {visualPreset !== 'cyberpunk' && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-400">Arsitektur & Material</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setBuildingStyle('glass')}
                    className={`py-1.5 text-[10px] font-bold rounded transition-all ${
                      buildingStyle === 'glass' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Glass Minimalist
                  </button>
                  <button
                    onClick={() => setBuildingStyle('wood')}
                    className={`py-1.5 text-[10px] font-bold rounded transition-all ${
                      buildingStyle === 'wood' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Teak Wood Wood
                  </button>
                </div>
              </div>
          )}

          {/* Roof Style */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-slate-400">Bentuk Atap</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setRoofType('pitched')}
                className={`py-1.5 text-[10px] font-bold rounded transition-all ${
                  roofType === 'pitched' ? 'bg-slate-800 text-amber-400 border border-amber-500/40' : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}
              >
                Atap Limasan (Pitched)
              </button>
              <button
                onClick={() => setRoofType('flat')}
                className={`py-1.5 text-[10px] font-bold rounded transition-all ${
                  roofType === 'flat' ? 'bg-slate-800 text-amber-400 border border-amber-500/40' : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}
              >
                Flat Rooftop
              </button>
            </div>
          </div>

          {/* Building Height Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Tinggi Bangunan</span>
              <span className="font-mono text-amber-400 font-bold">{buildingHeight.toFixed(1)}m</span>
            </div>
            <input
              type="range"
              min="2.0"
              max="15.0"
              step="0.5"
              value={buildingHeight}
              onChange={(e) => setBuildingHeight(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>

        {/* SECTION 4: ENVIRONMENT & LIGHTING */}
        <div className="flex flex-col gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
          <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 flex items-center gap-1 border-b border-slate-800 pb-1.5">
            <Sun className="w-3.5 h-3.5 text-yellow-400" /> Lingkungan & Waktu Hari
          </label>
          
          {/* Time of Day selector */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-slate-400">Simulasi Matahari</span>
            <div className="grid grid-cols-4 gap-1">
              {(['sunrise', 'noon', 'sunset', 'night'] as const).map((time) => (
                <button
                  key={time}
                  onClick={() => setTimeOfDay(time)}
                  className={`py-1.5 text-[10px] font-extrabold uppercase rounded border ${
                    timeOfDay === time 
                        ? 'bg-amber-500/10 border-amber-500 text-amber-400' 
                        : 'border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  {time === 'sunrise' && 'Pagi'}
                  {time === 'noon' && 'Siang'}
                  {time === 'sunset' && 'Sore'}
                  {time === 'night' && 'Malam'}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles for trees and contours */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={showContours}
                onChange={(e) => setShowContours(e.target.checked)}
                className="w-4 h-4 rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 cursor-pointer"
              />
              Tampilkan Garis Kontur Air (Topografi)
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={showTrees}
                onChange={(e) => setShowTrees(e.target.checked)}
                className="w-4 h-4 rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 cursor-pointer"
              />
              Tampilkan Pohon Hijau Lahan
            </label>
          </div>
        </div>

        {/* SECTION 5: REAL-TIME ANALYTICS */}
        <div className="bg-gradient-to-br from-slate-950 to-slate-900 p-4 rounded-xl border border-slate-800 mt-auto">
          <div className="text-[10px] font-extrabold tracking-wider uppercase text-slate-400 mb-2.5 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-indigo-400" /> Analisis Topografi & Lot
          </div>
          <div className="grid grid-cols-2 gap-3.5 text-left">
            <div>
              <span className="text-[9px] uppercase tracking-wide opacity-50 block">Estimasi Luas Kavling</span>
              <span className="text-[13px] font-mono font-bold text-white">{totalArea.toLocaleString('id-ID')} m²</span>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wide opacity-50 block">Rasio RTH Hijau</span>
              <span className="text-[13px] font-mono font-bold text-emerald-400">{greenSpaceRatio}%</span>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wide opacity-50 block">Kemiringan Maksimum</span>
              <span className="text-[13px] font-mono font-bold text-amber-500">{(terrainSlope * 3.5).toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wide opacity-50 block">Cut & Fill Volume</span>
              <span className="text-[13px] font-mono font-bold text-sky-400">~{(totalArea * terrainSlope * 0.15).toFixed(0)} m³</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
