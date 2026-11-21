import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SLABS, isValidGstin, roomTaxRate, splitTax, taxableFromInclusive } from '@/lib/gst';
import { amountInWords } from '@/lib/words';
import { financialYear, formatINR, nightsBetween, stayDates, addDay } from '@/lib/format';
import { editDistance, maskIdNumber, nameKey, normaliseMobile, round2 } from '@/lib/utils';

describe('GST on rooms (since 22 Sep 2025)', () => {
  it('charges 5% up to ₹7,500 per room per night and 18% above', () => {
    expect(roomTaxRate(1800, DEFAULT_ROOM_SLABS)).toBe(5);
    expect(roomTaxRate(7500, DEFAULT_ROOM_SLABS)).toBe(5);
    expect(roomTaxRate(7500.01, DEFAULT_ROOM_SLABS)).toBe(18);
    expect(roomTaxRate(12000, DEFAULT_ROOM_SLABS)).toBe(18);
  });

  it('uses the slabs from settings, not hard-coded values', () => {
    expect(roomTaxRate(5000, [{ upTo: 1000, rate: 0 }, { upTo: null, rate: 12 }])).toBe(12);
  });

  it('splits tax into equal CGST and SGST that add up exactly', () => {
    const split = splitTax(1801, 5);
    expect(split.tax).toBe(90.05);
    expect(round2(split.cgst + split.sgst)).toBe(split.tax);
    expect(split.total).toBe(1891.05);
    expect(split.igst).toBe(0);
  });

  it('uses IGST for inter-state supplies', () => {
    const split = splitTax(1000, 18, true);
    expect(split).toMatchObject({ cgst: 0, sgst: 0, igst: 180, total: 1180 });
  });

  it('backs out the taxable value from an inclusive price', () => {
    expect(taxableFromInclusive(1050, 5)).toBe(1000);
  });

  it('validates GSTIN format', () => {
    expect(isValidGstin('08AAKCS1234F1Z5')).toBe(true);
    expect(isValidGstin('08AAKCS1234F1X5')).toBe(false);
    expect(isValidGstin('123')).toBe(false);
  });
});

describe('Indian formatting', () => {
  it('formats rupees with Indian grouping', () => {
    expect(formatINR(397474)).toBe('₹3,97,474');
    expect(formatINR(1890.5)).toBe('₹1,890.50');
    expect(formatINR(1250000, { compact: true })).toBe('₹12.5L');
  });

  it('writes amounts in words for invoices', () => {
    expect(amountInWords(2067)).toBe('Rupees Two Thousand Sixty Seven Only');
    expect(amountInWords(397474)).toBe('Rupees Three Lakh Ninety Seven Thousand Four Hundred Seventy Four Only');
    expect(amountInWords(1891.05)).toBe('Rupees One Thousand Eight Hundred Ninety One and Five Paise Only');
  });

  it('works out the financial year for invoice numbers', () => {
    expect(financialYear('2026-11-21')).toBe('2026-27');
    expect(financialYear('2027-03-31')).toBe('2026-27');
    expect(financialYear('2027-04-01')).toBe('2027-28');
  });
});

describe('Stay dates', () => {
  it('counts nights and lists each night of a stay', () => {
    expect(nightsBetween('2026-11-21', '2026-11-24')).toBe(3);
    expect(stayDates('2026-11-30', '2026-12-02')).toEqual(['2026-11-30', '2026-12-01']);
    expect(addDay('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('Guests', () => {
  it('spots near-duplicate names like Agrawal / Agewal', () => {
    expect(editDistance(nameKey('Vivek Agrawal'), nameKey('Vivek Agewal'))).toBeLessThanOrEqual(2);
    expect(editDistance(nameKey('Vivek Agrawal'), nameKey('Rahul Sharma'))).toBeGreaterThan(3);
  });

  it('normalises mobile numbers and masks ID numbers', () => {
    expect(normaliseMobile('+91 98290-12345')).toBe('9829012345');
    expect(maskIdNumber('1234 5678 9012')).toBe('XXXX-XXXX-9012');
  });
});
