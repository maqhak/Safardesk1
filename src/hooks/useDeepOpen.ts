import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Deep-open a record from a `?open=<ref>` query param.
 * Waits until `items` are loaded, finds the match, calls `onOpen`,
 * then removes the param so a refresh does not reopen it.
 */
export function useDeepOpen<T>(
  items: T[],
  match: (item: T, ref: string) => boolean,
  onOpen: (item: T) => void
) {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const ref = searchParams.get('open');
    if (ref && items.length > 0) {
      const hit = items.find((it) => match(it, ref));
      if (hit) {
        onOpen(hit);
        const next = new URLSearchParams(searchParams);
        next.delete('open');
        setSearchParams(next, { replace: true });
      }
    }
    // Intentionally keyed on items only: consume the param once data arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
}

/**
 * Preset a page's search filter from a `?q=<term>` query param,
 * then remove the param.
 */
export function usePresetSearch(setSearch: (q: string) => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setSearch(q);
      const next = new URLSearchParams(searchParams);
      next.delete('q');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
