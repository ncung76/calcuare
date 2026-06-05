import fetch from "node-fetch";

async function testApi() {
  const url = `https://gistaru.atrbpn.go.id/rdtrinteraktif/api/interactive/data?id_wilayah=5171000000&latitude=-8.63412747237675&longitude=115.20533681642051`;
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://gistaru.atrbpn.go.id/rdtrinteraktif/",
    }
  });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

testApi();
