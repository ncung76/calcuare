
import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Line, Text } from '@react-three/drei';
import * as turf from '@turf/turf';

export const Map3D = ({ points, kavlings }: { points: { lat: number, lng: number }[], kavlings: any[] }) => {
  console.log("Map3D points:", points, "kavlings:", kavlings);

  if (!points || points.length === 0) {
      return <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white font-mono text-xs">No data available</div>;
  }

  // Calculate center for centering the scene
  const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const centerLng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  
  const processedPoints = points.map(p => [(p.lng - centerLng) * 100000, 0.2, (p.lat - centerLat) * -100000]) as [number, number, number][];

  // Helper to process polygon coordinates to 3D
  const processPolygon = (poly: any) => {
      if (!poly || !poly.geometry || !poly.geometry.coordinates) return [];
      const coords = poly.geometry.type === 'MultiPolygon' ? poly.geometry.coordinates[0][0] : poly.geometry.coordinates[0];
      return coords.map((c: any) => [(c[0] - centerLng) * 100000, 0.3, (c[1] - centerLat) * -100000]);
  };
  
  const kavlingLines = kavlings.map(k => {
      const poly = k.setbackPolygon || k.polygon;
      if (!poly) return null;
      const processed = processPolygon(poly);
      return [...processed, processed[0]];
  }).filter(Boolean);

  // Close the loop for the line
  const linePoints = [...processedPoints, processedPoints[0]];

  // Calculate side lengths for labels for main polygon
  const sideInfo = points.map((p1, i) => {
    const p2 = points[(i + 1) % points.length];
    
    // Project points for label position
    const pp1 = processedPoints[i];
    const pp2 = processedPoints[(i + 1) % processedPoints.length];
    const midpoint: [number, number, number] = [
        (pp1[0] + pp2[0]) / 2,
        0.5, // lift text slightly above line
        (pp1[2] + pp2[2]) / 2,
    ];
    
    // Geodesic distance calculation
    const distanceMeter = turf.distance(
      [p1.lng, p1.lat],
      [p2.lng, p2.lat],
      { units: 'meters' }
    );
    
    return { midpoint, distance: distanceMeter.toFixed(1) + ' m' };
  });

  // Calculate side lengths for labels for kavlings as well
  const kavlingSideInfo = kavlings.flatMap((k, ki) => {
    const poly = k.setbackPolygon || k.polygon;
    if (!poly || !poly.geometry || !poly.geometry.coordinates) return [];
    
    // Get flat coordinates for the outer ring
    const coords = poly.geometry.type === 'MultiPolygon' ? poly.geometry.coordinates[0][0] : poly.geometry.coordinates[0];
    
    return coords.slice(0, coords.length - 1).map((c1: any, i: any) => {
        const c2 = coords[i + 1];
        
        const pp1: [number, number, number] = [(c1[0] - centerLng) * 100000, 0.6, (c1[1] - centerLat) * -100000];
        const pp2: [number, number, number] = [(c2[0] - centerLng) * 100000, 0.6, (c2[1] - centerLat) * -100000];
        
        const midpoint: [number, number, number] = [
            (pp1[0] + pp2[0]) / 2,
            pp1[1],
            (pp1[2] + pp2[2]) / 2,
        ];
        
        const distanceMeter = turf.distance([c1[0], c1[1]], [c2[0], c2[1]], { units: 'meters' });
        
        return { midpoint, distance: distanceMeter.toFixed(1) + ' m' };
    });
  });

  const allSideInfo = [...sideInfo, ...kavlingSideInfo];

  return (
    <div className="w-full h-full bg-slate-900">
      <Canvas camera={{ position: [0, 20, 20], fov: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Sky sunPosition={[100, 20, 100]} />
        <OrbitControls makeDefault enablePan={true} enableRotate={true} enableZoom={true} />
        
        {/* Ground Plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        
        <gridHelper args={[200, 200, '#64748b', '#1e293b']} />
        
        {/* Render polygon as lines */}
        {linePoints.length > 1 && (
            <Line points={linePoints} color="white" lineWidth={3} />
        )}
        
        {/* Render kavling subdivisions */}
        {kavlingLines.map((linePoints, i) => (
            <Line key={i} points={linePoints as [number, number, number][]} color="orange" lineWidth={1} />
        ))}
        
        {/* Render side length labels */}
        {allSideInfo.map((info, i) => (
            <Text
                key={i}
                position={info.midpoint}
                fontSize={0.8}
                color="white"
                anchorX="center"
                anchorY="middle"
                renderOrder={1}
            >
                {info.distance}
            </Text>
        ))}

        {/* Render points as markers */}
        {processedPoints.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.3]} />
            <meshStandardMaterial color="white" emissive="orange" />
          </mesh>
        ))}
      </Canvas>
    </div>
  );
};
