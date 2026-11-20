import type { TaxSlab } from '@/db/schema/tenancy';
import { round2 } from './utils';

/**
 * GST on hotel rooms (since 22 Sep 2025): 5% when the room tariff is up to ₹7,500 per room per night, 18% above.
 * The slabs are stored per property (`properties.settings.tax.roomSlabs`), never hard-coded in screens.
 */
export const DEFAULT_ROOM_SLABS: TaxSlab[] = [
  { upTo: 7500, rate: 5 },
  { upTo: null, rate: 18 },
];

export const SAC_ACCOMMODATION = '996311';
export const SAC_RESTAURANT = '996331';

export function roomTaxRate(nightlyRate: number, slabs: TaxSlab[] = DEFAULT_ROOM_SLABS): number {
  const ordered = [...slabs].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  for (const slab of ordered) {
    if (slab.upTo === null || nightlyRate <= slab.upTo) return slab.rate;
  }
  return ordered[ordered.length - 1]?.rate ?? 0;
}

export interface TaxSplit {
  taxable: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
}

/**
 * Split GST for a taxable amount. Accommodation and restaurant services are taxed where the hotel is, so the
 * split is CGST + SGST (half each) unless `interState` is set.
 */
export function splitTax(taxable: number, rate: number, interState = false): TaxSplit {
  const tax = round2((taxable * rate) / 100);
  if (interState) {
    return { taxable: round2(taxable), rate, cgst: 0, sgst: 0, igst: tax, tax, total: round2(taxable + tax) };
  }
  const half = round2(tax / 2);
  return { taxable: round2(taxable), rate, cgst: half, sgst: round2(tax - half), igst: 0, tax, total: round2(taxable + tax) };
}

/** When rates include tax, back out the taxable value: 1,050 at 5% → 1,000 taxable. */
export function taxableFromInclusive(inclusive: number, rate: number): number {
  return round2((inclusive * 100) / (100 + rate));
}

/** GSTIN: 2-digit state code, 10-char PAN, entity number, 'Z', checksum. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isValidGstin(value: string): boolean {
  return GSTIN_PATTERN.test(value.trim().toUpperCase());
}

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
];
