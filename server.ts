import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// In-Memory Cache for RDTR data
interface CacheEntry {
  data: any;
  expiry: number;
}
const rdtrCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes in-memory TTL

// Proxy route with Caching and Validation for RDTR /api/rdtr
app.get("/api/rdtr", async (req, res) => {
  try {
    const latRaw = req.query.latitude || req.query.lat;
    const lngRaw = req.query.longitude || req.query.lng;
    const idWilayahRaw = req.query.id_wilayah || req.query.idWilayah;

    if (!latRaw || !lngRaw) {
      return res.status(400).json({ status: "error", message: "Parameter latitude dan longitude diperlukan." });
    }

    const latitude = parseFloat(latRaw as string);
    const longitude = parseFloat(lngRaw as string);

    // Validation: Latitude -90 to 90, Longitude -180 to 180
    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      return res.status(400).json({ status: "error", message: "Latitude tidak valid (harus di antara -90 sampai 90)." });
    }
    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ status: "error", message: "Longitude tidak valid (harus di antara -180 sampai 180)." });
    }

    const id_wilayah = (idWilayahRaw as string) || "5171000000"; // Default Denpasar
    
    // Caching Key Format: rdtr:{id_wilayah}:{latitude}:{longitude}
    // We round coordinates to 6 decimal places to capture extremely close clicks into the same cache line
    const roundedLat = Number(latitude.toFixed(6));
    const roundedLng = Number(longitude.toFixed(6));
    const cacheKey = `rdtr:${id_wilayah}:${roundedLat}:${roundedLng}`;

    const cached = rdtrCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiry > now) {
      console.log(`[Cache Hit] Serving RDTR from cache: ${cacheKey}`);
      return res.json({ ...cached.data, cached: true });
    }

    const url = `https://gistaru.atrbpn.go.id/rdtrinteraktif/api/interactive/data?id_wilayah=${id_wilayah}&latitude=${latitude}&longitude=${longitude}`;
    console.log(`[Cache Miss] Fetching RDTR from GISTARU: ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json, text/plain, */*",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://gistaru.atrbpn.go.id/rdtrinteraktif/",
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`GISTARU API responded with HTTP status ${response.status}`);
      }

      const data = await response.json();

      // Store in memory cache
      rdtrCache.set(cacheKey, {
        data,
        expiry: now + CACHE_TTL_MS
      });

      res.json({ ...data, cached: false });
    } catch (fetchErr: any) {
      console.error("GISTARU RDTR fetch error:", fetchErr.message);
      res.status(502).json({ 
        status: "error", 
        message: "GISTARU server tidak dapat dijangkau.", 
        details: fetchErr.message 
      });
    }
  } catch (error: any) {
    console.error("RDTR Proxy route exception:", error);
    res.status(500).json({ 
      status: "error", 
      message: "Internal server error saat mengambil data RDTR.", 
      details: error.message 
    });
  }
});

// Proxy route for GISTARU ITR data (Legacy or fallback)
app.get("/api/itr", async (req, res) => {
  try {
    const { lat, lng, id_wilayah } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: "Missing lat or lng" });
    }

    const wilayah = id_wilayah || "5171000000"; // Default to Denpasar
    const url = `https://gistaru.atrbpn.go.id/rdtrinteraktif/api/interactive/data?id_wilayah=${wilayah}&latitude=${lat}&longitude=${lng}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json, text/plain, */*",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://gistaru.atrbpn.go.id/rdtrinteraktif/",
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`GISTARU API responded with ${response.status}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (fetchErr: any) {
        console.error("ITR API unreachable, error:", fetchErr.message);
        res.status(502).json({ error: "GISTARU server error or unreachable", details: fetchErr.message });
    }
  } catch (error: any) {
    console.error("ITR Proxy Error:", error);
    res.status(500).json({ error: "Failed to fetch ITR data", details: error.message });
  }
});

// Proxy route for ArcGIS Reverse Geocoding
app.get("/api/reverse-geocode", async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: "Missing lat or lng" });
    }

    const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&featureTypes=&location=${lng},${lat}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`ArcGIS API responded with ${response.status}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (fetchErr: any) {
      console.error("ArcGIS API unreachable, error:", fetchErr.message);
      res.status(502).json({ error: "ArcGIS server error or unreachable", details: fetchErr.message });
    }
  } catch (error: any) {
    console.error("Reverse Geocode Proxy Error:", error);
    res.status(500).json({ error: "Failed to reverse geocode", details: error.message });
  }
});

// Proxy route for Google Sheets Sync
app.post("/api/sync-sheets", async (req, res) => {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(500).json({ error: "GOOGLE_SHEETS_WEBHOOK_URL not configured" });
  }
  try {
      const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
              "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify(req.body)
      });
      const result = await response.text();
      res.json({ message: "Sync successful", result });
  } catch (err: any) {
      console.error("Sheets Sync Error:", err);
      res.status(500).json({ error: "Failed to sync to Google Sheets via proxy", details: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from dist in production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
