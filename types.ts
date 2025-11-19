
export enum ResolutionId {
  FHD_LANDSCAPE = 'FHD_landscape',
  FHD_PORTRAIT = 'FHD_portrait',
  SQUARE = 'Square',
  ULTRAWIDE = 'Ultrawide',
  FOUR_K = '4K'
}

export interface Resolution {
  id: ResolutionId;
  label: string;
  width: number;
  height: number;
}

export enum BlockType {
  HERO = 'hero_section',
  STATS = 'stats_tile',
  LIST = 'list_tile',
  METRIC = 'metric_card',
  IMAGE = 'image_card',
  CHART = 'analytics_panel',
  EMPTY = 'empty_slot'
}

export interface GridPosition {
  colStart: number; // 1-12 (or more)
  colSpan: number;
  rowStart: number;
  rowSpan: number;
}

export interface DashboardBlock {
  id: string;
  type: BlockType;
  title: string;
  position: GridPosition;
  color?: string;
  opacity?: number; // 0 to 1
  content?: string; // text content or image url
  parentBlockId?: string; // For nested blocks inside Hero
  heroProperties?: {
    stackDirection: 'horizontal' | 'vertical';
  };
}

export interface LayoutState {
  resolution: Resolution;
  blocks: DashboardBlock[];
  selectedBlockIds: string[];
  zoom: number;
  showGrid: boolean;
  isProcessingAI: boolean;
  isSidebarOpen: boolean;
  gridColumns: number; // Dynamic column count
  canvasBackgroundColor: string;
}

export interface DashboardProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: {
    resolution: Resolution;
    blocks: DashboardBlock[];
    gridColumns: number;
    canvasBackgroundColor?: string;
  }
}
