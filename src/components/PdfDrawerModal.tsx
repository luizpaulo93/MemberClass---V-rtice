import React from 'react';
import { X, Download, FileText, ExternalLink } from 'lucide-react';
import { PdfAttachment } from '../types';

interface PdfDrawerModalProps {
  pdf: PdfAttachment | null;
  onClose: () => void;
}

export const PdfDrawerModal: React.FC<PdfDrawerModalProps> = ({ pdf, onClose }) => {
  if (!pdf) return null;

  const isDataUrl = pdf.url.startsWith('data:application/pdf');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#12101b] border border-white/10 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#2563eb]/20 text-blue-300 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">{pdf.title}</h3>
              <p className="text-xs text-slate-400 font-mono tabular-nums">{pdf.sizeLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={pdf.url}
              download={`${pdf.title.replace(/\s+/g, '_')}.pdf`}
              target={isDataUrl ? undefined : '_blank'}
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              {isDataUrl ? (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Baixar PDF
                </>
              ) : (
                <>
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir / Baixar PDF
                </>
              )}
            </a>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Fechar leitor de PDF"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewer Body */}
        <div className="flex-1 bg-[#09080f] relative overflow-hidden flex items-center justify-center">
          <iframe
            src={pdf.url}
            title={pdf.title}
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
};
