/**
 * URL State Manager
 * 
 * Handles bidirectional synchronization between application state and URL parameters.
 * Enables shareable URLs that capture the complete viewer state.
 * 
 * @version 1.0.0
 */

import type { AdvancedFilter } from '../../types/shared-types';

/**
 * URL parameter names
 */
export const URL_PARAMS = {
    DB: 'db',           // Database ID / UPA
    TABLE: 'table',     // Active table name
    PAGE: 'page',       // Current page (1-indexed for UX)
    SORT: 'sort',       // Sort column:order (e.g., "ID:asc")
    SEARCH: 'search',   // Global search term
    FILTERS: 'filters', // Column filters (JSON encoded)
    COLS: 'cols',       // Visible columns (comma-separated)
} as const;

/**
 * State fragment parsed from URL
 */
export interface UrlStateFragment {
    db?: string;
    table?: string;
    page?: number;        // 0-indexed (internal)
    sortColumn?: string;
    sortOrder?: 'asc' | 'desc';
    searchValue?: string;
    columnFilters?: Record<string, string>;
    advancedFilters?: AdvancedFilter[];
    visibleColumns?: Set<string>;
}

/**
 * State required for URL serialization
 */
export interface SerializableState {
    berdlTableId?: string | null;
    activeTableName?: string | null;
    currentPage: number;
    sortColumn?: string | null;
    sortOrder?: 'asc' | 'desc';
    searchValue?: string;
    columnFilters?: Record<string, string>;
    advancedFilters?: AdvancedFilter[];
    visibleColumns?: Set<string>;
    columns?: Array<{ column: string }>; // All available columns (for comparison)
}

/**
 * URL State Manager
 * 
 * Provides utilities for parsing URL parameters and syncing state to URL.
 */
export class UrlStateManager {
    private static instance: UrlStateManager | null = null;

    private constructor() { }

    public static getInstance(): UrlStateManager {
        if (!UrlStateManager.instance) {
            UrlStateManager.instance = new UrlStateManager();
        }
        return UrlStateManager.instance;
    }

    /**
     * Parse URL parameters into a state fragment.
     * Call this on page load to restore state from URL.
     */
    public parseFromUrl(): UrlStateFragment {
        const params = new URLSearchParams(window.location.search);
        const fragment: UrlStateFragment = {};

        // Database ID
        const db = params.get(URL_PARAMS.DB);
        if (db) {
            fragment.db = db;
        }

        // Table name
        const table = params.get(URL_PARAMS.TABLE);
        if (table) {
            fragment.table = table;
        }

        // Page (convert from 1-indexed URL to 0-indexed internal)
        const page = params.get(URL_PARAMS.PAGE);
        if (page) {
            const pageNum = parseInt(page, 10);
            if (!isNaN(pageNum) && pageNum > 0) {
                fragment.page = pageNum - 1; // Convert to 0-indexed
            }
        }

        // Sort
        const sort = params.get(URL_PARAMS.SORT);
        if (sort) {
            const [column, order] = sort.split(':');
            if (column) {
                fragment.sortColumn = column;
                fragment.sortOrder = order === 'desc' ? 'desc' : 'asc';
            }
        }

        // Search
        const search = params.get(URL_PARAMS.SEARCH);
        if (search) {
            fragment.searchValue = search;
        }

        // Filters (JSON encoded)
        const filters = params.get(URL_PARAMS.FILTERS);
        if (filters) {
            try {
                const parsed = JSON.parse(filters);
                if (typeof parsed === 'object' && parsed !== null) {
                    // Check if it's an array (advanced filters) or object (column filters)
                    if (Array.isArray(parsed)) {
                        // Advanced filters array
                        fragment.advancedFilters = parsed as AdvancedFilter[];
                    } else {
                        // Simple column filters object
                        fragment.columnFilters = parsed as Record<string, string>;
                    }
                }
            } catch {
                // Invalid JSON, ignore
                console.warn('[UrlStateManager] Failed to parse filters from URL');
            }
        }

        // Visible columns (comma-separated)
        const cols = params.get(URL_PARAMS.COLS);
        if (cols) {
            const colArray = cols.split(',').map(c => c.trim()).filter(c => c.length > 0);
            if (colArray.length > 0) {
                fragment.visibleColumns = new Set(colArray);
            }
        }

        return fragment;
    }

    /**
     * Sync application state to URL.
     * Uses replaceState to avoid polluting browser history.
     */
    public syncToUrl(state: SerializableState): void {
        const params = new URLSearchParams();

        // Database ID
        if (state.berdlTableId) {
            params.set(URL_PARAMS.DB, state.berdlTableId);
        }

        // Table name
        if (state.activeTableName) {
            params.set(URL_PARAMS.TABLE, state.activeTableName);
        }

        // Page (convert from 0-indexed internal to 1-indexed URL)
        if (state.currentPage > 0) {
            params.set(URL_PARAMS.PAGE, String(state.currentPage + 1));
        }

        // Sort
        if (state.sortColumn) {
            params.set(URL_PARAMS.SORT, `${state.sortColumn}:${state.sortOrder || 'asc'}`);
        }

        // Search
        if (state.searchValue && state.searchValue.trim()) {
            params.set(URL_PARAMS.SEARCH, state.searchValue.trim());
        }

        // Filters
        const hasColumnFilters = state.columnFilters && Object.keys(state.columnFilters).length > 0;
        const hasAdvancedFilters = state.advancedFilters && state.advancedFilters.length > 0;

        if (hasAdvancedFilters) {
            // Prefer advanced filters if present
            params.set(URL_PARAMS.FILTERS, JSON.stringify(state.advancedFilters));
        } else if (hasColumnFilters) {
            params.set(URL_PARAMS.FILTERS, JSON.stringify(state.columnFilters));
        }

        // Visible columns - only include if not all columns are visible
        if (state.visibleColumns && state.visibleColumns.size > 0) {
            const visibleCols = state.visibleColumns;
            const allColumns = state.columns || [];
            const allVisible = allColumns.length > 0 &&
                allColumns.every(c => visibleCols.has(c.column));

            // Only add cols param if some columns are hidden (to keep URL shorter)
            if (!allVisible && visibleCols.size < allColumns.length) {
                params.set(URL_PARAMS.COLS, Array.from(visibleCols).join(','));
            }
        }

        // Build new URL
        const newUrl = params.toString()
            ? `${window.location.pathname}?${params.toString()}`
            : window.location.pathname;

        // Update URL without adding to history
        window.history.replaceState({}, '', newUrl);
    }

    /**
     * Build a shareable URL with the current state.
     * Returns an absolute URL that can be copied and shared.
     */
    public buildShareableUrl(state: SerializableState): string {
        const params = new URLSearchParams();

        // Always include db if present
        if (state.berdlTableId) {
            params.set(URL_PARAMS.DB, state.berdlTableId);
        }

        // Always include table if present
        if (state.activeTableName) {
            params.set(URL_PARAMS.TABLE, state.activeTableName);
        }

        // Include page if not first page
        if (state.currentPage > 0) {
            params.set(URL_PARAMS.PAGE, String(state.currentPage + 1));
        }

        // Include sort if present
        if (state.sortColumn) {
            params.set(URL_PARAMS.SORT, `${state.sortColumn}:${state.sortOrder || 'asc'}`);
        }

        // Include search if present
        if (state.searchValue && state.searchValue.trim()) {
            params.set(URL_PARAMS.SEARCH, state.searchValue.trim());
        }

        // Include filters if present
        const hasColumnFilters = state.columnFilters && Object.keys(state.columnFilters).length > 0;
        const hasAdvancedFilters = state.advancedFilters && state.advancedFilters.length > 0;

        if (hasAdvancedFilters) {
            params.set(URL_PARAMS.FILTERS, JSON.stringify(state.advancedFilters));
        } else if (hasColumnFilters) {
            params.set(URL_PARAMS.FILTERS, JSON.stringify(state.columnFilters));
        }

        // Include visible columns if not all are visible
        if (state.visibleColumns && state.visibleColumns.size > 0) {
            const visibleCols = state.visibleColumns;
            const allColumns = state.columns || [];
            const allVisible = allColumns.length > 0 &&
                allColumns.every(c => visibleCols.has(c.column));

            if (!allVisible && visibleCols.size < allColumns.length) {
                params.set(URL_PARAMS.COLS, Array.from(visibleCols).join(','));
            }
        }

        // Build absolute URL
        const base = `${window.location.origin}${window.location.pathname}`;
        return params.toString() ? `${base}?${params.toString()}` : base;
    }

    /**
     * Check if URL has any state parameters.
     * Useful for detecting if this is a shared link.
     */
    public hasUrlState(): boolean {
        const params = new URLSearchParams(window.location.search);
        return params.has(URL_PARAMS.DB) ||
            params.has(URL_PARAMS.TABLE) ||
            params.has(URL_PARAMS.FILTERS);
    }

    /**
     * Check if URL has a database parameter.
     * Useful for detecting shared links that require authentication.
     */
    public hasDbParam(): boolean {
        const params = new URLSearchParams(window.location.search);
        return params.has(URL_PARAMS.DB);
    }

    /**
     * Get the database ID from URL if present.
     */
    public getDbFromUrl(): string | null {
        const params = new URLSearchParams(window.location.search);
        return params.get(URL_PARAMS.DB);
    }

    /**
     * Clear all state parameters from URL.
     */
    public clearUrl(): void {
        window.history.replaceState({}, '', window.location.pathname);
    }
}

// Export singleton getter for convenience
export function getUrlStateManager(): UrlStateManager {
    return UrlStateManager.getInstance();
}
