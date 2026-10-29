import React, { useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';
import {
  DetailedUploadError,
  R2_CORS_JSON_TEMPLATE,
  analyzeUploadError,
} from '../utils/r2Diagnostics';

interface UploadDiagnosticAlertProps {
  error: string | DetailedUploadError | null;
  onDismiss?: () => void;
}

export const UploadDiagnosticAlert: React.FC<UploadDiagnosticAlertProps> = ({
  error,
  onDismiss,
}) => {
  const [copiedCors, setCopiedCors] = useState(false);
  const [showFullGuide, setShowFullGuide] = useState(true);

  if (!error) return null;

  const diagnostic: DetailedUploadError =
    typeof error === 'string' ? analyzeUploadError(new Error(error)) : error;

  const handleCopyCors = async () => {
    try {
      await navigator.clipboard.writeText(R2_CORS_JSON_TEMPLATE);
      setCopiedCors(true);
      setTimeout(() => setCopiedCors(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/35 text-xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-300 text-xs leading-snug">
              {diagnostic.title}
            </p>
            <p className="text-[11px] text-rose-300/80 mt-0.5">
              Etapa do erro: <span className="font-mono">{diagnostic.stage}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowFullGuide((prev) => !prev)}
            className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3 h-3" />
            <span>{showFullGuide ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}</span>
            {showFullGuide ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="px-2 py-1 rounded-lg text-rose-300 hover:bg-rose-500/20 text-[11px] font-semibold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Technical error string */}
      <div className="p-2.5 rounded-lg bg-black/40 border border-rose-500/20 font-mono text-[11px] text-rose-200 break-all">
        Detalhe técnico: {diagnostic.technicalDetail}
      </div>

      {showFullGuide && (
        <div className="space-y-3 pt-1 border-t border-rose-500/20">
          <div>
            <p className="font-bold text-rose-200 mb-1">
              Por que esse erro aconteceu:
            </p>
            <ul className="space-y-1 text-[11px] text-ink-2 list-disc pl-4">
              {diagnostic.causes.map((cause, i) => (
                <li key={i}>{cause}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-bold text-emerald-300 mb-1">
              Como resolver agora (Passo a Passo):
            </p>
            <ul className="space-y-1 text-[11px] text-ink-2 list-none">
              {diagnostic.fixes.map((fix, i) => (
                <li key={i} className="leading-relaxed">
                  {fix}
                </li>
              ))}
            </ul>
          </div>

          {diagnostic.showCorsJson && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-ink-2">
                  JSON de CORS obrigatório para colar nos buckets R2 (Settings → CORS Policy):
                </span>
                <button
                  type="button"
                  onClick={handleCopyCors}
                  className="px-2.5 py-1 rounded-lg bg-brand hover:bg-brand-hover text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copiedCors ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiar JSON CORS</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-2.5 rounded-lg bg-black/50 border border-line text-[10px] font-mono text-emerald-300 overflow-x-auto">
                {R2_CORS_JSON_TEMPLATE}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
