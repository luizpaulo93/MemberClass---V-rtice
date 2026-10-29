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
  Captions,
  X,
} from 'lucide-react';
import { extractYoutubeId, extractYoutubeChannelId } from '../types';
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
  isLiveStream?: boolean;
  onLiveVideoIdDetected?: (videoId: string) => void;
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
  isLiveStream = false,
  onLiveVideoIdDetected,
  onTimeUpdate,
}) => {
  const cleanChannelId = extractYoutubeChannelId(youtubeIdOrUrl);
  const cleanVideoId = extractYoutubeId(youtubeIdOrUrl);
  const initialIsLive = Boolean(
    isLiveStream ||
      cleanChannelId ||
      (youtubeIdOrUrl && youtubeIdOrUrl.includes('/live/'))
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mountNodeRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(initialIsLive);
  const [currentTime, setCurrentTime] = useState(() =>
    !initialIsLive && initialTimeSec > 2 ? initialTimeSec : 0
  );
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionToast, setCaptionToast] = useState<string | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<{
    side: 'left' | 'right';
    seconds: number;
    seq: number;
  } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFs, setIsPseudoFs] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  // Bottom controls start hidden before the video begins
  const [controlsVisible, setControlsVisible] = useState(false);

  const hideControlsTimer = useRef<number | null>(null);
  const captionToastTimerRef = useRef<number | null>(null);
  const captionSyncTimersRef = useRef<number[]>([]);
  const captionTracksCacheRef = useRef<any[]>([]);
  const mountedCcPolicyRef = useRef<number | null>(null);
  const seekFeedbackTimerRef = useRef<number | null>(null);
  const edgeClickRef = useRef<{
    side: 'left' | 'right' | null;
    lastTime: number;
    singleClickTimer: number | null;
    accumulatedSec: number;
  }>({
    side: null,
    lastTime: 0,
    singleClickTimer: null,
    accumulatedSec: 0,
  });

  const isPlayingRef = useRef(false);
  const isLiveModeRef = useRef(initialIsLive);
  const isSpeedMenuOpenRef = useRef(false);
  const controlsVisibleRef = useRef(false);
  const captionsEnabledRef = useRef(false);
  const playbackRateRef = useRef(playbackRate);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);
  const currentTimeRef = useRef(currentTime);
  const initialTimeRef = useRef(initialTimeSec);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onLiveVideoIdDetectedRef = useRef(onLiveVideoIdDetected);
  const lastReportedSecRef = useRef<number>(-1);
  const durationRef = useRef(0);
  const hasStartedOnceRef = useRef(false);
  const suppressInitialControlsRef = useRef(true);
  const suppressControlsUntilRef = useRef<number>(0);
  const isMountingPlayerRef = useRef(false);
  const isComponentMountedRef = useRef(true);

  useEffect(() => {
    setThumbLoaded(false);
  }, [thumbnailUrl]);

  useEffect(() => {
    initialTimeRef.current = initialTimeSec;
  }, [initialTimeSec]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    onLiveVideoIdDetectedRef.current = onLiveVideoIdDetected;
  }, [onLiveVideoIdDetected]);

  useEffect(() => {
    isLiveModeRef.current = isLiveMode;
  }, [isLiveMode]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isSpeedMenuOpenRef.current = isSpeedMenuOpen;
  }, [isSpeedMenuOpen]);

  useEffect(() => {
    controlsVisibleRef.current = controlsVisible;
  }, [controlsVisible]);

  useEffect(() => {
    captionsEnabledRef.current = captionsEnabled;
  }, [captionsEnabled]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const clearHideTimer = useCallback(() => {
    if (hideControlsTimer.current !== null) {
      window.clearTimeout(hideControlsTimer.current);
      hideControlsTimer.current = null;
    }
  }, []);

  const clearCaptionSyncTimers = useCallback(() => {
    if (captionSyncTimersRef.current.length > 0) {
      captionSyncTimersRef.current.forEach((id) => window.clearTimeout(id));
      captionSyncTimersRef.current = [];
    }
  }, []);

  const syncPlayerCaptions = useCallback(
    (targetPlayer: any, enabled: boolean) => {
      if (!targetPlayer) return;
      clearCaptionSyncTimers();
      try {
        if (enabled) {
          targetPlayer.loadModule?.('captions');
          targetPlayer.loadModule?.('cc');
          const applyCaptionTrack = () => {
            if (!captionsEnabledRef.current) return;
            try {
              targetPlayer.loadModule?.('captions');
              targetPlayer.loadModule?.('cc');
              const liveTracks =
                targetPlayer.getOption?.('captions', 'tracklist') ||
                targetPlayer.getOption?.('cc', 'tracklist');
              if (Array.isArray(liveTracks) && liveTracks.length > 0) {
                captionTracksCacheRef.current = liveTracks;
              }
              const tracks =
                (Array.isArray(liveTracks) && liveTracks.length > 0
                  ? liveTracks
                  : captionTracksCacheRef.current) || [];

              if (Array.isArray(tracks) && tracks.length > 0) {
                const preferred =
                  tracks.find(
                    (t: any) =>
                      t?.languageCode === 'pt' ||
                      t?.languageCode === 'pt-BR' ||
                      t?.languageCode === 'pt-PT' ||
                      String(t?.vss_id || '').includes('.pt') ||
                      String(t?.languageName || '')
                        .toLowerCase()
                        .includes('portugu')
                  ) || tracks[0];
                targetPlayer.setOption?.('captions', 'track', preferred);
                targetPlayer.setOption?.('cc', 'track', preferred);
              } else {
                targetPlayer.setOption?.('captions', 'track', {
                  languageCode: 'pt',
                });
                targetPlayer.setOption?.('cc', 'track', {
                  languageCode: 'pt',
                });
              }
            } catch {
              // ignore track selection errors
            }
          };
          applyCaptionTrack();
          [180, 450, 950, 1600].forEach((delay) => {
            const tId = window.setTimeout(applyCaptionTrack, delay);
            captionSyncTimersRef.current.push(tId);
          });
        } else {
          const liveTracks =
            targetPlayer.getOption?.('captions', 'tracklist') ||
            targetPlayer.getOption?.('cc', 'tracklist');
          if (Array.isArray(liveTracks) && liveTracks.length > 0) {
            captionTracksCacheRef.current = liveTracks;
          }
          targetPlayer.setOption?.('captions', 'track', {});
          targetPlayer.setOption?.('cc', 'track', {});
          targetPlayer.unloadModule?.('captions');
          targetPlayer.unloadModule?.('cc');
        }
      } catch {
        // ignore caption module errors
      }
    },
    [clearCaptionSyncTimers]
  );

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
    const nextIsLive = Boolean(
      isLiveStream ||
        cleanChannelId ||
        (youtubeIdOrUrl && youtubeIdOrUrl.includes('/live/'))
    );
    const resumeSec =
      !nextIsLive && initialTimeRef.current > 2
        ? Math.floor(initialTimeRef.current)
        : 0;
    setIsReady(false);
    setIsPlaying(false);
    setHasStartedOnce(false);
    hasStartedOnceRef.current = false;
    suppressInitialControlsRef.current = true;
    isMountingPlayerRef.current = false;
    mountedCcPolicyRef.current = null;
    captionTracksCacheRef.current = [];
    setIsEnded(false);
    setIsLiveMode(nextIsLive);
    isLiveModeRef.current = nextIsLive;
    setCurrentTime(resumeSec);
    currentTimeRef.current = resumeSec;
    setDuration(0);
    durationRef.current = 0;
    setIsSpeedMenuOpen(false);
    setControlsVisible(false);
    setSeekFeedback(null);
    lastReportedSecRef.current = -1;
    clearHideTimer();
    clearCaptionSyncTimers();

    if (mountNodeRef.current) {
      mountNodeRef.current.innerHTML = '';
    }

    // Warm up the YT IFrame API script (without embedding the video ID yet)
    loadYouTubeApi();

    return () => {
      isComponentMountedRef.current = false;
      clearHideTimer();
      clearCaptionSyncTimers();
      if (captionToastTimerRef.current !== null) {
        window.clearTimeout(captionToastTimerRef.current);
      }
      if (seekFeedbackTimerRef.current !== null) {
        window.clearTimeout(seekFeedbackTimerRef.current);
      }
      if (edgeClickRef.current.singleClickTimer !== null) {
        window.clearTimeout(edgeClickRef.current.singleClickTimer);
      }
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
  }, [
    cleanVideoId,
    cleanChannelId,
    isLiveStream,
    youtubeIdOrUrl,
    clearHideTimer,
    clearCaptionSyncTimers,
  ]);

  const inspectLiveMetadata = useCallback((targetPlayer: any) => {
    if (!targetPlayer || typeof targetPlayer.getVideoData !== 'function') return;
    try {
      const videoData = targetPlayer.getVideoData();
      if (videoData) {
        if (
          videoData.video_id &&
          typeof videoData.video_id === 'string' &&
          videoData.video_id !== 'live_stream'
        ) {
          onLiveVideoIdDetectedRef.current?.(videoData.video_id);
        }
        if (videoData.isLive || videoData.isLivePlayback) {
          if (!isLiveModeRef.current) {
            isLiveModeRef.current = true;
            setIsLiveMode(true);
          }
        }
      }
    } catch {
      // ignore metadata inspection errors
    }
  }, []);

  const mountAndStartPlayer = useCallback(
    (resumeSecOverride?: number, shouldAutoPlay = true) => {
      if (isMountingPlayerRef.current || playerRef.current) return;
      isMountingPlayerRef.current = true;

      const resumeSec =
        resumeSecOverride !== undefined
          ? Math.max(0, Math.floor(resumeSecOverride))
          : !isLiveModeRef.current && initialTimeRef.current > 2
          ? Math.floor(initialTimeRef.current)
          : 0;

      loadYouTubeApi().then(() => {
        if (!isComponentMountedRef.current || !mountNodeRef.current) return;

        mountNodeRef.current.innerHTML = '';
        const playerDiv = document.createElement('div');
        mountNodeRef.current.appendChild(playerDiv);

        const useChannelLiveStream = Boolean(
          cleanChannelId && cleanVideoId === cleanChannelId
        );
        const ccPolicy = captionsEnabledRef.current ? 1 : 0;
        mountedCcPolicyRef.current = ccPolicy;

        try {
          playerRef.current = new window.YT.Player(playerDiv, {
            videoId: useChannelLiveStream ? 'live_stream' : cleanVideoId,
            width: '100%',
            height: '100%',
            playerVars: {
              autoplay: shouldAutoPlay ? 1 : 0,
              controls: 0,
              disablekb: 1,
              fs: 0,
              iv_load_policy: 3,
              modestbranding: 1,
              rel: 0,
              showinfo: 0,
              playsinline: 1,
              hl: 'pt',
              cc_lang_pref: 'pt',
              cc_load_policy: ccPolicy,
              ...(useChannelLiveStream ? { channel: cleanChannelId } : {}),
              ...(!useChannelLiveStream && resumeSec > 0 ? { start: resumeSec } : {}),
            },
            events: {
              onApiChange: (event: any) => {
                if (!isComponentMountedRef.current) return;
                syncPlayerCaptions(event.target, captionsEnabledRef.current);
              },
              onReady: (event: any) => {
                if (!isComponentMountedRef.current) return;
                isMountingPlayerRef.current = false;
                setIsReady(true);
                inspectLiveMetadata(event.target);
                syncPlayerCaptions(event.target, captionsEnabledRef.current);
                const total = Number(event.target.getDuration?.() || 0);
                if (total > 0) {
                  durationRef.current = total;
                  setDuration(total);
                }
                try {
                  if (isMutedRef.current || volumeRef.current === 0) {
                    event.target.mute?.();
                  } else {
                    event.target.unMute?.();
                    event.target.setVolume?.(volumeRef.current || 100);
                  }
                  if (playbackRateRef.current !== 1) {
                    event.target.setPlaybackRate?.(playbackRateRef.current);
                  }
                  if (shouldAutoPlay) {
                    event.target.playVideo?.();
                    isPlayingRef.current = true;
                    setIsPlaying(true);
                    setHasStartedOnce(true);
                  } else {
                    if (resumeSec > 0) {
                      event.target.seekTo?.(resumeSec, true);
                    }
                    event.target.pauseVideo?.();
                    isPlayingRef.current = false;
                    setIsPlaying(false);
                    setHasStartedOnce(true);
                  }
                } catch {
                  // ignore
                }
              },
              onStateChange: (event: any) => {
                if (!isComponentMountedRef.current) return;
                const YTState = window.YT?.PlayerState;
                const state = event.data;

                inspectLiveMetadata(event.target);

                if (YTState && state === YTState.PLAYING) {
                  isPlayingRef.current = true;
                  hasStartedOnceRef.current = true;
                  setIsPlaying(true);
                  setHasStartedOnce(true);
                  setIsEnded(false);
                  syncPlayerCaptions(event.target, captionsEnabledRef.current);
                  const total = Number(event.target.getDuration?.() || 0);
                  if (total > 0) {
                    durationRef.current = total;
                    setDuration(total);
                  }
                  if (
                    suppressInitialControlsRef.current ||
                    Date.now() < suppressControlsUntilRef.current ||
                    !controlsVisibleRef.current
                  ) {
                    suppressInitialControlsRef.current = false;
                    controlsVisibleRef.current = false;
                    setControlsVisible(false);
                  } else {
                    scheduleHideIn3Seconds(true);
                  }
                } else if (YTState && state === YTState.PAUSED) {
                  isPlayingRef.current = false;
                  setIsPlaying(false);
                  clearHideTimer();
                  if (
                    hasStartedOnceRef.current &&
                    Date.now() >= suppressControlsUntilRef.current
                  ) {
                    controlsVisibleRef.current = true;
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
                isMountingPlayerRef.current = false;
                console.warn('YouTube Player notice (code):', event?.data);
              },
            },
          });
        } catch (err) {
          isMountingPlayerRef.current = false;
          console.warn('Erro ao inicializar YouTube Player:', err);
        }
      });
    },
    [
      cleanVideoId,
      cleanChannelId,
      clearHideTimer,
      scheduleHideIn3Seconds,
      inspectLiveMetadata,
      syncPlayerCaptions,
    ]
  );

  // Poll current time & intercept end-of-video BEFORE YouTube shows end-screen links
  useEffect(() => {
    if (!isReady) return;
    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;
      try {
        inspectLiveMetadata(player);
        const curr = Number(player.getCurrentTime() || 0);
        const total = Number(player.getDuration() || durationRef.current || 0);
        if (total > 0 && total !== durationRef.current) {
          durationRef.current = total;
          setDuration(total);
        }
        if (curr > 0 || hasStartedOnceRef.current) {
          currentTimeRef.current = curr;
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
        // IMPORTANT: Never trigger early end cutoff during a live stream
        if (
          !isLiveModeRef.current &&
          total > 3 &&
          curr >= total - 0.85 &&
          isPlayingRef.current
        ) {
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
  }, [isReady, clearHideTimer, inspectLiveMetadata]);

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
    currentTimeRef.current = newTime;
    setCurrentTime(newTime);
    setIsEnded(false);
    playerRef.current?.seekTo?.(newTime, true);
    scheduleHideIn3Seconds();
  };

  const skipSeconds = useCallback(
    (delta: number) => {
      const player = playerRef.current;
      if (!player || !isReady || isLiveModeRef.current) return;
      const liveCurr = Number(
        player.getCurrentTime?.() || currentTimeRef.current || 0
      );
      const maxDur = Number(
        player.getDuration?.() || durationRef.current || duration || 0
      );
      const upperBound = maxDur > 1 ? maxDur - 1 : liveCurr + Math.max(0, delta);
      const target = Math.max(0, Math.min(upperBound, liveCurr + delta));
      currentTimeRef.current = target;
      setCurrentTime(target);
      setIsEnded(false);
      player.seekTo?.(target, true);
    },
    [isReady, duration]
  );

  const triggerEdgeDoubleClickSeek = useCallback(
    (side: 'left' | 'right') => {
      if (!isReady || isLiveModeRef.current) return;
      suppressControlsUntilRef.current = Date.now() + 2200;
      clearHideTimer();
      setIsSpeedMenuOpen(false);
      isSpeedMenuOpenRef.current = false;
      controlsVisibleRef.current = false;
      setControlsVisible(false);

      const delta = side === 'left' ? -10 : 10;
      skipSeconds(delta);

      const nextAccum =
        edgeClickRef.current.side === side
          ? edgeClickRef.current.accumulatedSec + 10
          : 10;
      edgeClickRef.current.accumulatedSec = nextAccum;

      setSeekFeedback({
        side,
        seconds: nextAccum,
        seq: Date.now(),
      });

      if (seekFeedbackTimerRef.current !== null) {
        window.clearTimeout(seekFeedbackTimerRef.current);
      }
      seekFeedbackTimerRef.current = window.setTimeout(() => {
        setSeekFeedback(null);
        edgeClickRef.current.accumulatedSec = 0;
      }, 700);
    },
    [isReady, skipSeconds, clearHideTimer]
  );

  const handleVideoSurfacePointerClick = (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    if (isEnded) return;

    if (!hasStartedOnceRef.current) {
      startPlayback(true);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    const isLeftEdge = relX <= 0.28;
    const isRightEdge = relX >= 0.72;

    if (!isLiveModeRef.current && (isLeftEdge || isRightEdge)) {
      const side: 'left' | 'right' = isLeftEdge ? 'left' : 'right';
      const now = Date.now();
      const timeSinceLast = now - edgeClickRef.current.lastTime;

      if (edgeClickRef.current.side === side && timeSinceLast <= 380) {
        if (edgeClickRef.current.singleClickTimer !== null) {
          window.clearTimeout(edgeClickRef.current.singleClickTimer);
          edgeClickRef.current.singleClickTimer = null;
        }
        edgeClickRef.current.lastTime = now;
        triggerEdgeDoubleClickSeek(side);
        return;
      }

      edgeClickRef.current.side = side;
      edgeClickRef.current.lastTime = now;
      edgeClickRef.current.accumulatedSec = 0;

      if (edgeClickRef.current.singleClickTimer !== null) {
        window.clearTimeout(edgeClickRef.current.singleClickTimer);
      }
      edgeClickRef.current.singleClickTimer = window.setTimeout(() => {
        edgeClickRef.current.singleClickTimer = null;
        if (Date.now() < suppressControlsUntilRef.current) {
          return;
        }
        handleVideoSurfaceClick();
      }, 280);
      return;
    }

    handleVideoSurfaceClick();
  };

  const handleVideoSurfaceDoubleClick = (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    if (!isLiveModeRef.current && (relX <= 0.28 || relX >= 0.72)) {
      // Handled by edge double-click seek (-10s / +10s)
      return;
    }
    toggleFullscreen();
  };

  const toggleCaptions = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextEnabled = !captionsEnabled;
    setCaptionsEnabled(nextEnabled);
    captionsEnabledRef.current = nextEnabled;

    const currentPlayer = playerRef.current;
    if (currentPlayer) {
      if (nextEnabled && mountedCcPolicyRef.current !== 1) {
        let resumeAt = Math.floor(currentTimeRef.current || 0);
        const wasPlaying = isPlayingRef.current;
        try {
          const liveCurr = Number(currentPlayer.getCurrentTime?.() || 0);
          if (liveCurr > 0) {
            resumeAt = Math.floor(liveCurr);
            currentTimeRef.current = liveCurr;
            setCurrentTime(liveCurr);
          }
          currentPlayer.destroy?.();
        } catch {
          // ignore destroy error
        }
        playerRef.current = null;
        isMountingPlayerRef.current = false;
        mountAndStartPlayer(resumeAt, wasPlaying);
      } else {
        syncPlayerCaptions(currentPlayer, nextEnabled);
        if (!nextEnabled) {
          mountedCcPolicyRef.current = 0;
        }
      }
    }

    setCaptionToast(nextEnabled ? 'Legenda ativada' : 'Legenda desativada');
    if (captionToastTimerRef.current !== null) {
      window.clearTimeout(captionToastTimerRef.current);
    }
    captionToastTimerRef.current = window.setTimeout(() => {
      setCaptionToast(null);
    }, 1500);

    scheduleHideIn3Seconds(isPlaying, false);
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
    playbackRateRef.current = rate;
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
    hasStartedOnce && (isEnded || controlsVisible) && !isSpeedMenuOpen;

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
          className={`w-full pointer-events-none transition-all duration-200 ${
            captionsEnabled
              ? 'h-full mt-0'
              : 'h-[calc(100%+120px)] -mt-[60px] sm:h-[calc(100%+160px)] sm:-mt-[80px]'
          }`}
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

      {/* Impenetrable Stealth Click/Context Shield over 100% of the video (supports double-click on left/right edges for -10s/+10s) */}
      <div
        onClick={handleVideoSurfacePointerClick}
        onDoubleClick={handleVideoSurfaceDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute inset-0 z-20 cursor-pointer"
        aria-label={isPlaying ? 'Controle do vídeo' : 'Reproduzir aula'}
      />

      {/* Visual Feedback when student double-clicks left/right edge to seek -10s / +10s */}
      {seekFeedback && (
        <div
          key={seekFeedback.seq}
          className={`pointer-events-none absolute inset-y-0 z-30 flex items-center justify-center w-28 sm:w-36 ${
            seekFeedback.side === 'left'
              ? 'left-0 bg-gradient-to-r from-black/65 to-transparent rounded-r-full'
              : 'right-0 bg-gradient-to-l from-black/65 to-transparent rounded-l-full'
          }`}
        >
          <div className="flex flex-col items-center gap-1 text-white drop-shadow">
            <div className="w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center">
              {seekFeedback.side === 'left' ? (
                <RotateCcw className="w-5 h-5" />
              ) : (
                <RotateCw className="w-5 h-5" />
              )}
            </div>
            <span className="text-xs font-mono font-bold tabular-nums">
              {seekFeedback.side === 'left'
                ? `-${seekFeedback.seconds}s`
                : `+${seekFeedback.seconds}s`}
            </span>
          </div>
        </div>
      )}

      {/* Brief Caption Status Toast */}
      {captionToast && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-35 px-3.5 py-1.5 rounded-full bg-black/80 border border-white/15 text-white text-xs font-semibold backdrop-blur-sm shadow-lg">
          {captionToast}
        </div>
      )}

      {/* A1. Dynamic anti-piracy student watermark (visible in normal and fullscreen modes) */}
      <PlayerWatermark text={watermarkText || ''} />

      {/* Center Big Blue Play Button Overlay before video starts or when paused */}
      {!isPlaying && !isEnded && !isSpeedMenuOpen && (
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

      {/* Dedicated Speed Control Layer in Front of Video */}
      {isSpeedMenuOpen && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setIsSpeedMenuOpen(false);
            isSpeedMenuOpenRef.current = false;
            scheduleHideIn3Seconds(isPlaying, false);
          }}
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[270px] sm:max-w-xs rounded-2xl bg-[#0d1527]/95 border border-white/15 p-3 sm:p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-white/10">
              <span className="text-xs sm:text-sm font-bold text-white tracking-wide">
                Velocidade de reprodução
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsSpeedMenuOpen(false);
                  isSpeedMenuOpenRef.current = false;
                  scheduleHideIn3Seconds(isPlaying, false);
                }}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Fechar controle de velocidade"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {SPEED_OPTIONS.map((rate) => {
                const active = playbackRate === rate;
                return (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => selectPlaybackSpeed(rate)}
                    className={`py-2 px-2.5 rounded-xl text-xs sm:text-sm font-mono tabular-nums font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      active
                        ? 'bg-[#2563eb] text-white shadow-[0_0_14px_rgba(37,99,235,0.55)] ring-1 ring-blue-400/50'
                        : 'bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white border border-white/5'
                    }`}
                  >
                    <span>{rate}x</span>
                  </button>
                );
              })}
            </div>
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
          {/* Left Controls: Play/Pause, Volume, Time */}
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

            {/* Tabular Timestamp or Live Badge */}
            {isLiveMode ? (
              <button
                type="button"
                onClick={() => {
                  const player = playerRef.current;
                  if (!player) return;
                  try {
                    const liveEdge = Number(player.getDuration?.() || duration || 0);
                    if (liveEdge > 0) {
                      player.seekTo?.(liveEdge, true);
                      setCurrentTime(liveEdge);
                    }
                    player.playVideo?.();
                  } catch {
                    // ignore
                  }
                }}
                title="Pular para transmissão em tempo real"
                className="ml-1 px-2.5 py-1 rounded-md bg-rose-600/90 hover:bg-rose-600 text-white text-[11px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span>AO VIVO</span>
              </button>
            ) : (
              <div className="text-xs font-mono tabular-nums text-slate-300 ml-0.5 sm:ml-1 whitespace-nowrap shrink-0">
                <span>{formatSeconds(currentTime)}</span>
                <span className="max-[360px]:hidden">
                  <span className="mx-1 text-slate-500">/</span>
                  <span className="text-slate-400">{formatSeconds(duration)}</span>
                </span>
              </div>
            )}
          </div>

          {/* Right Controls: Captions (CC), Speed Menu, Theater Mode, Fullscreen */}
          <div className="relative flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleCaptions}
              aria-pressed={captionsEnabled}
              className={`h-10 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shrink-0 cursor-pointer ${
                captionsEnabled
                  ? 'bg-[#2563eb] text-white shadow-[0_0_12px_rgba(37,99,235,0.5)]'
                  : 'bg-white/10 hover:bg-white/15 text-slate-200'
              }`}
              title={captionsEnabled ? 'Desativar legenda' : 'Ativar legenda'}
            >
              <Captions className="w-4 h-4" />
              <span className="hidden sm:inline text-[11px] tracking-wide">
                Legenda
              </span>
            </button>

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
