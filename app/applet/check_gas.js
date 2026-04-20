async function checkUsersGas() {
  const url = 'https://script.google.com/macros/s/AKfycbyH2xWu0sq1mmPW48zK2KWfhdzkrGr2Ok45EsRlVzbJx0Y5Nbvt4zGwJ1S_zfD0rgJlnQ/exec';
  console.log("Pinging user's GAS endpoint...");
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        id: 999,
        name: "TESTING FROM SERVER",
        points: [{x: 0, y: 0}],
        areaSqMeters: 10,
        perimeter: 10,
        date: new Date().toISOString()
      })
    });
    
    // Follow redirects manually if needed, but fetch usually follows them
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (err) {
    console.error("Error calling GAS:", err);
  }
}

checkUsersGas();
