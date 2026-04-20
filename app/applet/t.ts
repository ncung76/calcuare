async function testGas() {
  const gasUrl = 'https://script.google.com/macros/s/AKfycbwSsZzwxNmnVRVx6JC0Kh-Vg4_I6S2_rHHqWgysLB0w3_YNFhzVVY9qanTSY59mnMvA2g/exec';
  console.log("Testing POST to GAS...");
  try {
    const res = await fetch(gasUrl, {
        method: "POST",
        headers: {
           "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({ action: "setup" })
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response text:", text);
  } catch (e) {
    console.error("Fetch error:", e);
  }
}
testGas();
