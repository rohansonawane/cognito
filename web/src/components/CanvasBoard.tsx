import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export type CanvasBoardRef = {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportPng: () => string | null;
  saveBoard?: () => void;
  loadImage: (dataUrl: string) => void;
  setZoom: (delta: number) => void;
  resetView: () => void;
};

type BrushKind = 'brush' | 'marker' | 'highlighter' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'text';

type Props = {
  brush: BrushKind;
  color: string;
  size: number;
};

type Point = { x: number; y: number; p: number };

export const CanvasBoard = forwardRef<CanvasBoardRef, Props>(function CanvasBoard({ brush, color, size }, ref) {
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const ctxBgRef = useRef<CanvasRenderingContext2D | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const ctxOverlayRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawingRef = useRef(false);
  const pointsRef = useRef<Point[]>([]);
  const historyRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const dprRef = useRef<number>(Math.max(1, window.devicePixelRatio || 1));
  const brushRef = useRef(brush);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  const zoomRef = useRef<number>(1);
  const panRef = useRef<{x:number;y:number}>({x:0,y:0});
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{x:number;y:number}>({x:0,y:0});
  const hostRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({
    undo: () => undo(),
    redo: () => redo(),
    clear: () => clear(),
    exportPng: () => exportPng(),
    saveBoard: () => saveBoard(),
    loadImage: (d) => loadImage(d),
    setZoom: (delta) => {
      zoomRef.current = Math.min(3, Math.max(0.5, zoomRef.current + delta));
      applyTransform();
    },
    resetView: () => { zoomRef.current = 1; panRef.current = {x:0,y:0}; applyTransform(); }
  }));

  useEffect(() => {
    const bg = bgRef.current!;
    const draw = drawRef.current!;
    const overlay = overlayRef.current!;
    ctxBgRef.current = bg.getContext('2d')!;
    ctxRef.current = draw.getContext('2d')!;
    ctxOverlayRef.current = overlay.getContext('2d')!;
    resize();
    clear();

    const onDown = (e: PointerEvent) => { if (e.button!==0) return; isDrawingRef.current = true; pointsRef.current = []; addPoint(e); futureRef.current = []; };
    const onMove = (e: PointerEvent) => { if (!isDrawingRef.current) return; addPoint(e); drawSmooth(); };
    const onUp = () => { if (!isDrawingRef.current) return; isDrawingRef.current = false; commitStrokeOrShape(); pushHistory(); pointsRef.current = []; };
    const onResize = () => resize();
    draw.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', onResize);
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
    const onTheme = () => refreshBackground();
    window.addEventListener('themechange', onTheme as any);
    return () => {
      draw.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', onResize);
      draw.removeEventListener('dragover', onDragOver);
      draw.removeEventListener('drop', onDrop);
      window.removeEventListener('themechange', onTheme as any);
    };
  }, []);

  // keep live refs in sync so event handlers see latest values
  useEffect(() => { brushRef.current = brush; }, [brush]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { sizeRef.current = size; }, [size]);

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
    const rect = drawRef.current!.getBoundingClientRect();
    const z = zoomRef.current || 1;
    // map pointer from transformed (CSS scaled) space to canvas logical space
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const x = localX / z;
    const y = localY / z;
    const p = typeof e.pressure === 'number' && e.pressure > 0 ? e.pressure : 1;
    pointsRef.current.push({ x, y, p });
  }

  function drawSmooth() {
    const pts = pointsRef.current;
    if (pts.length < 2) return;
    const mode = brushRef.current;
    if (mode === 'brush' || mode === 'marker' || mode === 'highlighter' || mode === 'eraser') {
      const ctx = ctxRef.current!;
      strokeStyle(pts[pts.length - 1].p);
      ctx.beginPath();
      for (let i = 0; i < pts.length - 1; i++) {
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
    } else {
      // shapes preview on overlay
      const ctxO = ctxOverlayRef.current!;
      ctxO.clearRect(0, 0, ctxO.canvas.width, ctxO.canvas.height);
      const start = pts[0];
      const last = pts[pts.length - 1];
      ctxO.strokeStyle = colorRef.current;
      ctxO.lineWidth = sizeRef.current;
      ctxO.lineJoin = 'round';
      ctxO.lineCap = 'round';
      if (mode === 'line') {
        ctxO.beginPath(); ctxO.moveTo(start.x, start.y); ctxO.lineTo(last.x, last.y); ctxO.stroke();
      } else if (mode === 'rect') {
        const w = last.x - start.x, h = last.y - start.y;
        ctxO.strokeRect(start.x, start.y, w, h);
      } else if (mode === 'ellipse') {
        ctxO.beginPath();
        ctxO.ellipse((start.x+last.x)/2, (start.y+last.y)/2, Math.abs(last.x-start.x)/2, Math.abs(last.y-start.y)/2, 0, 0, Math.PI*2);
        ctxO.stroke();
      }
    }
  }

  function commitStrokeOrShape() {
    const mode = brushRef.current;
    if (mode === 'line' || mode === 'rect' || mode === 'ellipse') {
      const pts = pointsRef.current;
      if (pts.length < 2) return;
      const start = pts[0];
      const last = pts[pts.length - 1];
      const ctx = ctxRef.current!;
      ctx.strokeStyle = colorRef.current;
      ctx.lineWidth = sizeRef.current;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (mode === 'line') {
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(last.x, last.y); ctx.stroke();
      } else if (mode === 'rect') {
        const w = last.x - start.x, h = last.y - start.y;
        ctx.strokeRect(start.x, start.y, w, h);
      } else if (mode === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse((start.x+last.x)/2, (start.y+last.y)/2, Math.abs(last.x-start.x)/2, Math.abs(last.y-start.y)/2, 0, 0, Math.PI*2);
        ctx.stroke();
      }
      const ctxO = ctxOverlayRef.current!;
      ctxO.clearRect(0, 0, ctxO.canvas.width, ctxO.canvas.height);
    }
  }

  function resize() {
    const dpr = dprRef.current;
    const host = (drawRef.current as HTMLCanvasElement).parentElement as HTMLElement;
    const rect = host.getBoundingClientRect();
    const canvases = [bgRef.current!, drawRef.current!, overlayRef.current!];
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
    const rect = draw.getBoundingClientRect();
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
    pushHistory();
  }

  function refreshBackground() {
    try {
      const rect = (drawRef.current as HTMLCanvasElement).getBoundingClientRect();
      const ctxBg = ctxBgRef.current!;
      const old = new Image();
      old.onload = () => {
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas') || '#111111';
        ctxBg.clearRect(0, 0, rect.width, rect.height);
        ctxBg.fillStyle = bg;
        ctxBg.fillRect(0, 0, rect.width, rect.height);
        ctxBg.drawImage(old, 0, 0, rect.width, rect.height);
      };
      old.src = bgRef.current!.toDataURL('image/png');
    } catch {}
  }

  function pushHistory() {
    try {
      const data = exportPng();
      if (data) historyRef.current.push(data);
      if (historyRef.current.length > 50) historyRef.current.shift();
    } catch {}
  }

  function undo() {
    if (historyRef.current.length <= 1) return;
    const last = historyRef.current.pop()!;
    futureRef.current.push(last);
    restore(historyRef.current[historyRef.current.length - 1]);
  }

  function redo() {
    if (!futureRef.current.length) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push(next);
    restore(next);
  }

  function restore(dataUrl: string) {
    const img = new Image();
    img.onload = () => {
      const rect = (drawRef.current as HTMLCanvasElement).getBoundingClientRect();
      const ctxBg = ctxBgRef.current!;
      const ctxDraw = ctxRef.current!;
      ctxBg.clearRect(0, 0, rect.width, rect.height);
      ctxDraw.clearRect(0, 0, rect.width, rect.height);
      ctxBg.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = dataUrl;
  }

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
      const host = (drawRef.current as HTMLCanvasElement).parentElement as HTMLElement;
      const rect = host.getBoundingClientRect();
      const tmp = document.createElement('canvas');
      tmp.width = rect.width; tmp.height = rect.height;
      const ctx = tmp.getContext('2d')!;
      ctx.drawImage(bgRef.current!, 0, 0, rect.width, rect.height);
      ctx.drawImage(drawRef.current!, 0, 0, rect.width, rect.height);
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
      const rect = (drawRef.current as HTMLCanvasElement).getBoundingClientRect();
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
      pushHistory();
    };
    img.src = dataUrl;
  }

  function applyTransform() {
    if (!hostRef.current) return;
    const { x, y } = panRef.current;
    const z = zoomRef.current;
    hostRef.current.style.transformOrigin = '0 0';
    hostRef.current.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  }

  return (
    <div ref={hostRef} className="board-stack" style={{ position:'relative', width:'100%', height:'100%' }}>
      <canvas ref={bgRef} className="board" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} aria-label="Background layer" />
      <canvas ref={drawRef} className="board" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} aria-label="Drawing layer" />
      <canvas ref={overlayRef} className="board" style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }} aria-label="Overlay layer" />
    </div>
  );
});


