'use client';

import { useCallback, useSyncExternalStore } from 'react';

const EVENT = 'hos-local-flag';

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * A per-browser on/off preference (e.g. "sidebar collapsed"). Stored in localStorage, which can be unavailable
 * (private mode), so every access is guarded and the default is `false`.
 */
export function useLocalFlag(key: string): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      const handler = (e: Event) => (e instanceof StorageEvent ? e.key === key : true) && onChange();
      window.addEventListener('storage', handler);
      window.addEventListener(EVENT, handler);
      return () => {
        window.removeEventListener('storage', handler);
        window.removeEventListener(EVENT, handler);
      };
    },
    () => read(key),
    () => false,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? '1' : '0');
      } catch {
        /* storage unavailable: preference is not remembered */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
