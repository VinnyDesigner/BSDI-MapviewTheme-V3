async function run() {
  try {
    const url = 'https://gis9.smartgeoapps.com/server/rest/services/Hosted/IFC_OldVilla_WSL2/SceneServer?f=json';
    const res = await fetch(url);
    const data = await res.json();
    console.log('Old Villa SceneServer Root Metdata:');
    console.log('fullExtent:', data.fullExtent);
    
    const layerUrl = 'https://gis9.smartgeoapps.com/server/rest/services/Hosted/IFC_OldVilla_WSL2/SceneServer/layers/0?f=json';
    const layerRes = await fetch(layerUrl);
    const layerData = await layerRes.json();
    console.log('\nLayer 0 Metadata:');
    console.log('fullExtent:', layerData.fullExtent);
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
