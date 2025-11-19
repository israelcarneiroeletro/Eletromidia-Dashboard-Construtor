import React, { useRef, useState } from 'react';
import { Download, Grid, Sparkles, ZoomIn, ZoomOut, Menu, FolderOpen, ImageDown, ChevronDown, FileJson, Palette, FileImage } from 'lucide-react';
import { toPng } from 'html-to-image';
import { Resolution } from '../types';
import { COLORS } from '../constants';

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
  const [showExportMenu, setShowExportMenu] = useState(false);

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

  const handleExportPng = async (cleanMode = false) => {
      const node = document.getElementById('canvas-export-area');
      if (!node) return;
      
      // Add class for clean mode if requested
      if (cleanMode) node.classList.add('clean-export-mode');

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
          link.download = `${currentProjectName || 'dashboard'}${cleanMode ? '-template' : ''}.png`;
          link.href = dataUrl;
          link.click();
      } catch (err) {
          console.error('Could not export PNG', err);
      } finally {
          if (cleanMode) node.classList.remove('clean-export-mode');
          setShowExportMenu(false);
      }
  };

  const handleExportPowerBITheme = () => {
    const theme = {
        name: "Eletromidia Design System",
        dataColors: [
            COLORS.brand.orange,
            COLORS.accent.purple,
            COLORS.accent.yellow,
            COLORS.accent.green,
            COLORS.accent.pink,
            COLORS.brand.black
        ],
        background: "#FFFFFF",
        foreground: "#000000",
        tableAccent: COLORS.brand.orange,
        visualStyles: {
            "*": {
                "*": {
                    background: [{ color: { solid: { color: "#FFFFFF" } } }],
                }
            }
        }
    };
    
    const json = JSON.stringify(theme, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eletromidia-powerbi-theme.json';
    a.click();
    setShowExportMenu(false);
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 shadow-sm z-30 relative">
      <div className="flex items-center gap-4">
        <button 
            onClick={onToggleSidebar}
            className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-2xl"
        >
            <Menu size={20} />
        </button>

        <button
            onClick={onOpenProjectManager}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-2xl text-sm font-bold text-gray-800 transition-colors"
            title="Meus Dashboards"
        >
            <FolderOpen size={16} className="text-brand-orange" />
            <span className="max-w-[100px] truncate hidden md:inline">{currentProjectName}</span>
        </button>

        <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block" />

        {/* Resolution Info Display (Read Only in Toolbar now) */}
        <div className="hidden md:flex items-center px-3 py-1 text-xs font-medium text-gray-500 bg-gray-50 rounded-2xl border border-gray-100">
           {currentResolution.label}
        </div>
        
        <div className="hidden md:block h-6 w-px bg-gray-200 mx-2" />

        <div className="hidden md:flex items-center gap-2">
            <button 
                onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))}
                className="p-2 hover:bg-gray-100 rounded-2xl text-gray-600"
                title="Zoom Out (Ctrl -)"
            >
                <ZoomOut size={18} />
            </button>
            <span className="text-sm font-medium w-12 text-center text-gray-700">{(zoom * 100).toFixed(0)}%</span>
            <button 
                onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}
                className="p-2 hover:bg-gray-100 rounded-2xl text-gray-600"
                title="Zoom In (Ctrl +)"
            >
                <ZoomIn size={18} />
            </button>
        </div>
        
        <button
          onClick={onToggleGrid}
          className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-2xl border text-sm font-medium transition-colors ${
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
                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-accent-purple text-white rounded-2xl text-sm font-medium hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-purple/20"
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

        {/* Export Menu */}
        <div className="relative">
            <button 
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:text-brand-black hover:bg-gray-100 rounded-2xl transition-colors border border-gray-200 bg-white"
            >
                <Download size={18} />
                <span className="text-sm font-medium hidden md:inline">Exportar</span>
                <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            
            {showExportMenu && (
                <>
                    <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowExportMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-3xl shadow-xl border border-gray-200 py-2 z-50 flex flex-col animate-in fade-in zoom-in-95 duration-100">
                        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Projeto
                        </div>
                        <button 
                            onClick={() => { onExport(); setShowExportMenu(false); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-3"
                        >
                            <FileJson size={16} className="text-gray-400" />
                            <div>
                                <span className="font-medium">JSON do Projeto</span>
                                <p className="text-[10px] text-gray-500">Salvar estrutura editável</p>
                            </div>
                        </button>

                        <div className="my-1 border-t border-gray-100" />

                        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Imagens
                        </div>
                        <button 
                            onClick={() => handleExportPng(false)}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-3"
                        >
                            <ImageDown size={16} className="text-gray-400" />
                            <div>
                                <span className="font-medium">Imagem (PNG)</span>
                                <p className="text-[10px] text-gray-500">Screenshot atual do canvas</p>
                            </div>
                        </button>
                        <button 
                            onClick={() => handleExportPng(true)}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-3"
                        >
                            <FileImage size={16} className="text-brand-orange" />
                            <div>
                                <span className="font-medium text-brand-orange">Template (PNG Limpo)</span>
                                <p className="text-[10px] text-gray-500">Fundo para Power BI (Mantém Imagens)</p>
                            </div>
                        </button>

                        <div className="my-1 border-t border-gray-100" />

                        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Integração
                        </div>
                        <button 
                            onClick={handleExportPowerBITheme}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-3"
                        >
                            <Palette size={16} className="text-accent-yellow" />
                            <div>
                                <span className="font-medium">Tema Power BI</span>
                                <p className="text-[10px] text-gray-500">Paleta de cores JSON</p>
                            </div>
                        </button>
                    </div>
                </>
            )}
        </div>
      </div>
    </header>
  );
};

export default Toolbar;