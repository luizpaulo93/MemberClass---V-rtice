import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Heart,
  ImagePlus,
  MessageCircle,
  Send,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  Doubt,
  DoubtReply,
  processDoubtPhotoFile,
  sanitizeString,
} from '../types';

interface DuvidasWindowProps {
  doubts: Doubt[];
  replies: DoubtReply[];
  currentUserUid: string;
  currentUserName: string;
  currentUserPhotoUrl: string;
  isAdmin: boolean;
  onCreateDoubt: (text: string, imageUrl: string) => Promise<void>;
  onToggleLikeDoubt: (doubt: Doubt) => Promise<void>;
  onToggleResolveDoubt: (doubt: Doubt) => Promise<void>;
  onDeleteDoubt: (doubtId: string) => Promise<void>;
  onCreateReply: (
    doubtId: string,
    text: string,
    imageUrl: string
  ) => Promise<void>;
  onDeleteReply: (replyId: string) => Promise<void>;
}

function formatRelativeDate(ms: number): string {
  if (!ms) return 'Agora';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'Agora mesmo';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `há ${diffDays}d`;
  return new Date(ms).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

export const DuvidasWindow: React.FC<DuvidasWindowProps> = ({
  doubts,
  replies,
  currentUserUid,
  currentUserName,
  currentUserPhotoUrl,
  isAdmin,
  onCreateDoubt,
  onToggleLikeDoubt,
  onToggleResolveDoubt,
  onDeleteDoubt,
  onCreateReply,
  onDeleteReply,
}) => {
  // Active doubt opened in dedicated detail & comments window
  const [selectedDoubtId, setSelectedDoubtId] = useState<string | null>(null);

  // New Doubt Composer State
  const [newText, setNewText] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [isUploadingNewPhoto, setIsUploadingNewPhoto] = useState(false);
  const [isSubmittingDoubt, setIsSubmittingDoubt] = useState(false);
  const newPhotoInputRef = useRef<HTMLInputElement>(null);

  // Reply Composer State inside the opened doubt window
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replyImages, setReplyImages] = useState<Record<string, string>>({});
  const [uploadingReplyForId, setUploadingReplyForId] = useState<string | null>(
    null
  );
  const [submittingReplyForId, setSubmittingReplyForId] = useState<
    string | null
  >(null);
  const replyFileInputRefs = useRef<Record<string, HTMLInputElement | null>>(
    {}
  );

  // Fullscreen image zoom modal state
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  // Map replies by doubtId sorted oldest -> newest
  const repliesByDoubtId = useMemo(() => {
    const map: Record<string, DoubtReply[]> = {};
    for (const r of replies) {
      if (!map[r.doubtId]) {
        map[r.doubtId] = [];
      }
      map[r.doubtId].push(r);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
    }
    return map;
  }, [replies]);

  const orderedDoubts = useMemo(() => {
    const getPriorityGroup = (d: Doubt): number => {
      if (d.isResolved) return 2;
      const count = repliesByDoubtId[d.id]?.length || 0;
      return count === 0 ? 0 : 1;
    };

    return [...doubts].sort((a, b) => {
      const groupA = getPriorityGroup(a);
      const groupB = getPriorityGroup(b);
      if (groupA !== groupB) return groupA - groupB;
      return (a.createdAtMs || 0) - (b.createdAtMs || 0);
    });
  }, [doubts, repliesByDoubtId]);

  const activeDoubt = useMemo(
    () => doubts.find((d) => d.id === selectedDoubtId) || null,
    [doubts, selectedDoubtId]
  );

  const handleSelectNewDoubtPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingNewPhoto(true);
    try {
      const dataUrl = await processDoubtPhotoFile(file, 1280);
      setNewImageUrl(dataUrl);
    } catch (err) {
      console.error('Erro ao processar foto da dúvida:', err);
    } finally {
      setIsUploadingNewPhoto(false);
      e.target.value = '';
    }
  };

  const handlePublishDoubt = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newText.trim();
    if ((!trimmed && !newImageUrl) || isSubmittingDoubt || isUploadingNewPhoto) {
      return;
    }
    setIsSubmittingDoubt(true);
    try {
      await onCreateDoubt(sanitizeString(trimmed, 2000, ''), newImageUrl);
      setNewText('');
      setNewImageUrl('');
    } finally {
      setIsSubmittingDoubt(false);
    }
  };

  const handleSelectReplyPhoto = async (
    doubtId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReplyForId(doubtId);
    try {
      const dataUrl = await processDoubtPhotoFile(file, 1280);
      setReplyImages((prev) => ({ ...prev, [doubtId]: dataUrl }));
    } catch (err) {
      console.error('Erro ao processar foto da resposta:', err);
    } finally {
      setUploadingReplyForId(null);
      e.target.value = '';
    }
  };

  const handlePublishReply = async (doubtId: string, e: React.FormEvent) => {
    e.preventDefault();
    const textVal = (replyTexts[doubtId] || '').trim();
    const imgVal = replyImages[doubtId] || '';
    if (
      (!textVal && !imgVal) ||
      submittingReplyForId === doubtId ||
      uploadingReplyForId === doubtId
    ) {
      return;
    }
    setSubmittingReplyForId(doubtId);
    try {
      await onCreateReply(doubtId, sanitizeString(textVal, 2000, ''), imgVal);
      setReplyTexts((prev) => ({ ...prev, [doubtId]: '' }));
      setReplyImages((prev) => {
        const next = { ...prev };
        delete next[doubtId];
        return next;
      });
    } finally {
      setSubmittingReplyForId(null);
    }
  };

  return (
    <section className="max-w-2xl mx-auto py-3">
      {/* DEDICATED DOUBT & COMMENTS WINDOW (OPENED WHEN CLICKING A DOUBT) */}
      {activeDoubt ? (
        (() => {
          const cardReplies = repliesByDoubtId[activeDoubt.id] || [];
          const isLiked = (activeDoubt.likedBy || []).includes(currentUserUid);
          const likeCount = (activeDoubt.likedBy || []).length;
          const isOwner = activeDoubt.authorId === currentUserUid;
          const canManage = isOwner || isAdmin;
          const draftReplyText = replyTexts[activeDoubt.id] || '';
          const draftReplyImg = replyImages[activeDoubt.id] || '';
          const isUploadingThisReply = uploadingReplyForId === activeDoubt.id;
          const isSubmittingThisReply = submittingReplyForId === activeDoubt.id;

          return (
            <div className="space-y-5">
              {/* Top Navigation Bar */}
              <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setSelectedDoubtId(null)}
                  className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-200 hover:text-white transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-[#3b82f6]" />
                  <span>Voltar para Dúvidas</span>
                </button>

                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteDoubt(activeDoubt.id);
                      setSelectedDoubtId(null);
                    }}
                    className="p-2 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Excluir dúvida"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Full Doubt Post (Social-network style, unboxed) */}
              <article className="space-y-4 pb-5 border-b border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {activeDoubt.authorPhotoUrl ? (
                      <img
                        src={activeDoubt.authorPhotoUrl}
                        alt={activeDoubt.authorName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-white/15 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#2563eb]/30 border border-[#3b82f6]/40 text-blue-200 flex items-center justify-center text-xs font-extrabold shrink-0">
                        {(activeDoubt.authorName || 'A')[0].toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm font-extrabold text-white truncate">
                          {activeDoubt.authorName}
                        </h2>
                        {activeDoubt.isResolved && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Dúvida Sanada
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium">
                        {formatRelativeDate(activeDoubt.createdAtMs)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleLikeDoubt(activeDoubt)}
                      className={`h-8 px-3 rounded-full border text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer tabular-nums ${
                        isLiked
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
                      }`}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          isLiked ? 'fill-current text-rose-400' : ''
                        }`}
                      />
                      <span>{likeCount}</span>
                    </button>
                  </div>
                </div>

                {activeDoubt.text && (
                  <p className="text-sm sm:text-[15px] text-slate-100 font-medium leading-relaxed whitespace-pre-line">
                    {activeDoubt.text}
                  </p>
                )}

                {activeDoubt.imageUrl && (
                  <div
                    onClick={() => setZoomedImageUrl(activeDoubt.imageUrl)}
                    className="group relative rounded-2xl overflow-hidden bg-[#070b14] border border-white/10 max-h-[480px] flex items-center justify-center cursor-zoom-in"
                  >
                    <img
                      src={activeDoubt.imageUrl}
                      alt="Foto da dúvida"
                      className="max-h-[480px] w-auto object-contain"
                    />
                    <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/75 border border-white/15 text-[11px] font-semibold text-slate-200 inline-flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                      <ZoomIn className="w-3.5 h-3.5 text-blue-300" />
                      <span>Ampliar</span>
                    </div>
                  </div>
                )}

                {canManage && (
                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => onToggleResolveDoubt(activeDoubt)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 border transition-all cursor-pointer ${
                        activeDoubt.isResolved
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                          : 'bg-white/5 hover:bg-emerald-500/15 border-white/10 hover:border-emerald-500/35 text-slate-300 hover:text-emerald-300'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {activeDoubt.isResolved
                          ? 'Dúvida Sanada (Reabrir)'
                          : 'Marcar como Dúvida Sanada'}
                      </span>
                    </button>
                  </div>
                )}
              </article>

              {/* Reply Composer inside Dedicated Doubt Window */}
              <form
                onSubmit={(e) => handlePublishReply(activeDoubt.id, e)}
                className="space-y-2.5"
              >
                {draftReplyImg && (
                  <div className="relative rounded-xl overflow-hidden bg-[#070b14] border border-white/10 max-h-56 flex items-center justify-center">
                    <img
                      src={draftReplyImg}
                      alt="Prévia da resposta"
                      className="max-h-56 w-auto object-contain"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setReplyImages((prev) => {
                          const next = { ...prev };
                          delete next[activeDoubt.id];
                          return next;
                        })
                      }
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center border border-white/15 cursor-pointer"
                      title="Remover foto"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    ref={(el) => {
                      replyFileInputRefs.current[activeDoubt.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSelectReplyPhoto(activeDoubt.id, e)}
                    className="hidden"
                  />

                  <button
                    type="button"
                    disabled={isUploadingThisReply}
                    onClick={() =>
                      replyFileInputRefs.current[activeDoubt.id]?.click()
                    }
                    className="h-10 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                    title="Enviar foto com a resolução"
                  >
                    <ImagePlus className="w-4 h-4 text-[#60a5fa]" />
                    <span className="hidden sm:inline">
                      {isUploadingThisReply ? 'Foto...' : 'Foto'}
                    </span>
                  </button>

                  <input
                    type="text"
                    maxLength={2000}
                    value={draftReplyText}
                    onChange={(e) =>
                      setReplyTexts((prev) => ({
                        ...prev,
                        [activeDoubt.id]: e.target.value,
                      }))
                    }
                    placeholder="Escreva um comentário ou envie foto da resolução..."
                    className="flex-1 min-w-0 h-10 px-3.5 rounded-xl bg-[#0d1527] border border-white/10 text-xs sm:text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3b82f6]"
                  />

                  <button
                    type="submit"
                    disabled={
                      (!draftReplyText.trim() && !draftReplyImg) ||
                      isSubmittingThisReply ||
                      isUploadingThisReply
                    }
                    className="h-10 px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Responder</span>
                  </button>
                </div>
              </form>

              {/* Comments List in Clean, Space-Efficient Rectangles */}
              <div className="space-y-2.5 pt-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Comentários ({cardReplies.length})
                </h3>

                {cardReplies.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    Nenhum comentário ainda. Seja o primeiro a ajudar acima!
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {cardReplies.map((reply) => {
                      const canDeleteReply =
                        reply.authorId === currentUserUid || isAdmin;
                      return (
                        <div
                          key={reply.id}
                          className="p-3 sm:p-3.5 rounded-2xl bg-[#141220] border border-white/10 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {reply.authorPhotoUrl ? (
                                <img
                                  src={reply.authorPhotoUrl}
                                  alt={reply.authorName}
                                  referrerPolicy="no-referrer"
                                  className="w-6 h-6 rounded-full object-cover border border-white/15 shrink-0"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-[#2563eb]/30 text-blue-200 flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {(reply.authorName || 'A')[0].toUpperCase()}
                                </div>
                              )}
                              <span className="text-xs font-bold text-white truncate">
                                {reply.authorName}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                •
                              </span>
                              <span className="text-[11px] text-slate-400 font-medium shrink-0">
                                {formatRelativeDate(reply.createdAtMs)}
                              </span>
                            </div>

                            {canDeleteReply && (
                              <button
                                type="button"
                                onClick={() => onDeleteReply(reply.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                                title="Excluir comentário"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {reply.text && (
                            <p className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed whitespace-pre-line">
                              {reply.text}
                            </p>
                          )}

                          {reply.imageUrl && (
                            <div
                              onClick={() => setZoomedImageUrl(reply.imageUrl)}
                              className="group relative rounded-xl overflow-hidden bg-[#070b14] border border-white/10 max-h-72 flex items-center justify-center cursor-zoom-in"
                            >
                              <img
                                src={reply.imageUrl}
                                alt="Foto da resolução"
                                className="max-h-72 w-auto object-contain"
                              />
                              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/75 border border-white/15 text-[10px] font-semibold text-slate-200 inline-flex items-center gap-1">
                                <ZoomIn className="w-3 h-3 text-blue-300" />
                                <span>Ampliar</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()
      ) : (
        /* MAIN SOCIAL FEED OF DOUBTS (UNBOXED WITH CLEAN SEPARATORS) */
        <div>
          {/* Header (Subtitle removed as requested) */}
          <div className="pb-4">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Comunidade de Dúvidas
            </h1>
          </div>

          {/* Unboxed Social Composer separated by bottom divider */}
          <form
            onSubmit={handlePublishDoubt}
            className="pb-5 border-b border-white/10 space-y-3"
          >
            <div className="flex items-start gap-3">
              {currentUserPhotoUrl ? (
                <img
                  src={currentUserPhotoUrl}
                  alt={currentUserName}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border border-white/15 shrink-0 mt-0.5"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-sm font-extrabold shrink-0 mt-0.5">
                  {(currentUserName || 'A')[0].toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Qual é a sua dúvida? Escreva aqui ou anexe uma foto da questão..."
                  className="w-full rounded-2xl bg-[#0d1527] border border-white/10 px-4 py-3 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3b82f6] resize-none"
                />
              </div>
            </div>

            {newImageUrl && (
              <div className="relative rounded-2xl overflow-hidden bg-[#070b14] border border-white/10 max-h-80 flex items-center justify-center">
                <img
                  src={newImageUrl}
                  alt="Prévia da dúvida"
                  className="max-h-80 w-auto object-contain"
                />
                <button
                  type="button"
                  onClick={() => setNewImageUrl('')}
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center border border-white/15 transition-colors cursor-pointer"
                  title="Remover foto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2.5 pl-0 sm:pl-13">
              <input
                ref={newPhotoInputRef}
                type="file"
                accept="image/*"
                onChange={handleSelectNewDoubtPhoto}
                className="hidden"
              />

              <button
                type="button"
                disabled={isUploadingNewPhoto}
                onClick={() => newPhotoInputRef.current?.click()}
                className="px-3.5 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-4 h-4 text-[#60a5fa] shrink-0" />
                <span>
                  {isUploadingNewPhoto
                    ? 'Carregando...'
                    : newImageUrl
                      ? 'Trocar foto'
                      : 'Adicionar foto'}
                </span>
              </button>

              <button
                type="submit"
                disabled={
                  (!newText.trim() && !newImageUrl) ||
                  isSubmittingDoubt ||
                  isUploadingNewPhoto
                }
                className="px-5 py-2 rounded-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold shadow-[0_4px_18px_rgba(37,99,235,0.4)] inline-flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isSubmittingDoubt ? 'Publicando...' : 'Publicar Dúvida'}
                </span>
              </button>
            </div>
          </form>

          {/* Social Feed List with Horizontal Dividers Between Doubts */}
          {orderedDoubts.length === 0 ? (
            <div className="py-16 px-4 text-center space-y-2">
              <MessageCircle className="w-8 h-8 text-[#3b82f6] mx-auto opacity-80" />
              <p className="text-sm font-bold text-white">
                Nenhuma dúvida publicada ainda
              </p>
              <p className="text-xs text-slate-400 font-medium">
                Seja o primeiro a mandar uma foto ou pergunta acima!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {orderedDoubts.map((doubt) => {
                const cardReplies = repliesByDoubtId[doubt.id] || [];
                const isLiked = (doubt.likedBy || []).includes(currentUserUid);
                const likeCount = (doubt.likedBy || []).length;
                const isOwner = doubt.authorId === currentUserUid;
                const canManage = isOwner || isAdmin;

                return (
                  <article
                    key={doubt.id}
                    onClick={() => setSelectedDoubtId(doubt.id)}
                    className="py-5 space-y-3.5 hover:bg-white/[0.015] transition-colors cursor-pointer"
                  >
                    {/* Author Row + Like & Delete */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {doubt.authorPhotoUrl ? (
                          <img
                            src={doubt.authorPhotoUrl}
                            alt={doubt.authorName}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-full object-cover border border-white/15 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[#2563eb]/30 border border-[#3b82f6]/40 text-blue-200 flex items-center justify-center text-xs font-extrabold shrink-0">
                            {(doubt.authorName || 'A')[0].toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xs sm:text-sm font-extrabold text-white truncate">
                              {doubt.authorName}
                            </h3>
                            <span className="text-[11px] text-slate-500">•</span>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {formatRelativeDate(doubt.createdAtMs)}
                            </span>
                            {doubt.isResolved && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Dúvida Sanada
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {canManage && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteDoubt(doubt.id);
                          }}
                          className="p-1.5 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                          title="Excluir dúvida"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Full Doubt Text & Photo */}
                    {doubt.text && (
                      <p className="text-sm text-slate-100 font-medium leading-relaxed whitespace-pre-line">
                        {doubt.text}
                      </p>
                    )}

                    {doubt.imageUrl && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomedImageUrl(doubt.imageUrl);
                        }}
                        className="group relative rounded-2xl overflow-hidden bg-[#070b14] border border-white/10 max-h-[420px] flex items-center justify-center cursor-zoom-in"
                      >
                        <img
                          src={doubt.imageUrl}
                          alt="Foto da dúvida"
                          className="max-h-[420px] w-auto object-contain"
                        />
                        <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/75 border border-white/15 text-[11px] font-semibold text-slate-200 inline-flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                          <ZoomIn className="w-3.5 h-3.5 text-blue-300" />
                          <span>Ampliar</span>
                        </div>
                      </div>
                    )}

                    {/* Social Action Row: Like + Collapsed Comments Indicator + Sanada Toggle */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLikeDoubt(doubt);
                          }}
                          className={`h-8 px-3 rounded-full border text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer tabular-nums ${
                            isLiked
                              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                              : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${
                              isLiked ? 'fill-current text-rose-400' : ''
                            }`}
                          />
                          <span>{likeCount}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDoubtId(doubt.id);
                          }}
                          className="h-8 px-3.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer tabular-nums"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-[#60a5fa]" />
                          <span>
                            {cardReplies.length === 0
                              ? 'Comentar'
                              : `${cardReplies.length} comentário${cardReplies.length > 1 ? 's' : ''}`}
                          </span>
                        </button>
                      </div>

                      {canManage && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleResolveDoubt(doubt);
                          }}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 border transition-all cursor-pointer ${
                            doubt.isResolved
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-white/5 hover:bg-emerald-500/15 border-white/10 text-slate-300 hover:text-emerald-300'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {doubt.isResolved
                              ? 'Dúvida Sanada'
                              : 'Marcar como Sanada'}
                          </span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Fullscreen Image Lightbox Modal */}
      {zoomedImageUrl && (
        <div
          onClick={() => setZoomedImageUrl(null)}
          className="stealth-player-dark fixed inset-0 z-[90] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
        >
          <button
            type="button"
            onClick={() => setZoomedImageUrl(null)}
            className="fixed top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Fechar imagem"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={zoomedImageUrl}
            alt="Visualização ampliada"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl cursor-default"
          />
        </div>
      )}
    </section>
  );
};

