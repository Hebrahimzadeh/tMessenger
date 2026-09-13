'use client';

import { useEffect, useRef } from 'react';

export interface ChatContextMenuAction {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export interface ChatContextMenuProps {
  actions: ChatContextMenuAction[];
  onClose: () => void;
}

/**
 * The long-press menu on a message. A sheet rather than a floating popover:
 * at 360px a popover anchored to a bubble ends up half off-screen or covering
 * the message it belongs to, and a sheet is also the easier target for a
 * thumb. Escape and a tap outside both close it, and focus moves into the
 * sheet so the keyboard path works too.
 */
export function ChatContextMenu({ actions, onClose }: ChatContextMenuProps) {
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-50 flex items-end" data-testid="context-menu">
      <button type="button" aria-label="بستن" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div role="menu" className="relative w-full rounded-t-2xl bg-white p-2 shadow-lg">
        {actions.map((action, index) => (
          <button
            key={action.id}
            ref={index === 0 ? firstRef : undefined}
            role="menuitem"
            type="button"
            onClick={() => {
              action.onSelect();
              onClose();
            }}
            className={`w-full rounded-xl px-4 py-3 text-right text-[15px] hover:bg-gray-50 ${
              action.destructive ? 'text-red-600' : 'text-gray-800'
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
