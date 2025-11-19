
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import GridCanvas from './components/GridCanvas';
import Inspector from './components/Inspector';
import Toolbar from './components/Toolbar';
import ProjectManager from './components/ProjectManager';
import { LayoutState, Resolution, DashboardBlock, BlockType, DashboardProject } from './types';
import { RESOLUTIONS, COMPONENT_PALETTE, GRID_COLS, COLORS } from './constants';
import { reconstructLayoutFromImage } from './services/geminiService';
import { AlertTriangle, X } from 'lucide-react';

interface HistoryData {
  blocks: DashboardBlock[];
  resolution: Resolution;
  gridColumns: number;
  canvasBackgroundColor: string;
}

const App: React.FC = () => {
  // --- State ---
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [draggingBlockType, setDraggingBlockType] = useState<BlockType | null>(null);

  // Delete Modal State
  const [deleteModal, setDeleteModal] = useState<{
      isOpen: boolean;
      blockIds: string[];
  }>({ isOpen: false, blockIds: [] });
  const [dontShowDeleteConfirm, setDontShowDeleteConfirm] = useState(false);

  const [state, setState] = useState<LayoutState>({
    resolution: RESOLUTIONS[0],
    blocks: [],
    selectedBlockIds: [],
    zoom: 0.55,
    showGrid: true,
    isProcessingAI: false,
    isSidebarOpen: false,
    gridColumns: GRID_COLS,
    canvasBackgroundColor: '#F8F9FA'
  });

  // --- History State (Undo/Redo) ---
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [future, setFuture] = useState<HistoryData[]>([]);

  // --- Persistence & Init ---

  // Load Projects on Mount
  useEffect(() => {
    const saved = localStorage.getItem('eletromidia_projects');
    if (saved) {
      const parsed = JSON.parse(saved);
      setProjects(parsed);
      if (parsed.length > 0) {
          loadProject(parsed[0].id, parsed);
      }
    } else {
      createProject("Dashboard Sem Título");
    }

    const savedDeletePref = localStorage.getItem('eletromidia_delete_pref');
    if (savedDeletePref === 'true') {
        setDontShowDeleteConfirm(true);
    }
  }, []);

  // Save Projects when changed
  useEffect(() => {
    if (projects.length > 0) {
        localStorage.setItem('eletromidia_projects', JSON.stringify(projects));
    }
  }, [projects]);

  // Auto-Save Current State to Active Project
  useEffect(() => {
    if (!currentProjectId) return;

    setProjects(prev => prev.map(p => {
        if (p.id === currentProjectId) {
            return {
                ...p,
                updatedAt: Date.now(),
                data: {
                    resolution: state.resolution,
                    blocks: state.blocks,
                    gridColumns: state.gridColumns,
                    canvasBackgroundColor: state.canvasBackgroundColor
                }
            };
        }
        return p;
    }));
  }, [state.resolution, state.blocks, state.gridColumns, state.canvasBackgroundColor, currentProjectId]);


  // --- Undo / Redo Logic ---

  const saveCheckpoint = useCallback(() => {
    const currentData: HistoryData = {
      blocks: state.blocks,
      resolution: state.resolution,
      gridColumns: state.gridColumns,
      canvasBackgroundColor: state.canvasBackgroundColor
    };
    setHistory(prev => [...prev.slice(-19), currentData]); // Keep last 20 states
    setFuture([]); // Clear future on new action
  }, [state.blocks, state.resolution, state.gridColumns, state.canvasBackgroundColor]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    
    const previous = history[history.length - 1];
    const current: HistoryData = {
      blocks: state.blocks,
      resolution: state.resolution,
      gridColumns: state.gridColumns,
      canvasBackgroundColor: state.canvasBackgroundColor
    };
    
    setFuture(prev => [current, ...prev]);
    setHistory(prev => prev.slice(0, -1));
    
    setState(prev => ({
      ...prev,
      blocks: previous.blocks,
      resolution: previous.resolution,
      gridColumns: previous.gridColumns,
      canvasBackgroundColor: previous.canvasBackgroundColor
    }));
  }, [history, state.blocks, state.resolution, state.gridColumns, state.canvasBackgroundColor]);

  const redo = useCallback(() => {
    if (future.length === 0) return;

    const next = future[0];
    const current: HistoryData = {
      blocks: state.blocks,
      resolution: state.resolution,
      gridColumns: state.gridColumns,
      canvasBackgroundColor: state.canvasBackgroundColor
    };

    setHistory(prev => [...prev, current]);
    setFuture(prev => prev.slice(1));

    setState(prev => ({
      ...prev,
      blocks: next.blocks,
      resolution: next.resolution,
      gridColumns: next.gridColumns,
      canvasBackgroundColor: next.canvasBackgroundColor
    }));
  }, [future, state.blocks, state.resolution, state.gridColumns, state.canvasBackgroundColor]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Redo: Ctrl+Y / Cmd+Y / Ctrl+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        redo();
      }
      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
          const activeTag = document.activeElement?.tagName.toLowerCase();
          if (activeTag !== 'input' && activeTag !== 'textarea' && state.selectedBlockIds.length > 0) {
              requestDeleteBlocks(state.selectedBlockIds);
          }
      }
      // Select All: Ctrl+A
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          const activeTag = document.activeElement?.tagName.toLowerCase();
          if (activeTag !== 'input' && activeTag !== 'textarea') {
            e.preventDefault();
            handleSelectBlocks(state.blocks.map(b => b.id));
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, state.selectedBlockIds, state.blocks]);


  // --- Project Actions ---

  const createProject = (name: string) => {
    const newProject: DashboardProject = {
        id: crypto.randomUUID(),
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: {
            resolution: RESOLUTIONS[0],
            blocks: [],
            gridColumns: GRID_COLS,
            canvasBackgroundColor: '#F8F9FA'
        }
    };
    setProjects(prev => [newProject, ...prev]);
    loadProject(newProject.id, [newProject, ...projects]);
  };

  const loadProject = (id: string, currentProjects = projects) => {
    const project = currentProjects.find(p => p.id === id);
    if (project) {
        // Clear history when loading new project
        setHistory([]);
        setFuture([]);
        setCurrentProjectId(project.id);
        setState(prev => ({
            ...prev,
            resolution: project.data.resolution,
            blocks: project.data.blocks,
            gridColumns: project.data.gridColumns || GRID_COLS,
            canvasBackgroundColor: project.data.canvasBackgroundColor || '#F8F9FA',
            selectedBlockIds: []
        }));
    }
  };

  const deleteProject = (id: string) => {
    const newProjects = projects.filter(p => p.id !== id);
    setProjects(newProjects);
    
    if (id === currentProjectId) {
        if (newProjects.length > 0) {
            loadProject(newProjects[0].id, newProjects);
        } else {
            createProject("Dashboard Sem Título");
        }
    }
  };

  const renameProject = (id: string, newName: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  // --- Editor Actions ---

  const handleResolutionChange = (resolution: Resolution) => {
    saveCheckpoint();
    setState(prev => ({ ...prev, resolution }));
  };

  const handleUpdateBlocks = (blocks: DashboardBlock[]) => {
    setState(prev => ({ ...prev, blocks }));
  };

  const handleSelectBlocks = (ids: string[]) => {
    setState(prev => ({ ...prev, selectedBlockIds: ids }));
  };

  // Step 1: Request Delete
  const requestDeleteBlocks = (ids: string[]) => {
      // Check if any block has children
      const hasChildren = state.blocks.some(b => ids.includes(b.parentBlockId || ''));
      const hasHero = state.blocks.some(b => ids.includes(b.id) && b.type === BlockType.HERO);

      if ((hasChildren || hasHero) && !dontShowDeleteConfirm) {
          setDeleteModal({ isOpen: true, blockIds: ids });
      } else {
          performDelete(ids, true);
      }
  };

  // Step 2: Perform Delete
  const performDelete = (ids: string[], deleteChildren: boolean) => {
      saveCheckpoint();
      
      let newBlocks = state.blocks.filter(b => !ids.includes(b.id));
      
      if (deleteChildren) {
          // Recursive delete if we ever go deeper, but for now 1 level
          newBlocks = newBlocks.filter(b => !ids.includes(b.parentBlockId || ''));
      } else {
          // Unparent children
          newBlocks = newBlocks.map(b => {
              if (b.parentBlockId && ids.includes(b.parentBlockId)) {
                  return { ...b, parentBlockId: undefined };
              }
              return b;
          });
      }

      setState(prev => ({
          ...prev,
          blocks: newBlocks,
          selectedBlockIds: []
      }));
      setDeleteModal({ isOpen: false, blockIds: [] });
  };

  const confirmDelete = (deleteChildren: boolean) => {
      if (dontShowDeleteConfirm) {
          localStorage.setItem('eletromidia_delete_pref', 'true');
      }
      performDelete(deleteModal.blockIds, deleteChildren);
  };

  const handleGridColumnsChange = (cols: number) => {
    saveCheckpoint();
    setState(prev => ({ ...prev, gridColumns: cols }));
  }

  const handleUpdateCanvasBackground = (color: string) => {
    setState(prev => ({ ...prev, canvasBackgroundColor: color }));
  }

  const findFreeSlot = (currentBlocks: DashboardBlock[], cols: number, w: number, h: number, startRow = 1) => {
      let bestRow = startRow;
      let found = false;
      let resultCol = 1;

      for (let r = startRow; r < 200; r++) {
          for (let c = 1; c <= cols - w + 1; c++) {
              const hasOverlap = currentBlocks.some(b => {
                   if (b.parentBlockId) return false; // Ignore nested blocks for global free slot logic
                   
                   const colsOverlap = !(c + w <= b.position.colStart || c >= b.position.colStart + b.position.colSpan);
                   if (!colsOverlap) return false;

                   const bStart = b.position.rowStart;
                   const bEnd = b.position.rowStart + b.position.rowSpan - 1;
                   
                   return Math.max(r, bStart - 1) <= Math.min(r + h - 1, bEnd + 1);
              });

              if (!hasOverlap) {
                  bestRow = r;
                  resultCol = c;
                  found = true;
                  break;
              }
          }
          if (found) break;
      }

      if (!found) {
          const maxRow = currentBlocks.reduce((max, b) => Math.max(max, b.position.rowStart + b.position.rowSpan), 1);
          return { col: 1, row: maxRow + 1 };
      }

      return { col: resultCol, row: bestRow };
  };

  const handleAddBlock = (type: BlockType) => {
    saveCheckpoint();

    const preset = COMPONENT_PALETTE.find(c => c.type === type);
    const w = preset?.defaultCols || 4;
    const h = preset?.defaultRows || 6;
    
    const { col, row } = findFreeSlot(state.blocks, state.gridColumns, w, h);

    const newBlock: DashboardBlock = {
        id: `block-${Date.now()}`,
        type,
        title: preset?.label || 'Novo Bloco',
        position: {
            colStart: col,
            colSpan: w,
            rowStart: row,
            rowSpan: h
        },
        color: COLORS.brand.white,
        opacity: 1,
        ...(type === BlockType.HERO ? { heroProperties: { stackDirection: 'horizontal' } } : {})
    };

    setState(prev => ({
        ...prev,
        blocks: [...prev.blocks, newBlock],
        selectedBlockIds: [newBlock.id]
    }));
  };

  const handleDuplicateBlocks = () => {
      saveCheckpoint();
      const newBlocks: DashboardBlock[] = [];
      const newIds: string[] = [];

      state.selectedBlockIds.forEach(id => {
          const original = state.blocks.find(b => b.id === id);
          if (!original) return;

          const w = original.position.colSpan;
          const h = original.position.rowSpan;
          
          // Find free slot near original
          const { col, row } = findFreeSlot(state.blocks, state.gridColumns, w, h, original.position.rowStart);

          const newBlock: DashboardBlock = {
              ...original,
              id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: `${original.title} (Cópia)`,
              position: {
                  colStart: col,
                  colSpan: w,
                  rowStart: row,
                  rowSpan: h
              },
              parentBlockId: undefined // Duplicate to top level initially
          };
          
          newBlocks.push(newBlock);
          newIds.push(newBlock.id);
      });

      setState(prev => ({
          ...prev,
          blocks: [...prev.blocks, ...newBlocks],
          selectedBlockIds: newIds
      }));
  };

  const handleUpdateSelectedBlocks = (updates: Partial<DashboardBlock> | Partial<DashboardBlock['position']> | { heroProperties: any }) => {
    if (state.selectedBlockIds.length === 0) return;
    
    let updatedBlocks = state.blocks.map(block => {
      if (state.selectedBlockIds.includes(block.id)) {
        if ('position' in updates || 'colStart' in updates) { 
             const currentPos = block.position;
             const updatePos = (updates as any).position || {};
             const newPos = { ...currentPos, ...updatePos };
             const finalBlock = { ...block, ...updates, position: newPos };
             return finalBlock;
        }
        return { ...block, ...updates };
      }
      return block;
    });

    // Pass 2: Update children if parents moved via Inspector
    const originalParents = state.blocks.filter(b => state.selectedBlockIds.includes(b.id) && b.type === BlockType.HERO);
    
    if (originalParents.length > 0 && ('position' in updates || 'colStart' in updates)) {
         const newParents = updatedBlocks.filter(b => state.selectedBlockIds.includes(b.id) && b.type === BlockType.HERO);
         
         newParents.forEach(newP => {
             const oldP = originalParents.find(op => op.id === newP.id);
             if (oldP) {
                 const deltaCol = newP.position.colStart - oldP.position.colStart;
                 const deltaRow = newP.position.rowStart - oldP.position.rowStart;
                 
                 if (deltaCol !== 0 || deltaRow !== 0) {
                     updatedBlocks = updatedBlocks.map(b => {
                         if (b.parentBlockId === newP.id) {
                             return {
                                 ...b,
                                 position: {
                                     ...b.position,
                                     colStart: b.position.colStart + deltaCol,
                                     rowStart: b.position.rowStart + deltaRow
                                 }
                             };
                         }
                         return b;
                     });
                 }
             }
         });
    }
    
    // Force layout update if Stack Direction changes via Inspector
    if ('heroProperties' in updates) {
         const heroesToUpdate = updatedBlocks.filter(b => state.selectedBlockIds.includes(b.id) && b.type === BlockType.HERO);
         heroesToUpdate.forEach(hero => {
             const children = updatedBlocks.filter(b => b.parentBlockId === hero.id);
             if (hero.heroProperties) {
                  const { stackDirection } = hero.heroProperties;
                  const heroPos = hero.position;
                  
                  // Consistent Padding Logic
                  const padding = 2; // 1 each side
                  const minChildDim = 2;

                  // RESIZE HERO TO FIT CHILDREN if switching direction requires it
                  let newHeroColSpan = heroPos.colSpan;
                  let newHeroRowSpan = heroPos.rowSpan;

                  if (stackDirection === 'horizontal') {
                        // Switching TO Horizontal
                        // Ensure Height is at least 3
                        newHeroRowSpan = Math.max(3, newHeroRowSpan);
                        // Ensure Width fits all children side-by-side
                        const requiredWidth = (children.length * minChildDim) + padding;
                        newHeroColSpan = Math.max(5, requiredWidth, newHeroColSpan);
                  } else {
                        // Switching TO Vertical
                        // Ensure Width is at least 5
                        newHeroColSpan = Math.max(5, newHeroColSpan);
                        // Ensure Height fits all children stacked
                        const requiredHeight = (children.length * minChildDim) + padding;
                        newHeroRowSpan = Math.max(3, requiredHeight, newHeroRowSpan);
                  }

                  // Update Hero Dimensions in the array
                  updatedBlocks = updatedBlocks.map(b => {
                      if (b.id === hero.id) {
                          return {
                              ...b,
                              position: {
                                  ...b.position,
                                  colSpan: newHeroColSpan,
                                  rowSpan: newHeroRowSpan
                              }
                          };
                      }
                      return b;
                  });
                  
                  // Recalculate available space based on NEW dimensions
                  const startX = heroPos.colStart + 1; // +1 padding
                  const startY = heroPos.rowStart + 1; // +1 padding
                  const availableWidth = Math.max(1, newHeroColSpan - 2);
                  const availableHeight = Math.max(1, newHeroRowSpan - 2);

                  let currentX = startX; 
                  let currentY = startY;

                  // Sorting to maintain logical order
                  const sortedChildren = [...children].sort((a, b) => {
                        if (stackDirection === 'horizontal') return a.position.colStart - b.position.colStart;
                        return a.position.rowStart - b.position.rowStart;
                  });

                  // Calculations for even distribution
                  const count = children.length;
                  const baseWidth = Math.floor(availableWidth / count);
                  const remWidth = availableWidth % count;
                  const baseHeight = Math.floor(availableHeight / count);
                  const remHeight = availableHeight % count;

                  const positionedChildren = sortedChildren.map((child, idx) => {
                        const newPos = { ...child.position };
                        
                        if (stackDirection === 'vertical') {
                            // Vertical Stack: Stretch Width, Distribute Height
                            newPos.colStart = startX;
                            newPos.colSpan = availableWidth; 
                            
                            const childH = baseHeight + (idx < remHeight ? 1 : 0);
                            newPos.rowStart = currentY;
                            newPos.rowSpan = childH;
                            currentY += childH;
                        } else {
                            // Horizontal Stack: Stretch Height, Distribute Width
                            newPos.rowStart = startY;
                            newPos.rowSpan = availableHeight;
                            
                            const childW = baseWidth + (idx < remWidth ? 1 : 0);
                            newPos.colStart = currentX;
                            newPos.colSpan = childW;
                            currentX += childW;
                        }
                        return { ...child, position: newPos };
                  });
                  
                  updatedBlocks = updatedBlocks.map(b => {
                      const match = positionedChildren.find(c => c.id === b.id);
                      return match || b;
                  });
             }
         });
    }

    setState(prev => ({ ...prev, blocks: updatedBlocks }));
  };

  const handleImportLayout = async (base64Data: string) => {
    saveCheckpoint();
    setState(prev => ({ ...prev, isProcessingAI: true }));
    try {
      const reconstructedBlocks = await reconstructLayoutFromImage(base64Data);
      setState(prev => ({
        ...prev,
        blocks: [...prev.blocks, ...reconstructedBlocks],
        isProcessingAI: false
      }));
    } catch (error) {
      console.error(error);
      alert("Falha ao reconstruir o layout. Verifique sua chave de API.");
      setState(prev => ({ ...prev, isProcessingAI: false }));
    }
  };

  const handleExport = () => {
      const exportData = {
          meta: {
              resolution: state.resolution,
              gridColumns: state.gridColumns,
              canvasBackgroundColor: state.canvasBackgroundColor
          },
          blocks: state.blocks
      };
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'eletromidia-dashboard-layout.json';
      a.click();
  };

  const selectedBlocks = state.blocks.filter(b => state.selectedBlockIds.includes(b.id));
  const currentProject = projects.find(p => p.id === currentProjectId);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans text-gray-900 select-none [&_input]:select-text [&_textarea]:select-text">
      <Toolbar 
        currentResolution={state.resolution}
        zoom={state.zoom}
        onZoomChange={(z) => setState(prev => ({ ...prev, zoom: z }))}
        showGrid={state.showGrid}
        onToggleGrid={() => setState(prev => ({ ...prev, showGrid: !prev.showGrid }))}
        onImportLayout={handleImportLayout}
        isProcessing={state.isProcessingAI}
        onExport={handleExport}
        onToggleSidebar={() => setState(prev => ({ ...prev, isSidebarOpen: !prev.isSidebarOpen }))}
        onOpenProjectManager={() => setIsProjectManagerOpen(true)}
        currentProjectName={currentProject?.name || 'Sem Título'}
        canvasBackgroundColor={state.canvasBackgroundColor}
      />
      
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar 
            isOpen={state.isSidebarOpen} 
            onClose={() => setState(prev => ({ ...prev, isSidebarOpen: false }))}
            onAddBlock={handleAddBlock}
            blocks={state.blocks}
            selectedBlockIds={state.selectedBlockIds}
            onSelectBlocks={handleSelectBlocks}
            onDeleteBlocks={requestDeleteBlocks}
            onDragStart={(type) => setDraggingBlockType(type)}
            onDragEnd={() => setDraggingBlockType(null)}
        />
        
        <main className="flex-1 relative overflow-hidden flex flex-col">
          <GridCanvas 
            resolution={state.resolution}
            zoom={state.zoom}
            onZoomChange={(z) => setState(prev => ({ ...prev, zoom: z }))}
            showGrid={state.showGrid}
            blocks={state.blocks}
            onUpdateBlocks={handleUpdateBlocks}
            selectedBlockIds={state.selectedBlockIds}
            onSelectBlocks={handleSelectBlocks}
            gridColumns={state.gridColumns}
            canvasBackgroundColor={state.canvasBackgroundColor}
            onSaveCheckpoint={saveCheckpoint}
            draggingBlockType={draggingBlockType}
          />
          
          {state.isProcessingAI && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-brand-black text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 animate-bounce z-50">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                <span className="text-sm font-medium">Gemini está analisando...</span>
            </div>
          )}
        </main>

        <Inspector 
          selectedBlocks={selectedBlocks}
          onUpdateBlocks={handleUpdateSelectedBlocks}
          onDuplicateBlocks={handleDuplicateBlocks}
          onDeleteBlocks={() => requestDeleteBlocks(state.selectedBlockIds)}
          canvasBackgroundColor={state.canvasBackgroundColor}
          onUpdateCanvasBackground={handleUpdateCanvasBackground}
          currentResolution={state.resolution}
          onResolutionChange={handleResolutionChange}
          gridColumns={state.gridColumns}
          onGridColumnsChange={handleGridColumnsChange}
          onSaveCheckpoint={saveCheckpoint}
        />
      </div>

      <ProjectManager 
        isOpen={isProjectManagerOpen}
        onClose={() => setIsProjectManagerOpen(false)}
        projects={projects}
        currentProjectId={currentProjectId}
        onLoadProject={loadProject}
        onCreateProject={createProject}
        onDeleteProject={deleteProject}
        onRenameProject={renameProject}
      />

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
                  <div className="flex items-start gap-4 mb-4">
                      <div className="bg-red-100 p-2 rounded-full text-red-600">
                          <AlertTriangle size={24} />
                      </div>
                      <div>
                          <h3 className="text-lg font-bold text-gray-900">Excluir Blocos?</h3>
                          <p className="text-sm text-gray-500 mt-1">
                              Você selecionou blocos que contêm outros elementos dentro.
                          </p>
                      </div>
                  </div>

                  <div className="flex items-center gap-2 mb-6 ml-12">
                      <input 
                          type="checkbox" 
                          id="dontShowDelete"
                          checked={dontShowDeleteConfirm}
                          onChange={(e) => setDontShowDeleteConfirm(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                      />
                      <label htmlFor="dontShowDelete" className="text-xs text-gray-600 select-none cursor-pointer">
                          Não perguntar novamente
                      </label>
                  </div>

                  <div className="flex flex-col gap-2">
                      <button 
                          onClick={() => confirmDelete(true)}
                          className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition-colors"
                      >
                          Excluir tudo (incluindo filhos)
                      </button>
                      <button 
                          onClick={() => confirmDelete(false)}
                          className="w-full py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium text-sm transition-colors"
                      >
                          Excluir somente container (manter filhos)
                      </button>
                      <button 
                          onClick={() => setDeleteModal({ isOpen: false, blockIds: [] })}
                          className="w-full py-2 text-gray-400 hover:text-gray-600 text-sm transition-colors mt-1"
                      >
                          Cancelar
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
