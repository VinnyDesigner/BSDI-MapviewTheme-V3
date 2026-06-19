export const layersConfig = [
  {
    id: 'iga-soil-classification',
    title: 'BSDI/IGA_Soil_Classification_2019_Map_Viewer',
    url: 'https://gis15.smartgeoapps.com/server/rest/services/BSDI/IGA_Soil_Classification_2019_Map_Viewer/MapServer',
    visible: false,
    type: 'map-image'
  },
  {
    id: 'iga-crushers-quarriers',
    title: 'BSDI/IGA_CRUSHERS_QUARRIERS_Map_Viewer',
    url: 'https://gis15.smartgeoapps.com/server/rest/services/BSDI/IGA_CRUSHERS_QUARRIERS_Map_Viewer/MapServer',
    visible: false,
    type: 'map-image'
  },
  {
    id: 'iga-cancer-data',
    title: 'BSDI/IGA_CancerData_MapViewer',
    url: 'https://gis15.smartgeoapps.com/server/rest/services/BSDI/IGA_CancerData_MapViewer/MapServer',
    visible: false,
    type: 'map-image'
  },
  {
    id: 'iga-admin-units',
    title: 'BSDI/IGA_AdminUnits_Map_viewer',
    url: 'https://gis15.smartgeoapps.com/server/rest/services/BSDI/IGA_AdminUnits_Map_viewer/MapServer',
    visible: false,
    type: 'map-image'
  },
  {
    id: 'governorate-date',
    title: 'Governorate Date',
    url: 'https://gis15.smartgeoapps.com/server/rest/services/BSDI/Governorate_Date/MapServer',
    visible: false,
    type: 'map-image',
    timeField: 'Updated_Year'
  }
];

export const basemaps = [
  {
    id: "dark-gray-vector",
    title: "Dark Gray Canvas",
    thumbnail: "/assets/basemaps/dark-gray.jpg"
  },
  {
    id: "satellite",
    title: "Imagery",
    thumbnail: "/assets/basemaps/imagery.jpg"
  },
  {
    id: "hybrid",
    title: "Imagery Hybrid",
    thumbnail: "/assets/basemaps/hybrid.jpg"
  },
  {
    id: "gray-vector",
    title: "Light Gray Canvas",
    thumbnail: "/assets/basemaps/light-gray.jpg"
  },
  {
    id: "streets-navigation-vector",
    title: "Navigation Map",
    thumbnail: "/assets/basemaps/navigation.jpg"
  },
  {
    id: "oceans",
    title: "Oceans",
    thumbnail: "/assets/basemaps/oceans.jpg"
  }
];
