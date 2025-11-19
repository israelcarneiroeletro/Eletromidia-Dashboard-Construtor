import { BlockType, Resolution, ResolutionId } from './types';

export const RESOLUTIONS: Resolution[] = [
  { id: ResolutionId.FHD_LANDSCAPE, label: 'Full HD (16:9)', width: 1920, height: 1080 },
  { id: ResolutionId.FHD_PORTRAIT, label: 'Retrato (9:16)', width: 1080, height: 1920 },
  { id: ResolutionId.SQUARE, label: 'Quadrado (1:1)', width: 1080, height: 1080 },
  { id: ResolutionId.ULTRAWIDE, label: 'Ultrawide (21:9)', width: 3440, height: 1440 },
  { id: ResolutionId.FOUR_K, label: '4K (16:9)', width: 3840, height: 2160 },
];

export const COMPONENT_PALETTE = [
  { type: BlockType.HERO, label: 'Seção Hero', defaultCols: 12, defaultRows: 10, icon: 'Layout' },
  { type: BlockType.STATS, label: 'Card de Estatística', defaultCols: 3, defaultRows: 6, icon: 'Hash' },
  { type: BlockType.METRIC, label: 'Bloco de Métrica', defaultCols: 4, defaultRows: 6, icon: 'Activity' },
  { type: BlockType.LIST, label: 'Lista', defaultCols: 4, defaultRows: 8, icon: 'List' },
  { type: BlockType.CHART, label: 'Painel Analítico', defaultCols: 6, defaultRows: 10, icon: 'BarChart' },
  { type: BlockType.IMAGE, label: 'Mídia / Imagem', defaultCols: 6, defaultRows: 8, icon: 'Image' },
];

export const COLORS = {
  brand: {
    orange: '#FF4F00',
    black: '#000000',
    white: '#FFFFFF',
    cream: '#F9F2E7',
  },
  accent: {
    purple: '#4E18FF',
    yellow: '#FECC14',
    pink: '#F577ED',
    green: '#3D7700',
  }
};

export const GRID_COLS = 12;
export const COLUMN_OPTIONS = [12, 16, 24];
export const MARGIN_PX = 80;
export const GUTTER_PX = 24;
export const BASE_UNIT = 4;
export const ROW_HEIGHT = 30;