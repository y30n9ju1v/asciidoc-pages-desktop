// localStorage can throw (disabled/unavailable in some webview configurations),
// so every read/write in this app goes through here rather than each call site
// re-implementing its own try/catch - failures just fall back to a default
// (read) or are silently dropped (write) instead of breaking the feature.
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`Failed to read localStorage key "${key}", using default:`, err);
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`Failed to persist localStorage key "${key}":`, err);
  }
}
