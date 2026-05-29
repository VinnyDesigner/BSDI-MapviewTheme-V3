async function run() {
  try {
    const urls = [
      'https://gis9.smartgeoapps.com/server/rest/services/Hosted/AdminBlock_WSL/SceneServer?f=json',
      'https://gis9.smartgeoapps.com/server/rest/services/Hosted/IFC_OldVilla_WSL2/SceneServer?f=json'
    ];
    for (const url of urls) {
      console.log('Querying:', url);
      const res = await fetch(url);
      console.log('Status:', res.status, res.statusText);
      if (res.ok) {
        const data = await res.json();
        console.log('Keys:', Object.keys(data).slice(0, 10));
        console.log('Name:', data.name || data.documentInfo?.Title || 'No name');
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
