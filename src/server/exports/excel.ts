import 'server-only';
import ExcelJS from 'exceljs';

export interface SheetSpec {
  name: string;
  title?: string;
  columns: { header: string; key: string; width?: number; numFmt?: string }[];
  rows: Record<string, string | number | boolean | null | undefined>[];
  /** Optional per-cell fill: return an ARGB colour (e.g. 'FFFECACA') or undefined. */
  fill?: (row: Record<string, unknown>, key: string) => string | undefined;
}

const INR = '[$₹-4009] #,##,##0.00';
export const NUM_FMT = { inr: INR, int: '#,##0' };

/** Build a tidy .xlsx: bold header in brand rose, frozen header row, sensible widths, Indian number format. */
export async function buildWorkbook(sheets: SheetSpec[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AsiaTech Hotel OS';
  workbook.created = new Date();
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31));
    let headerRow = 1;
    if (spec.title) {
      sheet.addRow([spec.title]).font = { bold: true, size: 13 };
      sheet.addRow([]);
      headerRow = 3;
    }
    sheet.columns = spec.columns.map((c) => ({ key: c.key, width: c.width ?? Math.max(12, c.header.length + 2) }));
    const header = sheet.getRow(headerRow);
    spec.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    header.height = 22;
    for (const row of spec.rows) {
      const added = sheet.addRow(spec.columns.map((c) => row[c.key] ?? null));
      spec.columns.forEach((c, i) => {
        const cell = added.getCell(i + 1);
        if (c.numFmt) cell.numFmt = c.numFmt;
        const argb = spec.fill?.(row, c.key);
        if (argb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      });
    }
    sheet.views = [{ state: 'frozen', ySplit: headerRow }];
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function xlsxResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
