interface LegalDocumentPageProps {
  title: string;
  /** null when the current version could not be loaded (e.g. the API is unreachable) - shown as a graceful fallback rather than crashing the page. */
  version: number | null;
}

/**
 * Placeholder legal-document page (Task 05 seeded placeholder content, not
 * real legal text - see that task's migration comment). Task 07 only needs
 * `/legal/terms` and `/legal/privacy` to exist as real, public, linkable
 * routes for the OTP login acceptance text; authoring the actual
 * terms-of-service/privacy-policy copy is a separate, non-engineering task.
 */
export function LegalDocumentPage({ title, version }: LegalDocumentPageProps) {
  return (
    <div dir="rtl" className="min-h-[100dvh] bg-gray-50 p-6 text-right">
      <h1 className="text-xl font-bold text-gray-900 mb-4">{title}</h1>

      {version === null ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          نسخهٔ فعلی این سند در حال حاضر در دسترس نیست. لطفاً بعداً دوباره تلاش کنید.
        </p>
      ) : (
        <>
          <p className="text-gray-700 mb-4">نسخهٔ فعلی: {version}</p>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
            این متن نمونه است و پیش از انتشار عمومی با متن رسمی و نهایی جایگزین خواهد شد.
          </div>
        </>
      )}
    </div>
  );
}
