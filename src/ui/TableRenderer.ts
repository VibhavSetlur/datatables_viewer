/**
 * TableRenderer - Research-Grade Scientific Data Viewer
 * Orchestrator (Controller)
 */

import { ApiClient } from '../core/api/ApiClient';
import { DataTypeRegistry } from '../core/config/DataTypeRegistry';
import { ConfigManager, type TableColumnConfig } from '../utils/config-manager';
import { StateManager, type AppState } from '../core/state/StateManager';
import { CategoryManager } from '../core/managers/CategoryManager';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { DataGrid } from './components/DataGrid';
import { Transformers } from '../utils/transformers';
import { exportManager } from '../core/managers/ExportManager';
import { registerDefaultShortcuts } from '../core/managers/KeyboardManager';
import '../style.css';

export interface RendererOptions {
    container: HTMLElement;
    configUrl?: string;
    client?: ApiClient;
}

export class TableRenderer {
    private container: HTMLElement;
    private configUrl: string | null;
    private configManager!: ConfigManager;
    private registry: DataTypeRegistry;
    private client!: ApiClient;
    private stateManager: StateManager;
    private categoryManager: CategoryManager | null = null;

    // Components
    private sidebar!: Sidebar;
    private toolbar!: Toolbar;
    private grid!: DataGrid;

    private theme: 'light' | 'dark' = 'light';
    private density: 'compact' | 'normal' | 'comfortable' = 'normal';
    private dom: Record<string, HTMLElement> = {};

    constructor(options: RendererOptions) {
        if (!options.container) throw new Error('Container required');
        this.container = options.container;
        this.configUrl = options.configUrl || null;
        this.client = options.client || new ApiClient();
        this.registry = DataTypeRegistry.getInstance();
        this.stateManager = new StateManager();
        this.stateManager.subscribe(this.onStateChange.bind(this));

        // Load saved preferences
        const savedTheme = localStorage.getItem('ts-theme') as 'light' | 'dark';
        const savedDensity = localStorage.getItem('ts-density') as 'compact' | 'normal' | 'comfortable';
        if (savedTheme) this.theme = savedTheme;
        if (savedDensity) this.density = savedDensity;
    }

    public async init() {
        try {
            await this.loadConfiguration();
            const env = this.configManager.getEnvironment();
            const apis = this.configManager.getApis();
            const defaultApiId = this.configManager.getDefaultApiId();

            let currentApiId = defaultApiId || (apis.length > 0 ? apis[0].id : null);

            if (currentApiId) {
                const apiConfig = this.configManager.getApi(currentApiId);
                if (apiConfig) this.client.updateConfig(apiConfig as any);
            } else {
                const apiUrl = this.configManager.getApiUrl();
                if (apiUrl) this.client = new ApiClient({ environment: env, baseUrl: apiUrl });
                else this.client.setEnvironment(env);
            }

            const settings = this.configManager.getGlobalSettings();
            this.stateManager.update({
                pageSize: settings.pageSize || 50,
                showRowNumbers: settings.showRowNumbers !== false
            });

            this.loadStateFromUrl();
            this.renderLayout();
            this.initComponents();

        } catch (e: any) {
            this.container.innerHTML = `<div class="ts-alert ts-alert-danger"><i class="bi bi-x-circle-fill"></i> ${e.message}</div>`;
        }
    }

    private renderLayout() {
        this.container.innerHTML = `
            <div class="ts-app" data-theme="${this.theme}" data-density="${this.density}">
                <aside class="ts-sidebar" id="ts-sidebar-container"></aside>
                <main class="ts-main">
                    <header class="ts-toolbar" id="ts-toolbar-container"></header>
                    <div id="ts-alert"></div>
                    <div class="ts-performance-indicator" id="ts-performance" style="display:none">
                        <span class="ts-perf-cached" id="ts-perf-cached" style="display:none">
                            <i class="bi bi-lightning-charge-fill"></i> Cached
                        </span>
                        <span class="ts-perf-time" id="ts-perf-time" style="display:none"></span>
                    </div>
                    <div class="ts-grid-header" id="ts-grid-header" style="display:none">
                        <div class="ts-grid-header-content">
                            <div class="ts-db-info">
                                <i class="bi bi-database"></i>
                                <span id="ts-db-name">Database</span>
                            </div>
                            <div class="ts-table-info">
                                <i class="bi bi-table"></i>
                                <span id="ts-active-table-name">Table</span>
                            </div>
                        </div>
                    </div>
                    <div class="ts-grid-wrapper" style="position:relative">
                        <div class="ts-loading-overlay" id="ts-loading-overlay" style="display:none">
                            <div class="ts-loading-spinner-wrapper">
                                <span class="ts-spinner" style="width:32px;height:32px"></span>
                                <span class="ts-loading-text" style="margin-top:12px;font-size:13px;color:var(--c-text-secondary)">Loading...</span>
                            </div>
                        </div>
                        <div class="ts-grid" id="ts-grid-container"></div>
                    </div>
                    <footer class="ts-footer">
                        <div class="ts-status" id="ts-status">Ready</div>
                        <div class="ts-table-name" id="ts-table-name"></div>
                        <div class="ts-pager" id="ts-pager"></div>
                    </footer>
                </main>
                
                <div class="ts-settings-popup" id="ts-settings-popup" style="top: 70px; right: 24px; bottom: auto;">
                    <div class="ts-settings-header">Settings</div>
                     <div class="ts-settings-body">
                        <div class="ts-settings-row">
                            <div class="ts-settings-label"><i class="bi bi-moon-stars"></i> Theme</div>
                            <div class="ts-switch ${this.theme === 'dark' ? 'on' : ''}" id="ts-theme-toggle"></div>
                        </div>
                        <div class="ts-settings-row">
                            <div class="ts-settings-label"><i class="bi bi-arrows-angle-expand"></i> Density</div>
                            <div class="ts-density-options">
                                <button class="ts-density-opt ${this.density === 'compact' ? 'active' : ''}" data-density="compact" title="Compact"><i class="bi bi-list"></i></button>
                                <button class="ts-density-opt ${this.density === 'normal' ? 'active' : ''}" data-density="normal" title="Normal"><i class="bi bi-list-ul"></i></button>
                                <button class="ts-density-opt ${this.density === 'comfortable' ? 'active' : ''}" data-density="comfortable" title="Comfortable"><i class="bi bi-card-heading"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.dom.status = this.container.querySelector('#ts-status') as HTMLElement;
        this.dom.pager = this.container.querySelector('#ts-pager') as HTMLElement;
        this.dom.alert = this.container.querySelector('#ts-alert') as HTMLElement;
        this.dom.tableName = this.container.querySelector('#ts-table-name') as HTMLElement;
        this.dom.loadingOverlay = this.container.querySelector('#ts-loading-overlay') as HTMLElement;
        this.dom.performance = this.container.querySelector('#ts-performance') as HTMLElement;
        this.dom.perfCached = this.container.querySelector('#ts-perf-cached') as HTMLElement;
        this.dom.perfTime = this.container.querySelector('#ts-perf-time') as HTMLElement;
    }

    private initComponents() {
        // Sidebar
        this.sidebar = new Sidebar({
            container: this.container.querySelector('#ts-sidebar-container') as HTMLElement,
            configManager: this.configManager,
            stateManager: this.stateManager,
            onApiChange: (id) => this.switchApi(id),
            onLoadData: () => this.loadObject(),
            onTableChange: (name) => this.switchTable(name),
            onExport: () => this.exportCsv(),
            onReset: () => this.reset(),
            onShowSchema: (table) => this.showDatabaseSchema(table),
            onShowStats: (table) => this.showColumnStatistics(table)
        });
        this.sidebar.mount();

        // Toolbar
        this.toolbar = new Toolbar({
            container: this.container.querySelector('#ts-toolbar-container') as HTMLElement,
            onSearch: (term) => {
                this.stateManager.update({ searchValue: term, currentPage: 0 });
                this.fetchData();
            },
            onRefresh: () => this.softRefresh()
        });
        this.toolbar.mount();

        // Keyboard Shortcuts
        this.initKeyboardShortcuts();

        // Bind Settings Button
        const settingsBtn = this.toolbar.getSettingsButton();
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const popup = this.container.querySelector('#ts-settings-popup');
                popup?.classList.toggle('show');
            });
        }

        // Settings Toggles
        const themeToggle = this.container.querySelector('#ts-theme-toggle');
        const densityOpts = this.container.querySelectorAll('.ts-density-opt');
        const app = this.container.querySelector('.ts-app');

        themeToggle?.addEventListener('click', () => {
            this.toggleTheme();
            themeToggle.classList.toggle('on', this.theme === 'dark');
        });

        densityOpts.forEach((btn: any) => {
            btn.addEventListener('click', () => {
                this.density = (btn as HTMLElement).dataset.density as any;
                app?.setAttribute('data-density', this.density);
                densityOpts.forEach((b: any) => b.classList.remove('active'));
                btn.classList.add('active');
                localStorage.setItem('ts-density', this.density);
            });
        });

        // DataGrid
        this.grid = new DataGrid({
            container: this.container.querySelector('#ts-grid-container') as HTMLElement,
            stateManager: this.stateManager,
            onSort: (col, order) => {
                this.stateManager.update({ sortColumn: col, sortOrder: order, currentPage: 0 });
                this.fetchData();
            },
            onFilter: (col, val) => {
                const state = this.stateManager.getState();
                const filters = { ...state.columnFilters };
                if (val) filters[col] = val;
                else delete filters[col];
                this.stateManager.update({ columnFilters: filters, currentPage: 0 });
                this.fetchData();
            },
            onRowSelect: () => this.updateSelectionStatus()
        });
        this.grid.mount();
    }

    private initKeyboardShortcuts() {
        registerDefaultShortcuts({
            onSearch: () => this.toolbar.focusSearch(),
            onExport: () => this.exportCsv(),
            onRefresh: () => this.softRefresh(),
            onReset: () => this.reset(),
            onSelectAll: () => this.grid.selectAll(),
            onClearSelection: () => this.grid.clearSelection(),
            onToggleTheme: () => this.toggleTheme(),
            onShowSchema: () => {
                const state = this.stateManager.getState();
                if (state.activeTableName) this.showDatabaseSchema(state.activeTableName);
            },
            onNextPage: () => this.nextPage(),
            onPrevPage: () => this.prevPage(),
            onFirstPage: () => this.goToPage(0),
            onLastPage: () => {
                const state = this.stateManager.getState();
                const total = Math.ceil(state.totalCount / state.pageSize);
                this.goToPage(total - 1);
            }
        });
    }

    private async loadObject() {
        const token = this.sidebar.getToken();
        const berdl = this.sidebar.getBerdlId();

        if (berdl === 'test/test/test') {
            this.switchApi('test_data');
        } else {
            this.switchApi('default');
            if (!token) { this.showAlert('Auth token required', 'danger'); return; }
        }

        if (!berdl) { this.showAlert('Object ID required', 'danger'); return; }

        this.client.setToken(token);
        this.stateManager.update({ berdlTableId: berdl, loading: true, error: null });

        try {
            const res = await this.client.listTables(berdl);
            const detectedType = this.registry.detectDataType(res);
            if (detectedType) this.configManager.setCurrentDataType(detectedType);

            const tables = res.tables || [];
            this.stateManager.update({ availableTables: tables });

            if (tables.length === 0) { this.showAlert('No tables found', 'warning'); return; }

            this.sidebar.updateTables(tables);

            const initialTable = (this as any)._initialTable;
            const targetTable = initialTable && tables.find((t: any) => t.name === initialTable)
                ? initialTable : tables[0].name;

            this.switchTable(targetTable);

        } catch (e: any) {
            this.showAlert(e.message, 'danger');
            this.stateManager.update({
                availableTables: [],
                activeTableName: null,
                data: [],
                columns: [],
                visibleColumns: new Set()
            });
            this.sidebar.updateTables([]);
        } finally {
            this.stateManager.update({ loading: false });
        }
    }

    private async switchTable(name: string) {
        this.stateManager.update({ activeTableName: name });
        const config = this.configManager.getTableConfig(name);
        this.categoryManager = new CategoryManager(config);

        // Force all categories to be visible initially
        this.categoryManager.showAllCategories();

        this.sidebar.setCategoryManager(this.categoryManager);
        this.sidebar.updateTableInfo(name);

        this.stateManager.update({
            currentPage: 0, sortColumn: null, columnFilters: {}, searchValue: '',
            data: [], headers: [], columns: []
        });

        this.toolbar.setSearch('');
        this.grid.clearSelection();

        // Pre-load dependencies (ontologies) without blocking
        this.loadTableDependencies(name).then(() => {
            const state = this.stateManager.getState();
            if (state.activeTableName === name) {
                // Force re-render of grid to show loaded names
                this.stateManager.update({ data: [...state.data] });
            }
        });

        await this.fetchData();
    }

    private async loadTableDependencies(tableName: string) {
        const config = this.configManager.getTableConfig(tableName);
        const columns = config.columns || [];

        for (const col of columns) {
            if (!col.transform) continue;

            // Handle both single object and array of transforms
            const transforms = Array.isArray(col.transform) ? col.transform : [col.transform];

            for (const transform of transforms) {
                if (transform.type === 'ontology' && transform.options?.lookupTable) {
                    const lookupTable = transform.options.lookupTable;
                    const lookupKey = transform.options.lookupKey || 'id';
                    const lookupValue = transform.options.lookupValue || 'name';

                    try {
                        const state = this.stateManager.getState();
                        if (!state.berdlTableId) continue;

                        // Check if we already have this loaded?

                        // Fetch lookup table data
                        const res = await this.client.getTableData({
                            berdl_table_id: state.berdlTableId,
                            table_name: lookupTable,
                            limit: 10000,
                            offset: 0
                        });

                        // Build map
                        const map: Record<string, string> = {};
                        const headers = res.headers;
                        const keyIdx = headers.indexOf(lookupKey);
                        const valIdx = headers.indexOf(lookupValue);

                        if (keyIdx !== -1 && valIdx !== -1) {
                            res.data.forEach((row: any[]) => {
                                const key = String(row[keyIdx]);
                                const val = String(row[valIdx]);
                                map[key] = val;
                            });

                            // Pre-load into Transformers
                            Transformers.preLoadOntology(map, transform.options.ontologyType || 'custom');
                        }

                    } catch (e) {
                        console.warn(`Failed to load dependency table ${lookupTable}`, e);
                    }
                }
            }
        }
    }

    private async fetchData() {
        const state = this.stateManager.getState();
        if (!state.activeTableName || !state.berdlTableId) return;

        this.stateManager.update({ loading: true });

        try {
            const res = await this.client.getTableData({
                berdl_table_id: state.berdlTableId,
                table_name: state.activeTableName,
                limit: state.pageSize,
                offset: state.currentPage * state.pageSize,
                search_value: state.searchValue || undefined,
                sort_column: state.sortColumn || undefined,
                sort_order: state.sortOrder === 'asc' ? 'ASC' : 'DESC',
                col_filter: Object.keys(state.columnFilters).length ? state.columnFilters : undefined
            });

            this.processColumns(res.headers, state.activeTableName);

            let dataObjects = (res.data || []).map((row: any[]) => {
                const obj: Record<string, any> = {};
                res.headers.forEach((h, i) => { obj[h] = row[i]; });
                return obj;
            });

            // Re-sort client-side to ensure empty/null values are always at the end
            // This overrides server-side sorting to guarantee nulls are last
            if (state.sortColumn && dataObjects.length > 0) {
                dataObjects = this.sortWithNullsLast(dataObjects, state.sortColumn, state.sortOrder || 'asc');
            }

            // Show performance info in UI
            this.updatePerformanceIndicator(res.cached, res.execution_time_ms);

            this.stateManager.update({
                headers: res.headers, 
                data: dataObjects, 
                totalCount: res.total_count || 0,
                queryCached: res.cached || false,
                queryTime: res.execution_time_ms
            });
        } catch (e: any) {
            this.showAlert(e.message, 'danger');
        } finally {
            this.stateManager.update({ loading: false });
        }
    }

    private processColumns(headers: string[], tableName: string) {
        const config = this.configManager.getTableConfig(tableName);
        const configured = config.columns || [];
        const cols: TableColumnConfig[] = [];
        const seen = new Set<string>();

        configured.forEach(c => {
            cols.push({
                ...c,
                visible: c.visible !== false,
                sortable: c.sortable !== false,
                filterable: c.filterable !== false,
                width: c.width || 'auto'
            });
            seen.add(c.column);
        });

        const autoCategorize = (h: string): string[] => {
            const lower = h.toLowerCase();
            if (lower.match(/^(id|name|display_name|label)$/) || lower.endsWith('_id') || lower.endsWith('_name')) return ['core'];
            if (lower.match(/^(deleted|row_hash|last_synced|created_at|updated_at|sync_.*)$/)) return ['metadata'];
            if (lower.match(/^(error|status|report|message|valid|significance)$/)) return ['status'];
            return [];
        };

        headers.forEach(h => {
            if (!seen.has(h)) {
                cols.push({
                    column: h,
                    displayName: h.replace(/_/g, ' '),
                    visible: true,
                    sortable: true,
                    filterable: true,
                    width: 'auto',
                    categories: autoCategorize(h)
                });
            }
        });

        this.stateManager.update({ columns: cols });

        if (this.categoryManager) {
            this.categoryManager.setColumns(cols);
            this.stateManager.update({ visibleColumns: this.categoryManager.getVisibleColumns() });
        }
    }

    private switchApi(apiId: string) {
        const apiConfig = this.configManager.getApi(apiId);
        if (apiConfig) {
            this.client.updateConfig(apiConfig as any);
            this.reset();
        }
    }

    private softRefresh() {
        this.fetchData();
    }

    private reset() {
        this.grid.clearFilterFocus();
        this.stateManager.update({
            sortColumn: null, sortOrder: 'asc', searchValue: '', columnFilters: {}, currentPage: 0
        });
        this.toolbar.setSearch('');
        this.grid.clearSelection();
        this.sidebar.renderFilterChips();
        this.fetchData();
    }

    public nextPage() {
        const state = this.stateManager.getState();
        const total = Math.ceil(state.totalCount / state.pageSize);
        if (state.currentPage < total - 1) {
            this.goToPage(state.currentPage + 1);
        }
    }

    public prevPage() {
        const state = this.stateManager.getState();
        if (state.currentPage > 0) {
            this.goToPage(state.currentPage - 1);
        }
    }

    public goToPage(page: number) {
        if (page >= 0) {
            this.stateManager.update({ currentPage: page });
            this.fetchData();
        }
    }

    public toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('ts-theme', this.theme);
        const app = this.container.querySelector('.ts-app');
        if (app) app.setAttribute('data-theme', this.theme);
    }

    private async exportCsv() {
        const state = this.stateManager.getState();
        if (state.data.length === 0) return;

        const selection = this.grid.getSelection();
        const hasSelection = selection.size > 0;
        const dataToExport = hasSelection
            ? state.data.filter((_, idx) => selection.has(idx))
            : state.data;

        await exportManager.export(dataToExport, {
            format: 'csv',
            filename: `export_${state.activeTableName || 'data'}_${new Date().toISOString().split('T')[0]}`,
            columns: state.columns
                .filter(c => state.visibleColumns.has(c.column))
                .map(c => ({ key: c.column, header: c.displayName || c.column })),
            includeHeaders: true
        });
    }

    private onStateChange(state: AppState) {
        this.updateStatusBar(state);
        this.updatePagination(state);
        this.updateLoadingOverlay(state);
        this.syncStateToUrl();
        if (state.error) this.showAlert(state.error, 'danger');
    }

    private updateLoadingOverlay(state: AppState) {
        if (!this.dom.loadingOverlay) return;

        // Show overlay only for data operations (not initial load)
        // Initial load is handled by the data source section
        const isDataOperation = state.loading && state.availableTables.length > 0;

        if (isDataOperation) {
            this.dom.loadingOverlay.style.display = 'flex';
        } else {
            this.dom.loadingOverlay.style.display = 'none';
        }
    }

    private updateStatusBar(state: AppState) {
        if (!this.dom.status) return;

        let statusHtml = '';
        const perfInfo = [];
        if (state.queryCached) perfInfo.push('⚡ Cached');
        if (state.queryTime !== undefined) perfInfo.push(`${state.queryTime}ms`);
        
        if (state.totalCount > 0) {
            const start = state.currentPage * state.pageSize + 1;
            const end = Math.min((state.currentPage + 1) * state.pageSize, state.totalCount);
            const totalPages = Math.ceil(state.totalCount / state.pageSize);
            statusHtml = `<div style="display:flex;flex-direction:column;gap:2px">
                <div style="font-size:13px;font-weight:600;color:var(--c-text-primary)">Rows: <strong>${start.toLocaleString()}</strong> – <strong>${end.toLocaleString()}</strong> of <strong>${state.totalCount.toLocaleString()}</strong></div>
                <div style="font-size:11px;color:var(--c-text-muted);display:flex;gap:8px;align-items:center">
                    <span>Page ${state.currentPage + 1} of ${totalPages || 1}</span>
                    ${perfInfo.length > 0 ? `<span style="display:flex;align-items:center;gap:4px">${perfInfo.join(' • ')}</span>` : ''}
                </div>
            </div>`;

            const selectionCount = this.grid?.getSelection()?.size || 0;
            if (selectionCount > 0) {
                statusHtml += `<div style="margin-top:4px;font-size:11px"><span class="ts-selection-info">${selectionCount} row${selectionCount !== 1 ? 's' : ''} selected</span></div>`;
            }
        } else {
            statusHtml = '<div style="font-size:13px">Ready</div>';
        }
        this.dom.status.innerHTML = statusHtml;

        // Update table name in footer
        if (this.dom.tableName) {
            if (state.activeTableName) {
                this.dom.tableName.innerHTML = `<span style="color:var(--c-text-muted);font-size:13px;font-weight:500">${state.activeTableName}</span>`;
            } else {
                this.dom.tableName.innerHTML = '';
            }
        }

        // Update grid header
        const gridHeader = this.container.querySelector('#ts-grid-header') as HTMLElement;
        const dbNameEl = this.container.querySelector('#ts-db-name') as HTMLElement;
        const tableNameEl = this.container.querySelector('#ts-active-table-name') as HTMLElement;

        if (gridHeader && dbNameEl && tableNameEl) {
            if (state.activeTableName && state.berdlTableId) {
                gridHeader.style.display = 'block';
                dbNameEl.textContent = state.berdlTableId;
                tableNameEl.textContent = state.activeTableName;
            } else {
                gridHeader.style.display = 'none';
            }
        }
    }

    private updateSelectionStatus() {
        const state = this.stateManager.getState();
        this.updateStatusBar(state);
    }

    private updatePagination(state: AppState) {
        if (!this.dom.pager) return;
        const total = Math.ceil(state.totalCount / state.pageSize);
        const curr = state.currentPage;

        this.dom.pager.innerHTML = `
            <button class="ts-page-btn" data-page="${curr - 1}" ${curr <= 0 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>
            <span class="ts-page-info">${curr + 1} / ${total || 1}</span>
            <button class="ts-page-btn" data-page="${curr + 1}" ${curr >= total - 1 ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>
        `;

        this.dom.pager.querySelectorAll('.ts-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt((btn as HTMLElement).dataset.page || '0');
                if (page >= 0 && page < total) {
                    this.goToPage(page);
                }
            });
        });
    }

    private syncStateToUrl() {
        const state = this.stateManager.getState();
        const params = new URLSearchParams();
        if (state.activeTableName) params.set('table', state.activeTableName);
        if (state.sortColumn) params.set('sort', `${state.sortColumn}:${state.sortOrder}`);
        if (state.currentPage > 0) params.set('page', String(state.currentPage + 1));
        const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
    }

    private loadStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const table = params.get('table');
        if (table) (this as any)._initialTable = table;
    }

    private async loadConfiguration() {
        const newConfigUrl = '/config/index.json';
        try {
            const res = await fetch(newConfigUrl);
            if (res.ok) {
                const appConfig = await res.json();
                if (appConfig.dataTypes) {
                    await this.registry.initialize(appConfig);
                    this.configManager = new ConfigManager(appConfig);
                    return;
                }
            }
        } catch { }

        let config: any = {};
        if (this.configUrl) {
            try { const res = await fetch(this.configUrl); if (res.ok) config = await res.json(); } catch { }
        }
        if (!Object.keys(config).length && (window as any).DEFAULT_CONFIG) config = (window as any).DEFAULT_CONFIG;
        this.configManager = new ConfigManager(config);
    }

    private showAlert(msg: string, type: string) {
        if (this.dom.alert) {
            this.dom.alert.innerHTML = `<div class="ts-alert ts-alert-${type}">${msg}</div>`;
            setTimeout(() => { if (this.dom.alert) this.dom.alert.innerHTML = ''; }, 4000);
        }
    }

    private showDatabaseSchema(initialTable?: string) {
        const state = this.stateManager.getState();
        const tables = state.availableTables || [];
        let searchTerm = '';
        let searchResults: Array<{ table: any; columns: any[]; hasDataMatches?: boolean }> = [];
        let isSearchingData = false;

        const renderSidebar = (active: string | null, searchQuery: string = '') => {
            const hasSearch = searchQuery.trim().length > 0;

            return `
            <div class="glass-sidebar" style="width:260px;display:flex;flex-direction:column;">
                <div style="padding:16px;border-bottom:1px solid var(--c-border-subtle)">
                    <h3 style="font-size:11px;text-transform:uppercase;color:var(--c-text-muted);font-weight:700;letter-spacing:0.08em;display:flex;align-items:center;gap:8px;margin-bottom:12px">
                        <i class="bi bi-database" style="font-size:14px"></i> Database Schema
                    </h3>
                    <div style="position:relative;margin-bottom:8px">
                        <input type="text" id="ts-db-search" placeholder="Search tables, columns, data..." 
                            value="${searchQuery}"
                            style="background:var(--c-bg-input);border:1px solid var(--c-border-subtle);border-radius:var(--radius-sm);font-size:12px;padding:6px 12px 6px 32px;width:100%;outline:none;color:var(--c-text-primary);box-sizing:border-box">
                        <i class="bi bi-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--c-text-muted);pointer-events:none"></i>
                        ${hasSearch ? `<button id="ts-db-search-clear" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--c-text-muted);cursor:pointer;padding:2px;font-size:14px"><i class="bi bi-x"></i></button>` : ''}
                    </div>
                    ${hasSearch ? `
                        <div style="display:flex;gap:4px;margin-top:4px">
                            <button id="ts-search-data-btn" class="ts-btn-secondary" style="flex:1;height:28px;font-size:11px;padding:0 8px;${isSearchingData ? 'opacity:0.6' : ''}" ${isSearchingData ? 'disabled' : ''}>
                                <i class="bi bi-${isSearchingData ? 'hourglass-split' : 'search'}"></i> ${isSearchingData ? 'Searching...' : 'Search Data'}
                            </button>
                        </div>
                    ` : ''}
                </div>
                <div style="flex:1;overflow-y:auto;padding:12px">
                    ${!hasSearch ? `
                        <div class="ts-nav-item ${!active ? 'active' : ''}" data-target="__overview__">
                            <i class="bi bi-grid-1x2"></i> Overview
                        </div>
                        <div style="margin-top:12px;margin-bottom:8px;padding:0 14px">
                            <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--c-text-muted);font-weight:600">Tables (${tables.length})</span>
                        </div>
                        ${tables.map((t: any) => `
                            <div class="ts-nav-item ${active === t.name ? 'active' : ''}" data-target="${t.name}">
                                <i class="bi bi-table"></i> 
                                <span style="flex:1">${t.name}</span>
                                <span style="font-size:11px;color:var(--c-text-muted)">${(t.row_count || 0).toLocaleString()}</span>
                            </div>
                        `).join('')}
                    ` : `
                        <div style="margin-bottom:8px;padding:0 14px">
                            <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--c-text-muted);font-weight:600">
                                ${searchResults.length > 0 ? `Results (${searchResults.length})` : 'No Results'}
                            </span>
                        </div>
                        ${searchResults.length > 0 ? searchResults.map((result: any) => {
                const matchCount = result.columns.length + (result.hasDataMatches ? 1 : 0);
                return `
                                <div class="ts-nav-item ${active === result.table.name ? 'active' : ''}" 
                                     data-target="${result.table.name}" 
                                     data-search="${searchQuery}"
                                     style="cursor:pointer">
                                    <i class="bi bi-table"></i> 
                                    <div style="flex:1;min-width:0">
                                        <div style="font-weight:${active === result.table.name ? '600' : '500'}">${result.table.name}</div>
                                        <div style="font-size:10px;color:var(--c-text-muted);margin-top:2px">
                                            ${matchCount} match${matchCount !== 1 ? 'es' : ''}
                                            ${result.hasDataMatches ? ' • Has data matches' : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
            }).join('') : `
                            <div style="padding:24px;text-align:center;color:var(--c-text-muted)">
                                <i class="bi bi-search" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.5"></i>
                                <div style="font-size:12px">No matches found</div>
                            </div>
                        `}
                    `}
                </div>
            </div>
        `;
        };


        const renderOverview = () => {
            const totalTables = tables.length;
            const totalRecords = tables.reduce((acc: number, t: any) => acc + (t.row_count || 0), 0);

            if (searchTerm && searchResults.length > 0) {
                return `
                    <div style="padding:40px;max-width:960px;margin:0 auto">
                        <div style="margin-bottom:32px">
                            <h2 style="font-size:24px;font-weight:700;color:var(--c-text-primary);margin-bottom:8px">
                                Search Results for "${searchTerm}"
                            </h2>
                            <p style="color:var(--c-text-secondary);font-size:14px">Found ${searchResults.length} table${searchResults.length !== 1 ? 's' : ''} with matches</p>
                        </div>

                        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:16px">
                            ${searchResults.map((result: any) => {
                    const matchCount = result.columns.length + (result.hasDataMatches ? 1 : 0);
                    return `
                                    <div class="ts-card-nav" data-target="${result.table.name}" data-search="${searchTerm}" style="cursor:pointer">
                                        <div style="width:44px;height:44px;background:var(--c-accent-light);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--c-accent);font-size:20px">
                                            <i class="bi bi-table"></i>
                                        </div>
                                        <div style="flex:1">
                                            <div style="font-weight:600;font-size:14px;color:var(--c-text-primary)">${result.table.name}</div>
                                            <div style="font-size:12px;color:var(--c-text-muted);margin-top:4px">
                                                ${matchCount} match${matchCount !== 1 ? 'es' : ''}
                                                ${result.hasDataMatches ? ' • Data matches' : ''}
                                                ${result.columns.length > 0 ? ` • ${result.columns.length} column${result.columns.length !== 1 ? 's' : ''}` : ''}
                                            </div>
                                            ${result.columns.length > 0 ? `
                                                <div style="margin-top:8px;font-size:11px;color:var(--c-text-muted);max-height:60px;overflow-y:auto">
                                                    ${result.columns.slice(0, 3).map((c: any) => `
                                                        <div style="padding:2px 0">• ${c.displayName || c.column}</div>
                                                    `).join('')}
                                                    ${result.columns.length > 3 ? `<div style="padding:2px 0;font-style:italic">+ ${result.columns.length - 3} more</div>` : ''}
                                                </div>
                                            ` : ''}
                                        </div>
                                        <i class="bi bi-chevron-right" style="font-size:14px;color:var(--c-text-muted)"></i>
                                    </div>
                                `;
                }).join('')}
                        </div>
                    </div>
                `;
            }

            return `
                <div style="padding:48px;max-width:900px;margin:0 auto">
                    <div style="text-align:center;margin-bottom:48px">
                        <div style="width:80px;height:80px;background:linear-gradient(135deg, var(--c-accent-light) 0%, var(--c-accent-glow) 100%);color:var(--c-accent);border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:40px;margin:0 auto 20px;box-shadow:0 8px 24px var(--c-accent-glow)">
                            <i class="bi bi-database"></i>
                        </div>
                        <h2 style="font-size:28px;font-weight:700;color:var(--c-text-primary);margin-bottom:8px">Database Overview</h2>
                        <p style="color:var(--c-text-secondary);font-size:14px">${state.berdlTableId || 'Connected Database'}</p>
                    </div>

                    <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:20px;margin-bottom:48px">
                        <div class="glass-panel" style="padding:28px;text-align:center">
                            <div style="font-size:13px;color:var(--c-text-muted);margin-bottom:8px;font-weight:500">Total Tables</div>
                            <div style="font-size:40px;font-weight:700;color:var(--c-text-primary)">${totalTables}</div>
                        </div>
                        <div class="glass-panel" style="padding:28px;text-align:center">
                            <div style="font-size:13px;color:var(--c-text-muted);margin-bottom:8px;font-weight:500">Total Records</div>
                            <div style="font-size:40px;font-weight:700;color:var(--c-text-primary)">${totalRecords.toLocaleString()}</div>
                        </div>
                    </div>

                    <h3 style="font-size:12px;font-weight:700;margin-bottom:20px;color:var(--c-text-muted);text-transform:uppercase;letter-spacing:0.08em">Available Tables</h3>
                    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:16px">
                        ${tables.map((t: any) => `
                            <div class="ts-card-nav" data-target="${t.name}">
                                <div style="width:44px;height:44px;background:var(--c-accent-light);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--c-accent);font-size:20px"><i class="bi bi-table"></i></div>
                                <div style="flex:1">
                                    <div style="font-weight:600;font-size:14px;color:var(--c-text-primary)">${t.name}</div>
                                    <div style="font-size:12px;color:var(--c-text-muted);margin-top:2px">${(t.row_count || 0).toLocaleString()} records</div>
                                </div>
                                <i class="bi bi-chevron-right" style="font-size:14px;color:var(--c-text-muted)"></i>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        };

        const renderTableDetail = (name: string) => {
            const config = this.configManager.getTableConfig(name);
            const isLive = state.activeTableName === name;
            const columns = isLive ? state.columns : (config.columns || []);

            const tableTitle = config?.name || name;
            const tableDesc = config?.settings?.description || 'No description available for this table.';

            return `
                <div style="padding:40px;max-width:960px;margin:0 auto">
                    <div style="margin-bottom:36px">
                        <div style="display:flex;align-items:flex-start;gap:20px">
                            <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg, var(--c-accent-light) 0%, var(--c-accent-glow) 100%);color:var(--c-accent);display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0;box-shadow:0 4px 16px var(--c-accent-glow)">
                                <i class="${config?.settings?.icon || 'bi bi-table'}"></i>
                            </div>
                            <div style="flex:1">
                                <h2 style="font-size:24px;font-weight:700;color:var(--c-text-primary);margin:0 0 8px 0">${tableTitle}</h2>
                                <div style="font-size:14px;color:var(--c-text-secondary);line-height:1.6;margin-bottom:16px;max-width:600px">
                                    ${tableDesc}
                                </div>
                                <div style="display:flex;gap:20px;font-size:13px;color:var(--c-text-muted)">
                                    <span style="display:flex;align-items:center;gap:6px"><i class="bi bi-layout-three-columns"></i> ${columns.length} Columns</span>
                                    ${isLive ? `<span style="display:flex;align-items:center;gap:6px"><i class="bi bi-list-ol"></i> ${state.totalCount?.toLocaleString()} Records</span>` : ''}
                                    <span style="display:flex;align-items:center;gap:6px"><i class="bi bi-${isLive ? 'check-circle-fill" style="color:var(--success)' : 'circle'}"></i> ${isLive ? 'Currently Loaded' : 'Not Loaded'}</span>
                                </div>
                            </div>
                            <button id="ts-export-current" class="ts-btn-secondary" data-table="${name}" style="height:40px;padding:0 20px">
                                <i class="bi bi-download"></i> Export Schema
                            </button>
                        </div>
                    </div>

                    <div class="glass-panel" style="overflow:hidden">
                        <div style="padding:14px 20px;border-bottom:1px solid var(--c-border-subtle);display:flex;justify-content:space-between;align-items:center;background:rgba(248,250,252,0.3)">
                            <h4 style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--c-text-muted);display:flex;align-items:center;gap:8px">
                                <i class="bi bi-list-columns-reverse"></i> Schema Definition
                            </h4>
                            <div style="position:relative">
                                <input type="text" id="ts-schema-filter" placeholder="Search columns..." style="background:var(--c-bg-input);border:1px solid var(--c-border-subtle);border-radius:var(--radius-sm);font-size:12px;padding:6px 12px 6px 32px;width:220px;outline:none;color:var(--c-text-primary)">
                                <i class="bi bi-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--c-text-muted)"></i>
                            </div>
                        </div>
                        <div id="ts-schema-items-container" style="max-height:55vh;overflow-y:auto">
                            ${columns.length === 0 ? '<div style="padding:48px;text-align:center;color:var(--c-text-muted)"><i class="bi bi-info-circle" style="font-size:24px;display:block;margin-bottom:12px;opacity:0.5"></i>No column information available. Load this table to see details.</div>' :
                    columns.map(c => this.renderSchemaItem(c)).join('')}
                        </div>
                    </div>
                </div>
             `;
        };

        const layout = `
            <div style="display:flex;height:100%;overflow:hidden">
                <div id="ts-schema-sidebar">${renderSidebar(initialTable || null)}</div>
                <div id="ts-schema-main" style="flex:1;overflow-y:auto;background:var(--c-bg-app-solid);position:relative">
                    ${initialTable ? renderTableDetail(initialTable) : renderOverview()}
                </div>
            </div>
        `;

        const modal = this.createModal('Database Explorer', layout);
        const modalBody = modal.querySelector('.ts-modal-body') as HTMLElement;
        if (modalBody) {
            modalBody.style.padding = '0';
            modalBody.style.height = 'calc(80vh - 60px)';
        }

        const updateView = (target: string, searchQuery: string = searchTerm) => {
            const sidebar = modal.querySelector('#ts-schema-sidebar');
            const main = modal.querySelector('#ts-schema-main');
            if (sidebar) sidebar.innerHTML = renderSidebar(target === '__overview__' ? null : target, searchQuery);
            if (main) {
                main.innerHTML = target === '__overview__' ? renderOverview() : renderTableDetail(target);
                main.scrollTop = 0;
            }
            bindEvents();
        };

        const performSearch = async (query: string, searchData: boolean = false): Promise<void> => {
            searchTerm = query.trim();
            searchResults = [];

            if (!searchTerm) {
                updateView('__overview__');
                return;
            }

            const queryLower = searchTerm.toLowerCase();

            // Client-side search: tables and columns
            for (const table of tables) {
                const tableMatches = table.name.toLowerCase().includes(queryLower);
                const config = this.configManager.getTableConfig(table.name);
                const isLive = state.activeTableName === table.name;
                const columns = isLive ? state.columns : (config.columns || []);

                const matchingColumns = columns.filter((c: any) => {
                    const colName = (c.displayName || c.column || '').toLowerCase();
                    const colKey = (c.column || '').toLowerCase();
                    const desc = (c.description || '').toLowerCase();
                    return colName.includes(queryLower) || colKey.includes(queryLower) || desc.includes(queryLower);
                });

                if (tableMatches || matchingColumns.length > 0) {
                    searchResults.push({
                        table,
                        columns: matchingColumns,
                        hasDataMatches: false
                    });
                }
            }

            // API-based search for cell values if requested
            if (searchData && state.berdlTableId) {
                isSearchingData = true;
                const sidebar = modal.querySelector('#ts-schema-sidebar');
                if (sidebar) sidebar.innerHTML = renderSidebar(null, searchTerm);
                bindEvents();

                const dataSearchPromises = tables.map(async (table: any) => {
                    try {
                        const res = await this.client.getTableData({
                            berdl_table_id: state.berdlTableId!,
                            table_name: table.name,
                            limit: 1,
                            offset: 0,
                            search_value: searchTerm
                        });

                        if (res.total_count > 0) {
                            const existing = searchResults.find(r => r.table.name === table.name);
                            if (existing) {
                                existing.hasDataMatches = true;
                            } else {
                                searchResults.push({
                                    table,
                                    columns: [],
                                    hasDataMatches: true
                                });
                            }
                        }
                    } catch (e) {
                        console.warn(`Failed to search data in table ${table.name}`, e);
                    }
                });

                await Promise.all(dataSearchPromises);
                isSearchingData = false;
            }

            updateView('__overview__');
        };

        const bindEvents = () => {
            // Database search input
            const dbSearchInput = modal.querySelector('#ts-db-search') as HTMLInputElement;
            const dbSearchClear = modal.querySelector('#ts-db-search-clear');
            const searchDataBtn = modal.querySelector('#ts-search-data-btn');

            if (dbSearchInput) {
                let searchDebounce: any = null;
                dbSearchInput.addEventListener('input', () => {
                    const query = dbSearchInput.value;
                    searchTerm = query;

                    if (searchDebounce) clearTimeout(searchDebounce);
                    searchDebounce = setTimeout(() => {
                        performSearch(query, false);
                    }, 300);
                });

                dbSearchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (searchDebounce) clearTimeout(searchDebounce);
                        performSearch(dbSearchInput.value, false);
                    }
                });
            }

            if (dbSearchClear) {
                dbSearchClear.addEventListener('click', () => {
                    if (dbSearchInput) dbSearchInput.value = '';
                    searchTerm = '';
                    searchResults = [];
                    isSearchingData = false;
                    updateView('__overview__', '');
                });
            }

            if (searchDataBtn) {
                searchDataBtn.addEventListener('click', async () => {
                    if (!searchTerm || isSearchingData) return;
                    await performSearch(searchTerm, true);
                });
            }

            // Navigation items and cards
            modal.querySelectorAll('.ts-nav-item, .ts-card-nav').forEach(el => {
                el.addEventListener('click', () => {
                    const target = (el as HTMLElement).dataset.target;
                    const searchQuery = (el as HTMLElement).dataset.search;
                    if (target) {
                        if (target !== '__overview__' && searchQuery) {
                            // Close modal and load table with search
                            const closeBtn = modal.querySelector('.ts-modal-close') as HTMLElement;
                            if (closeBtn) closeBtn.click();

                            // Switch to the table and apply search
                            this.switchTable(target).then(() => {
                                this.stateManager.update({ searchValue: searchQuery, currentPage: 0 });
                                this.fetchData();
                            });
                        } else {
                            updateView(target, searchQuery || searchTerm);
                        }
                    }
                });
            });

            // Column filter in table detail view
            const input = modal.querySelector('#ts-schema-filter') as HTMLInputElement;
            const container = modal.querySelector('#ts-schema-items-container');
            if (input && container) {
                input.addEventListener('input', () => {
                    const term = input.value.toLowerCase();
                    container.querySelectorAll('.ts-schema-item').forEach(item => {
                        const text = (item.textContent || '').toLowerCase();
                        (item as HTMLElement).style.display = text.includes(term) ? 'flex' : 'none';
                    });
                });
            }

            const exp = modal.querySelector('#ts-export-current');
            exp?.addEventListener('click', () => {
                const table = (exp as HTMLElement).dataset.table;
                if (!table) return;
                const config = this.configManager.getTableConfig(table);
                const cols = (state.activeTableName === table) ? state.columns : (config.columns || []);
                const schemaData = JSON.stringify(config || { tableName: table, columns: cols }, null, 2);
                const blob = new Blob([schemaData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${table}_schema.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
        };

        bindEvents();
    }

    private renderSchemaItem(c: any) {
        const badges = [];
        if (c.sortable) badges.push({ l: 'Sortable', bg: '#dbeafe', fg: '#1d4ed8' });
        if (c.filterable) badges.push({ l: 'Filterable', bg: '#d1fae5', fg: '#059669' });
        if (c.copyable) badges.push({ l: 'Copyable', bg: '#e2e8f0', fg: '#475569' });
        if (c.pin) badges.push({ l: 'Pinned', bg: '#ede9fe', fg: '#7c3aed' });

        const badgeHtml = badges.map(b =>
            `<span style="font-size:10px;padding:3px 8px;border-radius:4px;background:${b.bg};color:${b.fg};margin-right:6px;font-weight:500">${b.l}</span>`
        ).join('');

        return `
            <div class="ts-schema-item">
                <div style="padding-top:4px;flex-shrink:0"><i class="bi bi-hash" style="color:var(--c-accent);font-size:16px"></i></div>
                <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:12px">
                        <span class="ts-schema-name">${c.displayName || c.column}</span>
                        <span class="ts-schema-type">${c.dataType || 'string'}</span>
                    </div>
                    ${c.description ? `<div class="ts-schema-desc">${c.description}</div>` : ''}
                    <div style="display:flex;align-items:center;margin-top:8px;flex-wrap:wrap;gap:4px">
                        ${badgeHtml}
                        <span style="font-size:11px;color:var(--c-text-muted);font-family:'JetBrains Mono',monospace;margin-left:auto">col: ${c.column}</span>
                    </div>
                </div>
            </div>
        `;
    }

    private isValueEmpty(value: any): boolean {
        // Check for null or undefined
        if (value === null || value === undefined) return true;

        // Check for empty string or whitespace-only string
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed === '' || trimmed.length === 0) return true;
            // Also treat common "empty" representations as empty
            if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined' || trimmed === '-') return true;
        }

        // Check for empty array
        if (Array.isArray(value) && value.length === 0) return true;

        // Check for NaN (which should be treated as empty for sorting)
        if (typeof value === 'number' && isNaN(value)) return true;

        // Check for empty object (no keys)
        if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return true;

        return false;
    }

    private sortWithNullsLast(data: Record<string, any>[], column: string, order: 'asc' | 'desc'): Record<string, any>[] {
        if (!data || data.length === 0 || !column) return data;

        // Verify column exists in at least one row
        const hasColumn = data.some(row => column in row);
        if (!hasColumn) return data;

        return [...data].sort((a, b) => {
            // Get values - handle missing column gracefully
            const aValue = a?.[column];
            const bValue = b?.[column];

            const aEmpty = this.isValueEmpty(aValue);
            const bEmpty = this.isValueEmpty(bValue);

            // CRITICAL: Empty values ALWAYS go to the end, regardless of sort order (asc or desc)
            // This ensures empty/null values never appear at the top

            // If both are empty, maintain original order
            if (aEmpty && bEmpty) return 0;

            // If only a is empty, it goes to the end (return positive = a comes after b)
            if (aEmpty) return 1;

            // If only b is empty, it goes to the end (return negative = b comes after a)
            if (bEmpty) return -1;

            // Both have non-empty values, compare normally
            let comparison = 0;

            // Handle different data types
            const aType = typeof aValue;
            const bType = typeof bValue;

            if (aType === 'number' && bType === 'number') {
                // Both are numbers
                if (isNaN(aValue) && isNaN(bValue)) return 0;
                if (isNaN(aValue)) return 1; // NaN goes to end
                if (isNaN(bValue)) return -1; // NaN goes to end
                comparison = aValue - bValue;
            } else if (aValue instanceof Date && bValue instanceof Date) {
                comparison = aValue.getTime() - bValue.getTime();
            } else {
                // Convert to string for comparison (handles mixed types)
                const aStr = String(aValue ?? '').trim().toLowerCase();
                const bStr = String(bValue ?? '').trim().toLowerCase();

                if (aStr < bStr) {
                    comparison = -1;
                } else if (aStr > bStr) {
                    comparison = 1;
                } else {
                    comparison = 0;
                }
            }

            // Apply sort order (asc or desc)
            // Note: Empty values are already handled above and will always be at the end
            return order === 'desc' ? -comparison : comparison;
        });
    }

    /**
     * Load database from a file (client-side only, for URL parameter support)
     * @param dbFilename - Database filename without .db extension
     */
    public async loadDatabaseFromFile(dbFilename: string): Promise<void> {
        try {
            this.stateManager.update({ loading: true, error: null });

            // Construct paths (client-side, relative to public/)
            const dbPath = `/data/${dbFilename}.db`;
            const configPath = `/config/${dbFilename}.json`;

            // Try to load config if available
            let config: any = null;
            try {
                const configResponse = await fetch(configPath);
                if (configResponse.ok) {
                    config = await configResponse.json();
                    this.registry.registerDataType(config);
                    this.configManager.setCurrentDataType(config.id || dbFilename);
                }
            } catch (error) {
                console.warn('No config file found, using default:', error);
            }

            // Use LocalDbClient to load the database (client-side)
            const { LocalDbClient } = await import('../core/api/LocalDbClient');
            const localDb = LocalDbClient.getInstance();

            // Create a temporary UPA for this database
            const tempUpa = `local/${dbFilename}`;
            
            // Load the database
            await localDb.loadDatabase(dbPath);

            // Get table list
            const tablesResult = await localDb.listTablesFromDb(dbPath, config);
            const tables = tablesResult.tables || [];

            if (tables.length === 0) {
                throw new Error('No tables found in database');
            }

            this.stateManager.update({ 
                availableTables: tables,
                berdlTableId: tempUpa
            });

            this.sidebar.updateTables(tables);

            // Load the first table
            const targetTable = tables[0].name;
            await this.switchTable(targetTable);

            this.showAlert(`Loaded database: ${dbFilename}`, 'success');
        } catch (error: any) {
            this.showAlert(error.message || 'Failed to load database', 'danger');
            this.stateManager.update({
                availableTables: [],
                activeTableName: null,
                data: [],
                columns: [],
                visibleColumns: new Set(),
                loading: false
            });
            throw error;
        } finally {
            this.stateManager.update({ loading: false });
        }
    }

    private updatePerformanceIndicator(cached?: boolean, executionTime?: number) {
        if (!this.dom.performance) return;

        const show = cached !== undefined || executionTime !== undefined;
        if (this.dom.performance) {
            (this.dom.performance as HTMLElement).style.display = show ? 'flex' : 'none';
        }

        if (this.dom.perfCached) {
            (this.dom.perfCached as HTMLElement).style.display = cached ? 'inline-flex' : 'none';
        }

        if (this.dom.perfTime && executionTime !== undefined) {
            (this.dom.perfTime as HTMLElement).textContent = `${executionTime}ms`;
            (this.dom.perfTime as HTMLElement).style.display = 'inline-flex';
        } else if (this.dom.perfTime) {
            (this.dom.perfTime as HTMLElement).style.display = 'none';
        }
    }

    private async showColumnStatistics(tableName: string) {
        const state = this.stateManager.getState();
        if (!state.berdlTableId || !tableName) {
            this.showAlert('No table selected', 'warning');
            return;
        }

        try {
            this.stateManager.update({ loading: true });
            
            // Get stats from server
            const dbName = state.berdlTableId.replace('local/', '');
            const serverPort = '3000';
            const statsResponse = await fetch(`http://localhost:${serverPort}/object/${dbName}/tables/${tableName}/stats`);
            
            if (!statsResponse.ok) {
                throw new Error('Failed to load statistics');
            }

            const stats = await statsResponse.json();
            
            // Format stats for display
            const statsHtml = `
                <div style="padding:24px;max-width:800px">
                    <h2 style="margin-bottom:20px;font-size:18px;font-weight:600">
                        <i class="bi bi-graph-up"></i> Column Statistics: ${tableName}
                    </h2>
                    <div style="margin-bottom:16px;padding:12px;background:var(--c-bg-surface-alt);border-radius:var(--radius-sm);font-size:13px">
                        <strong>Total Rows:</strong> ${stats.row_count.toLocaleString()}
                    </div>
                    <div style="display:grid;gap:12px">
                        ${stats.columns.map((col: any) => `
                            <div style="padding:16px;background:var(--c-bg-surface);border:1px solid var(--c-border-subtle);border-radius:var(--radius-md)">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                                    <h3 style="font-size:14px;font-weight:600">${col.column}</h3>
                                    <span style="font-size:11px;color:var(--c-text-muted);text-transform:uppercase">${col.type}</span>
                                </div>
                                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;font-size:12px">
                                    <div><strong>Nulls:</strong> ${col.null_count.toLocaleString()}</div>
                                    <div><strong>Distinct:</strong> ${col.distinct_count.toLocaleString()}</div>
                                    ${col.min !== undefined ? `<div><strong>Min:</strong> ${col.min}</div>` : ''}
                                    ${col.max !== undefined ? `<div><strong>Max:</strong> ${col.max}</div>` : ''}
                                    ${col.mean !== undefined ? `<div><strong>Mean:</strong> ${col.mean.toFixed(2)}</div>` : ''}
                                    ${col.median !== undefined ? `<div><strong>Median:</strong> ${col.median}</div>` : ''}
                                    ${col.stddev !== undefined ? `<div><strong>StdDev:</strong> ${col.stddev.toFixed(2)}</div>` : ''}
                                </div>
                                ${col.sample_values && col.sample_values.length > 0 ? `
                                    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--c-border-subtle)">
                                        <div style="font-size:11px;color:var(--c-text-muted);margin-bottom:6px">Sample Values:</div>
                                        <div style="display:flex;flex-wrap:gap:4px">
                                            ${col.sample_values.slice(0, 10).map((v: any) => `
                                                <span style="padding:2px 8px;background:var(--c-bg-surface-alt);border-radius:4px;font-size:11px;font-family:monospace">${String(v).substring(0, 30)}</span>
                                            `).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            this.createModal(`Column Statistics: ${tableName}`, statsHtml);
        } catch (error: any) {
            this.showAlert(`Failed to load statistics: ${error.message}`, 'danger');
        } finally {
            this.stateManager.update({ loading: false });
        }
    }

    private createModal(title: string, bodyHtml: string): HTMLElement {
        const existing = document.querySelector('.ts-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'ts-modal-overlay';
        overlay.innerHTML = `
            <div class="ts-modal">
                <div class="ts-modal-header">
                    <span class="ts-modal-title">${title}</span>
                    <button class="ts-modal-close"><i class="bi bi-x-lg"></i></button>
                </div>
                <div class="ts-modal-body">${bodyHtml}</div>
            </div>
        `;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));

        const close = () => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 200);
        };

        overlay.querySelector('.ts-modal-close')?.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        return overlay;
    }
}
