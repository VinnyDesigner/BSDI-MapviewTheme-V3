export const layersConfig = [
  {
    id: 'sample-data-1',
    title: 'Sample Data 1',
    url: 'https://gis9.smartgeoapps.com/server/rest/services/SampleData1/MapServer',
    visible: false,
    type: 'map-image',
    timeField: 'SURVEY_YEAR'   // hint: pre-selects this field in the Timelapse panel
  },
  {
    id: 'service-2',
    title: 'Service 2',
    url: 'https://gis9.smartgeoapps.com/server/rest/services/Service2/MapServer',
    visible: false,
    type: 'map-image',
    timeField: 'YEAR'
  },
  {
    id: 'service-3',
    title: 'Service 3',
    url: 'https://gis9.smartgeoapps.com/server/rest/services/Service3/MapServer',
    visible: false,
    type: 'map-image',
    timeField: 'Record_Year'
  },
  {
    id: 'sample-data-time-mil1',
    title: 'Sample Data Time MIL1',
    url: 'https://gis12.smartgeoapps.com/server/rest/services/SampleData_Time_MIL1/MapServer',
    visible: false,
    type: 'map-image',
    timeField: 'datecreated'
  },
  {
    id: 'gov-time-date',
    title: 'Governorate Date',
    url: 'https://gis12.smartgeoapps.com/server/rest/services/Hosted/Gov_Time_Date/FeatureServer',
    visible: false,
    type: 'feature',
    timeField: 'date'
  },
  {
    id: 'bsdi-test-1',
    title: 'BSDI Test 1',
    url: 'https://gis12.smartgeoapps.com/server/rest/services/Hosted/BSDITest1/FeatureServer',
    visible: false,
    type: 'feature'
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
