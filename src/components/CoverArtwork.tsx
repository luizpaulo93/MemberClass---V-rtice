import React, { useEffect, useState } from 'react';
import { COVER_PRESETS } from '../types';

interface CoverArtworkProps {
  src?: string;
  title: string;
  subtitle?: string;
  className?: string;
  showBottomPurpleBar?: boolean;
  locked?: boolean;
}

export const CoverArtwork: React.FC<CoverArtworkProps> = ({
  src,
  title,
  className = '',
  showBottomPurpleBar = true,
  locked = false,
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const preset =
    COVER_PRESETS.find((p) => p.id === src) ||
    COVER_PRESETS[Math.abs(hashString(title)) % COVER_PRESETS.length];

  const isCustomUrl = Boolean(src && !src.startsWith('preset:') && !imgError);

  return (
    <div
      className={`cover-poster-dark relative overflow-hidden select-none ${
        locked ? 'bg-zinc-700 grayscale saturate-0' : 'bg-[#0d1527]'
      } ${className}`}
    >
      {isCustomUrl ? (
        <img
          src={src}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`w-full h-full object-cover object-center transition-transform duration-500 ${
            locked
              ? 'grayscale saturate-0 brightness-90 contrast-90 opacity-85'
              : 'group-hover:scale-105'
          }`}
        />
      ) : (
        <div
          className={`w-full h-full bg-gradient-to-br ${
            locked
              ? 'from-zinc-500 via-zinc-600 to-zinc-800'
              : preset.gradient
          } relative flex items-center justify-center overflow-hidden transition-transform duration-500 ${
            locked ? 'grayscale saturate-0' : 'group-hover:scale-105'
          }`}
        >
          {/* Ambient radial glow */}
          <div
            className="absolute -top-12 left-1/2 -translate-x-1/2 w-56 h-56 rounded-full opacity-40 blur-2xl pointer-events-none"
            style={{ backgroundColor: locked ? '#a1a1aa' : preset.accentColor }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:20px_20px] opacity-30" />

          {/* Domain vector emblem */}
          <div
            className={`relative z-10 transition-opacity duration-300 ${
              locked
                ? 'opacity-45 text-zinc-200'
                : 'opacity-35 group-hover:opacity-50 text-blue-200'
            }`}
          >
            {preset.patternType === 'stadium' && (
              <svg className="w-28 h-28" viewBox="0 0 120 120" fill="none">
                <ellipse cx="60" cy="60" rx="48" ry="26" stroke="currentColor" strokeWidth="2" />
                <ellipse cx="60" cy="60" rx="34" ry="16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
                <circle cx="60" cy="60" r="8" stroke="currentColor" strokeWidth="2" />
                <path d="M12 60 H108" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
              </svg>
            )}
            {preset.patternType === 'trophy' && (
              <svg className="w-28 h-28" viewBox="0 0 120 120" fill="none">
                <path d="M42 28 H78 V52 C78 64 60 72 60 72 C60 72 42 64 42 52 V28 Z" stroke="currentColor" strokeWidth="2.2" />
                <path d="M42 34 H30 V46 C30 53 36 56 42 56" stroke="currentColor" strokeWidth="2" />
                <path d="M78 34 H90 V46 C90 53 84 56 78 56" stroke="currentColor" strokeWidth="2" />
                <path d="M60 72 V90 M44 90 H76" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            )}
            {preset.patternType === 'astronaut' && (
              <svg className="w-28 h-28" viewBox="0 0 120 120" fill="none">
                <rect x="34" y="20" width="52" height="80" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
                <circle cx="60" cy="48" r="14" stroke="currentColor" strokeWidth="2.2" />
                <path d="M40 86 C40 70 80 70 80 86" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            )}
            {preset.patternType === 'strategy' && (
              <svg className="w-28 h-28" viewBox="0 0 120 120" fill="none">
                <polygon points="60,22 96,42 96,78 60,98 24,78 24,42" stroke="currentColor" strokeWidth="2" />
                <polyline points="36,70 52,52 66,62 84,38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {preset.patternType === 'mastery' && (
              <svg className="w-28 h-28" viewBox="0 0 120 120" fill="none">
                <circle cx="60" cy="60" r="36" stroke="currentColor" strokeWidth="1.8" />
                <polygon points="53,44 77,60 53,76" fill="currentColor" opacity="0.7" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Measured contrast scrim + bottom bar */}
      <div
        className={`absolute inset-0 bg-gradient-to-t ${
          locked
            ? 'from-zinc-900/90 via-zinc-800/45 to-zinc-700/15'
            : 'from-[#070b14] via-[#070b14]/40 to-transparent'
        } pointer-events-none`}
      />
      {showBottomPurpleBar && !locked && (
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#2563eb]/80 via-[#2563eb]/30 to-transparent pointer-events-none" />
      )}
      {locked && (
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-zinc-900/95 via-zinc-800/60 to-transparent pointer-events-none" />
      )}
    </div>
  );
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
