'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CommentView } from '@taavon/contracts';
import { commentListResponseSchema, commentViewSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { renderPlainTextWithLinks } from '@/lib/linkify';
import { CommentComposer } from './CommentComposer';

export interface PublicThreadProps {
  cardId: string;
  /** Null/undefined for an anonymous visitor - reading is always public; writing still requires a session (the API 401s, surfaced via ApiError). */
  currentUserId?: string | null;
  /** The card's space creator/admin - may delete anyone's comment, per "edit history فقط owner/moderator طبق policy". */
  canModerate?: boolean;
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

function optimisticComment(cardId: string, authorId: string, body: string, parentId: string | null): CommentView {
  const now = new Date().toISOString();
  return {
    id: `optimistic-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    cardId,
    authorId,
    parentId,
    status: 'VISIBLE',
    body,
    revisionCount: 1,
    edited: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * "thread را با pagination و optimistic UI متصل کن" - every write (create/
 * edit/delete) updates local state immediately and only reconciles with
 * the server's response afterward, rolling back on failure. `nextCursor`
 * drives a simple "load more" rather than infinite scroll, matching the
 * API's own keyset pagination (`listComments`).
 */
export function PublicThread({ cardId, currentUserId = null, canModerate = false }: PublicThreadProps) {
  const [comments, setComments] = useState<CommentView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (cursor?: string) => {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const page = commentListResponseSchema.parse(await apiFetch(`/cards/${cardId}/comments${query}`));
      setComments((prev) => (cursor ? [...prev, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
    },
    [cardId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetchPage();
        if (!cancelled) setState({ status: 'ready' });
      } catch (err) {
        if (!cancelled) {
          setState({ status: 'error', message: err instanceof ApiError ? err.message : 'خطا در بارگذاری گفت‌وگو.' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(nextCursor);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'بارگذاری نظرهای بیشتر ممکن نشد.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleCreate(body: string, parentId: string | null) {
    if (!currentUserId) throw new ApiError(401, { code: 'SESSION_INVALID', message: 'برای ارسال نظر باید وارد شوید.', correlationId: 'client' });

    const optimistic = optimisticComment(cardId, currentUserId, body, parentId);
    setComments((prev) => [...prev, optimistic]);
    try {
      const created = commentViewSchema.parse(
        await apiFetch(`/cards/${cardId}/comments`, {
          method: 'POST',
          body: JSON.stringify(parentId ? { body, parentId } : { body }),
        })
      );
      setComments((prev) => prev.map((c) => (c.id === optimistic.id ? created : c)));
      setReplyTo(null);
    } catch (err) {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      throw err;
    }
  }

  async function handleEdit(commentId: string, body: string) {
    const previous = comments;
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, body, edited: true } : c)));
    try {
      const updated = commentViewSchema.parse(await apiFetch(`/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ body }) }));
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      setEditingId(null);
    } catch (err) {
      setComments(previous);
      throw err;
    }
  }

  async function handleDelete(commentId: string) {
    const previous = comments;
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, status: 'DELETED', body: null } : c)));
    try {
      await apiFetch(`/comments/${commentId}`, { method: 'DELETE' });
    } catch (err) {
      setComments(previous);
      setRowError(err instanceof ApiError ? err.message : 'حذف نظر ممکن نشد.');
    }
  }

  if (state.status === 'loading') {
    return (
      <p role="status" className="text-sm text-gray-500">
        در حال بارگذاری گفت‌وگو...
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-red-700">
        {state.message}
      </p>
    );
  }

  const topLevel = comments.filter((c) => c.parentId === null);
  const repliesOf = (parentId: string) => comments.filter((c) => c.parentId === parentId);

  function renderComment(comment: CommentView, depth: number) {
    const isMine = currentUserId !== null && comment.authorId === currentUserId;
    const canEdit = isMine && comment.status === 'VISIBLE';
    const canDelete = (isMine || canModerate) && comment.status === 'VISIBLE';

    return (
      <li key={comment.id} className={depth > 0 ? 'mr-6 border-r border-gray-200 pr-3' : ''}>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          {comment.status === 'DELETED' || comment.body === null ? (
            <p className="text-sm italic text-gray-400">این نظر حذف شده است.</p>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm text-gray-900">{renderPlainTextWithLinks(comment.body)}</p>
              {comment.edited && <span className="text-xs text-gray-400"> (ویرایش‌شده)</span>}
            </>
          )}

          {comment.status === 'VISIBLE' && (
            <div className="mt-2 flex gap-3 text-xs text-blue-700">
              <button type="button" onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>
                پاسخ
              </button>
              {canEdit && (
                <button type="button" onClick={() => setEditingId(editingId === comment.id ? null : comment.id)}>
                  ویرایش
                </button>
              )}
              {canDelete && (
                <button type="button" className="text-red-600" onClick={() => handleDelete(comment.id)}>
                  حذف
                </button>
              )}
            </div>
          )}

          {editingId === comment.id && (
            <div className="mt-2">
              <CommentComposer
                submitLabel="ذخیرهٔ ویرایش"
                onSubmit={(body) => handleEdit(comment.id, body)}
                autoFocus
              />
            </div>
          )}

          {replyTo === comment.id && (
            <div className="mt-2">
              <CommentComposer onSubmit={(body) => handleCreate(body, comment.id)} autoFocus />
            </div>
          )}
        </div>

        {repliesOf(comment.id).length > 0 && (
          <ul className="mt-2 space-y-2">{repliesOf(comment.id).map((reply) => renderComment(reply, depth + 1))}</ul>
        )}
      </li>
    );
  }

  return (
    <div dir="rtl" className="space-y-4 text-right">
      <CommentComposer onSubmit={(body) => handleCreate(body, null)} />

      {rowError && (
        <p role="alert" className="text-sm text-red-700">
          {rowError}
        </p>
      )}

      {topLevel.length === 0 ? (
        <p className="text-sm text-gray-500">هنوز نظری ثبت نشده است. اولین نفر باشید.</p>
      ) : (
        <ul className="space-y-3">{topLevel.map((comment) => renderComment(comment, 0))}</ul>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full rounded-xl border border-gray-200 py-2 text-sm text-gray-600 disabled:opacity-50"
        >
          {loadingMore ? 'در حال بارگذاری...' : 'نمایش نظرهای بیشتر'}
        </button>
      )}
    </div>
  );
}
