import React, { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (hex: string) => void;
  swatches?: string[];
  inlineHex?: boolean;
  defaultOpen?: boolean;
  inline?: boolean;
};

export function ColorPicker({ value, onChange, swatches = DEFAULTS, inlineHex = false, defaultOpen = false, inline = false }: Props) {
  const [open, setOpen] = useState(defaultOpen || inline);
  const ref = useRef<HTMLDivElement | null>(null);
  const svRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);

  // Pro picker state (HSV)
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(value)));

  // Keep internal state in sync when value changes externally.
  useEffect(() => {
    try {
      const next = rgbToHsv(hexToRgb(value));
      setHsv(next);
    } catch {
      // ignore invalid external values
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      const target = e.target as Node;
      // Don't close if clicking inside the color picker
      if (ref.current.contains(target)) return;
      setOpen(false);
    };
    
    // Use a small delay to allow button click to process first
    const timeoutId = setTimeout(() => {
    document.addEventListener('mousedown', onDoc);
      document.addEventListener('touchstart', onDoc);
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  const hueCss = useMemo(() => {
    const h = clamp(hsv.h, 0, 360);
    return `hsl(${h} 100% 50%)`;
  }, [hsv.h]);

  const hexValue = normalizeHex(value);

  const commitHsv = (next: HSV) => {
    const rgb = hsvToRgb(next);
    const hex = rgbToHex(rgb);
    setHsv(next);
    onChange(hex);
  };

  const setHueFromClientX = (clientX: number) => {
    const el = hueRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = clamp01((clientX - r.left) / Math.max(1, r.width));
    commitHsv({ ...hsv, h: x * 360 });
  };

  const setSvFromClient = (clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = clamp01((clientX - r.left) / Math.max(1, r.width));
    const v = clamp01(1 - (clientY - r.top) / Math.max(1, r.height));
    commitHsv({ ...hsv, s, v });
  };

  const onSvPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setSvFromClient(e.clientX, e.clientY);
  };
  const onSvPointerMove = (e: React.PointerEvent) => {
    if ((e.buttons & 1) !== 1) return;
    e.preventDefault();
    setSvFromClient(e.clientX, e.clientY);
  };

  const onHuePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setHueFromClientX(e.clientX);
  };
  const onHuePointerMove = (e: React.PointerEvent) => {
    if ((e.buttons & 1) !== 1) return;
    e.preventDefault();
    setHueFromClientX(e.clientX);
  };

  const proPicker = (
    <div className="color-pro" onClick={(e) => e.stopPropagation()}>
      <div
        className="color-sv"
        ref={svRef}
        style={{ ['--hue' as any]: hueCss }}
        onPointerDown={onSvPointerDown}
        onPointerMove={onSvPointerMove}
      >
        <div
          className="color-sv-thumb"
          style={{
            left: `${clamp01(hsv.s) * 100}%`,
            top: `${(1 - clamp01(hsv.v)) * 100}%`,
            background: hexValue,
          }}
        />
      </div>

      <div
        className="color-hue"
        ref={hueRef}
        onPointerDown={onHuePointerDown}
        onPointerMove={onHuePointerMove}
      >
        <div className="color-hue-thumb" style={{ left: `${(clamp(hsv.h, 0, 360) / 360) * 100}%` }} />
      </div>

      <div className="color-pro-row">
        <div className="color-pro-preview" style={{ background: hexValue }} />
        <input
          className="hex-input"
          value={hexValue.toUpperCase()}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
        />
      </div>

      <div className="color-row">
        {swatches.map((c) => (
          <button
            key={c}
            className={`swatch ${hexValue.toUpperCase() === c.toUpperCase() ? 'selected' : ''}`}
            style={{ background: c }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(c);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(c);
            }}
            title={c}
          />
        ))}
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="color-popper color-popper-inline" ref={ref}>
        {proPicker}
      </div>
    );
  }

  return (
    <div className="color-popper" ref={ref}>
      <button 
        className="btn color-btn" 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Color"
      >
        <span className="color-dot" style={{ background: value }} />
        <span style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}>{value.toUpperCase()}</span>
      </button>
      {inlineHex && (
        <input
          className="hex-input"
          style={{ marginLeft: 8 }}
          value={value.toUpperCase()}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
        />
      )}
      {open && (
        <div className="popper-panel" onClick={(e) => e.stopPropagation()}>
          {proPicker}
        </div>
      )}
    </div>
  );
}

const DEFAULTS = ['#FFFFFF', '#000000', '#00F0C8', '#00C2A8', '#FF6B6B', '#FFD166', '#06D6A0', '#118AB2', '#9B5DE5', '#F15BB5', '#FEE440', '#00BBF9'];

function normalizeHex(v: string) {
  let s = v.trim().replace(/[^#0-9a-fA-F]/g, '');
  if (!s.startsWith('#')) s = '#' + s;
  if (s.length === 4) {
    const r = s[1], g = s[2], b = s[3];
    s = `#${r}${r}${g}${g}${b}${b}`;
  }
  return s.slice(0, 7);
}

type RGB = { r: number; g: number; b: number };
type HSV = { h: number; s: number; v: number };

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function clamp01(n: number) { return clamp(n, 0, 1); }

function hexToRgb(hex: string): RGB {
  const s = normalizeHex(hex).slice(1);
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex({ r, g, b }: RGB): string {
  const rr = clamp(Math.round(r), 0, 255).toString(16).padStart(2, '0');
  const gg = clamp(Math.round(g), 0, 255).toString(16).padStart(2, '0');
  const bb = clamp(Math.round(b), 0, 255).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`.toUpperCase();
}

function rgbToHsv({ r, g, b }: RGB): HSV {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb({ h, s, v }: HSV): RGB {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rr = 0, gg = 0, bb = 0;
  if (hh < 60) { rr = c; gg = x; bb = 0; }
  else if (hh < 120) { rr = x; gg = c; bb = 0; }
  else if (hh < 180) { rr = 0; gg = c; bb = x; }
  else if (hh < 240) { rr = 0; gg = x; bb = c; }
  else if (hh < 300) { rr = x; gg = 0; bb = c; }
  else { rr = c; gg = 0; bb = x; }
  return { r: (rr + m) * 255, g: (gg + m) * 255, b: (bb + m) * 255 };
}


