/**
 * State Manager
 * 
 * Centralized state management with immutable updates and
 * subscription-based reactivity.
 * 
 * @version 1.0.0
 */

import type { TableColumnConfig } from '../../utils/config-manager';

export interface AppState {
    // Data Source
    berdlTableId: string | null;
    activeTableName: string | null;
    availableTables: any[];

    // Table Structure
    headers: string[];
    columns: TableColumnConfig[];
    visibleColumns: Set<string>;

    // Data Content
    data: Record<string, any>[];
    totalCount: number;
    filteredCount: number;

    // Pagination & Navigation
    currentPage: number;
    pageSize: number;

    // Sorting & Filtering
    sortColumn: string | null;
    sortDirection: 'asc' | 'desc'; // Mapped from 'sortOrder' for compatibility
    sortOrder: 'asc' | 'desc';     // Keeping original for backward compat if needed
    columnFilters: Record<string, any>;
    searchQuery: string;
    searchValue: string;           // Alias for searchQuery

    // Selection
    selectedRows: Set<number>;

    // UI Status
    loading: boolean;
    error: string | null;

    // Preferences
    theme: 'light' | 'dark';
    density: 'compact' | 'normal' | 'comfortable';
    showRowNumbers: boolean;

    // Performance
    queryCached?: boolean;
    queryTime?: number;
}

const INITIAL_STATE: AppState = {
    berdlTableId: null,
    activeTableName: null,
    availableTables: [],

    headers: [],
    columns: [],
    visibleColumns: new Set(),

    data: [],
    totalCount: 0,
    filteredCount: 0,

    currentPage: 0,
    pageSize: 50,

    sortColumn: null,
    sortDirection: 'asc',
    sortOrder: 'asc',
    columnFilters: {},
    searchQuery: '',
    searchValue: '',

    selectedRows: new Set(),

    loading: false,
    error: null,

    theme: 'light',
    density: 'normal',
    showRowNumbers: true,

    queryCached: false,
    queryTime: undefined
};

export class StateManager {
    private state: AppState;
    private listeners: Set<(state: AppState) => void>;

    constructor(initialState: Partial<AppState> = {}) {
        this.state = {
            ...INITIAL_STATE,
            ...initialState
        };
        this.listeners = new Set();
    }

    public getState(): AppState {
        return { ...this.state };
    }

    public update(partialState: Partial<AppState>): void {
        // Handle alias mappings
        if (partialState.sortDirection && !partialState.sortOrder) {
            partialState.sortOrder = partialState.sortDirection;
        } else if (partialState.sortOrder && !partialState.sortDirection) {
            partialState.sortDirection = partialState.sortOrder;
        }

        if (partialState.searchQuery !== undefined && partialState.searchValue === undefined) {
            partialState.searchValue = partialState.searchQuery;
        } else if (partialState.searchValue !== undefined && partialState.searchQuery === undefined) {
            partialState.searchQuery = partialState.searchValue;
        }

        this.state = { ...this.state, ...partialState };
        this.notify();
    }

    public reset(): void {
        this.state = { ...INITIAL_STATE };
        this.notify();
    }

    public subscribe(listener: (state: AppState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        this.listeners.forEach(listener => listener(this.state));
    }
}
