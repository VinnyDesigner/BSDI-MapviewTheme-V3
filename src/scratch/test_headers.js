async function run() {
  try {
    const url = 'https://gis12.smartgeoapps.com/server/rest/services/Hosted/BSDITest1/FeatureServer?f=json';
    console.log('Fetching directly with proxy-like headers:', url);
    const res = await fetch(url, {
      headers: {
        'Origin': 'http://localhost:5173',
        'Referer': 'https://gis12.smartgeoapps.com/'
      }
    });
    console.log('Response status:', res.status, res.statusText);
    const data = await res.json();
    console.log('Success! Keys:', Object.keys(data));
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
