/**
 * localStorage that never throws. Storage can be disabled or full (blocked site
 * data, some private modes), and everything kept here is a convenience that the
 * page must work without.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not remembered this time; nothing else depends on it.
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // As above.
    }
  },
};
