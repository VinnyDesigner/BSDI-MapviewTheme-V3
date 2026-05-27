async function run() {
  try {
    const url = 'http://localhost:5174/arcgis-proxy/server/rest/services/SampleData1/MapServer?f=json';
    console.log('Fetching local proxy for gis9:', url);
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Response status:', res.status, res.statusText);
      return;
    }
    const data = await res.json();
    console.log('Proxy works! Title:', data.documentInfo?.Title || 'No title');
  } catch (err) {
    console.error('Error fetching from local proxy:', err);
  }
}

run();
