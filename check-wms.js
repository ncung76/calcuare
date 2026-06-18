export async function check() {
  console.log("Checking via allorigins...");
  try {
    const res = await fetch("https://api.allorigins.win/get?url=" + encodeURIComponent("https://geo2.perare.io/geoserver/dorado/wms?request=GetCapabilities"));
    console.log(`Status: ${res.status}`);
  } catch(e) {
    console.log("Error:", e.message);
  }
}
check();
