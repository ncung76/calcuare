import React, { useEffect, useState, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { motion, useAnimation } from 'motion/react';
import { Compass, Info, Navigation2 } from 'lucide-react';

export const NorthArrow = () => {
    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());
    const [center, setCenter] = useState(map.getCenter());
    const [wiggle, setWiggle] = useState(0);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        const onMove = () => {
            // Simulate a physical compass needle wiggle during map moves
            const randomWiggle = (Math.random() - 0.5) * 8; 
            setWiggle(randomWiggle);
            setCenter(map.getCenter());
        };

        const onMoveEnd = () => {
            // Calm the compass down
            setWiggle(0);
            setZoom(map.getZoom());
            setCenter(map.getCenter());
        };

        map.on('move', onMove);
        map.on('moveend', onMoveEnd);
        map.on('zoomend', onMoveEnd);

        return () => {
            map.off('move', onMove);
            map.off('moveend', onMoveEnd);
            map.off('zoomend', onMoveEnd);
        };
    }, [map]);

    // Format coordinates beautifully
    const formattedLat = center.lat.toFixed(6);
    const formattedLng = center.lng.toFixed(6);

    return (
        <div 
            className="absolute top-[74px] left-4 lg:left-6 z-[1000] flex flex-col items-start gap-2 pointer-events-auto group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Compass Card Container */}
            <div className="flex items-center gap-3 bg-[var(--color-bg)]/90 dark:bg-[var(--color-bg)]/95 backdrop-blur-md p-2.5 rounded-xl shadow-xl border border-[var(--color-fg)]/10 transition-all duration-300 hover:shadow-2xl hover:border-[var(--color-fg)]/20">
                <div className="relative w-12 h-12 flex items-center justify-center">
                    {/* Outer Compass Dial / Dial Ring */}
                    <svg className="absolute inset-0 w-full h-full text-[var(--color-fg)]/10 dark:text-[var(--color-fg)]/20" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,3" />
                        <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="0.5" />
                        {/* Dial tics */}
                        <line x1="50" y1="4" x2="50" y2="10" stroke="currentColor" strokeWidth="1.5" />
                        <line x1="50" y1="90" x2="50" y2="96" stroke="currentColor" strokeWidth="1" />
                        <line x1="4" y1="50" x2="10" y2="50" stroke="currentColor" strokeWidth="1" />
                        <line x1="90" y1="50" x2="96" y2="50" stroke="currentColor" strokeWidth="1" />
                    </svg>

                    {/* Cardinal direction labels */}
                    <span className="absolute top-1 text-[8px] font-bold tracking-widest text-red-600 select-none">N</span>
                    <span className="absolute bottom-1 text-[7px] font-bold opacity-30 select-none">S</span>
                    <span className="absolute left-1.5 text-[7px] font-bold opacity-30 select-none">W</span>
                    <span className="absolute right-1.5 text-[7px] font-bold opacity-30 select-none">E</span>

                    {/* Center Needle pivot */}
                    <div className="w-1.5 h-1.5 rounded-full bg-red-600 z-10 absolute shadow-sm" />

                    {/* Animated needle */}
                    <motion.div 
                        className="w-full h-full absolute inset-0 flex items-center justify-center"
                        animate={{ rotate: wiggle }}
                        transition={{ type: "spring", stiffness: 120, damping: 10 }}
                    >
                        {/* Double headed needle */}
                        <svg className="w-8 h-8 drop-shadow-md" viewBox="0 0 24 24" fill="none">
                            {/* North needle - Red */}
                            <path d="M12 2L15 12H9L12 2Z" fill="#dc2626" />
                            {/* South needle - Blue/Gray */}
                            <path d="M12 22L15 12H9L12 22Z" fill="currentColor" className="text-gray-400 dark:text-gray-600" />
                        </svg>
                    </motion.div>
                </div>

                {/* Quick Info text block */}
                <div className="flex flex-col pr-1 select-none">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-fg)]/80 leading-3">SURVEYOR</span>
                    <span className="text-[8px] font-mono font-bold text-red-600 tracking-wider">MAGNETIC N</span>
                </div>
            </div>

            {/* Expandable HUD info overlay */}
            <motion.div 
                initial={{ opacity: 0, y: -5, height: 0 }}
                animate={{ 
                    opacity: isHovered ? 1 : 0,
                    y: isHovered ? 0 : -5,
                    height: isHovered ? 'auto' : 0
                }}
                className="overflow-hidden bg-[var(--color-bg)]/95 dark:bg-[var(--color-bg)]/95 backdrop-blur-md rounded-xl p-3 border border-[var(--color-fg)]/10 shadow-lg w-52 pointer-events-none"
            >
                <div className="space-y-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg)]/80">
                    <div className="flex justify-between border-b border-[var(--color-fg)]/5 pb-1">
                        <span className="opacity-45">LATITUDE</span>
                        <span className="font-bold">{formattedLat}°</span>
                    </div>
                    <div className="flex justify-between border-b border-[var(--color-fg)]/5 pb-1">
                        <span className="opacity-45">LONGITUDE</span>
                        <span className="font-bold">{formattedLng}°</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="opacity-45">ZOOM SCALE</span>
                        <span className="font-bold text-red-600">LVL {zoom}</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
