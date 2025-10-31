import React from 'react';

type Props = {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

export function SizeControl({ value, onChange, min = 1, max = 64, step = 1 }: Props) {
  function clamp(n: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  return (
    <div className="size-row">
      <button className="icon-btn" title="Smaller" data-tooltip="Smaller" onClick={() => onChange(clamp(value - step))}>–</button>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="size-slider"
      />
      <button className="icon-btn" title="Larger" data-tooltip="Larger" onClick={() => onChange(clamp(value + step))}>+</button>
    </div>
  );
}


