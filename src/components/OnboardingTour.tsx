import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, MapPin, Layers, Layout, ChevronRight, ChevronLeft, X, HelpCircle, Compass, CheckCircle2, RotateCcw } from 'lucide-react';

interface OnboardingTourProps {
  lang: 'en' | 'id';
  onComplete: () => void;
  mobileTab: 'map' | 'points' | 'stats';
  setMobileTab: (tab: 'map' | 'points' | 'stats') => void;
  showLeftSidebar: boolean;
  setShowLeftSidebar: (show: boolean) => void;
  showRightSidebar: boolean;
  setShowRightSidebar: (show: boolean) => void;
}

interface TourStep {
  titleEn: string;
  titleId: string;
  descriptionEn: string;
  descriptionId: string;
  targetTab?: 'map' | 'points' | 'stats';
  setupAction?: () => void;
  icon: React.ReactNode;
  highlightClass?: string;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  lang,
  onComplete,
  mobileTab,
  setMobileTab,
  showLeftSidebar,
  setShowLeftSidebar,
  showRightSidebar,
  setShowRightSidebar,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: TourStep[] = [
    {
      titleEn: "Welcome to CALCUARE V2",
      titleId: "Selamat Datang di CALCUARE V2",
      descriptionEn: "Your ultimate platform for high-precision land measurement, automatic plot subdivision (Auto Kavling), spatial planning (RDTR Bali), and Cut & Fill topography analysis.",
      descriptionId: "Platform andalan Anda untuk pengukuran lahan presisi tinggi, pembagian kapling otomatis (Auto Kavling), tata ruang wilayah (RDTR Bali), serta analisis topografi Cut & Fill.",
      icon: <Sparkles className="w-8 h-8 text-fuchsia-500 animate-pulse" />,
    },
    {
      titleEn: "Interactive Map Canvas",
      titleId: "Kanvas Peta Interaktif",
      descriptionEn: "This is where you visualize your land. Click directly on the map to plot boundaries, toggle satellite layers, search for locations, or use 'Freehand Draw' to sketch borders with your cursor.",
      descriptionId: "Tempat visualisasi lahan Anda. Klik langsung pada peta untuk menentukan koordinat batas, ganti lapisan satelit, cari lokasi, atau aktifkan 'Gambar Bebas' untuk sketsa cepat.",
      targetTab: 'map',
      setupAction: () => {
        setMobileTab('map');
      },
      icon: <MapPin className="w-8 h-8 text-emerald-500" />,
    },
    {
      titleEn: "Coordinate & CAD Input",
      titleId: "Input Koordinat & Impor CAD/GIS",
      descriptionEn: "Located in the left sidebar. Input precise Latitude/Longitude coordinates manually, upload spatial documents (KML, SHP, GeoJSON), or import AutoCAD DXF blueprint files instantly.",
      descriptionId: "Berada di panel sebelah kiri. Masukkan koordinat Latitude/Longitude secara manual, unggah dokumen spasial (KML, SHP, GeoJSON), atau impor cetak biru CAD DXF secara instan.",
      targetTab: 'points',
      setupAction: () => {
        setMobileTab('points');
        setShowLeftSidebar(true);
      },
      icon: <Layers className="w-8 h-8 text-blue-500" />,
    },
    {
      titleEn: "Analysis, Zoning & Subdivision",
      titleId: "Analisis Tata Ruang & Kavling",
      descriptionEn: "Located in the right sidebar. Review real-time area metrics, verify official Bali Province RDTR spatial regulations, generate automatic residential subdivisions with access roads, and calculate grading volumes.",
      descriptionId: "Berada di panel sebelah kanan. Tinjau luas area real-time, periksa kesesuaian hukum tata ruang RDTR Bali, simulasikan pembagian kapling perumahan otomatis, dan hitung volume urukan.",
      targetTab: 'stats',
      setupAction: () => {
        setMobileTab('stats');
        setShowRightSidebar(true);
      },
      icon: <Layout className="w-8 h-8 text-orange-500" />,
    },
    {
      titleEn: "Instant Hover Explanations",
      titleId: "Panduan Interaktif Instan",
      descriptionEn: "We have placed explanations everywhere! Hover your cursor over any button, unit, or input field to instantly see detailed context, formulas, and usage advice.",
      descriptionId: "Setiap tombol dan panel dilengkapi panduan instan! Arahkan kursor ke fitur apa saja untuk melihat penjelasan interaktif, rumus kalkulasi, dan tips penggunaan.",
      icon: <HelpCircle className="w-8 h-8 text-indigo-500" />,
    },
    {
      titleEn: "Ready to Explore!",
      titleId: "Anda Siap Memulai!",
      descriptionEn: "CALCUARE is designed with professional workflows made simple. Dive in, plot your first coordinates, and unleash professional land analysis tools right away!",
      descriptionId: "CALCUARE dirancang untuk menyederhanakan alur kerja profesional. Mulai plot batas lahan pertama Anda sekarang dan nikmati kecanggihan analisis spasial!",
      icon: <CheckCircle2 className="w-8 h-8 text-emerald-500" />,
    },
  ];

  useEffect(() => {
    const step = steps[currentStep];
    if (step && step.setupAction) {
      step.setupAction();
    }
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const activeStep = steps[currentStep];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
        {/* Highlight Focus Area Layer if a step specifies high-precision layouts */}
        {activeStep.targetTab && (
          <div className="absolute inset-0 pointer-events-none border-[6px] border-amber-500/30 transition-all duration-500" />
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 md:p-8 text-slate-800 dark:text-slate-100 flex flex-col gap-6"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50">
                {activeStep.icon}
              </div>
              <div>
                <span className="text-[10px] font-mono font-black tracking-widest text-indigo-600 dark:text-indigo-400 uppercase">
                  CALCUARE V2 TOUR • {currentStep + 1} / {steps.length}
                </span>
                <h3 className="text-lg md:text-xl font-sans font-bold tracking-tight text-slate-900 dark:text-white mt-0.5">
                  {lang === 'id' ? activeStep.titleId : activeStep.titleEn}
                </h3>
              </div>
            </div>
            <button
              onClick={handleSkip}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all"
              aria-label="Skip Tour"
            >
              <X size={18} />
            </button>
          </div>

          {/* Description */}
          <div className="min-h-[90px] flex items-center">
            <p className="text-[13.5px] leading-relaxed opacity-85 text-slate-600 dark:text-slate-300">
              {lang === 'id' ? activeStep.descriptionId : activeStep.descriptionEn}
            </p>
          </div>

          {/* Progress Indicators */}
          <div className="flex items-center gap-1.5 justify-center py-1">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentStep
                    ? 'w-6 bg-indigo-600 dark:bg-indigo-400'
                    : idx < currentStep
                    ? 'w-2 bg-indigo-600/40 dark:bg-indigo-400/30'
                    : 'w-2 bg-slate-200 dark:bg-slate-800'
                }`}
              />
            ))}
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-5 mt-2">
            <button
              onClick={handleSkip}
              className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              {lang === 'id' ? "Lewati" : "Skip"}
            </button>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[11.5px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all"
                >
                  <ChevronLeft size={14} />
                  {lang === 'id' ? "Kembali" : "Back"}
                </button>
              )}

              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-[11.5px] font-bold uppercase tracking-wider text-white shadow-lg shadow-indigo-600/10 dark:shadow-indigo-500/10 transition-all"
              >
                {currentStep === steps.length - 1 ? (
                  <>
                    {lang === 'id' ? "Mulai Sekarang" : "Get Started"}
                    <Compass size={14} className="animate-spin-slow" />
                  </>
                ) : (
                  <>
                    {lang === 'id' ? "Lanjut" : "Next"}
                    <ChevronRight size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
