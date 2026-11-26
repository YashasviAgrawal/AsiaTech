import { describe, expect, it } from 'vitest';
import { deviceName } from '../src/lib/device';
import { getPatterns, getPhrases, translatePhrase } from '../src/i18n';

const hi = (text: string) => translatePhrase(getPhrases('hi'), text, getPatterns('hi'));

describe('device names in sign-in lists', () => {
  it('names common browsers and systems', () => {
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')).toBe('Chrome on Windows');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0')).toBe('Edge on Windows');
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1')).toBe('Chrome on iPhone');
    expect(deviceName('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36')).toBe('Samsung Internet on Android');
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:132.0) Gecko/20100101 Firefox/132.0')).toBe('Firefox on Mac');
    expect(deviceName('curl/8.5.0')).toBe('Script');
    expect(deviceName(null)).toBe('Unknown device');
  });

  it('reads in Hindi', () => {
    expect(hi('Chrome on Windows')).toBe('Windows पर Chrome');
    expect(hi('Unknown device')).toBe('अनजान डिवाइस');
  });
});
