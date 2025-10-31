import React, { useMemo, useRef, useState } from 'react';
import { CanvasBoard, CanvasBoardRef } from './components/CanvasBoard';
import { analyze } from './ai/api';
import { Undo2, Redo2, Upload, Eraser, Highlighter, PenLine, Download as DownloadIcon, Save, Image as ImageIcon, WandSparkles, Trash2, ZoomIn, ZoomOut, Maximize, Plus, Minus, Sun, Moon, Send } from 'lucide-react';
import { ColorPicker } from './components/ColorPicker';
import { SizeControl } from './components/SizeControl';

type Provider = 'openai' | 'gemini';

export default function App() {
  const boardRef = useRef<CanvasBoardRef>(null);

  const [brush, setBrush] = useState<'brush' | 'marker' | 'highlighter' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'text'>('brush');
  const [size, setSize] = useState(8);
  const [color, setColor] = useState('#FFFFFF');
  const [aiText, setAiText] = useState('Draw something and press "Ask AI".');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiBorderActive, setAiBorderActive] = useState(false);
  const borderTimer = React.useRef<number | null>(null);
  const [promptText, setPromptText] = useState('');
  const [askClicked, setAskClicked] = useState(false);
  const [provider, setProvider] = useState<Provider>('openai');
  const [showAbout, setShowAbout] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const howWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [showLimit, setShowLimit] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    try { window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } })); } catch {}
  }, [theme]);

  const colors = useMemo(
    () => ['#FFFFFF', '#000000', '#00F0C8', '#00C2A8', '#FF6B6B', '#FFD166', '#06D6A0', '#118AB2', '#9B5DE5', '#F15BB5', '#FEE440', '#00BBF9'],
    []
  );

  async function onAnalyze() {
    // client-side soft quota: 10 requests / 24h per browser
    try {
      const raw = localStorage.getItem('ASK_META');
      const meta = raw ? JSON.parse(raw) : { count: 0, resetAt: Date.now() + 24*60*60*1000 };
      if (Date.now() > (meta.resetAt || 0)) { meta.count = 0; meta.resetAt = Date.now() + 24*60*60*1000; }
      if (meta.count >= 10) { setShowLimit(true); return; }
      localStorage.setItem('ASK_META', JSON.stringify({ ...meta, count: meta.count + 1 }));
    } catch {}
    const dataUrl = boardRef.current?.exportPng();
    if (!dataUrl) return;
    setIsAnalyzing(true);
    setAskClicked(true);
    window.setTimeout(() => setAskClicked(false), 600);
    setAiBorderActive(true);
    if (borderTimer.current) { window.clearTimeout(borderTimer.current); borderTimer.current = null; }
    setAiText('Analyzing...');
    const res = await analyze({ image: dataUrl, provider, prompt: promptText || undefined });
    if (!res.ok) {
      setAiText(res.error || 'Failed to analyze.');
      setIsAnalyzing(false);
      borderTimer.current = window.setTimeout(() => { setAiBorderActive(false); borderTimer.current = null; }, 3000);
      if ((res.error || '').includes('429')) setShowLimit(true);
      return;
    }
    setAiText(res.message || 'Done.');
    setIsAnalyzing(false);
    borderTimer.current = window.setTimeout(() => { setAiBorderActive(false); borderTimer.current = null; }, 3000);
  }

  function onDownload() {
    const dataUrl = boardRef.current?.exportPng();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `canvas-${Date.now()}.png`;
    a.click();
  }

  function onPickImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') boardRef.current?.loadImage(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div id="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-mark"><img src="/src/assets/Logo.png" alt="Cognito logo" /></div>
          </div>
          <div className="header-actions">
          <div className="btn-popover" ref={howWrapRef}>
            <button className={`btn liquid`} onClick={() => setShowHow(v=>!v)}>How to use</button>
            {showHow && null}
          </div>
          <select className="btn" value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
          <button className="btn liquid" title="Toggle theme" onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span style={{ fontSize: 12 }}>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <a className="btn feedback" href="https://forms.gle/gzvFHB3RdxW71o9t6" target="_blank" rel="noopener noreferrer">Feedback</a>
          {/* Ask AI moved to canvas overlay */}
          </div>
        </div>
      </header>

      <main className="app-main">
        <aside className="tools">
          <div className="tool-group">
            <label className="tool-label">Tools</label>
            <div className="icon-row">
              <button className="icon-btn" title="Undo" data-tooltip="Undo" onClick={() => boardRef.current?.undo()}><Undo2 size={16} /></button>
              <button className="icon-btn" title="Redo" data-tooltip="Redo" onClick={() => boardRef.current?.redo()}><Redo2 size={16} /></button>
              <button className="icon-btn" title="Save" data-tooltip="Save" onClick={() => boardRef.current?.saveBoard?.()}><Save size={16} /></button>
              <button className="icon-btn" title="Download" data-tooltip="Download" onClick={onDownload}><DownloadIcon size={16} /></button>
              <label className="icon-btn" title="Add Image" data-tooltip="Add Image">
                <ImageIcon size={16} />
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onPickImage(e.target.files)} />
              </label>
              <button className="icon-btn" title="Clear Canvas" data-tooltip="Clear Canvas" onClick={() => boardRef.current?.clear()}><Trash2 size={16} /></button>
            </div>
          </div>
          <div className="tool-group">
            <label className="tool-label">Brush</label>
            <div className="segmented">
              {(['brush','marker','highlighter','eraser','line','rect','ellipse'] as const).map(b => (
                <button
                  key={b}
                  className={`segmented-item ${brush===b?'active':''}`}
                  onClick={() => setBrush(b)}
                  title={b.charAt(0).toUpperCase()+b.slice(1)}
                  data-tooltip={b.charAt(0).toUpperCase()+b.slice(1)}
                >
                  {b==='brush' && <PenLine size={16} />}
                  {b==='marker' && <WandSparkles size={16} />}
                  {b==='highlighter' && <Highlighter size={16} />}
                  {b==='eraser' && <Eraser size={16} />}
                  {b==='line' && <span style={{fontSize:16}}>／</span>}
                  {b==='rect' && <span style={{fontSize:16}}>▭</span>}
                  {b==='ellipse' && <span style={{fontSize:16}}>◯</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="tool-group">
            <label className="tool-label">Color</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <ColorPicker value={color} onChange={setColor} swatches={colors} />
            </div>
          </div>
          <div className="tool-group">
            <label className="tool-label">Size <span id="size-value">{size}</span>px</label>
            <SizeControl value={size} onChange={(n) => setSize(n)} min={1} max={64} />
          </div>
          
        </aside>

        <section className="canvas-wrap">
          <CanvasBoard ref={boardRef} brush={brush} color={color} size={size} />
          <div className="canvas-overlay">
            <div className="overlay-row">
              <button className="icon-btn" onClick={() => boardRef.current?.setZoom(-0.1)}><ZoomOut size={16} /></button>
              <button className="icon-btn" onClick={() => boardRef.current?.resetView()}><Maximize size={16} /></button>
              <button className="icon-btn" onClick={() => boardRef.current?.setZoom(0.1)}><ZoomIn size={16} /></button>
            </div>
          </div>
          <div className="canvas-ask">
            <input
              className="ask-input"
              placeholder="Ask AI (optional prompt)"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
            />
            <button className={`btn accent ask-btn ${isAnalyzing ? 'beam' : ''} ${askClicked ? 'clicked' : ''}`} title="Ask AI" data-tooltip="Ask AI" onClick={onAnalyze} aria-label="Ask AI">
              <Send size={16} />
              <span>Ask AI</span>
            </button>
          </div>
        </section>

        <aside className="side-panel">
          <div className={`card ${aiBorderActive ? 'beam' : ''}`} id="ai-card">
            <div className="card-header">
              <h2>AI Response</h2>
              <button className="icon-btn" data-tooltip="Copy" title="Copy" onClick={() => navigator.clipboard.writeText(aiText)}>⧉</button>
            </div>
            <div className={`ai-output ${isAnalyzing ? 'loading' : ''}`}>{aiText}</div>
          </div>
        </aside>
      </main>

      <div className="bottom-decor" aria-hidden="true"></div>

      <footer className="app-footer">
        <div className="footer-inner">
          <span>Made with ♥ · Cognito</span>
          <div className="footer-links">
            <a href="#" id="link-about" onClick={(e) => { e.preventDefault(); setShowAbout(true); }}>About</a>
            <a href="https://forms.gle/gzvFHB3RdxW71o9t6" target="_blank" rel="noopener noreferrer" id="link-feedback">Feedback</a>
          </div>
        </div>
      </footer>

      {showAbout && (
        <div className="about-modal" role="dialog" aria-modal="true" aria-label="About Cognito">
          <div className="about-header">
            <strong>About Cognito</strong>
            <button className="icon-btn" onClick={() => setShowAbout(false)} aria-label="Close">✕</button>
          </div>
          <div className="about-body">
            <p>Cognito lets you sketch, annotate, and send your canvas to AI for descriptions or math solutions. Use the left panel to pick a tool and color, drop an image onto the canvas, then press Ask AI at the bottom.</p>
            <ul>
              <li>Brush, marker, highlighter, eraser, and basic shapes</li>
              <li>Undo/redo, save boards locally, download PNG</li>
              <li>Zoom controls top-right; theme toggle in header</li>
            </ul>
          </div>
        </div>
      )}

      {showHow && (
        <div className="how-overlay" onClick={(e)=>{
          // Close when clicking outside popover on desktop; stay for mobile fullscreen overlay
          const target = e.target as HTMLElement;
          if (target.classList.contains('how-overlay')) setShowHow(false);
        }} />
      )}

      {showHow && (
        <div className="about-modal" role="dialog" aria-modal="true" aria-label="How to use">
          <div className="about-header">
            <strong>How to use</strong>
            <button className="icon-btn" onClick={() => setShowHow(false)} aria-label="Close">✕</button>
          </div>
          <div className="about-body">
            <ol>
              <li>Pick a tool and color from the left panel. Adjust size with the slider.</li>
              <li>Draw on the canvas or drag‑drop an image to annotate it.</li>
              <li>Use zoom controls on the canvas (top‑right). Reset anytime.</li>
              <li>Optionally type a prompt, then press "Ask AI" (bottom center).</li>
              <li>Save boards locally or download a PNG when you’re done.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}


