/**
 * ESC/POS for 58 mm and 80 mm thermal printers (Epson TM, TVS RP, Everycom, Rugtek and most Chinese clones).
 * Text is sent in the printer's default code page, so it is reduced to plain ASCII first: ₹ becomes "Rs.",
 * accents are dropped. Hindi menu names cannot print on a text-mode thermal printer and come out as "?".
 */
const ESC = 0x1b;
const GS = 0x1d;

const REPLACEMENTS: Record<string, string> = {
  '₹': 'Rs.',
  '·': '-',
  '•': '*',
  '×': 'x',
  '→': '->',
  '←': '<-',
  '–': '-',
  '—': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  ' ': ' ',
};

/** Plain printable ASCII, one character per printer column. */
export function toPrinterText(value: string): string {
  return value
    .replace(/[₹·•×→←–—‘’“”… ]/g, (c) => REPLACEMENTS[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\r\t]/g, ' ')
    .replace(/[^\x20-\x7e\n]/g, '?');
}

/** Characters per line in the standard 12×24 font. */
export function columnsFor(paperWidth: number): number {
  return paperWidth <= 58 ? 32 : 48;
}

/**
 * Break text into lines of at most `width` characters, on spaces where possible. A line that fits is kept as
 * it is (column padding like " 2  Paneer Tikka" matters on a KOT); continuation lines keep the indent.
 */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length <= width) {
      lines.push(paragraph);
      continue;
    }
    const indent = (/^ */.exec(paragraph)?.[0] ?? '').slice(0, Math.floor(width / 2));
    let line = indent;
    for (const word of paragraph.trim().split(/ +/)) {
      const room = width - (line.trim() ? line.length + 1 : line.length);
      if (word.length > width - indent.length) {
        if (line.trim()) lines.push(line);
        const size = width - indent.length;
        for (let i = 0; i < word.length; i += size) lines.push(indent + word.slice(i, i + size));
        line = lines.pop() ?? indent;
        continue;
      }
      if (!line.trim()) line = indent + word;
      else if (word.length <= room) line += ` ${word}`;
      else {
        lines.push(line);
        line = indent + word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export class Receipt {
  private chunks: number[] = [];
  readonly columns: number;
  private wide = false;

  constructor(readonly paperWidth: 58 | 80 = 80) {
    this.columns = columnsFor(paperWidth);
    this.raw(ESC, 0x40); // initialise
  }

  private raw(...bytes: number[]) {
    this.chunks.push(...bytes);
    return this;
  }

  /** Columns available at the current size. */
  get width() {
    return this.wide ? Math.floor(this.columns / 2) : this.columns;
  }

  align(where: 'left' | 'center' | 'right') {
    return this.raw(ESC, 0x61, where === 'left' ? 0 : where === 'center' ? 1 : 2);
  }

  bold(on = true) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** 1 = normal, 2 = double. Double width halves the characters per line. */
  size(width: 1 | 2 = 1, height: 1 | 2 = 1) {
    this.wide = width === 2;
    return this.raw(GS, 0x21, ((width - 1) << 4) | (height - 1));
  }

  text(value: string) {
    for (const ch of toPrinterText(value)) this.chunks.push(ch.charCodeAt(0));
    return this;
  }

  /** Text on its own line(s), wrapped to the current width. */
  line(value = '') {
    for (const l of wrap(toPrinterText(value), this.width)) this.text(l).raw(0x0a);
    return this;
  }

  /** "Paneer Tikka            240.00": left text wraps, right text stays on the first line. */
  row(left: string, right: string, rightWidth = Math.min(12, Math.max(right.length, 8))) {
    const leftWidth = this.width - rightWidth - 1;
    const lines = wrap(toPrinterText(left), leftWidth);
    lines.forEach((l, i) => {
      this.text(l.padEnd(leftWidth, ' ') + ' ' + (i === 0 ? toPrinterText(right).padStart(rightWidth, ' ') : ''));
      this.raw(0x0a);
    });
    return this;
  }

  rule(char = '-') {
    return this.text(char.repeat(this.width)).raw(0x0a);
  }

  feed(lines = 1) {
    return this.raw(ESC, 0x64, Math.max(0, Math.min(lines, 10)));
  }

  /** UPI / payment QR code (model 2). Most 2015+ printers support it; older ones skip it. */
  qr(data: string, moduleSize = 6) {
    const bytes = Array.from(Buffer.from(toPrinterText(data), 'ascii'));
    const len = bytes.length + 3;
    this.raw(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00); // model 2
    this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, Math.max(1, Math.min(moduleSize, 16))); // module size
    this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31); // error correction M
    this.raw(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...bytes); // store
    return this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30); // print
  }

  /** Feed past the tear bar and cut (partial cut keeps the ticket hanging). */
  cut() {
    return this.feed(4).raw(GS, 0x56, 0x42, 0x00);
  }

  /** Short beep on printers with a buzzer, so the kitchen notices a new KOT. */
  beep() {
    return this.raw(ESC, 0x42, 2, 2);
  }

  bytes(): Buffer {
    return Buffer.from(this.chunks);
  }
}
