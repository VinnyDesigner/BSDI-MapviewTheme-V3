async function run() {
  try {
    const url = 'http://localhost:5174/arcgis-proxy/server/rest/services/Hosted/AdminBlock_WSL/SceneServer?f=json';
    console.log('Fetching local proxy for AdminBlock_WSL:', url);
    const res = await fetch(url);
    const data = await res.json();
    console.log('Proxy Status:', res.status, res.statusText);
    console.log('Response content keys:', Object.keys(data));
    if (data.layers) {
      console.log('Layers found:', data.layers.map(l => ({ id: l.id, name: l.name })));
    } else {
      console.log('Full data:', data);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
