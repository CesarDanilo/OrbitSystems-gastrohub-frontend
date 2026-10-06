/** Anonymous id for storefront analytics. No personal data. */
export function getSessionId(): string {
  const key = 'hamb:session-id';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return 'anonymous-session';
  }
}
