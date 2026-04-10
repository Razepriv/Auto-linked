// ---------------------------------------------------------------------------
// API response envelope types
// ---------------------------------------------------------------------------

/** Pagination metadata included in list responses. */
export interface PaginationMeta {
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

/**
 * Standard API response envelope used by every endpoint.
 *
 * On success: `success: true`, `data` populated, `error` is `null`.
 * On failure: `success: false`, `data` is `null`, `error` is a human-readable message.
 */
export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: string | null;
  readonly meta?: PaginationMeta;
}

/** Convenience type for a paginated list response. */
export type PaginatedResponse<T> = ApiResponse<readonly T[]> & {
  readonly meta: PaginationMeta;
};

/** Standard query params for paginated list endpoints. */
export interface PaginationParams {
  readonly page?: number;
  readonly limit?: number;
}

/** Standard query params for sortable endpoints. */
export interface SortParams<TField extends string = string> {
  readonly sortBy?: TField;
  readonly sortOrder?: 'asc' | 'desc';
}

// ---- Helper constructors (pure functions) -----------------------------------

/** Create a successful API response. */
export function successResponse<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  return { success: true, data, error: null, ...(meta ? { meta } : {}) };
}

/** Create a failed API response. */
export function errorResponse(error: string): ApiResponse<never> {
  return { success: false, data: null, error };
}
