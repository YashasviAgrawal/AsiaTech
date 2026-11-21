import { Download, Printer } from 'lucide-react';
import { buttonClasses } from './button-styles';

/** "Export Excel" (and optionally "Print") as plain links: downloads work without JavaScript. */
export function ExportButton({ href, printHref, label = 'Export Excel' }: { href: string; printHref?: string; label?: string }) {
  return (
    <>
      {printHref && (
        <a href={printHref} target="_blank" rel="noreferrer" className={buttonClasses('outline')}>
          <Printer className="h-4 w-4" /> Print / PDF
        </a>
      )}
      <a href={href} className={buttonClasses('outline')}>
        <Download className="h-4 w-4" /> {label}
      </a>
    </>
  );
}
