export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="rtl"
      className="w-full max-w-[430px] mx-auto h-[100dvh] bg-white relative overflow-hidden flex flex-col font-sans text-right antialiased selection:bg-blue-200"
      style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
    >
      {/*
        The shell is a fixed-height, non-scrolling frame, so anything taller
        than the screen needs a scroller of its own. Only the tab routes had
        one, which left every other page - a built space, its edit form, the
        card detail, settings - silently clipped at the bottom edge on a
        phone, with no way to reach the rest.

        `min-h-0` is what makes it work inside a flex column: without it the
        track refuses to shrink below its content and overflows the frame
        instead of scrolling. The tab routes are `absolute inset-0` and so
        stay out of this flow, keeping the scroller they already had.
      */}
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}
