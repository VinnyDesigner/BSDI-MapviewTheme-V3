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
      layerId: 'iga-soil-classification-2019',
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
      layerId: 'governorate-date',
      timeField: 'Updated_Year',
      currentYear: 2005,
      fromYear: 2000,
      toYear: 2005,
      startYear: 2000,
      endYear: 2005,
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
      layerId: 'governorate-date',
      expression: '// Write your Arcade expression\n$feature.Updated_Year',
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
