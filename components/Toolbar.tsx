import React, { useRef } from 'react';
import { Download, Grid, Sparkles, ZoomIn, ZoomOut, Menu, FolderOpen, ImageDown } from 'lucide-react';
import { toPng } from 'html-to-image';
import { Resolution } from '../types';

interface ToolbarProps {
  currentResolution: Resolution;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  onImportLayout: (image: string) => void;
  isProcessing: boolean;
  onExport: () => void;
  onToggleSidebar: () => void;
  onOpenProjectManager: () => void;
  currentProjectName: string;
  canvasBackgroundColor?: string;
}

const Toolbar: React.FC<ToolbarProps> = ({
  currentResolution,
  zoom,
  onZoomChange,
  showGrid,
  onToggleGrid,
  onImportLayout,
  isProcessing,
  onExport,
  onToggleSidebar,
  onOpenProjectManager,
  currentProjectName,
  canvasBackgroundColor
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1]; // Remove data URL prefix
        onImportLayout(base64Data);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExportPng = async () => {
      const node = document.getElementById('canvas-export-area');
      if (!node) return;

      try {
          const dataUrl = await toPng(node, {
              cacheBust: true,
              pixelRatio: 3, // Higher pixel ratio to ensure shadows render correctly without banding
              quality: 1.0,
              filter: (child) => {
                  // Filter out elements with specific classes (grid lines, selection handles, etc)
                  if (child.classList) {
                      if (child.classList.contains('ui-helper') || child.classList.contains('export-exclude-content')) {
                          return false;
                      }
                  }
                  return true;
              },
              // Explicitly set the background color of the exported image to match the canvas
              // This prevents transparency issues where shadows might look glitchy against a transparent background
              backgroundColor: canvasBackgroundColor || '#E1E1E1' 
          });
          
          const link = document.createElement('a');
          link.download = `${currentProjectName || 'dashboard'}.png`;
          link.href = dataUrl;
          link.click();
      } catch (err) {
          console.error('Could not export PNG', err);
      }
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 shadow-sm z-30 relative">
      <div className="flex items-center gap-4">
        <button 
            onClick={onToggleSidebar}
            className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
            <Menu size={20} />
        </button>

        <button
            onClick={onOpenProjectManager}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-800 transition-colors"
            title="Meus Dashboards"
        >
            <FolderOpen size={16} className="text-brand-orange" />
            <span className="max-w-[100px] truncate hidden md:inline">{currentProjectName}</span>
        </button>

        <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block" />

        {/* Resolution Info Display (Read Only in Toolbar now) */}
        <div className="hidden md:flex items-center px-2 py-1 text-xs font-medium text-gray-500 bg-gray-50 rounded-md border border-gray-100">
           {currentResolution.label}
        </div>
        
        <div className="hidden md:block h-6 w-px bg-gray-200 mx-2" />

        <div className="hidden md:flex items-center gap-2">
            <button 
                onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
                title="Zoom Out (Ctrl -)"
            >
                <ZoomOut size={18} />
            </button>
            <span className="text-sm font-medium w-12 text-center text-gray-700">{(zoom * 100).toFixed(0)}%</span>
            <button 
                onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
                title="Zoom In (Ctrl +)"
            >
                <ZoomIn size={18} />
            </button>
        </div>
        
        <button
          onClick={onToggleGrid}
          className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
            showGrid 
            ? 'bg-brand-orange/10 border-brand-orange text-brand-orange' 
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
          title="Alternar Grid"
        >
          <Grid size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <div className="relative">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/png, image/jpeg" 
                onChange={handleFileUpload}
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-accent-purple text-white rounded-full text-sm font-medium hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-purple/20"
            >
                {isProcessing ? (
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                    <Sparkles size={16} />
                )}
                <span className="hidden md:inline">Reconstruir (IA)</span>
                <span className="md:hidden">IA</span>
            </button>
        </div>

        <div className="flex items-center border border-gray-200 rounded-full p-0.5 bg-white">
            <button 
                onClick={handleExportPng}
                className="p-2 text-gray-600 hover:text-brand-black hover:bg-gray-100 rounded-full transition-colors"
                title="Exportar PNG (Sem Interface)"
            >
                <ImageDown size={18} />
            </button>
            <div className="w-px h-4 bg-gray-200 mx-1"></div>
            <button 
                onClick={onExport}
                className="p-2 text-gray-600 hover:text-brand-black hover:bg-gray-100 rounded-full transition-colors"
                title="Exportar JSON"
            >
                <Download size={18} />
            </button>
        </div>
      </div>
    </header>
  );
};

export default Toolbar;