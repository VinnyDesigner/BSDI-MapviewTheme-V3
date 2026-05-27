async function run() {
  try {
    const url = 'https://gis12.smartgeoapps.com/server/rest/services/Hosted/BSDITest1/FeatureServer?f=json';
    console.log('Fetching:', url);
    const res = await fetch(url);
    const data = await res.json();
    console.log('Keys of response:', Object.keys(data));
    if (data.layers) {
      console.log('Layers length:', data.layers.length);
      console.log('Layers detailed:', data.layers.map(l => ({ id: l.id, name: l.name, parentLayerId: l.parentLayerId })));
    } else {
      console.log('No layers found! Full response:', JSON.stringify(data).substring(0, 500));
    }
  } catch (err) {
    console.error('Error fetching:', err);
  }
}

run();
