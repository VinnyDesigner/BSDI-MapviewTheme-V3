export const map3dConfig = {
  ground: 'world-elevation',
  camera: {
    position: { x: 50.55, y: 26.15, z: 5000 },
    tilt: 65,
    heading: 0
  },
  ui: { components: [] },
  layers: [
    {
      type: 'scene',
      url: "https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer",
      title: "3D Buildings",
      id: "3d-buildings",
      opacity: 0.8
    }
  ]
};
