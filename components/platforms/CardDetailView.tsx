'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCheck, ImageIcon, MessageCircle, Reply, Send, X } from '@/components/icons';
import { usePlatforms } from '@/hooks/usePlatforms';
import { CURRENT_USER } from '@/lib/data/seed';
import type { Card, Comment, Platform } from '@/lib/types';

export function CardDetailView({
  platform,
  card,
  fromComments,
  onClose,
}: {
  platform: Platform;
  card: Card;
  fromComments: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { sendComment, requestCard, approveCard, cancelRequest } = usePlatforms();

  const [isCardCollapsed, setIsCardCollapsed] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ sender: string; text: string } | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const commentScrollRef = useRef<HTMLDivElement>(null);

  const handleBack = () => {
    if (fromComments) {
      router.push('/comments');
    } else {
      onClose();
    }
  };

  const handleCommentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 40) {
      if (!isCardCollapsed) setIsCardCollapsed(true);
    } else if (isCardCollapsed) {
      setIsCardCollapsed(false);
    }
  };

  const handleSendComment = () => {
    sendComment(platform.id, card.id, commentInput, CURRENT_USER.name, replyingTo);
    setCommentInput('');
    setReplyingTo(null);
  };

  const handleApprove = () => approveCard(platform.id, card.id, CURRENT_USER.name);
  const handleCancel = () => cancelRequest(platform.id, card.id, CURRENT_USER.name);
  const handleSubmitRequest = () => {
    requestCard(platform.id, card.id, CURRENT_USER.name, platform.actionLabel || '');
    setShowRulesModal(false);
    setRulesAccepted(false);
  };

  return (
    <div className="absolute inset-0 bg-[#E4DDD6] z-40 flex flex-col animate-in slide-in-from-right-full duration-200">
      <div className="bg-white text-gray-800 px-2 py-1.5 flex justify-between items-center shadow-sm shrink-0 z-20 relative h-[52px]">
        <button onClick={handleBack} className="flex items-center gap-1.5 p-1.5 hover:bg-gray-100 rounded-xl transition text-gray-800">
          <ArrowRight size={22} className="text-gray-600" />
          <span className="font-bold text-[15px] pr-1">{fromComments ? 'مشارکت‌ها' : 'بازگشت'}</span>
        </button>

        {fromComments && (
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-[#527DA3] px-3 py-1.5 rounded-full transition max-w-[140px]"
          >
            <span className="text-[12px] font-bold truncate">{platform.name}</span>
            <ArrowRight size={14} className="shrink-0 rotate-180" />
          </button>
        )}
      </div>

      <div
        className={`bg-white border-t border-gray-100 shadow-sm px-4 shrink-0 z-10 border-r-4 border-r-amber-400 transition-all duration-300 overflow-hidden ${
          isCardCollapsed ? 'py-2 max-h-[44px] cursor-pointer hover:bg-amber-50/50' : 'py-3 max-h-[300px]'
        }`}
        onClick={() => isCardCollapsed && commentScrollRef.current && (commentScrollRef.current.scrollTop = 0)}
      >
        <div className="flex justify-between items-start mb-1.5">
          <h3
            className={`font-bold text-gray-900 transition-all duration-300 ${
              isCardCollapsed ? 'text-[14px] truncate leading-tight' : 'text-[15px] leading-snug'
            }`}
          >
            {card.title}
          </h3>
          {!isCardCollapsed && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 shrink-0">
              <span className="font-bold text-gray-600">{card.author}</span>
              <span>•</span>
              <span>{card.time}</span>
            </div>
          )}
        </div>
        <div className={`transition-all duration-300 ${isCardCollapsed ? 'opacity-0 h-0 pointer-events-none m-0' : 'opacity-100 h-auto'}`}>
          <p className="text-[13px] text-gray-700 leading-relaxed mb-2">{card.desc}</p>
          {card.hasImage && (
            <div className="w-full h-20 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200 mb-2">
              <ImageIcon size={20} className="text-gray-400" />
            </div>
          )}
        </div>
      </div>

      {card.author === CURRENT_USER.name && card.status === 'pending' && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm z-10 relative">
          <div className="text-[12px] text-amber-800 font-bold flex-1">{card.requester || 'یک نفر'} درخواست داده است.</div>
          <button onClick={handleApprove} className="bg-[#527DA3] hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-[12px] font-bold transition whitespace-nowrap shadow-sm">
            تایید و تحویل
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={commentScrollRef} onScroll={handleCommentScroll}>
        {card.comments.length === 0 ? (
          <div className="flex justify-center mt-10">
            <span className="bg-[#748EA5]/40 text-white text-[11px] px-3 py-1.5 rounded-full backdrop-blur-sm text-center">
              بسم‌الله! اولین نفری باشید که گره رو باز می‌کنه.
            </span>
          </div>
        ) : (
          card.comments.map((comment: Comment) => {
            if (comment.isSystem) {
              return (
                <div key={comment.id} className="flex justify-center my-2">
                  <span className="bg-[#748EA5]/10 text-[#527DA3] text-[11px] font-bold px-3 py-1.5 rounded-full text-center max-w-[85%] leading-relaxed border border-[#527DA3]/20">
                    {comment.text}
                  </span>
                </div>
              );
            }
            const isMe = comment.sender === CURRENT_USER.name;
            return (
              <div key={comment.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] p-2 px-3 pb-2 rounded-2xl text-[13px] shadow-sm relative group ${
                    isMe ? 'bg-[#EEFFDE] rounded-br-sm' : 'bg-white rounded-bl-sm'
                  }`}
                >
                  {comment.replyTo && (
                    <div className="bg-black/5 border-r-2 border-[#527DA3] pr-2 p-1.5 mb-1.5 mt-1 rounded-sm">
                      <p className="text-[10px] font-bold text-[#527DA3] mb-0.5">{comment.replyTo.sender}</p>
                      <p className="text-[11px] text-gray-600 truncate">{comment.replyTo.text}</p>
                    </div>
                  )}
                  {!isMe && <p className="text-[12px] font-bold text-[#527DA3] mt-1 mb-0.5">{comment.sender}</p>}
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className={`leading-relaxed text-gray-900 ${comment.isAction ? 'font-bold text-amber-700' : ''}`}>{comment.text}</p>
                    {comment.status && (
                      <span className="shrink-0 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-200 shadow-sm whitespace-nowrap">
                        {comment.status}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center gap-4 mt-2 border-t border-black/5 pt-1">
                    <button
                      onClick={() => setReplyingTo({ sender: comment.sender || '', text: comment.text })}
                      className="text-[11px] text-[#527DA3] font-medium flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded transition"
                    >
                      <Reply size={14} className="rtl:-scale-x-100" /> پاسخ
                    </button>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      {comment.time}
                      {isMe && <CheckCheck size={12} className="text-blue-500" />}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="bg-white shrink-0 flex flex-col border-t border-gray-200">
        {replyingTo && (
          <div className="bg-gray-50 flex items-center justify-between px-3 py-2 border-b border-gray-200">
            <div className="flex flex-col border-r-2 border-[#527DA3] pr-2 min-w-0">
              <span className="text-[11px] font-bold text-[#527DA3]">پاسخ به {replyingTo.sender}</span>
              <span className="text-[11px] text-gray-600 truncate max-w-[250px]">{replyingTo.text}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-gray-200 rounded-full text-gray-500 transition">
              <X size={16} />
            </button>
          </div>
        )}

        {platform.actionLabel && card.author !== CURRENT_USER.name && !card.status && (
          <div className="px-3 pt-3 pb-1">
            <button
              onClick={() => {
                setShowRulesModal(true);
                setRulesAccepted(false);
              }}
              className="w-full py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[14px] font-bold rounded-xl transition border border-amber-200 shadow-sm"
            >
              {platform.actionLabel}
            </button>
          </div>
        )}

        {platform.actionLabel && card.author !== CURRENT_USER.name && card.status === 'pending' && card.requester === CURRENT_USER.name && (
          <div className="px-3 pt-3 pb-1">
            <button onClick={handleCancel} className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-500 text-[14px] font-bold rounded-xl transition border border-red-100 shadow-sm">
              لغو درخواست
            </button>
          </div>
        )}

        {card.status === 'closed' && card.author !== CURRENT_USER.name && (
          <div className="px-3 pt-3 pb-1">
            <button className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-[#527DA3] text-[14px] font-bold rounded-xl transition border border-blue-100 shadow-sm flex items-center justify-center gap-2">
              <MessageCircle size={18} /> پیام شخصی به صاحب آگهی
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 px-2 py-2">
          <input
            type="text"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
            placeholder={platform.formLabels?.commentPlaceholder || 'پاسخ یا نظر خود را بنویسید...'}
            className="flex-1 min-w-0 bg-transparent py-2 px-2 focus:outline-none text-[14px] text-gray-800"
          />
          <button onClick={handleSendComment} className={`p-2 rounded-full transition shrink-0 ${commentInput.trim() ? 'text-[#527DA3] hover:bg-blue-50' : 'text-gray-300 pointer-events-none'}`}>
            <Send size={22} className="rtl:-scale-x-100" />
          </button>
        </div>
      </div>

      {showRulesModal && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="bg-[#527DA3] p-4 flex items-center justify-between text-white shrink-0">
              <h2 className="font-medium text-[16px]">قوانین و میثاق‌نامه</h2>
              <button onClick={() => setShowRulesModal(false)} className="hover:bg-white/10 rounded-full p-1.5 transition">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 text-[13px] text-gray-700 leading-relaxed text-justify space-y-3">
              <p>برادر/خواهر گرامی، با کلیک روی دکمه، شما متعهد می‌شوید که:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>قوانین بستر را به صورت کامل مطالعه کرده‌اید.</li>
                <li>در صورت عدم نیاز، فوراً درخواست خود را لغو کنید.</li>
                <li>اخلاق و ادب را در مراودات رعایت فرمایید.</li>
              </ul>
              <label className="flex items-center gap-2 mt-4 cursor-pointer bg-gray-50 p-3 rounded-xl border border-gray-200">
                <input type="checkbox" checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} className="w-4 h-4 rounded text-[#527DA3] focus:ring-[#527DA3]" />
                <span className="font-medium text-[13px] text-gray-800">قوانین را می‌پذیرم</span>
              </label>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button onClick={() => setShowRulesModal(false)} className="flex-1 py-2.5 rounded-xl font-medium text-gray-600 bg-white border border-gray-300 shadow-sm transition active:scale-95">
                انصراف
              </button>
              <button
                disabled={!rulesAccepted}
                onClick={handleSubmitRequest}
                className={`flex-1 py-2.5 rounded-xl font-bold shadow-sm transition active:scale-95 ${
                  rulesAccepted ? 'bg-[#527DA3] text-white' : 'bg-gray-200 text-gray-400 pointer-events-none'
                }`}
              >
                ثبت درخواست
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
