
import React, { useState } from 'react';
import { DashboardBlock, BlockType, Resolution } from '../types';
import { COLORS, RESOLUTIONS, COLUMN_OPTIONS, COMPONENT_PALETTE } from '../constants'; 
import { Type, Palette, Move, Sliders, ChevronUp, ChevronDown, Copy, Droplet, Monitor, Smartphone, Columns, Layers, LayoutTemplate, ArrowRight, ArrowDown, Trash2 } from 'lucide-react';

interface InspectorProps {
  selectedBlocks: DashboardBlock[];
  onUpdateBlocks: (updates: Partial<DashboardBlock> | Partial<DashboardBlock['position']> | { heroProperties: any }) => void;
  onDuplicateBlocks: () => void;
  onDeleteBlocks: () => void;
  canvasBackgroundColor: string;
  onUpdateCanvasBackground: (color: string) => void;
  currentResolution: Resolution;
  onResolutionChange: (res: Resolution) => void;
  gridColumns: number;
  onGridColumnsChange: (cols: number) => void;
  onSaveCheckpoint: () => void;
}

const Inspector: React.FC<InspectorProps> = ({ 
    selectedBlocks, 
    onUpdateBlocks, 
    onDuplicateBlocks,
    onDeleteBlocks,
    canvasBackgroundColor,
    onUpdateCanvasBackground,
    currentResolution,
    onResolutionChange,
    gridColumns,
    onGridColumnsChange,
    onSaveCheckpoint
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Global Settings (No Selection)
  if (selectedBlocks.length === 0) {
    return (
      <aside className="hidden lg:flex w-80 bg-white border-l border-gray-200 p-8 flex-col h-full overflow-y-auto">
         <div className="mb-8 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 mx-auto">
                <Move className="text-gray-300" size={32} />
            </div>
            <h3 className="text-gray-900 font-bold mb-2">Nenhum Bloco Selecionado</h3>
            <p className="text-sm text-gray-500">Selecione blocos no canvas para editar ou arraste para selecionar múltiplos.</p>
         </div>

         <div className="border-t border-gray-100 pt-8 w-full space-y-6">
             <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Palette size={14} /> Configurações do Canvas
             </h3>
             
             <div className="space-y-2">
                 <label className="block text-sm font-medium text-gray-700">Resolução / Proporção</label>
                 <div className="grid grid-cols-1 gap-2">
                    {RESOLUTIONS.map((res) => (
                        <button
                            key={res.id}
                            onClick={() => onResolutionChange(res)}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition-all ${
                                currentResolution.id === res.id 
                                ? 'bg-brand-orange/5 border-brand-orange text-brand-orange' 
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {res.id.includes('landscape') || res.id.includes('Ultrawide') || res.id.includes('4K') ? <Monitor size={16} /> : <Smartphone size={16} />}
                            <span>{res.label}</span>
                        </button>
                    ))}
                 </div>
             </div>

             <div className="space-y-2">
                 <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Columns size={14} /> Colunas do Grid
                 </label>
                 <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
                    {COLUMN_OPTIONS.map(cols => (
                        <button 
                            key={cols} 
                            onClick={() => onGridColumnsChange(cols)}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                                gridColumns === cols 
                                ? 'bg-white text-gray-900 shadow-sm border border-gray-100' 
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {cols} Cols
                        </button>
                    ))}
                 </div>
             </div>

             <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">Cor de Fundo</label>
                 <div className="flex items-center gap-3">
                     <div 
                        className="relative w-10 h-10 rounded-lg overflow-hidden border border-gray-200 shadow-sm cursor-pointer"
                        onClick={onSaveCheckpoint}
                     >
                        <input 
                            type="color" 
                            value={canvasBackgroundColor}
                            onChange={(e) => onUpdateCanvasBackground(e.target.value)}
                            className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer p-0 border-0"
                        />
                     </div>
                     <input 
                         type="text"
                         value={canvasBackgroundColor}
                         onFocus={onSaveCheckpoint}
                         onChange={(e) => onUpdateCanvasBackground(e.target.value)}
                         className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase font-mono"
                         maxLength={7}
                     />
                 </div>
             </div>
         </div>
      </aside>
    );
  }

  // Helpers for multi-select values
  const isMulti = selectedBlocks.length > 1;
  const firstBlock = selectedBlocks[0];
  const isHero = firstBlock.type === BlockType.HERO && !isMulti;
  
  const getCommonValue = <K extends keyof DashboardBlock>(key: K): DashboardBlock[K] | 'mixed' => {
      const val = firstBlock[key];
      return selectedBlocks.every(b => b[key] === val) ? val : 'mixed';
  };
  
  const getCommonPos = <K extends keyof DashboardBlock['position']>(key: K): number | 'mixed' => {
      const val = firstBlock.position[key];
      return selectedBlocks.every(b => b.position[key] === val) ? val : 'mixed';
  };

  const commonTitle = getCommonValue('title');
  const commonType = getCommonValue('type');
  const commonColor = getCommonValue('color');
  const commonOpacity = getCommonValue('opacity');
  
  const commonColStart = getCommonPos('colStart');
  const commonRowStart = getCommonPos('rowStart');
  const commonColSpan = getCommonPos('colSpan');
  const commonRowSpan = getCommonPos('rowSpan');

  // Calculate capacity
  const statsWidth = 3; // approximate
  const rowHeight = 6; // approximate
  const capacityHor = Math.floor(firstBlock.position.colSpan / statsWidth);
  const capacityVert = Math.max(0, Math.floor((firstBlock.position.rowSpan - 2) / rowHeight)); // -2 for margins

  return (
    <aside 
        className={`
            fixed bottom-0 left-0 right-0 lg:static bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] lg:shadow-xl z-30
            transition-all duration-300 ease-in-out
            ${isExpanded ? 'h-[70vh]' : 'h-16'} lg:h-auto lg:w-80
        `}
    >
      {/* Mobile Toggle */}
      <div 
        className="lg:hidden absolute top-0 left-0 right-0 h-16 flex items-center justify-center z-40 cursor-pointer border-b border-gray-100 bg-white"
        onClick={() => setIsExpanded(!isExpanded)}
      >
         <div className="flex items-center justify-between w-full px-6">
             <div className="flex items-center gap-2">
                 {isMulti ? (
                    <Layers size={16} className="text-brand-orange" />
                 ) : (
                    <div 
                        className="w-3 h-3 rounded-full border border-gray-200" 
                        style={{ backgroundColor: firstBlock.color }}
                    />
                 )}
                 <span className="text-sm font-bold text-gray-800">
                    {isMulti ? `${selectedBlocks.length} Blocos Selecionados` : 'Propriedades'}
                 </span>
             </div>
             {isExpanded ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronUp size={20} className="text-gray-400" />}
         </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:flex p-6 border-b border-gray-100 justify-between items-center">
        <div className="flex items-center gap-3 mb-1">
            {isMulti ? (
                <div className="bg-brand-orange/10 p-2 rounded-lg text-brand-orange">
                    <Layers size={20} />
                </div>
            ) : (
                <div 
                    className="w-4 h-4 rounded-full border border-gray-200 shadow-sm"
                    style={{ backgroundColor: firstBlock.color }}
                />
            )}
            <div>
                <h2 className="text-lg font-bold text-gray-900">
                    {isMulti ? 'Múltipla Seleção' : 'Propriedades'}
                </h2>
                <p className="text-xs text-gray-400 font-mono mt-1">
                    {isMulti ? `${selectedBlocks.length} itens` : firstBlock.id.slice(0, 8)}
                </p>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 mt-16 lg:mt-0">
        
        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
             <button 
                onClick={onDuplicateBlocks}
                className="flex items-center justify-center gap-2 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
             >
                 <Copy size={16} /> Duplicar
             </button>
             <button 
                onClick={onDeleteBlocks}
                className="flex items-center justify-center gap-2 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
             >
                 <Trash2 size={16} /> Excluir
             </button>
        </div>

        {/* Hero Properties */}
        {isHero && (
            <section className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                 <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <LayoutTemplate size={14} /> Configuração Hero
                 </h3>
                 
                 <div className="space-y-4">
                     <div>
                         <label className="block text-xs font-medium text-blue-800 mb-2">Direção do Stack</label>
                         <div className="flex bg-white rounded-lg border border-blue-200 p-1">
                             <button
                                onClick={() => onUpdateBlocks({ heroProperties: { ...firstBlock.heroProperties, stackDirection: 'horizontal' } })}
                                className={`flex-1 py-1.5 px-2 rounded text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                                    firstBlock.heroProperties?.stackDirection !== 'vertical' // Default Horizontal
                                    ? 'bg-blue-100 text-blue-700 shadow-sm' 
                                    : 'text-gray-500 hover:bg-gray-50'
                                }`}
                             >
                                 <ArrowRight size={12} /> Horizontal
                             </button>
                             <button
                                onClick={() => onUpdateBlocks({ heroProperties: { ...firstBlock.heroProperties, stackDirection: 'vertical' } })}
                                className={`flex-1 py-1.5 px-2 rounded text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                                    firstBlock.heroProperties?.stackDirection === 'vertical'
                                    ? 'bg-blue-100 text-blue-700 shadow-sm' 
                                    : 'text-gray-500 hover:bg-gray-50'
                                }`}
                             >
                                 <ArrowDown size={12} /> Vertical
                             </button>
                         </div>
                     </div>
                     
                     <div className="text-xs text-blue-600/80 bg-blue-100/50 p-2 rounded border border-blue-200">
                        <strong>Capacidade:</strong><br/>
                        ~{capacityHor} blocos (Hor) ou ~{capacityVert} blocos (Vert)
                     </div>
                 </div>
            </section>
        )}

        {/* Content Info */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Type size={14} /> Conteúdo
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
              <input
                type="text"
                value={commonTitle === 'mixed' ? '' : commonTitle}
                placeholder={commonTitle === 'mixed' ? 'Valores mistos' : ''}
                onFocus={onSaveCheckpoint}
                onChange={(e) => onUpdateBlocks({ title: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange outline-none text-sm"
              />
            </div>
            <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
               <select 
                    value={commonType === 'mixed' ? '' : commonType}
                    onFocus={onSaveCheckpoint}
                    onChange={(e) => onUpdateBlocks({ type: e.target.value as BlockType })}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                >
                   {commonType === 'mixed' && <option value="">(Vários)</option>}
                   {Object.values(BlockType).map(t => (
                       <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>
                   ))}
               </select>
            </div>
          </div>
        </section>

        {/* Layout */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Sliders size={14} /> Layout do Grid
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Col Início</label>
              <input
                type="number"
                min={1}
                max={24} 
                value={commonColStart === 'mixed' ? '' : commonColStart}
                placeholder={commonColStart === 'mixed' ? '-' : ''}
                onFocus={onSaveCheckpoint}
                onChange={(e) => onUpdateBlocks({ position: { colStart: parseInt(e.target.value) } as any })}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Largura (Cols)</label>
              <input
                type="number"
                min={1}
                max={24}
                value={commonColSpan === 'mixed' ? '' : commonColSpan}
                placeholder={commonColSpan === 'mixed' ? '-' : ''}
                onFocus={onSaveCheckpoint}
                onChange={(e) => onUpdateBlocks({ position: { colSpan: parseInt(e.target.value) } as any })}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Linha Início</label>
              <input
                type="number"
                min={1}
                value={commonRowStart === 'mixed' ? '' : commonRowStart}
                placeholder={commonRowStart === 'mixed' ? '-' : ''}
                onFocus={onSaveCheckpoint}
                onChange={(e) => onUpdateBlocks({ position: { rowStart: parseInt(e.target.value) } as any })}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Altura (Linhas)</label>
              <input
                type="number"
                min={1}
                value={commonRowSpan === 'mixed' ? '' : commonRowSpan}
                placeholder={commonRowSpan === 'mixed' ? '-' : ''}
                onFocus={onSaveCheckpoint}
                onChange={(e) => onUpdateBlocks({ position: { rowSpan: parseInt(e.target.value) } as any })}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </section>

        {/* Styling */}
        <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Palette size={14} /> Aparência
            </h3>
            
            <div className="space-y-4">
                {/* Opacity Slider */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                         <label className="text-xs text-gray-500 flex items-center gap-1">
                            <Droplet size={12} /> Opacidade
                         </label>
                         <span className="text-xs font-mono text-gray-400">
                             {commonOpacity === 'mixed' ? 'Misto' : `${Math.round((commonOpacity ?? 1) * 100)}%`}
                         </span>
                    </div>
                    <input 
                        type="range" 
                        min="0.15" 
                        max="1" 
                        step="0.05"
                        value={commonOpacity === 'mixed' ? 1 : commonOpacity ?? 1}
                        onMouseDown={onSaveCheckpoint}
                        onTouchStart={onSaveCheckpoint}
                        onChange={(e) => onUpdateBlocks({ opacity: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-orange"
                    />
                </div>

                {/* Preset Colors */}
                <div>
                    <label className="block text-xs text-gray-500 mb-2">Cores Predefinidas</label>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(COLORS.brand).concat(Object.entries(COLORS.accent)).map(([name, hex]) => (
                            <button
                                key={name}
                                onClick={() => {
                                    onSaveCheckpoint();
                                    onUpdateBlocks({ color: hex });
                                }}
                                className={`w-8 h-8 rounded-full border-2 transition-all ${commonColor === hex ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                                style={{ backgroundColor: hex }}
                                title={name}
                            />
                        ))}
                    </div>
                </div>

                {/* Custom Color */}
                <div>
                     <label className="block text-xs text-gray-500 mb-2">Cor Personalizada</label>
                     <div className="flex items-center gap-3">
                         <div 
                            className="relative w-10 h-10 rounded overflow-hidden border border-gray-200 shadow-sm"
                            onClick={onSaveCheckpoint}
                         >
                            <input 
                                type="color" 
                                value={commonColor === 'mixed' ? '#ffffff' : commonColor || '#ffffff'}
                                onChange={(e) => onUpdateBlocks({ color: e.target.value })}
                                className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer p-0 border-0"
                            />
                         </div>
                         <input 
                             type="text"
                             value={commonColor === 'mixed' ? 'MISTO' : commonColor}
                             onFocus={onSaveCheckpoint}
                             onChange={(e) => onUpdateBlocks({ color: e.target.value })}
                             className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase font-mono"
                             maxLength={7}
                             placeholder="#FFFFFF"
                         />
                     </div>
                </div>
            </div>
        </section>

      </div>
    </aside>
  );
};

export default Inspector;
