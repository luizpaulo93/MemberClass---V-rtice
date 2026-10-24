import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface PerformanceChartPoint {
  id: string;
  shortLabel: string;
  title: string;
  barValue: number; // e.g. TRI score (300..1000) or Accuracy % (0..100)
  lineValue: number; // e.g. Coerência Pedagógica mapped to scale or TRI evolution line
  displayScore: string;
  displaySub: string;
}

interface PerformanceChartProps {
  points: PerformanceChartPoint[];
  minY?: number;
  maxY?: number;
  ySteps?: number[];
  formatY?: (val: number) => string;
  onSelectPoint: (id: string) => void;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  points,
  minY = 300,
  maxY = 1000,
  ySteps = [300, 475, 650, 825, 1000],
  formatY = (v) => String(Math.round(v)),
  onSelectPoint,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(280);

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (el.clientWidth > 0) {
        setViewportWidth(el.clientWidth);
      }
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const svgHeight = 248;
  const padTop = 24;
  const padBottom = 38;
  const plotHeight = svgHeight - padTop - padBottom;

  // Compact spacing between consecutive bars so they are never far apart
  const stepX = 56;
  const barWidth = 26;
  const minLeftMargin = 32;

  const centerOffset = Math.max(110, Math.round(viewportWidth / 2));
  const lastIdx = Math.max(0, points.length - 1);

  // Position the first bar so that the LAST bar lands at centerOffset (or at minLeftMargin + lastIdx * stepX when scrollable)
  const firstBarX = Math.max(minLeftMargin, centerOffset - lastIdx * stepX);
  const lastBarX = firstBarX + lastIdx * stepX;

  // Ensure the SVG is wide enough to keep the last bar centered even when scrolling
  const svgWidth = Math.max(viewportWidth, lastBarX + centerOffset);

  // Auto-scroll so the last bar is always centered on load or when points/viewport change
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const targetScrollLeft = Math.max(0, lastBarX - centerOffset);
    el.scrollLeft = targetScrollLeft;
  }, [points.length, lastBarX, centerOffset, viewportWidth]);

  if (points.length === 0) return null;

  const clampY = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    const ratio = (clamped - minY) / Math.max(1, maxY - minY);
    return padTop + plotHeight * (1 - ratio);
  };

  const coords = points.map((pt, idx) => {
    const cx = firstBarX + idx * stepX;
    const barTopY = clampY(pt.barValue);
    const barH = Math.max(6, padTop + plotHeight - barTopY);
    const lineY = clampY(pt.lineValue);
    return {
      ...pt,
      cx,
      barTopY,
      barH,
      lineY,
    };
  });

  // Build smooth cubic-bezier SVG path through all line coordinates
  const buildSmoothPath = () => {
    if (coords.length === 1) {
      const c = coords[0];
      return `M ${c.cx - 16} ${c.lineY} L ${c.cx + 16} ${c.lineY}`;
    }
    let d = `M ${coords[0].cx} ${coords[0].lineY}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      const ctrlX1 = curr.cx + (next.cx - curr.cx) * 0.45;
      const ctrlY1 = curr.lineY;
      const ctrlX2 = curr.cx + (next.cx - curr.cx) * 0.55;
      const ctrlY2 = next.lineY;
      d += ` C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${next.cx} ${next.lineY}`;
    }
    return d;
  };

  return (
    <div className="w-full rounded-2xl bg-surface border border-line p-4 md:p-5 shadow-card">
      <div className="flex items-stretch">
        {/* Fixed Left Y-Axis Labels Column */}
        <div
          className="relative shrink-0 w-11 select-none"
          style={{ height: `${svgHeight}px` }}
        >
          {ySteps.map((stepVal) => {
            const y = clampY(stepVal);
            return (
              <span
                key={stepVal}
                style={{ top: `${y}px` }}
                className="absolute right-2 -translate-y-1/2 text-ink-muted text-[11px] font-semibold tabular-nums leading-none"
              >
                {formatY(stepVal)}
              </span>
            );
          })}
        </div>

        {/* Scrollable Plot Area where the LAST bar is always centered */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden no-scrollbar"
        >
          <svg
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="block select-none"
          >
            <defs>
              <linearGradient id="verticeBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="50%" stopColor="#ea580c" />
                <stop offset="100%" stopColor="#e11d48" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines across full plot width */}
            {ySteps.map((stepVal) => {
              const y = clampY(stepVal);
              return (
                <line
                  key={stepVal}
                  x1={0}
                  y1={y}
                  x2={svgWidth}
                  y2={y}
                  className="stroke-line"
                  strokeWidth="1"
                />
              );
            })}

            {/* Clickable Vertical Bars */}
            {coords.map((c) => (
              <g
                key={c.id}
                onClick={() => onSelectPoint(c.id)}
                className="cursor-pointer group"
              >
                {/* Transparent hit target for effortless mobile tap */}
                <rect
                  x={c.cx - stepX / 2}
                  y={padTop}
                  width={stepX}
                  height={plotHeight + padBottom}
                  fill="transparent"
                />

                {/* Orange-to-Crimson Bar */}
                <rect
                  x={c.cx - barWidth / 2}
                  y={c.barTopY}
                  width={barWidth}
                  height={c.barH}
                  rx="3"
                  fill="url(#verticeBarGrad)"
                  className="transition-opacity duration-200 group-hover:opacity-90"
                />

                {/* Score above bar */}
                <text
                  x={c.cx}
                  y={Math.max(14, c.barTopY - 7)}
                  textAnchor="middle"
                  className="fill-ink text-[11px] font-bold tabular-nums"
                >
                  {c.displayScore}
                </text>

                {/* X-axis label */}
                <text
                  x={c.cx}
                  y={padTop + plotHeight + 22}
                  textAnchor="middle"
                  className="fill-ink-muted group-hover:fill-ink text-[11px] font-semibold transition-colors"
                >
                  {c.shortLabel}
                </text>
              </g>
            ))}

            {/* Smooth Curve */}
            <path
              d={buildSmoothPath()}
              fill="none"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="stroke-brand pointer-events-none"
            />

            {/* Curve Vertices */}
            {coords.map((c) => (
              <g
                key={`dot_${c.id}`}
                onClick={() => onSelectPoint(c.id)}
                className="cursor-pointer"
              >
                <circle cx={c.cx} cy={c.lineY} r="8" fill="transparent" />
                <circle
                  cx={c.cx}
                  cy={c.lineY}
                  r="3.8"
                  strokeWidth="1.5"
                  className="fill-brand stroke-surface"
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
};
