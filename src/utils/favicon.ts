/**
 * Applies the agency's uploaded favicon (browser tab icon) at runtime.
 * Called whenever the company profile loads or updates — the per-tenant
 * faviconUrl from Firestore replaces the default index.html icon.
 */
export function applyFavicon(url?: string): void {
  if (typeof document === 'undefined') return;
  const head = document.head;
  if (!head) return;

  // Remove any previously applied dynamic favicon
  const existing = head.querySelector<HTMLLinkElement>('link[data-safardesk-favicon]');
  if (existing) existing.remove();

  if (!url) return; // fall back to the default icon in index.html

  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = url;
  link.setAttribute('data-safardesk-favicon', '1');
  head.appendChild(link);
}
