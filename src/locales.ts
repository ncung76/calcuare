export const translations = {
  en: {
    // Header
    surveyorMode: "Surveyor Mode",
    projectLibrary: "Project Library",
    utmSettings: "Settings",
    exportData: "Export Data",
    toggleTheme: "Toggle Dark/Light Mode",
    toggleLang: "Switch to Bahasa Indonesia",
    
    // Sidebar
    inputCoordsHeader: "01 // Input Coordinates",
    pointLabel: "POINT",
    latitude: "Latitude",
    longitude: "Longitude",
    addNextCoord: "Add Next Coordinate",
    undo: "Undo",
    clear: "Clear",
    allRightsReserved: "All Rights Reserved",
    
    // Search
    searchPlaceholder: "Search region, city, address...",
    
    // Map overlays
    metricsHover: "Measurement Metrics",
    area: "Area",
    perimeter: "Perimeter",
    estLength: "Est. Length",
    estWidth: "Est. Width",
    
    // Library Modal
    newProjectName: "New Project Name...",
    saving: "Saving...",
    save: "Save",
    addPointsFirst: "* Add coordinate points on the map first to save",
    savedProjects: "Saved Projects",
    noSavedProjects: "No saved projects found.",
    points: "points",
    delete: "Delete",
    loadProject: "Load Project",
    
    // Export Modal
    exportDesc: "Generate a full PDF report including a visual map screenshot, point coordinates, line measurements, and final land metrics.",
    pointsToProcess: "Points to Process:",
    calculatedArea: "Calculated Area:",
    estimatedPerimeter: "Estimated Perimeter:",
    generating: "Generating Document...",
    exportPdfBtn: "Export PDF Report",
    
    // Settings Modal
    measurementUnit: "Measurement Unit",
    metric: "Metric (Meters, Hectares)",
    imperial: "Imperial (Feet, Acres)",
    mapRenderStyle: "Map Render Style",
    showGrid: "Show Survey Grid Overlay",
    crsInfoTitle: "CRS Information:",
    crsInfoText: "Turf.js intrinsically assumes data uses WGS84 (EPSG:4326). Map relies on Web Mercator (EPSG:3857) for visual rendering.",
    
    // Alerts
    pdfFailed: "Failed to generate PDF. Please try again.",
    setupSent: "Setup request sent! Please check your Google Spreadsheet.",
    setupFailed: "Setup failed: "
  },
  id: {
    // Header
    surveyorMode: "Mode Surveyor",
    projectLibrary: "Pustaka Proyek",
    utmSettings: "Pengaturan",
    exportData: "Ekspor Data",
    toggleTheme: "Ganti Mode Gelap/Terang",
    toggleLang: "Switch to English",
    
    // Sidebar
    inputCoordsHeader: "01 // Input Koordinat",
    pointLabel: "TITIK",
    latitude: "Garis Lintang",
    longitude: "Garis Bujur",
    addNextCoord: "Tambah Koordinat Berikutnya",
    undo: "Batal",
    clear: "Hapus",
    allRightsReserved: "Hak Cipta Dilindungi",
    
    // Search
    searchPlaceholder: "Cari wilayah, kota, alamat...",
    
    // Map overlays
    metricsHover: "Metrik Pengukuran",
    area: "Luas",
    perimeter: "Keliling",
    estLength: "Est. Panjang",
    estWidth: "Est. Lebar",
    
    // Library Modal
    newProjectName: "Nama Proyek Baru...",
    saving: "Menyimpan...",
    save: "Simpan",
    addPointsFirst: "* Tambahkan titik koordinat di peta terlebih dahulu untuk menyimpan",
    savedProjects: "Proyek Tersimpan",
    noSavedProjects: "Tidak ada proyek tersimpan.",
    points: "titik",
    delete: "Hapus",
    loadProject: "Muat Proyek",
    
    // Export Modal
    exportDesc: "Buat laporan PDF lengkap yang mencakup tangkapan layar peta, koordinat titik, pengukuran garis, dan metrik lahan akhir.",
    pointsToProcess: "Titik untuk Diproses:",
    calculatedArea: "Kalkulasi Luas:",
    estimatedPerimeter: "Estimasi Keliling:",
    generating: "Membuat Dokumen...",
    exportPdfBtn: "Ekspor Laporan PDF",
    
    // Settings Modal
    measurementUnit: "Satuan Pengukuran",
    metric: "Metrik (Meter, Hektare)",
    imperial: "Imperial (Kaki, Akre)",
    mapRenderStyle: "Gaya Render Peta",
    showGrid: "Tampilkan Kisi Survei",
    crsInfoTitle: "Informasi CRS:",
    crsInfoText: "Turf.js secara asal menggunakan WGS84 (EPSG:4326). Peta menggunakan Web Mercator (EPSG:3857) untuk rendering visual.",
    
    // Alerts
    pdfFailed: "Gagal membuat PDF. Silakan coba lagi.",
    setupSent: "Permintaan setup terkirim! Silakan periksa Google Spreadsheet Anda.",
    setupFailed: "Setup gagal: "
  }
};

export type Language = 'en' | 'id';

export function t(lang: Language, key: keyof typeof translations.en): string {
  return translations[lang][key] || translations.en[key] || key;
}
