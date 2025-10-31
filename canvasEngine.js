export class DrawingEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.brush = 'brush'; // brush | marker | highlighter | eraser
    this.color = '#FFFFFF';
    this.size = 8;
    this.isDrawing = false;
    this.points = [];
    this.history = [];
    this.future = [];
    this.maxHistory = 50;

    this.devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    this.resize();
    this.clear();

    this._bind();
  }

  _bind() {
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onResize = this._onResize.bind(this);

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('resize', this._onResize);
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('resize', this._onResize);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.devicePixelRatio;
    const width = Math.max(300, Math.floor(rect.width));
    const height = Math.max(300, Math.floor(rect.height));

    const prev = this.snapshot();
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.scale(dpr, dpr);
    this.ctx.imageSmoothingQuality = 'high';
    if (prev) this._drawImageCover(prev);
  }

  _drawImageCover(image) {
    try {
      this.ctx.drawImage(image, 0, 0, this.canvas.width / this.devicePixelRatio, this.canvas.height / this.devicePixelRatio);
    } catch {}
  }

  clear() {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    // Fill with canvas bg to reduce transparency PNG surprises
    this.ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas') || '#111111';
    this.ctx.fillRect(0, 0, rect.width, rect.height);
    this._pushHistory();
  }

  setBrush(name) {
    this.brush = name;
  }

  setColor(color) {
    this.color = color;
  }

  setSize(size) {
    this.size = Math.max(1, size);
  }

  _strokeStyleForBrush(pressure = 1) {
    const ctx = this.ctx;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    let width = this.size;

    switch (this.brush) {
      case 'marker':
        ctx.globalAlpha = 0.85;
        width = this.size * 1.2 * pressure;
        break;
      case 'highlighter':
        ctx.globalAlpha = 0.35;
        ctx.globalCompositeOperation = 'multiply';
        width = this.size * 1.6 * pressure;
        break;
      case 'eraser':
        ctx.globalCompositeOperation = 'destination-out';
        width = this.size * 1.4 * pressure;
        break;
      case 'brush':
      default:
        ctx.globalAlpha = 0.95;
        width = this.size * pressure;
        break;
    }
    ctx.lineWidth = Math.max(1, width);
    ctx.strokeStyle = this.brush === 'eraser' ? 'rgba(0,0,0,1)' : this.color;
  }

  _onPointerDown(e) {
    if (e.button !== 0) return;
    this.isDrawing = true;
    this.points = [];
    this._addPoint(e);
    this.future = [];
  }

  _onPointerMove(e) {
    if (!this.isDrawing) return;
    this._addPoint(e);
    this._drawSmoothStroke();
  }

  _onPointerUp() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this._commitStroke();
  }

  _onResize() {
    this.resize();
  }

  _addPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const p = typeof e.pressure === 'number' && e.pressure > 0 ? e.pressure : 1;
    this.points.push({ x, y, p });
  }

  _drawSmoothStroke() {
    if (this.points.length < 2) return;
    const ctx = this.ctx;
    const pts = this.points;
    this._strokeStyleForBrush(pts[pts.length - 1].p);

    ctx.beginPath();
    // Simple Catmull-Rom to Bezier approximation for smoothing
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
  }

  _commitStroke() {
    this._pushHistory();
    this.points = [];
  }

  _pushHistory() {
    try {
      const snapshot = this.canvas.toDataURL('image/png');
      this.history.push(snapshot);
      if (this.history.length > this.maxHistory) this.history.shift();
    } catch {}
  }

  undo() {
    if (this.history.length <= 1) return; // keep at least initial state
    const last = this.history.pop();
    this.future.push(last);
    const prev = this.history[this.history.length - 1];
    this._restoreFromDataUrl(prev);
  }

  redo() {
    if (this.future.length === 0) return;
    const next = this.future.pop();
    this.history.push(next);
    this._restoreFromDataUrl(next);
  }

  _restoreFromDataUrl(dataUrl) {
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      // re-fill background before drawing
      const rect = this.canvas.getBoundingClientRect();
      this.ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas') || '#111111';
      this.ctx.fillRect(0, 0, rect.width, rect.height);
      this.ctx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = dataUrl;
  }

  snapshot() {
    try {
      const img = new Image();
      img.src = this.canvas.toDataURL('image/png');
      return img;
    } catch {
      return null;
    }
  }

  exportPng() {
    try {
      return this.canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }
}


