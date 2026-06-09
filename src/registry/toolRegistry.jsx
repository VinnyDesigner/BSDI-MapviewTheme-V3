import React from 'react';

// Custom SVG Icons maintaining a single line-icon design language (strokeWidth="2", stroke="currentColor", outline style)
export const LayersIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

export const ClockIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

// Swipe tool (split) icon: clean rectangle with vertical line
export const SwipeIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M12 3v18" />
  </svg>
);

// Split View tool (split_view) icon: vertical line with left/right arrows, filled to a balanced width
export const LeftRightSplitIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M7 12H2" />
    <path d="m5 8-3 4 3 4" />
    <path d="M17 12h5" />
    <path d="m19 8 3 4-3 4" />
  </svg>
);

// Blend: overlapping circles sized and spaced to fill the bounding box with standard stroke width
export const BlendIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="9" cy="12" r="7" />
    <circle cx="15" cy="12" r="7" />
  </svg>
);

export const CurlyBracesIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
    <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
  </svg>
);

// Spatial Analysis: Magnifier + Analysis Chart (normalized and centered)
export const MagnifierChartIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="9.5" cy="9.5" r="7.5" />
    <path d="M6.5 12.5v-2.5" />
    <path d="M9.5 12.5v-5" />
    <path d="M12.5 12.5v-3" />
    <line x1="14.8" y1="14.8" x2="22" y2="22" />
  </svg>
);

// Geoprocessing: Gear + Location Marker (normalized and centered teardrop with ellipse base)
export const GearLocationMarkerIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <ellipse cx="12" cy="21.5" rx="7.5" ry="1.5" />
    <path d="M12 21c-4.5-4.5-7.5-8.5-7.5-11.5a7.5 7.5 0 1 1 15 0c0 3-3 7-7.5 11.5Z" />
    <circle cx="12" cy="9.5" r="2.2" />
    <path d="M12 4.5v1.2M12 12.8v1.2M7.2 9.5h1.2M15.6 9.5h1.2" />
  </svg>
);

// Advanced Query: Document Search
export const DocumentSearchIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8" />
    <path d="M20 12V8l-6-6" />
    <path d="M14 2v6h6" />
    <line x1="7" y1="7" x2="11" y2="7" />
    <line x1="7" y1="12" x2="11" y2="12" />
    <circle cx="16" cy="16" r="3" />
    <line x1="18.1" y1="18.1" x2="22" y2="22" />
  </svg>
);

// Data Request: Database + Check
export const DatabaseCheckIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <ellipse cx="10" cy="6" rx="6" ry="2.5" />
    <path d="M4 6v11c0 1.4 2.7 2.5 6 2.5c.8 0 1.6-.1 2.3-.2" />
    <path d="M4 11.5c0 1.4 2.7 2.5 6 2.5c1 0 1.9-.1 2.7-.4" />
    <path d="M16 6v5" />
    <line x1="6" y1="8.5" x2="8" y2="8.5" />
    <line x1="6" y1="14" x2="8" y2="14" />
    <circle cx="17" cy="17" r="4.5" />
    <polyline points="15 17 16.5 18.5 19 15" />
  </svg>
);

// Add Data: File Add
export const FileAddIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v5h5" />
    <path d="M12 11v6" />
    <path d="M9 14h6" />
  </svg>
);

// Project Data: Simple, immediately recognizable Folder icon
export const FolderIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

export const NavigationIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polygon points="3 11 22 2 13 21 11 13 3 11" />
  </svg>
);

// Measure: clean ruler-based icon, rotated horizontally inside rotation matrix to be perfectly centered.
export const RulerIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <g transform="rotate(-45 12 12)">
      <rect x="3" y="9" width="18" height="6" rx="1.5" />
      <line x1="7" y1="9" x2="7" y2="12" />
      <line x1="11" y1="9" x2="11" y2="12" />
      <line x1="15" y1="9" x2="15" y2="12" />
    </g>
  </svg>
);

export const PencilIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

export const PrinterIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <path d="M6 9V2h12v7" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
  </svg>
);

export const BookmarkIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  </svg>
);

export const InfoIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

export const SearchIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const BoxIcon = ({ size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

export const TOOL_REGISTRY = {
  layers: {
    id: 'layers',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: LayersIcon
  },
  time_compare: {
    id: 'time_compare',
    supportedModes: ['2d'],
    toolbar: true,
    icon: ClockIcon
  },
  split: {
    id: 'split',
    supportedModes: ['2d'],
    toolbar: true,
    icon: SwipeIcon
  },
  split_view: {
    id: 'split_view',
    supportedModes: ['2d'],
    toolbar: true,
    icon: LeftRightSplitIcon
  },
  blend: {
    id: 'blend',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: BlendIcon
  },
  arcade: {
    id: 'arcade',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: CurlyBracesIcon
  },
  spatial_analysis: {
    id: 'spatial_analysis',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: MagnifierChartIcon
  },
  navigation: {
    id: 'navigation',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: NavigationIcon
  },
  measure: {
    id: 'measure',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: RulerIcon
  },
  draw: {
    id: 'draw',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: PencilIcon
  },
  data_request: {
    id: 'data_request',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: DatabaseCheckIcon
  },
  add_data: {
    id: 'add_data',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: FileAddIcon
  },
  project_data: {
    id: 'project_data',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: FolderIcon
  },
  print: {
    id: 'print',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: PrinterIcon
  },
  bookmark: {
    id: 'bookmark',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: BookmarkIcon
  },
  identify: {
    id: 'identify',
    supportedModes: ['2d', '3d'],
    toolbar: false,
    icon: InfoIcon
  },
  geoprocessing: {
    id: 'geoprocessing',
    supportedModes: ['2d', '3d'],
    toolbar: false,
    icon: GearLocationMarkerIcon
  },
  advanced_query: {
    id: 'advanced_query',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: DocumentSearchIcon
  },
  search: {
    id: 'search',
    supportedModes: ['2d', '3d'],
    toolbar: false,
    icon: SearchIcon
  },
  cad: {
    id: 'cad',
    supportedModes: ['2d', '3d'],
    toolbar: false,
    icon: BoxIcon
  }
};

export const getToolsForMode = (mode) => {
  return Object.values(TOOL_REGISTRY).filter(t => t.supportedModes.includes(mode));
};

export const getToolMetadata = (toolId) => {
  return TOOL_REGISTRY[toolId] || null;
};
