const xmin = 5637750.547815993;
const xmax = 5637779.477852546;
const ymin = 3038660.452416959;
const ymax = 3038683.9046006184;

const x = (xmin + xmax) / 2;
const y = (ymin + ymax) / 2;

const r_earth = 6378137;
const lng = (x / r_earth) * (180 / Math.PI);
const lat = (Math.atan(Math.exp(y / r_earth)) * 2 - Math.PI / 2) * (180 / Math.PI);

console.log('Center Mercator:', x, y);
console.log('Center Lng/Lat:', lng, lat);
