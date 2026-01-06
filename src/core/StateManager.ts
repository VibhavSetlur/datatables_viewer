/**
 * State Manager
 * 
 * Handles application state for the Table Renderer.
 */

import type { TableColumnConfig } from '../utils/config-manager';

export interface AppState {
    berdlTableId: string | null;
    activeTableName: string | null;
    availableTables: any[];

    headers: string[];
    columns: TableColumnConfig[];

    data: any[];
    totalCount: number;
    filteredCount: number;

    currentPage: number;
    pageSize: number;

    sortColumn: string | null;
    sortOrder: 'asc' | 'desc';

    columnFilters: Record<string, any>;
    searchValue: string;

    visibleColumns: Set<string>;

    loading: boolean;
    error: string | null;

    theme: 'light' | 'dark';
    density: 'compact' | 'normal';
    showRowNumbers: boolean;
}

export class StateManager {
    private state: AppState;
    private listeners: Set<(state: AppState) => void>;

    constructor(initialState: Partial<AppState> = {}) {
        this.state = {
            berdlTableId: null,
            activeTableName: null,
            availableTables: [],
            headers: [],
            columns: [],
            data: [],
            totalCount: 0,
            filteredCount: 0,
            currentPage: 0,
            pageSize: 50,
            sortColumn: null,
            sortOrder: 'asc',
            columnFilters: {},
            searchValue: '',
            visibleColumns: new Set(),
            loading: false,
            error: null,
            theme: 'light',
            density: 'normal',
            showRowNumbers: true,
            ...initialState
        };
        this.listeners = new Set();
    }

    public getState(): AppState {
        return { ...this.state };
    }

    public update(partialState: Partial<AppState>) {
        this.state = { ...this.state, ...partialState };
        this.notify();
    }

    public subscribe(listener: (state: AppState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        this.listeners.forEach(listener => listener(this.state));
    }
}
