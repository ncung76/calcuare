const gasUrl = 'https://script.google.com/macros/s/AKfycbxjLsv05ASo9hM6zK2juoKtcX9gUypBupmEkt6IrSHE5335_Z7kktHOcIz23BVtIFIELA/exec';
async function test() {
  const res = await fetch(gasUrl, {method: 'POST', body: JSON.stringify({
      id: "abc-123",
      name: "TES_URL_BARU",
      date: new Date().toISOString(),
      areaSqMeters: 456,
      perimeter: 789,
      points: [{lat: 1, lng: 1}]
  })});
  console.log(await res.text());
}
test();
