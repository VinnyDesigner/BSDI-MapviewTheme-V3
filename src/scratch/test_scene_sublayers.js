async function run() {
  try {
    const url = 'https://gis9.smartgeoapps.com/server/rest/services/Hosted/IFC_OldVilla_WSL2/SceneServer?f=json';
    const res = await fetch(url);
    const data = await res.json();
    if (data.layers) {
      console.log('Layers in IFC_OldVilla_WSL2/SceneServer:');
      data.layers.forEach(l => {
        console.log(`ID: ${l.id}, Name: ${l.name}, LayerType: ${l.layerType}`);
      });
    } else {
      console.log('No layers property found! Full data:', data);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
