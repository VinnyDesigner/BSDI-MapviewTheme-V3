export const ewaWddTree = {
  id: 'ewa-wdd',
  title: 'EWA Water Distribution (WDD)',
  dataset: 'WaterDistributionDataset',
  categories: [
    {
      title: 'SystemValve',
      geometry: 'point',
      features: ['BallFloat', 'Butterfly', 'NonReturnFlapDouble', 'NonReturnFlapSingleAction', 'NonReturnSwing', 'Sluice', 'Washout']
    },
    {
      title: 'AirValve',
      geometry: 'point',
      features: ['Air Vacuum', 'Double Orifice', 'Single Orifice', 'Threaded Air Valve']
    },
    {
      title: 'ServiceValve',
      geometry: 'point',
      features: ['Ball Valve', 'Float Valve', 'Gate Valve', 'Non Return Valve', 'Stop Cock']
    },
    {
      title: 'Fitting',
      geometry: 'point',
      features: ['Tee', 'Blank Saddle', 'Horizontal Bend', 'Vertical Bend', 'End Cap', 'Blank Flange', 'Puddle Flange', 'Hydrant Duck Foot', 'Flange Adapter', 'Service Bend', 'Reducer', 'Tap']
    },
    {
      title: 'WServicePoint',
      geometry: 'point',
      features: ['Service Point', 'Bulk Service Point']
    },
    {
      title: 'Meter',
      geometry: 'point',
      features: ['District', 'Measurement Point', 'Pump Station', 'Tank Zone', 'Tanker Filling Station', 'Waste Zone']
    },
    {
      title: 'CasingProtection',
      geometry: 'line',
      features: ['Access Tunnel', 'Casement', 'Duct', 'GeoTextile', 'Protective Tunnel', 'Slab', 'Sleeve']
    },
    {
      title: 'ServicePipe',
      geometry: 'line',
      features: ['Active', 'Proposed']
    },
    {
      title: 'MainPipe',
      geometry: 'line',
      features: ['Active', 'Proposed', 'Temporary', 'Under Construction', 'StandBy', 'Abandoned', 'Removed']
    },
    {
      title: 'Chamber',
      geometry: 'point',
      features: []
    },
    {
      title: 'WaterStructure',
      geometry: 'polygon',
      features: ['Desalination Plant', 'Pump Station']
    }
  ]
};
