export const layersConfig = [
  {
    id: 'heritage-sites',
    title: 'Heritage Sites',
    url: 'https://services.arcgis.com/V6ZHFr6zdgNZuXC0/ArcGIS/rest/services/Heritage_Sites/FeatureServer/0',
    visible: true
  },
  {
    id: 'coastal-counties',
    title: 'Coastal Areas',
    url: 'https://services.arcgis.com/P3ePLMYs2RVChqkv/arcgis/rest/services/USA_Coastal_Counties/FeatureServer/0',
    visible: false
  },
  {
    id: 'satellite-present',
    title: 'Present – Satellite View',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    type: 'tile',
    visible: false,
    time: 2026
  },
  {
    id: 'historical-1940',
    title: '1940 – Historical View',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer',
    type: 'tile',
    visible: false,
    time: 1940
  },
  {
    id: 'historical-1990',
    title: '1990 – Historical View',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer',
    type: 'tile',
    visible: false,
    time: 1990
  }
];
