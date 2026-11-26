import { describe, expect, it } from 'vitest';
import { columnsFor, Receipt, toPrinterText, wrap } from '@/lib/escpos';
import { billTicket, kotTicket, testTicket } from '@/server/services/print-tickets';

/** The printable text of a ticket (ESC/GS commands removed), to check what the paper will say. */
function paperText(bytes: Buffer) {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b) {
      const cmd = bytes[i + 1];
      i += cmd === 0x40 ? 1 : cmd === 0x42 ? 3 : 2; // ESC @ | ESC B n t | ESC x n
      continue;
    }
    if (b === 0x1d) {
      const cmd = bytes[i + 1];
      if (cmd === 0x28) {
        const len = bytes[i + 3] + bytes[i + 4] * 256;
        i += 4 + len;
      } else if (cmd === 0x56) i += 3;
      else i += 2;
      continue;
    }
    out.push(String.fromCharCode(b));
  }
  return out.join('');
}

describe('ESC/POS text', () => {
  it('reduces text to what a thermal printer can print', () => {
    expect(toPrinterText('Paneer Tikka · ₹240 × 2 → Café')).toBe('Paneer Tikka - Rs.240 x 2 -> Cafe');
    expect(toPrinterText('पनीर')).toBe('????');
  });

  it('uses 48 columns on 80 mm and 32 on 58 mm', () => {
    expect(columnsFor(80)).toBe(48);
    expect(columnsFor(58)).toBe(32);
  });

  it('wraps on spaces and splits very long words', () => {
    expect(wrap('Dal Makhani with extra butter', 12)).toEqual(['Dal Makhani', 'with extra', 'butter']);
    expect(wrap('ABCDEFGHIJKLMNOPQRST', 8)).toEqual(['ABCDEFGH', 'IJKLMNOP', 'QRST']);
    expect(wrap(' 2  Paneer Tikka', 20)).toEqual([' 2  Paneer Tikka']);
    expect(wrap('    * no onion, no garlic please', 16)).toEqual(['    * no onion,', '    no garlic', '    please']);
  });

  it('keeps amounts right-aligned in rows', () => {
    const r = new Receipt(58);
    r.row('Paneer Tikka', '240.00');
    const line = paperText(r.bytes()).split('\n')[0];
    expect(line).toHaveLength(32);
    expect(line.endsWith('  240.00')).toBe(true);
  });

  it('starts with initialise and ends with feed + cut', () => {
    const bytes = new Receipt(80).line('x').cut().bytes();
    expect([...bytes.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...bytes.subarray(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });
});

describe('tickets', () => {
  it('KOT shows number, table, quantities, notes and who sent it', () => {
    const text = paperText(
      kotTicket({ outletName: 'Rasoi', kotNo: 3, orderNo: 'KOT00142', where: 'TABLE T4', at: new Date('2026-11-21T14:12:00Z'), by: 'Ravi', items: [{ quantity: 2, name: 'Paneer Tikka', notes: 'less spicy' }, { quantity: 1, name: 'Butter Naan' }] }, 80),
    );
    for (const s of ['KOT #3', 'Rasoi - KOT00142', 'TABLE T4', ' 2  Paneer Tikka', '* less spicy', ' 1  Butter Naan', 'Items: 3', 'By: Ravi', '21 Nov 2026, 7:42 PM']) expect(text).toContain(s);
    expect(text).not.toContain('REPRINT');
  });

  it('marks reprints so the kitchen does not cook twice', () => {
    const text = paperText(kotTicket({ outletName: 'Rasoi', kotNo: 3, orderNo: 'KOT00142', where: 'TAKE-AWAY', at: new Date(), items: [{ quantity: 1, name: 'Tea' }], reprint: true }, 58));
    expect(text).toContain('** REPRINT **');
  });

  it('bill shows GSTIN, items, taxes, total and the UPI QR while unpaid', () => {
    const bytes = billTicket(
      {
        outletName: 'Rasoi',
        hotelName: 'Shri Ram Portico',
        gstin: '08AAKCS1234F1Z5',
        billNo: 'RST/26-27/00142',
        at: new Date(),
        where: 'Table T4',
        items: [{ name: 'Paneer Tikka', quantity: 2, price: 240, amount: 480 }],
        subtotal: 480,
        discount: 0,
        cgst: 12,
        sgst: 12,
        total: 504,
        upiUri: 'upi://pay?pa=hotel@okhdfcbank&am=504.00',
      },
      80,
    );
    const text = paperText(bytes);
    for (const s of ['Rasoi', 'Shri Ram Portico', 'GSTIN: 08AAKCS1234F1Z5', 'TAX INVOICE', 'Bill: RST/26-27/00142', 'Paneer Tikka', '2 x 240.00', '480.00', 'CGST', '12.00', 'Rs.504.00', 'Scan to pay by UPI', 'SAC 996331']) expect(text).toContain(s);
    expect(bytes.includes(Buffer.from('upi://pay?pa=hotel@okhdfcbank&am=504.00'))).toBe(true);
  });

  it('test page fits the paper width', () => {
    const text = paperText(testTicket('Kitchen', 58, 'Hotel'));
    expect(text).toContain('58 mm paper, 32 per line:');
    expect(text).toContain('12345678901234567890123456789012\n');
  });
});
