import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  CheckCircle2,
  SkipForward,
  RectangleHorizontal,
} from 'lucide-react';
import { extractYoutubeId } from '../types';
import { PlayerWatermark } from './PlayerWatermark';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface StealthVideoPlayerProps {
  youtubeIdOrUrl: string;
  title: string;
  subtitle?: string;
  thumbnailUrl?: string;
  watermarkText?: string;
  isCompleted?: boolean;
  onToggleComplete?: () => void;
  onNextLesson?: () => void;
  hasNextLesson?: boolean;
  theaterMode?: boolean;
  onToggleTheaterMode?: () => void;
  initialTimeSec?: number;
  onTimeUpdate?: (
    currentTimeSec: number,
    durationSec: number,
    forceFlush?: boolean
  ) => void;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }
  if (ytApiPromise) {
    return ytApiPromise;
  }
  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevCallback === 'function') prevCallback();
      resolve();
    };

    const existingScript = document.getElementById('yt-iframe-api-script');
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => resolve();
      document.head.appendChild(tag);
    } else {
      const poll = window.setInterval(() => {
        if (window.YT && window.YT.Player) {
          window.clearInterval(poll);
          resolve();
        }
      }, 100);
      window.setTimeout(() => {
        window.clearInterval(poll);
        resolve();
      }, 4000);
    }
  });
  return ytApiPromise;
}

export const StealthVideoPlayer: React.FC<StealthVideoPlayerProps> = ({
  youtubeIdOrUrl,
  title,
  thumbnailUrl,
  watermarkText,
  isCompleted = false,
  onToggleComplete,
  onNextLesson,
  hasNextLesson = false,
  theaterMode = false,
  onToggleTheaterMode,
  initialTimeSec = 0,
  onTimeUpdate,
}) => {
  const cleanVideoId = extractYoutubeId(youtubeIdOrUrl);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mountNodeRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(() =>
    initialTimeSec > 2 ? initialTimeSec : 0
  );
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFs, setIsPseudoFs] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  // Bottom controls start hidden before the video begins
  const [controlsVisible, setControlsVisible] = useState(false);

  const hideControlsTimer = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const isSpeedMenuOpenRef = useRef(false);
  const initialTimeRef = useRef(initialTimeSec);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const lastReportedSecRef = useRef<number>(-1);
  const durationRef = useRef(0);
  const hasStartedOnceRef = useRef(false);
  const suppressInitialControlsRef = useRef(true);
  const isMountingPlayerRef = useRef(false);
  const isComponentMountedRef = useRef(true);

  useEffect(() => {
    setThumbLoaded(false);
  }, [thumbnailUrl]);

  useEffect(() => {
    initialTimeRef.current = initialTimeSec;
  }, [initialTimeSec]);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isSpeedMenuOpenRef.current = isSpeedMenuOpen;
  }, [isSpeedMenuOpen]);

  const clearHideTimer = useCallback(() => {
    if (hideControlsTimer.current !== null) {
      window.clearTimeout(hideControlsTimer.current);
      hideControlsTimer.current = null;
    }
  }, []);

  /**
   * Shows top & bottom shading + controls and schedules BOTH to disappear together
   * after 3000ms (3 seconds) if playing and speed menu is closed.
   */
  const scheduleHideIn3Seconds = useCallback(
    (playingOverride?: boolean, speedMenuOverride?: boolean) => {
      const playingNow =
        playingOverride !== undefined ? playingOverride : isPlayingRef.current;
      const speedOpenNow =
        speedMenuOverride !== undefined
          ? speedMenuOverride
          : isSpeedMenuOpenRef.current;

      setControlsVisible(true);
      clearHideTimer();

      if (playingNow && !speedOpenNow) {
        hideControlsTimer.current = window.setTimeout(() => {
          if (isPlayingRef.current && !isSpeedMenuOpenRef.current) {
            setControlsVisible(false);
          }
        }, 3000);
      }
    },
    [clearHideTimer]
  );

  // Preload YouTube API script on mount, but DO NOT instantiate the iframe with videoId until user clicks Play
  useEffect(() => {
    isComponentMountedRef.current = true;
    const resumeSec =
      initialTimeRef.current > 2 ? Math.floor(initialTimeRef.current) : 0;
    setIsReady(false);
    setIsPlaying(false);
    setHasStartedOnce(false);
    hasStartedOnceRef.current = false;
    suppressInitialControlsRef.current = true;
    isMountingPlayerRef.current = false;
    setIsEnded(false);
    setCurrentTime(resumeSec);
    setDuration(0);
    durationRef.current = 0;
    setIsSpeedMenuOpen(false);
    setControlsVisible(false);
    lastReportedSecRef.current = -1;
    clearHideTimer();

    if (mountNodeRef.current) {
      mountNodeRef.current.innerHTML = '';
    }

    // Warm up the YT IFrame API script (without embedding the video ID yet)
    loadYouTubeApi();

    return () => {
      isComponentMountedRef.current = false;
      clearHideTimer();
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore cleanup error
        }
      }
      playerRef.current = null;
      isMountingPlayerRef.current = false;
    };
  }, [cleanVideoId, clearHideTimer]);

  const mountAndStartPlayer = useCallback(() => {
    if (isMountingPlayerRef.current || playerRef.current) return;
    isMountingPlayerRef.current = true;

    const resumeSec =
      initialTimeRef.current > 2 ? Math.floor(initialTimeRef.current) : 0;

    loadYouTubeApi().then(() => {
      if (!isComponentMountedRef.current || !mountNodeRef.current) return;

      mountNodeRef.current.innerHTML = '';
      const playerDiv = document.createElement('div');
      mountNodeRef.current.appendChild(playerDiv);

      try {
        playerRef.current = new window.YT.Player(playerDiv, {
          videoId: cleanVideoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            playsinline: 1,
            ...(resumeSec > 0 ? { start: resumeSec } : {}),
          },
          events: {
            onReady: (event: any) => {
              if (!isComponentMountedRef.current) return;
              setIsReady(true);
              const total = Number(event.target.getDuration?.() || 0);
              if (total > 0) {
                durationRef.current = total;
                setDuration(total);
              }
              try {
                event.target.setVolume?.(100);
                event.target.playVideo?.();
                isPlayingRef.current = true;
                setIsPlaying(true);
                setHasStartedOnce(true);
              } catch {
                // ignore
              }
            },
            onStateChange: (event: any) => {
              if (!isComponentMountedRef.current) return;
              const YTState = window.YT?.PlayerState;
              const state = event.data;

              if (YTState && state === YTState.PLAYING) {
                isPlayingRef.current = true;
                hasStartedOnceRef.current = true;
                setIsPlaying(true);
                setHasStartedOnce(true);
                setIsEnded(false);
                const total = Number(event.target.getDuration?.() || 0);
                if (total > 0) {
                  durationRef.current = total;
                  setDuration(total);
                }
                if (suppressInitialControlsRef.current) {
                  suppressInitialControlsRef.current = false;
                  setControlsVisible(false);
                } else {
                  scheduleHideIn3Seconds(true);
                }
              } else if (YTState && state === YTState.PAUSED) {
                isPlayingRef.current = false;
                setIsPlaying(false);
                clearHideTimer();
                if (hasStartedOnceRef.current) {
                  setControlsVisible(true);
                }
                try {
                  const curr = Number(event.target.getCurrentTime?.() || 0);
                  const total = Number(
                    event.target.getDuration?.() || durationRef.current || 0
                  );
                  if (curr > 0) {
                    onTimeUpdateRef.current?.(curr, total, true);
                  }
                } catch {
                  // ignore
                }
              } else if (YTState && state === YTState.ENDED) {
                isPlayingRef.current = false;
                setIsPlaying(false);
                setIsEnded(true);
                clearHideTimer();
                setControlsVisible(true);
                try {
                  const curr = Number(event.target.getCurrentTime?.() || 0);
                  const total = Number(
                    event.target.getDuration?.() || durationRef.current || 0
                  );
                  if (curr > 0) {
                    onTimeUpdateRef.current?.(curr, total, true);
                  }
                } catch {
                  // ignore
                }
              } else if (YTState && state === YTState.BUFFERING) {
                const total = Number(event.target.getDuration?.() || 0);
                if (total > 0) {
                  durationRef.current = total;
                  setDuration(total);
                }
              }
            },
            onError: (event: any) => {
              console.warn('YouTube Player notice (code):', event?.data);
            },
          },
        });
      } catch (err) {
        console.warn('Erro ao inicializar YouTube Player:', err);
      }
    });
  }, [cleanVideoId, clearHideTimer, scheduleHideIn3Seconds]);

  // Poll current time & intercept end-of-video BEFORE YouTube shows end-screen links
  useEffect(() => {
    if (!isReady) return;
    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;
      try {
        const curr = Number(player.getCurrentTime() || 0);
        const total = Number(player.getDuration() || durationRef.current || 0);
        if (total > 0 && total !== durationRef.current) {
          durationRef.current = total;
          setDuration(total);
        }
        if (curr > 0 || hasStartedOnceRef.current) {
          setCurrentTime(curr);
        }

        const roundedCurr = Math.floor(curr);
        if (
          roundedCurr > 0 &&
          Math.abs(roundedCurr - lastReportedSecRef.current) >= 1
        ) {
          lastReportedSecRef.current = roundedCurr;
          onTimeUpdateRef.current?.(curr, total, false);
        }

        // Intercept 0.85s before the end so YouTube's end-screen suggested videos never render
        if (total > 3 && curr >= total - 0.85 && isPlayingRef.current) {
          player.pauseVideo?.();
          isPlayingRef.current = false;
          setIsPlaying(false);
          setIsEnded(true);
          clearHideTimer();
          setControlsVisible(true);
          onTimeUpdateRef.current?.(curr, total, true);
        }
      } catch {
        // ignore transient player read errors
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [isReady, clearHideTimer]);

  // Native Fullscreen listener
  useEffect(() => {
    const handleFsChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active) {
        try {
          (screen.orientation as any)?.unlock?.();
        } catch {
          // ignore
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Lock body scroll & listen for Escape when CSS Pseudo-Fullscreen (iPhone) is active
  useEffect(() => {
    if (!isPseudoFs) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPseudoFs(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPseudoFs]);

  const startPlayback = (fromInitialCover = false) => {
    if (fromInitialCover || !hasStartedOnceRef.current) {
      suppressInitialControlsRef.current = true;
      hasStartedOnceRef.current = true;
      isPlayingRef.current = true;
      setHasStartedOnce(true);
      setIsPlaying(true);
      setControlsVisible(false);
    }

    const player = playerRef.current;
    if (!player || !isReady) {
      mountAndStartPlayer();
      return;
    }

    try {
      if (isEnded) {
        player.seekTo?.(0, true);
        setIsEnded(false);
      }

      player.playVideo?.();
      isPlayingRef.current = true;
      setIsPlaying(true);
      setHasStartedOnce(true);
      setIsSpeedMenuOpen(false);
      if (!fromInitialCover) {
        scheduleHideIn3Seconds(true, false);
      }
    } catch (err) {
      console.warn('Erro ao reproduzir:', err);
    }
  };

  const pausePlayback = () => {
    const player = playerRef.current;
    if (!player || !isReady) return;

    try {
      player.pauseVideo?.();
      const curr = Number(player.getCurrentTime?.() || currentTime || 0);
      const total = Number(player.getDuration?.() || durationRef.current || 0);
      if (curr > 0) {
        onTimeUpdateRef.current?.(curr, total, true);
      }
    } catch {
      // ignore
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
    clearHideTimer();
    setControlsVisible(true);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback(false);
    }
  };

  /**
   * Clicking on the video surface:
   * - Before starting: starts playback immediately with bottom controls hidden.
   * - After starting: clicking the video toggles the bottom controls on/off (and resumes if paused).
   */
  const handleVideoSurfaceClick = () => {
    if (isEnded) return;

    if (!hasStartedOnceRef.current) {
      startPlayback(true);
      return;
    }

    if (!isPlayingRef.current) {
      startPlayback(false);
      return;
    }

    if (controlsVisible || isSpeedMenuOpen) {
      clearHideTimer();
      setIsSpeedMenuOpen(false);
      isSpeedMenuOpenRef.current = false;
      setControlsVisible(false);
      return;
    }

    scheduleHideIn3Seconds(true, false);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    setIsEnded(false);
    playerRef.current?.seekTo?.(newTime, true);
    scheduleHideIn3Seconds();
  };

  const skipSeconds = (delta: number) => {
    const player = playerRef.current;
    if (!player || !isReady) return;
    const target = Math.max(0, Math.min((duration || 0) - 1, currentTime + delta));
    setCurrentTime(target);
    setIsEnded(false);
    player.seekTo?.(target, true);
    scheduleHideIn3Seconds();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    const player = playerRef.current;
    if (!player) return;
    player.setVolume?.(val);
    if (val === 0) {
      player.mute?.();
      setIsMuted(true);
    } else if (isMuted) {
      player.unMute?.();
      setIsMuted(false);
    }
    scheduleHideIn3Seconds();
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (isMuted) {
      player.unMute?.();
      player.setVolume?.(volume || 80);
      setIsMuted(false);
    } else {
      player.mute?.();
      setIsMuted(true);
    }
    scheduleHideIn3Seconds();
  };

  const toggleSpeedMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextOpen = !isSpeedMenuOpen;
    setIsSpeedMenuOpen(nextOpen);
    isSpeedMenuOpenRef.current = nextOpen;

    if (nextOpen) {
      clearHideTimer();
      setControlsVisible(true);
    } else {
      scheduleHideIn3Seconds(isPlaying, false);
    }
  };

  const selectPlaybackSpeed = (rate: number) => {
    setPlaybackRate(rate);
    playerRef.current?.setPlaybackRate?.(rate);
    setIsSpeedMenuOpen(false);
    isSpeedMenuOpenRef.current = false;
    scheduleHideIn3Seconds(isPlaying, false);
  };

  const toggleFullscreen = async () => {
    if (!wrapperRef.current) return;

    if (isPseudoFs) {
      setIsPseudoFs(false);
      try {
        (screen.orientation as any)?.unlock?.();
      } catch {
        // ignore
      }
      scheduleHideIn3Seconds();
      return;
    }

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore
      }
      try {
        (screen.orientation as any)?.unlock?.();
      } catch {
        // ignore
      }
      scheduleHideIn3Seconds();
      return;
    }

    if (typeof wrapperRef.current.requestFullscreen === 'function') {
      try {
        await wrapperRef.current.requestFullscreen();
        try {
          await (screen.orientation as any)?.lock?.('landscape');
        } catch {
          // Orientation lock is optional and only supported on mobile browsers
        }
      } catch {
        // Fallback to CSS fullscreen (iPhone Safari or restricted parent iframe)
        setIsPseudoFs(true);
      }
    } else {
      setIsPseudoFs(true);
    }

    scheduleHideIn3Seconds();
  };

  const isAnyFullscreen = isFullscreen || isPseudoFs;
  // Before the video starts (!hasStartedOnce), bottom controls are strictly hidden
  const isMenuVisible =
    hasStartedOnce && (isEnded || controlsVisible || isSpeedMenuOpen);

  const hasCustomThumbnail = Boolean(
    thumbnailUrl &&
      thumbnailUrl.trim().length > 0 &&
      !thumbnailUrl.startsWith('preset:') &&
      !thumbnailUrl.includes('i.ytimg.com')
  );

  return (
    <div
      ref={wrapperRef}
      onContextMenu={(e) => e.preventDefault()}
      style={isPseudoFs ? undefined : { aspectRatio: '16 / 9' }}
      className={`stealth-player-dark select-none overflow-hidden shrink-0 ${
        isPseudoFs
          ? 'fixed inset-0 z-[200] w-screen h-[100dvh] rounded-none bg-black'
          : 'relative isolate z-10 block w-full max-w-full aspect-video bg-[#08070d] rounded-2xl border border-white/10 shadow-2xl'
      }`}
    >
      {/* Cropped & Non-Interactive YouTube IFrame Viewport */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          ref={mountNodeRef}
          className="w-full h-[calc(100%+180px)] -mt-[90px] pointer-events-none"
        />
      </div>

      {/* A2. Clean Cover before first play without exposing YouTube ID via i.ytimg.com */}
      {!hasStartedOnce && !isEnded && (
        <div className="absolute inset-0 z-15 pointer-events-none overflow-hidden">
          {hasCustomThumbnail ? (
            <div className="relative w-full h-full bg-[#0d1527]">
              <img
                src={thumbnailUrl}
                alt={title}
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={() => setThumbLoaded(true)}
                className={`w-full h-full object-cover object-center transition-opacity duration-200 ${
                  thumbLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#070b14]/90 via-[#070b14]/35 to-[#070b14]/30" />
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
                <p className="text-xs sm:text-sm font-bold text-white/90 truncate drop-shadow">
                  {title}
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#070b14] via-[#0d1832] to-[#172554] flex flex-col items-center justify-end p-5 sm:p-8 text-center">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_60%_at_50%_40%,rgba(37,99,235,0.28),transparent_100%)]" />
              <p className="relative z-10 w-full max-w-xl px-2 text-xs sm:text-sm md:text-base font-bold text-white/90 truncate">
                {title}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Impenetrable Stealth Click/Context Shield over 100% of the video */}
      <div
        onClick={handleVideoSurfaceClick}
        onDoubleClick={toggleFullscreen}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute inset-0 z-20 cursor-pointer"
        aria-label={isPlaying ? 'Controle do vídeo' : 'Reproduzir aula'}
      />

      {/* A1. Dynamic anti-piracy student watermark (visible in normal and fullscreen modes) */}
      <PlayerWatermark text={watermarkText || ''} />

      {/* Center Big Blue Play Button Overlay before video starts or when paused */}
      {!isPlaying && !isEnded && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            startPlayback(!hasStartedOnceRef.current);
          }}
          className="absolute inset-0 z-25 flex items-center justify-center cursor-pointer pointer-events-auto"
          aria-label="Reproduzir aula"
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#2563eb]/90 hover:bg-[#1d4ed8] active:scale-95 text-white flex items-center justify-center shadow-[0_8px_32px_rgba(37,99,235,0.6)] backdrop-blur-sm border border-white/20 transition-all group">
            <Play className="w-7 h-7 sm:w-9 sm:h-9 fill-current ml-1 group-hover:scale-110 transition-transform" />
          </div>
        </div>
      )}

      {/* End-of-Video Screen (intercepts before YouTube end-screen links appear) */}
      {isEnded && (
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-0 z-30 bg-[#070b14]/95 flex flex-col items-center justify-center p-6 text-center"
        >
          <div className="relative z-10 flex flex-col items-center max-w-md">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base md:text-lg font-bold text-white">{title}</h3>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => startPlayback(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Rever
              </button>

              {onToggleComplete && (
                <button
                  type="button"
                  onClick={onToggleComplete}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isCompleted
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                      : 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isCompleted ? 'Concluída' : 'Concluir Aula'}
                </button>
              )}

              {hasNextLesson && onNextLesson && (
                <button
                  type="button"
                  onClick={onNextLesson}
                  className="px-4 py-2 rounded-xl bg-white text-[#070b14] hover:bg-slate-200 text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Próxima Aula
                  <SkipForward className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOP SHADING — Synchronized with Bottom Shading */}
      <div
        className={`absolute inset-x-0 top-0 h-20 z-30 bg-gradient-to-b from-[#06050a]/95 via-[#06050a]/55 to-transparent pointer-events-none transition-opacity duration-300 ${
          isMenuVisible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* BOTTOM SHADING + CONTROL BAR — Hidden before video starts; appears when clicking the video after start */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-[#06050a]/95 via-[#06050a]/80 to-transparent pt-8 transition-opacity duration-300 ${
          isAnyFullscreen
            ? 'pb-[max(0.875rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]'
            : 'pb-3 px-3 sm:px-4 md:px-5'
        } ${isMenuVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {/* Interactive Timeline Scrubber with 32px (h-8) touch area and thin visual track */}
        <div className="relative flex items-center h-8 mb-1">
          <svg
            viewBox="0 0 1000 10"
            preserveAspectRatio="none"
            className="w-full h-1.5 rounded-full overflow-hidden pointer-events-none"
            aria-hidden="true"
          >
            <rect
              x="0"
              y="0"
              width="1000"
              height="10"
              fill="rgba(255, 255, 255, 0.22)"
            />
            <rect
              x="0"
              y="0"
              width={
                duration > 0
                  ? Math.round(
                      Math.min(1, Math.max(0, currentTime / duration)) * 1000
                    )
                  : 0
              }
              height="10"
              fill="#3b82f6"
            />
          </svg>
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.1}
            value={Math.min(currentTime, duration || 100)}
            onChange={handleSeek}
            aria-label="Progresso da aula"
            className="stealth-range-slider absolute inset-0 w-full h-full bg-transparent appearance-none cursor-pointer accent-[#3b82f6]"
          />
        </div>

        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {/* Left Controls: Play/Pause, -10s, +10s, Volume, Time */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3 min-w-0">
            <button
              type="button"
              onClick={togglePlayPause}
              disabled={!isReady}
              className="w-10 h-10 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 cursor-pointer"
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => skipSeconds(-10)}
              className="w-10 h-10 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              title="Voltar 10 segundos"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => skipSeconds(10)}
              className="w-10 h-10 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              title="Avançar 10 segundos"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Volume Control */}
            <div className="hidden sm:flex items-center gap-2 ml-1">
              <button
                type="button"
                onClick={toggleMute}
                className="w-10 h-10 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                title={isMuted ? 'Ativar som' : 'Silenciar'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <div className="relative flex items-center w-16 h-8">
                <svg
                  viewBox="0 0 100 10"
                  preserveAspectRatio="none"
                  className="w-full h-1 rounded-full overflow-hidden pointer-events-none"
                  aria-hidden="true"
                >
                  <rect
                    x="0"
                    y="0"
                    width="100"
                    height="10"
                    fill="rgba(255, 255, 255, 0.22)"
                  />
                  <rect
                    x="0"
                    y="0"
                    width={isMuted ? 0 : Math.min(100, Math.max(0, volume))}
                    height="10"
                    fill="#3b82f6"
                  />
                </svg>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  aria-label="Volume"
                  className="stealth-range-slider absolute inset-0 w-full h-full bg-transparent appearance-none cursor-pointer accent-[#3b82f6]"
                />
              </div>
            </div>

            {/* Tabular Timestamp (hides "/ 00:00" on <=360px screens to prevent overlap) */}
            <div className="text-xs font-mono tabular-nums text-slate-300 ml-0.5 sm:ml-1 whitespace-nowrap shrink-0">
              <span>{formatSeconds(currentTime)}</span>
              <span className="max-[360px]:hidden">
                <span className="mx-1 text-slate-500">/</span>
                <span className="text-slate-400">{formatSeconds(duration)}</span>
              </span>
            </div>
          </div>

          {/* Right Controls: Speed Menu, Theater Mode, Fullscreen */}
          <div className="relative flex items-center gap-1 sm:gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={toggleSpeedMenu}
                className={`min-h-10 px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center ${
                  isSpeedMenuOpen
                    ? 'bg-[#2563eb] text-white'
                    : 'bg-white/10 hover:bg-white/15 text-slate-200'
                }`}
                title="Velocidade de reprodução"
              >
                {playbackRate}x
              </button>

              {isSpeedMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-24 max-h-44 overflow-y-auto rounded-xl bg-[#0d1527] border border-white/15 py-1.5 shadow-2xl z-50">
                  {SPEED_OPTIONS.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => selectPlaybackSpeed(rate)}
                      className={`w-full px-3 py-1.5 text-left text-xs font-mono tabular-nums flex items-center justify-between transition-colors cursor-pointer ${
                        playbackRate === rate
                          ? 'bg-[#2563eb]/30 text-white font-bold'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span>{rate}x</span>
                      {playbackRate === rate && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {onToggleTheaterMode && (
              <button
                type="button"
                onClick={onToggleTheaterMode}
                className={`hidden lg:flex w-10 h-10 items-center justify-center rounded-lg transition-colors shrink-0 cursor-pointer ${
                  theaterMode
                    ? 'bg-[#2563eb]/30 text-blue-300'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="Modo Cinema"
              >
                <RectangleHorizontal className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              className="w-10 h-10 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              title={isAnyFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {isAnyFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const totalSeconds = Math.floor(sec);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}
