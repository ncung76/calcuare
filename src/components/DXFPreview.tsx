import React, { useEffect, useRef } from 'react';

export const DXFPreview = ({ points, kavlings }: { points: { lat: number, lng: number }[], kavlings: any[] }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.fillStyle = '#0f172a'; // slate-900
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (points.length < 3) return;

        // Transform lat/lng to canvas coords
        const lats = points.map(p => p.lat);
        const lngs = points.map(p => p.lng);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);

        const latRange = maxLat - minLat;
        const lngRange = maxLng - minLng;
        const padding = 20;
        const scale = Math.min((canvas.width - 2 * padding) / (lngRange || 1), (canvas.height - 2 * padding) / (latRange || 1));

        const toCanvas = (p: {lat: number, lng: number}): [number, number] => {
            const x = padding + (p.lng - minLng) * scale;
            const y = canvas.height - padding - (p.lat - minLat) * scale;
            return [x, y];
        };

        // Draw boundary
        ctx.beginPath();
        points.forEach((p, i) => {
            const [x, y] = toCanvas(p);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Kavlings
        if (kavlings) {
            ctx.strokeStyle = '#06b6d4'; // cyan
            ctx.lineWidth = 1;
            kavlings.forEach(k => {
                const geom = k.polygon.geometry;
                const coords = geom.type === 'MultiPolygon' ? geom.coordinates[0][0] : geom.coordinates[0];
                
                ctx.beginPath();
                coords.forEach((pt: number[], i: number) => {
                    const [x, y] = toCanvas({ lat: pt[1], lng: pt[0] });
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.closePath();
                ctx.stroke();
            });
        }
    }, [points, kavlings]);

    return <canvas ref={canvasRef} width="400" height="400" className="w-full h-auto border border-white/10" />;
};
