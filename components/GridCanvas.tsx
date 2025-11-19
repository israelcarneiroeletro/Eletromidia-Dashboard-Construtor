import React, { useState, useRef, useEffect } from 'react';
import { Trash2, Scaling, BarChart2, Image as ImageIcon, Activity, Layout, Edit2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Resolution, DashboardBlock, GridPosition, BlockType } from '../types';
import { MARGIN_PX, GUTTER_PX, COLORS, COMPONENT_PALETTE, ROW_HEIGHT } from '../constants';
import { getBestContrastingColor, getGridColors } from '../utils/colorUtils';

interface GridCanvasProps {
  resolution: Resolution;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  showGrid: boolean;
  blocks: DashboardBlock[];
  onUpdateBlocks: (blocks: DashboardBlock[]) => void;
  selectedBlockIds: string[];
  onSelectBlocks: (ids: string[]) => void;
  gridColumns: number;
  canvasBackgroundColor: string;
  onSaveCheckpoint: () => void;
  draggingBlockType: BlockType | null;
}

// --- Constants ---
const MIN_CHILD_COLS = 1;
// Height: 2 Full Rows (60px) + 1 (Half top, Half bottom) -> 3 Grid Units (Total 90px space, 60px visual)
const MIN_CHILD_ROWS = 3; 
const MIN_HERO_ROWS = 5;

// --- Collision & Layout Helpers ---

const isHorizontalOverlap = (a: GridPosition, b: GridPosition) => {
  if (a.colStart + a.colSpan <= b.colStart) return false; 
  if (a.colStart >= b.colStart + b.colSpan) return false;
  return true;
};

const isBufferViolation = (a: DashboardBlock, b: DashboardBlock) => {
  if (a.parentBlockId === b.id || b.parentBlockId === a.id) {
      return false;
  }
  
  const posA = a.position;
  const posB = b.position;

  if (!isHorizontalOverlap(posA, posB)) return false;

  const aEnd = posA.rowStart + posA.rowSpan;
  const bEnd = posB.rowStart + posB.rowSpan;

  // Standard overlapping check
  if (aEnd <= posB.rowStart) return false;
  if (bEnd <= posA.rowStart) return false;

  return true;
};

const constrainToParent = (childPos: GridPosition, parent: DashboardBlock): GridPosition => {
    let { colStart, rowStart, colSpan, rowSpan } = childPos;
    const { colStart: pCol, rowStart: pRow, colSpan: pSpan, rowSpan: pSpanH } = parent.position;
    const stackDirection = parent.heroProperties?.stackDirection || 'horizontal';

    const verticalPadding = 1;
    const horizontalPadding = 0; // Keep logic padding 0, visual padding handled in render

    const minRow = pRow + verticalPadding;
    const maxRowInclusive = pRow + pSpanH - 1 - verticalPadding;

    const minCol = pCol + horizontalPadding;
    const maxColInclusive = pCol + pSpan - 1 - horizontalPadding;
    const availableWidth = Math.max(1, pSpan - (horizontalPadding * 2));
    const availableHeight = Math.max(1, pSpanH - (verticalPadding * 2));

    if (stackDirection === 'vertical') {
        colStart = minCol;
        colSpan = availableWidth; 
    } else {
        rowStart = minRow;
        rowSpan = availableHeight;
    }

    if (rowSpan > availableHeight) rowSpan = availableHeight;
    if (rowStart < minRow) rowStart = minRow;
    if (rowStart + rowSpan - 1 > maxRowInclusive) rowStart = maxRowInclusive - rowSpan + 1;

    if (colSpan > availableWidth) colSpan = availableWidth;
    if (colStart < minCol) colStart = minCol;
    if (colStart + colSpan - 1 > maxColInclusive) colStart = maxColInclusive - colSpan + 1;

    return { colStart, colSpan, rowStart, rowSpan };
};

const moveBlock = (
  blocks: DashboardBlock[],
  movedBlockIds: string[],
  newPositions: Record<string, GridPosition>
): DashboardBlock[] => {
  let updatedBlocks = blocks.map(b => 
    newPositions[b.id] 
      ? { ...b, position: newPositions[b.id] } 
      : b
  );
  
  updatedBlocks.sort((a, b) => {
      if (a.position.rowStart === b.position.rowStart) {
          return a.position.colStart - b.position.colStart;
      }
      return a.position.rowStart - b.position.rowStart;
  });

  let hasCollision = true;
  let iterations = 0;
  while (hasCollision && iterations < 100) {
    hasCollision = false;
    iterations++;

    for(let i=0; i<updatedBlocks.length; i++) {
        const b1 = updatedBlocks[i];
        
        if (b1.parentBlockId) {
            const parent = updatedBlocks.find(p => p.id === b1.parentBlockId);
            if (parent) {
                const constrained = constrainToParent(b1.position, parent);
                if (
                    constrained.colStart !== b1.position.colStart ||
                    constrained.rowStart !== b1.position.rowStart ||
                    constrained.colSpan !== b1.position.colSpan ||
                    constrained.rowSpan !== b1.position.rowSpan
                ) {
                    b1.position = constrained;
                }
            }
        }

        for(let j=0; j<updatedBlocks.length; j++) {
            if(i === j) continue;
            const b2 = updatedBlocks[j];

            if(isBufferViolation(b1, b2)) {
                const isB1Moved = movedBlockIds.includes(b1.id);
                const isB2Moved = movedBlockIds.includes(b2.id);
                
                if (isB1Moved && isB2Moved) continue;

                if (!isB1Moved && !isB2Moved) {
                      const b1IsUpper = b1.position.rowStart < b2.position.rowStart;
                      const upper = b1IsUpper ? b1 : b2;
                      const lower = b1IsUpper ? b2 : b1;
                      
                      const tightStart = upper.position.rowStart + upper.position.rowSpan;
                      
                      if (lower.position.rowStart < tightStart) {
                          lower.position.rowStart = tightStart;
                          hasCollision = true;
                      }
                      continue;
                }

                let staticBlock = isB1Moved ? b2 : b1;
                let movingBlock = isB1Moved ? b1 : b2;

                const movingTop = movingBlock.position.rowStart;
                const minStart = staticBlock.position.rowStart + staticBlock.position.rowSpan;
                
                if (movingTop < minStart) {
                    movingBlock.position.rowStart = minStart;
                    hasCollision = true;
                }
            }
        }
    }
  }

  return updatedBlocks;
};

const GridCanvas: React.FC<GridCanvasProps> = ({
  resolution,
  zoom,
  onZoomChange,
  showGrid,
  blocks,
  onUpdateBlocks,
  selectedBlockIds,
  onSelectBlocks,
  gridColumns,
  canvasBackgroundColor,
  onSaveCheckpoint,
  draggingBlockType
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  
  const [isPanning, setIsPanning] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const panStartRef = useRef<{ x: number, y: number, scrollLeft: number, scrollTop: number } | null>(null);
  const selectionStartRef = useRef<{ x: number, y: number } | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  
  // --- Interaction State ---
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{x: number, y: number} | null>(null);

  const [ghostBlock, setGhostBlock] = useState<{
      position: GridPosition,
      parentBlockId?: string,
      type: BlockType,
      contrastColor: string,
      isValid: boolean,
      isRoot?: boolean
  } | null>(null);

  if (!resolution) return null;

  const safeZoom = zoom || 1;
  const totalWidth = resolution.width;
  
  const minRows = Math.ceil(resolution.height / ROW_HEIGHT);
  const maxRowFromBlocks = blocks.reduce((max, b) => Math.max(max, b.position.rowStart + b.position.rowSpan), 0);
  const effectiveMaxRow = Math.max(minRows, maxRowFromBlocks + 1);
  const calculatedHeight = MARGIN_PX * 2 + (effectiveMaxRow * ROW_HEIGHT);
  const contentWidth = totalWidth - (MARGIN_PX * 2);
  const totalGutters = (gridColumns - 1) * GUTTER_PX;
  const colWidth = (contentWidth - totalGutters) / gridColumns;

  const { rowColor, colColor } = getGridColors(canvasBackgroundColor);

  const [interaction, setInteraction] = useState<{
    type: 'DRAG' | 'RESIZE';
    startX: number;
    startY: number;
    initialPositions: Record<string, GridPosition>;
    hasMoved: boolean;
    activeBlockId: string;
    selectionBounds: { minCol: number, maxCol: number, minRow: number, maxRow: number };
    isRootDrag: boolean;
    dragStartOffset: { x: number, y: number };
  } | null>(null);

  const getGridFromPixels = (x: number, y: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { col: 1, row: 1 };
    const relativeX = (x - rect.left) / safeZoom - MARGIN_PX;
    const relativeY = (y - rect.top) / safeZoom - MARGIN_PX;
    let col = Math.floor(relativeX / (colWidth + GUTTER_PX)) + 1;
    let row = Math.floor(relativeY / ROW_HEIGHT) + 1;
    col = Math.max(1, Math.min(gridColumns, col));
    row = Math.max(1, row);
    return { col, row };
  };

  const calculateGhost = (x: number, y: number, widthCols: number, heightRows: number, type: BlockType, draggedBlockId: string) => {
      const { col, row } = getGridFromPixels(x, y);
      
      // Check if we are dragging multiple items (Group Drag)
      const isMultiDrag = interaction && Object.keys(interaction.initialPositions).length > 1;

      // 1. Check for Nesting (Hero) first
      // Disable Nesting Logic if multi-dragging or if dragging a Hero (Heroes cannot be nested inside Heroes in this version)
      if (type !== BlockType.HERO && !isMultiDrag) {
          const potentialParent = blocks.find(other => 
              other.type === BlockType.HERO &&
              other.id !== draggedBlockId &&
              col >= other.position.colStart &&
              col < other.position.colStart + other.position.colSpan &&
              row >= other.position.rowStart &&
              row < other.position.rowStart + other.position.rowSpan
          );

          if (potentialParent) {
              let tempPos = {
                  colStart: col,
                  rowStart: row,
                  colSpan: widthCols,
                  rowSpan: heightRows
              };
              
              tempPos = constrainToParent(tempPos, potentialParent);
              
              const siblings = blocks.filter(b => b.parentBlockId === potentialParent.id && b.id !== draggedBlockId);
              const stackDir = potentialParent.heroProperties?.stackDirection || 'horizontal';

              const checkOverlap = (pos: GridPosition) => {
                  return siblings.some(sibling => {
                      return !(pos.colStart + pos.colSpan <= sibling.position.colStart ||
                               pos.colStart >= sibling.position.colStart + sibling.position.colSpan ||
                               pos.rowStart + pos.rowSpan <= sibling.position.rowStart ||
                               pos.rowStart >= sibling.position.rowStart + sibling.position.rowSpan);
                  });
              };

              if (checkOverlap(tempPos)) {
                  if (stackDir === 'vertical') {
                       const siblingBelow = siblings
                            .filter(s => s.position.rowStart >= tempPos.rowStart)
                            .sort((a,b) => a.position.rowStart - b.position.rowStart)[0];
                       
                       if (siblingBelow) {
                           const avail = siblingBelow.position.rowStart - tempPos.rowStart;
                           tempPos.rowSpan = Math.max(MIN_CHILD_ROWS, avail);
                       }
                  } else {
                       const siblingRight = siblings
                            .filter(s => s.position.colStart >= tempPos.colStart)
                            .sort((a,b) => a.position.colStart - b.position.colStart)[0];

                       if (siblingRight) {
                           const avail = siblingRight.position.colStart - tempPos.colStart;
                           tempPos.colSpan = Math.max(MIN_CHILD_COLS, avail);
                       }
                  }
              }

              const isTooSmall = tempPos.colSpan < MIN_CHILD_COLS || tempPos.rowSpan < MIN_CHILD_ROWS;
              const isOverlapping = checkOverlap(tempPos);
              const isValid = !isTooSmall && !isOverlapping;
              
              const parentBg = potentialParent.color || COLORS.brand.white;
              const contrastColor = isValid 
                    ? getBestContrastingColor(parentBg, COLORS.brand.white, COLORS.brand.black)
                    : '#EF4444';

              setGhostBlock({
                  position: tempPos,
                  parentBlockId: potentialParent.id,
                  type,
                  contrastColor,
                  isValid,
                  isRoot: false
              });
              return;
          }
      }

      // 2. Root Ghost (Main Canvas) - Supports Single and Multi-Select
      const clampedCol = Math.max(1, Math.min(gridColumns - widthCols + 1, col));
      const clampedRow = Math.max(1, row);

      const primaryGhostPos: GridPosition = {
          colStart: clampedCol,
          colSpan: widthCols,
          rowStart: clampedRow,
          rowSpan: heightRows
      };

      let isGroupValid = true;
      let deltaCol = 0;
      let deltaRow = 0;

      const movingIds = interaction ? Object.keys(interaction.initialPositions) : [draggedBlockId];
      const nonMovingBlocks = blocks.filter(b => !movingIds.includes(b.id));

      // If we are dragging existing blocks, check the whole group
      if (interaction && interaction.type === 'DRAG' && interaction.initialPositions[draggedBlockId]) {
          const init = interaction.initialPositions[draggedBlockId];
          deltaCol = clampedCol - init.colStart;
          deltaRow = clampedRow - init.rowStart;
          
          // Check Validity for ALL moving blocks
          for (const id of movingIds) {
               const bInit = interaction.initialPositions[id];
               const target = {
                   ...bInit,
                   colStart: bInit.colStart + deltaCol,
                   rowStart: bInit.rowStart + deltaRow
               };
               
               // Boundary Check
               if (target.colStart < 1 || target.colStart + target.colSpan - 1 > gridColumns || target.rowStart < 1) {
                   isGroupValid = false; 
                   break;
               }
               
               // Collision Check
               const temp = { ...blocks.find(b=>b.id===id)!, position: target };
               if (nonMovingBlocks.some(other => isBufferViolation(temp, other))) {
                   isGroupValid = false;
                   break;
               }
          }
      } else {
          // Single / New Block Drag (No Interaction state yet or New Block)
           const tempBlock: DashboardBlock = { 
               id: 'ghost', type: type, title: '', position: primaryGhostPos, color: '' 
           };
           if (blocks.some(other => isBufferViolation(tempBlock, other))) {
               isGroupValid = false;
           }
      }

      // Ensure Contrast against Canvas Background
      // Use stricter contrast for ghost to guarantee visibility
      const contrastColor = isGroupValid 
          ? getBestContrastingColor(canvasBackgroundColor, COLORS.brand.black, COLORS.brand.white)
          : '#EF4444';

      setGhostBlock({
          position: primaryGhostPos,
          type,
          contrastColor,
          isValid: isGroupValid,
          isRoot: true
      });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0] && uploadingBlockId) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              const result = ev.target?.result as string;
              const newBlocks = blocks.map(b => 
                  b.id === uploadingBlockId ? { ...b, content: result } : b
              );
              onUpdateBlocks(newBlocks);
              setUploadingBlockId(null);
          };
          reader.readAsDataURL(e.target.files[0]);
      }
  };

  const triggerImageUpload = (blockId: string) => {
      setUploadingBlockId(blockId);
      setTimeout(() => imageInputRef.current?.click(), 0);
  };

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.code === 'Space' && !e.repeat) setIsSpacePressed(true);
      };
      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.code === 'Space') setIsSpacePressed(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, []);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY * -0.001; 
            const newZoom = Math.min(Math.max(0.25, zoom + delta), 2);
            onZoomChange(newZoom);
        }
    };
    const el = scrollContainerRef.current;
    if (el) el.addEventListener('wheel', handleWheel, { passive: false });
    return () => { if (el) el.removeEventListener('wheel', handleWheel); };
  }, [zoom, onZoomChange]);


  const handleMouseDown = (e: React.MouseEvent) => {
     if (e.button !== 0 && e.button !== 1) return;

     if (isSpacePressed || e.button === 1) { 
         e.preventDefault();
         setIsPanning(true);
         panStartRef.current = {
             x: e.clientX,
             y: e.clientY,
             scrollLeft: scrollContainerRef.current?.scrollLeft || 0,
             scrollTop: scrollContainerRef.current?.scrollTop || 0
         };
     } else {
         const rect = scrollContainerRef.current?.getBoundingClientRect();
         if (!rect) return;
         
         const startX = e.clientX - rect.left + scrollContainerRef.current!.scrollLeft;
         const startY = e.clientY - rect.top + scrollContainerRef.current!.scrollTop;

         setIsSelecting(true);
         selectionStartRef.current = { x: startX, y: startY };
         setSelectionBox({ x: startX, y: startY, w: 0, h: 0 });
         
         if (!e.shiftKey) {
             onSelectBlocks([]);
         }
     }
  };

  useEffect(() => {
      const handleGlobalMove = (e: MouseEvent) => {
          if (isPanning && panStartRef.current && scrollContainerRef.current) {
              const dx = e.clientX - panStartRef.current.x;
              const dy = e.clientY - panStartRef.current.y;
              scrollContainerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
              scrollContainerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
              return;
          }

          if (isSelecting && selectionStartRef.current && scrollContainerRef.current) {
              const rect = scrollContainerRef.current.getBoundingClientRect();
              const currentX = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
              const currentY = e.clientY - rect.top + scrollContainerRef.current.scrollTop;

              const startX = selectionStartRef.current.x;
              const startY = selectionStartRef.current.y;

              const x = Math.min(startX, currentX);
              const y = Math.min(startY, currentY);
              const w = Math.abs(currentX - startX);
              const h = Math.abs(currentY - startY);

              setSelectionBox({ x, y, w, h });

              const containerRect = containerRef.current?.getBoundingClientRect();
              if (!containerRect) return;

              const selectionRectAbs = {
                  left: rect.left + x - scrollContainerRef.current.scrollLeft,
                  top: rect.top + y - scrollContainerRef.current.scrollTop,
                  right: rect.left + x + w - scrollContainerRef.current.scrollLeft,
                  bottom: rect.top + y + h - scrollContainerRef.current.scrollTop
              };

              const newSelectedIds = blocks.filter(b => {
                   const left = MARGIN_PX + (b.position.colStart - 1) * (colWidth + GUTTER_PX);
                   const top = MARGIN_PX + (b.position.rowStart - 1) * ROW_HEIGHT; 
                   const width = (b.position.colSpan * colWidth) + ((b.position.colSpan - 1) * GUTTER_PX);
                   const height = b.position.rowSpan * ROW_HEIGHT;
                   
                   const screenLeft = containerRect.left + (left * safeZoom);
                   const screenTop = containerRect.top + (top * safeZoom);
                   const screenRight = screenLeft + (width * safeZoom);
                   const screenBottom = screenTop + (height * safeZoom);

                   return !(
                       screenRight < selectionRectAbs.left || 
                       screenLeft > selectionRectAbs.right || 
                       screenBottom < selectionRectAbs.top || 
                       screenTop > selectionRectAbs.bottom
                   );
              }).map(b => b.id);

              onSelectBlocks(newSelectedIds);
          }
      };

      const handleGlobalUp = () => {
          setIsPanning(false);
          setIsSelecting(false);
          setSelectionBox(null);
          panStartRef.current = null;
          selectionStartRef.current = null;
      };

      if (isPanning || isSelecting) {
          window.addEventListener('mousemove', handleGlobalMove);
          window.addEventListener('mouseup', handleGlobalUp);
      }
      return () => {
          window.removeEventListener('mousemove', handleGlobalMove);
          window.removeEventListener('mouseup', handleGlobalUp);
      };
  }, [isPanning, isSelecting, safeZoom, blocks, colWidth, onSelectBlocks]);

  const handleInteractionStart = (
      e: React.MouseEvent | React.TouchEvent, 
      blockId: string, 
      type: 'DRAG' | 'RESIZE'
  ) => {
      e.stopPropagation();

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      let newSelectedIds = [...selectedBlockIds];
      if (e.shiftKey || e.ctrlKey) {
          if (!newSelectedIds.includes(blockId)) {
              newSelectedIds.push(blockId);
          }
      } else {
          if (!newSelectedIds.includes(blockId)) {
              newSelectedIds = [blockId];
          }
      }
      onSelectBlocks(newSelectedIds);

      // Identify all blocks to move (Including Children)
      const effectiveIdsToMove = new Set(newSelectedIds);
      blocks.forEach(b => {
          if (newSelectedIds.includes(b.id) && b.type === BlockType.HERO) {
              blocks.filter(child => child.parentBlockId === b.id).forEach(child => effectiveIdsToMove.add(child.id));
          }
      });
      
      const initialPositions: Record<string, GridPosition> = {};
      let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;

      blocks.forEach(b => {
          if (effectiveIdsToMove.has(b.id)) {
              initialPositions[b.id] = { ...b.position };
              minCol = Math.min(minCol, b.position.colStart);
              maxCol = Math.max(maxCol, b.position.colStart + b.position.colSpan);
              minRow = Math.min(minRow, b.position.rowStart);
              maxRow = Math.max(maxRow, b.position.rowStart + b.position.rowSpan);
          }
      });

      // Determine drag offset relative to block
      const rect = (e.target as HTMLElement).closest('.group')?.getBoundingClientRect();
      const offsetX = rect ? clientX - rect.left : 0;
      const offsetY = rect ? clientY - rect.top : 0;

      // --- Determine Drag Mode ---
      // If ANY selected block is a Root block (no parent), or we are dragging multiple items,
      // we force "Root Drag" mode (Ghost-based absolute movement). 
      // This ensures groups move as a single rigid object.
      // We only use "Shuffle" mode (live reorder) when dragging a single Child block.
      const isMultiSelection = effectiveIdsToMove.size > 1;
      const hasRootInSelection = Array.from(effectiveIdsToMove).some(id => {
           const b = blocks.find(block => block.id === id);
           return b && !b.parentBlockId;
      });

      const isRootDrag = type === 'DRAG' && (hasRootInSelection || isMultiSelection);

      setInteraction({
          type,
          activeBlockId: blockId,
          startX: clientX,
          startY: clientY,
          initialPositions,
          hasMoved: false,
          selectionBounds: { minCol, maxCol, minRow, maxRow },
          isRootDrag,
          dragStartOffset: { x: offsetX, y: offsetY }
      });

      if (isRootDrag) {
          setActiveDragId(blockId);
          setDragPosition({ x: clientX - offsetX, y: clientY - offsetY });
      }
  };

  useEffect(() => {
      const handleMove = (e: MouseEvent | TouchEvent) => {
          if (!interaction) return;
          if (e.cancelable && e.type === 'touchmove') e.preventDefault();

          const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

          // Root Drag Visual Update
          if (interaction.isRootDrag && activeDragId) {
               setDragPosition({ x: clientX - interaction.dragStartOffset.x, y: clientY - interaction.dragStartOffset.y });
          }

          const deltaXPixels = (clientX - interaction.startX) / safeZoom;
          const deltaYPixels = (clientY - interaction.startY) / safeZoom;

          if (!interaction.hasMoved && (Math.abs(deltaXPixels) > 2 || Math.abs(deltaYPixels) > 2)) {
             onSaveCheckpoint();
             setInteraction(prev => prev ? ({...prev, hasMoved: true}) : null);
          }

          const activeBlock = blocks.find(b => b.id === interaction.activeBlockId);

          // GHOST CALCULATION
          if (interaction.type === 'DRAG' && activeBlock) {
               const blockW = activeBlock.position.colSpan * colWidth;
               const blockH = activeBlock.position.rowSpan * ROW_HEIGHT;
               
               const virtualLeft = clientX - interaction.dragStartOffset.x;
               const virtualTop = clientY - interaction.dragStartOffset.y;
               const centerX = virtualLeft + (blockW * safeZoom / 2);
               const centerY = virtualTop + (blockH * safeZoom / 2);

               calculateGhost(centerX, centerY, activeBlock.position.colSpan, activeBlock.position.rowSpan, activeBlock.type, activeBlock.id);
          }

          // If dragging a Root block or Group, we DO NOT update the actual blocks array (no shuffle).
          if (interaction.isRootDrag) {
              return; 
          }

          // --- Standard Logic (Children Shuffle & Resize) ---

          const colDeltaRaw = Math.round(deltaXPixels / (colWidth + GUTTER_PX));
          const rowDeltaRaw = Math.round(deltaYPixels / ROW_HEIGHT);

          const { minCol, maxCol } = interaction.selectionBounds;
          const clampedColDelta = Math.max(1 - minCol, Math.min(gridColumns + 1 - maxCol, colDeltaRaw));
          const clampedRowDelta = Math.max(1 - interaction.selectionBounds.minRow, rowDeltaRaw); 

          const newPositions: Record<string, GridPosition> = {};
          let hasChanges = false;
          const targetIds = Object.keys(interaction.initialPositions);

          targetIds.forEach(id => {
              const block = blocks.find(b => b.id === id);
              if (block?.parentBlockId && block.parentBlockId === interaction.activeBlockId && interaction.type === 'RESIZE') return;

              const initial = interaction.initialPositions[id];
              const newPos = { ...initial };

              if (interaction.type === 'DRAG') {
                  newPos.colStart = initial.colStart + clampedColDelta;
                  newPos.rowStart = initial.rowStart + clampedRowDelta;
              } else if (id === interaction.activeBlockId) {
                  // RESIZE LOGIC
                  const deltaC = Math.round(deltaXPixels / (colWidth + GUTTER_PX));
                  const deltaR = Math.round(deltaYPixels / ROW_HEIGHT);
                  
                  let newColSpan = Math.max(1, Math.min(gridColumns - initial.colStart + 1, initial.colSpan + deltaC));
                  const minRows = block?.type === BlockType.HERO ? MIN_HERO_ROWS : MIN_CHILD_ROWS;
                  let newRowSpan = Math.max(minRows, initial.rowSpan + deltaR);

                  // Enforce Anchor Position Stability during Resize
                  newPos.colStart = initial.colStart;
                  newPos.rowStart = initial.rowStart;

                  // Nested constraints...
                  if (block?.parentBlockId) {
                      const parent = blocks.find(p => p.id === block.parentBlockId);
                      if (parent) {
                          const padding = 0;
                          const maxColAvailable = (parent.position.colStart + parent.position.colSpan - padding) - initial.colStart;
                          const maxRowAvailable = (parent.position.rowStart + parent.position.rowSpan - 1) - initial.rowStart;
                          newColSpan = Math.min(newColSpan, maxColAvailable);
                          newRowSpan = Math.min(newRowSpan, maxRowAvailable);
                      }
                  }

                  if (block && block.type === BlockType.HERO) {
                       // Hero Logic maintained...
                      const stackDir = block.heroProperties?.stackDirection || 'horizontal';
                      const children = blocks.filter(child => child.parentBlockId === id);
                      const padding = 0;
                      
                      let minRequiredWidth = 5;
                      let minRequiredHeight = 3;

                      if (children.length > 0) {
                           if (stackDir === 'horizontal') {
                               minRequiredWidth = (children.length * MIN_CHILD_COLS) + padding;
                               minRequiredHeight = MIN_CHILD_ROWS + padding;
                           } else {
                               minRequiredWidth = MIN_CHILD_COLS + padding;
                               minRequiredHeight = (children.length * MIN_CHILD_ROWS) + padding;
                           }
                      }
                      
                      newColSpan = Math.max(minRequiredWidth, newColSpan);
                      newRowSpan = Math.max(minRequiredHeight, newRowSpan);

                      const siblings = blocks.filter(b => b.id !== id && b.parentBlockId === block.parentBlockId);
                      for (const sib of siblings) {
                          const myY1 = initial.rowStart;
                          const myY2 = initial.rowStart + newRowSpan;
                          const sibY1 = sib.position.rowStart;
                          const sibY2 = sib.position.rowStart + sib.position.rowSpan;
                          
                          if (myY1 < sibY2 && myY2 > sibY1) {
                               if (initial.colStart + initial.colSpan <= sib.position.colStart) {
                                   const avail = sib.position.colStart - initial.colStart;
                                   newColSpan = Math.min(newColSpan, avail);
                               }
                          }
                      }

                      // Proportional Resize for Children
                      if (children.length > 0) {
                           const initHeroPos = interaction.initialPositions[id];
                           const initAvailableW = Math.max(1, initHeroPos.colSpan - padding);
                           const initAvailableH = Math.max(1, initHeroPos.rowSpan - padding);
                           const curAvailableW = Math.max(1, newColSpan - padding);
                           const curAvailableH = Math.max(1, newRowSpan - padding);

                           const scaleX = curAvailableW / initAvailableW;
                           const scaleY = curAvailableH / initAvailableH;

                           const sortedChildren = [...children].sort((a, b) => {
                               const posA = interaction.initialPositions[a.id] || a.position;
                               const posB = interaction.initialPositions[b.id] || b.position;
                               return stackDir === 'horizontal' 
                                    ? posA.colStart - posB.colStart 
                                    : posA.rowStart - posB.rowStart;
                           });

                           let previousEnd = stackDir === 'horizontal' ? (newPos.colStart + 0) : (newPos.rowStart + 1);
                           let resizeInvalid = false;

                           const potentialChildrenUpdates: Record<string, GridPosition> = {};

                           sortedChildren.forEach(child => {
                                const initChildPos = interaction.initialPositions[child.id] || child.position;

                                if (stackDir === 'horizontal') {
                                     const initRelStart = initChildPos.colStart - (initHeroPos.colStart + 0);
                                     const initRelWidth = initChildPos.colSpan;
                                     let newRelWidth = Math.max(MIN_CHILD_COLS, Math.round(initRelWidth * scaleX));
                                     const initRelHeight = initChildPos.rowSpan;
                                     let newRelHeight = Math.max(MIN_CHILD_ROWS, Math.round(initRelHeight * scaleY));
                                     if (newRelHeight > curAvailableH) newRelHeight = curAvailableH;
                                     let newChildStart = newPos.colStart + 0 + Math.round(initRelStart * scaleX);
                                     if (newChildStart < previousEnd) newChildStart = previousEnd;
                                     if (newChildStart + newRelWidth > newPos.colStart + newColSpan) {
                                          newRelWidth = (newPos.colStart + newColSpan) - newChildStart;
                                     }
                                     if (newRelWidth < MIN_CHILD_COLS) resizeInvalid = true;

                                     potentialChildrenUpdates[child.id] = {
                                         colStart: newChildStart,
                                         colSpan: newRelWidth,
                                         rowStart: newPos.rowStart + 1, 
                                         rowSpan: newRelHeight
                                     };
                                     previousEnd = newChildStart + newRelWidth;
                                } else {
                                     const initRelStart = initChildPos.rowStart - (initHeroPos.rowStart + 1);
                                     const initRelHeight = initChildPos.rowSpan;
                                     let newRelHeight = Math.max(MIN_CHILD_ROWS, Math.round(initRelHeight * scaleY));
                                     const initRelWidth = initChildPos.colSpan;
                                     let newRelWidth = Math.max(MIN_CHILD_COLS, Math.round(initRelWidth * scaleX));
                                     if (newRelWidth > curAvailableW) newRelWidth = curAvailableW;
                                     let newChildStart = newPos.rowStart + 1 + Math.round(initRelStart * scaleY);
                                     if (newChildStart < previousEnd) newChildStart = previousEnd;
                                     if (newChildStart + newRelHeight > newPos.rowStart + newRowSpan - 1) {
                                         newRelHeight = (newPos.rowStart + newRowSpan - 1) - newChildStart;
                                     }
                                     if (newRelHeight < MIN_CHILD_ROWS) resizeInvalid = true;
                                     potentialChildrenUpdates[child.id] = {
                                         colStart: newPos.colStart + 0, 
                                         colSpan: newRelWidth,
                                         rowStart: newChildStart,
                                         rowSpan: newRelHeight
                                     };
                                     previousEnd = newChildStart + newRelHeight;
                                }
                           });

                           if (!resizeInvalid) {
                               Object.assign(newPositions, potentialChildrenUpdates);
                           } else {
                               return; 
                           }
                      }
                  }
                  
                  newPos.colSpan = newColSpan;
                  newPos.rowSpan = newRowSpan;
              }

              if (
                  newPos.colStart !== blocks.find(b=>b.id===id)?.position.colStart ||
                  newPos.rowStart !== blocks.find(b=>b.id===id)?.position.rowStart ||
                  newPos.colSpan !== blocks.find(b=>b.id===id)?.position.colSpan ||
                  newPos.rowSpan !== blocks.find(b=>b.id===id)?.position.rowSpan
              ) {
                  hasChanges = true;
                  newPositions[id] = newPos;
              }
          });

          if (hasChanges) {
              const resolvedBlocks = moveBlock(blocks, targetIds, newPositions);
              onUpdateBlocks(resolvedBlocks);
          }
      };

      const handleEnd = () => {
          if (!interaction) return;
          
          if (interaction.type === 'DRAG' && interaction.hasMoved) {
              // Handle Root Drop (Ghost based)
              if (interaction.isRootDrag && activeDragId) {
                  if (ghostBlock && ghostBlock.isValid) {
                       const initActive = interaction.initialPositions[activeDragId];
                       const deltaCol = ghostBlock.position.colStart - initActive.colStart;
                       const deltaRow = ghostBlock.position.rowStart - initActive.rowStart;

                       // Update ALL moving blocks (Rigid Group Move)
                       const movingIds = Object.keys(interaction.initialPositions);
                       const updatedBlocks = blocks.map(b => {
                           if (movingIds.includes(b.id)) {
                               const init = interaction.initialPositions[b.id];
                               return {
                                   ...b,
                                   position: {
                                       ...b.position,
                                       colStart: init.colStart + deltaCol,
                                       rowStart: init.rowStart + deltaRow
                                   },
                                   // If we drag a single block into a Hero, it might become a child.
                                   // But if we move a whole group (Hero+Children), they stay as is.
                                   // The ghost block tracks the active block's parent.
                                   parentBlockId: (b.id === activeDragId) ? ghostBlock.parentBlockId : b.parentBlockId
                               };
                           }
                           return b;
                       });
                       onUpdateBlocks(updatedBlocks);
                  } else {
                      // Invalid Drop - Revert (do nothing)
                  }
              } 
              // Handle Child Drop (Live Update based)
              else if (!interaction.isRootDrag) {
                   if (ghostBlock && ghostBlock.isValid) {
                       const targetId = Object.keys(interaction.initialPositions)[0];
                       const updatedBlocks = blocks.map(b => 
                           b.id === targetId 
                           ? { ...b, position: ghostBlock.position, parentBlockId: ghostBlock.parentBlockId } 
                           : b
                       );
                       onUpdateBlocks(moveBlock(updatedBlocks, [targetId], {}));
                   } else {
                        const targetId = Object.keys(interaction.initialPositions)[0];
                        let finalBlocks = [...blocks];
                        onUpdateBlocks(moveBlock(finalBlocks, [], {}));
                   }
              }
          }
          
          setGhostBlock(null);
          setInteraction(null);
          setActiveDragId(null);
          setDragPosition(null);
      };

      if (interaction) {
          window.addEventListener('mousemove', handleMove);
          window.addEventListener('mouseup', handleEnd);
          window.addEventListener('touchmove', handleMove, { passive: false });
          window.addEventListener('touchend', handleEnd);
      }
      return () => {
          window.removeEventListener('mousemove', handleMove);
          window.removeEventListener('mouseup', handleEnd);
          window.removeEventListener('touchmove', handleMove);
          window.removeEventListener('touchend', handleEnd);
      };
  }, [interaction, blocks, colWidth, safeZoom, onUpdateBlocks, gridColumns, onSaveCheckpoint, ghostBlock, activeDragId, canvasBackgroundColor]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    
    if (ghostBlock && !ghostBlock.isValid) {
        setGhostBlock(null);
        return;
    }
    
    onSaveCheckpoint();
    const { type } = JSON.parse(data);
    const preset = COMPONENT_PALETTE.find(c => c.type === type);
    
    const { col, row } = getGridFromPixels(e.clientX, e.clientY);
    const defaultCols = preset?.defaultCols || 3;
    const defaultRows = preset?.defaultRows || 6;
    const finalCol = Math.min(col, gridColumns - defaultCols + 1);

    let newBlock: DashboardBlock = {
      id: `block-${Date.now()}`,
      type: type as BlockType,
      title: preset?.label || 'Novo Bloco',
      position: {
        colStart: finalCol,
        colSpan: defaultCols,
        rowStart: row,
        rowSpan: defaultRows
      },
      color: COLORS.brand.white,
      opacity: 1,
      ...(type === BlockType.HERO ? {
          heroProperties: { stackDirection: 'horizontal' }
      } : {})
    };

    if (ghostBlock) {
        newBlock.parentBlockId = ghostBlock.parentBlockId;
        newBlock.position = ghostBlock.position;
    }

    const newBlocks = [...blocks, newBlock];
    const resolved = moveBlock(newBlocks, [newBlock.id], { [newBlock.id]: newBlock.position });
    onUpdateBlocks(resolved);
    setGhostBlock(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      if (draggingBlockType) {
        const preset = COMPONENT_PALETTE.find(c => c.type === draggingBlockType);
        if (preset) {
            calculateGhost(e.clientX, e.clientY, preset.defaultCols, preset.defaultRows, draggingBlockType, 'new-block');
        }
      }
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
      if (!containerRef.current?.contains(e.relatedTarget as Node)) {
         setGhostBlock(null);
      }
  };

  const renderGrid = () => {
    if (!showGrid) return null;
    const cols = [];
    for (let i = 0; i < gridColumns; i++) {
      cols.push(
        <div
          key={`col-${i}`}
          style={{
            left: MARGIN_PX + i * (colWidth + GUTTER_PX),
            width: colWidth,
            top: MARGIN_PX,
            bottom: MARGIN_PX,
            backgroundColor: colColor,
            borderColor: colColor
          }}
          className="absolute pointer-events-none border-x z-0 transition-all duration-300 ui-helper"
        />
      );
    }
    const rows = [];
    for(let i = 0; i <= effectiveMaxRow; i++) {
      rows.push(
        <div 
            key={`row-${i}`}
            style={{
                top: MARGIN_PX + (i * ROW_HEIGHT),
                left: MARGIN_PX,
                width: contentWidth,
                height: 1,
                backgroundColor: rowColor
            }}
            className="absolute z-0 ui-helper"
        />
      )
    }
    return (
      <>
        <div className="absolute inset-0 pointer-events-none border border-gray-200/50 ui-helper" style={{ margin: MARGIN_PX }}>
            <div className="absolute -top-6 left-0 bg-gray-100/80 backdrop-blur text-[10px] text-gray-500 px-2 py-0.5 rounded ui-helper">Área Segura</div>
        </div>
        {cols}
        {rows}
      </>
    );
  };

  // Sort Logic
  const sortedBlocks = [...blocks].sort((a, b) => {
      const isASel = selectedBlockIds.includes(a.id);
      const isBSel = selectedBlockIds.includes(b.id);
      const getZ = (block: DashboardBlock, isSel: boolean) => {
          if (block.type === BlockType.HERO) return isSel ? 10 : 5; 
          return isSel ? 30 : 20;
      }
      return getZ(a, isASel) - getZ(b, isBSel);
  });

  const renderBlockContent = (block: DashboardBlock, isSelected: boolean, mutedColor: string, textColor: string) => {
      const hasChildren = blocks.some(b => b.parentBlockId === block.id);
      
      let contentPreview = null;
      switch(block.type) {
          case BlockType.HERO:
              contentPreview = (
                <div className="w-full h-full flex flex-col p-6 pt-12 opacity-40 relative block-content-wrapper">
                    {!hasChildren && (
                        <div className="h-8 w-2/3 mb-4 rounded-full export-hide" style={{ backgroundColor: textColor }} />
                    )}
                    {isSelected && (
                        <div className="absolute inset-6 border-2 border-dashed border-current opacity-30 rounded-2xl flex items-center justify-center pointer-events-none">
                            <span className="text-[10px] uppercase font-mono">
                                {block.heroProperties?.stackDirection === 'vertical' ? 'Stack Vertical' : 'Stack Horizontal'}
                            </span>
                        </div>
                    )}
                </div>
              );
              break;
          case BlockType.STATS:
              contentPreview = <div className="w-full h-full flex flex-col justify-between p-4 pt-10 block-content-wrapper"><div className="text-4xl font-bold export-hide" style={{ color: textColor }}>86%</div></div>;
              break;
          case BlockType.METRIC:
              contentPreview = <div className="w-full h-full flex flex-col justify-center items-center p-4 pt-10 text-center block-content-wrapper"><Activity size={32} className="mb-2 export-hide" style={{ color: textColor }} /></div>;
              break;
          case BlockType.IMAGE:
              contentPreview = (
                  <div className="w-full h-full relative flex flex-col rounded-2xl overflow-hidden pointer-events-auto block-content-wrapper">
                      {block.content ? (
                           <div className="relative w-full h-full group/image">
                               <img 
                                    src={block.content} 
                                    alt="Block Media" 
                                    className="w-full h-full object-cover"
                                    draggable={false}
                                    onDragStart={(e) => e.preventDefault()}
                               />
                               <button 
                                   onMouseDown={e => e.stopPropagation()}
                                   onClick={() => triggerImageUpload(block.id)}
                                   className="absolute top-2 right-2 bg-white/80 hover:bg-white text-gray-800 p-1.5 rounded-full opacity-0 group-hover/image:opacity-100 transition-opacity shadow-sm z-10 export-hide"
                                   title="Alterar Imagem"
                               >
                                   <Edit2 size={14} />
                               </button>
                           </div>
                      ) : (
                           <button 
                               onMouseDown={e => e.stopPropagation()}
                               onClick={() => triggerImageUpload(block.id)}
                               className="w-full h-full flex flex-col items-center justify-center bg-black/5 hover:bg-black/10 transition-colors text-gray-400 hover:text-brand-orange gap-2 border-2 border-dashed border-transparent hover:border-brand-orange/50 rounded-2xl pt-8 export-hide"
                           >
                               <ImageIcon size={32} />
                               <span className="text-xs font-medium">Adicionar Imagem</span>
                           </button>
                      )}
                  </div>
              );
              break;
          case BlockType.CHART:
               contentPreview = <div className="w-full h-full flex items-end gap-2 p-6 pt-14 justify-center opacity-50 block-content-wrapper"><BarChart2 size={32} className="export-hide" style={{color: textColor}} /></div>;
               break;
          case BlockType.LIST:
              contentPreview = <div className="p-4 pt-12 space-y-3 opacity-30 block-content-wrapper"><div className="h-2 w-full rounded export-hide" style={{ backgroundColor: textColor }} /></div>;
              break;
      }
      return contentPreview;
  };

  return (
    <div 
      ref={scrollContainerRef}
      className={`flex-1 bg-[#F3F4F6] overflow-auto relative flex justify-center p-8 md:p-12 shadow-inner w-full h-full ${isPanning || isSpacePressed ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      style={{ backgroundColor: '#F3F4F6' }}
      onMouseDown={handleMouseDown}
      id="canvas-bg"
    >
      <style>{`
        .clean-export-mode .export-hide,
        .clean-export-mode .block-header-wrapper {
            opacity: 0 !important;
            pointer-events: none;
        }
        /* Ensure images stay visible in clean mode */
        .clean-export-mode img {
            opacity: 1 !important;
        }
        /* More rounded blocks for the requested aesthetic */
        .rounded-extra {
            border-radius: 2.5rem; 
        }
      `}</style>

      <input 
        type="file"
        accept="image/*"
        ref={imageInputRef}
        className="hidden"
        onChange={handleImageSelect}
      />

      {selectionBox && (
          <div 
            className="absolute border border-brand-orange bg-brand-orange/10 z-50 pointer-events-none"
            style={{
                left: selectionBox.x,
                top: selectionBox.y,
                width: selectionBox.w,
                height: selectionBox.h
            }}
          />
      )}

      <div 
        id="canvas-export-area"
        style={{ 
            width: totalWidth * safeZoom, 
            height: calculatedHeight * safeZoom,
            flexShrink: 0,
            backgroundColor: canvasBackgroundColor
        }} 
        className="relative transition-all duration-75 ease-out shadow-2xl"
      >
          <div
            ref={containerRef}
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: totalWidth,
              height: calculatedHeight,
              transform: `scale(${safeZoom})`,
              backgroundColor: canvasBackgroundColor
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {renderGrid()}

            {/* Floating Dragged Blocks (Group Drag) */}
            {interaction?.type === 'DRAG' && activeDragId && dragPosition && (() => {
                 const rect = containerRef.current?.getBoundingClientRect();
                 if (!rect) return null;

                 // Active Block Position (Canvas Space)
                 const activeX = (dragPosition.x - rect.left) / safeZoom;
                 const activeY = (dragPosition.y - rect.top) / safeZoom;
                 
                 const activeInit = interaction.initialPositions[activeDragId];
                 if (!activeInit) return null;

                 // Render all moving blocks relative to the active drag
                 return (
                    <>
                        {Object.keys(interaction.initialPositions).map(id => {
                            const block = blocks.find(b => b.id === id);
                            if (!block) return null;
                            
                            const init = interaction.initialPositions[id];
                            
                            // Helper to get initial pixel coords
                            const getPx = (pos: GridPosition) => ({
                                x: MARGIN_PX + (pos.colStart - 1) * (colWidth + GUTTER_PX),
                                y: MARGIN_PX + (pos.rowStart - 1) * ROW_HEIGHT + (ROW_HEIGHT * 0.5)
                            });
                            
                            const activePx = getPx(activeInit);
                            const currentPx = getPx(init);
                            
                            const offsetX = currentPx.x - activePx.x;
                            const offsetY = currentPx.y - activePx.y;
                            
                            const left = activeX + offsetX;
                            const top = activeY + offsetY;
                            
                            const width = (block.position.colSpan * colWidth) + ((block.position.colSpan - 1) * GUTTER_PX);
                            const height = block.position.rowSpan * ROW_HEIGHT - ROW_HEIGHT;
                            
                            const textColor = getBestContrastingColor(block.color || '#FFFFFF', '#FFFFFF', '#000000');
                            
                            return (
                                <div
                                    key={`float-${id}`}
                                    style={{
                                        left, top, width, height,
                                        backgroundColor: block.color || COLORS.brand.white,
                                        color: textColor,
                                        zIndex: 100 + (block.type === BlockType.HERO ? 0 : 1), // Children above
                                        pointerEvents: 'none',
                                        opacity: 0.9,
                                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                                    }}
                                    className="absolute rounded-[2rem] border border-brand-orange flex items-center justify-center"
                                >
                                    {renderBlockContent(block, true, 'rgba(0,0,0,0.5)', textColor)}
                                </div>
                            );
                        })}
                    </>
                 );
            })()}

            {/* Ghost Blocks (Group) */}
            {ghostBlock && interaction?.type === 'DRAG' && (() => {
                 // Calculate delta based on ghostBlock.position vs active block initial
                 const initActive = interaction.initialPositions[interaction.activeBlockId];
                 const deltaCol = ghostBlock.position.colStart - initActive.colStart;
                 const deltaRow = ghostBlock.position.rowStart - initActive.rowStart;

                 return Object.keys(interaction.initialPositions).map(id => {
                     const init = interaction.initialPositions[id];
                     const pos = {
                         colStart: init.colStart + deltaCol,
                         rowStart: init.rowStart + deltaRow,
                         colSpan: init.colSpan,
                         rowSpan: init.rowSpan
                     };
                     
                     // Calculate Pixel Rect
                     const left = MARGIN_PX + (pos.colStart - 1) * (colWidth + GUTTER_PX);
                     const width = (pos.colSpan * colWidth) + ((pos.colSpan - 1) * GUTTER_PX);
                     const top = MARGIN_PX + (pos.rowStart - 1) * ROW_HEIGHT + (ROW_HEIGHT * 0.5);
                     const height = pos.rowSpan * ROW_HEIGHT - ROW_HEIGHT;
                     
                     // Handling Nested Scaling for Ghost Appearance
                     let finalLeft = left;
                     let finalWidth = width;
                     
                     const block = blocks.find(b => b.id === id);
                     if (block?.parentBlockId) {
                          const parentId = block.parentBlockId;
                          // Parent could be moving or static
                          let parentPos = blocks.find(p => p.id === parentId)?.position;
                          
                          if (interaction.initialPositions[parentId]) {
                              // Parent is moving too
                              const pInit = interaction.initialPositions[parentId];
                              parentPos = {
                                  ...pInit,
                                  colStart: pInit.colStart + deltaCol,
                                  rowStart: pInit.rowStart + deltaRow
                              };
                          }
                          
                          if (parentPos) {
                               const parentLeft = MARGIN_PX + (parentPos.colStart - 1) * (colWidth + GUTTER_PX);
                               const parentWidth = (parentPos.colSpan * colWidth) + ((parentPos.colSpan - 1) * GUTTER_PX);
                               const paddingX = GUTTER_PX; // Explicitly maintain Horizontal Padding
                               const innerWidth = parentWidth - (paddingX * 2);
                               const scale = innerWidth / parentWidth;
                               const relLeft = left - parentLeft;
                               finalLeft = parentLeft + paddingX + (relLeft * scale);
                               finalWidth = width * scale;
                          }
                     }
                     
                     return (
                        <div
                            key={`ghost-${id}`}
                            style={{
                                left: finalLeft, width: finalWidth, top, height,
                                borderColor: ghostBlock.contrastColor,
                                color: ghostBlock.contrastColor,
                                backgroundColor: ghostBlock.isValid ? 'rgba(255,255,255,0.1)' : 'rgba(239, 68, 68, 0.1)'
                            }}
                            className="absolute z-50 border-2 border-dashed rounded-[2rem] pointer-events-none flex items-center justify-center backdrop-blur-[1px]"
                        >
                            {id === interaction.activeBlockId && (
                                <div 
                                    className="font-bold px-3 py-1 rounded-full text-xs backdrop-blur-sm shadow-sm transition-colors"
                                    style={{ 
                                        backgroundColor: ghostBlock.isValid ? 'rgba(255,255,255,0.9)' : '#EF4444', 
                                        color: ghostBlock.isValid ? COLORS.brand.black : 'white'
                                    }}
                                >
                                    {ghostBlock.isValid ? 'Soltar Aqui' : 'Inválido'}
                                </div>
                            )}
                        </div>
                     );
                 });
            })()}

            {/* Ghost Block (Single/New Block) - Fallback */}
            {ghostBlock && (!interaction || interaction.type !== 'DRAG') && (() => {
                 let left = MARGIN_PX + (ghostBlock.position.colStart - 1) * (colWidth + GUTTER_PX);
                 let width = (ghostBlock.position.colSpan * colWidth) + ((ghostBlock.position.colSpan - 1) * GUTTER_PX);
                 let top = MARGIN_PX + (ghostBlock.position.rowStart - 1) * ROW_HEIGHT + (ROW_HEIGHT * 0.5);
                 let height = ghostBlock.position.rowSpan * ROW_HEIGHT - ROW_HEIGHT;

                 if (ghostBlock.parentBlockId) {
                    const parent = blocks.find(b => b.id === ghostBlock.parentBlockId);
                    if (parent) {
                        const parentLeft = MARGIN_PX + (parent.position.colStart - 1) * (colWidth + GUTTER_PX);
                        const parentWidth = (parent.position.colSpan * colWidth) + ((parent.position.colSpan - 1) * GUTTER_PX);
                        const paddingX = GUTTER_PX; // Explicitly maintain Horizontal Padding
                        const innerWidth = parentWidth - (paddingX * 2);
                        const scale = innerWidth / parentWidth;
                        const relLeft = left - parentLeft;
                        left = parentLeft + paddingX + (relLeft * scale);
                        width = width * scale;
                    }
                }

                return (
                    <div
                        style={{
                            left, width, top, height,
                            borderColor: ghostBlock.contrastColor,
                            color: ghostBlock.contrastColor,
                            backgroundColor: ghostBlock.isValid ? 'rgba(255,255,255,0.1)' : 'rgba(239, 68, 68, 0.1)'
                        }}
                        className="absolute z-50 border-2 border-dashed rounded-[2rem] pointer-events-none flex items-center justify-center backdrop-blur-[1px]"
                    >
                         <div 
                            className="font-bold px-3 py-1 rounded-full text-xs backdrop-blur-sm shadow-sm transition-colors"
                            style={{ 
                                backgroundColor: ghostBlock.isValid ? 'rgba(255,255,255,0.9)' : '#EF4444', 
                                color: ghostBlock.isValid ? COLORS.brand.black : 'white'
                            }}
                        >
                            {ghostBlock.isValid ? 'Soltar Aqui' : 'Inválido'}
                        </div>
                    </div>
                );
            })()}

            {sortedBlocks.map((block) => {
              // Hide if this specific block is part of the current drag interaction
              const isBeingDragged = activeDragId === block.id || (interaction?.type === 'DRAG' && interaction.initialPositions[block.id]);
              if (isBeingDragged) return null; 

              const isSelected = selectedBlockIds.includes(block.id);
              const isHero = block.type === BlockType.HERO;
              
              let left = MARGIN_PX + (block.position.colStart - 1) * (colWidth + GUTTER_PX);
              let width = (block.position.colSpan * colWidth) + ((block.position.colSpan - 1) * GUTTER_PX);
              
              if (block.parentBlockId) {
                  const parent = blocks.find(b => b.id === block.parentBlockId);
                  if (parent) {
                       const parentLeft = MARGIN_PX + (parent.position.colStart - 1) * (colWidth + GUTTER_PX);
                       const parentWidth = (parent.position.colSpan * colWidth) + ((parent.position.colSpan - 1) * GUTTER_PX);
                       const paddingX = GUTTER_PX; // Explicitly maintain Horizontal Padding
                       const innerWidth = parentWidth - (paddingX * 2);
                       const scale = innerWidth / parentWidth;
                       const relLeft = left - parentLeft;
                       left = parentLeft + paddingX + (relLeft * scale);
                       width = width * scale;
                  }
              }
              
              // Vertical offset logic maintained (+ 0.5 ROW_HEIGHT for centering on lines)
              const top = MARGIN_PX + (block.position.rowStart - 1) * ROW_HEIGHT + (ROW_HEIGHT * 0.5); 
              const height = block.position.rowSpan * ROW_HEIGHT - ROW_HEIGHT;

              const textColor = getBestContrastingColor(block.color || '#FFFFFF', '#FFFFFF', '#000000');
              const mutedColor = textColor === '#FFFFFF' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)';
              const hasChildren = blocks.some(b => b.parentBlockId === block.id);

              return (
                <motion.div
                  layout
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  key={block.id}
                  onMouseDown={(e) => handleInteractionStart(e, block.id, 'DRAG')}
                  onTouchStart={(e) => handleInteractionStart(e, block.id, 'DRAG')}
                  style={{
                    left, top, width, height,
                    backgroundColor: block.color || COLORS.brand.white,
                    opacity: block.opacity ?? 1,
                    position: 'absolute',
                    color: textColor,
                    zIndex: isHero ? (isSelected ? 10 : 5) : (isSelected ? 30 : 20),
                    boxShadow: isSelected 
                        ? `0 0 0 2px ${COLORS.brand.orange}, 0 20px 30px -10px rgba(0,0,0,0.3)` 
                        : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' // Softer, blurrier shadow
                  }}
                  className={`
                    group rounded-[2rem] flex flex-col overflow-hidden transition-shadow
                    ${isSelected ? 'ring-0' : 'hover:ring-2 ring-gray-200'}
                  `}
                >
                  {/* Drag Handle - Full Surface */}
                  
                  {/* Resize Handles */}
                  {isSelected && (
                    <>
                        <div 
                            className="absolute right-0 bottom-0 p-1 cursor-se-resize hover:bg-black/10 rounded-tl-lg z-50"
                            onMouseDown={(e) => handleInteractionStart(e, block.id, 'RESIZE')}
                            onTouchStart={(e) => handleInteractionStart(e, block.id, 'RESIZE')}
                        >
                            <Scaling size={14} />
                        </div>
                    </>
                  )}

                  <div className="flex-1 relative block-content-export-target">
                      {renderBlockContent(block, isSelected, mutedColor, textColor)}
                  </div>

                  {/* Header / Label */}
                  <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none z-20 block-header-wrapper">
                      <div className="flex flex-col">
                          <span className="text-xs font-bold uppercase tracking-wider opacity-70">{block.title}</span>
                          <span className="text-[10px] opacity-50">
                              {block.type === BlockType.HERO ? 'Hero Section' : `${block.position.colSpan}x${block.position.rowSpan}`}
                          </span>
                      </div>
                      {isSelected && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); /* Handled by app */ }}
                            className="pointer-events-auto p-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-colors"
                          >
                              <Trash2 size={14} />
                          </button>
                      )}
                  </div>
                </motion.div>
              );
            })}
          </div>
      </div>
    </div>
  );
};

export default GridCanvas;