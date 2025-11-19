
import React, { useState } from 'react';
import { Layout, Hash, Activity, List, BarChart, Image as ImageIcon, X, PlusCircle, Layers, Box, Trash2, CornerDownRight } from 'lucide-react';
import { COMPONENT_PALETTE } from '../constants';
import { BlockType, DashboardBlock } from '../types';

const iconMap: Record<string, React.ReactNode> = {
  Layout: <Layout size={20} />,
  Hash: <Hash size={20} />,
  Activity: <Activity size={20} />,
  List: <List size={20} />,
  BarChart: <BarChart size={20} />,
  Image: <ImageIcon size={20} />,
};

// Helper to get icon for a block instance
const getBlockIcon = (type: BlockType) => {
    const preset = COMPONENT_PALETTE.find(c => c.type === type);
    return preset ? iconMap[preset.icon] : <Box size={20} />;
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBlock: (type: BlockType) => void;
  blocks: DashboardBlock[];
  selectedBlockIds: string[];
  onSelectBlocks: (ids: string[]) => void;
  onDeleteBlocks: (ids: string[]) => void;
  onDragStart: (type: BlockType) => void;
  onDragEnd: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
    isOpen, 
    onClose, 
    onAddBlock,
    blocks,
    selectedBlockIds,
    onSelectBlocks,
    onDeleteBlocks,
    onDragStart,
    onDragEnd
}) => {
  const [activeTab, setActiveTab] = useState<'blocks' | 'layers'>('blocks');

  const handleDragStart = (e: React.DragEvent, type: BlockType) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type }));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart(type);
  };
  
  const handleDragEnd = () => {
      onDragEnd();
  };

  const handleLayerClick = (e: React.MouseEvent, blockId: string) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (selectedBlockIds.includes(blockId)) {
              onSelectBlocks(selectedBlockIds.filter(id => id !== blockId));
          } else {
              onSelectBlocks([...selectedBlockIds, blockId]);
          }
      } else {
          onSelectBlocks([blockId]);
      }
  };

  // Helper to render a block item with indentation
  const renderBlockListItem = (block: DashboardBlock, level = 0) => {
      const isSelected = selectedBlockIds.includes(block.id);
      
      return (
        <div 
            key={block.id}
            onClick={(e) => handleLayerClick(e, block.id)}
            className={`
                group flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all select-none mb-2
                ${isSelected
                    ? 'bg-brand-orange/5 border-brand-orange shadow-sm' 
                    : 'bg-white border-gray-100 hover:border-gray-300 hover:bg-gray-50'}
            `}
            style={{ marginLeft: level * 16 }}
        >
            {level > 0 && <CornerDownRight size={12} className="text-gray-300 -ml-1" />}
            <div className={`p-1.5 rounded-md ${isSelected ? 'bg-brand-orange text-white' : 'bg-gray-100 text-gray-500'}`}>
                {getBlockIcon(block.type)}
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isSelected ? 'text-brand-orange' : 'text-gray-700'}`}>
                    {block.title}
                </p>
                <p className="text-[10px] text-gray-400">
                    {block.type === BlockType.HERO 
                        ? `Hero Stack (${blocks.filter(b => b.parentBlockId === block.id).length})`
                        : `Linha ${block.position.rowStart} • Col ${block.position.colStart}`}
                </p>
            </div>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBlocks([block.id]);
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
            >
                <Trash2 size={14} />
            </button>
        </div>
      );
  };

  // Root blocks are those without a parent
  const rootBlocks = blocks.filter(b => !b.parentBlockId).reverse(); // Show top layers first

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`
          fixed md:static inset-y-0 left-0 z-40 flex-shrink-0
          w-72 bg-brand-cream border-r border-gray-200 flex flex-col h-full shadow-2xl md:shadow-none
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200/50 bg-white">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h1 className="text-xl font-bold text-brand-black tracking-tight">
                    Construtor
                    <span className="text-brand-orange">Dashboards</span>
                    </h1>
                    <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">Eletromidia DS v0.2</p>
                </div>
                <button onClick={onClose} className="md:hidden text-gray-500 hover:text-gray-900">
                    <X size={24} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex p-1 bg-gray-100 rounded-lg">
                <button
                    onClick={() => setActiveTab('blocks')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${
                        activeTab === 'blocks' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Box size={14} />
                    Blocos
                </button>
                <button
                    onClick={() => setActiveTab('layers')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${
                        activeTab === 'layers' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Layers size={14} />
                    Camadas
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4">
          
          {activeTab === 'blocks' ? (
              <>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 px-1">Biblioteca de Blocos</h2>
                <div className="space-y-3">
                    {COMPONENT_PALETTE.map((component) => (
                    <div
                        key={component.type}
                        draggable
                        onDragStart={(e) => handleDragStart(e, component.type)}
                        onDragEnd={handleDragEnd}
                        onClick={() => {
                            onAddBlock(component.type);
                            if (window.innerWidth < 768) onClose();
                        }}
                        className="group relative flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-brand-orange/50 cursor-grab active:cursor-grabbing transition-all duration-200 hover:-translate-y-0.5"
                    >
                        <div className="text-brand-orange group-hover:scale-110 transition-transform p-2 bg-brand-orange/5 rounded-lg">
                        {iconMap[component.icon]}
                        </div>
                        <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">{component.label}</p>
                        <p className="text-[10px] text-gray-400">
                            {component.defaultCols}x{component.defaultRows} Unidades de Grid
                        </p>
                        </div>
                        
                        {/* Hover Action */}
                        <div className="md:opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 bg-brand-cream p-1 rounded-md text-brand-orange">
                            <PlusCircle size={16} />
                        </div>
                    </div>
                    ))}
                </div>
                
                <div className="mt-8 p-4 bg-accent-purple/5 rounded-xl border border-accent-purple/10">
                    <h3 className="text-sm font-bold text-accent-purple mb-1">Sistema de Blocos</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                    Arraste blocos para o canvas. 
                    <br/><br/>
                    <strong>Seção Hero</strong> pode conter outros blocos aninhados. Arraste um bloco para dentro do Hero para agrupar.
                    </p>
                </div>
              </>
          ) : (
              <>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 px-1">
                    Camadas ({blocks.length})
                </h2>
                
                {blocks.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                        <Layers size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-xs">Nenhum bloco adicionado.</p>
                    </div>
                ) : (
                    <div>
                        {rootBlocks.map(root => {
                            const children = blocks.filter(b => b.parentBlockId === root.id);
                            return (
                                <React.Fragment key={root.id}>
                                    {renderBlockListItem(root, 0)}
                                    {children.map(child => renderBlockListItem(child, 1))}
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
              </>
          )}

        </div>
      </aside>
    </>
  );
};

export default Sidebar;
