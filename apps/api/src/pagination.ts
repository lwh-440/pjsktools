export type PaginationQuery = { page?: unknown; pageSize?: unknown };

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export function parsePagination(query: PaginationQuery, defaults = { page: 1, pageSize: 24, maxPageSize: 100 }) {
  const requestedPage = Number(query.page ?? defaults.page);
  const requestedPageSize = Number(query.pageSize ?? defaults.pageSize);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : defaults.page;
  const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(requestedPageSize, defaults.maxPageSize)
    : defaults.pageSize;
  return { page, pageSize };
}

export function paginate<T>(items: T[], query: PaginationQuery, defaults?: { page: number; pageSize: number; maxPageSize: number }): PaginatedResponse<T> {
  const { page: requestedPage, pageSize } = parsePagination(query, defaults);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1
  };
}

export function withPaginationFlags<T extends { page: number; pageSize: number; total: number; totalPages: number }>(value: T) {
  return {
    ...value,
    hasNextPage: value.page < value.totalPages,
    hasPreviousPage: value.page > 1
  };
}
