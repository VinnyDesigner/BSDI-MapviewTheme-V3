export const toolsConfig = {
  blend: {
    defaults: {
      baseLayerId: 'streets',
      overlayLayerId: null,
      opacity: 0.5,
      blendMode: 'multiply'
    }
  },
  spatial: {
    defaults: {
      subTool: 'Buffer Analysis',
      layerId: 'sample-data-1',
      bufferDistance: 100,
      bufferUnit: 'meters',
      isWaitingForClick: false,
      status: '',
      lastRun: null,
      distanceResult: null
    },
    subTools: [
      "Buffer Analysis",
      "Select by Location",
      "Overlay (Intersect)",
      "Proximity (Nearest)",
      "Heatmap Density"
    ],
    units: [
      { label: 'm', value: 'meters' },
      { label: 'km', value: 'kilometers' },
      { label: 'mi', value: 'miles' }
    ]
  },
  timelapse: {
    defaults: {
      layerId: 'sample-data-1',
      timeField: 'SURVEY_YEAR',
      currentYear: 2024,
      fromYear: 2018,
      toYear: 2024,
      startYear: 2018,
      endYear: 2024,
      isPlaying: false,
      speed: 'Medium',
      loop: true,
      mode: 'range',
      playbackInterval: 'Yearly',
      lastApply: 0
    }
  },
  arcade: {
    defaults: {
      layerId: 'gov-time-date',
      expression: '// Write your Arcade expression\n$feature.date',
      preview: '',
      debugInfo: ''
    }
  },
  identify: {
    defaults: {
      mode: 'point', // 'point' | 'rectangle' | 'polygon'
      selectedLayerId: 'all',
      results: null,
      isQuerying: false
    }
  }
};
