import React from 'react';
import { useMapEvents, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';

export const MeasureHandler = ({ 
    active, 
    measurePoints, 
    setMeasurePoints,
    t,
    lang
}: { 
    active: boolean, 
    measurePoints: [number, number][], 
    setMeasurePoints: React.Dispatch<React.SetStateAction<[number, number][]>>,
    t: any,
    lang: string 
}) => {
    useMapEvents({
        click(e) {
            if (active) {
                setMeasurePoints(prev => [...prev, [e.latlng.lat, e.latlng.lng]]);
            }
        },
    });

    if (!active || measurePoints.length === 0) return null;

    const calculateDistance = (pts: [number, number][]) => {
        if (pts.length < 2) return 0;
        let dist = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            dist += turf.distance(turf.point([pts[i][1], pts[i][0]]), turf.point([pts[i+1][1], pts[i+1][0]]), { units: 'meters' });
        }
        return dist;
    };

    return (
        <>
            <Polyline positions={measurePoints} pathOptions={{ color: '#ec4899', weight: 4, dashArray: '10, 10' }} />
            {measurePoints.map((p, i) => (
                <CircleMarker 
                    key={i} 
                    center={p} 
                    radius={5} 
                    pathOptions={{ color: '#ec4899', fillColor: '#fff', fillOpacity: 1 }}
                >
                    <Tooltip permanent className="bg-transparent border-none shadow-none font-bold text-[12px] text-pink-600">
                        {i === 0 ? "Start" : `${(calculateDistance(measurePoints.slice(0, i + 1))).toFixed(0)}m`}
                    </Tooltip>
                </CircleMarker>
            ))}
        </>
    );
};
