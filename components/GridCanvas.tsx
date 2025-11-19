
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
const MIN_CHILD_ROWS = 3; // Minimum height for components (2 visual rows + margins)
const MIN_HERO_ROWS = 5;  // Minimum height for hero (4 visual rows + margins)

// --- Collision & Layout Helpers ---

const isHorizontalOverlap = (a: GridPosition, b: GridPosition) => {
  if (a.colStart + a.colSpan <= b.colStart) return false; // a left of b
  if (a.colStart >= b.colStart + b.colSpan) return false; // a right of b
  return true;
};

const isBufferViolation = (a: DashboardBlock, b: DashboardBlock) => {
  // Allow Parent-Child overlap (Nesting)
  if (a.parentBlockId === b.id || b.parentBlockId === a.id) {
      return false;
  }
  
  const posA = a.position;
  const posB = b.position;

  if (!isHorizontalOverlap(posA, posB)) return false;

  const aEnd = posA.rowStart + posA.rowSpan;
  const bEnd = posB.rowStart + posB.rowSpan;

  if (aEnd < posB.rowStart) return false;
  if (bEnd < posA.rowStart) return false;

  return true;
};

const constrainToParent = (childPos: GridPosition, parent: DashboardBlock): GridPosition => {
    let { colStart, rowStart, colSpan, rowSpan } = childPos;
    const { colStart: pCol, rowStart: pRow, colSpan: pSpan, rowSpan: pSpanH } = parent.position;
    const stackDirection = parent.heroProperties?.stackDirection || 'horizontal';

    // --- Constraints (Padding) ---
    // Vertical padding of 1 row (keeps header/footer space)
    const verticalPadding = 1;
    // Horizontal padding 0 (We use visual padding in rendering instead of grid constraint)
    const horizontalPadding = 0;

    const minRow = pRow + verticalPadding;
    const maxRowInclusive = pRow + pSpanH - 1 - verticalPadding;

    const minCol = pCol + horizontalPadding;
    const maxColInclusive = pCol + pSpan - 1 - horizontalPadding;
    const availableWidth = Math.max(1, pSpan - (horizontalPadding * 2));
    const availableHeight = Math.max(1, pSpanH - (verticalPadding * 2));

    // --- Apply Constraints based on Stack Direction ---

    if (stackDirection === 'vertical') {
        // Vertical Stack: Force width to fill available parent width
        colStart = minCol;
        colSpan = availableWidth; 
    } else {
        // Horizontal Stack: Force height to fill available parent height
        rowStart = minRow;
        rowSpan = availableHeight;
    }

    // --- Universal Clamping ---

    // Height
    if (rowSpan > availableHeight) rowSpan = availableHeight;
    if (rowStart < minRow) rowStart = minRow;
    if (rowStart + rowSpan - 1 > maxRowInclusive) rowStart = maxRowInclusive - rowSpan + 1;

    // Width
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
  // 1. Apply movements
  let updatedBlocks = blocks.map(b => 
    newPositions[b.id] 
      ? { ...b, position: newPositions[b.id] } 
      : b
  );
  
  // 2. Sort for collision resolution
  updatedBlocks.sort((a, b) => {
      if (a.position.rowStart === b.position.rowStart) {
          return a.position.colStart - b.position.colStart;
      }
      return a.position.rowStart - b.position.rowStart;
  });

  // 3. Resolve Collisions
  let hasCollision = true;
  let iterations = 0;
  while (hasCollision && iterations < 100) {
    hasCollision = false;
    iterations++;

    for(let i=0; i<updatedBlocks.length; i++) {
        const b1 = updatedBlocks[i];
        
        // Nested Constraints & Logic
        if (b1.parentBlockId) {
            const parent = updatedBlocks.find(p => p.id === b1.parentBlockId);
            if (parent) {
                // Just ensure it stays inside parent visually, 
                // complex resizing is handled in interaction loop
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

        // Regular Global Collision
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
  
  // --- Selection & Pan State ---
  const [isPanning, setIsPanning] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const panStartRef = useRef<{ x: number, y: number, scrollLeft: number, scrollTop: number } | null>(null);
  const selectionStartRef = useRef<{ x: number, y: number } | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  
  // --- Ghost State (Preview inside Hero) ---
  const [ghostBlock, setGhostBlock] = useState<{
      position: GridPosition,
      parentBlockId: string,
      type: BlockType,
      contrastColor: string,
      isValid: boolean
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
  } | null>(null);

  // --- Helper to calculate ghost position ---
  const calculateGhost = (x: number, y: number, widthCols: number, heightRows: number, type: BlockType, draggedBlockId?: string) => {
      // Prevent Hero nesting inside Hero
      if (type === BlockType.HERO) {
          setGhostBlock(null);
          return;
      }

      const { col, row } = getGridFromPixels(x, y);
      
      const potentialParent = blocks.find(other => 
          other.type === BlockType.HERO &&
          other.id !== draggedBlockId && // Can't be parent of self
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
          
          // 1. Constrain to Parent Boundaries first to get the "Ideal" slot
          tempPos = constrainToParent(tempPos, potentialParent);
          
          // 2. Adaptive Sizing: Check against Siblings and Shrink to Fit
          const siblings = blocks.filter(b => b.parentBlockId === potentialParent.id && b.id !== draggedBlockId);
          const stackDir = potentialParent.heroProperties?.stackDirection || 'horizontal';

          // Check overlap with siblings
          const checkOverlap = (pos: GridPosition) => {
              return siblings.some(sibling => {
                  return !(pos.colStart + pos.colSpan <= sibling.position.colStart ||
                           pos.colStart >= sibling.position.colStart + sibling.position.colSpan ||
                           pos.rowStart + pos.rowSpan <= sibling.position.rowStart ||
                           pos.rowStart >= sibling.position.rowStart + sibling.position.rowSpan);
              });
          };

          // Try to fit by shrinking if overlapping
          if (checkOverlap(tempPos)) {
              if (stackDir === 'vertical') {
                  // Vertical: Try to shrink Height to avoid overlap below
                   const siblingBelow = siblings
                        .filter(s => s.position.rowStart >= tempPos.rowStart)
                        .sort((a,b) => a.position.rowStart - b.position.rowStart)[0];
                   
                   if (siblingBelow) {
                       const avail = siblingBelow.position.rowStart - tempPos.rowStart;
                       tempPos.rowSpan = Math.max(MIN_CHILD_ROWS, avail);
                   }
              } else {
                   // Horizontal: Try to shrink Width to avoid overlap to right
                   const siblingRight = siblings
                        .filter(s => s.position.colStart >= tempPos.colStart)
                        .sort((a,b) => a.position.colStart - b.position.colStart)[0];

                   if (siblingRight) {
                       const avail = siblingRight.position.colStart - tempPos.colStart;
                       tempPos.colSpan = Math.max(MIN_CHILD_COLS, avail);
                   }
              }
          }

          // 3. Final Validation: Is it still overlapping or too small?
          const isTooSmall = tempPos.colSpan < MIN_CHILD_COLS || tempPos.rowSpan < MIN_CHILD_ROWS;
          const isOverlapping = checkOverlap(tempPos);
          const isValid = !isTooSmall && !isOverlapping;
          
          // Calculate high contrast color based on parent bg
          const parentBg = potentialParent.color || COLORS.brand.white;
          const contrastColor = isValid 
                ? getBestContrastingColor(parentBg, COLORS.brand.white, COLORS.brand.black)
                : '#EF4444'; // Red for error

          setGhostBlock({
              position: tempPos,
              parentBlockId: potentialParent.id,
              type,
              contrastColor,
              isValid
          });
      } else {
          setGhostBlock(null);
      }
  };

  // --- Image Upload Handlers ---
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
      // Small timeout to ensure state is set before click if needed, though React 18 batches.
      setTimeout(() => imageInputRef.current?.click(), 0);
  };

  // --- Keyboard Listeners ---
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

  // --- Pan & Zoom Handlers ---
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

  // Global Mouse Move/Up
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


  // --- Block Interaction Logic ---

  const handleInteractionStart = (
      e: React.MouseEvent | React.TouchEvent, 
      blockId: string, 
      type: 'DRAG' | 'RESIZE'
  ) => {
      e.stopPropagation();

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      // Selection Logic
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

      setInteraction({
          type,
          activeBlockId: blockId,
          startX: clientX,
          startY: clientY,
          initialPositions,
          hasMoved: false,
          selectionBounds: { minCol, maxCol, minRow, maxRow }
      });
  };

  // Interaction Move/End
  useEffect(() => {
      const handleMove = (e: MouseEvent | TouchEvent) => {
          if (!interaction) return;
          if (e.cancelable && e.type === 'touchmove') e.preventDefault();

          const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

          const deltaXPixels = (clientX - interaction.startX) / safeZoom;
          const deltaYPixels = (clientY - interaction.startY) / safeZoom;

          if (!interaction.hasMoved && (Math.abs(deltaXPixels) > 2 || Math.abs(deltaYPixels) > 2)) {
             onSaveCheckpoint();
             setInteraction(prev => prev ? ({...prev, hasMoved: true}) : null);
          }

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

              // Prevent overwriting children if parent is resizing them
              const parentIsActiveResizer = block?.parentBlockId && block.parentBlockId === interaction.activeBlockId && interaction.type === 'RESIZE';
              if (parentIsActiveResizer) return;

              const initial = interaction.initialPositions[id];
              const newPos = { ...initial };

              if (interaction.type === 'DRAG') {
                  newPos.colStart = initial.colStart + clampedColDelta;
                  newPos.rowStart = initial.rowStart + clampedRowDelta;
              } else if (id === interaction.activeBlockId) {
                  const deltaC = Math.round(deltaXPixels / (colWidth + GUTTER_PX));
                  const deltaR = Math.round(deltaYPixels / ROW_HEIGHT);
                  
                  let newColSpan = Math.max(1, Math.min(gridColumns - initial.colStart + 1, initial.colSpan + deltaC));
                  
                  // Determine Min Rows based on type
                  const minRows = block?.type === BlockType.HERO ? MIN_HERO_ROWS : MIN_CHILD_ROWS;
                  let newRowSpan = Math.max(minRows, initial.rowSpan + deltaR);

                  // Constraint: If Child, respect Parent bounds
                  if (block?.parentBlockId) {
                      const parent = blocks.find(p => p.id === block.parentBlockId);
                      if (parent) {
                          const padding = 0; // Changed to 0 to match new constraint logic
                          const maxColAvailable = (parent.position.colStart + parent.position.colSpan - padding) - initial.colStart;
                          const maxRowAvailable = (parent.position.rowStart + parent.position.rowSpan - 1) - initial.rowStart; // -1 for bottom padding
                          
                          newColSpan = Math.min(newColSpan, maxColAvailable);
                          newRowSpan = Math.min(newRowSpan, maxRowAvailable);
                      }
                  }

                  if (block && block.type === BlockType.HERO) {
                      // Hero Resize Logic
                      const stackDir = block.heroProperties?.stackDirection || 'horizontal';
                      const children = blocks.filter(child => child.parentBlockId === id);
                      const padding = 0; // 0 horizontal padding
                      
                      // Calculate MINIMUM dimensions required by children
                      // If any child hits min size, we must block resizing the hero smaller
                      let minRequiredWidth = 5;
                      let minRequiredHeight = 3;

                      if (children.length > 0) {
                           if (stackDir === 'horizontal') {
                               // Sum of minimum width of all children
                               minRequiredWidth = (children.length * MIN_CHILD_COLS) + padding;
                               // Max of minimum height of children (plus padding)
                               minRequiredHeight = MIN_CHILD_ROWS + padding;
                           } else {
                               // Max of minimum width of children
                               minRequiredWidth = MIN_CHILD_COLS + padding;
                               // Sum of minimum height of all children
                               minRequiredHeight = (children.length * MIN_CHILD_ROWS) + padding;
                           }
                      }
                      
                      newColSpan = Math.max(minRequiredWidth, newColSpan);
                      newRowSpan = Math.max(minRequiredHeight, newRowSpan);

                      // Sibling Clamp Logic to avoid "Self Displacement" via Collision Resolver
                      const siblings = blocks.filter(b => b.id !== id && b.parentBlockId === block.parentBlockId);
                      for (const sib of siblings) {
                          // Y Overlap Check
                          const myY1 = initial.rowStart;
                          const myY2 = initial.rowStart + newRowSpan;
                          const sibY1 = sib.position.rowStart;
                          const sibY2 = sib.position.rowStart + sib.position.rowSpan;
                          
                          if (myY1 < sibY2 && myY2 > sibY1) {
                               // Check if we are expanding Right into a sibling
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
                                     // Accumulate rounding errors or min-size enforcement could push bounds
                                     
                                     const initRelHeight = initChildPos.rowSpan;
                                     let newRelHeight = Math.max(MIN_CHILD_ROWS, Math.round(initRelHeight * scaleY));
                                     // Vertical constraint for horizontal stack child
                                     if (newRelHeight > curAvailableH) newRelHeight = curAvailableH;

                                     let newChildStart = newPos.colStart + 0 + Math.round(initRelStart * scaleX);
                                     if (newChildStart < previousEnd) newChildStart = previousEnd;

                                     // Safety Check: If this child pushes past the Hero boundary, invalidate/clamp
                                     if (newChildStart + newRelWidth > newPos.colStart + newColSpan) {
                                          // Try to squeeze
                                          newRelWidth = (newPos.colStart + newColSpan) - newChildStart;
                                     }

                                     if (newRelWidth < MIN_CHILD_COLS) resizeInvalid = true;

                                     potentialChildrenUpdates[child.id] = {
                                         colStart: newChildStart,
                                         colSpan: newRelWidth,
                                         rowStart: newPos.rowStart + 1, 
                                         rowSpan: newRelHeight // Adapt height to parent
                                     };
                                     
                                     previousEnd = newChildStart + newRelWidth;

                                } else {
                                     // Vertical
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
                                         colStart: newPos.colStart + 0, // No offset for vertical stack
                                         colSpan: newRelWidth,
                                         rowStart: newChildStart,
                                         rowSpan: newRelHeight
                                     };

                                     previousEnd = newChildStart + newRelHeight;
                                }
                           });

                           if (!resizeInvalid) {
                               Object.assign(newPositions, potentialChildrenUpdates);
                               hasChanges = true;
                           } else {
                               // Block resize if it violates children min constraints
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
          
          if (interaction.type === 'DRAG' && targetIds.length === 1) {
             const draggedBlock = blocks.find(b => b.id === targetIds[0]);
             if (draggedBlock) {
                 const centerX = interaction.startX + deltaXPixels * safeZoom;
                 const centerY = interaction.startY + deltaYPixels * safeZoom; 
                 calculateGhost(centerX, centerY, draggedBlock.position.colSpan, draggedBlock.position.rowSpan, draggedBlock.type, draggedBlock.id);
             }
          }

          if (hasChanges) {
              const resolvedBlocks = moveBlock(blocks, targetIds, newPositions);
              onUpdateBlocks(resolvedBlocks);
          }
      };

      const handleEnd = () => {
          if (!interaction) return;
          
          if (interaction.type === 'DRAG' && interaction.hasMoved) {
              if (ghostBlock) {
                   if (ghostBlock.isValid) {
                       const targetId = Object.keys(interaction.initialPositions)[0];
                       const block = blocks.find(b => b.id === targetId);
                       if (block) {
                           const updatedBlocks = blocks.map(b => 
                               b.id === targetId 
                               ? { ...b, position: ghostBlock.position, parentBlockId: ghostBlock.parentBlockId } 
                               : b
                           );
                           onUpdateBlocks(moveBlock(updatedBlocks, [targetId], {}));
                       }
                   } else {
                       // Invalid Drop - Revert (Do nothing, as we haven't committed changes to state other than intermediate moves)
                       // Actually, we were updating state live in handleMove. We need to snap back if invalid ghost.
                       // But wait, moveBlock updates the main state. 
                       // If we are dragging, the block follows the mouse via interaction loop (visually?), 
                       // NO, we are updating 'blocks' state in handleMove.
                       // So we MUST revert if ghost is invalid and we were trying to enter a parent.
                       
                       // Use the initial position to revert if the ghost was active but invalid
                       const targetId = Object.keys(interaction.initialPositions)[0];
                       const initial = interaction.initialPositions[targetId];
                       
                       // If we were trying to drag into a parent (ghost active) but it was red:
                       // Revert to position BEFORE we entered the ghost state/start of drag
                       onUpdateBlocks(blocks.map(b => b.id === targetId ? { ...b, position: initial } : b));
                   }
              } else {
                  const targetIds = Object.keys(interaction.initialPositions);
                  let finalBlocks = [...blocks];
                  
                  finalBlocks = finalBlocks.map(b => {
                      // Detach if parent is not moving with it
                      if (targetIds.includes(b.id) && b.parentBlockId) {
                          const parentIsMoving = targetIds.includes(b.parentBlockId);
                          if (!parentIsMoving) {
                              return { ...b, parentBlockId: undefined };
                          }
                      }
                      return b;
                  });
                  
                  onUpdateBlocks(moveBlock(finalBlocks, [], {}));
              }
          }
          
          setGhostBlock(null);
          setInteraction(null);
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
  }, [interaction, blocks, colWidth, safeZoom, onUpdateBlocks, gridColumns, onSaveCheckpoint, ghostBlock]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    
    // Check validity if dropping into ghost
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

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      if (draggingBlockType) {
        const preset = COMPONENT_PALETTE.find(c => c.type === draggingBlockType);
        if (preset) {
            calculateGhost(e.clientX, e.clientY, preset.defaultCols, preset.defaultRows, draggingBlockType);
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

  // Sort: Hero (5/10) < Children (20/30).
  // If Hero is selected, it goes to 10 (above unselected Heroes, below children).
  const sortedBlocks = [...blocks].sort((a, b) => {
      const isASel = selectedBlockIds.includes(a.id);
      const isBSel = selectedBlockIds.includes(b.id);
      
      const getZ = (block: DashboardBlock, isSel: boolean) => {
          if (block.type === BlockType.HERO) return isSel ? 10 : 5; 
          return isSel ? 30 : 20;
      }
      return getZ(a, isASel) - getZ(b, isBSel);
  });

  return (
    <div 
      ref={scrollContainerRef}
      className={`flex-1 bg-[#F3F4F6] overflow-auto relative flex justify-center p-8 md:p-12 shadow-inner w-full h-full ${isPanning || isSpacePressed ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      style={{ backgroundColor: '#F3F4F6' }}
      onMouseDown={handleMouseDown}
      id="canvas-bg"
    >
      {/* Hidden Input for File Upload */}
      <input 
        type="file"
        accept="image/*"
        ref={imageInputRef}
        className="hidden"
        onChange={handleImageSelect}
      />

      {/* Selection Box Overlay */}
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

            {/* Render Ghost Block if active */}
            {ghostBlock && (() => {
                // Calculate Ghost Position using the same logic as regular children
                let left = MARGIN_PX + (ghostBlock.position.colStart - 1) * (colWidth + GUTTER_PX);
                let width = (ghostBlock.position.colSpan * colWidth) + ((ghostBlock.position.colSpan - 1) * GUTTER_PX);
                const top = MARGIN_PX + (ghostBlock.position.rowStart - 1) * ROW_HEIGHT + (ROW_HEIGHT * 0.5);
                const height = ghostBlock.position.rowSpan * ROW_HEIGHT - ROW_HEIGHT;
                
                if (ghostBlock.parentBlockId) {
                    const parent = blocks.find(b => b.id === ghostBlock.parentBlockId);
                    if (parent) {
                        const parentLeft = MARGIN_PX + (parent.position.colStart - 1) * (colWidth + GUTTER_PX);
                        const parentWidth = (parent.position.colSpan * colWidth) + ((parent.position.colSpan - 1) * GUTTER_PX);
                        const paddingX = ROW_HEIGHT * 0.5;
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
                            left,
                            width,
                            top,
                            height,
                            borderColor: ghostBlock.contrastColor,
                            color: ghostBlock.contrastColor,
                            backgroundColor: ghostBlock.isValid ? 'rgba(255,255,255,0.1)' : 'rgba(239, 68, 68, 0.1)'
                        }}
                        className="absolute z-50 border-2 border-dashed rounded-3xl pointer-events-none flex items-center justify-center backdrop-blur-[1px]"
                    >
                        <div 
                            className="font-bold px-3 py-1 rounded-full text-xs backdrop-blur-sm shadow-sm transition-colors"
                            style={{ 
                                backgroundColor: ghostBlock.isValid ? 'rgba(255,255,255,0.9)' : '#EF4444', 
                                color: ghostBlock.isValid ? COLORS.brand.black : 'white'
                            }}
                        >
                            {ghostBlock.isValid ? 'Solte para agrupar' : 'Espaço Insuficiente'}
                        </div>
                    </div>
                );
            })()}

            {sortedBlocks.map((block) => {
              const isSelected = selectedBlockIds.includes(block.id);
              const isHero = block.type === BlockType.HERO;
              
              let left = MARGIN_PX + (block.position.colStart - 1) * (colWidth + GUTTER_PX);
              let width = (block.position.colSpan * colWidth) + ((block.position.colSpan - 1) * GUTTER_PX);
              
              // --- NESTED CHILD RENDERING LOGIC ---
              if (block.parentBlockId) {
                  const parent = blocks.find(b => b.id === block.parentBlockId);
                  if (parent) {
                       const parentLeft = MARGIN_PX + (parent.position.colStart - 1) * (colWidth + GUTTER_PX);
                       const parentWidth = (parent.position.colSpan * colWidth) + ((parent.position.colSpan - 1) * GUTTER_PX);
                       
                       // Symmetric Padding for Children inside Hero
                       const paddingX = ROW_HEIGHT * 0.5;
                       const innerWidth = parentWidth - (paddingX * 2);
                       const scale = innerWidth / parentWidth;
                       
                       const relLeft = left - parentLeft;
                       
                       left = parentLeft + paddingX + (relLeft * scale);
                       width = width * scale;
                  }
              }
              
              const top = MARGIN_PX + (block.position.rowStart - 1) * ROW_HEIGHT + (ROW_HEIGHT * 0.5); 
              const height = block.position.rowSpan * ROW_HEIGHT - ROW_HEIGHT;

              const textColor = getBestContrastingColor(block.color || '#FFFFFF', '#FFFFFF', '#000000');
              const mutedColor = textColor === '#FFFFFF' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)';

              const hasChildren = blocks.some(b => b.parentBlockId === block.id) || (ghostBlock?.parentBlockId === block.id);

              let contentPreview = null;
              switch(block.type) {
                  case BlockType.HERO:
                      contentPreview = (
                        <div className="w-full h-full flex flex-col p-6 opacity-40 relative">
                            {!hasChildren && (
                                <div className="h-8 w-2/3 mb-4 rounded-full" style={{ backgroundColor: textColor }} />
                            )}
                            {isSelected && (
                                <div className="absolute inset-6 border-2 border-dashed border-current opacity-30 rounded-lg flex items-center justify-center">
                                    <span className="text-[10px] uppercase font-mono">
                                        {block.heroProperties?.stackDirection === 'vertical' ? 'Stack Vertical' : 'Stack Horizontal'}
                                    </span>
                                </div>
                            )}
                        </div>
                      );
                      break;
                  case BlockType.STATS:
                      contentPreview = <div className="w-full h-full flex flex-col justify-between p-4"><div className="text-4xl font-bold" style={{ color: textColor }}>86%</div></div>;
                      break;
                  case BlockType.METRIC:
                      contentPreview = <div className="w-full h-full flex flex-col justify-center items-center p-4 text-center"><Activity size={32} className="mb-2" style={{ color: textColor }} /></div>;
                      break;
                  case BlockType.IMAGE:
                      contentPreview = (
                          <div className="w-full h-full relative flex flex-col rounded-xl overflow-hidden pointer-events-auto">
                              {block.content ? (
                                   <div className="relative w-full h-full group/image">
                                       <img src={block.content} alt="Block Media" className="w-full h-full object-cover" />
                                       <button 
                                           onMouseDown={e => e.stopPropagation()}
                                           onClick={() => triggerImageUpload(block.id)}
                                           className="absolute top-2 right-2 bg-white/80 hover:bg-white text-gray-800 p-1.5 rounded-full opacity-0 group-hover/image:opacity-100 transition-opacity shadow-sm"
                                           title="Alterar Imagem"
                                       >
                                           <Edit2 size={14} />
                                       </button>
                                   </div>
                              ) : (
                                   <button 
                                       onMouseDown={e => e.stopPropagation()}
                                       onClick={() => triggerImageUpload(block.id)}
                                       className="w-full h-full flex flex-col items-center justify-center bg-black/5 hover:bg-black/10 transition-colors text-gray-400 hover:text-brand-orange gap-2 border-2 border-dashed border-transparent hover:border-brand-orange/50 rounded-xl"
                                   >
                                       <ImageIcon size={32} />
                                       <span className="text-xs font-medium">Adicionar Imagem</span>
                                   </button>
                              )}
                          </div>
                      );
                      break;
                  case BlockType.CHART:
                       contentPreview = <div className="w-full h-full flex items-end gap-2 p-6 justify-center opacity-50"><BarChart2 size={32} style={{color: textColor}} /></div>;
                       break;
                  case BlockType.LIST:
                      contentPreview = <div className="p-4 space-y-3 opacity-30"><div className="h-2 w-full rounded" style={{ backgroundColor: textColor }} /></div>;
                      break;
              }

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
                    zIndex: isHero ? (isSelected ? 10 : 5) : (isSelected ? 30 : 20)
                  }}
                  className={`
                    rounded-3xl border group backdrop-blur-sm shadow-[0_20px_40px_rgba(0,0,0,0.1)]
                    transition-shadow duration-200
                    ${isSelected ? 'ring-2 ring-brand-orange border-brand-orange' : 'border-white/50'}
                    ${isHero && !isSelected ? 'hover:border-gray-300' : ''}
                  `}
                >
                  {(!isHero || !hasChildren) && (
                    <div className="absolute top-3 left-4 right-12 pointer-events-none truncate export-exclude-content z-20">
                        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: mutedColor }}>{block.title}</h3>
                    </div>
                  )}
                  
                  {isSelected && selectedBlockIds.length === 1 && (
                     <button
                        className="absolute top-2 right-2 p-1.5 hover:bg-red-50 rounded-md z-40 ui-helper transition-colors"
                        style={{ color: textColor === '#FFFFFF' ? '#ffaaaa' : '#ff0000' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSaveCheckpoint();
                            onSelectBlocks([]);
                            onUpdateBlocks(blocks.filter(b => b.id !== block.id));
                        }}
                     >
                        <Trash2 size={14} />
                     </button>
                  )}
                  
                  {/* Content Layer - Pointer Events allowed for interactive children (like image upload button) */}
                  <div className="absolute inset-0 mt-8 pointer-events-none export-exclude-content z-10">
                      {contentPreview}
                  </div>
                  
                  <div
                    className={`absolute bottom-0 right-0 w-6 h-6 cursor-se-resize z-30 flex items-center justify-center hover:text-brand-orange ui-helper ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    style={{ color: mutedColor }}
                    onMouseDown={(e) => handleInteractionStart(e, block.id, 'RESIZE')}
                    onTouchStart={(e) => handleInteractionStart(e, block.id, 'RESIZE')}
                  >
                    <Scaling size={14} />
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
