import fetch from 'node-fetch'; // This might not be installed, or native fetch is available in node 18+
const gasUrl = 'https://script.google.com/macros/s/AKfycbxNI6Gz-02ZGXJtVBrVRvof0_1JIhXZ1hNh45tl09F4xzMQF7BGx8QbOsRmUc6v9zcPaA/exec';

async function testGas() {
  console.log("Testing POST to GAS...");
  try {
    const res = await fetch(gasUrl, {
        method: "POST",
        headers: {
           "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({ 
            id: Date.now(), 
            name: "Server Test", 
            points: [], 
            date: new Date().toISOString(),
            areaSqMeters: 100,
            perimeter: 50
        })
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response text:", text);
  } catch (e) {
    console.error("Fetch error:", e);
  }
}
testGas();
