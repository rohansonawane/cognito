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

const SHAPE_KINDS: ShapeKind[] = ['line', 'rect', 'ellipse', 'arrow', 'double-arrow', 'triangle', 'diamond', 'hexagon'];
const SHAPE_SET = new Set<ShapeKind>(SHAPE_KINDS);
const isShapeBrush = (mode: BrushKind): mode is ShapeKind => SHAPE_SET.has(mode as ShapeKind);

export const CanvasBoard = forwardRef<CanvasBoardRef, Props>(({ brush, color, size, onHistoryUpdate, showGrid = false, gridSize = 24 }, ref) => {
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
  const pointersRef = useRef<Map<number, {x:number;y:number}>>(new Map());
  const pinchStartRef = useRef<{dist:number; center:{x:number;y:number}; pan:{x:number;y:number}; zoom:number} | null>(null);
  const spacePressedRef = useRef<boolean>(false);
  const showGridRef = useRef<boolean>(showGrid);
  const gridSizeRef = useRef<number>(gridSize);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);

  const updateCursor = () => {
    const hit = hitRef.current;
    if (!hit) return;
    hit.style.cursor = 'crosshair';
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

  function applyHistoryEntry(entry?: HistoryEntry) {
    if (!entry) return;
    try {
      strokesRef.current = JSON.parse(entry.data || '[]');
    } catch {
      strokesRef.current = [];
    }
    renderAll();
    const overlayCtx = ctxOverlayRef.current;
    if (overlayCtx) {
      overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
      overlayCtx.clearRect(0, 0, overlayCtx.canvas.width, overlayCtx.canvas.height);
    }
  }

  function pushHistory(label?: string, force = false) {
    try {
      const data = JSON.stringify(strokesRef.current);
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
    getStrokesJSON: () => { try { return JSON.stringify(strokesRef.current); } catch { return '[]'; } },
    setStrokesJSON: (json: string) => {
      try {
        strokesRef.current = JSON.parse(json || '[]');
      } catch {
        strokesRef.current = [];
      }
      renderAll();
      const overlayCtx = ctxOverlayRef.current;
      if (overlayCtx) {
        overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
        overlayCtx.clearRect(0, 0, overlayCtx.canvas.width, overlayCtx.canvas.height);
      }
      const entry: HistoryEntry = { id: createHistoryId(), data: JSON.stringify(strokesRef.current), ts: Date.now(), label: 'Loaded' };
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
      if (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1;
        panRef.current = {
          x: panRef.current.x - e.deltaX * scale,
          y: panRef.current.y - e.deltaY * scale,
        };
        applyTransform();
      }
    };
    hit.addEventListener('wheel', onWheel, { passive: false });

    const onDown = (e: PointerEvent) => {
      // Track pointers for pinch (touch)
      const rect = (hitRef.current as HTMLDivElement).getBoundingClientRect();
      const lx = e.clientX - rect.left; const ly = e.clientY - rect.top;
      pointersRef.current.set(e.pointerId, { x: lx, y: ly });
      try { (hitRef.current as HTMLDivElement).setPointerCapture?.(e.pointerId); } catch {}
      // Spacebar or middle-mouse pans
      if (spacePressedRef.current || e.button === 1 || e.button === 2) {
        if (Math.abs((zoomRef.current || 1) - 1) < 1e-3) {
          return;
        }
        isPanningRef.current = true;
        panStartRef.current = { x: lx, y: ly };
        updateCursor();
        pointerPosRef.current = null;
        drawBrushCursorOnly();
        return;
      }
      if (pointersRef.current.size >= 2) {
        isDrawingRef.current = false; pointsRef.current = [];
        const pts = Array.from(pointersRef.current.values());
        const dx = pts[0].x - pts[1].x; const dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy);
        const center = { x: (pts[0].x + pts[1].x)/2, y: (pts[0].y + pts[1].y)/2 };
        pinchStartRef.current = { dist, center, pan: { ...panRef.current }, zoom: zoomRef.current };
        return;
      }
      // Begin drawing with single pointer (mouse or single touch)
      if (e.button!==0 && e.pointerType === 'mouse') return;
      isDrawingRef.current = true; pointsRef.current = []; addPoint(e); renderPreview();
    };
    const onMove = (e: PointerEvent) => {
      const rect = (hitRef.current as HTMLDivElement).getBoundingClientRect();
      const lx = e.clientX - rect.left; const ly = e.clientY - rect.top;
      if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: lx, y: ly });
      pointerPosRef.current = { x: lx, y: ly };
      if (isPanningRef.current) {
        const dx = lx - panStartRef.current.x; const dy = ly - panStartRef.current.y;
        panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
        panStartRef.current = { x: lx, y: ly };
        applyTransform();
        return;
      }
      if (pointersRef.current.size >= 2 && pinchStartRef.current) {
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
        return;
      }
      if (!isDrawingRef.current) { drawBrushCursorOnly(); return; }
      addPoint(e); renderPreview();
    };
    const onUp = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchStartRef.current = null;
      if (isPanningRef.current) {
        isPanningRef.current = false;
        updateCursor();
        if (e.pointerType === 'mouse') {
          drawBrushCursorOnly();
        } else {
          pointerPosRef.current = null;
          drawBrushCursorOnly();
        }
        return;
      }
      if (!isDrawingRef.current) {
        if (e.pointerType !== 'mouse') {
          pointerPosRef.current = null;
          drawBrushCursorOnly();
        }
        return;
      }
      isDrawingRef.current = false;
      commitStrokeOrShape();
      pushHistory();
      pointsRef.current = [];
      renderAll();
      if (e.pointerType !== 'mouse') {
        pointerPosRef.current = null;
        drawBrushCursorOnly();
      } else {
        drawBrushCursorOnly();
      }
    };
    const onLeave = () => {
      if (isDrawingRef.current) return;
      pointerPosRef.current = null;
      const ctxO = ctxOverlayRef.current;
      if (ctxO) {
        ctxO.setTransform(1,0,0,1,0,0);
        ctxO.clearRect(0, 0, ctxO.canvas.width, ctxO.canvas.height);
      }
    };
    const onResize = () => resize();
    hit.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    hit.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', onResize);
    const onKeyDown = (e: KeyboardEvent) => { 
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        // Don't prevent default if user is typing in an input, textarea, or contentEditable element
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault(); 
        spacePressedRef.current = true; 
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
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', onResize);
      draw.removeEventListener('dragover', onDragOver);
      draw.removeEventListener('drop', onDrop);
      hit.removeEventListener('contextmenu', onContextMenu);
      hit.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('themechange', onTheme as any);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      hit.removeEventListener('wheel', onWheel);
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
      case 'eraser': ctx.globalCompositeOperation = 'destination-out'; width = sizeRef.current * 1.4 * pressure; break;
      default: ctx.globalAlpha = 0.95; width = sizeRef.current * pressure; break;
    }
    ctx.lineWidth = Math.max(1, width);
    ctx.strokeStyle = b === 'eraser' ? 'rgba(0,0,0,1)' : colorRef.current;
    try { ctx.setLineDash([]); } catch {}
  }

  function addPoint(e: PointerEvent) {
    const rect = (hitRef.current as HTMLDivElement).getBoundingClientRect();
    const z = zoomRef.current || 1;
    // map pointer from hit layer space to logical space (invert pan/zoom)
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    pointerPosRef.current = { x: localX, y: localY };
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
    renderBrushCursorCore(ctxO, dpr);
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

    ctxO.lineJoin = 'round'; ctxO.lineCap = 'round';
    ctxO.globalCompositeOperation = mode==='eraser' ? 'destination-out':'source-over';
    ctxO.globalAlpha = mode==='highlighter'?0.35:mode==='marker'?0.85:0.95;
    ctxO.strokeStyle = mode==='eraser' ? 'rgba(0,0,0,1)':colorRef.current;
    ctxO.lineWidth = Math.max(1, (sizeRef.current / z) * dpr);
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
    const ctxO = ctxOverlayRef.current;
    if (!ctxO) return;
    ctxO.setTransform(1,0,0,1,0,0);
    ctxO.clearRect(0, 0, ctxO.canvas.width, ctxO.canvas.height);
    renderBrushCursorCore(ctxO, dprRef.current);
  }

  function renderBrushCursor() {
    const ctxO = ctxOverlayRef.current;
    if (!ctxO) return;
    ctxO.save();
    ctxO.setTransform(1,0,0,1,0,0);
    renderBrushCursorCore(ctxO, dprRef.current);
    ctxO.restore();
  }

  function renderBrushCursorCore(ctxO: CanvasRenderingContext2D, dpr: number) {
    const pointer = pointerPosRef.current;
    const mode = brushRef.current;
    if (!pointer) return;
    if (isShapeBrush(mode)) return;
    const isFreehand = mode === 'brush' || mode === 'marker' || mode === 'highlighter' || mode === 'eraser';
    if (!isFreehand) return;
    const baseSize = (() => {
      switch (mode) {
        case 'marker': return sizeRef.current * 1.2;
        case 'highlighter': return sizeRef.current * 1.6;
        case 'eraser': return sizeRef.current * 1.4;
        default: return sizeRef.current;
      }
    })();
    const radiusCss = Math.max(2, baseSize / 2);
    const radiusDevice = radiusCss * dpr;
    const cx = pointer.x * dpr;
    const cy = pointer.y * dpr;
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
    // reset vector strokes and history so old content doesn't reappear
    strokesRef.current = [];
    historyRef.current = [];
    historyIndexRef.current = -1;
    pushHistory('Cleared', true);
    // clear overlay preview
    try { const o = ctxOverlayRef.current!; o.setTransform(1,0,0,1,0,0); o.clearRect(0,0,o.canvas.width,o.canvas.height); } catch {}
    // re-render blank state
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
      // re-render strokes into tmp so export always matches current zoom
      const z = zoomRef.current || 1; const pan = panRef.current;
      ctx.setTransform(z,0,0,z,pan.x,pan.y);
      drawStrokes(ctx, z);
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
      ctx.lineWidth = Math.max(1, s.size / z);
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
    ctx.setTransform(dpr,0,0,dpr,0,0);
    renderGrid();
    renderBrushCursor();
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

  return (
    <div ref={hostRef} className="board-stack" style={{ position:'relative', width:'100%', height:'100%' }}>
      <div ref={hitRef} style={{ position:'absolute', inset:0, zIndex:5, touchAction:'none' as any }} />
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


