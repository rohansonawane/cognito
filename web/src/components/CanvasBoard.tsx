import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export type HistorySnapshot = {
  id: string;
  label: string;
  ts: number;
  index: number;
  active: boolean;
};

type HistoryEntry = {
  id: string;
  data: string;
  ts: number;
  label?: string;
};

export type CanvasBoardRef = {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportPng: () => string | null;
  saveBoard?: () => void;
  loadImage: (dataUrl: string) => void;
  setZoom: (delta: number) => void;
  resetView: () => void;
  getStrokesJSON?: () => string;
  setStrokesJSON?: (json: string) => void;
  createHistorySnapshot?: (label?: string) => void;
  getHistoryTimeline?: () => HistorySnapshot[];
  jumpToHistory?: (entryId: string) => void;
  deleteHistorySnapshot?: (entryId: string) => void;
  getSelectedTextField?: () => CanvasTextField | null;
  resizeSelectedTextField?: (size: { width?: number; height?: number }, options?: { commit?: boolean }) => void;
};

export type ShapeKind = 'line' | 'rect' | 'ellipse' | 'arrow' | 'double-arrow' | 'triangle' | 'diamond' | 'hexagon';
export type BrushKind = 'brush' | 'marker' | 'highlighter' | 'eraser' | ShapeKind | 'text';

type Props = {
  brush: BrushKind;
  color: string;
  size: number;
  onHistoryUpdate?: (timeline: HistorySnapshot[]) => void;
  showGrid?: boolean;
  gridSize?: number;
  onTextFieldChange?: (field: CanvasTextField | null) => void;
  panMode?: boolean;
};

const MAX_HISTORY = 60;

const createHistoryId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Point = { x: number; y: number; p: number };
type FreeMode = 'brush' | 'marker' | 'highlighter' | 'eraser';
type Stroke = {
  mode: FreeMode | 'shape';
  shape?: ShapeKind;
  color: string;
  size: number;
  points: Point[];
  closed?: boolean;
};
type TextField = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize: number;
};

export type CanvasTextField = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize: number;
};

const SHAPE_KINDS: ShapeKind[] = ['line', 'rect', 'ellipse', 'arrow', 'double-arrow', 'triangle', 'diamond', 'hexagon'];
const SHAPE_SET = new Set<ShapeKind>(SHAPE_KINDS);
const isShapeBrush = (mode: BrushKind): mode is ShapeKind => SHAPE_SET.has(mode as ShapeKind);
// Touch-only: small delay so users can scroll the page without accidentally drawing.
const HOLD_TO_DRAW_MS = 220;
const HOLD_MOVE_THRESHOLD_PX = 4;

export const CanvasBoard = forwardRef<CanvasBoardRef, Props>(({ brush, color, size, onHistoryUpdate, showGrid = false, gridSize = 24, onTextFieldChange, panMode = false }, ref) => {
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const hitRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const ctxBgRef = useRef<CanvasRenderingContext2D | null>(null);
  const ctxGridRef = useRef<CanvasRenderingContext2D | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const ctxOverlayRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawingRef = useRef(false);
  const pointsRef = useRef<Point[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const dprRef = useRef<number>(Math.min(2, Math.max(1, window.devicePixelRatio || 1)));
  const brushRef = useRef(brush);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  const zoomRef = useRef<number>(1);
  const panRef = useRef<{x:number;y:number}>({x:0,y:0});
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{x:number;y:number}>({x:0,y:0});
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const bgPlacementRef = useRef<{dx:number;dy:number;dw:number;dh:number} | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const textFieldsRef = useRef<TextField[]>([]);
  const editingTextFieldRef = useRef<string | null>(null);
  const selectedTextFieldRef = useRef<string | null>(null);
  const resizingTextFieldRef = useRef<{id: string; handle: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's'} | null>(null);
  const draggingTextFieldRef = useRef<string | null>(null);
  const textFieldDragOffsetRef = useRef<{x: number; y: number} | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const pointersRef = useRef<Map<number, {x:number;y:number}>>(new Map());
  const pinchStartRef = useRef<{dist:number; center:{x:number;y:number}; pan:{x:number;y:number}; zoom:number} | null>(null);
  const spacePressedRef = useRef<boolean>(false);
  const showGridRef = useRef<boolean>(showGrid);
  const gridSizeRef = useRef<number>(gridSize);
  const pointerClientRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const pointerWorldRef = useRef<{ x: number; y: number } | null>(null);
  // Local pointer position in hit-layer coordinates (CSS pixels). Keeps cursor perfectly aligned.
  const pointerLocalRef = useRef<{ x: number; y: number } | null>(null);
  const isActivelyDrawingRef = useRef<boolean>(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const holdPointerIdRef = useRef<number | null>(null);
  const holdReadyRef = useRef<boolean>(false);
  const panModeRef = useRef<boolean>(panMode);
  // Performance: throttle preview drawing to animation frames, and avoid O(n^2) redraw during long strokes.
  const previewRafRef = useRef<number | null>(null);
  // UX: hide the custom brush cursor ring (blue dashed circle) entirely.
  const SHOW_BRUSH_CURSOR = false;

  function updatePointerRefs(clientX: number, clientY: number) {
    const hit = hitRef.current as HTMLDivElement | null;
    if (!hit) return null;
    const rect = hit.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    pointerClientRef.current = { clientX, clientY };
    pointerLocalRef.current = { x: localX, y: localY };
    const z = zoomRef.current || 1;
    const pan = panRef.current;
    pointerWorldRef.current = { x: (localX - pan.x) / z, y: (localY - pan.y) / z };
    return { localX, localY };
  }

  function armHold(pointerId: number) {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
    }
    holdPointerIdRef.current = pointerId;
    holdReadyRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      holdReadyRef.current = true;
    }, HOLD_TO_DRAW_MS) as unknown as number;
  }

  function cancelHold(pointerId?: number) {
    if (typeof pointerId === 'number' && holdPointerIdRef.current !== pointerId) {
      return;
    }
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
    }
    holdTimerRef.current = null;
    holdPointerIdRef.current = null;
    holdReadyRef.current = false;
  }

  function beginDrawingInteraction(e: PointerEvent) {
    cancelHold();
    isActivelyDrawingRef.current = true;
    if (hitRef.current) {
      if (e.pointerType === 'touch') {
        hitRef.current.style.touchAction = 'none';
      }
      try { (hitRef.current as HTMLDivElement).setPointerCapture?.(e.pointerId); } catch {}
    }
    isDrawingRef.current = true;
    pointsRef.current = [];
    addPoint(e);
    // Clear overlay once at stroke start.
    const ctxO = ctxOverlayRef.current;
    if (ctxO) {
      ctxO.setTransform(1, 0, 0, 1, 0, 0);
      ctxO.clearRect(0, 0, ctxO.canvas.width, ctxO.canvas.height);
    }
    schedulePreview();
  }

  function schedulePreview() {
    if (previewRafRef.current != null) return;
    previewRafRef.current = window.requestAnimationFrame(() => {
      previewRafRef.current = null;
      renderPreview();
    });
  }

  function syncPointerWorldFromClient() {
    const hit = hitRef.current;
    const pointer = pointerClientRef.current;
    if (!hit || !pointer) return;
    const rect = hit.getBoundingClientRect();
    const localX = pointer.clientX - rect.left;
    const localY = pointer.clientY - rect.top;
    const z = zoomRef.current || 1;
    const pan = panRef.current;
    pointerWorldRef.current = { x: (localX - pan.x) / z, y: (localY - pan.y) / z };
  }
  const onTextFieldChangeRef = useRef(onTextFieldChange);
  useEffect(() => {
    onTextFieldChangeRef.current = onTextFieldChange;
  }, [onTextFieldChange]);
  useEffect(() => {
    panModeRef.current = !!panMode;
  }, [panMode]);

  useEffect(() => {
    const updateDpr = () => {
      const next = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      if (Math.abs(next - dprRef.current) < 0.01) return;
      dprRef.current = next;
      resize();
      renderAll();
      drawBrushCursorOnly();
    };
    const mql = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mql.addEventListener('change', updateDpr);
    window.addEventListener('resize', updateDpr);
    return () => {
      mql.removeEventListener('change', updateDpr);
      window.removeEventListener('resize', updateDpr);
    };
  }, []);

  const cloneTextField = (field: TextField): CanvasTextField => ({
    id: field.id,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    text: field.text,
    color: field.color,
    fontSize: field.fontSize,
  });

  const findSelectedTextField = (): TextField | null => {
    const id = selectedTextFieldRef.current;
    if (!id) return null;
    return textFieldsRef.current.find((f) => f.id === id) || null;
  };

  const notifySelectedTextField = () => {
    const cb = onTextFieldChangeRef.current;
    if (!cb) return;
    const field = findSelectedTextField();
    cb(field ? cloneTextField(field) : null);
  };

  const getMeasureContext = () => {
    if (!measureCtxRef.current) {
      const canvas = document.createElement('canvas');
      measureCtxRef.current = canvas.getContext('2d');
    }
    return measureCtxRef.current || ctxRef.current || null;
  };

  const getWrappedTextLines = (field: TextField, widthOverride?: number): string[] => {
    const text = field.text || '';
    if (!text) return [];
    const ctx = getMeasureContext();
    if (!ctx) return [text];
    ctx.font = `${field.fontSize}px sans-serif`;
    const maxWidth = Math.max(4, (widthOverride ?? field.width) - 4);
    const paragraphs = text.split(/\r?\n/);
    const lines: string[] = [];

    const flushLine = (line: string) => {
      lines.push(line);
    };

    const breakLongWord = (word: string) => {
      if (!word) return [''];
      const chunks: string[] = [];
      let current = '';
      for (const char of word) {
        const test = current + char;
        if (ctx.measureText(test).width > maxWidth && current) {
          chunks.push(current);
          current = char;
        } else {
          current = test;
        }
      }
      if (current) chunks.push(current);
      return chunks;
    };

    for (const paragraph of paragraphs) {
      const words = paragraph.length ? paragraph.split(' ') : [''];
      let currentLine = '';
      for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(candidate).width > maxWidth) {
          if (currentLine) {
            flushLine(currentLine);
            currentLine = '';
          }
          const broken = breakLongWord(word);
          while (broken.length > 1) {
            flushLine(broken.shift()!);
          }
          currentLine = broken.pop() || '';
        } else {
          currentLine = candidate;
        }
      }
      flushLine(currentLine);
    }

    return lines;
  };

  const autoResizeFieldHeight = (field: TextField, options?: { enforceMinOnly?: boolean }): boolean => {
    const lines = getWrappedTextLines(field);
    const lineCount = Math.max(1, lines.length || (field.text ? 1 : 0));
    const lineHeight = field.fontSize * 1.2;
    const minHeight = field.fontSize * 1.5;
    const requiredHeight = Math.max(minHeight, lineCount * lineHeight + 4);
    const nextHeight = options?.enforceMinOnly ? Math.max(field.height, requiredHeight) : requiredHeight;
    if (Math.abs(nextHeight - field.height) > 0.5) {
      field.height = nextHeight;
      return true;
    }
    return false;
  };

  const resizeSelectedField = (size: { width?: number; height?: number } = {}, options?: { commit?: boolean }) => {
    const field = findSelectedTextField();
    if (!field) return;
    let changed = false;
    let widthChanged = false;
    let heightChanged = false;
    if (typeof size.width === 'number' && Number.isFinite(size.width)) {
      const nextWidth = Math.max(50, size.width);
      if (Math.abs(nextWidth - field.width) > 0.1) {
        field.width = nextWidth;
        changed = true;
        widthChanged = true;
      }
    }
    if (typeof size.height === 'number' && Number.isFinite(size.height)) {
      const nextHeight = Math.max(20, size.height);
      if (Math.abs(nextHeight - field.height) > 0.1) {
        field.height = nextHeight;
        changed = true;
        heightChanged = true;
      }
    }
    if (widthChanged) {
      if (autoResizeFieldHeight(field, { enforceMinOnly: heightChanged })) {
        changed = true;
      }
    }
    if (!changed) return;
    updateTextInputPosition();
    renderAll();
    notifySelectedTextField();
    if (options?.commit) {
      pushHistory();
    }
  };

  function getTextFieldAtPoint(x: number, y: number): { field: TextField; handle?: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's' } | null {
    const z = zoomRef.current || 1;
    const pan = panRef.current;
    const worldX = (x - pan.x) / z;
    const worldY = (y - pan.y) / z;
    const handleSize = 10 / z; // Slightly larger for easier clicking
    
    for (const field of textFieldsRef.current) {
      const left = field.x;
      const top = field.y;
      const right = field.x + field.width;
      const bottom = field.y + field.height;
      
      // First check if inside the field (excluding handle areas)
      const isInside = worldX >= left && worldX <= right && worldY >= top && worldY <= bottom;
      
      if (isInside) {
        // Check resize handles (handles take priority if clicked directly on them)
        // Corner handles
        if (worldX >= right - handleSize && worldY >= bottom - handleSize) {
          return { field, handle: 'se' };
        }
        if (worldX <= left + handleSize && worldY >= bottom - handleSize) {
          return { field, handle: 'sw' };
        }
        if (worldX >= right - handleSize && worldY <= top + handleSize) {
          return { field, handle: 'ne' };
        }
        if (worldX <= left + handleSize && worldY <= top + handleSize) {
          return { field, handle: 'nw' };
        }
        // Edge handles (only if not in corner)
        if (worldX >= right - handleSize && worldY > top + handleSize && worldY < bottom - handleSize) {
          return { field, handle: 'e' };
        }
        if (worldX <= left + handleSize && worldY > top + handleSize && worldY < bottom - handleSize) {
          return { field, handle: 'w' };
        }
        if (worldY <= top + handleSize && worldX > left + handleSize && worldX < right - handleSize) {
          return { field, handle: 'n' };
        }
        if (worldY >= bottom - handleSize && worldX > left + handleSize && worldX < right - handleSize) {
          return { field, handle: 's' };
        }
        
        // Inside field but not on a handle
        return { field };
      }
    }
    return null;
  }

  const updateCursor = (x?: number, y?: number) => {
    const hit = hitRef.current;
    if (!hit) return;
    if (typeof x === 'number' && typeof y === 'number') {
      const rect = hit.getBoundingClientRect();
      const clientX = rect.left + x;
      const clientY = rect.top + y;
      pointerClientRef.current = { clientX, clientY };
      pointerLocalRef.current = { x, y };
      const z = zoomRef.current || 1;
      const pan = panRef.current;
      pointerWorldRef.current = { x: (x - pan.x) / z, y: (y - pan.y) / z };
    }
    
    // If resizing, show appropriate resize cursor
    if (resizingTextFieldRef.current) {
      const handle = resizingTextFieldRef.current.handle;
      const cursorMap: Record<string, string> = {
        'nw': 'nwse-resize',
        'ne': 'nesw-resize',
        'sw': 'nesw-resize',
        'se': 'nwse-resize',
        'n': 'n-resize',
        's': 's-resize',
        'e': 'e-resize',
        'w': 'w-resize'
      };
      hit.style.cursor = cursorMap[handle] || 'default';
      return;
    }
    
    // If dragging, show move cursor
    if (draggingTextFieldRef.current) {
      hit.style.cursor = 'move';
      return;
    }
    
    // Check what we're hovering over
    if (x !== undefined && y !== undefined) {
      const hit = getTextFieldAtPoint(x, y);
      
      if (hit && hit.field) {
        // Check if hovering over delete button
        const z = zoomRef.current || 1;
        const pan = panRef.current;
        const worldX = (x - pan.x) / z;
        const worldY = (y - pan.y) / z;
        const deleteBtnSize = 20 / z;
        const deleteBtnX = hit.field.x + hit.field.width - deleteBtnSize - 2;
        const deleteBtnY = hit.field.y - deleteBtnSize - 2;
        
        if (worldX >= deleteBtnX && worldX <= deleteBtnX + deleteBtnSize &&
            worldY >= deleteBtnY && worldY <= deleteBtnY + deleteBtnSize) {
          hitRef.current!.style.cursor = 'pointer';
          return;
        }
        
        // Check if hovering over resize handle
        if (hit.handle) {
          const cursorMap: Record<string, string> = {
            'nw': 'nwse-resize',
            'ne': 'nesw-resize',
            'sw': 'nesw-resize',
            'se': 'nwse-resize',
            'n': 'n-resize',
            's': 's-resize',
            'e': 'e-resize',
            'w': 'w-resize'
          };
          hitRef.current!.style.cursor = cursorMap[hit.handle] || 'default';
          return;
        }
        
        // Hovering over text field body
        if (brushRef.current === 'text') {
          hitRef.current!.style.cursor = 'move';
        } else {
          hitRef.current!.style.cursor = 'move';
        }
        return;
      }
    }
    
    // Default cursor based on brush
    if (brushRef.current === 'text') {
      hit.style.cursor = 'text';
    } else {
    hit.style.cursor = 'crosshair';
    }
  };

  function getHistoryTimeline(): HistorySnapshot[] {
    return historyRef.current.map((entry, idx) => ({
      id: entry.id,
      label: entry.label || `Version ${idx + 1}`,
      ts: entry.ts,
      index: idx,
      active: idx === historyIndexRef.current,
    }));
  }

  function emitHistory() {
    if (onHistoryUpdate) {
      onHistoryUpdate(getHistoryTimeline());
    }
  }

  function updateTextInputPosition() {
    const input = textInputRef.current;
    if (!input || !editingTextFieldRef.current) {
      input?.style.setProperty('display', 'none');
      input?.style.setProperty('pointer-events', 'none');
      return;
    }
    
    const field = textFieldsRef.current.find(f => f.id === editingTextFieldRef.current);
    if (!field) {
      input.style.setProperty('display', 'none');
      input.style.setProperty('pointer-events', 'none');
      return;
    }
    
    const z = zoomRef.current || 1;
    const pan = panRef.current;
    const screenX = field.x * z + pan.x;
    const screenY = field.y * z + pan.y;
    const screenWidth = field.width * z;
    const screenHeight = field.height * z;
    
    input.style.setProperty('display', 'block');
    input.style.setProperty('pointer-events', 'auto');
    input.style.setProperty('left', `${screenX}px`);
    input.style.setProperty('top', `${screenY}px`);
    input.style.setProperty('width', `${screenWidth}px`);
    input.style.setProperty('height', `${screenHeight}px`);
    input.style.setProperty('font-size', `${field.fontSize * z}px`);
    input.style.setProperty('color', field.color);
    input.value = field.text;
  }

  function applyHistoryEntry(entry?: HistoryEntry) {
    if (!entry) return;
    try {
      const parsed = JSON.parse(entry.data || '{}');
      if (Array.isArray(parsed)) {
        // Legacy format (just strokes)
        strokesRef.current = parsed;
        textFieldsRef.current = [];
      } else {
        strokesRef.current = parsed.strokes || [];
        textFieldsRef.current = parsed.textFields || [];
      }
    } catch {
      strokesRef.current = [];
      textFieldsRef.current = [];
    }
    editingTextFieldRef.current = null;
    renderAll();
    updateTextInputPosition();
    const overlayCtx = ctxOverlayRef.current;
    if (overlayCtx) {
      overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
      overlayCtx.clearRect(0, 0, overlayCtx.canvas.width, overlayCtx.canvas.height);
    }
  }

  function pushHistory(label?: string, force = false) {
    try {
      const data = JSON.stringify({
        strokes: strokesRef.current,
        textFields: textFieldsRef.current,
      });
      if (!data) return;
      const history = historyRef.current;
      const currentIndex = historyIndexRef.current;
      if (!force && history.length && history[currentIndex] && history[currentIndex].data === data) {
        return;
      }
      if (history.length && currentIndex < history.length - 1) {
        history.splice(currentIndex + 1);
      }
      const entry: HistoryEntry = { id: createHistoryId(), data, ts: Date.now(), label };
      history.push(entry);
      if (history.length > MAX_HISTORY) {
        const excess = history.length - MAX_HISTORY;
        history.splice(0, excess);
        historyIndexRef.current = history.length - 1;
      } else {
        historyIndexRef.current = history.length - 1;
      }
      emitHistory();
    } catch {}
  }

  function jumpToHistoryEntry(entryId: string) {
    const index = historyRef.current.findIndex((entry) => entry.id === entryId);
    if (index === -1) return;
    historyIndexRef.current = index;
    applyHistoryEntry(historyRef.current[index]);
    emitHistory();
  }

  function deleteHistoryEntry(entryId: string) {
    const history = historyRef.current;
    const index = history.findIndex((entry) => entry.id === entryId);
    if (index === -1) return;
    history.splice(index, 1);

    if (!history.length) {
      historyIndexRef.current = -1;
      strokesRef.current = [];
      renderAll();
      const overlayCtx = ctxOverlayRef.current;
      if (overlayCtx) {
        overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
        overlayCtx.clearRect(0, 0, overlayCtx.canvas.width, overlayCtx.canvas.height);
      }
      emitHistory();
      return;
    }

    if (historyIndexRef.current >= index) {
      historyIndexRef.current = Math.max(0, historyIndexRef.current - 1);
    }

    historyIndexRef.current = Math.min(historyIndexRef.current, history.length - 1);
    applyHistoryEntry(history[historyIndexRef.current]);
    emitHistory();
  }

  useImperativeHandle(ref, () => ({
    undo: () => undo(),
    redo: () => redo(),
    clear: () => clear(),
    exportPng: () => exportPng(),
    saveBoard: () => saveBoard(),
    loadImage: (d) => loadImage(d),
    setZoom: (delta) => {
      zoomRef.current = Math.min(3, Math.max(0.25, zoomRef.current + delta));
      applyTransform();
      renderAll();
      updateCursor();
    },
    resetView: () => { zoomRef.current = 1; panRef.current = {x:0,y:0}; applyTransform(); },
    getStrokesJSON: () => { 
      try { 
        return JSON.stringify({
          strokes: strokesRef.current,
          textFields: textFieldsRef.current,
        }); 
      } catch { 
        return '{"strokes":[],"textFields":[]}'; 
      } 
    },
    setStrokesJSON: (json: string) => {
      try {
        const parsed = JSON.parse(json || '{}');
        if (Array.isArray(parsed)) {
          // Legacy format
          strokesRef.current = parsed;
          textFieldsRef.current = [];
        } else {
          strokesRef.current = parsed.strokes || [];
          textFieldsRef.current = parsed.textFields || [];
        }
      } catch {
        strokesRef.current = [];
        textFieldsRef.current = [];
      }
      editingTextFieldRef.current = null;
      selectedTextFieldRef.current = null;
      notifySelectedTextField();
      renderAll();
      updateTextInputPosition();
      const overlayCtx = ctxOverlayRef.current;
      if (overlayCtx) {
        overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
        overlayCtx.clearRect(0, 0, overlayCtx.canvas.width, overlayCtx.canvas.height);
      }
      const entry: HistoryEntry = { 
        id: createHistoryId(), 
        data: JSON.stringify({
          strokes: strokesRef.current,
          textFields: textFieldsRef.current,
        }), 
        ts: Date.now(), 
        label: 'Loaded' 
      };
      historyRef.current = [entry];
      historyIndexRef.current = 0;
      emitHistory();
    },
    createHistorySnapshot: (label?: string) => {
      pushHistory(label, true);
    },
    getHistoryTimeline: () => getHistoryTimeline(),
    jumpToHistory: (entryId: string) => jumpToHistoryEntry(entryId),
    deleteHistorySnapshot: (entryId: string) => deleteHistoryEntry(entryId),
    getSelectedTextField: () => {
      const field = findSelectedTextField();
      return field ? cloneTextField(field) : null;
    },
    resizeSelectedTextField: (size, options) => resizeSelectedField(size, options),
  }));

  useEffect(() => {
    const bg = bgRef.current!;
    const grid = gridRef.current!;
    const draw = drawRef.current!;
    const overlay = overlayRef.current!;
    const hit = hitRef.current as HTMLDivElement | null;
    if (!hit) return;
    ctxBgRef.current = bg.getContext('2d')!;
    ctxGridRef.current = grid.getContext('2d')!;
    ctxRef.current = draw.getContext('2d')!;
    ctxOverlayRef.current = overlay.getContext('2d')!;
    resize();
    clear();
    updateCursor();

    const onWheel = (e: WheelEvent) => {
      if (!hitRef.current) return;
      // Zoom gesture (cmd/ctrl + wheel) always zooms canvas
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = (hitRef.current as HTMLDivElement).getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const previousZoom = zoomRef.current || 1;
        const factor = Math.exp(-e.deltaY * 0.0015);
        const nextZoom = Math.min(3, Math.max(0.25, previousZoom * factor));
        const worldX = (localX - panRef.current.x) / previousZoom;
        const worldY = (localY - panRef.current.y) / previousZoom;
        panRef.current = {
          x: localX - worldX * nextZoom,
          y: localY - worldY * nextZoom,
        };
        zoomRef.current = nextZoom;
        applyTransform();
        return;
      }
      // When pan mode is active, consume wheel to pan canvas (like other whiteboard apps)
      if (panModeRef.current) {
        e.preventDefault();
        const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1;
        panRef.current = {
          x: panRef.current.x - e.deltaX * scale,
          y: panRef.current.y - e.deltaY * scale,
        };
        applyTransform();
      }
      // Otherwise allow the page to handle scrolling normally
    };
    hit.addEventListener('wheel', onWheel, { passive: false });

  function createTextField(x: number, y: number) {
    const z = zoomRef.current || 1;
    const pan = panRef.current;
    const worldX = (x - pan.x) / z;
    const worldY = (y - pan.y) / z;
    const fontSize = Math.max(12, sizeRef.current * 2);
    const defaultWidth = 200;
    const defaultHeight = fontSize * 1.5;
    
    const newField: TextField = {
      id: createHistoryId(),
      x: worldX,
      y: worldY,
      width: defaultWidth,
      height: defaultHeight,
      text: '',
      color: colorRef.current,
      fontSize: fontSize,
    };
    
    textFieldsRef.current.push(newField);
    editingTextFieldRef.current = newField.id;
    selectedTextFieldRef.current = newField.id;
    notifySelectedTextField();
    renderAll();
    updateTextInputPosition();
    setTimeout(() => {
      if (textInputRef.current) {
        textInputRef.current.focus();
      }
    }, 10);
    pushHistory();
  }

    const onDown = (e: PointerEvent) => {
      // Track pointers for pinch (touch)
      const updated = updatePointerRefs(e.clientX, e.clientY);
      if (!updated) return;
      const { localX: lx, localY: ly } = updated;
      pointersRef.current.set(e.pointerId, { x: lx, y: ly });
      cancelHold();
      
      const panModeActive = panModeRef.current;
      // For touch/mouse events, track the start position to detect if user is scrolling vs drawing
      touchStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      if (e.pointerType === 'touch') {
        isActivelyDrawingRef.current = false;
        if (hitRef.current) {
          (hitRef.current as HTMLDivElement).style.touchAction = panModeActive ? 'none' : 'pan-y pan-x';
        }
      } else {
        try { (hitRef.current as HTMLDivElement).setPointerCapture?.(e.pointerId); } catch {}
      }
      // Spacebar or middle-mouse pans
      if (spacePressedRef.current || e.button === 1 || e.button === 2) {
        if (Math.abs((zoomRef.current || 1) - 1) < 1e-3) {
          return;
        }
        isPanningRef.current = true;
        panStartRef.current = { x: lx, y: ly };
        // For touch panning, prevent page scroll
        if (e.pointerType === 'touch') {
          if (hitRef.current) {
            (hitRef.current as HTMLDivElement).style.touchAction = 'none';
          }
          try { (hitRef.current as HTMLDivElement).setPointerCapture?.(e.pointerId); } catch {}
        }
        updateCursor();
        pointerClientRef.current = null;
        drawBrushCursorOnly();
        return;
      }
      if (pointersRef.current.size >= 2) {
        cancelHold();
        isDrawingRef.current = false; pointsRef.current = [];
        const pts = Array.from(pointersRef.current.values());
        const dx = pts[0].x - pts[1].x; const dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy);
        const center = { x: (pts[0].x + pts[1].x)/2, y: (pts[0].y + pts[1].y)/2 };
        pinchStartRef.current = { dist, center, pan: { ...panRef.current }, zoom: zoomRef.current };
        return;
      }
      
      // If hand/pan tool is active, start panning immediately
      if (panModeActive) {
        isPanningRef.current = true;
        panStartRef.current = { x: lx, y: ly };
        updateCursor();
        pointerClientRef.current = null;
        drawBrushCursorOnly();
        return;
      }
      
      // Handle text tool
      if (brushRef.current === 'text') {
        cancelHold(e.pointerId);
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const hit = getTextFieldAtPoint(lx, ly);
        const z = zoomRef.current || 1;
        const pan = panRef.current;
        const worldX = (lx - pan.x) / z;
        const worldY = (ly - pan.y) / z;
        
        // Check if clicking on delete button for any field
        for (const field of textFieldsRef.current) {
          const deleteBtnSize = 20 / z;
          const deleteBtnX = field.x + field.width - deleteBtnSize - 2;
          const deleteBtnY = field.y - deleteBtnSize - 2;
          
          if (worldX >= deleteBtnX && worldX <= deleteBtnX + deleteBtnSize &&
              worldY >= deleteBtnY && worldY <= deleteBtnY + deleteBtnSize) {
            // Delete the text field
            const index = textFieldsRef.current.findIndex(f => f.id === field.id);
            if (index !== -1) {
              textFieldsRef.current.splice(index, 1);
              if (editingTextFieldRef.current === field.id) {
                editingTextFieldRef.current = null;
                if (textInputRef.current) {
                  textInputRef.current.style.display = 'none';
                }
              }
              if (selectedTextFieldRef.current === field.id) {
                selectedTextFieldRef.current = null;
              }
              notifySelectedTextField();
              renderAll();
              updateTextInputPosition();
              pushHistory();
            }
            return;
          }
        }
        
        // Click on resize handle: start resizing
        if (hit && hit.handle) {
          resizingTextFieldRef.current = { id: hit.field.id, handle: hit.handle };
          selectedTextFieldRef.current = hit.field.id;
          notifySelectedTextField();
          renderAll();
          return;
        } else if (hit && hit.field) {
          // Click on existing field (not handle): select, allow editing, and prepare for dragging
          // Stop editing previous field if switching
          if (editingTextFieldRef.current && editingTextFieldRef.current !== hit.field.id) {
            const prevField = textFieldsRef.current.find(f => f.id === editingTextFieldRef.current);
            if (prevField && textInputRef.current) {
              prevField.text = textInputRef.current.value;
            }
          }
          
          selectedTextFieldRef.current = hit.field.id;
          editingTextFieldRef.current = hit.field.id;
          notifySelectedTextField();
          updateTextInputPosition();
          setTimeout(() => {
            if (textInputRef.current) {
              textInputRef.current.focus();
              textInputRef.current.select();
            }
          }, 10);
          
          // Also prepare for dragging
          draggingTextFieldRef.current = hit.field.id;
          textFieldDragOffsetRef.current = { x: worldX - hit.field.x, y: worldY - hit.field.y };
          renderAll();
          return;
        } else {
          // Click on empty space: save current field and deselect
          if (editingTextFieldRef.current) {
            const currentField = textFieldsRef.current.find(f => f.id === editingTextFieldRef.current);
            if (currentField && textInputRef.current) {
              currentField.text = textInputRef.current.value;
              pushHistory();
            }
          }
          selectedTextFieldRef.current = null;
          editingTextFieldRef.current = null;
          notifySelectedTextField();
          if (textInputRef.current) {
            textInputRef.current.style.display = 'none';
          }
          createTextField(lx, ly);
          return;
        }
      }
      
      // Check if clicking on existing text field to drag it (when not using text tool)
      const currentBrush = brushRef.current;
      // @ts-expect-error - TypeScript incorrectly narrows type after early return, but 'text' is valid BrushKind
      if (currentBrush === 'text') {
        // Already handled text tool above
        } else {
          cancelHold(e.pointerId);
          const hit = getTextFieldAtPoint(lx, ly);
          if (hit && hit.field && !hit.handle) {
            const field = hit.field;
            const z = zoomRef.current || 1;
            const pan = panRef.current;
            const worldX = (lx - pan.x) / z;
            const worldY = (ly - pan.y) / z;
            
            // Check if clicking on delete button
            const deleteBtnSize = 20 / z;
            const deleteBtnX = field.x + field.width - deleteBtnSize - 2;
            const deleteBtnY = field.y - deleteBtnSize - 2;
            
            if (worldX >= deleteBtnX && worldX <= deleteBtnX + deleteBtnSize &&
                worldY >= deleteBtnY && worldY <= deleteBtnY + deleteBtnSize) {
              // Delete the text field
              const index = textFieldsRef.current.findIndex(f => f.id === field.id);
              if (index !== -1) {
                textFieldsRef.current.splice(index, 1);
                if (editingTextFieldRef.current === field.id) {
                  editingTextFieldRef.current = null;
                  if (textInputRef.current) {
                    textInputRef.current.style.display = 'none';
                  }
                }
                if (selectedTextFieldRef.current === field.id) {
                  selectedTextFieldRef.current = null;
                }
                notifySelectedTextField();
                renderAll();
                updateTextInputPosition();
                pushHistory();
              }
              return;
            }
            
            // Select and start dragging
            selectedTextFieldRef.current = field.id;
            draggingTextFieldRef.current = field.id;
            textFieldDragOffsetRef.current = { x: worldX - field.x, y: worldY - field.y };
            notifySelectedTextField();
            renderAll();
            return;
          }
        }
      
      // Deselect text field when clicking on empty space with other tools
      if (selectedTextFieldRef.current) {
        selectedTextFieldRef.current = null;
        notifySelectedTextField();
        renderAll();
      }
      
      // Begin drawing:
      // - mouse/pen: start immediately (no perceived delay)
      // - touch: use hold-to-draw gating to avoid interfering with page scrolling
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'touch') {
        armHold(e.pointerId);
        return;
      }
      beginDrawingInteraction(e);
      return;
    };
    const onMove = (e: PointerEvent) => {
      const updated = updatePointerRefs(e.clientX, e.clientY);
      if (!updated) return;
      const { localX: lx, localY: ly } = updated;
      if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: lx, y: ly });
      
      // Hold-to-draw gating
      if (!panModeRef.current && !isDrawingRef.current && holdPointerIdRef.current === e.pointerId) {
        if (holdReadyRef.current) {
          if (touchStartRef.current) {
            const dx = Math.abs(e.clientX - touchStartRef.current.x);
            const dy = Math.abs(e.clientY - touchStartRef.current.y);
            const dist = Math.hypot(dx, dy);
            if (dist >= HOLD_MOVE_THRESHOLD_PX) {
              if (e.pointerType === 'touch') {
                e.preventDefault();
              }
              beginDrawingInteraction(e);
            } else {
              updateCursor(lx, ly);
              drawBrushCursorOnly();
              return;
            }
          } else {
            if (e.pointerType === 'touch') {
              e.preventDefault();
            }
            beginDrawingInteraction(e);
          }
        } else {
          updateCursor(lx, ly);
          drawBrushCursorOnly();
          return;
        }
      }
      
      // If drawing, avoid expensive hover/cursor work on every move.
      if (isDrawingRef.current) {
        // If actively drawing, prevent page scroll
        if (isActivelyDrawingRef.current && e.pointerType === 'touch') {
          e.preventDefault();
        }
        addPoint(e);
        schedulePreview();
        return;
      }

      // Update cursor based on what we're hovering over (only when not drawing)
      updateCursor(lx, ly);
      
      // Handle text field resizing
      if (resizingTextFieldRef.current) {
        const z = zoomRef.current || 1;
        const pan = panRef.current;
        const worldX = (lx - pan.x) / z;
        const worldY = (ly - pan.y) / z;
        const field = textFieldsRef.current.find(f => f.id === resizingTextFieldRef.current!.id);
        if (field) {
          const handle = resizingTextFieldRef.current.handle;
          let widthChanged = false;
          let heightChanged = false;
          
          if (handle === 'se') {
            field.width = Math.max(50, worldX - field.x);
            field.height = Math.max(20, worldY - field.y);
            widthChanged = true;
            heightChanged = true;
          } else if (handle === 'sw') {
            const newWidth = field.x + field.width - worldX;
            if (newWidth >= 50) {
              field.x = worldX;
              field.width = newWidth;
              widthChanged = true;
            }
            field.height = Math.max(20, worldY - field.y);
            heightChanged = true;
          } else if (handle === 'ne') {
            field.width = Math.max(50, worldX - field.x);
            widthChanged = true;
            const newHeight = field.y + field.height - worldY;
            if (newHeight >= 20) {
              field.y = worldY;
              field.height = newHeight;
              heightChanged = true;
            }
          } else if (handle === 'nw') {
            const newWidth = field.x + field.width - worldX;
            const newHeight = field.y + field.height - worldY;
            if (newWidth >= 50) {
              field.x = worldX;
              field.width = newWidth;
              widthChanged = true;
            }
            if (newHeight >= 20) {
              field.y = worldY;
              field.height = newHeight;
              heightChanged = true;
            }
          } else if (handle === 'e') {
            field.width = Math.max(50, worldX - field.x);
            widthChanged = true;
          } else if (handle === 'w') {
            const newWidth = field.x + field.width - worldX;
            if (newWidth >= 50) {
              field.x = worldX;
              field.width = newWidth;
              widthChanged = true;
            }
          } else if (handle === 'n') {
            const newHeight = field.y + field.height - worldY;
            if (newHeight >= 20) {
              field.y = worldY;
              field.height = newHeight;
              heightChanged = true;
            }
          } else if (handle === 's') {
            field.height = Math.max(20, worldY - field.y);
            heightChanged = true;
          }
          
          if (widthChanged) {
            const changed = autoResizeFieldHeight(field, { enforceMinOnly: heightChanged });
            if (changed) {
              heightChanged = true;
            }
          }
          
          updateTextInputPosition();
          renderAll();
          notifySelectedTextField();
        }
        return;
      }
      
      // Handle text field dragging
      if (draggingTextFieldRef.current) {
        const z = zoomRef.current || 1;
        const pan = panRef.current;
        const worldX = (lx - pan.x) / z;
        const worldY = (ly - pan.y) / z;
        const field = textFieldsRef.current.find(f => f.id === draggingTextFieldRef.current);
        if (field) {
          if (!textFieldDragOffsetRef.current) {
            textFieldDragOffsetRef.current = { x: worldX - field.x, y: worldY - field.y };
          }
          field.x = worldX - textFieldDragOffsetRef.current.x;
          field.y = worldY - textFieldDragOffsetRef.current.y;
          // Update editing position if field is being edited
          if (editingTextFieldRef.current === draggingTextFieldRef.current) {
            updateTextInputPosition();
          }
          renderAll();
        }
        return;
      }
      
      if (isPanningRef.current) {
        // Prevent page scroll when panning canvas
        if (e.pointerType === 'touch') {
          e.preventDefault();
        }
        const dx = lx - panStartRef.current.x; const dy = ly - panStartRef.current.y;
        panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
        panStartRef.current = { x: lx, y: ly };
        applyTransform();
        updateTextInputPosition();
        updateCursor(lx, ly);
        return;
      }
      if (pointersRef.current.size >= 2 && pinchStartRef.current) {
        // Prevent page scroll when pinching/zooming
        if (e.pointerType === 'touch') {
          e.preventDefault();
          if (hitRef.current) {
            (hitRef.current as HTMLDivElement).style.touchAction = 'none';
          }
        }
        const pts = Array.from(pointersRef.current.values());
        const dx = pts[0].x - pts[1].x; const dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy) || 1;
        const centerNow = { x: (pts[0].x + pts[1].x)/2, y: (pts[0].y + pts[1].y)/2 };
        const k = dist / Math.max(1, pinchStartRef.current.dist);
        const newZoom = Math.min(3, Math.max(0.25, pinchStartRef.current.zoom * k));
        const worldCenterX = (pinchStartRef.current.center.x - pinchStartRef.current.pan.x) / pinchStartRef.current.zoom;
        const worldCenterY = (pinchStartRef.current.center.y - pinchStartRef.current.pan.y) / pinchStartRef.current.zoom;
        panRef.current = { x: centerNow.x - worldCenterX * newZoom, y: centerNow.y - worldCenterY * newZoom };
        zoomRef.current = newZoom;
        applyTransform();
        updateTextInputPosition();
        return;
      }
      if (!isDrawingRef.current) { 
        updateCursor(lx, ly);
        drawBrushCursorOnly(); 
        return; 
      }
    };
    const onUp = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchStartRef.current = null;
      
      // Restore page scrolling when touch ends
      if (e.pointerType === 'touch') {
        const wasDrawing = isActivelyDrawingRef.current;
        isActivelyDrawingRef.current = false;
        touchStartRef.current = null;
        if (hitRef.current) {
          // Restore page scrolling
          (hitRef.current as HTMLDivElement).style.touchAction = 'pan-y pan-x';
        }
        // Release pointer capture if we had it
        if (wasDrawing) {
          try { (hitRef.current as HTMLDivElement).releasePointerCapture?.(e.pointerId); } catch {}
        }
        cancelHold(e.pointerId);
      } else if (e.pointerType === 'mouse') {
        isActivelyDrawingRef.current = false;
        cancelHold(e.pointerId);
      }
      
      if (resizingTextFieldRef.current) {
        resizingTextFieldRef.current = null;
        pushHistory();
        const rect = (hitRef.current as HTMLDivElement).getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const ly = e.clientY - rect.top;
        updateCursor(lx, ly);
        return;
      }
      
      if (draggingTextFieldRef.current) {
        draggingTextFieldRef.current = null;
        textFieldDragOffsetRef.current = null;
        pushHistory();
        renderAll();
        const rect = (hitRef.current as HTMLDivElement).getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const ly = e.clientY - rect.top;
        updateCursor(lx, ly);
        return;
      }
      
      if (isPanningRef.current) {
        isPanningRef.current = false;
        updateCursor();
        if (e.pointerType === 'mouse') {
          drawBrushCursorOnly();
        } else {
          pointerClientRef.current = null;
          pointerWorldRef.current = null;
          drawBrushCursorOnly();
        }
        return;
      }
      if (!isDrawingRef.current) {
        if (e.pointerType !== 'mouse') {
          pointerClientRef.current = null;
          pointerWorldRef.current = null;
          drawBrushCursorOnly();
        }
        return;
      }
      isDrawingRef.current = false;
      // Finish any pending preview frame before committing.
      if (previewRafRef.current != null) {
        window.cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
      renderPreview();
      commitStrokeOrShape();
      pushHistory();
      pointsRef.current = [];
      renderAll();
      if (e.pointerType !== 'mouse') {
        pointerClientRef.current = null;
        pointerWorldRef.current = null;
        drawBrushCursorOnly();
      } else {
        drawBrushCursorOnly();
      }
    };
    const onLeave = () => {
      if (isDrawingRef.current) return;
      pointerClientRef.current = null;
      pointerWorldRef.current = null;
      pointerLocalRef.current = null;
      const ctxO = ctxOverlayRef.current;
      if (ctxO) {
        ctxO.setTransform(1,0,0,1,0,0);
        ctxO.clearRect(0, 0, ctxO.canvas.width, ctxO.canvas.height);
      }
      cancelHold();
    };
    const onResize = () => resize();
    hit.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    hit.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', onResize);
    const onKeyDown = (e: KeyboardEvent) => { 
      const target = e.target as HTMLElement;
      // Don't prevent default if user is typing in an input, textarea, or contentEditable element
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      
      if (e.code === 'Space') {
        e.preventDefault(); 
        spacePressedRef.current = true; 
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTextFieldRef.current) {
        // Delete selected text field
        e.preventDefault();
        const index = textFieldsRef.current.findIndex(f => f.id === selectedTextFieldRef.current);
        if (index !== -1) {
          textFieldsRef.current.splice(index, 1);
          if (editingTextFieldRef.current === selectedTextFieldRef.current) {
            editingTextFieldRef.current = null;
            if (textInputRef.current) {
              textInputRef.current.style.display = 'none';
            }
          }
          selectedTextFieldRef.current = null;
          notifySelectedTextField();
          renderAll();
          updateTextInputPosition();
          pushHistory();
        }
      } else if (e.key === 'Escape' && selectedTextFieldRef.current) {
        // Deselect text field
        selectedTextFieldRef.current = null;
        notifySelectedTextField();
        renderAll();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { 
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        // Don't prevent default if user is typing in an input, textarea, or contentEditable element
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault(); 
        spacePressedRef.current = false; 
        isPanningRef.current = false; 
      } 
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // drag and drop image support
    const onDragOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => { if (typeof reader.result === 'string') loadImage(reader.result); };
        reader.readAsDataURL(file);
      }
    };
    draw.addEventListener('dragover', onDragOver);
    draw.addEventListener('drop', onDrop);
    const onContextMenu = (event: MouseEvent) => {
      if (Math.abs((zoomRef.current || 1) - 1) < 1e-3) return;
      if (event.target && (hitRef.current?.contains(event.target as Node))) {
        event.preventDefault();
      }
    };
    hit.addEventListener('contextmenu', onContextMenu);
    const onTheme = () => refreshBackground();
    window.addEventListener('themechange', onTheme as any);
    return () => {
      hit.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('resize', onResize);
      draw.removeEventListener('dragover', onDragOver);
      draw.removeEventListener('drop', onDrop);
      hit.removeEventListener('contextmenu', onContextMenu);
      hit.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('themechange', onTheme as any);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      hit.removeEventListener('wheel', onWheel);
      if (previewRafRef.current != null) {
        window.cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
    };
  }, []);

  // keep live refs in sync so event handlers see latest values
  useEffect(() => { brushRef.current = brush; }, [brush]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => {
    showGridRef.current = showGrid;
    gridSizeRef.current = gridSize;
    renderGrid();
    updateCursor();
  }, [showGrid, gridSize]);
  useEffect(() => {
    if (isDrawingRef.current) return;
    drawBrushCursorOnly();
  }, [brush, size]);

  function strokeStyle(pressure: number) {
    const ctx = ctxRef.current!;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    let width = sizeRef.current;
    const b = brushRef.current;
    switch (b) {
      case 'marker': ctx.globalAlpha = 0.85; width = sizeRef.current * 1.2 * pressure; break;
      case 'highlighter': ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'multiply'; width = sizeRef.current * 1.6 * pressure; break;
      case 'eraser': ctx.globalCompositeOperation = 'destination-out'; width = sizeRef.current * 2.5 * pressure; break;
      default: ctx.globalAlpha = 0.95; width = sizeRef.current * pressure; break;
    }
    ctx.lineWidth = Math.max(1, width);
    ctx.strokeStyle = b === 'eraser' ? 'rgba(0,0,0,1)' : colorRef.current;
    try { ctx.setLineDash([]); } catch {}
  }

  function addPoint(e: PointerEvent) {
    const updated = updatePointerRefs(e.clientX, e.clientY);
    if (!updated) return;
    const { localX, localY } = updated;
    const z = zoomRef.current || 1;
    const x = (localX - panRef.current.x) / z;
    const y = (localY - panRef.current.y) / z;
    const p = typeof e.pressure === 'number' && e.pressure > 0 ? e.pressure : 1;
    pointsRef.current.push({ x, y, p });
  }

  function shapeSample(mode: ShapeKind, start: Point, end: Point, fallbackWidth: number, fallbackHeight: number): { points: Point[]; closed: boolean } {
    let effectiveEnd = end;
    if (Math.abs(end.x - start.x) < 1e-3 && Math.abs(end.y - start.y) < 1e-3) {
      effectiveEnd = { x: start.x + fallbackWidth, y: start.y + fallbackHeight, p: 1 };
    }

    const sx = start.x;
    const sy = start.y;
    const ex = effectiveEnd.x;
    const ey = effectiveEnd.y;

    const toPoint = (x: number, y: number): Point => ({ x, y, p: 1 });

    if (mode === 'line') {
      return { points: [toPoint(sx, sy), toPoint(ex, ey)], closed: false };
    }

    const minX = Math.min(sx, ex);
    const maxX = Math.max(sx, ex);
    const minY = Math.min(sy, ey);
    const maxY = Math.max(sy, ey);
    const width = Math.max(12, maxX - minX);
    const height = Math.max(12, maxY - minY);

    switch (mode) {
      case 'rect': {
        const points = [
          toPoint(minX, minY),
          toPoint(maxX, minY),
          toPoint(maxX, maxY),
          toPoint(minX, maxY),
        ];
        return { points, closed: true };
      }
      case 'ellipse': {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const rx = Math.max(6, width / 2);
        const ry = Math.max(6, height / 2);
        const seg = 40;
        const points: Point[] = [];
        for (let i = 0; i < seg; i++) {
          const t = (i / seg) * Math.PI * 2;
          points.push(toPoint(cx + rx * Math.cos(t), cy + ry * Math.sin(t)));
        }
        return { points, closed: true };
      }
      case 'triangle': {
        const top = toPoint((minX + maxX) / 2, minY);
        const right = toPoint(maxX, maxY);
        const left = toPoint(minX, maxY);
        return { points: [top, right, left], closed: true };
      }
      case 'diamond': {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const points = [
          toPoint(cx, minY),
          toPoint(maxX, cy),
          toPoint(cx, maxY),
          toPoint(minX, cy),
        ];
        return { points, closed: true };
      }
      case 'hexagon': {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const rx = Math.max(8, width / 2);
        const ry = Math.max(8, height / 2);
        const points: Point[] = [];
        for (let i = 0; i < 6; i++) {
          const angle = Math.PI / 3 * i + Math.PI / 6;
          points.push(toPoint(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)));
        }
        return { points, closed: true };
      }
      case 'arrow':
      case 'double-arrow': {
        const dx = ex - sx;
        const dy = ey - sy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const headLength = Math.min(len * 0.35, Math.max(fallbackWidth, fallbackHeight) * 0.6);
        const headWidth = headLength * 0.6;
        const px = -uy;
        const py = ux;
        const endBase = toPoint(ex - ux * headLength, ey - uy * headLength);
        const leftTip = toPoint(endBase.x + px * headWidth, endBase.y + py * headWidth);
        const rightTip = toPoint(endBase.x - px * headWidth, endBase.y - py * headWidth);
        if (mode === 'arrow') {
          const points: Point[] = [
            toPoint(sx, sy),
            endBase,
            toPoint(ex, ey),
            leftTip,
            toPoint(ex, ey),
            rightTip,
            toPoint(ex, ey),
            endBase,
          ];
          return { points, closed: false };
        }
        const startBase = toPoint(sx + ux * headLength, sy + uy * headLength);
        const startLeft = toPoint(startBase.x + px * headWidth, startBase.y + py * headWidth);
        const startRight = toPoint(startBase.x - px * headWidth, startBase.y - py * headWidth);
        const points: Point[] = [
          startBase,
          toPoint(sx, sy),
          startLeft,
          toPoint(sx, sy),
          startRight,
          toPoint(sx, sy),
          startBase,
          endBase,
          toPoint(ex, ey),
          leftTip,
          toPoint(ex, ey),
          rightTip,
          toPoint(ex, ey),
          endBase,
        ];
        return { points, closed: false };
      }
      default:
        return { points: [toPoint(sx, sy), toPoint(ex, ey)], closed: false };
    }
  }

  function renderPreview() {
    const pts = pointsRef.current;
    const mode = brushRef.current;
    const ctxO = ctxOverlayRef.current!;
    const z = zoomRef.current || 1;
    const pan = panRef.current;
    const dpr = dprRef.current;
    ctxO.setTransform(1,0,0,1,0,0);
    ctxO.clearRect(0, 0, ctxO.canvas.width, ctxO.canvas.height);
    if (SHOW_BRUSH_CURSOR) {
      renderBrushCursorCore(ctxO, dpr);
    }
    if (pts.length < 2) return;
    ctxO.setTransform(z*dpr,0,0,z*dpr,pan.x*dpr,pan.y*dpr);

    if (isShapeBrush(mode)) {
      const start = pts[0];
      const end = pts[pts.length - 1] || start;
      const fallbackWidth = Math.max(32, sizeRef.current * 4);
      const fallbackHeight = Math.max(32, sizeRef.current * 4);
      const sample = shapeSample(mode as ShapeKind, start, end, fallbackWidth, fallbackHeight);
      const shapePoints = sample.points;
      if (!shapePoints.length) {
        ctxO.setTransform(dpr,0,0,dpr,0,0);
        return;
      }
      ctxO.lineJoin = 'round';
      ctxO.lineCap = 'round';
      ctxO.globalCompositeOperation = 'source-over';
      ctxO.globalAlpha = 1;
      ctxO.strokeStyle = colorRef.current;
      ctxO.lineWidth = Math.max(1, (sizeRef.current / z) * dpr);
      ctxO.beginPath();
      ctxO.moveTo(shapePoints[0].x, shapePoints[0].y);
      for (let i = 1; i < shapePoints.length; i++) {
        ctxO.lineTo(shapePoints[i].x, shapePoints[i].y);
      }
      if (sample.closed) ctxO.closePath();
      ctxO.stroke();
      ctxO.setTransform(dpr,0,0,dpr,0,0);
      renderBrushCursor();
      return;
    }

    // Freehand preview: full (smooth) redraw, but throttled via requestAnimationFrame in onMove.
    ctxO.lineJoin = 'round'; ctxO.lineCap = 'round';
    ctxO.globalCompositeOperation = mode==='eraser' ? 'destination-out':'source-over';
    ctxO.globalAlpha = mode==='highlighter'?0.35:mode==='marker'?0.85:0.95;
    ctxO.strokeStyle = mode==='eraser' ? 'rgba(0,0,0,1)':colorRef.current;
    const eraserMultiplier = mode === 'eraser' ? 2.5 : 1;
    ctxO.lineWidth = Math.max(1, (sizeRef.current / z) * dpr * eraserMultiplier);
    ctxO.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      ctxO.moveTo(p1.x, p1.y);
      ctxO.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    ctxO.stroke();
    ctxO.setTransform(dpr,0,0,dpr,0,0);
    renderBrushCursor();
  }

  function drawBrushCursorOnly() {
    if (!SHOW_BRUSH_CURSOR) return;
    const ctxO = ctxOverlayRef.current;
    if (!ctxO) return;
    ctxO.setTransform(1,0,0,1,0,0);
    ctxO.clearRect(0, 0, ctxO.canvas.width, ctxO.canvas.height);
    renderBrushCursorCore(ctxO, dprRef.current);
  }

  function renderBrushCursor() {
    if (!SHOW_BRUSH_CURSOR) return;
    const ctxO = ctxOverlayRef.current;
    if (!ctxO) return;
    ctxO.save();
    ctxO.setTransform(1,0,0,1,0,0);
    renderBrushCursorCore(ctxO, dprRef.current);
    ctxO.restore();
  }

  function renderBrushCursorCore(ctxO: CanvasRenderingContext2D, dpr: number) {
    const pointerLocal = pointerLocalRef.current;
    const pointer = pointerClientRef.current;
    const mode = brushRef.current;
    if (!pointerLocal && !pointer) return;
    // Prefer local coords from hit-layer (same space used by drawing), fallback to client→local via hitRef.
    let localX: number;
    let localY: number;
    if (pointerLocal) {
      localX = pointerLocal.x;
      localY = pointerLocal.y;
    } else {
      const hit = hitRef.current;
      if (!hit || !pointer) return;
      const rect = hit.getBoundingClientRect();
      localX = pointer.clientX - rect.left;
      localY = pointer.clientY - rect.top;
    }
    if (isShapeBrush(mode)) return;
    const isFreehand = mode === 'brush' || mode === 'marker' || mode === 'highlighter' || mode === 'eraser';
    if (!isFreehand) return;
    const baseSize = (() => {
      switch (mode) {
        case 'marker': return sizeRef.current * 1.2;
        case 'highlighter': return sizeRef.current * 1.6;
        case 'eraser': return sizeRef.current * 2.5;
        default: return sizeRef.current;
      }
    })();
    const z = zoomRef.current || 1;
    const displaySize = baseSize / z;
    const radiusCss = Math.max(2, displaySize / 2);
    const radiusDevice = radiusCss * dpr;
    const cx = localX * dpr;
    const cy = localY * dpr;
    ctxO.save();
    ctxO.strokeStyle = mode === 'eraser' ? 'rgba(255,255,255,0.9)' : 'rgba(14,165,233,0.9)';
    ctxO.lineWidth = Math.max(1, 1.5 * dpr);
    ctxO.setLineDash([4 * dpr, 4 * dpr]);
    ctxO.beginPath();
    ctxO.arc(cx, cy, radiusDevice, 0, Math.PI * 2);
    ctxO.stroke();
    ctxO.restore();
  }

  function commitStrokeOrShape() {
    const mode = brushRef.current as BrushKind;
    const pts = pointsRef.current;
    if (pts.length === 0) return;

    if (isShapeBrush(mode)) {
      const start = pts[0];
      const hasDrag = pts.length > 1;
      const fallbackWidth = Math.max(32, sizeRef.current * 4);
      const fallbackHeight = Math.max(32, sizeRef.current * 4);
      const end = hasDrag ? pts[pts.length - 1] : { x: start.x + fallbackWidth, y: start.y + fallbackHeight, p: 1 };
      const sample = shapeSample(mode as ShapeKind, start, end, fallbackWidth, fallbackHeight);
      if (sample.points.length) {
        strokesRef.current.push({
          mode: 'shape',
          shape: mode as ShapeKind,
          color: colorRef.current,
          size: sizeRef.current,
          points: sample.points,
          closed: sample.closed,
        });
      }
    } else {
      if (pts.length < 2) return;
      strokesRef.current.push({ mode: mode as FreeMode, color: colorRef.current, size: sizeRef.current, points: [...pts] });
    }

    const ctxO = ctxOverlayRef.current!;
    ctxO.setTransform(1, 0, 0, 1, 0, 0);
    ctxO.clearRect(0, 0, ctxO.canvas.width, ctxO.canvas.height);
    renderAll();
  }

  function resize() {
    const dpr = dprRef.current;
    const host = hostRef.current as HTMLElement;
    const rect = host.getBoundingClientRect();
    const canvases = [bgRef.current!, gridRef.current!, drawRef.current!, overlayRef.current!];
    canvases.forEach(c => {
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
      const ctx = c.getContext('2d')!;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(dpr, dpr);
    });
    applyTransform();
  }

  function clear() {
    const draw = drawRef.current!;
    const rect = (hostRef.current as HTMLDivElement).getBoundingClientRect();
    const ctx = ctxRef.current!;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, draw.width, draw.height);
    ctx.scale(dprRef.current, dprRef.current);
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas') || '#111111';
    // clear draw layer only
    ctx.clearRect(0, 0, rect.width, rect.height);
    // ensure bg layer filled
    const ctxBg = ctxBgRef.current!;
    ctxBg.fillStyle = bg;
    ctxBg.fillRect(0, 0, rect.width, rect.height);
    renderGrid();
    // reset vector strokes, text fields and history so old content doesn't reappear
    strokesRef.current = [];
    textFieldsRef.current = [];
    editingTextFieldRef.current = null;
    selectedTextFieldRef.current = null;
    notifySelectedTextField();
    historyRef.current = [];
    historyIndexRef.current = -1;
    pushHistory('Cleared', true);
    // clear overlay preview
    try { const o = ctxOverlayRef.current!; o.setTransform(1,0,0,1,0,0); o.clearRect(0,0,o.canvas.width,o.canvas.height); } catch {}
    // re-render blank state
    updateTextInputPosition();
    renderAll();
  }

  function refreshBackground() {
    try {
      const rect = (hostRef.current as HTMLDivElement).getBoundingClientRect();
      const ctxBg = ctxBgRef.current!;
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas') || '#111111';
      ctxBg.clearRect(0, 0, rect.width, rect.height);
      ctxBg.fillStyle = bg;
      ctxBg.fillRect(0, 0, rect.width, rect.height);
      // redraw last background image (if any) with saved placement
      if (bgImageRef.current && bgPlacementRef.current) {
        const { dx, dy, dw, dh } = bgPlacementRef.current;
        ctxBg.drawImage(bgImageRef.current, dx, dy, dw, dh);
      }
    } catch {}
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current = Math.max(0, historyIndexRef.current - 1);
    applyHistoryEntry(historyRef.current[historyIndexRef.current]);
    emitHistory();
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current = Math.min(historyRef.current.length - 1, historyIndexRef.current + 1);
    applyHistoryEntry(historyRef.current[historyIndexRef.current]);
    emitHistory();
  }

  function restore(_dataUrl: string) { /* no-op in vector mode */ }

  function snapshot(): HTMLImageElement | null {
    try {
      const data = exportPng();
      if (!data) return null;
      const img = new Image();
      img.src = data;
      return img;
    } catch { return null; }
  }

  function exportPng() {
    try {
      // composite bg + drawing onto temp canvas
      const host = hostRef.current as HTMLElement;
      const rect = host.getBoundingClientRect();
      const tmp = document.createElement('canvas');
      tmp.width = rect.width; tmp.height = rect.height;
      const ctx = tmp.getContext('2d')!;
      ctx.drawImage(bgRef.current!, 0, 0, rect.width, rect.height);
      // re-render strokes and text fields into tmp so export always matches current zoom
      const z = zoomRef.current || 1; const pan = panRef.current;
      ctx.setTransform(z,0,0,z,pan.x,pan.y);
      drawStrokes(ctx, z);
      drawTextFields(ctx, z);
      return tmp.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  function saveBoard() {
    const dataUrl = exportPng();
    if (!dataUrl) return;
    const boards = JSON.parse(localStorage.getItem('ai-canvas-boards-react') || '[]');
    const name = `Board ${boards.length + 1}`;
    boards.push({ id: `${Date.now()}`, name, dataUrl, ts: Date.now() });
    localStorage.setItem('ai-canvas-boards-react', JSON.stringify(boards));
  }

  function loadImage(dataUrl: string) {
    const img = new Image();
    img.onload = () => {
      const rect = (hostRef.current as HTMLDivElement).getBoundingClientRect();
      const ctxBg = ctxBgRef.current!;
      // fit image into background preserving aspect ratio
      const iw = img.width, ih = img.height;
      const scale = Math.min(rect.width / iw, rect.height / ih);
      const dw = Math.max(1, Math.floor(iw * scale));
      const dh = Math.max(1, Math.floor(ih * scale));
      const dx = Math.floor((rect.width - dw) / 2);
      const dy = Math.floor((rect.height - dh) / 2);
      ctxBg.clearRect(0, 0, rect.width, rect.height);
      ctxBg.drawImage(img, dx, dy, dw, dh);
      bgImageRef.current = img;
      bgPlacementRef.current = { dx, dy, dw, dh };
      pushHistory();
    };
    img.src = dataUrl;
  }

  function applyTransform() {
    // CSS transforms removed; we render with matrix transforms to keep hit layer aligned
    renderAll();
    renderPreview();
    updateCursor();
    updateTextInputPosition();
    syncPointerWorldFromClient();
    drawBrushCursorOnly();
  }

  function drawStrokes(ctx: CanvasRenderingContext2D, z: number) {
    for (const s of strokesRef.current) {
      if (s.mode === 'shape' && s.shape) {
        drawShapeStroke(ctx, s, z);
        continue;
      }
      ctx.globalCompositeOperation = s.mode==='eraser' ? 'destination-out' : 'source-over';
      ctx.globalAlpha = s.mode==='highlighter'?0.35:s.mode==='marker'?0.85:0.95;
      ctx.strokeStyle = s.mode==='eraser' ? 'rgba(0,0,0,1)' : s.color;
      const eraserMultiplier = s.mode === 'eraser' ? 2.5 : 1;
      ctx.lineWidth = Math.max(1, (s.size / z) * eraserMultiplier);
      const pts = s.points; if (pts.length<2) continue;
      ctx.beginPath();
      ctx.lineJoin='round'; ctx.lineCap='round';
      for (let i=0;i<pts.length-1;i++){
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        ctx.moveTo(p1.x, p1.y);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
  }

  function drawShapeStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, z: number) {
    const pts = stroke.points;
    if (!pts.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = stroke.shape === 'line' ? 'round' : 'round';
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(1, stroke.size / z);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    if (stroke.closed) ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function renderAll() {
    const ctx = ctxRef.current!;
    const rect = (hostRef.current as HTMLDivElement).getBoundingClientRect();
    const dpr = dprRef.current; const z = zoomRef.current || 1; const pan = panRef.current;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.setTransform(z*dpr,0,0,z*dpr,pan.x*dpr,pan.y*dpr);
    drawStrokes(ctx, z);
    drawTextFields(ctx, z);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    renderGrid();
    renderBrushCursor();
  }

  function drawTextFields(ctx: CanvasRenderingContext2D, z: number) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    
    for (const field of textFieldsRef.current) {
      const isEditing = editingTextFieldRef.current === field.id;
      const isSelected = selectedTextFieldRef.current === field.id;
      const showControls = isEditing || isSelected || brushRef.current === 'text';
      
      if (!isEditing) {
        const lines = getWrappedTextLines(field);
        if (lines.length) {
          ctx.fillStyle = field.color;
          ctx.font = `${field.fontSize}px sans-serif`;
          ctx.textBaseline = 'top';
          const lineHeight = field.fontSize * 1.2;
          lines.forEach((line, idx) => {
            ctx.fillText(line, field.x + 2, field.y + 2 + idx * lineHeight);
          });
        }
      }
      
      // Draw border and resize handles if editing, selected, or text tool is active
      if (showControls) {
        ctx.strokeStyle = isSelected ? '#3b82f6' : field.color;
        ctx.lineWidth = (isSelected ? 2 : 1) / z;
        ctx.setLineDash([]);
        ctx.strokeRect(field.x, field.y, field.width, field.height);
        
        // Draw resize handles (all 8 handles for better control)
        const handleSize = 6 / z;
        ctx.fillStyle = isSelected ? '#3b82f6' : field.color;
        // Corners
        ctx.fillRect(field.x + field.width - handleSize, field.y + field.height - handleSize, handleSize, handleSize); // SE
        ctx.fillRect(field.x, field.y + field.height - handleSize, handleSize, handleSize); // SW
        ctx.fillRect(field.x + field.width - handleSize, field.y, handleSize, handleSize); // NE
        ctx.fillRect(field.x, field.y, handleSize, handleSize); // NW
        // Edges
        ctx.fillRect(field.x + field.width / 2 - handleSize / 2, field.y, handleSize, handleSize); // N
        ctx.fillRect(field.x + field.width / 2 - handleSize / 2, field.y + field.height - handleSize, handleSize, handleSize); // S
        ctx.fillRect(field.x + field.width - handleSize, field.y + field.height / 2 - handleSize / 2, handleSize, handleSize); // E
        ctx.fillRect(field.x, field.y + field.height / 2 - handleSize / 2, handleSize, handleSize); // W
        
        // Draw delete button if selected
        if (isSelected) {
          const deleteBtnSize = 20 / z;
          const deleteBtnX = field.x + field.width - deleteBtnSize - 2;
          const deleteBtnY = field.y - deleteBtnSize - 2;
          
          // Draw delete button background (circle)
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(deleteBtnX + deleteBtnSize / 2, deleteBtnY + deleteBtnSize / 2, deleteBtnSize / 2, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw X icon
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 / z;
          ctx.lineCap = 'round';
          const iconPadding = deleteBtnSize * 0.3;
          ctx.beginPath();
          ctx.moveTo(deleteBtnX + iconPadding, deleteBtnY + iconPadding);
          ctx.lineTo(deleteBtnX + deleteBtnSize - iconPadding, deleteBtnY + deleteBtnSize - iconPadding);
          ctx.moveTo(deleteBtnX + deleteBtnSize - iconPadding, deleteBtnY + iconPadding);
          ctx.lineTo(deleteBtnX + iconPadding, deleteBtnY + deleteBtnSize - iconPadding);
          ctx.stroke();
        }
      }
    }
    
    ctx.restore();
  }

  function renderGrid() {
    const ctx = ctxGridRef.current;
    const host = hostRef.current as HTMLDivElement | null;
    if (!ctx || !host) return;
    const canvas = ctx.canvas;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!showGridRef.current) return;

    const dpr = dprRef.current;
    const z = zoomRef.current || 1;
    const pan = panRef.current;

    const width = canvas.width;
    const height = canvas.height;
    const worldWidth = width / (dpr * z);
    const worldHeight = height / (dpr * z);
    const panWorldX = -pan.x / z;
    const panWorldY = -pan.y / z;

    const size = Math.max(4, Math.min(256, gridSizeRef.current || 24));
    const majorEvery = Math.max(2, Math.round(80 / size));
    const rootStyle = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
    const minorColor = rootStyle?.getPropertyValue('--grid-minor')?.trim() || (document.documentElement.classList.contains('dark') ? 'rgba(148,163,184,0.2)' : 'rgba(71,85,105,0.14)');
    const majorColor = rootStyle?.getPropertyValue('--grid-major')?.trim() || (document.documentElement.classList.contains('dark') ? 'rgba(148,163,184,0.45)' : 'rgba(30,41,59,0.32)');
    const axisColor = rootStyle?.getPropertyValue('--grid-axis')?.trim() || 'rgba(14,165,233,0.55)';

    ctx.setTransform(z * dpr, 0, 0, z * dpr, pan.x * dpr, pan.y * dpr);
    const baseWidth = Math.max(1 / (dpr * z), 0.55 / dpr);

    const startX = Math.floor(panWorldX / size) * size;
    const endX = panWorldX + worldWidth + size;
    const startY = Math.floor(panWorldY / size) * size;
    const endY = panWorldY + worldHeight + size;

    for (let x = startX, idx = 0; x <= endX; x += size, idx++) {
      ctx.beginPath();
      const isMajor = idx % majorEvery === 0;
      ctx.strokeStyle = isMajor ? majorColor : minorColor;
      ctx.lineWidth = baseWidth;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }

    for (let y = startY, idy = 0; y <= endY; y += size, idy++) {
      ctx.beginPath();
      const isMajor = idy % majorEvery === 0;
      ctx.strokeStyle = isMajor ? majorColor : minorColor;
      ctx.lineWidth = baseWidth;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }

    ctx.setTransform(1,0,0,1,0,0);
  }

  useEffect(() => {
    const input = document.createElement('textarea');
    input.style.position = 'absolute';
    input.style.display = 'none';
    input.style.background = 'transparent';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.resize = 'none';
    input.style.overflow = 'hidden';
    input.style.padding = '2px';
    input.style.fontFamily = 'sans-serif';
    input.style.whiteSpace = 'pre-wrap';
    input.style.wordWrap = 'break-word';
    input.style.zIndex = '10';
    input.style.pointerEvents = 'none'; // Start with pointer events disabled, enabled only when editing
    input.style.caretColor = 'currentColor';
    
    const handleInput = () => {
      const field = textFieldsRef.current.find(f => f.id === editingTextFieldRef.current);
      if (field) {
        field.text = input.value;
        // Auto-resize height based on content
        input.style.height = 'auto';
        const scrollHeight = input.scrollHeight;
        const minHeight = field.fontSize * 1.5;
        field.height = Math.max(minHeight, scrollHeight);
        input.style.height = `${field.height}px`;
        renderAll();
        notifySelectedTextField();
      }
    };
    
    const handleBlur = () => {
      const field = textFieldsRef.current.find(f => f.id === editingTextFieldRef.current);
      if (field) {
        field.text = input.value;
        autoResizeFieldHeight(field);
        notifySelectedTextField();
        editingTextFieldRef.current = null;
        pushHistory();
      }
      input.style.display = 'none';
      renderAll();
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const field = textFieldsRef.current.find(f => f.id === editingTextFieldRef.current);
        if (field) {
          input.value = field.text; // Revert changes
        }
        handleBlur();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // Allow Enter to create new line, Shift+Enter to finish
        // For now, just allow Enter to create new line
      }
    };
    
    input.addEventListener('input', handleInput);
    input.addEventListener('blur', handleBlur);
    input.addEventListener('keydown', handleKeyDown);
    textInputRef.current = input;
    
    if (hostRef.current) {
      hostRef.current.appendChild(input);
    }
    
    return () => {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('blur', handleBlur);
      input.removeEventListener('keydown', handleKeyDown);
      input.remove();
    };
  }, []);

  return (
    <div ref={hostRef} className="board-stack" style={{ position:'relative', width:'100%', height:'100%' }}>
      <div ref={hitRef} style={{ position:'absolute', inset:0, zIndex:5, touchAction:'pan-y pan-x' }} />
      {/* Keep background full-size (not scaled) */}
      <canvas ref={bgRef} className="board" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} aria-label="Background layer" />
      {/* Scale/pan only the drawing layers */}
      <div ref={contentRef} style={{ position:'absolute', inset:0 }}>
        <canvas ref={gridRef} className="board" style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }} aria-label="Grid layer" />
        <canvas ref={drawRef} className="board" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} aria-label="Drawing layer" />
        <canvas ref={overlayRef} className="board" style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }} aria-label="Overlay layer" />
      </div>
    </div>
  );
});

CanvasBoard.displayName = 'CanvasBoard';


