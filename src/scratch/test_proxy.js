async function run() {
  try {
    const url = 'http://localhost:5174/arcgis-proxy-gis12/server/rest/services/Hosted/BSDITest1/FeatureServer?f=json';
    console.log('Fetching local proxy:', url);
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Response status:', res.status, res.statusText);
      return;
    }
    const data = await res.json();
    console.log('Proxy works! Keys:', Object.keys(data));
    if (data.layers) {
      console.log('Layers count:', data.layers.length);
    }
  } catch (err) {
    console.error('Error fetching from local proxy:', err);
  }
}

run();
