async function run() {
  try {
    const url = 'https://gis9.smartgeoapps.com/server/rest/services/Hosted/AdminBlock_WSL/SceneServer?f=json';
    const res = await fetch(url);
    const data = await res.json();
    console.log('Error content:', data);
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
