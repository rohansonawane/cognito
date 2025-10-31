import { DrawingEngine } from './canvasEngine.js';
import { analyzeImage } from './aiAdapter.js';

// storage.js and boards will be added in the next step
const storage = {
  loadBoards() {
    try {
      return JSON.parse(localStorage.getItem('ai-canvas-boards') || '[]');
    } catch {
      return [];
    }
  },
  saveBoards(boards) {
    localStorage.setItem('ai-canvas-boards', JSON.stringify(boards));
  },
};

const COLORS = [
  '#FFFFFF',
  '#000000',
  '#00F0C8',
  '#00C2A8',
  '#FF6B6B',
  '#FFD166',
  '#06D6A0',
  '#118AB2',
  '#9B5DE5',
  '#F15BB5',
  '#FEE440',
  '#00BBF9',
];

let engine;
let boards = [];

function qs(sel) {
  return document.querySelector(sel);
}

function qsa(sel) {
  return Array.from(document.querySelectorAll(sel));
}

function init() {
  setupCanvas();
  setupTools();
  setupActions();
  setupBoards();
  handleResize();
  window.addEventListener('resize', handleResize);
}

function setupCanvas() {
  const canvas = qs('#board');
  engine = new DrawingEngine(canvas);
}

function setupTools() {
  // Brush mode
  qsa('.segmented-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      qsa('.segmented-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tool = btn.getAttribute('data-tool');
      engine.setBrush(tool);
    });
  });

  // Size
  const sizeRange = qs('#size-range');
  const sizeValue = qs('#size-value');
  sizeRange.addEventListener('input', () => {
    sizeValue.textContent = sizeRange.value;
    engine.setSize(Number(sizeRange.value));
  });

  // Colors
  const row = qs('#color-swatches');
  row.innerHTML = '';
  COLORS.forEach((c) => {
    const sw = document.createElement('button');
    sw.className = 'swatch';
    sw.style.background = c;
    sw.title = c;
    sw.addEventListener('click', () => engine.setColor(c));
    row.appendChild(sw);
  });

  const picker = qs('#color-picker');
  picker.addEventListener('input', () => engine.setColor(picker.value));
}

function setupActions() {
  qs('#btn-undo').addEventListener('click', () => engine.undo());
  qs('#btn-redo').addEventListener('click', () => engine.redo());
  qs('#btn-clear').addEventListener('click', () => engine.clear());

  qs('#btn-analyze').addEventListener('click', onAnalyze);
  qs('#btn-copy-ai').addEventListener('click', onCopyAI);
  qs('#btn-download').addEventListener('click', onDownload);
  qs('#btn-save-board').addEventListener('click', onSaveBoard);
  qs('#btn-new-board').addEventListener('click', onNewBoard);

  // Shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.shiftKey ? engine.redo() : engine.undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      onSaveBoard();
    }
  });
}

function setupBoards() {
  boards = storage.loadBoards();
  renderBoards();
}

function renderBoards() {
  const list = qs('#boards-list');
  list.innerHTML = '';
  if (!boards.length) {
    const empty = document.createElement('div');
    empty.className = 'ai-output';
    empty.textContent = 'No saved boards yet.';
    list.appendChild(empty);
    return;
  }

  boards
    .slice()
    .reverse()
    .forEach((b) => {
      const card = document.createElement('div');
      card.className = 'board-card';

      const img = document.createElement('img');
      img.className = 'board-thumb';
      img.src = b.dataUrl;
      img.alt = b.name || 'Board';

      const meta = document.createElement('div');
      meta.className = 'board-meta';
      const title = document.createElement('div');
      title.className = 'meta-title';
      title.textContent = b.name || 'Untitled';

      const actions = document.createElement('div');
      actions.className = 'meta-actions';
      const btnLoad = document.createElement('button');
      btnLoad.className = 'btn';
      btnLoad.textContent = 'Load';
      btnLoad.addEventListener('click', () => loadBoard(b.id));
      const btnDel = document.createElement('button');
      btnDel.className = 'btn';
      btnDel.textContent = 'Delete';
      btnDel.addEventListener('click', () => deleteBoard(b.id));
      actions.appendChild(btnLoad);
      actions.appendChild(btnDel);

      meta.appendChild(title);
      meta.appendChild(actions);

      card.appendChild(img);
      card.appendChild(meta);
      list.appendChild(card);
    });
}

function onAnalyze() {
  const dataUrl = engine.exportPng();
  const out = qs('#ai-output');
  out.textContent = 'Analyzing...';
  analyzeImage(dataUrl).then((res) => {
    if (!res.ok) {
      out.textContent = res.error || 'Failed to analyze.';
      return;
    }
    const isEquation = res.type === 'equation';
    out.textContent = res.message || (isEquation ? 'Equation solved.' : 'Description generated.');
  });
}

function onCopyAI() {
  const text = qs('#ai-output').textContent || '';
  navigator.clipboard.writeText(text).catch(() => {});
}

function onDownload() {
  const dataUrl = engine.exportPng();
  if (!dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `canvas-${Date.now()}.png`;
  a.click();
}

function onSaveBoard() {
  const dataUrl = engine.exportPng();
  const name = prompt('Board name', `Board ${boards.length + 1}`) || `Board ${boards.length + 1}`;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  boards.push({ id, name, dataUrl, ts: Date.now() });
  storage.saveBoards(boards);
  renderBoards();
}

function onNewBoard() {
  engine.clear();
}

function loadBoard(id) {
  const b = boards.find((x) => x.id === id);
  if (!b) return;
  const img = new Image();
  img.onload = () => {
    const rect = qs('#board').getBoundingClientRect();
    const ctx = qs('#board').getContext('2d');
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.drawImage(img, 0, 0, rect.width, rect.height);
  };
  img.src = b.dataUrl;
}

function deleteBoard(id) {
  boards = boards.filter((x) => x.id !== id);
  storage.saveBoards(boards);
  renderBoards();
}

function handleResize() {
  // Ensure canvas element size matches container
  const canvas = qs('#board');
  const wrap = canvas.parentElement;
  const rect = wrap.getBoundingClientRect();
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${Math.max(300, rect.height)}px`;
  engine.resize();
}

document.addEventListener('DOMContentLoaded', init);


