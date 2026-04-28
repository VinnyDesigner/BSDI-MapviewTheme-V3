const fs = require('fs');
const path = require('path');

const basemaps = [
  {
    name: 'dark-gray.jpg',
    url: 'https://www.arcgis.com/sharing/rest/content/items/1b243539f4514b6ba35e7d995890db1d/info/thumbnail/thumbnail.jpg'
  },
  {
    name: 'imagery.jpg',
    url: 'https://www.arcgis.com/sharing/rest/content/items/10df2279f9684e4a9f6a7f08febac2a9/info/thumbnail/thumbnail.jpg'
  },
  {
    name: 'hybrid.jpg',
    url: 'https://www.arcgis.com/sharing/rest/content/items/30d6b8271e744cdb960a4f5276e01e9a/info/thumbnail/thumbnail.jpg'
  },
  {
    name: 'light-gray.jpg',
    url: 'https://www.arcgis.com/sharing/rest/content/items/8b3d38c0819547faa83f7b7aca80bd76/info/thumbnail/thumbnail.jpg'
  },
  {
    name: 'navigation.jpg',
    url: 'https://www.arcgis.com/sharing/rest/content/items/c50b01da42a14918a383f06427514338/info/thumbnail/thumbnail.jpg'
  },
  {
    name: 'oceans.jpg',
    url: 'https://www.arcgis.com/sharing/rest/content/items/5ae9e138a17842688b0b79283a4353f6/info/thumbnail/thumbnail.jpg'
  }
];

const downloadDir = path.join(__dirname, '../../public/assets/basemaps');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

async function download(name, url) {
  try {
    console.log(`Downloading ${name} from ${url}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(path.join(downloadDir, name), buffer);
    console.log(`Successfully downloaded ${name}`);
  } catch (error) {
    console.error(`Failed to download ${name}:`, error.message);
  }
}

async function main() {
  for (const bm of basemaps) {
    await download(bm.name, bm.url);
  }
}

main();
