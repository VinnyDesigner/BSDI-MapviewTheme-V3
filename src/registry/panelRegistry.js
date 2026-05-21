// Re-export from .jsx file so JSX is parsed correctly by Vite.
// All existing imports of './panelRegistry' or '../registry/panelRegistry' continue to work.
export {
  SearchPanel,
  BasemapPanel,
  IdentifyPanel,
  BlendPanel,
  SpatialAnalysisPanel,
  SwipePanel,
  SplitViewPanel,
  PANEL_REGISTRY,
  getPanelComponent
} from './panelRegistry.jsx';
