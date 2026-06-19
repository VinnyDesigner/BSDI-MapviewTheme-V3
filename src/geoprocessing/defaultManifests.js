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
      mode: 'client',
      serviceUrl: '',
      executionType: 'esriExecutionTypeSynchronous',
    },
    parameters: [
      {
        name: 'Input_Features',
        label: 'Input Features',
        widgetType: 'LayerPicker',
        required: true,
        description: 'Select the layer to buffer (operational, uploaded, or geoprocessing results)',
      },
      {
        name: 'Output_Layer_Name',
        label: 'Output Layer Name',
        widgetType: 'TextInput',
        required: false,
        defaultValue: '',
        description: 'Provide an output name or leave blank for a default auto-generated name',
      },
      {
        name: 'Distance',
        label: 'Buffer Distance',
        widgetType: 'NumberInput',
        required: true,
        description: 'Distance to buffer around features',
        min: 0.0001,
      },
      {
        name: 'Unit',
        label: 'Distance Unit',
        widgetType: 'Select',
        required: true,
        choiceList: ['meters', 'kilometers', 'feet', 'miles', 'nautical-miles'],
      },
      {
        name: 'Method',
        label: 'Method',
        widgetType: 'Select',
        required: true,
        choiceList: ['geodesic', 'planar'],
      },
      {
        name: 'Dissolve_Type',
        label: 'Dissolve Type',
        widgetType: 'Select',
        required: true,
        choiceList: ['none', 'all', 'by-field'],
      },
      {
        name: 'Dissolve_Field',
        label: 'Dissolve Field',
        widgetType: 'Select',
        required: false,
        defaultValue: '',
        choiceList: [],
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
      description: 'Determines visible and non-visible zones from observer points based on height, terrain, and obstacles.',
      category: '3D Analysis',
      icon: '👁️',
      tags: ['viewshed', 'visibility', '3D', 'terrain', 'observer'],
    },
    execution: {
      mode: 'client',
      serviceUrl: '',
      executionType: 'esriExecutionTypeSynchronous',
    },
    parameters: [
      {
        name: 'Input_Observation_Point',
        label: 'Observer Point Layer',
        widgetType: 'LayerPicker',
        required: true,
        description: 'Select the point layer representing observer locations (operational, uploaded, or GP results)',
      },
      {
        name: 'Output_Layer_Name',
        label: 'Output Layer Name',
        widgetType: 'TextInput',
        required: false,
        defaultValue: '',
        description: 'Provide an output name or leave blank for a default auto-generated name',
      },
      {
        name: 'Observer_Height',
        label: 'Observer Height',
        widgetType: 'NumberInput',
        required: true,
        description: 'Height of observer above the ground level',
        min: 0,
      },
      {
        name: 'Observer_Height_Unit',
        label: 'Observer Height Unit',
        widgetType: 'Select',
        required: true,
        choiceList: ['meters', 'feet'],
      },
      {
        name: 'Target_Height',
        label: 'Target Height',
        widgetType: 'NumberInput',
        required: true,
        description: 'Height of target objects above the ground level',
        min: 0,
      },
      {
        name: 'Target_Height_Unit',
        label: 'Target Height Unit',
        widgetType: 'Select',
        required: true,
        choiceList: ['meters', 'feet'],
      },
      {
        name: 'Min_Distance',
        label: 'Minimum Distance',
        widgetType: 'NumberInput',
        required: false,
        description: 'Minimum observation distance (inner radius bounds)',
        min: 0,
      },
      {
        name: 'Max_Distance',
        label: 'Maximum Distance',
        widgetType: 'NumberInput',
        required: true,
        description: 'Maximum observation distance (outer radius bounds)',
        min: 0.001,
      },
      {
        name: 'Distance_Unit',
        label: 'Distance Unit',
        widgetType: 'Select',
        required: true,
        choiceList: ['meters', 'kilometers', 'feet', 'miles'],
      },
      {
        name: 'Horizontal_Angle',
        label: 'Horizontal Angle (deg)',
        widgetType: 'NumberInput',
        required: true,
        description: 'Observer horizontal field of vision in degrees (1° to 360°)',
        min: 1,
        max: 360,
      },
      {
        name: 'Vertical_Angle',
        label: 'Vertical Angle (deg)',
        widgetType: 'NumberInput',
        required: true,
        description: 'Observer vertical field of vision in degrees (1° to 180°)',
        min: 1,
        max: 180,
      },
      {
        name: 'Method',
        label: 'Analysis Method',
        widgetType: 'Select',
        required: true,
        choiceList: ['geodesic', 'planar'],
      },
    ],
    outputs: [
      {
        name: 'Viewshed_Result',
        label: 'Viewshed Result',
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
      mode: 'client',
      serviceUrl: '',
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
      {
        name: 'Output_Layer_Name',
        label: 'Output Layer Name',
        widgetType: 'String',
        required: false,
        description: 'Enter output layer name',
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
      mode: 'client',
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
        choiceList: ['Count', 'Sum', 'Average', 'Minimum', 'Maximum'],
      },
      {
        name: 'Output_Layer_Name',
        label: 'Output Layer Name',
        widgetType: 'String',
        required: false,
        description: 'Enter output layer name',
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
      mode: 'client',
      serviceUrl: '',
      executionType: 'esriExecutionTypeSynchronous',
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
        choiceList: ['BHR', 'SAU', 'ARE', 'KWT', 'QAT', 'OMN'],
      },
      {
        name: 'Output_Layer_Name',
        label: 'Output Layer Name',
        widgetType: 'String',
        required: false,
        description: 'Enter output layer name',
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

  // ── 6. Heatmap Density ───────────────────────────────────────────────
  {
    toolId: 'gp_heatmap_density',
    meta: {
      name: 'Heatmap Density',
      description: 'Calculates density-based rendering of point features.',
      category: 'Visualization',
      icon: '🔥',
      tags: ['heatmap', 'density', 'points'],
    },
    execution: {
      mode: 'client',
      serviceUrl: '',
      executionType: 'esriExecutionTypeAsynchronous',
    },
    parameters: [
      {
        name: 'Input_Points',
        label: 'Input Point Layer',
        widgetType: 'LayerPicker',
        required: true,
      },
      {
        name: 'Radius',
        label: 'Heatmap Radius',
        widgetType: 'NumberInput',
        required: false,
        defaultValue: 25,
        min: 1,
        max: 100,
        description: 'Radius of influence (pixels)',
      },
      {
        name: 'Intensity',
        label: 'Intensity',
        widgetType: 'NumberInput',
        required: false,
        defaultValue: 100,
        min: 1,
        max: 1000,
        description: 'Maximum intensity value',
      },
      {
        name: 'Color_Ramp',
        label: 'Color Ramp',
        widgetType: 'Select',
        required: false,
        defaultValue: 'Blue to Red',
        choiceList: ['Blue to Red', 'Purple to Yellow'],
      },
      {
        name: 'Density_Method',
        label: 'Density Method',
        widgetType: 'Select',
        required: false,
        defaultValue: 'Kernel Density',
        choiceList: ['Kernel Density', 'Simple Density'],
      },
    ],
    outputs: [
      {
        name: 'Output_Layer',
        label: 'Heatmap Layer',
        outputType: 'FeatureSet',
        renderMode: 'MapLayer',
      },
    ],
  },
];

export default DEFAULT_MANIFESTS;
