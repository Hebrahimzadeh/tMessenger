export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center sm:p-6 selection:bg-blue-200">
      <div
        dir="rtl"
        className="w-full h-[100dvh] sm:w-[390px] sm:h-[844px] bg-white sm:rounded-[3rem] sm:border-[12px] sm:border-black relative overflow-hidden flex flex-col font-sans text-right antialiased shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
      >
        {children}
        <div className="hidden sm:block absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[25px] bg-black rounded-b-3xl z-50 pointer-events-none" />
      </div>
    </div>
  );
}
