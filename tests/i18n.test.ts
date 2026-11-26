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

  it('translates dates, times and phrases inside sentences', () => {
    expect(hi('Sat, 21 Nov → Sun, 22 Nov · 1 night')).toBe('शनि, 21 नव → रवि, 22 नव · 1 रात');
    expect(hi('Synced 5 d ago')).toBe('5 दिन पहले सिंक हुआ');
    expect(hi('Synced just now')).toBe('अभी सिंक हुआ');
    expect(hi('Hold for 2 hours')).toBe('2 घंटे के लिए होल्ड करें');
    expect(hi('Released hold FDR100099 · Hold expired')).toBe('FDR100099 का होल्ड छोड़ा · होल्ड का समय ख़त्म');
    expect(hi('FDR100070 · Front Desk · arriving 21 Nov 2026 · ₹2,000 paid')).toBe('FDR100070 · फ्रंट डेस्क · 21 Nov 2026 को आना था · ₹2,000 चुकाया');
    expect(hi('Inventory of 21 Nov to 5 Dec')).toBe('21 नव से 5 दिस तक की इन्वेंटरी');
  });

  it('translates activity log lines', () => {
    expect(hi('Created FDR100001 for Vivek Agrawal · 2 nights · ₹4,830')).toBe('Vivek Agrawal के लिए FDR100001 बनाई · 2 रात · ₹4,830');
    expect(hi('Checked out OTA100079 · invoice SRP/26-27/0002 · ₹2,415 · ₹1,915 on credit')).toBe('OTA100079 का चेक-आउट · इनवॉइस SRP/26-27/0002 · ₹2,415 · ₹1,915 उधार');
  });

  it('leaves unknown text and data alone', () => {
    expect(hi('Deluxe Double Bed Room')).toBe('Deluxe Double Bed Room');
    expect(hi('')).toBe('');
  });

  it('never changes English', () => {
    expect(en('Cancel')).toBe('Cancel');
    expect(en('3 left')).toBe('3 left');
    expect(en('Synced 5 d ago')).toBe('Synced 5 d ago');
  });
});
