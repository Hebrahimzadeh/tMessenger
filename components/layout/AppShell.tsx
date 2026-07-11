export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="rtl"
      className="w-full h-[100dvh] bg-white relative overflow-hidden flex flex-col font-sans text-right antialiased selection:bg-blue-200"
      style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
    >
      {children}
    </div>
  );
}
