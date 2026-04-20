const gasUrl = 'https://script.google.com/macros/s/AKfycbyH2xWu0sq1mmPW48zK2KWfhdzkrGr2Ok45EsRlVzbJx0Y5Nbvt4zGwJ1S_zfD0rgJlnQ/exec';
async function test() {
  const res = await fetch(gasUrl, {method: 'POST', body: JSON.stringify({action: 'setup'})});
  console.log(await res.text());
}
test();
