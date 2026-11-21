import { describe, expect, it } from 'vitest';
import { getPatterns, getPhrases, translatePhrase } from '../src/i18n';

const hi = (text: string) => translatePhrase(getPhrases('hi'), text, getPatterns('hi'));
const en = (text: string) => translatePhrase(getPhrases('en'), text, getPatterns('en'));

describe('phrase translation', () => {
  it('translates exact phrases and keeps surrounding spaces', () => {
    expect(hi('Cancel')).toBe('रद्द करें');
    expect(hi(' Check in')).toBe(' चेक-इन करें');
  });

  it('translates sentences with names and numbers through patterns', () => {
    expect(hi('Check out SWATI IYER (ID: OTA100075)')).toBe('SWATI IYER (ID: OTA100075) का चेक-आउट करें');
    expect(hi('Balance due ₹3,780')).toBe('बकाया ₹3,780');
    expect(hi('3 left')).toBe('3 खाली');
    expect(hi('Saturday, 21st November')).toBe('शनिवार, 21 नवंबर');
  });

  it('leaves unknown text and data alone', () => {
    expect(hi('Deluxe Double Bed Room')).toBe('Deluxe Double Bed Room');
    expect(hi('')).toBe('');
  });

  it('never changes English', () => {
    expect(en('Cancel')).toBe('Cancel');
    expect(en('3 left')).toBe('3 left');
  });
});
