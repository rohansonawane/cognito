import React, { useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (hex: string) => void;
  swatches?: string[];
  inlineHex?: boolean;
};

export function ColorPicker({ value, onChange, swatches = DEFAULTS, inlineHex = false }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, []);

  return (
    <div className="color-popper" ref={ref}>
      <button className="btn" onClick={() => setOpen((v) => !v)} title="Color">
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
          <div className="color-row">
            {swatches.map((c) => (
              <button 
                key={c} 
                className={`swatch ${value===c?'selected':''}`} 
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
          <div className="color-custom" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
            <input 
              type="color" 
              value={value} 
              onChange={(e) => onChange(e.target.value)} 
              onClick={(e) => e.stopPropagation()}
            />
            <input 
              className="hex-input" 
              value={value.toUpperCase()} 
              onChange={(e) => onChange(normalizeHex(e.target.value))} 
              onClick={(e) => e.stopPropagation()}
            />
          </div>
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


