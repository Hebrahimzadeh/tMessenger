'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, X } from '@/components/icons';
import { MESSAGE_BODY_MAX } from '@taavon/contracts';
import { findSensitiveData, type SensitiveFinding } from '@/lib/chat/sensitive-data';
import { SensitiveDataWarning } from './SensitiveDataWarning';

export interface ChatComposerProps {
  onSend: (body: string) => void;
  onTypingChange?: (typing: boolean) => void;
  replyingTo?: { id: string; body: string | null } | null;
  onCancelReply?: () => void;
  /**
   * Starting text. Changing it does not update a composer already on screen -
   * the room remounts this component with a new `key` when it wants to load a
   * draft, which is both simpler than syncing through an effect and correct
   * about the case that matters: it must never overwrite something the person
   * is halfway through typing.
   */
  initialText?: string;
  disabled?: boolean;
}

/** Typing stops being reported this long after the last keystroke. */
const TYPING_IDLE_MS = 2500;

/**
 * The composer: a growing text area pinned to the bottom, a send button that
 * only lights up with something to send, and the sensitive-data check between
 * the two.
 *
 * There is deliberately no "share my number" affordance anywhere here -
 * "هیچ contact خودکار". The only way a phone number reaches a message is that
 * a person typed it, and if they do, the warning below gives them the chance
 * to notice before it goes.
 */
export function ChatComposer({
  onSend,
  onTypingChange,
  replyingTo,
  onCancelReply,
  initialText = '',
  disabled,
}: ChatComposerProps) {
  const [text, setText] = useState(initialText);
  const [pendingFindings, setPendingFindings] = useState<SensitiveFinding[] | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActive = useRef(false);

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, []);

  function reportTyping(next: string) {
    if (!onTypingChange) return;
    const shouldBeTyping = next.trim().length > 0;

    if (shouldBeTyping && !typingActive.current) {
      typingActive.current = true;
      onTypingChange(true);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      if (typingActive.current) {
        typingActive.current = false;
        onTypingChange(false);
      }
    }, TYPING_IDLE_MS);
  }

  function stopTyping() {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (typingActive.current && onTypingChange) {
      typingActive.current = false;
      onTypingChange(false);
    }
  }

  function deliver(body: string) {
    onSend(body);
    setText('');
    setPendingFindings(null);
    stopTyping();
  }

  function attemptSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    // Checked once, on the way out. Typing is not interrupted while someone
    // is still composing, which is what keeps this a warning rather than a
    // nag.
    const findings = findSensitiveData(trimmed);
    if (findings.length > 0 && pendingFindings === null) {
      setPendingFindings(findings);
      return;
    }
    deliver(trimmed);
  }

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white">
      {replyingTo && (
        <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-1.5" data-testid="reply-preview">
          <div className="min-w-0 flex-1 border-r-2 border-[#527DA3] pr-2">
            <p className="text-[11px] font-medium text-[#527DA3]">پاسخ به</p>
            <p className="truncate text-[12px] text-gray-600">{replyingTo.body ?? 'پیام حذف شده'}</p>
          </div>
          <button type="button" onClick={onCancelReply} aria-label="لغو پاسخ" className="rounded-full p-1 hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>
      )}

      {pendingFindings && (
        <SensitiveDataWarning
          findings={pendingFindings}
          onEdit={() => {
            setPendingFindings(null);
            inputRef.current?.focus();
          }}
          onSendAnyway={() => deliver(text.trim())}
        />
      )}

      <div className="flex items-end gap-2 px-2 py-2">
        <textarea
          ref={inputRef}
          value={text}
          disabled={disabled}
          aria-label="پیام"
          placeholder="پیام..."
          rows={1}
          maxLength={MESSAGE_BODY_MAX}
          onChange={(event) => {
            setText(event.target.value);
            // A fresh edit retires a warning the person already answered.
            if (pendingFindings) setPendingFindings(null);
            reportTyping(event.target.value);
          }}
          onBlur={stopTyping}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              attemptSend();
            }
          }}
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl bg-gray-100 px-3 py-2 text-[15px] leading-relaxed text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#527DA3]/20"
        />
        <button
          type="button"
          onClick={attemptSend}
          disabled={!text.trim() || disabled}
          aria-label="ارسال"
          className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
            text.trim() && !disabled ? 'bg-[#527DA3] text-white' : 'bg-gray-200 text-gray-400'
          }`}
        >
          <Send size={18} className="rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
