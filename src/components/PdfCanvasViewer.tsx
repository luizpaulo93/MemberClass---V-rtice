import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  FileText,
} from 'lucide-react';
import {
  resolveWatermarkedPdfBytes,
  triggerPdfDownload,
  StudentPdfWatermarkInfo,
} from '../utils/pdfStorage';

interface PdfCanvasViewerProps {
  pdfUrl: string;
  title: string;
  watermarkInfo?: StudentPdfWatermarkInfo | null;
  onBack: () => void;
}

interface PdfPageCanvasProps {
  pdfDoc: any;
  pageNumber: number;
  containerWidth: number;
  zoom: number;
  onVisible: (pageNum: number) => void;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfDoc,
  pageNumber,
  containerWidth,
  zoom,
  onVisible,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [shouldRender, setShouldRender] = useState(pageNumber <= 3);
  const [aspectRatio, setAspectRatio] = useState(1.4142); // A4 default height/width

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldRender(true);
            if (entry.intersectionRatio >= 0.35) {
              onVisible(pageNumber);
            }
          }
        }
      },
      {
        rootMargin: '600px 0px',
        threshold: [0.01, 0.35, 0.7],
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, onVisible]);

  useEffect(() => {
    if (!shouldRender || !pdfDoc || containerWidth <= 0) return;

    let cancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const unscaledViewport = page.getViewport({ scale: 1 });
        const ratio =
          unscaledViewport.width > 0
            ? unscaledViewport.height / unscaledViewport.width
            : 1.4142;
        setAspectRatio(ratio);

        const targetCssWidth = Math.max(240, (containerWidth - 16) * zoom);
        const cssScale = targetCssWidth / unscaledViewport.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const renderViewport = page.getViewport({ scale: cssScale * dpr });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore
          }
        }

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(targetCssWidth)}px`;
        canvas.style.height = `${Math.floor(targetCssWidth * ratio)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const renderTask = page.render({
          canvasContext: ctx,
          viewport: renderViewport,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`Aviso ao renderizar página ${pageNumber}:`, err);
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [shouldRender, pdfDoc, pageNumber, containerWidth, zoom]);

  const targetCssWidth = Math.max(240, (containerWidth - 16) * zoom);
  const estimatedHeight = Math.round(targetCssWidth * aspectRatio);

  return (
    <div
      ref={wrapperRef}
      style={{
        minHeight: `${estimatedHeight}px`,
      }}
      className="flex items-center justify-center my-2.5"
    >
      {shouldRender ? (
        <canvas
          ref={canvasRef}
          className="rounded-lg shadow-card bg-white max-w-none block"
        />
      ) : (
        <div
          style={{
            width: `${targetCssWidth}px`,
            height: `${estimatedHeight}px`,
          }}
          className="rounded-lg bg-surface border border-line flex items-center justify-center text-xs text-ink-muted"
        >
          Página {pageNumber}
        </div>
      )}
    </div>
  );
};

export const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({
  pdfUrl,
  title,
  watermarkInfo,
  onBack,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(720);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFs, setIsPseudoFs] = useState(false);

  // Pinch-to-zoom state on mobile touch screens
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);

  useEffect(() => {
    let cancelled = false;
    let loadedDoc: any = null;

    setIsLoading(true);
    setLoadError(null);
    setPdfDoc(null);
    setNumPages(0);
    setCurrentPage(1);

    Promise.all([
      resolveWatermarkedPdfBytes(pdfUrl, watermarkInfo),
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
      .then(async ([bytes, pdfjsLib, workerMod]) => {
        if (cancelled) return;
        if (!bytes || bytes.length === 0) {
          setLoadError('Não foi possível carregar os dados deste PDF.');
          setIsLoading(false);
          return;
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
        const loadingTask = pdfjsLib.getDocument({
          data: bytes.slice(0),
        });
        const doc = await loadingTask.promise;
        if (cancelled) {
          (doc as any).destroy?.();
          return;
        }
        loadedDoc = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages || 1);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Erro ao abrir PDF com pdfjs:', err);
        if (!cancelled) {
          setLoadError(
            'Não foi possível exibir este PDF no leitor. Use o botão Baixar PDF.'
          );
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (loadedDoc && typeof loadedDoc.destroy === 'function') {
        try {
          loadedDoc.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfUrl, watermarkInfo]);

  // Measure available width for responsive 100% canvas sizing
  useEffect(() => {
    const updateWidth = () => {
      if (scrollContainerRef.current) {
        const w = scrollContainerRef.current.clientWidth;
        if (w > 0) {
          setContainerWidth(Math.min(w, 1024));
        }
      }
    };
    updateWidth();

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateWidth)
        : null;
    if (ro && scrollContainerRef.current) {
      ro.observe(scrollContainerRef.current);
    }
    window.addEventListener('resize', updateWidth);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [isFullscreen, isPseudoFs]);

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
    return () =>
      document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // CSS Pseudo-Fullscreen body scroll lock & Escape handler
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

  const toggleFullscreen = async () => {
    if (!rootRef.current) return;

    if (isPseudoFs) {
      setIsPseudoFs(false);
      try {
        (screen.orientation as any)?.unlock?.();
      } catch {
        // ignore
      }
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
      return;
    }

    if (typeof rootRef.current.requestFullscreen === 'function') {
      try {
        await rootRef.current.requestFullscreen();
      } catch {
        setIsPseudoFs(true);
      }
    } else {
      setIsPseudoFs(true);
    }
  };

  const handlePageVisible = useCallback((pageNum: number) => {
    setCurrentPage(pageNum);
  }, []);

  const changeZoom = (delta: number) => {
    setZoom((prev) =>
      Math.round(Math.min(2.5, Math.max(0.75, prev + delta)) * 100) / 100
    );
  };

  // Pinch-to-zoom handlers for mobile touch screens
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (pinchStartDistRef.current > 10) {
        const ratio = dist / pinchStartDistRef.current;
        const nextZoom = Math.min(
          2.5,
          Math.max(0.75, pinchStartZoomRef.current * ratio)
        );
        setZoom(Math.round(nextZoom * 100) / 100);
      }
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
  };

  const isAnyFullscreen = isFullscreen || isPseudoFs;

  return (
    <div
      ref={rootRef}
      className={
        isPseudoFs
          ? 'fixed inset-0 z-[200] w-screen h-[100dvh] bg-canvas flex flex-col overflow-hidden'
          : 'flex-1 w-full flex flex-col space-y-3'
      }
    >
      {/* Top Reader Toolbar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b border-line ${
          isAnyFullscreen
            ? 'px-3 sm:px-6 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] bg-surface'
            : 'pb-3'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => {
              if (isPseudoFs) {
                setIsPseudoFs(false);
              } else {
                onBack();
              }
            }}
            className="min-h-10 px-3 py-2 rounded-xl bg-chip hover:bg-chip-hover text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-brand-soft" />
            <span className="hidden sm:inline">Voltar</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-brand-soft shrink-0 hidden sm:block" />
            <h1 className="text-xs sm:text-sm md:text-base font-bold text-ink truncate">
              {title}
            </h1>
          </div>
        </div>

        {/* Page Counter, Zoom Controls, Fullscreen, and Watermarked Download */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {numPages > 0 && (
            <span className="px-2.5 py-1.5 rounded-lg bg-surface border border-line text-xs font-mono font-bold text-ink-2 tabular-nums">
              {currentPage} / {numPages}
            </span>
          )}

          <div className="inline-flex items-center rounded-xl bg-surface border border-line p-0.5">
            <button
              type="button"
              onClick={() => changeZoom(-0.2)}
              disabled={zoom <= 0.75}
              className="w-9 h-9 rounded-lg text-ink-2 hover:text-ink hover:bg-chip flex items-center justify-center disabled:opacity-40 transition-colors cursor-pointer"
              title="Reduzir zoom"
              aria-label="Reduzir zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-1.5 text-xs font-mono font-semibold text-ink-2 tabular-nums max-[360px]:hidden">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => changeZoom(0.2)}
              disabled={zoom >= 2.5}
              className="w-9 h-9 rounded-lg text-ink-2 hover:text-ink hover:bg-chip flex items-center justify-center disabled:opacity-40 transition-colors cursor-pointer"
              title="Ampliar zoom"
              aria-label="Ampliar zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-10 h-10 rounded-xl bg-surface hover:bg-chip border border-line text-ink-2 hover:text-ink flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            title={isAnyFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            aria-label={isAnyFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          >
            {isAnyFullscreen ? (
              <Minimize className="w-4 h-4" />
            ) : (
              <Maximize className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => triggerPdfDownload(pdfUrl, title, watermarkInfo)}
            className="min-h-10 px-3 sm:px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Baixar PDF"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Baixar PDF</span>
          </button>
        </div>
      </div>

      {/* Scrollable Canvas Pages Area */}
      <div
        ref={scrollContainerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`flex-1 overflow-auto bg-inset border border-line flex flex-col items-center px-2 py-3 ${
          isAnyFullscreen
            ? 'rounded-none pb-[max(1rem,env(safe-area-inset-bottom))]'
            : 'min-h-[75dvh] max-h-[82dvh] rounded-2xl'
        }`}
      >
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-ink-muted text-xs py-16">
            <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            <span>Preparando páginas do PDF...</span>
          </div>
        ) : loadError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
            <p className="text-xs sm:text-sm text-ink-2">{loadError}</p>
            <button
              type="button"
              onClick={() => triggerPdfDownload(pdfUrl, title, watermarkInfo)}
              className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Baixar PDF com identificação</span>
            </button>
          </div>
        ) : (
          pdfDoc &&
          Array.from({ length: numPages }, (_, idx) => (
            <PdfPageCanvas
              key={idx + 1}
              pdfDoc={pdfDoc}
              pageNumber={idx + 1}
              containerWidth={containerWidth}
              zoom={zoom}
              onVisible={handlePageVisible}
            />
          ))
        )}
      </div>
    </div>
  );
};
