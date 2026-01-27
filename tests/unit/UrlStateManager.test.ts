/**
 * UrlStateManager Unit Tests
 * 
 * Tests for bidirectional URL state synchronization.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    UrlStateManager,
    getUrlStateManager,
    type SerializableState
} from '../../src/core/state/UrlStateManager';

// Mock window.location and history
const mockLocation = {
    search: '',
    pathname: '/',
    origin: 'http://localhost:5173'
};

const mockHistory = {
    replaceState: vi.fn()
};

// Store original window properties
const originalLocation = window.location;
const originalHistory = window.history;

describe('UrlStateManager', () => {
    let urlStateManager: UrlStateManager;

    beforeEach(() => {
        // Reset singleton
        (UrlStateManager as any).instance = null;
        urlStateManager = getUrlStateManager();

        // Reset mocks
        mockLocation.search = '';
        mockLocation.pathname = '/';
        mockHistory.replaceState.mockReset();

        // Mock window.location (read-only, need to use defineProperty)
        Object.defineProperty(window, 'location', {
            value: mockLocation,
            writable: true,
            configurable: true
        });

        Object.defineProperty(window, 'history', {
            value: mockHistory,
            writable: true,
            configurable: true
        });
    });

    afterEach(() => {
        // Restore original window properties
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
            configurable: true
        });
        Object.defineProperty(window, 'history', {
            value: originalHistory,
            writable: true,
            configurable: true
        });
    });

    describe('parseFromUrl', () => {
        it('should parse database ID from URL', () => {
            mockLocation.search = '?db=76990/7/2';
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.db).toBe('76990/7/2');
        });

        it('should parse table name from URL', () => {
            mockLocation.search = '?table=Conditions';
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.table).toBe('Conditions');
        });

        it('should parse page (1-indexed) and convert to 0-indexed', () => {
            mockLocation.search = '?page=3';
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.page).toBe(2); // 3 - 1 = 2 (0-indexed)
        });

        it('should parse sort column and order', () => {
            mockLocation.search = '?sort=name:desc';
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.sortColumn).toBe('name');
            expect(fragment.sortOrder).toBe('desc');
        });

        it('should default sort order to asc if not specified', () => {
            mockLocation.search = '?sort=name';
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.sortColumn).toBe('name');
            expect(fragment.sortOrder).toBe('asc');
        });

        it('should parse search value', () => {
            mockLocation.search = '?search=pyruvate';
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.searchValue).toBe('pyruvate');
        });

        it('should parse column filters (JSON object)', () => {
            mockLocation.search = '?filters=' + encodeURIComponent('{"name":"test"}');
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.columnFilters).toEqual({ name: 'test' });
        });

        it('should parse advanced filters (JSON array)', () => {
            const advFilters = [{ column: 'id', operator: 'gt', value: 10 }];
            mockLocation.search = '?filters=' + encodeURIComponent(JSON.stringify(advFilters));
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.advancedFilters).toEqual(advFilters);
        });

        it('should parse visible columns', () => {
            mockLocation.search = '?cols=id,name,value';
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.visibleColumns).toEqual(new Set(['id', 'name', 'value']));
        });

        it('should handle multiple URL parameters', () => {
            mockLocation.search = '?db=test/1/2&table=Data&page=2&sort=id:desc&search=test';
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.db).toBe('test/1/2');
            expect(fragment.table).toBe('Data');
            expect(fragment.page).toBe(1); // 2 - 1 = 1
            expect(fragment.sortColumn).toBe('id');
            expect(fragment.sortOrder).toBe('desc');
            expect(fragment.searchValue).toBe('test');
        });

        it('should return empty fragment for URL without parameters', () => {
            mockLocation.search = '';
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment).toEqual({});
        });

        it('should ignore invalid page values', () => {
            mockLocation.search = '?page=abc';
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.page).toBeUndefined();
        });

        it('should ignore page values <= 0', () => {
            mockLocation.search = '?page=0';
            const fragment = urlStateManager.parseFromUrl();
            expect(fragment.page).toBeUndefined();
        });
    });

    describe('syncToUrl', () => {
        it('should sync database ID to URL', () => {
            const state: SerializableState = {
                berdlTableId: '76990/7/2',
                currentPage: 0
            };
            urlStateManager.syncToUrl(state);

            expect(mockHistory.replaceState).toHaveBeenCalled();
            const call = mockHistory.replaceState.mock.calls[0];
            expect(call[2]).toContain('db=76990%2F7%2F2');
        });

        it('should sync table name to URL', () => {
            const state: SerializableState = {
                berdlTableId: 'test',
                activeTableName: 'Conditions',
                currentPage: 0
            };
            urlStateManager.syncToUrl(state);

            const call = mockHistory.replaceState.mock.calls[0];
            expect(call[2]).toContain('table=Conditions');
        });

        it('should NOT include page=1 in URL (first page)', () => {
            const state: SerializableState = {
                berdlTableId: 'test',
                currentPage: 0 // First page (0-indexed)
            };
            urlStateManager.syncToUrl(state);

            const call = mockHistory.replaceState.mock.calls[0];
            expect(call[2]).not.toContain('page=');
        });

        it('should include page in URL for pages > 1', () => {
            const state: SerializableState = {
                berdlTableId: 'test',
                currentPage: 2 // Third page (0-indexed)
            };
            urlStateManager.syncToUrl(state);

            const call = mockHistory.replaceState.mock.calls[0];
            expect(call[2]).toContain('page=3'); // 2 + 1 = 3 (1-indexed)
        });

        it('should sync sort to URL', () => {
            const state: SerializableState = {
                berdlTableId: 'test',
                currentPage: 0,
                sortColumn: 'name',
                sortOrder: 'desc'
            };
            urlStateManager.syncToUrl(state);

            const call = mockHistory.replaceState.mock.calls[0];
            expect(call[2]).toContain('sort=name%3Adesc');
        });

        it('should sync search value to URL', () => {
            const state: SerializableState = {
                berdlTableId: 'test',
                currentPage: 0,
                searchValue: 'pyruvate'
            };
            urlStateManager.syncToUrl(state);

            const call = mockHistory.replaceState.mock.calls[0];
            expect(call[2]).toContain('search=pyruvate');
        });

        it('should clear URL when no database is loaded', () => {
            const state: SerializableState = {
                currentPage: 0
            };
            urlStateManager.syncToUrl(state);

            const call = mockHistory.replaceState.mock.calls[0];
            expect(call[2]).toBe('/'); // Clean URL
        });
    });

    describe('buildShareableUrl', () => {
        it('should build complete shareable URL', () => {
            const state: SerializableState = {
                berdlTableId: '76990/7/2',
                activeTableName: 'Conditions',
                currentPage: 1,
                sortColumn: 'id',
                sortOrder: 'asc'
            };
            const url = urlStateManager.buildShareableUrl(state);

            expect(url).toContain('http://localhost:5173');
            expect(url).toContain('db=76990%2F7%2F2');
            expect(url).toContain('table=Conditions');
            expect(url).toContain('page=2');
            expect(url).toContain('sort=id%3Aasc');
        });

        it('should return base URL when no state', () => {
            const state: SerializableState = {
                currentPage: 0
            };
            const url = urlStateManager.buildShareableUrl(state);
            expect(url).toBe('http://localhost:5173/');
        });
    });

    describe('hasUrlState', () => {
        it('should return true when db parameter is present', () => {
            mockLocation.search = '?db=test';
            expect(urlStateManager.hasUrlState()).toBe(true);
        });

        it('should return true when table parameter is present', () => {
            mockLocation.search = '?table=Test';
            expect(urlStateManager.hasUrlState()).toBe(true);
        });

        it('should return true when filters parameter is present', () => {
            mockLocation.search = '?filters={}';
            expect(urlStateManager.hasUrlState()).toBe(true);
        });

        it('should return false when no state parameters', () => {
            mockLocation.search = '';
            expect(urlStateManager.hasUrlState()).toBe(false);
        });

        it('should return false for non-state parameters', () => {
            mockLocation.search = '?random=value';
            expect(urlStateManager.hasUrlState()).toBe(false);
        });
    });

    describe('hasDbParam', () => {
        it('should return true when db parameter exists', () => {
            mockLocation.search = '?db=test';
            expect(urlStateManager.hasDbParam()).toBe(true);
        });

        it('should return false when db parameter missing', () => {
            mockLocation.search = '?table=Test';
            expect(urlStateManager.hasDbParam()).toBe(false);
        });
    });

    describe('getDbFromUrl', () => {
        it('should return db value when present', () => {
            mockLocation.search = '?db=76990/7/2';
            expect(urlStateManager.getDbFromUrl()).toBe('76990/7/2');
        });

        it('should return null when db not present', () => {
            mockLocation.search = '';
            expect(urlStateManager.getDbFromUrl()).toBeNull();
        });
    });

    describe('clearUrl', () => {
        it('should clear all parameters from URL', () => {
            urlStateManager.clearUrl();

            expect(mockHistory.replaceState).toHaveBeenCalledWith({}, '', '/');
        });
    });

    describe('singleton pattern', () => {
        it('should return the same instance', () => {
            const instance1 = getUrlStateManager();
            const instance2 = getUrlStateManager();
            expect(instance1).toBe(instance2);
        });
    });
});
