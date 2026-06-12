import fetch from "node-fetch";

async function run() {
  try {
    const wilayah = "5171000000";
    const lat = "-8.6705";
    const lng = "115.2126";
    const originalUrl = `https://gistaru.atrbpn.go.id/rdtrinteraktif/api/interactive/data?id_wilayah=${wilayah}&latitude=${lat}&longitude=${lng}`;
    
    const proxies = [
      `https://corsproxy.io/?${encodeURIComponent(originalUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(originalUrl)}`,
    ];

    for (const url of proxies) {
        console.log("Fetching", url);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000); // 6s
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            console.log("Status:", res.status);
            const text = await res.text();
            console.log("Body:", text.slice(0, 500));
        } catch(e) {
            console.log("Fail:", e.message);
        }
    }
  } catch (e) {
    console.error(e);
  }
}

run();
