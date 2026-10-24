import React from 'react';

interface VerticeLogoProps {
  className?: string;
}

/**
 * Curso Vértice — Geometric "V" emblem using currentColor so it renders
 * in pure white in Dark Mode and deep obsidian ink in Light Mode.
 */
export const VerticeLogo: React.FC<VerticeLogoProps> = ({
  className = 'w-8 h-8',
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      {/* Left solid diagonal bar forming the main V vertex */}
      <polygon points="6,10 29,10 59,72 49,92" fill="currentColor" />

      {/* Top-left outlined triangle */}
      <polygon
        points="33,11 59,11 46,36"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="miter"
        fill="none"
      />

      {/* Center inverted outlined triangle */}
      <polygon
        points="49,37 62,12 75,37"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="miter"
        fill="none"
      />

      {/* Top-right outlined triangle */}
      <polygon
        points="65,11 92,11 78.5,36"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="miter"
        fill="none"
      />

      {/* Lower-right solid triangle */}
      <polygon points="49,41 76,41 62.5,67" fill="currentColor" />
    </svg>
  );
};
