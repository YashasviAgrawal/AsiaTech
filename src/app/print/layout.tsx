import { PrintBar } from './print-bar';

/** Print pages: no app chrome, A4-friendly, a floating bar with Print / Close that never prints. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-100 py-8 print:bg-white print:py-0">
      <PrintBar />
      {children}
    </div>
  );
}
