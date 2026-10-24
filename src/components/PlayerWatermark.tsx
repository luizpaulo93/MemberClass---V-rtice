import React, { useEffect, useState } from 'react';

// Âncoras nas laterais para o texto nunca ser cortado em telas estreitas.
const POSITIONS: React.CSSProperties[] = [
  { top: '10%', left: '4%' },
  { top: '16%', right: '4%' },
  { top: '42%', left: '4%' },
  { top: '46%', right: '4%' },
  { top: '68%', left: '4%' },
  { top: '72%', right: '4%' },
];

export const PlayerWatermark: React.FC<{ text: string }> = ({ text }) => {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * POSITIONS.length));

  useEffect(() => {
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1 + Math.floor(Math.random() * (POSITIONS.length - 1))) % POSITIONS.length);
    }, 20000);
    return () => window.clearInterval(t);
  }, []);

  if (!text) return null;
  return (
    <div
      aria-hidden="true"
      style={POSITIONS[idx]}
      className="absolute z-[35] max-w-[85%] truncate pointer-events-none select-none text-[10px] sm:text-xs font-semibold text-white/30 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] transition-all duration-1000"
    >
      {text}
    </div>
  );
};
