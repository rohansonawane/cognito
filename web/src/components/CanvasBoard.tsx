import React, { forwardRef, useEffect, useImperativeHandle, useRef, type ForwardRefRenderFunction } from 'react';

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

export type ExportOptions = {
  transparent?: boolean;
  dpi?: number;
  format?: 'png' | 'svg' | 'pdf';
};

export type CanvasBoardRef = {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportPng: (options?: ExportOptions) => string | null;
  exportPngSelection?: (options?: ExportOptions) => string | null;
  exportSvg?: (options?: ExportOptions) => string | null;
  exportPdf?: (options?: ExportOptions) => Promise<Blob | null>;
  saveBoard?: () => void;
  loadImage: (dataUrl: string) => string | null; // Returns image ID
  addImage?: (dataUrl: string) => string | null; // Returns image ID
  removeImage?: (imageId: string) => void;
  getAllImages?: () => Array<{ id: string; opacity: number; rotation: number }>;
  getImageState?: (imageId?: string) => { hasImage: boolean; opacity: number; rotation: number; crop?: { x: number; y: number; width: number; height: number } } | null;
  setImageOpacity?: (opacity: number, imageId?: string) => void;
  setImageRotation?: (rotation: number, imageId?: string) => void;
  setImageSize?: (width: number, height: number, imageId?: string) => void;
  setImagePosition?: (x: number, y: number, imageId?: string) => void;
  cropImage?: (x: number, y: number, width: number, height: number, imageId?: string) => void;
  selectImage?: (imageId?: string) => void;
  isImageSelected?: () => boolean;
  getSelectedImageId?: () => string | null;
  setZoom: (delta: number) => void;
  resetView: () => void;
  zoomToFitSelection?: () => void;
  zoomToFitAll?: () => void;
  setCanvasSize?: (width: number, height: number) => void;
  getCanvasSize?: () => { width: number; height: number } | null;
  getStrokesJSON?: () => string;
  setStrokesJSON?: (json: string) => void;
  createHistorySnapshot?: (label?: string) => void;
  getHistoryTimeline?: () => HistorySnapshot[];
  jumpToHistory?: (entryId: string) => void;
  deleteHistorySnapshot?: (entryId: string) => void;
  getSelectedTextField?: () => CanvasTextField | null;
  resizeSelectedTextField?: (size: { width?: number; height?: number }, options?: { commit?: boolean }) => void;
  updateTextFieldFormatting?: (formatting: {
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    fontStyle?: string;
    textAlign?: 'left' | 'center' | 'right';
    textColor?: string;
  }) => void;
  // Layers
  getLayers?: () => CanvasLayer[];
  getActiveLayerId?: () => string;
  setActiveLayerId?: (layerId: string) => void;
  createLayer?: (name?: string) => string;
  renameLayer?: (layerId: string, name: string) => void;
  deleteLayer?: (layerId: string) => void;
  moveLayer?: (layerId: string, direction: 'up' | 'down') => void;
  toggleLayerVisibility?: (layerId: string) => void;
  toggleLayerLock?: (layerId: string) => void;
  moveSelectedTextFieldToLayer?: (layerId: string) => void;
  // Align/Distribute
  alignSelected?: (alignment: 'left' | 'right' | 'center' | 'top' | 'bottom' | 'middle') => void;
  distributeSelected?: (direction: 'horizontal' | 'vertical') => void;
  // AI Enhancements
  autoArrange?: () => void;
  convertShapesToPerfect?: (shapes: Array<{ type: string; bounds: { x: number; y: number; width: number; height: number } }>) => void;
  getSelectedStrokes?: () => Stroke[];
  getAllStrokes?: () => Stroke[];
  // Grouping
  groupSelected?: () => void;
  ungroupSelected?: () => void;
  // Lock/Unlock
  lockSelected?: () => void;
  unlockSelected?: () => void;
  // Z-order
  bringToFront?: () => void;
  sendToBack?: () => void;
  // Flip
  flipHorizontal?: () => void;
  flipVertical?: () => void;
  // Properties
  getSelectedObjectsProperties?: () => {
    strokes: Array<{ id: string; locked: boolean; color: string; size: number }>;
    textFields: Array<{ id: string; locked: boolean; color: string; fontSize: number }>;
  } | null;
  updateSelectedObjectsProperties?: (props: {
    color?: string;
    fontSize?: number;
    locked?: boolean;
  }) => void;
};

export type ShapeKind = 'line' | 'rect' | 'ellipse' | 'arrow' | 'double-arrow' | 'triangle' | 'diamond' | 'hexagon' | 'polygon' | 'star';
export type BrushKind = 'select' | 'brush' | 'marker' | 'highlighter' | 'eraser' | ShapeKind | 'text';

type Props = {
  brush: BrushKind;
  color: string;
  size: number;
  eraserMode?: 'pixel' | 'stroke';
  shapeFill?: boolean;
  cornerRadius?: number;
  polygonSides?: number;
  starPoints?: number;
  onHistoryUpdate?: (timeline: HistorySnapshot[]) => void;
  showGrid?: boolean;
  gridSize?: number;
  showRulers?: boolean;
  onTextFieldChange?: (field: CanvasTextField | null) => void;
  panMode?: boolean;
};

const MAX_HISTORY = 60;

const createHistoryId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Point = { x: number; y: number; p: number };
type FreeMode = 'brush' | 'marker' | 'highlighter' | 'eraser';
type Stroke = {
  id: string;
  mode: FreeMode | 'shape';
  shape?: ShapeKind;
  color: string;
  fill?: boolean;
  size: number;
  points: Point[];
  closed?: boolean;
  layerId?: string;
  cornerRadius?: number; // For rounded rectangles
  sides?: number; // For polygons
  starPoints?: number; // For stars (number of points)
  locked?: boolean; // Lock individual object
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
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  textAlign: 'left' | 'center' | 'right';
  textColor: string;
  layerId?: string;
  locked?: boolean; // Lock individual object
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
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  textAlign: 'left' | 'center' | 'right';
  textColor: string;
  layerId?: string;
  locked?: boolean;
};

export type CanvasLayer = {
  id: string;
  name: string;
  visible: boolean;
  locked?: boolean;
};

export type ImagePlacement = {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  rotation: number;
  opacity: number;
  crop?: { x: number; y: number; w: number; h: number };
};

export type CanvasImage = {
  id: string;
  image: HTMLImageElement;
  placement: ImagePlacement;
};

const SHAPE_KINDS: ShapeKind[] = ['line', 'rect', 'ellipse', 'arrow', 'double-arrow', 'triangle', 'diamond', 'hexagon', 'polygon', 'star'];
const SHAPE_SET = new Set<ShapeKind>(SHAPE_KINDS);
const isShapeBrush = (mode: BrushKind): mode is ShapeKind => SHAPE_SET.has(mode as ShapeKind);
// Touch-only: small delay so users can scroll the page without accidentally drawing.
const HOLD_TO_DRAW_MS = 220;
const HOLD_MOVE_THRESHOLD_PX = 4;

const CanvasBoardComponent: ForwardRefRenderFunction<CanvasBoardRef, Props> = ({
  brush,
  color,
  size,
  eraserMode = 'pixel',
  shapeFill = false,
  cornerRadius = 0,
  polygonSides = 5,
  starPoints = 5,
  onHistoryUpdate,
  showGrid = false,
  gridSize = 6,
  showRulers = false,
  onTextFieldChange,
  panMode = false
}, ref) => {
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
  const imagesRef = useRef<Map<string, CanvasImage>>(new Map());
  const selectedImageIdRef = useRef<string | null>(null);
  const imageSelectedRef = useRef<boolean>(false);
  const imageManipulationRef = useRef<{
    isResizing: boolean;
    isRotating: boolean;
    isMoving: boolean;
    isCropping: boolean;
    resizeHandle?: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
    cropStart?: { x: number; y: number };
    cropEnd?: { x: number; y: number };
    startPos?: { x: number; y: number };
    startAngle?: number;
    startRotation?: number;
  } | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const textFieldsRef = useRef<TextField[]>([]);
  const layersRef = useRef<CanvasLayer[]>([{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false }]);
  const activeLayerIdRef = useRef<string>('layer-1');
  const eraserModeRef = useRef<'pixel' | 'stroke'>(eraserMode);
  const shapeFillRef = useRef<boolean>(shapeFill);
  const cornerRadiusRef = useRef<number>(cornerRadius);
  const polygonSidesRef = useRef<number>(polygonSides);
  const starPointsRef = useRef<number>(starPoints);
  const selectedStrokeIdsRef = useRef<Set<string>>(new Set());
  const draggingStrokesRef = useRef<{ start: { x: number; y: number }; originals: Map<string, Point[]> } | null>(null);
  const resizingStrokesRef = useRef<{
    handle: 'nw' | 'ne' | 'sw' | 'se';
    anchor: { x: number; y: number };
    handleStart: { x: number; y: number };
    originals: Map<string, Point[]>;
  } | null>(null);
  const rotatingStrokesRef = useRef<{
    center: { x: number; y: number };
    startAngle: number;
    originals: Map<string, Point[]>;
  } | null>(null);
  const clipboardRef = useRef<{
    strokes?: Stroke[];
    textFields?: TextField[];
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  } | null>(null);
  const marqueeRef = useRef<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const shiftPressedRef = useRef<boolean>(false);
  const editingTextFieldRef = useRef<string | null>(null);
  const selectedTextFieldIdsRef = useRef<Set<string>>(new Set());
  const resizingTextFieldRef = useRef<{id: string; handle: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's'} | null>(null);
  const draggingTextFieldRef = useRef<string | null>(null);
  const textFieldDragOffsetRef = useRef<{x: number; y: number} | null>(null);
  const groupsRef = useRef<Map<string, { strokeIds: Set<string>; textFieldIds: Set<string> }>>(new Map());
  const strokeGroupIdRef = useRef<Map<string, string>>(new Map()); // stroke id -> group id
  const textFieldGroupIdRef = useRef<Map<string, string>>(new Map()); // text field id -> group id
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const pointersRef = useRef<Map<number, {x:number;y:number}>>(new Map());
  const pinchStartRef = useRef<{dist:number; center:{x:number;y:number}; pan:{x:number;y:number}; zoom:number} | null>(null);
  const spacePressedRef = useRef<boolean>(false);
  const showGridRef = useRef<boolean>(showGrid);
  const gridSizeRef = useRef<number>(gridSize);
  const showRulersRef = useRef<boolean>(showRulers);
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
  const lastHostSizeRef = useRef<{ w: number; h: number } | null>(null);

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
    // Locked layer: don't draw.
    ensureLayerIntegrity();
    if (isLayerLocked(activeLayerIdRef.current)) {
      return;
    }
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

  // Keep the canvas bitmap sizes in sync with the CSS size of the host element.
  // This prevents pointer drift when layout changes without a window resize (e.g. fullscreen CSS changes, panels toggling).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const cr = entry?.contentRect;
      const w = Math.round(cr?.width ?? host.clientWidth ?? 0);
      const h = Math.round(cr?.height ?? host.clientHeight ?? 0);
      if (!w || !h) return;
      const last = lastHostSizeRef.current;
      if (last && Math.abs(last.w - w) <= 1 && Math.abs(last.h - h) <= 1) return;
      lastHostSizeRef.current = { w, h };
      resize();
      renderAll();
      drawBrushCursorOnly();
    });
    ro.observe(host);
    return () => ro.disconnect();
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
    fontFamily: field.fontFamily || 'sans-serif',
    fontWeight: field.fontWeight || 'normal',
    fontStyle: field.fontStyle || 'normal',
    textAlign: field.textAlign || 'left',
    textColor: field.textColor || field.color,
    layerId: field.layerId,
  });

  const ensureLayerIntegrity = () => {
    if (!layersRef.current.length) {
      layersRef.current = [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false }];
    }
    // Normalize missing fields (older saves)
    layersRef.current = layersRef.current.map((l) => ({
      ...l,
      visible: typeof l.visible === 'boolean' ? l.visible : true,
      locked: typeof l.locked === 'boolean' ? l.locked : false,
    }));
    if (!layersRef.current.some((l) => l.id === activeLayerIdRef.current)) {
      activeLayerIdRef.current = layersRef.current[0].id;
    }
    const fallbackId = layersRef.current[0].id;
    for (const s of strokesRef.current) {
      if (!s.layerId) s.layerId = fallbackId;
      if (!s.id) s.id = createHistoryId();
    }
    for (const t of textFieldsRef.current) {
      if (!t.layerId) t.layerId = fallbackId;
    }
  };

  const isLayerLocked = (layerId?: string) => {
    const id = layerId || activeLayerIdRef.current;
    const l = layersRef.current.find((x) => x.id === id);
    return !!l?.locked;
  };

  const getWorldFromLocal = (lx: number, ly: number) => {
    const z = zoomRef.current || 1;
    const pan = panRef.current;
    return { x: (lx - pan.x) / z, y: (ly - pan.y) / z };
  };

  const getStrokeBounds = (s: Stroke) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
  };

  const getSelectionBounds = (ids: Set<string>) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const s = strokesRef.current.find((st) => st.id === id);
      if (!s) continue;
      const b = getStrokeBounds(s);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
    return { minX, minY, maxX, maxY };
  };

  const getSelectionCenter = (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  };

  const getAllContentBounds = () => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasContent = false;

    // Get bounds from all visible strokes
    for (const s of strokesRef.current) {
      const layer = layersRef.current.find((l) => l.id === (s.layerId || layersRef.current[0]?.id || 'layer-1'));
      if (layer && !layer.visible) continue;
      const b = getStrokeBounds(s);
      if (isFinite(b.minX) && isFinite(b.minY) && isFinite(b.maxX) && isFinite(b.maxY)) {
        if (b.minX < minX) minX = b.minX;
        if (b.minY < minY) minY = b.minY;
        if (b.maxX > maxX) maxX = b.maxX;
        if (b.maxY > maxY) maxY = b.maxY;
        hasContent = true;
      }
    }

    // Get bounds from all visible text fields
    for (const f of textFieldsRef.current) {
      const layer = layersRef.current.find((l) => l.id === (f.layerId || layersRef.current[0]?.id || 'layer-1'));
      if (layer && !layer.visible) continue;
      if (f.x < minX) minX = f.x;
      if (f.y < minY) minY = f.y;
      if (f.x + f.width > maxX) maxX = f.x + f.width;
      if (f.y + f.height > maxY) maxY = f.y + f.height;
      hasContent = true;
    }

    // Include all background images if present
    for (const canvasImage of imagesRef.current.values()) {
      const p = canvasImage.placement;
      const worldX = (p.dx - panRef.current.x) / (zoomRef.current || 1);
      const worldY = (p.dy - panRef.current.y) / (zoomRef.current || 1);
      const worldW = p.dw / (zoomRef.current || 1);
      const worldH = p.dh / (zoomRef.current || 1);
      if (worldX < minX) minX = worldX;
      if (worldY < minY) minY = worldY;
      if (worldX + worldW > maxX) maxX = worldX + worldW;
      if (worldY + worldH > maxY) maxY = worldY + worldH;
      hasContent = true;
    }

    if (!hasContent || !isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return null;
    }

    return { minX, minY, maxX, maxY };
  };

  const zoomToBounds = (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const hit = hitRef.current as HTMLDivElement | null;
    if (!hit) return;
    const rect = hit.getBoundingClientRect();
    const viewportWidth = rect.width;
    const viewportHeight = rect.height;
    
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    
    if (contentWidth <= 0 || contentHeight <= 0) return;
    
    // Add padding (10% on each side)
    const padding = 0.1;
    const paddedWidth = contentWidth * (1 + padding * 2);
    const paddedHeight = contentHeight * (1 + padding * 2);
    
    // Calculate zoom to fit
    const zoomX = viewportWidth / paddedWidth;
    const zoomY = viewportHeight / paddedHeight;
    const newZoom = Math.min(zoomX, zoomY, 3); // Cap at 3x zoom
    const finalZoom = Math.max(0.25, newZoom); // Floor at 0.25x zoom
    
    // Calculate center of content
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    // Calculate pan to center content
    const newPanX = viewportWidth / 2 - centerX * finalZoom;
    const newPanY = viewportHeight / 2 - centerY * finalZoom;
    
    zoomRef.current = finalZoom;
    panRef.current = { x: newPanX, y: newPanY };
    applyTransform();
  };

  const autoArrange = () => {
    const items = getAllSelectedBounds();
    if (items.length === 0) {
      // If nothing selected, arrange all items
      const allItems: Array<{ type: 'stroke' | 'text'; id: string; bounds: { minX: number; minY: number; maxX: number; maxY: number } }> = [];
      
      strokesRef.current.forEach(s => {
        if (isLayerLocked(s.layerId || activeLayerIdRef.current)) return;
        const b = getStrokeBounds(s);
        allItems.push({ type: 'stroke', id: s.id, bounds: b });
      });
      
      textFieldsRef.current.forEach(t => {
        if (isLayerLocked(t.layerId || activeLayerIdRef.current)) return;
        allItems.push({ 
          type: 'text', 
          id: t.id, 
          bounds: { minX: t.x, minY: t.y, maxX: t.x + t.width, maxY: t.y + t.height } 
        });
      });
      
      if (allItems.length < 2) return;
      
      // Arrange in a grid layout
      const cols = Math.ceil(Math.sqrt(allItems.length));
      const spacing = 40;
      const startX = 50;
      const startY = 50;
      
      allItems.forEach((item, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const targetX = startX + col * (200 + spacing);
        const targetY = startY + row * (150 + spacing);
        
        if (item.type === 'stroke') {
          const s = strokesRef.current.find(st => st.id === item.id);
          if (s) {
            const dx = targetX - item.bounds.minX;
            const dy = targetY - item.bounds.minY;
            s.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy, p: p.p }));
          }
        } else {
          const f = textFieldsRef.current.find(t => t.id === item.id);
          if (f) {
            f.x = targetX;
            f.y = targetY;
          }
        }
      });
    } else {
      // Arrange selected items
      const cols = Math.ceil(Math.sqrt(items.length));
      const spacing = 40;
      const startX = 50;
      const startY = 50;
      
      items.forEach((item, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const targetX = startX + col * (200 + spacing);
        const targetY = startY + row * (150 + spacing);
        
        if (item.type === 'stroke') {
          const s = strokesRef.current.find(st => st.id === item.id);
          if (s) {
            const dx = targetX - item.bounds.minX;
            const dy = targetY - item.bounds.minY;
            s.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy, p: p.p }));
          }
        } else {
          const f = textFieldsRef.current.find(t => t.id === item.id);
          if (f) {
            f.x = targetX;
            f.y = targetY;
          }
        }
      });
    }
    
    renderAll();
    pushHistory();
  };

  const convertShapesToPerfect = (shapes: Array<{ type: string; bounds: { x: number; y: number; width: number; height: number } }>) => {
    if (!Array.isArray(shapes) || shapes.length === 0) return;
    
    shapes.forEach((shape) => {
      const { type, bounds } = shape;
      if (!type || !bounds) return;
      
      // Find strokes that overlap with this shape's bounds
      const overlappingStrokes = strokesRef.current.filter(s => {
        if (s.mode !== 'brush' && s.mode !== 'marker') return false;
        if (isLayerLocked(s.layerId || activeLayerIdRef.current)) return false;
        const strokeBounds = getStrokeBounds(s);
        // Check if stroke overlaps with shape bounds
        return !(strokeBounds.maxX < bounds.x || 
                 strokeBounds.minX > bounds.x + bounds.width ||
                 strokeBounds.maxY < bounds.y ||
                 strokeBounds.minY > bounds.y + bounds.height);
      });
      
      if (overlappingStrokes.length === 0) return;
      
      // Create a perfect shape to replace the overlapping strokes
      const shapeId = `shape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const firstStroke = overlappingStrokes[0];
      const color = firstStroke.color;
      const size = firstStroke.size;
      
      // Generate points for the perfect shape
      let points: Point[] = [];
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      
      if (type === 'rect' || type === 'rectangle') {
        points = [
          { x: bounds.x, y: bounds.y, p: 1 },
          { x: bounds.x + bounds.width, y: bounds.y, p: 1 },
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height, p: 1 },
          { x: bounds.x, y: bounds.y + bounds.height, p: 1 },
          { x: bounds.x, y: bounds.y, p: 1 }, // Close the rectangle
        ];
      } else if (type === 'ellipse' || type === 'circle') {
        const radiusX = bounds.width / 2;
        const radiusY = bounds.height / 2;
        const segments = 32;
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          points.push({
            x: centerX + radiusX * Math.cos(angle),
            y: centerY + radiusY * Math.sin(angle),
            p: 1
          });
        }
      } else if (type === 'triangle') {
        points = [
          { x: centerX, y: bounds.y, p: 1 },
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height, p: 1 },
          { x: bounds.x, y: bounds.y + bounds.height, p: 1 },
          { x: centerX, y: bounds.y, p: 1 }, // Close
        ];
      } else if (type === 'line') {
        points = [
          { x: bounds.x, y: bounds.y, p: 1 },
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height, p: 1 },
        ];
      } else if (type === 'arrow') {
        const arrowLength = Math.sqrt(bounds.width ** 2 + bounds.height ** 2);
        const angle = Math.atan2(bounds.height, bounds.width);
        const headLength = Math.min(arrowLength * 0.2, 20);
        const headAngle = Math.PI / 6;
        
        const endX = bounds.x + bounds.width;
        const endY = bounds.y + bounds.height;
        
        points = [
          { x: bounds.x, y: bounds.y, p: 1 },
          { x: endX, y: endY, p: 1 },
          { 
            x: endX - headLength * Math.cos(angle - headAngle), 
            y: endY - headLength * Math.sin(angle - headAngle), 
            p: 1 
          },
          { x: endX, y: endY, p: 1 },
          { 
            x: endX - headLength * Math.cos(angle + headAngle), 
            y: endY - headLength * Math.sin(angle + headAngle), 
            p: 1 
          },
        ];
      }
      
      if (points.length > 0) {
        // Remove overlapping strokes
        overlappingStrokes.forEach(s => {
          const idx = strokesRef.current.indexOf(s);
          if (idx >= 0) strokesRef.current.splice(idx, 1);
        });
        
        // Add the perfect shape
        const shapeStroke: Stroke = {
          id: shapeId,
          mode: 'shape',
          shape: type as ShapeKind,
          color,
          size,
          fill: shapeFillRef.current,
          points,
          layerId: activeLayerIdRef.current,
        };
        strokesRef.current.push(shapeStroke);
      }
    });
    
    renderAll();
    pushHistory();
  };

  const getSelectedStrokes = (): Stroke[] => {
    return strokesRef.current.filter(s => selectedStrokeIdsRef.current.has(s.id));
  };

  const getAllStrokes = (): Stroke[] => {
    return [...strokesRef.current];
  };

  const getAllSelectedBounds = () => {
    const items: Array<{ id: string; type: 'stroke' | 'text'; bounds: { minX: number; minY: number; maxX: number; maxY: number } }> = [];
    
    // Add selected strokes
    for (const id of selectedStrokeIdsRef.current) {
      const s = strokesRef.current.find((st) => st.id === id);
      if (!s) continue;
      const b = getStrokeBounds(s);
      items.push({ id, type: 'stroke', bounds: b });
    }
    
    // Add selected text fields
    for (const id of selectedTextFieldIdsRef.current) {
      const f = textFieldsRef.current.find((t) => t.id === id);
      if (f) {
        items.push({
          id: f.id,
          type: 'text',
          bounds: { minX: f.x, minY: f.y, maxX: f.x + f.width, maxY: f.y + f.height }
        });
      }
    }
    
    return items;
  };

  const alignSelected = (alignment: 'left' | 'right' | 'center' | 'top' | 'bottom' | 'middle') => {
    const items = getAllSelectedBounds();
    if (items.length < 2) return; // Need at least 2 items to align
    
    // Calculate target position based on alignment
    let targetX: number | null = null;
    let targetY: number | null = null;
    
    if (alignment === 'left') {
      targetX = Math.min(...items.map(i => i.bounds.minX));
    } else if (alignment === 'right') {
      targetX = Math.max(...items.map(i => i.bounds.maxX));
    } else if (alignment === 'center') {
      const centers = items.map(i => (i.bounds.minX + i.bounds.maxX) / 2);
      targetX = (Math.min(...centers) + Math.max(...centers)) / 2;
    } else if (alignment === 'top') {
      targetY = Math.min(...items.map(i => i.bounds.minY));
    } else if (alignment === 'bottom') {
      targetY = Math.max(...items.map(i => i.bounds.maxY));
    } else if (alignment === 'middle') {
      const centers = items.map(i => (i.bounds.minY + i.bounds.maxY) / 2);
      targetY = (Math.min(...centers) + Math.max(...centers)) / 2;
    }
    
    // Apply alignment
    for (const item of items) {
      if (item.type === 'stroke') {
        const s = strokesRef.current.find((st) => st.id === item.id);
        if (!s) continue;
        const b = getStrokeBounds(s);
        const dx = targetX !== null ? targetX - (alignment === 'left' ? b.minX : alignment === 'right' ? b.maxX : (b.minX + b.maxX) / 2) : 0;
        const dy = targetY !== null ? targetY - (alignment === 'top' ? b.minY : alignment === 'bottom' ? b.maxY : (b.minY + b.maxY) / 2) : 0;
        if (dx !== 0 || dy !== 0) {
          s.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        }
      } else if (item.type === 'text') {
        const f = textFieldsRef.current.find((t) => t.id === item.id);
        if (!f) continue;
        const b = item.bounds;
        if (targetX !== null) {
          if (alignment === 'left') f.x = targetX;
          else if (alignment === 'right') f.x = targetX - f.width;
          else if (alignment === 'center') f.x = targetX - f.width / 2;
        }
        if (targetY !== null) {
          if (alignment === 'top') f.y = targetY;
          else if (alignment === 'bottom') f.y = targetY - f.height;
          else if (alignment === 'middle') f.y = targetY - f.height / 2;
        }
      }
    }
    
    pushHistory(`Align ${alignment}`, true);
    renderAll();
    renderSelectionOverlay();
  };

  const distributeSelected = (direction: 'horizontal' | 'vertical') => {
    const items = getAllSelectedBounds();
    if (items.length < 3) return; // Need at least 3 items to distribute
    
    // Sort items by position
    if (direction === 'horizontal') {
      items.sort((a, b) => {
        const aCenter = (a.bounds.minX + a.bounds.maxX) / 2;
        const bCenter = (b.bounds.minX + b.bounds.maxX) / 2;
        return aCenter - bCenter;
      });
    } else {
      items.sort((a, b) => {
        const aCenter = (a.bounds.minY + a.bounds.maxY) / 2;
        const bCenter = (b.bounds.minY + b.bounds.maxY) / 2;
        return aCenter - bCenter;
      });
    }
    
    // Calculate total span and spacing
    const first = items[0];
    const last = items[items.length - 1];
    let totalSpan: number;
    let totalSize = 0;
    
    if (direction === 'horizontal') {
      const firstCenter = (first.bounds.minX + first.bounds.maxX) / 2;
      const lastCenter = (last.bounds.minX + last.bounds.maxX) / 2;
      totalSpan = lastCenter - firstCenter;
      for (let i = 1; i < items.length - 1; i++) {
        const w = items[i].bounds.maxX - items[i].bounds.minX;
        totalSize += w;
      }
    } else {
      const firstCenter = (first.bounds.minY + first.bounds.maxY) / 2;
      const lastCenter = (last.bounds.minY + last.bounds.maxY) / 2;
      totalSpan = lastCenter - firstCenter;
      for (let i = 1; i < items.length - 1; i++) {
        const h = items[i].bounds.maxY - items[i].bounds.minY;
        totalSize += h;
      }
    }
    
    const spacing = (totalSpan - totalSize) / (items.length - 1);
    let currentPos: number;
    
    if (direction === 'horizontal') {
      currentPos = (first.bounds.minX + first.bounds.maxX) / 2;
    } else {
      currentPos = (first.bounds.minY + first.bounds.maxY) / 2;
    }
    
    // Distribute items
    for (let i = 1; i < items.length - 1; i++) {
      const item = items[i];
      const size = direction === 'horizontal' 
        ? (item.bounds.maxX - item.bounds.minX)
        : (item.bounds.maxY - item.bounds.minY);
      
      currentPos += spacing;
      const targetCenter = currentPos;
      currentPos += size;
      
      if (item.type === 'stroke') {
        const s = strokesRef.current.find((st) => st.id === item.id);
        if (!s) continue;
        const b = getStrokeBounds(s);
        const currentCenter = direction === 'horizontal' 
          ? (b.minX + b.maxX) / 2
          : (b.minY + b.maxY) / 2;
        const delta = targetCenter - currentCenter;
        if (direction === 'horizontal') {
          s.points = s.points.map(p => ({ x: p.x + delta, y: p.y }));
        } else {
          s.points = s.points.map(p => ({ x: p.x, y: p.y + delta }));
        }
      } else if (item.type === 'text') {
        const f = textFieldsRef.current.find((t) => t.id === item.id);
        if (!f) continue;
        const b = item.bounds;
        const currentCenter = direction === 'horizontal'
          ? (b.minX + b.maxX) / 2
          : (b.minY + b.maxY) / 2;
        const delta = targetCenter - currentCenter;
        if (direction === 'horizontal') {
          f.x += delta;
        } else {
          f.y += delta;
        }
      }
    }
    
    pushHistory(`Distribute ${direction}`, true);
    renderAll();
    renderSelectionOverlay();
  };

  // Grouping functions
  const groupSelected = () => {
    const strokeIds = Array.from(selectedStrokeIdsRef.current);
    const textFieldIds = Array.from(selectedTextFieldIdsRef.current);
    
    if (strokeIds.length + textFieldIds.length < 2) return; // Need at least 2 objects
    
    // Collect old group IDs to clean up
    const oldGroupIds = new Set<string>();
    for (const id of strokeIds) {
      const gid = strokeGroupIdRef.current.get(id);
      if (gid) oldGroupIds.add(gid);
    }
    for (const id of textFieldIds) {
      const gid = textFieldGroupIdRef.current.get(id);
      if (gid) oldGroupIds.add(gid);
    }
    
    // Remove old groups (they'll be replaced by the new group)
    for (const gid of oldGroupIds) {
      groupsRef.current.delete(gid);
    }
    
    const groupId = createHistoryId();
    groupsRef.current.set(groupId, {
      strokeIds: new Set(strokeIds),
      textFieldIds: new Set(textFieldIds),
    });
    
    for (const id of strokeIds) {
      strokeGroupIdRef.current.set(id, groupId);
    }
    for (const id of textFieldIds) {
      textFieldGroupIdRef.current.set(id, groupId);
    }
    
    pushHistory('Group objects', true);
    renderSelectionOverlay();
  };

  const ungroupSelected = () => {
    const strokeIds = Array.from(selectedStrokeIdsRef.current);
    const textFieldIds = Array.from(selectedTextFieldIdsRef.current);
    const groupIds = new Set<string>();
    
    // Find all groups that contain selected objects
    for (const id of strokeIds) {
      const gid = strokeGroupIdRef.current.get(id);
      if (gid) groupIds.add(gid);
    }
    for (const id of textFieldIds) {
      const gid = textFieldGroupIdRef.current.get(id);
      if (gid) groupIds.add(gid);
    }
    
    // Ungroup all found groups
    for (const gid of groupIds) {
      const group = groupsRef.current.get(gid);
      if (!group) continue;
      
      for (const id of group.strokeIds) {
        strokeGroupIdRef.current.delete(id);
      }
      for (const id of group.textFieldIds) {
        textFieldGroupIdRef.current.delete(id);
      }
      
      groupsRef.current.delete(gid);
    }
    
    pushHistory('Ungroup objects', true);
    renderSelectionOverlay();
  };

  // Lock/Unlock functions
  const lockSelected = () => {
    let changed = false;
    
    for (const id of selectedStrokeIdsRef.current) {
      const s = strokesRef.current.find((st) => st.id === id);
      if (s && !s.locked) {
        s.locked = true;
        changed = true;
      }
    }
    
    for (const id of selectedTextFieldIdsRef.current) {
      const f = textFieldsRef.current.find((t) => t.id === id);
      if (f && !f.locked) {
        f.locked = true;
        changed = true;
      }
    }
    
    if (changed) {
      pushHistory('Lock objects', true);
      renderAll();
      renderSelectionOverlay();
    }
  };

  const unlockSelected = () => {
    let changed = false;
    
    for (const id of selectedStrokeIdsRef.current) {
      const s = strokesRef.current.find((st) => st.id === id);
      if (s && s.locked) {
        s.locked = false;
        changed = true;
      }
    }
    
    for (const id of selectedTextFieldIdsRef.current) {
      const f = textFieldsRef.current.find((t) => t.id === id);
      if (f && f.locked) {
        f.locked = false;
        changed = true;
      }
    }
    
    if (changed) {
      pushHistory('Unlock objects', true);
      renderAll();
      renderSelectionOverlay();
    }
  };

  // Z-order functions
  const bringToFront = () => {
    const strokeIds = Array.from(selectedStrokeIdsRef.current);
    const textFieldIds = Array.from(selectedTextFieldIdsRef.current);
    
    if (strokeIds.length === 0 && textFieldIds.length === 0) return;
    
    // Move strokes to end of array (top of z-order) - skip locked objects
    for (const id of strokeIds) {
      const index = strokesRef.current.findIndex((s) => s.id === id);
      if (index >= 0) {
        const stroke = strokesRef.current[index];
        if (stroke.locked) continue; // Skip locked objects
        strokesRef.current.splice(index, 1);
        strokesRef.current.push(stroke);
      }
    }
    
    // Move text fields to end of array (top of z-order) - skip locked objects
    for (const id of textFieldIds) {
      const index = textFieldsRef.current.findIndex((t) => t.id === id);
      if (index >= 0) {
        const field = textFieldsRef.current[index];
        if (field.locked) continue; // Skip locked objects
        textFieldsRef.current.splice(index, 1);
        textFieldsRef.current.push(field);
      }
    }
    
    pushHistory('Bring to front', true);
    renderAll();
    renderSelectionOverlay();
  };

  const sendToBack = () => {
    const strokeIds = Array.from(selectedStrokeIdsRef.current);
    const textFieldIds = Array.from(selectedTextFieldIdsRef.current);
    
    if (strokeIds.length === 0 && textFieldIds.length === 0) return;
    
    // Move strokes to beginning of array (bottom of z-order) - skip locked objects
    for (const id of strokeIds) {
      const index = strokesRef.current.findIndex((s) => s.id === id);
      if (index >= 0) {
        const stroke = strokesRef.current[index];
        if (stroke.locked) continue; // Skip locked objects
        strokesRef.current.splice(index, 1);
        strokesRef.current.unshift(stroke);
      }
    }
    
    // Move text fields to beginning of array (bottom of z-order) - skip locked objects
    for (const id of textFieldIds) {
      const index = textFieldsRef.current.findIndex((t) => t.id === id);
      if (index >= 0) {
        const field = textFieldsRef.current[index];
        if (field.locked) continue; // Skip locked objects
        textFieldsRef.current.splice(index, 1);
        textFieldsRef.current.unshift(field);
      }
    }
    
    pushHistory('Send to back', true);
    renderAll();
    renderSelectionOverlay();
  };

  // Flip functions
  const flipHorizontal = () => {
    const items = getAllSelectedBounds();
    if (items.length === 0) return;
    
    // Calculate center X of all selected objects
    let minX = Infinity, maxX = -Infinity;
    for (const item of items) {
      if (item.bounds.minX < minX) minX = item.bounds.minX;
      if (item.bounds.maxX > maxX) maxX = item.bounds.maxX;
    }
    const centerX = (minX + maxX) / 2;
    
    // Flip each object (skip locked objects)
    for (const item of items) {
      if (item.type === 'stroke') {
        const s = strokesRef.current.find((st) => st.id === item.id);
        if (!s || s.locked) continue; // Skip locked objects
        s.points = s.points.map(p => ({
          x: centerX - (p.x - centerX),
          y: p.y,
          p: p.p,
        }));
      } else if (item.type === 'text') {
        const f = textFieldsRef.current.find((t) => t.id === item.id);
        if (!f || f.locked) continue; // Skip locked objects
        const oldCenterX = f.x + f.width / 2;
        f.x = centerX - (oldCenterX - centerX) - f.width / 2;
      }
    }
    
    pushHistory('Flip horizontal', true);
    renderAll();
    renderSelectionOverlay();
  };

  const flipVertical = () => {
    const items = getAllSelectedBounds();
    if (items.length === 0) return;
    
    // Calculate center Y of all selected objects
    let minY = Infinity, maxY = -Infinity;
    for (const item of items) {
      if (item.bounds.minY < minY) minY = item.bounds.minY;
      if (item.bounds.maxY > maxY) maxY = item.bounds.maxY;
    }
    const centerY = (minY + maxY) / 2;
    
    // Flip each object (skip locked objects)
    for (const item of items) {
      if (item.type === 'stroke') {
        const s = strokesRef.current.find((st) => st.id === item.id);
        if (!s || s.locked) continue; // Skip locked objects
        s.points = s.points.map(p => ({
          x: p.x,
          y: centerY - (p.y - centerY),
          p: p.p,
        }));
      } else if (item.type === 'text') {
        const f = textFieldsRef.current.find((t) => t.id === item.id);
        if (!f || f.locked) continue; // Skip locked objects
        const oldCenterY = f.y + f.height / 2;
        f.y = centerY - (oldCenterY - centerY) - f.height / 2;
      }
    }
    
    pushHistory('Flip vertical', true);
    renderAll();
    renderSelectionOverlay();
  };

  // Properties functions
  const getSelectedObjectsProperties = () => {
    const strokes: Array<{ id: string; locked: boolean; color: string; size: number }> = [];
    const textFields: Array<{ id: string; locked: boolean; color: string; fontSize: number }> = [];
    
    for (const id of selectedStrokeIdsRef.current) {
      const s = strokesRef.current.find((st) => st.id === id);
      if (s) {
        strokes.push({
          id: s.id,
          locked: !!s.locked,
          color: s.color,
          size: s.size,
        });
      }
    }
    
    for (const id of selectedTextFieldIdsRef.current) {
      const f = textFieldsRef.current.find((t) => t.id === id);
      if (f) {
        textFields.push({
          id: f.id,
          locked: !!f.locked,
          color: f.color,
          fontSize: f.fontSize,
        });
      }
    }
    
    if (strokes.length === 0 && textFields.length === 0) return null;
    
    return { strokes, textFields };
  };

  const updateSelectedObjectsProperties = (props: {
    color?: string;
    fontSize?: number;
    locked?: boolean;
  }) => {
    let changed = false;
    
    for (const id of selectedStrokeIdsRef.current) {
      const s = strokesRef.current.find((st) => st.id === id);
      if (!s) continue;
      if (props.color !== undefined && s.color !== props.color) {
        s.color = props.color;
        changed = true;
      }
      if (props.locked !== undefined && s.locked !== props.locked) {
        s.locked = props.locked;
        changed = true;
      }
    }
    
    for (const id of selectedTextFieldIdsRef.current) {
      const f = textFieldsRef.current.find((t) => t.id === id);
      if (!f) continue;
      if (props.color !== undefined && f.color !== props.color) {
        f.color = props.color;
        changed = true;
      }
      if (props.fontSize !== undefined && f.fontSize !== props.fontSize) {
        f.fontSize = props.fontSize;
        changed = true;
      }
      if (props.locked !== undefined && f.locked !== props.locked) {
        f.locked = props.locked;
        changed = true;
      }
    }
    
    if (changed) {
      pushHistory('Update properties', true);
      renderAll();
      renderSelectionOverlay();
      notifySelectedTextField();
    }
  };

  const cloneStrokeWithOffset = (s: Stroke, dx: number, dy: number): Stroke => ({
    ...s,
    id: createHistoryId(),
    points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  });

  const cloneTextFieldWithOffset = (t: TextField, dx: number, dy: number): TextField => ({
    ...t,
    id: createHistoryId(),
    x: t.x + dx,
    y: t.y + dy,
  });

  const getSelectionHandles = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
    return [
      { key: 'nw' as const, x: b.minX, y: b.minY },
      { key: 'ne' as const, x: b.maxX, y: b.minY },
      { key: 'sw' as const, x: b.minX, y: b.maxY },
      { key: 'se' as const, x: b.maxX, y: b.maxY },
    ];
  };

  const findSelectionHandleAtWorldPoint = (wx: number, wy: number, bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const z = zoomRef.current || 1;
    const tol = 10 / z; // world units
    const tolSq = tol * tol;
    for (const h of getSelectionHandles(bounds)) {
      const dx = wx - h.x;
      const dy = wy - h.y;
      if ((dx * dx + dy * dy) <= tolSq) return h.key;
    }
    return null;
  };

  const getRotateHandle = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const c = getSelectionCenter(b);
    const r = Math.max(10, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) * 0.02);
    return { x: c.x, y: b.minY - r * 3.2 };
  };

  const findRotateHandleAtWorldPoint = (wx: number, wy: number, b: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const z = zoomRef.current || 1;
    const tol = 12 / z;
    const tolSq = tol * tol;
    const h = getRotateHandle(b);
    const dx = wx - h.x;
    const dy = wy - h.y;
    return (dx * dx + dy * dy) <= tolSq;
  };

  const distToSegSq = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLen2 = abx * abx + aby * aby || 1e-9;
    let t = (apx * abx + apy * aby) / abLen2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
  };

  const findStrokeAtWorldPoint = (wx: number, wy: number) => {
    ensureLayerIntegrity();
    const z = zoomRef.current || 1;
    const tol = (10 / z); // world units
    const tolSq = tol * tol;
    // Iterate from top-most to bottom-most
    for (let i = strokesRef.current.length - 1; i >= 0; i--) {
      const s = strokesRef.current[i];
      // Skip hidden or locked layers for hit-testing (don't allow editing locked/hidden content).
      const layerId = s.layerId || layersRef.current[0]?.id || 'layer-1';
      const layer = layersRef.current.find((l) => l.id === layerId);
      if (layer && (!layer.visible || layer.locked)) continue;
      // Skip locked individual objects
      if (s.locked) continue;
      const b = getStrokeBounds(s);
      if (wx < b.minX - tol || wx > b.maxX + tol || wy < b.minY - tol || wy > b.maxY + tol) continue;
      const pts = s.points;
      if (pts.length < 2) continue;
      for (let j = 0; j < pts.length - 1; j++) {
        const a = pts[j];
        const b2 = pts[j + 1];
        if (distToSegSq(wx, wy, a.x, a.y, b2.x, b2.y) <= tolSq) return s;
      }
    }
    return null;
  };

  const snapEndForShape = (mode: ShapeKind, start: Point, end: Point) => {
    if (!shiftPressedRef.current) return end;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    // Angle snap for line-like tools
    if (mode === 'line' || mode === 'arrow' || mode === 'double-arrow') {
      const ang = Math.atan2(dy, dx);
      const snap = Math.PI / 4; // 45°
      const snapped = Math.round(ang / snap) * snap;
      const len = Math.hypot(dx, dy);
      return { ...end, x: start.x + Math.cos(snapped) * len, y: start.y + Math.sin(snapped) * len };
    }
    // Aspect lock for box-like shapes -> square/circle
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const m = Math.max(adx, ady);
    return { ...end, x: start.x + Math.sign(dx || 1) * m, y: start.y + Math.sign(dy || 1) * m };
  };

  const renderSelectionOverlay = () => {
    const ctxO = ctxOverlayRef.current;
    if (!ctxO) return;
    // Don't overwrite active drawing previews.
    if (isDrawingRef.current) return;
    ctxO.setTransform(1, 0, 0, 1, 0, 0);
    ctxO.clearRect(0, 0, ctxO.canvas.width, ctxO.canvas.height);

    const z = zoomRef.current || 1;
    const pan = panRef.current;
    const dpr = dprRef.current;
    ctxO.setTransform(z * dpr, 0, 0, z * dpr, pan.x * dpr, pan.y * dpr);

    // Selected strokes: single bounding box + resize handles
    if (selectedStrokeIdsRef.current.size) {
      const b = getSelectionBounds(selectedStrokeIdsRef.current);
      if (b) {
        const pad = 6 / z;
        const x = b.minX - pad;
        const y = b.minY - pad;
        const w = (b.maxX - b.minX) + pad * 2;
        const h = (b.maxY - b.minY) + pad * 2;
        ctxO.save();
        ctxO.strokeStyle = '#3b82f6';
        ctxO.lineWidth = Math.max(1 / z, 1 / (dpr * z));
        ctxO.setLineDash([4 / z, 3 / z]);
        ctxO.strokeRect(x, y, w, h);
        ctxO.setLineDash([]);
        // Handles
        const handleSize = 8 / z;
        ctxO.fillStyle = '#3b82f6';
        ctxO.strokeStyle = 'rgba(0,0,0,0.4)';
        ctxO.lineWidth = Math.max(1 / z, 1 / (dpr * z));
        for (const hnd of getSelectionHandles(b)) {
          ctxO.beginPath();
          ctxO.rect(hnd.x - handleSize / 2, hnd.y - handleSize / 2, handleSize, handleSize);
          ctxO.fill();
          ctxO.stroke();
        }
        // Rotate handle (small circle above top edge)
        const rot = getRotateHandle(b);
        ctxO.beginPath();
        ctxO.moveTo((b.minX + b.maxX) / 2, b.minY);
        ctxO.lineTo(rot.x, rot.y);
        ctxO.stroke();
        const r = 5.5 / z;
        ctxO.beginPath();
        ctxO.arc(rot.x, rot.y, r, 0, Math.PI * 2);
        ctxO.fill();
        ctxO.stroke();
        ctxO.restore();
      }
    }

    // Selected image: bounding box + resize handles + rotate handle
    if (imageSelectedRef.current && selectedImageIdRef.current) {
      const canvasImage = imagesRef.current.get(selectedImageIdRef.current);
      if (!canvasImage) return;
      const placement = canvasImage.placement;
      const { dx, dy, dw, dh, rotation = 0 } = placement;
      ctxO.save();
      
      // Calculate bounding box accounting for rotation
      if (rotation !== 0) {
        const centerX = dx + dw / 2;
        const centerY = dy + dh / 2;
        const rad = (rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const corners = [
          { x: dx - centerX, y: dy - centerY },
          { x: dx + dw - centerX, y: dy - centerY },
          { x: dx + dw - centerX, y: dy + dh - centerY },
          { x: dx - centerX, y: dy + dh - centerY }
        ];
        const rotatedCorners = corners.map(c => ({
          x: c.x * cos - c.y * sin + centerX,
          y: c.x * sin + c.y * cos + centerY
        }));
        const minX = Math.min(...rotatedCorners.map(c => c.x));
        const maxX = Math.max(...rotatedCorners.map(c => c.x));
        const minY = Math.min(...rotatedCorners.map(c => c.y));
        const maxY = Math.max(...rotatedCorners.map(c => c.y));
        
        const pad = 6 / z;
        const x = minX - pad;
        const y = minY - pad;
        const w = (maxX - minX) + pad * 2;
        const h = (maxY - minY) + pad * 2;
        
        ctxO.strokeStyle = '#3b82f6';
        ctxO.lineWidth = Math.max(1 / z, 1 / (dpr * z));
        ctxO.setLineDash([4 / z, 3 / z]);
        ctxO.strokeRect(x, y, w, h);
        ctxO.setLineDash([]);
        
        // Draw resize handles at corners
        const handleSize = 8 / z;
        ctxO.fillStyle = '#3b82f6';
        ctxO.strokeStyle = 'rgba(0,0,0,0.4)';
        ctxO.lineWidth = Math.max(1 / z, 1 / (dpr * z));
        for (const corner of rotatedCorners) {
          ctxO.beginPath();
          ctxO.rect(corner.x - handleSize / 2, corner.y - handleSize / 2, handleSize, handleSize);
          ctxO.fill();
          ctxO.stroke();
        }
        
        // Rotate handle
        const rotY = minY - 30 / z;
        const rotX = (minX + maxX) / 2;
        ctxO.beginPath();
        ctxO.moveTo((minX + maxX) / 2, minY);
        ctxO.lineTo(rotX, rotY);
        ctxO.stroke();
        const r = 5.5 / z;
        ctxO.beginPath();
        ctxO.arc(rotX, rotY, r, 0, Math.PI * 2);
        ctxO.fill();
        ctxO.stroke();
      } else {
        const pad = 6 / z;
        const x = dx - pad;
        const y = dy - pad;
        const w = dw + pad * 2;
        const h = dh + pad * 2;
        ctxO.strokeStyle = '#3b82f6';
        ctxO.lineWidth = Math.max(1 / z, 1 / (dpr * z));
        ctxO.setLineDash([4 / z, 3 / z]);
        ctxO.strokeRect(x, y, w, h);
        ctxO.setLineDash([]);
        
        // Draw resize handles
        const handleSize = 8 / z;
        ctxO.fillStyle = '#3b82f6';
        ctxO.strokeStyle = 'rgba(0,0,0,0.4)';
        ctxO.lineWidth = Math.max(1 / z, 1 / (dpr * z));
        const handles = [
          { x: dx, y: dy }, // nw
          { x: dx + dw, y: dy }, // ne
          { x: dx + dw, y: dy + dh }, // se
          { x: dx, y: dy + dh }, // sw
          { x: dx + dw / 2, y: dy }, // n
          { x: dx + dw, y: dy + dh / 2 }, // e
          { x: dx + dw / 2, y: dy + dh }, // s
          { x: dx, y: dy + dh / 2 } // w
        ];
        for (const hnd of handles) {
          ctxO.beginPath();
          ctxO.rect(hnd.x - handleSize / 2, hnd.y - handleSize / 2, handleSize, handleSize);
          ctxO.fill();
          ctxO.stroke();
        }
        
        // Rotate handle
        const rotY = dy - 30 / z;
        ctxO.beginPath();
        ctxO.moveTo(dx + dw / 2, dy);
        ctxO.lineTo(dx + dw / 2, rotY);
        ctxO.stroke();
        const r = 5.5 / z;
        ctxO.beginPath();
        ctxO.arc(dx + dw / 2, rotY, r, 0, Math.PI * 2);
        ctxO.fill();
        ctxO.stroke();
      }
      
      ctxO.restore();
    }

    // Selected text fields: show bounding box for all selected text fields
    if (selectedTextFieldIdsRef.current.size) {
      const items = getAllSelectedBounds();
      const textItems = items.filter(item => item.type === 'text');
      if (textItems.length > 0) {
        // If we have both strokes and text fields, show combined bounds
        // Otherwise, show bounds for text fields only
        let b: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
        if (selectedStrokeIdsRef.current.size > 0) {
          // Combined bounds already handled above for strokes
          // Just show individual text field outlines
          for (const item of textItems) {
            const pad = 6 / z;
            const x = item.bounds.minX - pad;
            const y = item.bounds.minY - pad;
            const w = (item.bounds.maxX - item.bounds.minX) + pad * 2;
            const h = (item.bounds.maxY - item.bounds.minY) + pad * 2;
            ctxO.save();
            ctxO.strokeStyle = '#3b82f6';
            ctxO.lineWidth = Math.max(1 / z, 1 / (dpr * z));
            ctxO.setLineDash([4 / z, 3 / z]);
            ctxO.strokeRect(x, y, w, h);
            ctxO.restore();
          }
        } else {
          // Only text fields selected - show combined bounding box
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const item of textItems) {
            if (item.bounds.minX < minX) minX = item.bounds.minX;
            if (item.bounds.minY < minY) minY = item.bounds.minY;
            if (item.bounds.maxX > maxX) maxX = item.bounds.maxX;
            if (item.bounds.maxY > maxY) maxY = item.bounds.maxY;
          }
          if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
            b = { minX, minY, maxX, maxY };
            const pad = 6 / z;
            const x = b.minX - pad;
            const y = b.minY - pad;
            const w = (b.maxX - b.minX) + pad * 2;
            const h = (b.maxY - b.minY) + pad * 2;
            ctxO.save();
            ctxO.strokeStyle = '#3b82f6';
            ctxO.lineWidth = Math.max(1 / z, 1 / (dpr * z));
            ctxO.setLineDash([4 / z, 3 / z]);
            ctxO.strokeRect(x, y, w, h);
            ctxO.setLineDash([]);
            // Handles
            const handleSize = 8 / z;
            ctxO.fillStyle = '#3b82f6';
            ctxO.strokeStyle = 'rgba(0,0,0,0.4)';
            ctxO.lineWidth = Math.max(1 / z, 1 / (dpr * z));
            for (const hnd of getSelectionHandles(b)) {
              ctxO.beginPath();
              ctxO.rect(hnd.x - handleSize / 2, hnd.y - handleSize / 2, handleSize, handleSize);
              ctxO.fill();
              ctxO.stroke();
            }
            ctxO.restore();
          }
        }
      }
    }

    // Marquee selection rect
    if (marqueeRef.current) {
      const a = marqueeRef.current.start;
      const c = marqueeRef.current.current;
      const x = Math.min(a.x, c.x);
      const y = Math.min(a.y, c.y);
      const w = Math.abs(a.x - c.x);
      const h = Math.abs(a.y - c.y);
      ctxO.save();
      ctxO.strokeStyle = '#3b82f6';
      ctxO.lineWidth = Math.max(1 / z, 1 / (dpr * z));
      ctxO.setLineDash([6 / z, 4 / z]);
      ctxO.strokeRect(x, y, w, h);
      ctxO.restore();
    }

    ctxO.setTransform(1, 0, 0, 1, 0, 0);
  };

  const findSelectedTextField = (): TextField | null => {
    // Return the first selected text field for backward compatibility
    const firstId = Array.from(selectedTextFieldIdsRef.current)[0];
    if (!firstId) return null;
    return textFieldsRef.current.find((f) => f.id === firstId) || null;
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
    const fontFamily = field.fontFamily || 'sans-serif';
    const fontWeight = field.fontWeight || 'normal';
    const fontStyle = field.fontStyle || 'normal';
    ctx.font = `${fontStyle} ${fontWeight} ${field.fontSize}px ${fontFamily}`;
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

    // Active image manipulation cursors
    if (imageManipulationRef.current) {
      const manip = imageManipulationRef.current;
      if (manip.isResizing && manip.resizeHandle) {
        const cursorMap: Record<string, string> = {
          nw: 'nwse-resize',
          se: 'nwse-resize',
          ne: 'nesw-resize',
          sw: 'nesw-resize',
          n: 'n-resize',
          s: 's-resize',
          e: 'e-resize',
          w: 'w-resize',
        };
        hit.style.cursor = cursorMap[manip.resizeHandle] || 'move';
        return;
      }
      if (manip.isRotating) {
        hit.style.cursor = 'grabbing';
        return;
      }
      if (manip.isMoving) {
        hit.style.cursor = 'grabbing';
        return;
      }
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

    // Image hover cursors for select tool
    if (brushRef.current === 'select' && pointerWorldRef.current) {
      const { x: wx, y: wy } = pointerWorldRef.current;
      const z = zoomRef.current || 1;
      const imagesArray = Array.from(imagesRef.current.entries()).reverse();
      const handleSize = 8 / z;
      for (const [, canvasImage] of imagesArray) {
        const { dx, dy, dw, dh, rotation = 0 } = canvasImage.placement;
        const centerX = dx + dw / 2;
        const centerY = dy + dh / 2;
        let localX = wx;
        let localY = wy;
        if (rotation !== 0) {
          const rad = (-rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          localX = (wx - centerX) * cos - (wy - centerY) * sin + centerX;
          localY = (wx - centerX) * sin + (wy - centerY) * cos + centerY;
        }
        const inside = localX >= dx && localX <= dx + dw && localY >= dy && localY <= dy + dh;
        const rotateHandle = { x: dx + dw / 2, y: dy - 30 / z };
        const rotDist = Math.hypot(wx - rotateHandle.x, wy - rotateHandle.y);
        if (rotDist <= 8 / z && inside) {
          hit.style.cursor = 'grab';
          return;
        }
        const handles = [
          { x: dx, y: dy, type: 'nw' as const },
          { x: dx + dw, y: dy, type: 'ne' as const },
          { x: dx + dw, y: dy + dh, type: 'se' as const },
          { x: dx, y: dy + dh, type: 'sw' as const },
          { x: dx + dw / 2, y: dy, type: 'n' as const },
          { x: dx + dw, y: dy + dh / 2, type: 'e' as const },
          { x: dx + dw / 2, y: dy + dh, type: 's' as const },
          { x: dx, y: dy + dh / 2, type: 'w' as const },
        ];
        for (const hnd of handles) {
          const dist = Math.hypot(wx - hnd.x, wy - hnd.y);
          if (dist <= handleSize) {
            const cursorMap: Record<string, string> = {
              nw: 'nwse-resize',
              se: 'nwse-resize',
              ne: 'nesw-resize',
              sw: 'nesw-resize',
              n: 'n-resize',
              s: 's-resize',
              e: 'e-resize',
              w: 'w-resize',
            };
            hit.style.cursor = cursorMap[hnd.type] || 'pointer';
            return;
          }
        }
        if (inside) {
          hit.style.cursor = 'grab';
          return;
        }
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
    const fontFamily = field.fontFamily || 'sans-serif';
    const fontWeight = field.fontWeight || 'normal';
    const fontStyle = field.fontStyle || 'normal';
    const textColor = field.textColor || field.color;
    const textAlign = field.textAlign || 'left';
    
    input.style.setProperty('font-size', `${field.fontSize * z}px`);
    input.style.setProperty('font-family', fontFamily);
    input.style.setProperty('font-weight', fontWeight);
    input.style.setProperty('font-style', fontStyle);
    input.style.setProperty('color', textColor);
    input.style.setProperty('text-align', textAlign);
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
        layersRef.current = [{ id: 'layer-1', name: 'Layer 1', visible: true }];
        activeLayerIdRef.current = 'layer-1';
      } else {
        strokesRef.current = parsed.strokes || [];
        textFieldsRef.current = parsed.textFields || [];
        layersRef.current = Array.isArray(parsed.layers) && parsed.layers.length ? parsed.layers : [{ id: 'layer-1', name: 'Layer 1', visible: true }];
        activeLayerIdRef.current = typeof parsed.activeLayerId === 'string' ? parsed.activeLayerId : (layersRef.current[0]?.id || 'layer-1');
      }
    } catch {
      strokesRef.current = [];
      textFieldsRef.current = [];
      layersRef.current = [{ id: 'layer-1', name: 'Layer 1', visible: true }];
      activeLayerIdRef.current = 'layer-1';
    }
    ensureLayerIntegrity();
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
        layers: layersRef.current,
        activeLayerId: activeLayerIdRef.current,
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
    exportPng: (options?: ExportOptions) => exportPng(options),
    exportPngSelection: (options?: ExportOptions) => exportPngSelection(options),
    exportSvg: (options?: ExportOptions) => exportSvg(options),
    exportPdf: (options?: ExportOptions) => exportPdf(options) || Promise.resolve(null),
    saveBoard: () => saveBoard(),
    loadImage: (d) => loadImage(d),
    addImage: (d) => addImage(d),
    removeImage: (id) => removeImage(id),
    getAllImages: () => getAllImages(),
    getImageState: (id) => getImageState(id),
    setImageOpacity: (opacity, id) => setImageOpacity(opacity, id),
    setImageRotation: (rotation, id) => setImageRotation(rotation, id),
    setImageSize: (width, height, id) => setImageSize(width, height, id),
    setImagePosition: (x, y, id) => setImagePosition(x, y, id),
    cropImage: (x, y, width, height, id) => cropImage(x, y, width, height, id),
    selectImage: (id) => selectImage(id),
    isImageSelected: () => isImageSelected(),
    getSelectedImageId: () => getSelectedImageId(),
    setZoom: (delta) => {
      zoomRef.current = Math.min(3, Math.max(0.25, zoomRef.current + delta));
      applyTransform();
      renderAll();
      updateCursor();
    },
    resetView: () => { zoomRef.current = 1; panRef.current = {x:0,y:0}; applyTransform(); },
    zoomToFitSelection: () => {
      const items = getAllSelectedBounds();
      if (items.length === 0) {
        // Check if there's a selected text field
        const selectedField = findSelectedTextField();
        if (!selectedField) return;
        const bounds = {
          minX: selectedField.x,
          minY: selectedField.y,
          maxX: selectedField.x + selectedField.width,
          maxY: selectedField.y + selectedField.height
        };
        zoomToBounds(bounds);
        return;
      }
      // Get combined bounds of all selected items
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const item of items) {
        if (item.bounds.minX < minX) minX = item.bounds.minX;
        if (item.bounds.minY < minY) minY = item.bounds.minY;
        if (item.bounds.maxX > maxX) maxX = item.bounds.maxX;
        if (item.bounds.maxY > maxY) maxY = item.bounds.maxY;
      }
      if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
        zoomToBounds({ minX, minY, maxX, maxY });
      }
    },
    zoomToFitAll: () => {
      const bounds = getAllContentBounds();
      if (bounds) {
        zoomToBounds(bounds);
      }
    },
    setCanvasSize: (width, height) => {
      // Canvas size presets - this sets a visual guide/boundary
      // For infinite canvas, we don't actually restrict drawing, but show guides
      canvasSizeRef.current = { width, height };
      renderAll();
    },
    getCanvasSize: () => {
      return canvasSizeRef.current;
    },
    getStrokesJSON: () => { 
      try { 
        return JSON.stringify({
          strokes: strokesRef.current,
          textFields: textFieldsRef.current,
          layers: layersRef.current,
          activeLayerId: activeLayerIdRef.current,
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
          layersRef.current = [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false }];
          activeLayerIdRef.current = 'layer-1';
        } else {
          strokesRef.current = parsed.strokes || [];
          textFieldsRef.current = parsed.textFields || [];
          layersRef.current = Array.isArray(parsed.layers) && parsed.layers.length ? parsed.layers : [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false }];
          activeLayerIdRef.current = typeof parsed.activeLayerId === 'string' ? parsed.activeLayerId : (layersRef.current[0]?.id || 'layer-1');
        }
      } catch {
        strokesRef.current = [];
        textFieldsRef.current = [];
        layersRef.current = [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false }];
        activeLayerIdRef.current = 'layer-1';
      }
      ensureLayerIntegrity();
      editingTextFieldRef.current = null;
      selectedTextFieldIdsRef.current.clear();
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
          layers: layersRef.current,
          activeLayerId: activeLayerIdRef.current,
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
    updateTextFieldFormatting: (formatting) => {
      const field = findSelectedTextField();
      if (!field) return;
      let changed = false;
      if (typeof formatting.fontSize === 'number' && formatting.fontSize > 0) {
        field.fontSize = formatting.fontSize;
        changed = true;
      }
      if (typeof formatting.fontFamily === 'string') {
        field.fontFamily = formatting.fontFamily;
        changed = true;
      }
      if (typeof formatting.fontWeight === 'string') {
        field.fontWeight = formatting.fontWeight;
        changed = true;
      }
      if (typeof formatting.fontStyle === 'string') {
        field.fontStyle = formatting.fontStyle;
        changed = true;
      }
      if (formatting.textAlign === 'left' || formatting.textAlign === 'center' || formatting.textAlign === 'right') {
        field.textAlign = formatting.textAlign;
        changed = true;
      }
      if (typeof formatting.textColor === 'string') {
        field.textColor = formatting.textColor;
        changed = true;
      }
      if (changed) {
        if (autoResizeFieldHeight(field)) {
          // Height may have changed due to font size change
        }
        notifySelectedTextField();
        renderAll();
        updateTextInputPosition();
      }
    },
    getLayers: () => {
      ensureLayerIntegrity();
      return [...layersRef.current];
    },
    getActiveLayerId: () => {
      ensureLayerIntegrity();
      return activeLayerIdRef.current;
    },
    setActiveLayerId: (layerId: string) => {
      ensureLayerIntegrity();
      if (!layersRef.current.some((l) => l.id === layerId)) return;
      activeLayerIdRef.current = layerId;
    },
    createLayer: (name?: string) => {
      ensureLayerIntegrity();
      const id = createHistoryId();
      const label = (name || '').trim() || `Layer ${layersRef.current.length + 1}`;
      layersRef.current = [...layersRef.current, { id, name: label, visible: true, locked: false }];
      activeLayerIdRef.current = id;
      pushHistory(`Layer: ${label}`, true);
      renderAll();
      return id;
    },
    renameLayer: (layerId: string, name: string) => {
      const nextName = (name || '').trim();
      if (!nextName) return;
      layersRef.current = layersRef.current.map((l) => (l.id === layerId ? { ...l, name: nextName } : l));
      pushHistory('Rename layer', true);
    },
    deleteLayer: (layerId: string) => {
      ensureLayerIntegrity();
      if (layersRef.current.length <= 1) return;
      layersRef.current = layersRef.current.filter((l) => l.id !== layerId);
      strokesRef.current = strokesRef.current.filter((s) => (s.layerId || layersRef.current[0].id) !== layerId);
      textFieldsRef.current = textFieldsRef.current.filter((t) => (t.layerId || layersRef.current[0].id) !== layerId);
      if (activeLayerIdRef.current === layerId) activeLayerIdRef.current = layersRef.current[0].id;
      pushHistory('Delete layer', true);
      renderAll();
      notifySelectedTextField();
    },
    moveLayer: (layerId: string, direction: 'up' | 'down') => {
      ensureLayerIntegrity();
      const idx = layersRef.current.findIndex((l) => l.id === layerId);
      if (idx === -1) return;
      const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= layersRef.current.length) return;
      const next = [...layersRef.current];
      const [item] = next.splice(idx, 1);
      next.splice(nextIdx, 0, item);
      layersRef.current = next;
      pushHistory('Reorder layers', true);
      renderAll();
    },
    toggleLayerVisibility: (layerId: string) => {
      layersRef.current = layersRef.current.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l));
      renderAll();
    },
    toggleLayerLock: (layerId: string) => {
      layersRef.current = layersRef.current.map((l) => (l.id === layerId ? { ...l, locked: !l.locked } : l));
      pushHistory('Lock layer', true);
      renderAll();
    },
    moveSelectedTextFieldToLayer: (layerId: string) => {
      ensureLayerIntegrity();
      if (!layersRef.current.some((l) => l.id === layerId)) return;
      if (isLayerLocked(layerId)) return;
      // Move all selected text fields to the layer
      for (const id of selectedTextFieldIdsRef.current) {
        const f = textFieldsRef.current.find((t) => t.id === id);
        if (f) f.layerId = layerId;
      }
      if (selectedTextFieldIdsRef.current.size > 0) {
        pushHistory('Move text layer', true);
        renderAll();
        notifySelectedTextField();
      }
    },
    alignSelected: (alignment) => alignSelected(alignment),
    distributeSelected: (direction) => distributeSelected(direction),
    autoArrange: () => autoArrange(),
    convertShapesToPerfect: (shapes) => convertShapesToPerfect(shapes),
    getSelectedStrokes: () => getSelectedStrokes(),
    getAllStrokes: () => getAllStrokes(),
    groupSelected: () => groupSelected(),
    ungroupSelected: () => ungroupSelected(),
    lockSelected: () => lockSelected(),
    unlockSelected: () => unlockSelected(),
    bringToFront: () => bringToFront(),
    sendToBack: () => sendToBack(),
    flipHorizontal: () => flipHorizontal(),
    flipVertical: () => flipVertical(),
    getSelectedObjectsProperties: () => getSelectedObjectsProperties(),
    updateSelectedObjectsProperties: (props) => updateSelectedObjectsProperties(props),
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
    ensureLayerIntegrity();
    if (isLayerLocked(activeLayerIdRef.current)) {
      return;
    }
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
      fontFamily: 'sans-serif',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      textColor: colorRef.current,
      layerId: activeLayerIdRef.current,
    };
    
    textFieldsRef.current.push(newField);
    editingTextFieldRef.current = newField.id;
    selectedTextFieldIdsRef.current = new Set([newField.id]);
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

      // If we switch into selection interactions, force-cancel any drawing state
      // (prevents "stuck drawing" from blocking selection drags).
      if (brushRef.current === 'select') {
        isDrawingRef.current = false;
        isActivelyDrawingRef.current = false;
        pointsRef.current = [];
      }
      
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

    // Select tool: select + move strokes/shapes/text, or marquee select.
    if (brushRef.current === 'select') {
      cancelHold(e.pointerId);
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const { x: wx, y: wy } = getWorldFromLocal(lx, ly);

      // Check if clicking on any image (check from top to bottom, last image is on top)
      let clickedImage: { id: string; placement: ImagePlacement } | null = null;
      const imagesArray = Array.from(imagesRef.current.entries()).reverse(); // Reverse to check top images first
      for (const [imageId, canvasImage] of imagesArray) {
        const placement = canvasImage.placement;
        const { dx, dy, dw, dh, rotation = 0 } = placement;
        
        // Check if point is within image bounds (accounting for rotation)
        let isInside = false;
        if (rotation === 0) {
          isInside = wx >= dx && wx <= dx + dw && wy >= dy && wy <= dy + dh;
        } else {
          // Transform point to image-local coordinates
          const centerX = dx + dw / 2;
          const centerY = dy + dh / 2;
          const rad = (-rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const localX = (wx - centerX) * cos - (wy - centerY) * sin;
          const localY = (wx - centerX) * sin + (wy - centerY) * cos;
          isInside = localX >= -dw/2 && localX <= dw/2 && localY >= -dh/2 && localY <= dh/2;
        }
        
        if (isInside) {
          clickedImage = { id: imageId, placement };
          break;
        }
      }
      
      if (clickedImage) {
        const placement = clickedImage.placement;
        const { dx, dy, dw, dh, rotation = 0 } = placement;
        selectedImageIdRef.current = clickedImage.id;
        // Check if clicking on resize handle or rotate handle
        const handleSize = 8 / (zoomRef.current || 1);
        const handles = [
          { x: dx, y: dy, type: 'nw' },
          { x: dx + dw, y: dy, type: 'ne' },
          { x: dx + dw, y: dy + dh, type: 'se' },
          { x: dx, y: dy + dh, type: 'sw' },
          { x: dx + dw / 2, y: dy, type: 'n' },
          { x: dx + dw, y: dy + dh / 2, type: 'e' },
          { x: dx + dw / 2, y: dy + dh, type: 's' },
          { x: dx, y: dy + dh / 2, type: 'w' }
        ];
        
        let clickedHandle: { x: number; y: number; type: string } | null = null;
        for (const handle of handles) {
          const dist = Math.hypot(wx - handle.x, wy - handle.y);
          if (dist <= handleSize) {
            clickedHandle = handle;
            break;
          }
        }
        
        // Check rotate handle
        const rotY = dy - 30 / (zoomRef.current || 1);
        const rotX = dx + dw / 2;
        const rotDist = Math.hypot(wx - rotX, wy - rotY);
        const isRotateHandle = rotDist <= 8 / (zoomRef.current || 1);
        
        if (clickedHandle) {
          imageSelectedRef.current = true;
          imageManipulationRef.current = {
            isResizing: true,
            isRotating: false,
            isMoving: false,
            isCropping: false,
            resizeHandle: clickedHandle.type as any,
            startPos: { x: wx, y: wy }
          };
          renderSelectionOverlay();
          return;
        } else if (isRotateHandle) {
          imageSelectedRef.current = true;
          const centerX = dx + dw / 2;
          const centerY = dy + dh / 2;
          const startAngle = Math.atan2(wy - centerY, wx - centerX);
          const currentRotation = placement.rotation || 0;
          imageManipulationRef.current = {
            isResizing: false,
            isRotating: true,
            isMoving: false,
            isCropping: false,
            startPos: { x: wx, y: wy },
            startAngle: startAngle,
            startRotation: currentRotation
          };
          renderSelectionOverlay();
          return;
        } else {
          // Clicked on image, select it and prepare to move
          imageSelectedRef.current = true;
          imageManipulationRef.current = {
            isResizing: false,
            isRotating: false,
            isMoving: true,
            isCropping: false,
            startPos: { x: wx, y: wy }
          };
          selectedStrokeIdsRef.current.clear();
          selectedTextFieldIdsRef.current.clear();
          notifySelectedTextField();
          renderSelectionOverlay();
          return;
        }
      } else {
        // Clicked outside all images, deselect
        imageSelectedRef.current = false;
        selectedImageIdRef.current = null;
        imageManipulationRef.current = null;
      }

      // Prefer text fields first (existing logic for drag handles etc).
      const hitText = getTextFieldAtPoint(lx, ly);
      // If hovering a resize handle on a text field, allow resizing in Select mode too.
      if (hitText && hitText.field && hitText.handle) {
        if (isLayerLocked(hitText.field.layerId)) {
          if (shiftPressedRef.current) {
            if (selectedTextFieldIdsRef.current.has(hitText.field.id)) selectedTextFieldIdsRef.current.delete(hitText.field.id);
            else selectedTextFieldIdsRef.current.add(hitText.field.id);
          } else {
            selectedTextFieldIdsRef.current = new Set([hitText.field.id]);
          }
          selectedStrokeIdsRef.current.clear();
          notifySelectedTextField();
          renderAll();
          renderSelectionOverlay();
          return;
        }
        resizingTextFieldRef.current = { id: hitText.field.id, handle: hitText.handle };
        if (shiftPressedRef.current) {
          if (selectedTextFieldIdsRef.current.has(hitText.field.id)) selectedTextFieldIdsRef.current.delete(hitText.field.id);
          else selectedTextFieldIdsRef.current.add(hitText.field.id);
        } else {
          selectedTextFieldIdsRef.current = new Set([hitText.field.id]);
        }
        selectedStrokeIdsRef.current.clear();
        notifySelectedTextField();
        renderAll();
        return;
      }
      if (hitText && hitText.field && !hitText.handle) {
        // Locked layer: allow select but don't drag/edit.
        if (isLayerLocked(hitText.field.layerId)) {
          if (shiftPressedRef.current) {
            if (selectedTextFieldIdsRef.current.has(hitText.field.id)) selectedTextFieldIdsRef.current.delete(hitText.field.id);
            else selectedTextFieldIdsRef.current.add(hitText.field.id);
          } else {
            selectedTextFieldIdsRef.current = new Set([hitText.field.id]);
          }
          selectedStrokeIdsRef.current.clear();
          notifySelectedTextField();
          renderAll();
          renderSelectionOverlay();
          return;
        }
        // Shift-click: toggle selection. Regular click: replace selection.
        if (shiftPressedRef.current) {
          if (selectedTextFieldIdsRef.current.has(hitText.field.id)) selectedTextFieldIdsRef.current.delete(hitText.field.id);
          else selectedTextFieldIdsRef.current.add(hitText.field.id);
        } else {
          selectedTextFieldIdsRef.current = new Set([hitText.field.id]);
        }
        selectedStrokeIdsRef.current.clear();
        notifySelectedTextField();
        // Only start dragging if this field is still selected after toggle and not locked
        if (selectedTextFieldIdsRef.current.has(hitText.field.id) && !hitText.field.locked) {
          draggingTextFieldRef.current = hitText.field.id;
          textFieldDragOffsetRef.current = { x: wx - hitText.field.x, y: wy - hitText.field.y };
        } else {
          draggingTextFieldRef.current = null;
        }
        renderAll();
        renderSelectionOverlay();
        return;
      }

      // Resize handle on selected strokes?
      if (selectedStrokeIdsRef.current.size) {
        const b = getSelectionBounds(selectedStrokeIdsRef.current);
        if (b) {
          // Rotate handle?
          if (findRotateHandleAtWorldPoint(wx, wy, b)) {
            const originals = new Map<string, Point[]>();
            for (const id of selectedStrokeIdsRef.current) {
              const s = strokesRef.current.find((st) => st.id === id);
              if (!s || s.locked) continue; // Skip locked objects
              originals.set(id, s.points.map((p) => ({ ...p })));
            }
            if (originals.size === 0) return; // No unlocked objects to rotate
            const c = getSelectionCenter(b);
            rotatingStrokesRef.current = {
              center: c,
              startAngle: Math.atan2(wy - c.y, wx - c.x),
              originals,
            };
            renderAll();
            renderSelectionOverlay();
            return;
          }
          const handle = findSelectionHandleAtWorldPoint(wx, wy, b);
          if (handle) {
            const originals = new Map<string, Point[]>();
            for (const id of selectedStrokeIdsRef.current) {
              const s = strokesRef.current.find((st) => st.id === id);
              if (!s || s.locked) continue; // Skip locked objects
              originals.set(id, s.points.map((p) => ({ ...p })));
            }
            if (originals.size === 0) return; // No unlocked objects to resize
            const handles = {
              nw: { x: b.minX, y: b.minY },
              ne: { x: b.maxX, y: b.minY },
              sw: { x: b.minX, y: b.maxY },
              se: { x: b.maxX, y: b.maxY },
            } as const;
            const opposite = {
              nw: { x: b.maxX, y: b.maxY },
              ne: { x: b.minX, y: b.maxY },
              sw: { x: b.maxX, y: b.minY },
              se: { x: b.minX, y: b.minY },
            } as const;
            resizingStrokesRef.current = {
              handle,
              anchor: opposite[handle],
              handleStart: handles[handle],
              originals,
            };
            renderAll();
            renderSelectionOverlay();
            return;
          }
        }
      }

      // Stroke hit test
      const hitStroke = findStrokeAtWorldPoint(wx, wy);
      if (hitStroke) {
        if (shiftPressedRef.current) {
          if (selectedStrokeIdsRef.current.has(hitStroke.id)) selectedStrokeIdsRef.current.delete(hitStroke.id);
          else selectedStrokeIdsRef.current.add(hitStroke.id);
        } else {
          selectedStrokeIdsRef.current = new Set([hitStroke.id]);
        }
        selectedTextFieldIdsRef.current.clear();
        notifySelectedTextField();

        // Start dragging selected strokes (skip locked ones)
        const originals = new Map<string, Point[]>();
        for (const id of selectedStrokeIdsRef.current) {
          const s = strokesRef.current.find((st) => st.id === id);
          if (!s || s.locked) continue; // Skip locked objects
          originals.set(id, s.points.map((p) => ({ ...p })));
        }
        if (originals.size > 0) {
          draggingStrokesRef.current = { start: { x: wx, y: wy }, originals };
        }
        renderAll();
        renderSelectionOverlay();
        return;
      }

      // Empty area: start marquee selection (unless shift, then keep current selection).
      if (!shiftPressedRef.current) {
        selectedStrokeIdsRef.current.clear();
        selectedTextFieldIdsRef.current.clear();
        imageSelectedRef.current = false;
        imageManipulationRef.current = null;
        notifySelectedTextField();
      }
      marqueeRef.current = { start: { x: wx, y: wy }, current: { x: wx, y: wy } };
      renderSelectionOverlay();
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
              selectedTextFieldIdsRef.current.delete(field.id);
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
          if (isLayerLocked(hit.field.layerId)) {
            selectedTextFieldIdsRef.current = new Set([hit.field.id]);
            notifySelectedTextField();
            renderAll();
            return;
          }
          if (!hit.field.locked) {
            resizingTextFieldRef.current = { id: hit.field.id, handle: hit.handle };
            selectedTextFieldIdsRef.current = new Set([hit.field.id]);
          }
          notifySelectedTextField();
          renderAll();
          return;
        } else if (hit && hit.field) {
          if (isLayerLocked(hit.field.layerId)) {
            selectedTextFieldIdsRef.current = new Set([hit.field.id]);
            editingTextFieldRef.current = null;
            notifySelectedTextField();
            renderAll();
            return;
          }
          // Click on existing field (not handle): select, allow editing, and prepare for dragging
          // Stop editing previous field if switching
          if (editingTextFieldRef.current && editingTextFieldRef.current !== hit.field.id) {
            const prevField = textFieldsRef.current.find(f => f.id === editingTextFieldRef.current);
            if (prevField && textInputRef.current) {
              prevField.text = textInputRef.current.value;
            }
          }
          
          selectedTextFieldIdsRef.current = new Set([hit.field.id]);
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
          selectedTextFieldIdsRef.current.clear();
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
      if (currentBrush !== 'text') {
          cancelHold(e.pointerId);
          const hit = getTextFieldAtPoint(lx, ly);
          if (hit && hit.field && !hit.handle) {
            const field = hit.field;
            if (isLayerLocked(field.layerId)) {
              selectedTextFieldIdsRef.current = new Set([field.id]);
              notifySelectedTextField();
              renderAll();
              return;
            }
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
                selectedTextFieldIdsRef.current.delete(field.id);
                notifySelectedTextField();
                renderAll();
                updateTextInputPosition();
                pushHistory();
              }
              return;
            }
            
            // Select and start dragging (only if not locked)
            selectedTextFieldIdsRef.current = new Set([field.id]);
            if (!field.locked) {
              draggingTextFieldRef.current = field.id;
              textFieldDragOffsetRef.current = { x: worldX - field.x, y: worldY - field.y };
            }
            notifySelectedTextField();
            renderAll();
            return;
          }
        }
      
      // Deselect text fields when clicking on empty space with other tools
      if (selectedTextFieldIdsRef.current.size > 0) {
        selectedTextFieldIdsRef.current.clear();
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

      // Select interactions must take precedence over any drawing early-returns.
      if (brushRef.current === 'select') {
        // Handle rotating selected strokes
        if (rotatingStrokesRef.current) {
          const { x: wx, y: wy } = getWorldFromLocal(lx, ly);
          const r = rotatingStrokesRef.current;
          const cx = r.center.x;
          const cy = r.center.y;
          const ang = Math.atan2(wy - cy, wx - cx);
          let delta = ang - r.startAngle;
          if (shiftPressedRef.current) {
            const snap = Math.PI / 12; // 15°
            delta = Math.round(delta / snap) * snap;
          }
          const cos = Math.cos(delta);
          const sin = Math.sin(delta);
          for (const [id, pts] of r.originals.entries()) {
            const s = strokesRef.current.find((st) => st.id === id);
            if (!s) continue;
            s.points = pts.map((p) => {
              const dx = p.x - cx;
              const dy = p.y - cy;
              return { ...p, x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
            });
          }
          renderAll();
          renderSelectionOverlay();
          return;
        }
        // Handle resizing selected strokes
        if (resizingStrokesRef.current) {
          const { x: wx, y: wy } = getWorldFromLocal(lx, ly);
          const r = resizingStrokesRef.current;
          const ax = r.anchor.x;
          const ay = r.anchor.y;
          const denomX = (r.handleStart.x - ax) || 1e-6;
          const denomY = (r.handleStart.y - ay) || 1e-6;
          let sx = (wx - ax) / denomX;
          let sy = (wy - ay) / denomY;
          // Prevent flips; clamp to sane range
          sx = Math.max(0.05, Math.min(50, sx));
          sy = Math.max(0.05, Math.min(50, sy));
          if (shiftPressedRef.current) {
            const s = Math.max(sx, sy);
            sx = s;
            sy = s;
          }
          for (const [id, pts] of r.originals.entries()) {
            const s = strokesRef.current.find((st) => st.id === id);
            if (!s) continue;
            s.points = pts.map((p) => ({ ...p, x: ax + (p.x - ax) * sx, y: ay + (p.y - ay) * sy }));
          }
          renderAll();
          renderSelectionOverlay();
          return;
        }
        // Handle stroke dragging
        if (draggingStrokesRef.current) {
          const { x: wx, y: wy } = getWorldFromLocal(lx, ly);
          const drag = draggingStrokesRef.current;
          const dx = wx - drag.start.x;
          const dy = wy - drag.start.y;
          for (const [id, pts] of drag.originals.entries()) {
            const s = strokesRef.current.find((st) => st.id === id);
            if (!s) continue;
            s.points = pts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
          }
          renderAll();
          renderSelectionOverlay();
          return;
        }
        // Handle marquee selection
        if (marqueeRef.current) {
          const { x: wx, y: wy } = getWorldFromLocal(lx, ly);
          marqueeRef.current.current = { x: wx, y: wy };
          renderSelectionOverlay();
          return;
        }
        // Handle text dragging (when select grabbed a text field)
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
            renderAll();
          }
          return;
        }
        // Handle image manipulation
        if (imageManipulationRef.current && selectedImageIdRef.current) {
          const { x: wx, y: wy } = getWorldFromLocal(lx, ly);
          const manip = imageManipulationRef.current;
          const canvasImage = imagesRef.current.get(selectedImageIdRef.current);
          if (!canvasImage) return;
          const placement = canvasImage.placement;
          
          if (manip.isRotating && manip.startAngle !== undefined && manip.startRotation !== undefined) {
            const centerX = placement.dx + placement.dw / 2;
            const centerY = placement.dy + placement.dh / 2;
            const currentAngle = Math.atan2(wy - centerY, wx - centerX);
            let delta = ((currentAngle - manip.startAngle) * 180) / Math.PI;
            if (shiftPressedRef.current) {
              delta = Math.round(delta / 15) * 15; // Snap to 15° increments
            }
            placement.rotation = manip.startRotation + delta;
            refreshBackground();
            renderSelectionOverlay();
            return;
          }
          
          if (manip.isResizing && manip.resizeHandle && manip.startPos) {
            const startX = manip.startPos.x;
            const startY = manip.startPos.y;
            const dx = wx - startX;
            const dy = wy - startY;
            const aspectRatio = placement.dw / placement.dh;
            
            let newDw = placement.dw;
            let newDh = placement.dh;
            let newDx = placement.dx;
            let newDy = placement.dy;
            
            switch (manip.resizeHandle) {
              case 'nw':
                newDw = placement.dw - dx;
                newDh = shiftPressedRef.current ? newDw / aspectRatio : placement.dh - dy;
                newDx = placement.dx + dx;
                newDy = placement.dy + (placement.dh - newDh);
                break;
              case 'ne':
                newDw = placement.dw + dx;
                newDh = shiftPressedRef.current ? newDw / aspectRatio : placement.dh - dy;
                newDy = placement.dy + (placement.dh - newDh);
                break;
              case 'sw':
                newDw = placement.dw - dx;
                newDh = shiftPressedRef.current ? newDw / aspectRatio : placement.dh + dy;
                newDx = placement.dx + dx;
                break;
              case 'se':
                newDw = placement.dw + dx;
                newDh = shiftPressedRef.current ? newDw / aspectRatio : placement.dh + dy;
                break;
              case 'n':
                newDh = placement.dh - dy;
                newDw = shiftPressedRef.current ? newDh * aspectRatio : placement.dw;
                newDy = placement.dy + dy;
                newDx = placement.dx + (placement.dw - newDw) / 2;
                break;
              case 's':
                newDh = placement.dh + dy;
                newDw = shiftPressedRef.current ? newDh * aspectRatio : placement.dw;
                newDx = placement.dx + (placement.dw - newDw) / 2;
                break;
              case 'e':
                newDw = placement.dw + dx;
                newDh = shiftPressedRef.current ? newDw / aspectRatio : placement.dh;
                newDy = placement.dy + (placement.dh - newDh) / 2;
                break;
              case 'w':
                newDw = placement.dw - dx;
                newDh = shiftPressedRef.current ? newDw / aspectRatio : placement.dh;
                newDx = placement.dx + dx;
                newDy = placement.dy + (placement.dh - newDh) / 2;
                break;
            }
            
            if (newDw > 10 && newDh > 10) {
              placement.dw = newDw;
              placement.dh = newDh;
              placement.dx = newDx;
              placement.dy = newDy;
              manip.startPos = { x: wx, y: wy };
              refreshBackground();
              renderSelectionOverlay();
            }
            return;
          }
          
          if (manip.isMoving && manip.startPos) {
            const dx = wx - manip.startPos.x;
            const dy = wy - manip.startPos.y;
            placement.dx += dx;
            placement.dy += dy;
            manip.startPos = { x: wx, y: wy };
            refreshBackground();
            renderSelectionOverlay();
            return;
          }
        }
      }
      
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
      
      // Handle stroke dragging (select tool)
      if (draggingStrokesRef.current) {
        const { x: wx, y: wy } = getWorldFromLocal(lx, ly);
        const drag = draggingStrokesRef.current;
        const dx = wx - drag.start.x;
        const dy = wy - drag.start.y;
        for (const [id, pts] of drag.originals.entries()) {
          const s = strokesRef.current.find((st) => st.id === id);
          if (!s) continue;
          s.points = pts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
        }
        renderAll();
        renderSelectionOverlay();
        return;
      }

      // Handle marquee selection (select tool)
      if (marqueeRef.current) {
        const { x: wx, y: wy } = getWorldFromLocal(lx, ly);
        marqueeRef.current.current = { x: wx, y: wy };
        renderSelectionOverlay();
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
      // Commit image manipulation if active
      if (imageManipulationRef.current && (imageManipulationRef.current.isResizing || imageManipulationRef.current.isRotating || imageManipulationRef.current.isMoving)) {
        pushHistory();
        imageManipulationRef.current = null;
      }
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

      if (rotatingStrokesRef.current) {
        rotatingStrokesRef.current = null;
        pushHistory();
        renderAll();
        renderSelectionOverlay();
        return;
      }

      if (resizingStrokesRef.current) {
        resizingStrokesRef.current = null;
        pushHistory();
        renderAll();
        renderSelectionOverlay();
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

      if (draggingStrokesRef.current) {
        draggingStrokesRef.current = null;
        pushHistory();
        renderAll();
        renderSelectionOverlay();
        return;
      }

      if (marqueeRef.current) {
        const a = marqueeRef.current.start;
        const c = marqueeRef.current.current;
        marqueeRef.current = null;
        const x0 = Math.min(a.x, c.x);
        const y0 = Math.min(a.y, c.y);
        const x1 = Math.max(a.x, c.x);
        const y1 = Math.max(a.y, c.y);
        ensureLayerIntegrity();
        const pickedStrokes = new Set<string>();
        const pickedTextFields = new Set<string>();
        // Pick strokes
        for (const s of strokesRef.current) {
          const b = getStrokeBounds(s);
          const intersects = !(b.maxX < x0 || b.minX > x1 || b.maxY < y0 || b.minY > y1);
          if (intersects) pickedStrokes.add(s.id);
        }
        // Pick text fields
        for (const f of textFieldsRef.current) {
          const intersects = !(f.x + f.width < x0 || f.x > x1 || f.y + f.height < y0 || f.y > y1);
          if (intersects) pickedTextFields.add(f.id);
        }
        if (shiftPressedRef.current) {
          for (const id of pickedStrokes) selectedStrokeIdsRef.current.add(id);
          for (const id of pickedTextFields) selectedTextFieldIdsRef.current.add(id);
        } else {
          selectedStrokeIdsRef.current = pickedStrokes;
          selectedTextFieldIdsRef.current = pickedTextFields;
        }
        notifySelectedTextField();
        renderAll();
        renderSelectionOverlay();
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

      const isMod = e.metaKey || e.ctrlKey;
      const keyLower = (e.key || '').toLowerCase();
      
      if (e.code === 'Space') {
        e.preventDefault(); 
        spacePressedRef.current = true; 
      } else if (e.key === 'Shift') {
        shiftPressedRef.current = true;
      } else if (isMod && keyLower === 'c') {
        // Copy selected strokes or selected text field
        e.preventDefault();
        ensureLayerIntegrity();
        const clip: { strokes?: Stroke[]; textFields?: TextField[]; bounds?: { minX: number; minY: number; maxX: number; maxY: number } } = {};
        if (selectedStrokeIdsRef.current.size) {
          const ids = Array.from(selectedStrokeIdsRef.current);
          const strokes = ids.map((id) => strokesRef.current.find((s) => s.id === id)).filter(Boolean) as Stroke[];
          clip.strokes = strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }));
          clip.bounds = getSelectionBounds(selectedStrokeIdsRef.current) || undefined;
        } else if (selectedTextFieldIdsRef.current.size) {
          const ids = Array.from(selectedTextFieldIdsRef.current);
          const fields = ids.map((id) => textFieldsRef.current.find((t) => t.id === id)).filter(Boolean) as TextField[];
          if (fields.length > 0) {
            clip.textFields = fields.map((f) => ({ ...f }));
            // Calculate combined bounds
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const f of fields) {
              if (f.x < minX) minX = f.x;
              if (f.y < minY) minY = f.y;
              if (f.x + f.width > maxX) maxX = f.x + f.width;
              if (f.y + f.height > maxY) maxY = f.y + f.height;
            }
            clip.bounds = { minX, minY, maxX, maxY };
          }
        }
        clipboardRef.current = (clip.strokes?.length || clip.textFields?.length) ? clip : null;
      } else if (isMod && keyLower === 'v') {
        // Paste
        e.preventDefault();
        ensureLayerIntegrity();
        if (isLayerLocked(activeLayerIdRef.current)) return;
        const clip = clipboardRef.current;
        if (!clip) return;
        const z = zoomRef.current || 1;
        const dx = 18 / z;
        const dy = 18 / z;
        if (clip.strokes?.length) {
          const newIds = new Set<string>();
          for (const s of clip.strokes) {
            const ns = cloneStrokeWithOffset({ ...s, layerId: activeLayerIdRef.current }, dx, dy);
            strokesRef.current.push(ns);
            newIds.add(ns.id);
          }
          selectedStrokeIdsRef.current = newIds;
          selectedTextFieldIdsRef.current.clear();
          notifySelectedTextField();
          renderAll();
          renderSelectionOverlay();
          pushHistory('Paste', true);
          return;
        }
        if (clip.textFields?.length) {
          const newIds = new Set<string>();
          for (const base of clip.textFields) {
            const nf = cloneTextFieldWithOffset({ ...base, layerId: activeLayerIdRef.current }, dx, dy);
            textFieldsRef.current.push(nf);
            newIds.add(nf.id);
          }
          selectedTextFieldIdsRef.current = newIds;
          selectedStrokeIdsRef.current.clear();
          notifySelectedTextField();
          renderAll();
          updateTextInputPosition();
          pushHistory('Paste', true);
        }
      } else if (isMod && keyLower === 'd') {
        // Duplicate (copy + paste)
        e.preventDefault();
        ensureLayerIntegrity();
        if (isLayerLocked(activeLayerIdRef.current)) return;
        const z = zoomRef.current || 1;
        const dx = 18 / z;
        const dy = 18 / z;
        if (selectedStrokeIdsRef.current.size) {
          const ids = Array.from(selectedStrokeIdsRef.current);
          const strokes = ids.map((id) => strokesRef.current.find((s) => s.id === id)).filter(Boolean) as Stroke[];
          const newIds = new Set<string>();
          for (const s of strokes) {
            const ns = cloneStrokeWithOffset({ ...s, layerId: activeLayerIdRef.current }, dx, dy);
            strokesRef.current.push(ns);
            newIds.add(ns.id);
          }
          selectedStrokeIdsRef.current = newIds;
          selectedTextFieldIdsRef.current.clear();
          notifySelectedTextField();
          renderAll();
          renderSelectionOverlay();
          pushHistory('Duplicate', true);
          return;
        }
        if (selectedTextFieldIdsRef.current.size) {
          const ids = Array.from(selectedTextFieldIdsRef.current);
          const fields = ids.map((id) => textFieldsRef.current.find((t) => t.id === id)).filter(Boolean) as TextField[];
          const newIds = new Set<string>();
          for (const f of fields) {
            const nf = cloneTextFieldWithOffset({ ...f, layerId: activeLayerIdRef.current }, dx, dy);
            textFieldsRef.current.push(nf);
            newIds.add(nf.id);
          }
          selectedTextFieldIdsRef.current = newIds;
          selectedStrokeIdsRef.current.clear();
          notifySelectedTextField();
          renderAll();
          updateTextInputPosition();
          pushHistory('Duplicate', true);
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTextFieldIdsRef.current.size) {
        // Delete selected text fields
        e.preventDefault();
        for (const id of selectedTextFieldIdsRef.current) {
          const index = textFieldsRef.current.findIndex(f => f.id === id);
          if (index !== -1) {
            textFieldsRef.current.splice(index, 1);
            if (editingTextFieldRef.current === id) {
              editingTextFieldRef.current = null;
              if (textInputRef.current) {
                textInputRef.current.style.display = 'none';
              }
            }
          }
        }
        selectedTextFieldIdsRef.current.clear();
        notifySelectedTextField();
        renderAll();
        updateTextInputPosition();
        pushHistory();
      } else if (e.key === 'Escape' && selectedTextFieldIdsRef.current.size) {
        // Deselect text fields
        selectedTextFieldIdsRef.current.clear();
        notifySelectedTextField();
        renderAll();
      } else if (isMod && keyLower === 'a') {
        // Select All (Ctrl/Cmd+A)
        e.preventDefault();
        selectedStrokeIdsRef.current = new Set(strokesRef.current.map(s => s.id));
        selectedTextFieldIdsRef.current = new Set(textFieldsRef.current.map(f => f.id));
        notifySelectedTextField();
        renderAll();
        renderSelectionOverlay();
      } else if (isMod && keyLower === 'i') {
        // Invert Selection (Ctrl/Cmd+I)
        e.preventDefault();
        const allStrokeIds = new Set(strokesRef.current.map(s => s.id));
        const allTextFieldIds = new Set(textFieldsRef.current.map(f => f.id));
        // Invert strokes
        const invertedStrokes = new Set<string>();
        for (const id of allStrokeIds) {
          if (!selectedStrokeIdsRef.current.has(id)) {
            invertedStrokes.add(id);
          }
        }
        selectedStrokeIdsRef.current = invertedStrokes;
        // Invert text fields
        const invertedTextFields = new Set<string>();
        for (const id of allTextFieldIds) {
          if (!selectedTextFieldIdsRef.current.has(id)) {
            invertedTextFields.add(id);
          }
        }
        selectedTextFieldIdsRef.current = invertedTextFields;
        notifySelectedTextField();
        renderAll();
        renderSelectionOverlay();
      } else if (isMod && keyLower === 'g') {
        // Group Selected (Ctrl/Cmd+G)
        e.preventDefault();
        if (selectedStrokeIdsRef.current.size + selectedTextFieldIdsRef.current.size < 2) return;
        const groupId = createHistoryId();
        groupsRef.current.set(groupId, {
          strokeIds: new Set(selectedStrokeIdsRef.current),
          textFieldIds: new Set(selectedTextFieldIdsRef.current)
        });
        // Associate items with group
        for (const id of selectedStrokeIdsRef.current) {
          strokeGroupIdRef.current.set(id, groupId);
        }
        for (const id of selectedTextFieldIdsRef.current) {
          textFieldGroupIdRef.current.set(id, groupId);
        }
        pushHistory('Group', true);
        renderAll();
        renderSelectionOverlay();
      } else if (isMod && keyLower === 'u') {
        // Ungroup Selected (Ctrl/Cmd+U)
        e.preventDefault();
        const groupIds = new Set<string>();
        // Find all groups that contain selected items
        for (const id of selectedStrokeIdsRef.current) {
          const gid = strokeGroupIdRef.current.get(id);
          if (gid) groupIds.add(gid);
        }
        for (const id of selectedTextFieldIdsRef.current) {
          const gid = textFieldGroupIdRef.current.get(id);
          if (gid) groupIds.add(gid);
        }
        // Ungroup all found groups
        for (const gid of groupIds) {
          const group = groupsRef.current.get(gid);
          if (group) {
            for (const id of group.strokeIds) {
              strokeGroupIdRef.current.delete(id);
            }
            for (const id of group.textFieldIds) {
              textFieldGroupIdRef.current.delete(id);
            }
            groupsRef.current.delete(gid);
          }
        }
        if (groupIds.size > 0) {
          pushHistory('Ungroup', true);
          renderAll();
          renderSelectionOverlay();
        }
      }

      // Delete selected strokes
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedStrokeIdsRef.current.size) {
        e.preventDefault();
        strokesRef.current = strokesRef.current.filter((s) => !selectedStrokeIdsRef.current.has(s.id));
        selectedStrokeIdsRef.current.clear();
        renderAll();
        renderSelectionOverlay();
        pushHistory();
      } else if (e.key === 'Escape' && selectedStrokeIdsRef.current.size) {
        selectedStrokeIdsRef.current.clear();
        renderAll();
        renderSelectionOverlay();
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
      if (e.key === 'Shift') {
        shiftPressedRef.current = false;
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
  useEffect(() => { eraserModeRef.current = eraserMode; }, [eraserMode]);
  useEffect(() => { shapeFillRef.current = shapeFill; }, [shapeFill]);
  useEffect(() => { cornerRadiusRef.current = cornerRadius; }, [cornerRadius]);
  useEffect(() => { polygonSidesRef.current = polygonSides; }, [polygonSides]);
  useEffect(() => { starPointsRef.current = starPoints; }, [starPoints]);
  
  function updateRulers() {
    // Ruler update logic - for now just a placeholder
    // The rulers are rendered in the JSX, so this function can be used for dynamic updates if needed
    if (!showRulersRef.current) return;
    // Future: Add logic to update ruler markings based on zoom/pan
  }
  
  useEffect(() => {
    showGridRef.current = showGrid;
    showRulersRef.current = showRulers;
    gridSizeRef.current = gridSize;
    renderGrid();
    updateRulers();
    updateCursor();
  }, [showGrid, gridSize, showRulers]);
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
      case 'eraser':
        // Full-strength erase (no partial transparency)
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-out';
        width = sizeRef.current * 2.5 * pressure;
        break;
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
        const cornerRadius = cornerRadiusRef.current || 0;
        if (cornerRadius > 0) {
          // Generate rounded rectangle points
          const r = Math.min(cornerRadius, width / 2, height / 2);
          const points: Point[] = [];
          const segments = 8; // segments per corner
          
          // Top edge (right to left)
          points.push(toPoint(maxX - r, minY));
          // Top-right corner
          for (let i = 0; i <= segments; i++) {
            const angle = Math.PI / 2 * (i / segments);
            points.push(toPoint(maxX - r + r * Math.cos(angle), minY + r - r * Math.sin(angle)));
          }
          // Right edge
          points.push(toPoint(maxX, minY + r));
          points.push(toPoint(maxX, maxY - r));
          // Bottom-right corner
          for (let i = 0; i <= segments; i++) {
            const angle = Math.PI / 2 * (i / segments);
            points.push(toPoint(maxX - r + r * Math.cos(Math.PI / 2 + angle), maxY - r + r * Math.sin(Math.PI / 2 + angle)));
          }
          // Bottom edge
          points.push(toPoint(maxX - r, maxY));
          points.push(toPoint(minX + r, maxY));
          // Bottom-left corner
          for (let i = 0; i <= segments; i++) {
            const angle = Math.PI / 2 * (i / segments);
            points.push(toPoint(minX + r - r * Math.cos(Math.PI + angle), maxY - r + r * Math.sin(Math.PI + angle)));
          }
          // Left edge
          points.push(toPoint(minX, maxY - r));
          points.push(toPoint(minX, minY + r));
          // Top-left corner
          for (let i = 0; i <= segments; i++) {
            const angle = Math.PI / 2 * (i / segments);
            points.push(toPoint(minX + r - r * Math.cos(Math.PI * 1.5 + angle), minY + r - r * Math.sin(Math.PI * 1.5 + angle)));
          }
          return { points, closed: true };
        } else {
          const points = [
            toPoint(minX, minY),
            toPoint(maxX, minY),
            toPoint(maxX, maxY),
            toPoint(minX, maxY),
          ];
          return { points, closed: true };
        }
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
      case 'polygon': {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const rx = Math.max(8, width / 2);
        const ry = Math.max(8, height / 2);
        const sides = Math.max(3, Math.min(20, polygonSidesRef.current || 5));
        const points: Point[] = [];
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2; // Start from top
          points.push(toPoint(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)));
        }
        return { points, closed: true };
      }
      case 'star': {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const rx = Math.max(8, width / 2);
        const ry = Math.max(8, height / 2);
        const points = starPointsRef.current || 5;
        const numPoints = Math.max(3, Math.min(20, points));
        const outerRadius = Math.min(rx, ry);
        const innerRadius = outerRadius * 0.5; // Inner radius is 50% of outer
        const starPoints: Point[] = [];
        for (let i = 0; i < numPoints * 2; i++) {
          const angle = (i / (numPoints * 2)) * Math.PI * 2 - Math.PI / 2; // Start from top
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          starPoints.push(toPoint(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)));
        }
        return { points: starPoints, closed: true };
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
      const rawEnd = pts[pts.length - 1] || start;
      const end = snapEndForShape(mode as ShapeKind, start, rawEnd);
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
      if (shapeFillRef.current && sample.closed) {
        ctxO.save();
        ctxO.globalAlpha = 0.14;
        ctxO.fillStyle = colorRef.current;
        ctxO.beginPath();
        ctxO.moveTo(shapePoints[0].x, shapePoints[0].y);
        for (let i = 1; i < shapePoints.length; i++) ctxO.lineTo(shapePoints[i].x, shapePoints[i].y);
        ctxO.closePath();
        ctxO.fill();
        ctxO.restore();
      }
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
    if (mode === 'eraser' && eraserModeRef.current === 'stroke') {
      ctxO.setTransform(dpr,0,0,dpr,0,0);
      renderSelectionOverlay();
      renderBrushCursor();
      return;
    }
    ctxO.lineJoin = 'round'; ctxO.lineCap = 'round';
    ctxO.globalCompositeOperation = mode==='eraser' ? 'destination-out':'source-over';
    ctxO.globalAlpha = mode==='eraser' ? 1 : (mode==='highlighter'?0.35:mode==='marker'?0.85:0.95);
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
    ensureLayerIntegrity();
    if (isLayerLocked(activeLayerIdRef.current)) {
      return;
    }
    const mode = brushRef.current as BrushKind;
    const pts = pointsRef.current;
    if (pts.length === 0) return;

    if (isShapeBrush(mode)) {
      const start = pts[0];
      const hasDrag = pts.length > 1;
      const fallbackWidth = Math.max(32, sizeRef.current * 4);
      const fallbackHeight = Math.max(32, sizeRef.current * 4);
      const rawEnd = hasDrag ? pts[pts.length - 1] : { x: start.x + fallbackWidth, y: start.y + fallbackHeight, p: 1 };
      const end = snapEndForShape(mode as ShapeKind, start, rawEnd);
      const sample = shapeSample(mode as ShapeKind, start, end, fallbackWidth, fallbackHeight);
      if (sample.points.length) {
        const stroke: Stroke = {
          id: createHistoryId(),
          mode: 'shape',
          shape: mode as ShapeKind,
          color: colorRef.current,
          fill: !!shapeFillRef.current && !!sample.closed,
          size: sizeRef.current,
          points: sample.points,
          closed: sample.closed,
          layerId: activeLayerIdRef.current,
        };
        // Add shape-specific parameters
        if (mode === 'rect' && cornerRadiusRef.current > 0) {
          stroke.cornerRadius = cornerRadiusRef.current;
        }
        if (mode === 'polygon') {
          stroke.sides = polygonSidesRef.current;
        }
        if (mode === 'star') {
          stroke.starPoints = starPointsRef.current;
        }
        strokesRef.current.push(stroke);
      }
    } else {
      // Stroke erase mode: remove the nearest stroke under cursor (tap/drag)
      if (mode === 'eraser' && eraserModeRef.current === 'stroke') {
        const endPt = pts[pts.length - 1] || pts[0];
        const hit = findStrokeAtWorldPoint(endPt.x, endPt.y);
        if (hit) {
          strokesRef.current = strokesRef.current.filter((s) => s.id !== hit.id);
        }
        return;
      }
      if (pts.length < 2) return;
      strokesRef.current.push({ id: createHistoryId(), mode: mode as FreeMode, color: colorRef.current, size: sizeRef.current, points: [...pts], layerId: activeLayerIdRef.current });
    }

    const ctxO = ctxOverlayRef.current!;
    ctxO.setTransform(1, 0, 0, 1, 0, 0);
    ctxO.clearRect(0, 0, ctxO.canvas.width, ctxO.canvas.height);
    renderAll();
  }

  function resize() {
    const dpr = dprRef.current;
    const host = hostRef.current as HTMLElement;
    // Prefer clientWidth/clientHeight (CSS pixels) so bitmap sizing matches layout exactly.
    const rect = host.getBoundingClientRect();
    const cssW = Math.max(1, Math.round((host as HTMLElement).clientWidth || rect.width));
    const cssH = Math.max(1, Math.round((host as HTMLElement).clientHeight || rect.height));
    const canvases = [bgRef.current!, gridRef.current!, drawRef.current!, overlayRef.current!];
    canvases.forEach(c => {
      c.width = Math.floor(cssW * dpr);
      c.height = Math.floor(cssH * dpr);
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
    // reset vector strokes, text fields, images and history so old content doesn't reappear
    strokesRef.current = [];
    textFieldsRef.current = [];
    imagesRef.current.clear();
    selectedImageIdRef.current = null;
    imageSelectedRef.current = false;
    imageManipulationRef.current = null;
    editingTextFieldRef.current = null;
    selectedTextFieldIdsRef.current.clear();
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
      // Draw all images with their saved placement, rotation, and opacity
      for (const canvasImage of imagesRef.current.values()) {
        const { dx, dy, dw, dh, rotation = 0, opacity = 1, crop } = canvasImage.placement;
        ctxBg.save();
        ctxBg.globalAlpha = opacity;
        
        if (rotation !== 0) {
          // Rotate around the center of the image
          const centerX = dx + dw / 2;
          const centerY = dy + dh / 2;
          ctxBg.translate(centerX, centerY);
          ctxBg.rotate((rotation * Math.PI) / 180);
          ctxBg.translate(-centerX, -centerY);
        }
        
        if (crop) {
          // Draw cropped portion
          const scaleX = canvasImage.image.width / dw;
          const scaleY = canvasImage.image.height / dh;
          const sx = (crop.x - dx) * scaleX;
          const sy = (crop.y - dy) * scaleY;
          const sw = crop.w * scaleX;
          const sh = crop.h * scaleY;
          ctxBg.drawImage(canvasImage.image, sx, sy, sw, sh, crop.x, crop.y, crop.w, crop.h);
        } else {
          ctxBg.drawImage(canvasImage.image, dx, dy, dw, dh);
        }
        
        ctxBg.restore();
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

  function exportPng(options?: ExportOptions) {
    try {
      const host = hostRef.current as HTMLElement;
      const rect = host.getBoundingClientRect();
      const dpi = options?.dpi || 96;
      const scale = dpi / 96;
      const tmp = document.createElement('canvas');
      tmp.width = Math.floor(rect.width * scale);
      tmp.height = Math.floor(rect.height * scale);
      const ctx = tmp.getContext('2d')!;
      
      // Set up scaling
      ctx.scale(scale, scale);
      
      // Draw background (or transparent)
      if (!options?.transparent) {
        ctx.drawImage(bgRef.current!, 0, 0, rect.width, rect.height);
      } else {
        ctx.clearRect(0, 0, rect.width, rect.height);
      }
      
      // re-render strokes and text fields into tmp so export always matches current zoom
      const z = zoomRef.current || 1; const pan = panRef.current;
      ctx.setTransform(z * scale, 0, 0, z * scale, pan.x * scale, pan.y * scale);
      ensureLayerIntegrity();
      for (const layer of layersRef.current) {
        if (!layer.visible) continue;
        drawStrokes(ctx, z, layer.id);
        drawTextFields(ctx, z, layer.id);
      }
      return tmp.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  function exportPngSelection(options?: ExportOptions) {
    try {
      ensureLayerIntegrity();
      const host = hostRef.current as HTMLElement;
      const rect = host.getBoundingClientRect();
      const z = zoomRef.current || 1;
      const pan = panRef.current;
      const dpi = options?.dpi || 96;
      const scale = dpi / 96;

      // Determine selection bounds in world coords
      let worldBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
      const items = getAllSelectedBounds();
      if (items.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const item of items) {
          if (item.bounds.minX < minX) minX = item.bounds.minX;
          if (item.bounds.minY < minY) minY = item.bounds.minY;
          if (item.bounds.maxX > maxX) maxX = item.bounds.maxX;
          if (item.bounds.maxY > maxY) maxY = item.bounds.maxY;
        }
        if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
          worldBounds = { minX, minY, maxX, maxY };
        }
      }
      if (!worldBounds) return null;

      // Convert to screen coords for cropping bg
      const padPx = 18;
      const x0 = worldBounds.minX * z + pan.x - padPx;
      const y0 = worldBounds.minY * z + pan.y - padPx;
      const x1 = worldBounds.maxX * z + pan.x + padPx;
      const y1 = worldBounds.maxY * z + pan.y + padPx;
      const cropX = Math.max(0, Math.floor(Math.min(x0, x1)));
      const cropY = Math.max(0, Math.floor(Math.min(y0, y1)));
      const cropW = Math.max(1, Math.floor(Math.min(rect.width, Math.max(x0, x1)) - cropX));
      const cropH = Math.max(1, Math.floor(Math.min(rect.height, Math.max(y0, y1)) - cropY));

      const tmp = document.createElement('canvas');
      tmp.width = Math.floor(cropW * scale);
      tmp.height = Math.floor(cropH * scale);
      const ctx = tmp.getContext('2d')!;
      ctx.scale(scale, scale);

      // Background crop (or transparent)
      if (!options?.transparent) {
        ctx.drawImage(bgRef.current!, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      } else {
        ctx.clearRect(0, 0, cropW, cropH);
      }

      // Render strokes/text with same world->screen mapping, offset by crop
      ctx.setTransform(z * scale, 0, 0, z * scale, (pan.x - cropX) * scale, (pan.y - cropY) * scale);
      for (const layer of layersRef.current) {
        if (!layer.visible) continue;
        drawStrokes(ctx, z, layer.id);
        drawTextFields(ctx, z, layer.id);
      }
      return tmp.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  function exportSvg(options?: ExportOptions) {
    try {
      const host = hostRef.current as HTMLElement;
      const rect = host.getBoundingClientRect();
      const z = zoomRef.current || 1;
      const pan = panRef.current;
      
      // Calculate bounds of all visible content
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let hasContent = false;
      
      ensureLayerIntegrity();
      for (const layer of layersRef.current) {
        if (!layer.visible) continue;
        for (const stroke of strokesRef.current) {
          if ((stroke.layerId || layersRef.current[0]?.id || 'layer-1') !== layer.id) continue;
          for (const pt of stroke.points) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
            hasContent = true;
          }
        }
        for (const field of textFieldsRef.current) {
          if ((field.layerId || layersRef.current[0]?.id || 'layer-1') !== layer.id) continue;
          minX = Math.min(minX, field.x);
          minY = Math.min(minY, field.y);
          maxX = Math.max(maxX, field.x + field.width);
          maxY = Math.max(maxY, field.y + field.height);
          hasContent = true;
        }
      }
      
      // If no content, use canvas dimensions
      if (!hasContent) {
        minX = 0;
        minY = 0;
        maxX = rect.width;
        maxY = rect.height;
      }
      
      const padding = 20;
      const width = maxX - minX + padding * 2;
      const height = maxY - minY + padding * 2;
      
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX - padding} ${minY - padding} ${width} ${height}">`;
      
      // Background (if not transparent)
      if (!options?.transparent) {
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas') || '#111111';
        svg += `<rect x="${minX - padding}" y="${minY - padding}" width="${width}" height="${height}" fill="${bg}"/>`;
      }
      
      // Background images (if any)
      for (const canvasImage of imagesRef.current.values()) {
        const { dx, dy, dw, dh } = canvasImage.placement;
        const imgData = canvasImage.image.src || '';
        svg += `<image href="${imgData}" x="${dx}" y="${dy}" width="${dw}" height="${dh}"/>`;
      }
      
      // Draw strokes
      for (const layer of layersRef.current) {
        if (!layer.visible) continue;
        for (const stroke of strokesRef.current) {
          if ((stroke.layerId || layersRef.current[0]?.id || 'layer-1') !== layer.id) continue;
          if (stroke.mode === 'shape' && stroke.shape) {
            svg += shapeToSvg(stroke);
          } else if (stroke.mode !== 'eraser') {
            svg += strokeToSvg(stroke);
          }
        }
      }
      
      // Draw text fields
      for (const layer of layersRef.current) {
        if (!layer.visible) continue;
        for (const field of textFieldsRef.current) {
          if ((field.layerId || layersRef.current[0]?.id || 'layer-1') !== layer.id) continue;
          svg += textFieldToSvg(field);
        }
      }
      
      svg += '</svg>';
      return svg;
    } catch {
      return null;
    }
  }
  
  function strokeToSvg(stroke: Stroke): string {
    if (stroke.points.length < 2) return '';
    const pts = stroke.points;
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    const opacity = stroke.mode === 'highlighter' ? 0.35 : stroke.mode === 'marker' ? 0.85 : 0.95;
    return `<path d="${path}" stroke="${stroke.color}" stroke-width="${stroke.size}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
  }
  
  function shapeToSvg(stroke: Stroke): string {
    if (!stroke.shape || !stroke.points.length) return '';
    const pts = stroke.points;
    const color = stroke.color;
    const width = stroke.size;
    const fill = stroke.closed && stroke.fill ? color : 'none';
    const fillOpacity = stroke.closed && stroke.fill ? 0.14 : 0;
    
    switch (stroke.shape) {
      case 'line':
        if (pts.length < 2) return '';
        return `<line x1="${pts[0].x}" y1="${pts[0].y}" x2="${pts[pts.length - 1].x}" y2="${pts[pts.length - 1].y}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
      case 'rect':
        if (pts.length < 2) return '';
        const x1 = Math.min(pts[0].x, pts[pts.length - 1].x);
        const y1 = Math.min(pts[0].y, pts[pts.length - 1].y);
        const x2 = Math.max(pts[0].x, pts[pts.length - 1].x);
        const y2 = Math.max(pts[0].y, pts[pts.length - 1].y);
        return `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" stroke="${color}" stroke-width="${width}" fill="${fill}" fill-opacity="${fillOpacity}"/>`;
      case 'ellipse': {
        if (pts.length < 2) return '';
        const cx = (pts[0].x + pts[pts.length - 1].x) / 2;
        const cy = (pts[0].y + pts[pts.length - 1].y) / 2;
        const rx = Math.abs(pts[pts.length - 1].x - pts[0].x) / 2;
        const ry = Math.abs(pts[pts.length - 1].y - pts[0].y) / 2;
        return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${color}" stroke-width="${width}" fill="${fill}" fill-opacity="${fillOpacity}"/>`;
      }
      case 'triangle':
        if (pts.length < 3) return '';
        const p1 = pts[0];
        const p2 = pts[Math.floor(pts.length / 2)];
        const p3 = pts[pts.length - 1];
        return `<polygon points="${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}" stroke="${color}" stroke-width="${width}" fill="${fill}" fill-opacity="${fillOpacity}"/>`;
      case 'diamond': {
        if (pts.length < 2) return '';
        const cx = (pts[0].x + pts[pts.length - 1].x) / 2;
        const cy = (pts[0].y + pts[pts.length - 1].y) / 2;
        const dx = Math.abs(pts[pts.length - 1].x - pts[0].x) / 2;
        const dy = Math.abs(pts[pts.length - 1].y - pts[0].y) / 2;
        return `<polygon points="${cx},${cy - dy} ${cx + dx},${cy} ${cx},${cy + dy} ${cx - dx},${cy}" stroke="${color}" stroke-width="${width}" fill="${fill}" fill-opacity="${fillOpacity}"/>`;
      }
      case 'hexagon':
        if (pts.length < 2) return '';
        const hcx = (pts[0].x + pts[pts.length - 1].x) / 2;
        const hcy = (pts[0].y + pts[pts.length - 1].y) / 2;
        const hr = Math.max(Math.abs(pts[pts.length - 1].x - pts[0].x), Math.abs(pts[pts.length - 1].y - pts[0].y)) / 2;
        const hexPoints: string[] = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          hexPoints.push(`${hcx + hr * Math.cos(angle)},${hcy + hr * Math.sin(angle)}`);
        }
        return `<polygon points="${hexPoints.join(' ')}" stroke="${color}" stroke-width="${width}" fill="${fill}" fill-opacity="${fillOpacity}"/>`;
      case 'arrow':
      case 'double-arrow':
        if (pts.length < 2) return '';
        const ax1 = pts[0].x;
        const ay1 = pts[0].y;
        const ax2 = pts[pts.length - 1].x;
        const ay2 = pts[pts.length - 1].y;
        const angle = Math.atan2(ay2 - ay1, ax2 - ax1);
        const arrowLength = width * 3;
        const arrowAngle = Math.PI / 6;
        const arrow1x = ax2 - arrowLength * Math.cos(angle - arrowAngle);
        const arrow1y = ay2 - arrowLength * Math.sin(angle - arrowAngle);
        const arrow2x = ax2 - arrowLength * Math.cos(angle + arrowAngle);
        const arrow2y = ay2 - arrowLength * Math.sin(angle + arrowAngle);
        let arrowSvg = `<line x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
        arrowSvg += `<polygon points="${ax2},${ay2} ${arrow1x},${arrow1y} ${arrow2x},${arrow2y}" fill="${color}"/>`;
        if (stroke.shape === 'double-arrow') {
          const arrow3x = ax1 + arrowLength * Math.cos(angle - arrowAngle);
          const arrow3y = ay1 + arrowLength * Math.sin(angle - arrowAngle);
          const arrow4x = ax1 + arrowLength * Math.cos(angle + arrowAngle);
          const arrow4y = ay1 + arrowLength * Math.sin(angle + arrowAngle);
          arrowSvg += `<polygon points="${ax1},${ay1} ${arrow3x},${arrow3y} ${arrow4x},${arrow4y}" fill="${color}"/>`;
        }
        return arrowSvg;
      default:
        // Generic polygon for other shapes
        if (pts.length < 2) return '';
        const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');
        return `<polyline points="${polyPoints}" stroke="${color}" stroke-width="${width}" fill="${fill}" fill-opacity="${fillOpacity}" ${stroke.closed ? 'stroke-linejoin="round"' : ''}/>`;
    }
  }
  
  function textFieldToSvg(field: TextField): string {
    const lines = getWrappedTextLinesForSvg(field);
    if (!lines.length) return '';
    const lineHeight = field.fontSize * 1.2;
    let svg = `<g>`;
    lines.forEach((line, idx) => {
      svg += `<text x="${field.x + 2}" y="${field.y + 2 + idx * lineHeight}" font-family="sans-serif" font-size="${field.fontSize}" fill="${field.color}">${escapeXml(line)}</text>`;
    });
    svg += `</g>`;
    return svg;
  }
  
  function escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  function getWrappedTextLinesForSvg(field: TextField): string[] {
    // Simple word wrapping implementation for SVG export
    const words = field.text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    const maxWidth = field.width - 4;
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      // Approximate text width (rough estimate)
      const testWidth = testLine.length * field.fontSize * 0.6;
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }
  
  function exportPdf(options?: ExportOptions) {
    try {
      // Dynamic import to avoid bundling jsPDF if not needed
      return import('jspdf').then((jsPDF) => {
        const host = hostRef.current as HTMLElement;
        const rect = host.getBoundingClientRect();
        const dpi = options?.dpi || 96;
        const scale = dpi / 96;
        
        // Get PNG data
        const pngData = exportPng({ ...options, dpi });
        if (!pngData) return null;
        
        // Create PDF
        const pdf = new jsPDF.default({
          orientation: rect.width > rect.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [rect.width * scale, rect.height * scale]
        });
        
        // Add image to PDF
        pdf.addImage(pngData, 'PNG', 0, 0, rect.width * scale, rect.height * scale);
        
        return pdf.output('blob');
      }).catch(() => null);
    } catch {
      return Promise.resolve(null);
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

  function loadImage(dataUrl: string): string | null {
    const img = new Image();
    const imageId = createHistoryId();
    img.onload = () => {
      const rect = (hostRef.current as HTMLDivElement).getBoundingClientRect();
      // fit image into background preserving aspect ratio
      const iw = img.width, ih = img.height;
      const scale = Math.min(rect.width / iw, rect.height / ih);
      const dw = Math.max(1, Math.floor(iw * scale));
      const dh = Math.max(1, Math.floor(ih * scale));
      const dx = Math.floor((rect.width - dw) / 2);
      const dy = Math.floor((rect.height - dh) / 2);
      
      imagesRef.current.set(imageId, {
        id: imageId,
        image: img,
        placement: { dx, dy, dw, dh, rotation: 0, opacity: 1 }
      });
      
      selectedImageIdRef.current = imageId;
      imageSelectedRef.current = true;
      refreshBackground();
      pushHistory();
    };
    img.onerror = () => {};
    img.src = dataUrl;
    return imageId;
  }

  function addImage(dataUrl: string): string | null {
    return loadImage(dataUrl);
  }

  function removeImage(imageId: string) {
    imagesRef.current.delete(imageId);
    if (selectedImageIdRef.current === imageId) {
      selectedImageIdRef.current = null;
      imageSelectedRef.current = false;
    }
    refreshBackground();
    pushHistory();
  }

  function getAllImages() {
    return Array.from(imagesRef.current.values()).map(img => ({
      id: img.id,
      opacity: img.placement.opacity,
      rotation: img.placement.rotation
    }));
  }

  function getImageState(imageId?: string) {
    const id = imageId || selectedImageIdRef.current;
    if (!id) {
      return imagesRef.current.size > 0 ? { hasImage: true, opacity: 1, rotation: 0 } : null;
    }
    const img = imagesRef.current.get(id);
    if (!img) return null;
    const placement = img.placement;
    return {
      hasImage: true,
      opacity: placement.opacity ?? 1,
      rotation: placement.rotation ?? 0,
      crop: placement.crop ? {
        x: placement.crop.x,
        y: placement.crop.y,
        width: placement.crop.w,
        height: placement.crop.h
      } : undefined
    };
  }

  function setImageOpacity(opacity: number, imageId?: string) {
    const id = imageId || selectedImageIdRef.current;
    if (!id) return;
    const img = imagesRef.current.get(id);
    if (!img) return;
    img.placement.opacity = Math.max(0, Math.min(1, opacity));
    refreshBackground();
    pushHistory();
  }

  function setImageRotation(rotation: number, imageId?: string) {
    const id = imageId || selectedImageIdRef.current;
    if (!id) return;
    const img = imagesRef.current.get(id);
    if (!img) return;
    img.placement.rotation = rotation % 360;
    refreshBackground();
    pushHistory();
  }

  function setImageSize(width: number, height: number, imageId?: string) {
    const id = imageId || selectedImageIdRef.current;
    if (!id) return;
    const img = imagesRef.current.get(id);
    if (!img) return;
    img.placement.dw = Math.max(1, width);
    img.placement.dh = Math.max(1, height);
    refreshBackground();
    pushHistory();
  }

  function setImagePosition(x: number, y: number, imageId?: string) {
    const id = imageId || selectedImageIdRef.current;
    if (!id) return;
    const img = imagesRef.current.get(id);
    if (!img) return;
    img.placement.dx = x;
    img.placement.dy = y;
    refreshBackground();
    pushHistory();
  }

  function cropImage(x: number, y: number, width: number, height: number, imageId?: string) {
    const id = imageId || selectedImageIdRef.current;
    if (!id) return;
    const canvasImage = imagesRef.current.get(id);
    if (!canvasImage) return;
    const placement = canvasImage.placement;
    const img = canvasImage.image;
    
    // Create a temporary canvas to crop the image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    
    // Calculate source coordinates in the original image
    const scaleX = img.width / placement.dw;
    const scaleY = img.height / placement.dh;
    const sx = (x - placement.dx) * scaleX;
    const sy = (y - placement.dy) * scaleY;
    const sw = width * scaleX;
    const sh = height * scaleY;
    
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
    
    // Create new image from cropped canvas
    const croppedImg = new Image();
    croppedImg.onload = () => {
      canvasImage.image = croppedImg;
      // Update placement to show full cropped image
      const rect = (hostRef.current as HTMLDivElement).getBoundingClientRect();
      const scale = Math.min(rect.width / width, rect.height / height);
      placement.dw = Math.max(1, Math.floor(width * scale));
      placement.dh = Math.max(1, Math.floor(height * scale));
      placement.dx = Math.floor((rect.width - placement.dw) / 2);
      placement.dy = Math.floor((rect.height - placement.dh) / 2);
      placement.crop = undefined; // Clear crop after applying
      refreshBackground();
      pushHistory();
    };
    croppedImg.src = canvas.toDataURL();
  }

  function selectImage(imageId?: string) {
    if (imageId) {
      if (imagesRef.current.has(imageId)) {
        selectedImageIdRef.current = imageId;
        imageSelectedRef.current = true;
        renderSelectionOverlay();
      }
    } else {
      // Select first image if available
      const firstImage = Array.from(imagesRef.current.values())[0];
      if (firstImage) {
        selectedImageIdRef.current = firstImage.id;
        imageSelectedRef.current = true;
        renderSelectionOverlay();
      }
    }
  }

  function isImageSelected() {
    return imageSelectedRef.current && selectedImageIdRef.current !== null && imagesRef.current.has(selectedImageIdRef.current);
  }

  function getSelectedImageId() {
    return selectedImageIdRef.current;
  }

  function applyTransform() {
    // CSS transforms removed; we render with matrix transforms to keep hit layer aligned
    renderAll();
    renderPreview();
    updateCursor();
    updateTextInputPosition();
    syncPointerWorldFromClient();
    drawBrushCursorOnly();
    updateRulers();
  }

  function drawStrokes(ctx: CanvasRenderingContext2D, z: number, layerId: string) {
    for (const s of strokesRef.current) {
      if ((s.layerId || layersRef.current[0]?.id || 'layer-1') !== layerId) continue;
      if (s.mode === 'shape' && s.shape) {
        drawShapeStroke(ctx, s, z);
        continue;
      }
      ctx.globalCompositeOperation = s.mode==='eraser' ? 'destination-out' : 'source-over';
      ctx.globalAlpha = s.mode==='eraser' ? 1 : (s.mode==='highlighter'?0.35:s.mode==='marker'?0.85:0.95);
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
    if (stroke.closed && stroke.fill) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = stroke.color;
      ctx.fill();
      ctx.restore();
    }
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
    ensureLayerIntegrity();
    for (const layer of layersRef.current) {
      if (!layer.visible) continue;
      drawStrokes(ctx, z, layer.id);
      drawTextFields(ctx, z, layer.id);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    renderGrid();
    renderSelectionOverlay();
    renderBrushCursor();
  }

  function drawTextFields(ctx: CanvasRenderingContext2D, z: number, layerId: string) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    
    for (const field of textFieldsRef.current) {
      if ((field.layerId || layersRef.current[0]?.id || 'layer-1') !== layerId) continue;
      const isEditing = editingTextFieldRef.current === field.id;
      const isSelected = selectedTextFieldIdsRef.current.has(field.id);
      const showControls = isEditing || isSelected || brushRef.current === 'text';
      
      if (!isEditing) {
        const lines = getWrappedTextLines(field);
        if (lines.length) {
          const fontFamily = field.fontFamily || 'sans-serif';
          const fontWeight = field.fontWeight || 'normal';
          const fontStyle = field.fontStyle || 'normal';
          const textColor = field.textColor || field.color;
          const textAlign = field.textAlign || 'left';
          
          ctx.fillStyle = textColor;
          ctx.font = `${fontStyle} ${fontWeight} ${field.fontSize}px ${fontFamily}`;
          ctx.textBaseline = 'top';
          ctx.textAlign = textAlign;
          const lineHeight = field.fontSize * 1.2;
          const padding = 2;
          
          lines.forEach((line, idx) => {
            let x = field.x + padding;
            if (textAlign === 'center') {
              x = field.x + field.width / 2;
            } else if (textAlign === 'right') {
              x = field.x + field.width - padding;
            }
            ctx.fillText(line, x, field.y + padding + idx * lineHeight);
          });
          
          // Reset textAlign for other drawing operations
          ctx.textAlign = 'left';
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
    const pan = panRef.current;

    const width = canvas.width;
    const height = canvas.height;

    // Consistent dotted grid (screen-space):
    // - Dot spacing is in CSS pixels, so it does NOT "pop" or change with zoom.
    // - Pan shifts the grid, so it still feels attached to the canvas while moving.
    // Smaller default + tighter bounds for a denser, more usable grid.
    const basePx = Math.max(3, Math.min(18, gridSizeRef.current || 6));
    const stepPx = basePx;
    const majorStepPx = stepPx * 5;
    const rootStyle = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
    const minorColor = rootStyle?.getPropertyValue('--grid-minor')?.trim() || (document.documentElement.classList.contains('dark') ? 'rgba(148,163,184,0.2)' : 'rgba(71,85,105,0.14)');
    const majorColor = rootStyle?.getPropertyValue('--grid-major')?.trim() || (document.documentElement.classList.contains('dark') ? 'rgba(148,163,184,0.45)' : 'rgba(30,41,59,0.32)');
    const majorLineColor = rootStyle?.getPropertyValue('--grid-major-line')?.trim() || 'rgba(148,163,184,0.10)';
    // Note: we intentionally do NOT draw x/y axis lines. Those show up as strong blue crosshairs
    // and users perceive them as "bugs" rather than helpful guides.

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Density cap (viewport-based, stable): if very dense, skip evenly.
    const approxCountX = Math.max(1, Math.floor(width / (stepPx * dpr)));
    const approxCountY = Math.max(1, Math.floor(height / (stepPx * dpr)));
    const approxPoints = approxCountX * approxCountY;
    const MAX_POINTS = 45000;
    const skip = approxPoints > MAX_POINTS ? Math.ceil(Math.sqrt(approxPoints / MAX_POINTS)) : 1;
    const drawStepPx = stepPx * skip;
    const drawMajorStepPx = majorStepPx * skip;

    // Offsets so the grid translates with pan (pan is in CSS px).
    const mod = (n: number, m: number) => ((n % m) + m) % m;
    const ox = mod(pan.x, drawStepPx);
    const oy = mod(pan.y, drawStepPx);

    // Fixed pixel radii (scaled by dpr via current transform).
    const rMinor = 0.8;
    const rMajor = 1.5;

    // Stable, subtle opacity.
    const minorAlpha = 0.65;
    const majorAlpha = 0.9;

    // Draw minor dots
    ctx.save();
    ctx.globalAlpha = minorAlpha;
    ctx.fillStyle = minorColor;
    ctx.beginPath();
    for (let x = ox; x <= (width / dpr) + drawStepPx; x += drawStepPx) {
      for (let y = oy; y <= (height / dpr) + drawStepPx; y += drawStepPx) {
        const isMajor = (Math.round(x / drawMajorStepPx) * drawMajorStepPx === x) || (Math.round(y / drawMajorStepPx) * drawMajorStepPx === y);
        if (isMajor) continue; // majors drawn separately
        ctx.moveTo(x + rMinor, y);
        ctx.arc(x, y, rMinor, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    // Draw major dots (slightly bigger)
    ctx.globalAlpha = majorAlpha;
    ctx.fillStyle = majorColor;
    ctx.beginPath();
    for (let x = mod(pan.x, drawMajorStepPx); x <= (width / dpr) + drawMajorStepPx; x += drawMajorStepPx) {
      for (let y = mod(pan.y, drawMajorStepPx); y <= (height / dpr) + drawMajorStepPx; y += drawMajorStepPx) {
        ctx.moveTo(x + rMajor, y);
        ctx.arc(x, y, rMajor, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    // Optional: very subtle major guide lines to help alignment (no axes).
    // Only draw when not too dense (keeps it clean + fast).
    const approxMajorX = Math.max(1, Math.floor((width / dpr) / drawMajorStepPx));
    const approxMajorY = Math.max(1, Math.floor((height / dpr) / drawMajorStepPx));
    const MAX_GUIDE_LINES = 140;
    if ((approxMajorX + approxMajorY) <= MAX_GUIDE_LINES && drawMajorStepPx >= 18) {
      ctx.globalAlpha = Math.min(0.38, majorAlpha * 0.45);
      ctx.strokeStyle = majorLineColor;
      ctx.lineWidth = 1;
      const dash = 1.2;
      const gap = 6;
      ctx.setLineDash([dash, gap]);
      ctx.beginPath();
      // vertical major lines
      for (let x = mod(pan.x, drawMajorStepPx); x <= (width / dpr) + drawMajorStepPx; x += drawMajorStepPx) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height / dpr);
      }
      // horizontal major lines
      for (let y = mod(pan.y, drawMajorStepPx); y <= (height / dpr) + drawMajorStepPx; y += drawMajorStepPx) {
        ctx.moveTo(0, y);
        ctx.lineTo(width / dpr, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

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
      {/* Rulers */}
      {showRulersRef.current && (
        <>
          <div
            className="canvas-ruler canvas-ruler-horizontal"
            style={{
              position: 'absolute',
              top: 0,
              left: '24px',
              right: 0,
              height: '24px',
              background: 'var(--bg-secondary, #1e293b)',
              borderBottom: '1px solid var(--border, #334155)',
              zIndex: 10,
              pointerEvents: 'none',
              fontSize: '10px',
              color: 'var(--text-secondary, #94a3b8)',
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
            }}
          />
          <div
            className="canvas-ruler canvas-ruler-vertical"
            style={{
              position: 'absolute',
              top: '24px',
              left: 0,
              bottom: 0,
              width: '24px',
              background: 'var(--bg-secondary, #1e293b)',
              borderRight: '1px solid var(--border, #334155)',
              zIndex: 10,
              pointerEvents: 'none',
              fontSize: '10px',
              color: 'var(--text-secondary, #94a3b8)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '24px',
              height: '24px',
              background: 'var(--bg-secondary, #1e293b)',
              borderRight: '1px solid var(--border, #334155)',
              borderBottom: '1px solid var(--border, #334155)',
              zIndex: 11,
            }}
          />
        </>
      )}
      {/* Scale/pan only the drawing layers */}
      <div ref={contentRef} style={{ position:'absolute', ...(showRulersRef.current ? { top: '24px', left: '24px', right: 0, bottom: 0 } : { inset: 0 }) }}>
        <canvas ref={gridRef} className="board" style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }} aria-label="Grid layer" />
        <canvas ref={drawRef} className="board" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} aria-label="Drawing layer" />
        <canvas ref={overlayRef} className="board" style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }} aria-label="Overlay layer" />
      </div>
    </div>
  );
};

export const CanvasBoard = forwardRef(CanvasBoardComponent);

CanvasBoard.displayName = 'CanvasBoard';


