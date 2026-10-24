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
  isCompleted?: boolean;
  onToggleComplete?: () => void;
  onNextLesson?: () => void;
  hasNextLesson?: boolean;
  theaterMode?: boolean;
  onToggleTheaterMode?: () => void;
  initialTimeSec?: number;
  onTimeUpdate?: (currentTimeSec: number, durationSec: number) => void;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }
  if (ytApiPromise) {
    return ytApiPromise;
  }
  ytApiPromise = new Promise((resolve) => {
    const existingScript = document.getElementById('yt-iframe-api-script');
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      resolve();
    };
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

export const StealthVideoPlayer: React.FC<StealthVideoPlayerProps> = ({
  youtubeIdOrUrl,
  title,
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
  const [controlsVisible, setControlsVisible] = useState(true);

  const hideControlsTimer = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const isSpeedMenuOpenRef = useRef(false);
  const initialTimeRef = useRef(initialTimeSec);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const lastReportedSecRef = useRef<number>(-1);

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

  const durationRef = useRef(0);
  const hasStartedOnceRef = useRef(false);

  // Initialize YT.Player instance
  useEffect(() => {
    let isMounted = true;
    const resumeSec =
      initialTimeRef.current > 2 ? Math.floor(initialTimeRef.current) : 0;
    setIsReady(false);
    setIsPlaying(false);
    setHasStartedOnce(false);
    hasStartedOnceRef.current = false;
    setIsEnded(false);
    setCurrentTime(resumeSec);
    setDuration(0);
    durationRef.current = 0;
    setIsSpeedMenuOpen(false);
    setControlsVisible(true);
    lastReportedSecRef.current = -1;
    clearHideTimer();

    loadYouTubeApi().then(() => {
      if (!isMounted || !mountNodeRef.current) return;

      mountNodeRef.current.innerHTML = '';
      const playerDiv = document.createElement('div');
      mountNodeRef.current.appendChild(playerDiv);

      playerRef.current = new window.YT.Player(playerDiv, {
        videoId: cleanVideoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          playsinline: 1,
          ...(resumeSec > 0 ? { start: resumeSec } : {}),
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            if (!isMounted) return;
            setIsReady(true);
            const total = Number(event.target.getDuration?.() || 0);
            if (total > 0) {
              durationRef.current = total;
              setDuration(total);
            }
            event.target.setVolume?.(100);
          },
          onStateChange: (event: any) => {
            if (!isMounted) return;
            const YTState = window.YT.PlayerState;
            const state = event.data;

            if (state === YTState.PLAYING) {
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
              scheduleHideIn3Seconds(true);
            } else if (state === YTState.PAUSED) {
              isPlayingRef.current = false;
              setIsPlaying(false);
              clearHideTimer();
              setControlsVisible(true);
            } else if (state === YTState.ENDED) {
              isPlayingRef.current = false;
              setIsPlaying(false);
              setIsEnded(true);
              clearHideTimer();
              setControlsVisible(true);
            } else if (state === YTState.BUFFERING) {
              const total = Number(event.target.getDuration?.() || 0);
              if (total > 0) {
                durationRef.current = total;
                setDuration(total);
              }
            }
          },
        },
      });
    });

    return () => {
      isMounted = false;
      clearHideTimer();
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore cleanup error
        }
      }
      playerRef.current = null;
    };
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
          onTimeUpdateRef.current?.(curr, total);
        }

        // Intercept 0.85s before the end so YouTube's end-screen suggested videos never render
        if (total > 3 && curr >= total - 0.85 && isPlayingRef.current) {
          player.pauseVideo?.();
          isPlayingRef.current = false;
          setIsPlaying(false);
          setIsEnded(true);
          clearHideTimer();
          setControlsVisible(true);
        }
      } catch {
        // ignore transient player read errors
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [isReady, clearHideTimer]);

  // Fullscreen listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const startPlayback = () => {
    const player = playerRef.current;
    if (!player || !isReady) return;

    if (isEnded) {
      player.seekTo?.(0, true);
      setIsEnded(false);
    }

    player.playVideo?.();
    isPlayingRef.current = true;
    setIsPlaying(true);
    setHasStartedOnce(true);
    setIsSpeedMenuOpen(false);
    scheduleHideIn3Seconds(true, false);
  };

  const pausePlayback = () => {
    const player = playerRef.current;
    if (!player || !isReady) return;

    player.pauseVideo?.();
    isPlayingRef.current = false;
    setIsPlaying(false);
    clearHideTimer();
    setControlsVisible(true);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback();
    }
  };

  /**
   * Clicking on the video surface (area above the bottom buttons):
   * - If the buttons/controls are currently visible: collapses (hides) the buttons immediately.
   * - If the buttons/controls are currently collapsed (hidden): reveals the buttons (and auto-hides after 3s if playing).
   */
  const handleVideoSurfaceClick = () => {
    if (isEnded) return;

    if (controlsVisible || isSpeedMenuOpen) {
      clearHideTimer();
      setIsSpeedMenuOpen(false);
      isSpeedMenuOpenRef.current = false;
      setControlsVisible(false);
      return;
    }

    if (isPlayingRef.current) {
      scheduleHideIn3Seconds(true, false);
    } else {
      clearHideTimer();
      setControlsVisible(true);
    }
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
    try {
      if (!document.fullscreenElement) {
        await wrapperRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback if fullscreen is restricted by parent iframe
    }
    scheduleHideIn3Seconds();
  };

  // Unified visibility flag for BOTH top shading and bottom shading + control bar
  const isMenuVisible = isEnded || controlsVisible || isSpeedMenuOpen;

  return (
    <div
      ref={wrapperRef}
      onContextMenu={(e) => e.preventDefault()}
      className="stealth-player-dark relative isolate z-10 w-full aspect-video bg-[#08070d] rounded-2xl overflow-hidden border border-white/10 shadow-2xl select-none"
    >
      {/* Cropped & Non-Interactive YouTube IFrame Viewport */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          ref={mountNodeRef}
          className="w-full h-[calc(100%+180px)] -mt-[90px] pointer-events-none"
        />
      </div>

      {/* Clean Video Frame Cover before first play (hides YouTube's native center play button without blurring paused frames) */}
      {!hasStartedOnce && !isEnded && (
        <div className="absolute inset-0 z-15 pointer-events-none overflow-hidden">
          <img
            src={`https://i.ytimg.com/vi/${cleanVideoId}/hqdefault.jpg`}
            alt={title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center"
          />
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

      {/* End-of-Video Screen (intercepts before YouTube end-screen links appear) */}
      {isEnded && (
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-0 z-30 bg-[#0b0914]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
        >
          <div className="relative z-10 flex flex-col items-center max-w-md">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base md:text-lg font-bold text-white">{title}</h3>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={startPlayback}
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

      {/* TOP SHADING — Synchronized with Bottom Shading (disappears and appears at the exact same moment) */}
      <div
        className={`absolute inset-x-0 top-0 h-20 z-30 bg-gradient-to-b from-[#06050a]/95 via-[#06050a]/55 to-transparent pointer-events-none transition-opacity duration-300 ${
          isMenuVisible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* BOTTOM SHADING + SMALL CONTROL BAR — Synchronized with Top Shading */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-[#06050a]/95 via-[#06050a]/80 to-transparent pt-10 pb-3.5 px-4 md:px-5 transition-opacity duration-300 ${
          isMenuVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Interactive Timeline Scrubber with Filled #3b82f6 Progress Bar matching Indicator */}
        <div className="relative flex items-center h-4 mb-2.5">
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

        <div className="flex items-center justify-between gap-3">
          {/* Left Controls: Small Play/Pause Button, -10s, +10s, Volume, Time */}
          <div className="flex items-center gap-2 md:gap-3">
            <button
              type="button"
              onClick={togglePlayPause}
              disabled={!isReady}
              className="w-9 h-9 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 cursor-pointer"
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
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              title="Voltar 10 segundos"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => skipSeconds(10)}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              title="Avançar 10 segundos"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Volume Control */}
            <div className="hidden sm:flex items-center gap-2 ml-1">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title={isMuted ? 'Ativar som' : 'Silenciar'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <div className="relative flex items-center w-16 h-4">
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

            {/* Tabular Timestamp */}
            <div className="text-xs font-mono tabular-nums text-slate-300 ml-1 whitespace-nowrap shrink-0">
              <span>{formatSeconds(currentTime)}</span>
              <span className="mx-1 text-slate-500">/</span>
              <span className="text-slate-400">{formatSeconds(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Speed Menu, Theater Mode, Fullscreen */}
          <div className="relative flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={toggleSpeedMenu}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSpeedMenuOpen
                    ? 'bg-[#2563eb] text-white'
                    : 'bg-white/10 hover:bg-white/15 text-slate-200'
                }`}
                title="Velocidade de reprodução"
              >
                {playbackRate}x
              </button>

              {isSpeedMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-24 rounded-xl bg-[#0d1527] border border-white/15 py-1.5 shadow-2xl z-50">
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
                className={`hidden lg:flex p-2 rounded-lg transition-colors shrink-0 cursor-pointer ${
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
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {isFullscreen ? (
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
