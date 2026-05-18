export const layersConfig = [
  {
    id: 'sample-data-1',
    title: 'Sample Data 1',
    url: 'https://gis9.smartgeoapps.com/server/rest/services/SampleData1/MapServer',
    visible: false,
    type: 'map-image',
    timeEnabled: true,
    timeField: 'SURVEY_YEAR',
    startYear: 2018,
    endYear: 2024
  },
  {
    id: 'service-2',
    title: 'Service 2',
    url: 'https://gis9.smartgeoapps.com/server/rest/services/Service2/MapServer',
    visible: false,
    type: 'map-image',
    timeEnabled: true,
    timeField: 'YEAR',
    startYear: 2010,
    endYear: 2025
  },
  {
    id: 'service-3',
    title: 'Service 3',
    url: 'https://gis9.smartgeoapps.com/server/rest/services/Service3/MapServer',
    visible: false,
    type: 'map-image',
    timeEnabled: true,
    timeField: 'Record_Year',
    startYear: 2000,
    endYear: 2024
  }
];
