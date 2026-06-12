import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Proxy route for GISTARU ITR data
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
