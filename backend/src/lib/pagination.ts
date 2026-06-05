export interface PaginationParams {
  page: number;
  perPage: number;
  skip: number;
  take: number;
}

export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(String(query.per_page ?? '20'), 10) || 20));
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

export function paginationMeta(page: number, perPage: number, total: number) {
  return { page, per_page: perPage, total };
}
