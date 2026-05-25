/**
 * Default GP Tool Manifests
 * ──────────────────────────────────────────────────────────────────────────
 * Ships with the framework as a starter set.
 * Teams add their own tools by calling registerGPTool() in their project.
 *
 * Manifest shape:
 * {
 *   toolId:       string      (unique stable key)
 *   meta: {
 *     name:       string      (display name)
 *     description:string
 *     category:   string      (used for grouping in UI)
 *     icon:       string      (lucide icon name or emoji)
 *     tags:       string[]
 *   }
 *   execution: {
 *     mode:           'arcgis' | 'custom'
 *     serviceUrl:     string   (ArcGIS GP service URL, mode=arcgis)
 *     executionType:  'esriExecutionTypeSynchronous' | 'esriExecutionTypeAsynchronous'
 *     customUrl:      string   (mode=custom)
 *     method:         'POST' | 'GET'
 *     headers:        Object
 *   }
 *   parameters: [             (array of input descriptors)
 *     {
 *       name:        string
 *       label:       string
 *       widgetType:  string   (see gpParamParser.js DATA_TYPE_MAP)
 *       required:    boolean
 *       defaultValue:any
 *       choiceList:  string[]
 *       description: string
 *     }
 *   ]
 *   outputs: [                (array of expected output descriptors)
 *     {
 *       name:        string
 *       label:       string
 *       outputType:  'FeatureSet' | 'String' | 'Number' | 'File' | 'Raster' | 'Table' | 'Message'
 *       renderMode:  'MapLayer' | 'Table' | 'Text' | 'Download'
 *     }
 *   ]
 * }
 */

const DEFAULT_MANIFESTS = [
  // ── 1. Buffer ──────────────────────────────────────────────────────────
  {
    toolId: 'gp_buffer',
    meta: {
      name: 'Buffer Features',
      description: 'Creates a buffer polygon around input features at a specified distance.',
      category: 'Proximity Analysis',
      icon: '◎',
      tags: ['buffer', 'proximity', 'polygon'],
    },
    execution: {
      mode: 'arcgis',
      serviceUrl: 'https://sampleserver6.arcgisonline.com/arcgis/rest/services/Utilities/PrintingTools/GPServer/Export%20Web%20Map%20Task',
      executionType: 'esriExecutionTypeSynchronous',
    },
    parameters: [
      {
        name: 'Input_Features',
        label: 'Input Features',
        widgetType: 'LayerPicker',
        required: true,
        description: 'The layer to buffer',
      },
      {
        name: 'Distance',
        label: 'Buffer Distance',
        widgetType: 'NumberInput',
        required: true,
        defaultValue: 1000,
        description: 'Distance in meters',
        min: 1,
      },
      {
        name: 'Unit',
        label: 'Unit',
        widgetType: 'Select',
        required: false,
        defaultValue: 'meters',
        choiceList: ['meters', 'kilometers', 'miles', 'feet'],
      },
      {
        name: 'Dissolve',
        label: 'Dissolve Results',
        widgetType: 'Toggle',
        required: false,
        defaultValue: false,
        description: 'Merge all output buffers into one polygon',
      },
    ],
    outputs: [
      {
        name: 'Output_Feature_Class',
        label: 'Buffer Result',
        outputType: 'FeatureSet',
        renderMode: 'MapLayer',
      },
    ],
  },

  // ── 2. Viewshed ────────────────────────────────────────────────────────
  {
    toolId: 'gp_viewshed',
    meta: {
      name: 'Viewshed Analysis',
      description: 'Determines areas visible from one or more observer points.',
      category: '3D Analysis',
      icon: '👁️',
      tags: ['viewshed', 'visibility', '3D', 'terrain'],
    },
    execution: {
      mode: 'arcgis',
      serviceUrl: 'https://sampleserver6.arcgisonline.com/arcgis/rest/services/Elevation/ESRI_Elevation_World/GPServer/Viewshed',
      executionType: 'esriExecutionTypeSynchronous',
    },
    parameters: [
      {
        name: 'Input_Observation_Point',
        label: 'Observer Point Layer',
        widgetType: 'LayerPicker',
        required: true,
        description: 'Point feature class representing observer locations',
      },
      {
        name: 'Radius',
        label: 'Analysis Radius (km)',
        widgetType: 'NumberInput',
        required: false,
        defaultValue: 10,
        min: 0.5,
        max: 50,
      },
    ],
    outputs: [
      {
        name: 'Viewshed_Result',
        label: 'Visible Area',
        outputType: 'Raster',
        renderMode: 'MapLayer',
      },
      {
        name: 'Viewshed_Polygon',
        label: 'Visible Polygon',
        outputType: 'FeatureSet',
        renderMode: 'MapLayer',
      },
    ],
  },

  // ── 3. Clip Features ───────────────────────────────────────────────────
  {
    toolId: 'gp_clip',
    meta: {
      name: 'Clip Features',
      description: 'Extracts features from one layer that fall within the boundary of another.',
      category: 'Overlay Analysis',
      icon: '✂️',
      tags: ['clip', 'extract', 'overlay'],
    },
    execution: {
      mode: 'arcgis',
      serviceUrl: '',      // Set your GP service URL here
      executionType: 'esriExecutionTypeSynchronous',
    },
    parameters: [
      {
        name: 'Input_Features',
        label: 'Input Layer',
        widgetType: 'LayerPicker',
        required: true,
        description: 'The layer to clip',
      },
      {
        name: 'Clip_Features',
        label: 'Clip Boundary',
        widgetType: 'LayerPicker',
        required: true,
        description: 'Boundary polygon layer',
      },
    ],
    outputs: [
      {
        name: 'Out_Feature_Class',
        label: 'Clipped Features',
        outputType: 'FeatureSet',
        renderMode: 'MapLayer',
      },
    ],
  },

  // ── 4. Summarize Within ────────────────────────────────────────────────
  {
    toolId: 'gp_summarize_within',
    meta: {
      name: 'Summarize Within',
      description: 'Calculates statistics for point/line features within each polygon.',
      category: 'Aggregation',
      icon: '📊',
      tags: ['summarize', 'aggregate', 'statistics'],
    },
    execution: {
      mode: 'arcgis',
      serviceUrl: '',
      executionType: 'esriExecutionTypeAsynchronous',
    },
    parameters: [
      {
        name: 'Sum_Within_Layer',
        label: 'Boundary Polygons',
        widgetType: 'LayerPicker',
        required: true,
      },
      {
        name: 'Summary_Layer',
        label: 'Features to Summarize',
        widgetType: 'LayerPicker',
        required: true,
      },
      {
        name: 'Field',
        label: 'Summary Field',
        widgetType: 'TextInput',
        required: false,
        description: 'Field name to aggregate',
      },
      {
        name: 'Statistics_Type',
        label: 'Statistic',
        widgetType: 'Select',
        required: false,
        defaultValue: 'Count',
        choiceList: ['Count', 'Sum', 'Min', 'Max', 'Mean', 'Std'],
      },
    ],
    outputs: [
      {
        name: 'Output_Layer',
        label: 'Summary Result',
        outputType: 'FeatureSet',
        renderMode: 'MapLayer',
      },
      {
        name: 'Group_Table',
        label: 'Summary Table',
        outputType: 'Table',
        renderMode: 'Table',
      },
    ],
  },

  // ── 5. Geocode Addresses (Custom REST) ────────────────────────────────
  {
    toolId: 'gp_geocode',
    meta: {
      name: 'Geocode Addresses',
      description: 'Geocodes a CSV of addresses and returns a point feature layer.',
      category: 'Geocoding',
      icon: '📍',
      tags: ['geocode', 'address', 'locate'],
    },
    execution: {
      mode: 'custom',
      customUrl: '/api/geocode',
      method: 'POST',
      outputMapper: (json) => [{ name: 'geocodedPoints', value: json.features || [] }],
    },
    parameters: [
      {
        name: 'addresses',
        label: 'Addresses (one per line)',
        widgetType: 'TextArea',
        required: true,
        description: 'Enter addresses, one per line',
      },
      {
        name: 'country',
        label: 'Country Code',
        widgetType: 'Select',
        required: false,
        defaultValue: 'BHR',
        choiceList: ['BHR', 'SAU', 'ARE', 'KWT', 'QAT', 'OMN'],
      },
    ],
    outputs: [
      {
        name: 'geocodedPoints',
        label: 'Geocoded Locations',
        outputType: 'FeatureSet',
        renderMode: 'MapLayer',
      },
    ],
  },
];

export default DEFAULT_MANIFESTS;
