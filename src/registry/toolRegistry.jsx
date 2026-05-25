import React from 'react';
import { 
  Layers, Info, Navigation, Ruler, 
  Pencil, Box, Database, Globe, Printer, Bookmark,
  Columns2, Map, Blend, Cpu
} from 'lucide-react';

export const TOOL_REGISTRY = {
  layers: {
    id: 'layers',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: Layers
  },
  time_compare: {
    id: 'time_compare',
    supportedModes: ['2d'], // Timelapse is 2D only
    toolbar: true,
    icon: (props) => (
      <svg width={props.size || 18} height={props.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
        <path d="M16 12h-4V8" opacity="0.3"/>
        <path d="M12 2a10 10 0 0 1 10 10M12 22A10 10 0 0 1 2 12" strokeDasharray="4 2"/>
      </svg>
    )
  },
  split: {
    id: 'split',
    supportedModes: ['2d'], // Swipe maps is 2D only
    toolbar: true,
    icon: Columns2
  },
  split_view: {
    id: 'split_view',
    supportedModes: ['2d'], // Split screen is 2D only
    toolbar: true,
    icon: Map
  },
  blend: {
    id: 'blend',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: (props) => (
      <svg width={props.size || 22} height={props.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="8" cy="12" r="7" />
        <circle cx="16" cy="12" r="7" />
      </svg>
    )
  },
  arcade: {
    id: 'arcade',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: (props) => (
      <svg width={props.size || 18} height={props.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" />
      </svg>
    )
  },
  spatial_analysis: {
    id: 'spatial_analysis',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: (props) => (
      <svg width={props.size || 18} height={props.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
      </svg>
    )
  },
  navigation: {
    id: 'navigation',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: Navigation
  },
  measure: {
    id: 'measure',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: Ruler
  },
  draw: {
    id: 'draw',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: Pencil
  },
  data_request: {
    id: 'data_request',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: Database
  },
  add_data: {
    id: 'add_data',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: Globe
  },
  print: {
    id: 'print',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: Printer
  },
  bookmark: {
    id: 'bookmark',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: Bookmark
  },
  identify: {
    id: 'identify',
    supportedModes: ['2d', '3d'],
    toolbar: false, // Background query tool
    icon: Info
  },
  geoprocessing: {
    id: 'geoprocessing',
    supportedModes: ['2d', '3d'],
    toolbar: true,
    icon: Cpu
  }
};

export const getToolsForMode = (mode) => {
  return Object.values(TOOL_REGISTRY).filter(t => t.supportedModes.includes(mode));
};

export const getToolMetadata = (toolId) => {
  return TOOL_REGISTRY[toolId] || null;
};
