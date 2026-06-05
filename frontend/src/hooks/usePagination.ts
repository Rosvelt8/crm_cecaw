import { useState, useMemo, useEffect } from 'react';

export function usePagination<T>(items: T[], perPage = 25) {
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the source list changes (e.g. after a filter)
  useEffect(() => { setPage(1); }, [items.length]);

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage   = Math.min(page, totalPages);

  const paginated = useMemo(
    () => items.slice((safePage - 1) * perPage, safePage * perPage),
    [items, safePage, perPage]
  );

  return {
    paginated,
    page: safePage,
    totalPages,
    setPage,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
    total:   items.length,
    perPage,
  };
}
