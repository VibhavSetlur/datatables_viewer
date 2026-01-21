/**
 * TableRenderer - Research-Grade Scientific Data Viewer
 * Orchestrator (Controller)
 */

import { ApiClient } from '../core/api/ApiClient';
import { DataTypeRegistry } from '../core/config/DataTypeRegistry';
import { ConfigManager, type TableColumnConfig } from '../core/config/ConfigManager';
import { StateManager, type AppState } from '../core/state/StateManager';
import { logger } from '../utils/logger';
import { CategoryManager } from '../core/managers/CategoryManager';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { DataGrid } from './components/DataGrid';
import { SchemaViewer } from './components/SchemaViewer';
import { StatisticsViewer } from './components/StatisticsViewer';
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
    private schemaViewer!: SchemaViewer;
    private statsViewer!: StatisticsViewer;

    private theme: 'light' | 'dark' = 'light';
    private density: 'compact' | 'normal' | 'comfortable' = 'normal';
    private dom: Record<string, HTMLElement> = {};
    private columnSchemas: Record<string, Record<string, { type: string; notnull: boolean; pk: boolean }>> = {}; // tableName -> columnName -> schema

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

            const currentApiId = defaultApiId || (apis.length > 0 ? apis[0].id : null);

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

    }

    private initComponents() {
        // Sidebar
        this.sidebar = new Sidebar({
            container: this.container.querySelector('#ts-sidebar-container') as HTMLElement,
            configManager: this.configManager,
            stateManager: this.stateManager,
            onApiChange: (id) => this.switchApi(id),
            onLoadData: () => this.handleLoadData(),
            onTableChange: (name) => this.switchTable(name),
            onExport: () => this.exportCsv(),
            onReset: () => this.reset(),
            onShowSchema: (table) => this.showDatabaseSchema(table),
            onShowStats: (table) => this.showColumnStatistics(table),
            onLoadDbPath: (dbPath) => this.loadDatabaseFromPath(dbPath),
        });
        this.sidebar.mount();

        // Toolbar
        this.toolbar = new Toolbar({
            container: this.container.querySelector('#ts-toolbar-container') as HTMLElement,
            onSearch: (term) => {
                const trimmedTerm = term ? term.trim() : '';
                // Global search only highlights - doesn't filter rows
                // Update state to trigger re-render with highlighting
                // Only refetch if we need to (e.g., if column filters changed)
                // For now, just update state - DataGrid will re-render automatically
                this.stateManager.update({ searchValue: trimmedTerm });
                // Note: We don't call fetchData() here because global search doesn't filter
                // The grid will re-render automatically via state subscription to apply highlighting
            },
            onRefresh: () => this.softRefresh(),
            onSearchNext: () => {
                if (this.grid) {
                    this.grid.navigateToNextMatch();
                    this.toolbar.updateSearchNav();
                }
            },
            onSearchPrev: () => {
                if (this.grid) {
                    this.grid.navigateToPreviousMatch();
                    this.toolbar.updateSearchNav();
                }
            },
            getSearchMatchInfo: () => {
                return this.grid ? this.grid.getSearchMatchInfo() : { current: 0, total: 0 };
            }
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
            onFilter: async (col, val) => {
                const state = this.stateManager.getState();
                if (!state.activeTableName) return;

                // Parse filter with smart operator detection
                const { parseFilterInput, normalizeColumnType } = await import('../utils/filter-parser');
                const columnType = normalizeColumnType(this.getColumnType(state.activeTableName, col));
                const parsed = parseFilterInput(val, columnType);

                if (parsed && val.trim()) {
                    // Convert to advanced filter
                    const advancedFilters = state.advancedFilters || [];
                    const existingIdx = advancedFilters.findIndex(f => f.column === col);

                    if (existingIdx >= 0) {
                        advancedFilters[existingIdx] = {
                            column: col,
                            operator: parsed.operator,
                            value: parsed.value,
                            value2: parsed.value2
                        };
                    } else {
                        advancedFilters.push({
                            column: col,
                            operator: parsed.operator,
                            value: parsed.value,
                            value2: parsed.value2
                        });
                    }

                    // Also keep simple filter for display
                    const filters = { ...state.columnFilters };
                    filters[col] = val;

                    this.stateManager.update({
                        columnFilters: filters,
                        advancedFilters: advancedFilters.length > 0 ? advancedFilters : undefined,
                        currentPage: 0
                    });
                    
                    // Trigger re-render of filter chips
                    this.sidebar.renderFilterChips();
                } else {
                    // Clear filter
                    const filters = { ...state.columnFilters };
                    delete filters[col];
                    const advancedFilters = (state.advancedFilters || []).filter(f => f.column !== col);

                    this.stateManager.update({
                        columnFilters: filters,
                        advancedFilters: advancedFilters.length > 0 ? advancedFilters : undefined,
                        currentPage: 0
                    });
                    
                    // Trigger re-render of filter chips
                    this.sidebar.renderFilterChips();
                }

                this.fetchData();
            },
            getColumnType: (col) => {
                const state = this.stateManager.getState();
                return state.activeTableName ? this.getColumnType(state.activeTableName, col) : 'TEXT';
            },
            onRowSelect: () => this.updateSelectionStatus()
        });
        this.grid.mount();

        this.schemaViewer = new SchemaViewer({
            configManager: this.configManager,
            stateManager: this.stateManager,
            client: this.client,
            createModal: this.createModal.bind(this),
            switchTable: this.switchTable.bind(this),
            fetchData: this.fetchData.bind(this),
            getSchemaForTable: async (tableName: string) => {
                await this.loadTableSchema(tableName);
                return this.getSchemaColumns(tableName);
            },
            getConfigColumns: (tableName: string) => {
                const config = this.configManager.getTableConfig(tableName);
                return config?.columns || [];
            },
            getStateColumns: () => this.stateManager.getState().columns
        });

        this.statsViewer = new StatisticsViewer({
            stateManager: this.stateManager,
            createModal: this.createModal.bind(this),
            showAlert: this.showAlert.bind(this)
        });
    }

    /**
     * Handle "Load Data" actions from the sidebar.
     *
     * Behavior:
     * - If no database is currently loaded (no berdlTableId or no available tables),
     *   this will perform a full object load via `loadObject()`.
     * - If a database is already loaded, this will only re-fetch table data
     *   using the current filters/sort/search via `fetchData()`, so existing
     *   column filters and advanced filters are preserved.
     */
    private handleLoadData() {
        const state = this.stateManager.getState();

        // If we don't have a loaded database yet (or the last load failed),
        // perform a full load. This also covers error cases where berdlTableId
        // is set but no tables were loaded.
        if (!state.berdlTableId || state.availableTables.length === 0) {
            this.loadObject();
            return;
        }

        // Database is already loaded – just refresh data with current filters.
        this.fetchData();
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

        // Validate input
        if (!berdl || berdl.trim() === '') {
            this.showAlert('Object ID or database name is required', 'danger');
            return;
        }

        const trimmedBerdl = berdl.trim();

        if (trimmedBerdl === 'test/test/test') {
            this.switchApi('test_data');
        } else {
            this.switchApi('default');
            // Check if this is a local database (doesn't need token)
            const { LocalDbClient } = await import('../core/api/LocalDbClient');
            const isLocal = LocalDbClient.isLocalDb(trimmedBerdl);

            if (!isLocal && !token) {
                this.showAlert('Auth token required for remote databases', 'danger');
                return;
            }
        }

        this.client.setToken(token || '');
        this.stateManager.update({ berdlTableId: trimmedBerdl, loading: true, error: null });

        try {
            // Try to load tables
            let res: any;
            let errorMessage = '';
            let triedFallback = false;

            try {
                res = await this.client.listTables(trimmedBerdl);
            } catch (primaryError: any) {
                errorMessage = primaryError.message || 'Failed to load database';

                // Check if this might be a local database and try fallback
                const { LocalDbClient } = await import('../core/api/LocalDbClient');
                const isLocal = LocalDbClient.isLocalDb(trimmedBerdl);

                if (!isLocal && trimmedBerdl.startsWith('local/')) {
                    // Try as local database file
                    const dbName = trimmedBerdl.replace('local/', '');
                    try {
                        await this.loadDatabaseFromFile(dbName);
                        return; // Successfully loaded via file
                    } catch (fileError: any) {
                        triedFallback = true;
                        errorMessage = `Remote API failed: ${primaryError.message}. Local file also failed: ${fileError.message}`;
                    }
                } else if (isLocal) {
                    // Already a local database, try direct file load
                    const dbName = trimmedBerdl.replace('local/', '');
                    try {
                        await this.loadDatabaseFromFile(dbName);
                        return; // Successfully loaded via file
                    } catch (fileError: any) {
                        triedFallback = true;
                        errorMessage = `Failed to load local database: ${fileError.message}`;
                    }
                }

                // If we get here, all attempts failed
                throw new Error(errorMessage);
            }

            // Check if response is valid
            if (!res) {
                throw new Error('No response from server');
            }

            // Check if tables were found
            const tables = res.tables || [];

            if (tables.length === 0) {
                const message = `No tables found in database "${trimmedBerdl}". The database may be empty or inaccessible.`;
                this.showAlert(message, 'warning');
                this.stateManager.update({
                    availableTables: [],
                    activeTableName: null,
                    data: [],
                    columns: [],
                    visibleColumns: new Set(),
                    loading: false
                });
                this.sidebar.updateTables([]);
                return;
            }

            // Extract schema info for config resolution
            let schemaInfo = this.extractSchemaInfo(res, tables);
            
            // If schema not in response, try fetching it
            if (Object.keys(schemaInfo.columns).length === 0) {
                const fetchedSchema = await this.fetchSchemaInfo(trimmedBerdl);
                if (fetchedSchema) {
                    schemaInfo = fetchedSchema;
                }
            }
            
            // Resolve config with schema-based fallback
            const { getConfigResolver } = await import('../core/config/ConfigResolver');
            const resolver = getConfigResolver();
            const resolveResult = await resolver.resolve(trimmedBerdl, {
                objectType: res.object_type || res.type,
                schema: schemaInfo.tables.length > 0 ? schemaInfo : undefined,
            });

            // Show warning if config not found
            if (resolveResult.warning) {
                this.showAlert(resolveResult.warning, 'warning');
            }

            // Register and set config
            if (resolveResult.config) {
                this.registry.registerDataType(resolveResult.config);
                this.configManager.setCurrentDataType(resolveResult.config.id);
            } else {
                // Fallback to detection
                const detectedType = this.registry.detectDataType(res);
                if (detectedType) this.configManager.setCurrentDataType(detectedType);
            }

            this.stateManager.update({ availableTables: tables });
            this.sidebar.updateTables(tables);

            const initialTable = (this as any)._initialTable;
            const targetTable = initialTable && tables.find((t: any) => t.name === initialTable)
                ? initialTable : tables[0].name;

            // Show success message
            const successMsg = triedFallback
                ? `Loaded database "${trimmedBerdl}" (using fallback method)`
                : `Loaded database "${trimmedBerdl}" - ${tables.length} table${tables.length !== 1 ? 's' : ''} found`;
            this.showAlert(successMsg, 'success');

            await this.switchTable(targetTable);

        } catch (e: any) {
            // Provide detailed error message
            let errorMsg = e.message || 'Failed to load database';

            // Enhance error messages based on error type
            if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
                errorMsg = `Database or object "${trimmedBerdl}" not found. Please check the ID and try again.`;
            } else if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
                // Check if it's a Shock API access issue (TableScanner can't access the database)
                if (errorMsg.includes('shock-api') || errorMsg.includes('Failed to access database')) {
                    errorMsg = `TableScanner cannot access the database. This usually means:\n` +
                        `1. Your token doesn't have permission to access object "${trimmedBerdl}"\n` +
                        `2. The object exists in a different environment (prod vs appdev)\n` +
                        `3. The token is expired or invalid\n\n` +
                        `Original error: ${errorMsg}`;
                } else {
                    errorMsg = `Authentication failed. Please check your token and try again.\n\nDetails: ${errorMsg}`;
                }
            } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
                errorMsg = `Access denied to database "${trimmedBerdl}". Please check your permissions.\n\nDetails: ${errorMsg}`;
            } else if (errorMsg.includes('500') || errorMsg.includes('Internal Server Error')) {
                // TableScanner server error - often means it can't access Shock API
                if (errorMsg.includes('shock-api') || errorMsg.includes('Failed to access database')) {
                    errorMsg = `TableScanner service error: Cannot access database from KBase.\n\n` +
                        `This usually means:\n` +
                        `• Your token doesn't have permission to access this object\n` +
                        `• The object is in a different environment than your token\n` +
                        `• Try using a token from the correct environment (appdev vs prod)\n\n` +
                        `Error details: ${errorMsg}`;
                } else {
                    errorMsg = `TableScanner service error: ${errorMsg}`;
                }
            } else if (errorMsg.includes('Network') || errorMsg.includes('fetch')) {
                errorMsg = `Network error: Unable to connect to database service. Please check your connection and try again.`;
            } else if (errorMsg.includes('Failed to load database')) {
                // Already descriptive, but add context
                errorMsg = `${errorMsg}\n\nThis may be a permissions issue. Verify your token has access to object "${trimmedBerdl}".`;
            } else {
                errorMsg = `Failed to load database "${trimmedBerdl}": ${errorMsg}`;
            }

            this.showAlert(errorMsg, 'danger');
            this.stateManager.update({
                availableTables: [],
                activeTableName: null,
                data: [],
                columns: [],
                visibleColumns: new Set(),
                loading: false,
                error: errorMsg
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
        // Initial visibility will be set when data is loaded

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
            // Only send col_filter for columns that don't have advanced filters
            // Advanced filters take precedence and handle parsed operators correctly
            const colFilter: Record<string, any> = {};
            const advancedFilterColumns = new Set(state.advancedFilters?.map(f => f.column) || []);
            
            for (const [col, value] of Object.entries(state.columnFilters)) {
                // Skip columns that have advanced filters (they're already handled)
                if (!advancedFilterColumns.has(col) && value !== undefined && value !== null && value !== '') {
                    colFilter[col] = value;
                }
            }

            // Global search is now client-side only (highlighting only, no filtering)
            // Column filters still filter rows server-side
            const res = await this.client.getTableData({
                berdl_table_id: state.berdlTableId,
                table_name: state.activeTableName,
                limit: state.pageSize,
                offset: state.currentPage * state.pageSize,
                // NOTE: search_value is intentionally NOT sent - global search only highlights, doesn't filter
                // Column filters (col_filter, filters) still filter rows as expected
                sort_column: state.sortColumn || undefined,
                sort_order: state.sortOrder === 'asc' ? 'ASC' : 'DESC',
                col_filter: Object.keys(colFilter).length > 0 ? colFilter : undefined,
                filters: state.advancedFilters,
                aggregations: state.aggregations,
                group_by: state.groupBy
            });

            this.processColumns(res.headers, state.activeTableName);

            // Use schema from response if available, otherwise load
            // Use schema from response if available, otherwise load
            const tableName = state.activeTableName;
            if (res.column_schema && res.column_schema.length > 0 && tableName) {
                // Cache schema from response
                if (!this.columnSchemas[tableName]) {
                    this.columnSchemas[tableName] = {};
                }
                const schema = res.column_schema || [];
                schema.forEach(col => {
                    this.columnSchemas[tableName][col.name] = {
                        type: col.type,
                        notnull: col.notnull,
                        pk: col.pk
                    };
                });
            } else if (state.activeTableName) {
                // Fallback to loading schema
                await this.loadTableSchema(state.activeTableName);
            }

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



            this.stateManager.update({
                headers: res.headers,
                data: dataObjects,
                totalCount: res.total_count || 0,
                queryCached: res.cached || false,
                queryTime: res.execution_time_ms
            });

            // Update search navigation after data loads
            if (this.toolbar && this.grid) {
                // Use requestAnimationFrame to ensure DOM is updated
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        this.toolbar.updateSearchNav();
                    }, 50);
                });
            }
        } catch (error: any) {
            const errorMsg = error?.message || 'Failed to load table data';
            logger.error('Failed to fetch table data', error);
            this.showAlert(errorMsg, 'danger');
            this.stateManager.update({
                data: [],
                headers: [],
                columns: [],
                error: errorMsg
            });
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
                width: c.width || 'auto',  // Default to 'auto', but will have min-width in CSS
                categories: c.categories || []  // Preserve categories from config
            });
            seen.add(c.column);
        });

        const autoCategorize = (h: string): string[] => {
            const lower = h.toLowerCase();
            const categories: string[] = [];

            // Core identifiers and names
            if (lower.match(/^(id|name|display_name|label)$/) ||
                lower.endsWith('_id') ||
                lower.endsWith('_name') ||
                lower.includes('locus') ||
                lower.includes('symbol') ||
                lower.includes('alias') ||
                lower.includes('contig')) {
                categories.push('core');
            }

            // Functional annotation
            if (lower.includes('function') ||
                lower.includes('product') ||
                lower.includes('annotation') ||
                lower.includes('subsystem') ||
                lower.includes('class') ||
                lower.includes('reaction') ||
                lower.includes('ec') ||
                lower.includes('cog') ||
                lower.includes('pfam') ||
                lower.includes('tigrfam') ||
                lower.includes('go') ||
                lower.includes('kegg') ||
                lower.includes('note') ||
                lower.includes('inference') ||
                lower.includes('type')) {
                categories.push('functional');
            }

            // External links and references
            if (lower.includes('uniprot') ||
                lower.includes('xref') ||
                lower.includes('reference') ||
                lower.includes('link') ||
                lower.includes('url') ||
                lower.includes('dbxref')) {
                categories.push('external');
            }

            // Sequence data
            if (lower.includes('sequence') ||
                lower.includes('start') ||
                lower.includes('stop') ||
                lower.includes('length') ||
                lower.includes('strand') ||
                lower.includes('protein_length') ||
                lower.includes('molecular_weight') ||
                lower.includes('isoelectric')) {
                categories.push('sequence');
            }

            // System metadata
            if (lower.match(/^(deleted|row_hash|last_synced|created_at|updated_at|sync_.*)$/) ||
                lower.includes('hash') ||
                lower.includes('sync')) {
                categories.push('metadata');
            }

            // Status and reports
            if (lower.match(/^(error|status|report|message|valid|significance)$/) ||
                lower.includes('error') ||
                lower.includes('valid')) {
                categories.push('status');
            }

            // If no categories matched, default to 'core' for IDs or 'functional' for others
            if (categories.length === 0) {
                if (lower.match(/^[a-z_]*id$/i) || lower.endsWith('_id')) {
                    categories.push('core');
                } else {
                    // Default to functional for unknown columns (better than uncategorized)
                    categories.push('functional');
                }
            }

            return categories;
        };

        headers.forEach(h => {
            if (!seen.has(h)) {
                cols.push({
                    column: h,
                    displayName: h.replace(/_/g, ' '),
                    visible: true,
                    sortable: true,
                    filterable: true,
                    width: 'auto',  // Default to 'auto', but will have min-width in CSS
                    categories: autoCategorize(h)
                });
            }
        });

        this.stateManager.update({ columns: cols });

        if (this.categoryManager) {
            this.categoryManager.setColumns(cols);
            
            // Preserve existing visible columns - only initialize if empty
            // This prevents resetting column selections when filters are applied
            const currentState = this.stateManager.getState();
            if (currentState.visibleColumns.size === 0) {
                // First time loading columns - use initial visibility from config
                this.stateManager.update({ visibleColumns: this.categoryManager.getInitialVisibleColumns() });
            } else {
                // Preserve existing selections - don't reset visible columns
                // Only clean up columns that no longer exist in the current column list
                const existingVisible = new Set(currentState.visibleColumns);
                const newColumnNames = new Set(cols.map(c => c.column));
                
                // Remove columns that no longer exist (cleanup only)
                existingVisible.forEach(col => {
                    if (!newColumnNames.has(col)) {
                        existingVisible.delete(col);
                    }
                });
                
                // Keep existing visible columns (don't reset them)
                this.stateManager.update({ visibleColumns: existingVisible });
            }
        }
    }

    /**
     * Load table schema for type-aware filtering
     */
    private async loadTableSchema(tableName: string): Promise<void> {
        if (!tableName || this.columnSchemas[tableName]) {
            return; // Already loaded
        }

        try {
            const state = this.stateManager.getState();
            if (!state.berdlTableId) return;

            let schema: Array<{ name: string; type: string; notnull?: boolean; pk?: boolean }> = [];

            // Prefer API client (remote or local)
            try {
                schema = await this.client.getTableSchema(state.berdlTableId, tableName);
            } catch (err) {
                logger.warn('[TableRenderer] Failed to load schema from ApiClient', err);
            }

            // Cache schema
            if (schema.length > 0) {
                this.columnSchemas[tableName] = {};
                schema.forEach(col => {
                    this.columnSchemas[tableName][col.name] = {
                        type: col.type,
                        notnull: !!col.notnull,
                        pk: !!col.pk
                    };
                });
            }
        } catch (error) {
            logger.warn('[TableRenderer] Error loading schema:', error);
        }
    }

    /**
     * Get column type for a column
     */
    public getColumnType(tableName: string, columnName: string): string {
        return this.columnSchemas[tableName]?.[columnName]?.type || 'TEXT';
    }

    /**
     * Return cached schema columns for a table as an array.
     */
    public getSchemaColumns(tableName: string): Array<{ column: string; type: string; notnull?: boolean; pk?: boolean }> {
        const schema = this.columnSchemas[tableName];
        if (!schema) return [];
        return Object.entries(schema).map(([name, info]) => ({
            column: name,
            type: info.type,
            notnull: info.notnull,
            pk: info.pk
        }));
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
        
        // Update search navigation after data changes
        if (this.toolbar && this.grid) {
            // Small delay to ensure grid has finished rendering
            setTimeout(() => {
                this.toolbar.updateSearchNav();
            }, 100);
        }
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
        } catch { /* Config endpoint not available, try legacy */ }

        let config: any = {};
        if (this.configUrl) {
            try { const res = await fetch(this.configUrl); if (res.ok) config = await res.json(); } catch { /* Legacy config fetch failed */ }
        }
        if (!Object.keys(config).length && (window as any).DEFAULT_CONFIG) config = (window as any).DEFAULT_CONFIG;
        this.configManager = new ConfigManager(config);
    }

    private showAlert(msg: string, type: string) {
        if (this.dom.alert) {
            // Escape HTML to prevent XSS
            const escapedMsg = msg.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            // Allow line breaks for longer messages
            const formattedMsg = escapedMsg.replace(/\n/g, '<br>');

            // Determine timeout based on message length and type
            const isError = type === 'danger';
            const timeout = isError ? 8000 : (msg.length > 100 ? 6000 : 4000);

            this.dom.alert.innerHTML = `<div class="ts-alert ts-alert-${type}">${formattedMsg}</div>`;
            setTimeout(() => {
                if (this.dom.alert) this.dom.alert.innerHTML = '';
            }, timeout);
        }
    }

    private showDatabaseSchema(initialTable?: string) {
        this.schemaViewer.show(initialTable);
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

            // Validate filename
            if (!dbFilename || dbFilename.trim() === '') {
                throw new Error('Database filename is required');
            }

            const cleanFilename = dbFilename.trim();

            // Construct paths (client-side, relative to public/)
            const dbPath = `/data/${cleanFilename}.db`;

            // Try to load config using mapping system first, then registry pattern matching
            let config: any = null;
            let configPath: string | null = null;
            
            // 1. Try mapping system (LocalDatabaseMappings)
            const { LocalDbClient } = await import('../core/api/LocalDbClient');
            configPath = LocalDbClient.getConfigPath(dbPath);
            
            // 2. If no mapping found, try registry pattern matching
            if (!configPath) {
                const tempUpa = `local/${cleanFilename}`;
                const appConfig = this.registry.getAppConfig();
                
                // Check exact match first
                let detectedType = this.registry.detectDataType({ dataType: tempUpa, type: cleanFilename });
                
                // If no exact match, try pattern matching manually
                if (!detectedType && appConfig?.dataTypes) {
                    for (const [typeId, ref] of Object.entries(appConfig.dataTypes)) {
                        if (ref.matches) {
                            for (const pattern of ref.matches) {
                                if (this.matchConfigPattern(tempUpa, pattern) || this.matchConfigPattern(cleanFilename, pattern)) {
                                    detectedType = typeId;
                                    break;
                                }
                            }
                            if (detectedType) break;
                        }
                    }
                }
                
                if (detectedType) {
                    const dataTypeRef = appConfig?.dataTypes?.[detectedType];
                    if (dataTypeRef?.configUrl) {
                        configPath = dataTypeRef.configUrl;
                    }
                }
            }
            
            // 3. Fallback to filename-based config path
            if (!configPath) {
                configPath = `/config/${cleanFilename}.json`;
            }

            // Try to load config if available (optional)
            try {
                const configResponse = await fetch(configPath);
                if (configResponse.ok) {
                    config = await configResponse.json();
                    this.registry.registerDataType(config);
                    const configId = config.id || cleanFilename;
                    this.configManager.setCurrentDataType(configId);
                    logger.debug(`Loaded config for ${cleanFilename} from ${configPath}, config ID: ${configId}`);
                }
            } catch (error) {
                // Config is optional, but log for debugging
                logger.warn(`No config file found at ${configPath}, using default settings`, error);
            }

            // Use LocalDbClient to load the database (client-side)
            const localDb = LocalDbClient.getInstance();

            // Create a temporary UPA for this database
            const tempUpa = `local/${cleanFilename}`;

            // Try to load the database file
            try {
                await localDb.loadDatabase(dbPath);
            } catch (dbError: any) {
                // Provide specific error message for file not found
                if (dbError.message.includes('404') || dbError.message.includes('Failed to load database')) {
                    throw new Error(`Database file not found: ${dbPath}. Please ensure the file exists in the /data/ directory.`);
                }
                throw new Error(`Failed to load database file: ${dbError.message}`);
            }

            // Get table list
            let tablesResult: any;
            try {
                tablesResult = await localDb.listTablesFromDb(dbPath, config);
            } catch (tableError: any) {
                throw new Error(`Failed to read database structure: ${tableError.message}`);
            }

            const tables = tablesResult.tables || [];

            if (tables.length === 0) {
                throw new Error(`Database "${cleanFilename}" contains no tables. The database may be empty or corrupted.`);
            }

            this.stateManager.update({
                availableTables: tables,
                berdlTableId: tempUpa
            });

            this.sidebar.updateTables(tables);

            // Load the first table
            const targetTable = tables[0].name;
            await this.switchTable(targetTable);

            this.showAlert(`Successfully loaded database "${cleanFilename}" - ${tables.length} table${tables.length !== 1 ? 's' : ''} found`, 'success');
        } catch (error: any) {
            // Provide detailed error message
            let errorMsg = error.message || 'Failed to load database';

            // Enhance error messages
            if (errorMsg.includes('not found') || errorMsg.includes('404')) {
                errorMsg = `Database file not found: "${dbFilename}". Please check that the file exists at /data/${dbFilename}.db`;
            } else if (errorMsg.includes('No tables found')) {
                errorMsg = `Database "${dbFilename}" contains no tables. The database may be empty or corrupted.`;
            } else if (!errorMsg.includes('Failed to load')) {
                errorMsg = `Failed to load database "${dbFilename}": ${errorMsg}`;
            }

            this.showAlert(errorMsg, 'danger');
            this.stateManager.update({
                availableTables: [],
                activeTableName: null,
                data: [],
                columns: [],
                visibleColumns: new Set(),
                loading: false,
                error: errorMsg
            });
            this.sidebar.updateTables([]);
            throw error;
        } finally {
            this.stateManager.update({ loading: false });
        }
    }

    /**
     * Load a local database from a user-provided path/URL.
     *
     * Notes:
     * - Browsers cannot read arbitrary local filesystem paths directly.
     * - In dev, Vite can serve absolute filesystem paths via `/@fs/...`.
     * - In production, the DB must be hosted by the web server (typically under `/data/...`).
     */
    public async loadDatabaseFromPath(dbPathOrUrl: string): Promise<void> {
        try {
            this.stateManager.update({ loading: true, error: null });

            const raw = (dbPathOrUrl || '').trim();
            if (!raw) throw new Error('Database path is required');
            if (raw.toLowerCase().startsWith('file://')) {
                throw new Error('file:// paths are not supported in the browser. In dev use an absolute path (Vite /@fs), or host the DB under /data/ in production.');
            }

            const withoutHash = raw.split('#')[0];
            const withoutQuery = withoutHash.split('?')[0];
            const baseName = (withoutQuery.split('/').pop() || 'database').trim();
            const cleanName = baseName.replace(/\.(db|sqlite)$/i, '') || 'database';

            const isHttpUrl = /^https?:\/\//i.test(raw);
            let fetchPath = raw;
            if (!isHttpUrl && !fetchPath.startsWith('/')) fetchPath = `/${fetchPath}`;

            // Dev convenience: allow absolute filesystem paths (Linux/macOS/WSL) via Vite /@fs
            if (import.meta.env.DEV && fetchPath.startsWith('/') && !fetchPath.startsWith('/@fs/')) {
                const looksLikeAbsoluteFsPath =
                    fetchPath.startsWith('/home/') ||
                    fetchPath.startsWith('/Users/') ||
                    fetchPath.startsWith('/mnt/') ||
                    fetchPath.startsWith('/var/') ||
                    fetchPath.startsWith('/tmp/');
                if (looksLikeAbsoluteFsPath) {
                    fetchPath = `/@fs${fetchPath}`;
                }
            }

            // Load optional config based on mapping or filename convention
            let config: any = null;
            try {
                const { LocalDbClient } = await import('../core/api/LocalDbClient');
                const mappingKeyCandidates = [
                    raw,
                    withoutQuery,
                    fetchPath,
                    fetchPath.replace(/^\/@fs/, ''),
                ];

                let configPath: string | null = null;
                for (const candidate of mappingKeyCandidates) {
                    configPath = LocalDbClient.getConfigPath(candidate);
                    if (configPath) break;
                }
                
                // If no mapping found, try registry pattern matching
                if (!configPath) {
                    const tempUpa = `local/${cleanName}`;
                    const appConfig = this.registry.getAppConfig();
                    
                    // Check exact match first
                    let detectedType = this.registry.detectDataType({ dataType: tempUpa, type: cleanName });
                    
                    // If no exact match, try pattern matching manually
                    if (!detectedType && appConfig?.dataTypes) {
                        for (const [typeId, ref] of Object.entries(appConfig.dataTypes)) {
                            if (ref.matches) {
                                for (const pattern of ref.matches) {
                                    if (this.matchConfigPattern(tempUpa, pattern) || this.matchConfigPattern(cleanName, pattern)) {
                                        detectedType = typeId;
                                        break;
                                    }
                                }
                                if (detectedType) break;
                            }
                        }
                    }
                    
                    if (detectedType) {
                        const dataTypeRef = appConfig?.dataTypes?.[detectedType];
                        if (dataTypeRef?.configUrl) {
                            configPath = dataTypeRef.configUrl;
                        }
                    }
                }
                
                // Fallback to filename-based config path
                if (!configPath) {
                    configPath = `/config/${cleanName}.json`;
                }

                const configResponse = await fetch(configPath);
                if (configResponse.ok) {
                    config = await configResponse.json();
                    this.registry.registerDataType(config);
                    const configId = config.id || cleanName;
                    this.configManager.setCurrentDataType(configId);
                    logger.debug(`Loaded config for ${cleanName} from ${configPath}, config ID: ${configId}`);
                }
            } catch (error) {
                // Config is optional, but log for debugging
                logger.warn(`No config file found, using default settings`, error);
            }

            const { LocalDbClient } = await import('../core/api/LocalDbClient');
            const localDb = LocalDbClient.getInstance();

            // Load database and list tables
            await localDb.loadDatabase(fetchPath);
            const tablesResult = await localDb.listTablesFromDb(fetchPath, config || {});
            const tables = tablesResult.tables || [];

            if (tables.length === 0) {
                throw new Error(`Database "${cleanName}" contains no tables. The database may be empty or corrupted.`);
            }

            const tempUpa = `local/${cleanName}`;
            this.stateManager.update({
                availableTables: tables,
                berdlTableId: tempUpa,
            });
            this.sidebar.updateTables(tables);

            await this.switchTable(tables[0].name);
            this.showAlert(`Successfully loaded database "${cleanName}" - ${tables.length} table${tables.length !== 1 ? 's' : ''} found`, 'success');
        } catch (error: any) {
            const msg = error?.message || 'Failed to load database';
            this.showAlert(msg, 'danger');
            this.stateManager.update({
                availableTables: [],
                activeTableName: null,
                data: [],
                columns: [],
                visibleColumns: new Set(),
                loading: false,
                error: msg,
            });
            this.sidebar.updateTables([]);
        } finally {
            this.stateManager.update({ loading: false });
        }
    }

    /**
     * Load database from a File object (for upload)
     */
    public async loadDatabaseFromFileObject(file: File): Promise<void> {
        try {
            this.stateManager.update({ loading: true, error: null });

            if (!file.name.endsWith('.db') && !file.name.endsWith('.sqlite')) {
                this.showAlert('Please select a valid SQLite database file (.db or .sqlite)', 'warning');
                this.stateManager.update({ loading: false });
                return;
            }

            const buffer = await file.arrayBuffer();

            // Get the LocalDbClient
            const { LocalDbClient } = await import('../core/api/LocalDbClient');
            const localDb = LocalDbClient.getInstance();

            // Load from buffer
            await localDb.loadDatabaseFromBuffer(buffer, file.name);

            const localUpa = `local/${file.name.replace(/\.(db|sqlite)$/, '')}`;

            // Get table list
            let tablesResult: any;
            try {
                // Pass empty config for now, or could try to find a matching config in the future
                tablesResult = await localDb.listTablesFromDb(file.name);
            } catch (tableError: any) {
                throw new Error(`Failed to read database structure: ${tableError.message}`);
            }

            const tables = tablesResult.tables || [];

            this.stateManager.update({
                berdlTableId: localUpa,
                availableTables: tables,
                activeTableName: null,
                loading: false
            });

            this.sidebar.updateTables(tables);

            if (tables.length > 0) {
                await this.switchTable(tables[0].name);
                this.showAlert(`Loaded local file: ${file.name}`, 'success');
            } else {
                this.showAlert(`Database loaded but contains no tables.`, 'warning');
            }

        } catch (error: any) {
            logger.error('Failed to load uploaded database', error);
            this.showAlert(`Failed to load file: ${error.message}`, 'danger');
            this.stateManager.update({ loading: false });
        }
    }



    private async showColumnStatistics(tableName: string) {
        await this.statsViewer.show(tableName);
    }

    /**
     * Extract schema information from API response for config matching.
     * Efficiently extracts table and column names for schema-based matching.
     */
    private extractSchemaInfo(res: any, tables: any[]): { tables: string[]; columns: Record<string, string[]> } {
        const tableNames = tables.map(t => t.name || t);
        const columns: Record<string, string[]> = {};

        // Try to get schema from response (TableScanner may include schemas field)
        if (res.schemas && typeof res.schemas === 'object') {
            // Schema format: {tableName: {column: type, ...}}
            for (const [tableName, tableSchema] of Object.entries(res.schemas)) {
                if (tableSchema && typeof tableSchema === 'object') {
                    columns[tableName] = Object.keys(tableSchema);
                }
            }
        }

        // Fallback: extract from table objects if they have column info
        if (Object.keys(columns).length === 0) {
            for (const table of tables) {
                const tableName = table.name || table;
                if (table.columns && Array.isArray(table.columns)) {
                    columns[tableName] = table.columns.map((c: any) => 
                        typeof c === 'string' ? c : c.name || c.column
                    );
                } else if (table.column_names && Array.isArray(table.column_names)) {
                    columns[tableName] = table.column_names;
                } else if (table.schema && typeof table.schema === 'object') {
                    // Schema embedded in table object
                    columns[tableName] = Object.keys(table.schema);
                }
            }
        }

        return { tables: tableNames, columns };
    }

    /**
     * Match a value against a config pattern (supports wildcards).
     * Used for matching database identifiers to config patterns.
     */
    private matchConfigPattern(value: string, pattern: string): boolean {
        if (pattern.includes('*')) {
            // Convert glob pattern to regex
            const regexPattern = pattern
                .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
                .replace(/\*/g, '.*'); // Convert * to .*
            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(value);
        }
        return value === pattern;
    }

    /**
     * Fetch schema information from API if available.
     * Used as fallback when schema is not in the tables response.
     */
    private async fetchSchemaInfo(berdlTableId: string): Promise<{ tables: string[]; columns: Record<string, string[]> } | null> {
        try {
            const schema = await this.client.getSchema(berdlTableId);
            if (schema) {
                const tables = Object.keys(schema);
                const columns: Record<string, string[]> = {};
                for (const [tableName, tableSchema] of Object.entries(schema)) {
                    if (tableSchema && typeof tableSchema === 'object') {
                        columns[tableName] = Object.keys(tableSchema);
                    }
                }
                return { tables, columns };
            }
        } catch {
            // Schema endpoint not available
        }
        return null;
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
