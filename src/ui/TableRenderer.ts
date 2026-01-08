/**
 * TableRenderer - Research-Grade Scientific Data Viewer
 * Orchestrator (Controller)
 */

import { ApiClient } from '../core/ApiClient';
import { DataTypeRegistry } from '../core/data-type-registry';
import { ConfigManager, type TableColumnConfig } from '../utils/config-manager';
import { StateManager, type AppState } from '../core/StateManager';
import { CategoryManager } from '../core/CategoryManager';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { DataGrid } from './components/DataGrid';
import { exportManager } from '../core/ExportManager';
import { registerDefaultShortcuts } from '../core/KeyboardManager';
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
                    <div class="ts-grid" id="ts-grid-container"></div>
                    <footer class="ts-footer">
                        <div class="ts-status" id="ts-status">Ready</div>
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
            onShowSchema: (table) => this.showDatabaseSchema(table)
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
        } finally {
            this.stateManager.update({ loading: false });
        }
    }

    private async switchTable(name: string) {
        this.stateManager.update({ activeTableName: name });
        const config = this.configManager.getTableConfig(name);
        this.categoryManager = new CategoryManager(config);

        this.sidebar.setCategoryManager(this.categoryManager);
        this.sidebar.updateTableInfo(name);

        this.stateManager.update({
            currentPage: 0, sortColumn: null, columnFilters: {}, searchValue: '',
            data: [], headers: [], columns: []
        });

        this.toolbar.setSearch('');
        this.grid.clearSelection();

        await this.fetchData();
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

            const dataObjects = (res.data || []).map((row: any[]) => {
                const obj: Record<string, any> = {};
                res.headers.forEach((h, i) => { obj[h] = row[i]; });
                return obj;
            });

            this.stateManager.update({
                headers: res.headers, data: dataObjects, totalCount: res.total_count || 0
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
        this.syncStateToUrl();
        if (state.error) this.showAlert(state.error, 'danger');
    }

    private updateStatusBar(state: AppState) {
        if (!this.dom.status) return;

        let statusHtml = '';
        if (state.totalCount > 0) {
            const start = state.currentPage * state.pageSize + 1;
            const end = Math.min((state.currentPage + 1) * state.pageSize, state.totalCount);
            statusHtml = `Showing <strong>${start.toLocaleString()}</strong> – <strong>${end.toLocaleString()}</strong> of <strong>${state.totalCount.toLocaleString()}</strong> rows`;

            const selectionCount = this.grid?.getSelection()?.size || 0;
            if (selectionCount > 0) {
                statusHtml += ` <span class="ts-selection-info">• ${selectionCount} selected</span>`;
            }
        } else {
            statusHtml = 'Ready';
        }
        this.dom.status.innerHTML = statusHtml;
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

        const renderSidebar = (active: string | null) => `
            <div class="glass-sidebar" style="width:260px;display:flex;flex-direction:column;">
                <div style="padding:20px;border-bottom:1px solid var(--c-border-subtle)">
                    <h3 style="font-size:11px;text-transform:uppercase;color:var(--c-text-muted);font-weight:700;letter-spacing:0.08em;display:flex;align-items:center;gap:8px">
                        <i class="bi bi-database" style="font-size:14px"></i> Database Schema
                    </h3>
                </div>
                <div style="flex:1;overflow-y:auto;padding:12px">
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
                </div>
            </div>
        `;

        const renderOverview = () => {
            const totalTables = tables.length;
            const totalRecords = tables.reduce((acc: number, t: any) => acc + (t.row_count || 0), 0);

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

        const updateView = (target: string) => {
            const sidebar = modal.querySelector('#ts-schema-sidebar');
            const main = modal.querySelector('#ts-schema-main');
            if (sidebar) sidebar.innerHTML = renderSidebar(target === '__overview__' ? null : target);
            if (main) {
                main.innerHTML = target === '__overview__' ? renderOverview() : renderTableDetail(target);
                main.scrollTop = 0;
            }
            bindEvents();
        };

        const bindEvents = () => {
            modal.querySelectorAll('.ts-nav-item, .ts-card-nav').forEach(el => {
                el.addEventListener('click', () => {
                    const target = (el as HTMLElement).dataset.target;
                    if (target) updateView(target);
                });
            });

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
