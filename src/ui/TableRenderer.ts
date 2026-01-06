/**
 * TableRenderer - Research-Grade Scientific Data Viewer
 * 
 * Features:
 * - Extensible configuration via DataTypeRegistry
 * - Settings popup (bottom-left) with theme/density
 * - Proper row counts
 * - Dark/Light theme support
 * - All previous features
 * 
 * Version 4.0 - Extensible Configuration
 */

import { ApiClient } from '../core/ApiClient';
import { DataTypeRegistry } from '../core/data-type-registry';
import { ConfigManager, type TableColumnConfig } from '../utils/config-manager';
import { StateManager, type AppState } from '../core/StateManager';
import { CategoryManager } from '../core/CategoryManager';
import { Transformers } from '../utils/transformers';
import '../style.css';

export interface RendererOptions {
    container: HTMLElement;
    configUrl?: string;
    client?: ApiClient;
}

const DEBOUNCE_MS = 300; // Reduced from 500ms for better researcher responsiveness

export class TableRenderer {
    private container: HTMLElement;
    private configUrl: string | null;
    private configManager!: ConfigManager;
    private registry: DataTypeRegistry;
    private client!: ApiClient;
    private stateManager: StateManager;
    private categoryManager: CategoryManager | null = null;
    private dom: Record<string, any> = {};
    private selectedRows: Set<number> = new Set();
    private theme: 'light' | 'dark' = 'light';
    private density: 'compact' | 'default' | 'presentation' = 'default';


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
        const savedDensity = localStorage.getItem('ts-density') as 'compact' | 'default' | 'presentation';
        if (savedTheme) this.theme = savedTheme;
        if (savedDensity) this.density = savedDensity;
    }

    public async init() {
        try {
            await this.loadConfiguration();
            const env = this.configManager.getEnvironment();
            const apiUrl = this.configManager.getApiUrl();
            this.client = apiUrl ? new ApiClient({ environment: env, baseUrl: apiUrl }) : this.client;
            if (!apiUrl) this.client.setEnvironment(env);

            const settings = this.configManager.getGlobalSettings();
            this.stateManager.update({
                pageSize: settings.pageSize || 50,
                showRowNumbers: settings.showRowNumbers !== false
            });

            this.loadStateFromUrl();
            this.renderUI();
            this.bindEvents();
        } catch (e: any) {
            this.container.innerHTML = `<div class="ts-alert ts-alert-danger"><i class="bi bi-x-circle-fill"></i> ${e.message}</div>`;
        }
    }

    private async loadConfiguration() {
        // Try new config format first (config/index.json)
        const newConfigUrl = this.configUrl?.replace(/\\.json$/, '') === '/config'
            ? '/config/index.json'
            : '/config/index.json';

        try {
            // Try new multi-file config format
            const res = await fetch(newConfigUrl);
            if (res.ok) {
                const appConfig = await res.json();
                // Check if it's new format (has dataTypes)
                if (appConfig.dataTypes) {
                    await this.registry.initialize(appConfig);
                    this.configManager = new ConfigManager(appConfig);
                    console.log('Loaded new config format from', newConfigUrl);
                    return;
                }
            }
        } catch {
            // Fall through to legacy config
        }

        // Fallback to legacy config URL or inline config
        let config: any = {};
        if (this.configUrl) {
            try {
                const res = await fetch(this.configUrl);
                if (res.ok) config = await res.json();
            } catch { }
        }
        if (!Object.keys(config).length && (window as any).DEFAULT_CONFIG) {
            config = (window as any).DEFAULT_CONFIG;
        }
        this.configManager = new ConfigManager(config);
    }

    private loadStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const table = params.get('table');
        const sort = params.get('sort');
        const page = params.get('page');
        const filters = params.get('filters');

        if (table) (this as any)._initialTable = table;
        if (sort) {
            const [col, order] = sort.split(':');
            this.stateManager.update({ sortColumn: col, sortOrder: order as 'asc' | 'desc' });
        }
        if (page) this.stateManager.update({ currentPage: parseInt(page) - 1 });
        if (filters) {
            try { this.stateManager.update({ columnFilters: JSON.parse(filters) }); } catch { }
        }
    }

    private syncStateToUrl() {
        const state = this.stateManager.getState();
        const params = new URLSearchParams();
        if (state.activeTableName) params.set('table', state.activeTableName);
        if (state.sortColumn) params.set('sort', `${state.sortColumn}:${state.sortOrder}`);
        if (state.currentPage > 0) params.set('page', String(state.currentPage + 1));
        if (Object.keys(state.columnFilters).length) {
            params.set('filters', JSON.stringify(state.columnFilters));
        }
        const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
    }

    private onStateChange(state: AppState) {
        if (this.dom.status) {
            if (state.totalCount > 0) {
                const start = state.currentPage * state.pageSize + 1;
                const end = Math.min((state.currentPage + 1) * state.pageSize, state.totalCount);
                this.dom.status.innerHTML = `Showing <strong>${start.toLocaleString()}</strong> – <strong>${end.toLocaleString()}</strong> of <strong>${state.totalCount.toLocaleString()}</strong> rows`;
            } else {
                this.dom.status.textContent = 'Ready';
            }
        }
        this.updatePagination(state);
        this.syncStateToUrl();

        if (this.dom.loadBtn) {
            this.dom.loadBtn.innerHTML = state.loading
                ? '<span class="ts-spinner"></span> Loading...'
                : '<i class="bi bi-database-fill"></i> Load Data';
            this.dom.loadBtn.disabled = state.loading;
        }

        this.renderFilterChips();
        if (state.error) this.showAlert(state.error, 'danger');
    }

    private renderUI() {
        const appName = this.configManager.getAppName();
        this.container.innerHTML = `
            <div class="ts-app" data-theme="${this.theme}" data-density="${this.density}">
                <!-- SIDEBAR -->
                <aside class="ts-sidebar">
                    <header class="ts-sidebar-header">
                        <div class="ts-brand">
                            <div class="ts-brand-icon"><i class="bi bi-grid-3x3-gap-fill"></i></div>
                            <span class="ts-brand-name">${appName}</span>
                        </div>
                    </header>

                    <div class="ts-sidebar-body">
                        <!-- Connection -->
                        <section class="ts-section">
                            <div class="ts-section-header">
                                <i class="bi bi-plug-fill ts-section-icon"></i>
                                <span class="ts-section-title">Connection</span>
                            </div>
                            <div class="ts-field">
                                <label class="ts-label"><i class="bi bi-key"></i> Auth Token <span class="required">*</span></label>
                                <input type="password" class="ts-input" id="ts-token" placeholder="KBase token">
                            </div>
                            <div class="ts-field">
                                <label class="ts-label"><i class="bi bi-hash"></i> Object ID / UPA</label>
                                <input type="text" class="ts-input" id="ts-berdl" 
                                    placeholder="e.g., 76990/7/2 or UUID"
                                    aria-label="KBase Object UPA or ID" value="76990/7/2">
                            </div>
                            <button class="ts-btn-primary" id="ts-load">
                                <i class="bi bi-database-fill"></i> Load Data
                            </button>
                        </section>

                        <!-- Table Selection -->
                        <section class="ts-section" id="ts-nav-section" style="display:none">
                            <div class="ts-section-header">
                                <i class="bi bi-table ts-section-icon"></i>
                                <span class="ts-section-title">Select Table</span>
                            </div>
                            <select class="ts-select" id="ts-table-select"></select>
                            <div class="ts-table-info" id="ts-table-info" style="display:none">
                                <div class="ts-table-info-icon"><i class="bi bi-table"></i></div>
                                <div class="ts-table-info-content">
                                    <div class="ts-table-info-name" id="ts-info-name">–</div>
                                    <div class="ts-table-info-meta" id="ts-info-meta">–</div>
                                </div>
                                <div class="ts-row-badge" id="ts-info-rows">0 rows</div>
                            </div>
                        </section>

                        <!-- Columns (IN SIDEBAR) -->
                        <section class="ts-section" id="ts-cols-section" style="display:none">
                            <div class="ts-section-header">
                                <i class="bi bi-layout-three-columns ts-section-icon"></i>
                                <span class="ts-section-title">Columns</span>
                                <button class="ts-section-action" id="ts-cols-toggle-all">Show All</button>
                            </div>
                            <div class="ts-col-list" id="ts-col-list"></div>
                        </section>

                        <!-- Categories -->
                        <section class="ts-section" id="ts-cat-section" style="display:none">
                            <div class="ts-section-header">
                                <i class="bi bi-collection-fill ts-section-icon"></i>
                                <span class="ts-section-title">Categories</span>
                                <button class="ts-section-action" id="ts-cat-toggle-all">Show All</button>
                            </div>
                            <ul class="ts-toggle-list" id="ts-cat-list"></ul>
                        </section>

                        <!-- Active Filters -->
                        <section class="ts-section" id="ts-filters-section" style="display:none">
                            <div class="ts-section-header">
                                <i class="bi bi-funnel-fill ts-section-icon"></i>
                                <span class="ts-section-title">Active Filters</span>
                                <button class="ts-section-action" id="ts-clear-filters">Clear All</button>
                            </div>
                            <div class="ts-filter-chips" id="ts-filter-chips"></div>
                        </section>

                        <!-- Actions -->
                        <section class="ts-section">
                            <div class="ts-btn-group">
                                <button class="ts-btn-secondary" id="ts-export">
                                    <i class="bi bi-download"></i> Export
                                </button>
                                <button class="ts-btn-secondary" id="ts-reset">
                                    <i class="bi bi-arrow-counterclockwise"></i> Reset
                                </button>
                            </div>
                        </section>
                    </div>
                </aside>

                <!-- MAIN -->
                <main class="ts-main">
                    <header class="ts-toolbar">
                        <div class="ts-search-box">
                            <i class="bi bi-search ts-search-icon"></i>
                            <input type="text" id="ts-search" class="ts-search" 
                                placeholder="Search all columns..." 
                                aria-label="Search all table columns">
                            <button class="ts-search-clear" id="ts-search-clear" 
                                aria-label="Clear search">
                                <i class="bi bi-x"></i>
                            </button>
                        </div>
                        <div class="ts-spacer"></div>
                        <button class="ts-tb ts-tb-icon" id="ts-refresh" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>
                    </header>

                    <div id="ts-alert"></div>

                    <div class="ts-grid" id="ts-grid">
                        <div class="ts-empty">
                            <div class="ts-empty-icon"><i class="bi bi-database"></i></div>
                            <h3 class="ts-empty-title">Select a Table to Begin</h3>
                            <p class="ts-empty-desc">Enter your Auth Token and Object ID, then click <strong>Load Data</strong>.</p>
                        </div>
                    </div>

                    <footer class="ts-footer">
                        <div class="ts-status" id="ts-status">Ready</div>
                        <div class="ts-pager" id="ts-pager"></div>
                    </footer>
                </main>

                <!-- Settings Trigger (Bottom Left) -->
                <button class="ts-settings-trigger" id="ts-settings-trigger" title="Settings">
                    <i class="bi bi-gear-fill"></i>
                </button>

                <!-- Settings Popup -->
                <div class="ts-settings-popup" id="ts-settings-popup">
                    <div class="ts-settings-header">Settings</div>
                    <div class="ts-settings-body">
                        <div class="ts-settings-row">
                            <div class="ts-settings-label"><i class="bi bi-moon-stars"></i> Theme</div>
                            <div class="ts-switch ${this.theme === 'dark' ? 'on' : ''}" id="ts-theme-toggle"></div>
                        </div>
                        <div class="ts-settings-row">
                            <div class="ts-settings-label"><i class="bi bi-arrows-angle-expand"></i> Density</div>
                            <div class="ts-density-options">
                                <button class="ts-density-opt ${this.density === 'compact' ? 'active' : ''}" data-density="compact" title="Compact">
                                    <i class="bi bi-list"></i>
                                </button>
                                <button class="ts-density-opt ${this.density === 'default' ? 'active' : ''}" data-density="default" title="Default">
                                    <i class="bi bi-list-ul"></i>
                                </button>
                                <button class="ts-density-opt ${this.density === 'presentation' ? 'active' : ''}" data-density="presentation" title="Presentation">
                                    <i class="bi bi-card-heading"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Floating Action Bar -->
                <div class="ts-action-bar" id="ts-action-bar" style="display:none">
                    <span class="ts-action-bar-count" id="ts-sel-count">0 selected</span>
                    <button class="ts-action-bar-btn" id="ts-export-selected"><i class="bi bi-download"></i> Export</button>
                    <button class="ts-action-bar-btn" id="ts-copy-ids"><i class="bi bi-clipboard"></i> Copy IDs</button>
                    <button class="ts-action-bar-close" id="ts-clear-selection"><i class="bi bi-x"></i></button>
                </div>

                <div id="ts-tooltip" class="ts-tooltip"></div>
            </div>
        `;
        this.cacheDom();
    }

    private cacheDom() {
        this.dom = {
            app: this.container.querySelector('.ts-app'),
            token: this.container.querySelector('#ts-token'),
            berdl: this.container.querySelector('#ts-berdl'),
            loadBtn: this.container.querySelector('#ts-load'),
            navSection: this.container.querySelector('#ts-nav-section'),
            tableSelect: this.container.querySelector('#ts-table-select'),
            tableInfo: this.container.querySelector('#ts-table-info'),
            infoName: this.container.querySelector('#ts-info-name'),
            infoMeta: this.container.querySelector('#ts-info-meta'),
            infoRows: this.container.querySelector('#ts-info-rows'),
            colsSection: this.container.querySelector('#ts-cols-section'),
            colList: this.container.querySelector('#ts-col-list'),
            colsToggleAll: this.container.querySelector('#ts-cols-toggle-all'),
            catSection: this.container.querySelector('#ts-cat-section'),
            catList: this.container.querySelector('#ts-cat-list'),
            catToggleAll: this.container.querySelector('#ts-cat-toggle-all'),
            filtersSection: this.container.querySelector('#ts-filters-section'),
            filterChips: this.container.querySelector('#ts-filter-chips'),
            clearFilters: this.container.querySelector('#ts-clear-filters'),
            search: this.container.querySelector('#ts-search'),
            searchClear: this.container.querySelector('#ts-search-clear'),
            refresh: this.container.querySelector('#ts-refresh'),
            export: this.container.querySelector('#ts-export'),
            reset: this.container.querySelector('#ts-reset'),
            alert: this.container.querySelector('#ts-alert'),
            grid: this.container.querySelector('#ts-grid'),
            status: this.container.querySelector('#ts-status'),
            pager: this.container.querySelector('#ts-pager'),
            settingsTrigger: this.container.querySelector('#ts-settings-trigger'),
            settingsPopup: this.container.querySelector('#ts-settings-popup'),
            themeToggle: this.container.querySelector('#ts-theme-toggle'),
            densityOpts: this.container.querySelectorAll('.ts-density-opt'),
            actionBar: this.container.querySelector('#ts-action-bar'),
            selCount: this.container.querySelector('#ts-sel-count'),
            exportSelected: this.container.querySelector('#ts-export-selected'),
            copyIds: this.container.querySelector('#ts-copy-ids'),
            clearSelection: this.container.querySelector('#ts-clear-selection'),
            tooltip: this.container.querySelector('#ts-tooltip')
        };
    }

    private bindEvents() {
        // Load
        this.dom.loadBtn?.addEventListener('click', () => this.loadObject());
        this.dom.berdl?.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') this.loadObject();
        });

        // Table select
        this.dom.tableSelect?.addEventListener('change', (e: Event) => {
            this.switchTable((e.target as HTMLSelectElement).value);
        });

        // Search
        let searchTimer: any;
        this.dom.search?.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                this.stateManager.update({ searchValue: this.dom.search.value, currentPage: 0 });
                this.fetchData();
            }, DEBOUNCE_MS);
        });

        this.dom.searchClear?.addEventListener('click', () => {
            this.dom.search.value = '';
            this.stateManager.update({ searchValue: '', currentPage: 0 });
            this.fetchData();
        });

        // Reset
        this.dom.reset?.addEventListener('click', () => {
            this.stateManager.update({
                sortColumn: null, sortOrder: 'asc', searchValue: '', columnFilters: {}, currentPage: 0
            });
            this.dom.search.value = '';
            this.selectedRows.clear();
            this.updateActionBar();
            this.fetchData();
        });

        // Refresh
        this.dom.refresh?.addEventListener('click', () => this.fetchData());

        // Export
        this.dom.export?.addEventListener('click', () => this.exportCsv());

        // Clear filters
        this.dom.clearFilters?.addEventListener('click', () => {
            this.stateManager.update({ columnFilters: {}, searchValue: '', currentPage: 0 });
            this.dom.search.value = '';
            this.fetchData();
        });

        // Column toggle all
        this.dom.colsToggleAll?.addEventListener('click', () => {
            const state = this.stateManager.getState();
            const allVisible = state.columns.every(c => state.visibleColumns.has(c.column));
            state.columns.forEach(c => {
                if (allVisible) state.visibleColumns.delete(c.column);
                else state.visibleColumns.add(c.column);
            });
            this.stateManager.update({ visibleColumns: state.visibleColumns });
            this.renderColumnList();
            this.renderTable();
        });

        // Category toggle all
        this.dom.catToggleAll?.addEventListener('click', () => {
            if (this.categoryManager) {
                const allVisible = this.categoryManager.getAllCategories().every(c => c.visible);
                this.categoryManager.getAllCategories().forEach(c => {
                    if (allVisible !== c.visible) return;
                    this.categoryManager!.toggleCategory(c.id);
                });
                this.stateManager.update({ visibleColumns: this.categoryManager.getVisibleColumns() });
                this.renderCategories();
                this.renderColumnList();
                this.renderTable();
            }
        });

        // Categories
        this.dom.catList?.addEventListener('click', (e: Event) => {
            const item = (e.target as HTMLElement).closest('.ts-toggle-item') as HTMLElement;
            if (item && this.categoryManager) {
                const catId = item.dataset.cat;
                if (catId) {
                    this.categoryManager.toggleCategory(catId);
                    this.stateManager.update({ visibleColumns: this.categoryManager.getVisibleColumns() });
                    this.renderCategories();
                    this.renderColumnList();
                    this.renderTable();
                }
            }
        });

        // Settings popup
        this.dom.settingsTrigger?.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            this.dom.settingsPopup?.classList.toggle('show');
        });

        document.addEventListener('click', (e: Event) => {
            if (!this.dom.settingsPopup?.contains(e.target as Node)) {
                this.dom.settingsPopup?.classList.remove('show');
            }
        });

        // Theme toggle
        this.dom.themeToggle?.addEventListener('click', () => {
            this.theme = this.theme === 'light' ? 'dark' : 'light';
            this.dom.app?.setAttribute('data-theme', this.theme);
            this.dom.themeToggle?.classList.toggle('on', this.theme === 'dark');
            localStorage.setItem('ts-theme', this.theme);
        });

        // Density
        this.dom.densityOpts?.forEach((btn: Element) => {
            btn.addEventListener('click', () => {
                this.density = (btn as HTMLElement).dataset.density as 'compact' | 'default' | 'presentation';
                this.dom.app?.setAttribute('data-density', this.density);
                this.dom.densityOpts.forEach((b: Element) => b.classList.remove('active'));
                btn.classList.add('active');
                localStorage.setItem('ts-density', this.density);
            });
        });

        // Grid events
        this.dom.grid?.addEventListener('click', (e: Event) => {
            const target = e.target as HTMLElement;

            // Sort
            const th = target.closest('th.sortable');
            if (th) {
                const col = (th as HTMLElement).dataset.col;
                if (col) {
                    const state = this.stateManager.getState();
                    const order = state.sortColumn === col && state.sortOrder === 'asc' ? 'desc' : 'asc';
                    this.stateManager.update({ sortColumn: col, sortOrder: order, currentPage: 0 });
                    this.fetchData();
                }
                return;
            }

            // Filter clear
            const clearBtn = target.closest('.ts-filter-clear');
            if (clearBtn) {
                const col = (clearBtn as HTMLElement).dataset.col;
                if (col) {
                    const input = this.dom.grid?.querySelector(`.ts-filter-input[data-col="${col}"]`) as HTMLInputElement;
                    if (input) {
                        input.value = '';
                        input.classList.remove('has-value');
                        input.focus();
                    }
                    const state = this.stateManager.getState();
                    const filters = { ...state.columnFilters };
                    delete filters[col];
                    this.stateManager.update({ columnFilters: filters, currentPage: 0 });
                    this.fetchData();
                }
                return;
            }

            // Copy ID
            const copyBtn = target.closest('.ts-copy-btn');
            if (copyBtn) {
                const text = (copyBtn as HTMLElement).dataset.id;
                if (text) {
                    navigator.clipboard.writeText(text);
                    this.showAlert('Copied to clipboard', 'success');
                }
            }
        });

        // Cell hover tooltips for truncated content
        this.dom.grid?.addEventListener('mouseover', (e: Event) => {
            const cell = (e.target as HTMLElement).closest('td');
            if (cell && cell.scrollWidth > cell.clientWidth) {
                const textContent = cell.textContent || '';
                if (textContent.trim().length > 0) {
                    this.showTooltip(e as MouseEvent, textContent.trim());
                }
            }
        });

        this.dom.grid?.addEventListener('mouseout', (e: Event) => {
            const cell = (e.target as HTMLElement).closest('td');
            if (cell) {
                this.hideTooltip();
            }
        });

        this.dom.grid?.addEventListener('mousemove', (e: Event) => {
            if (this.dom.tooltip?.classList.contains('show')) {
                this.moveTooltip(e as MouseEvent);
            }
        });

        // Filter inputs
        this.dom.grid?.addEventListener('input', (e: Event) => {
            const input = e.target as HTMLInputElement;
            if (input.classList.contains('ts-filter-input')) {
                input.classList.toggle('has-value', input.value.length > 0);
                const col = input.dataset.col;
                if (col) {
                    clearTimeout((input as any)._debounce);
                    (input as any)._debounce = setTimeout(() => {
                        const state = this.stateManager.getState();
                        const filters = { ...state.columnFilters };
                        if (input.value.trim()) filters[col] = input.value.trim();
                        else delete filters[col];
                        this.stateManager.update({ columnFilters: filters, currentPage: 0 });
                        this.fetchData();
                    }, DEBOUNCE_MS);
                }
            }
        });

        // Row selection
        this.dom.grid?.addEventListener('change', (e: Event) => {
            const input = e.target as HTMLInputElement;
            if (input.type === 'checkbox' && input.dataset.rowIdx !== undefined) {
                const idx = parseInt(input.dataset.rowIdx);
                if (input.checked) this.selectedRows.add(idx);
                else this.selectedRows.delete(idx);
                this.updateActionBar();
                this.updateRowSelection();
            }
            if (input.id === 'ts-select-all') {
                const state = this.stateManager.getState();
                if (input.checked) state.data.forEach((_: any, i: number) => this.selectedRows.add(i));
                else this.selectedRows.clear();
                this.updateActionBar();
                this.updateRowSelection();
            }
        });

        // Action bar
        this.dom.clearSelection?.addEventListener('click', () => {
            this.selectedRows.clear();
            this.updateActionBar();
            this.updateRowSelection();
        });
        this.dom.exportSelected?.addEventListener('click', () => this.exportSelectedRows());
        this.dom.copyIds?.addEventListener('click', () => this.copySelectedIds());

        // Pagination
        this.dom.pager?.addEventListener('click', (e: Event) => {
            const btn = (e.target as HTMLElement).closest('.ts-page-btn') as HTMLElement;
            if (btn && !btn.hasAttribute('disabled') && btn.dataset.page) {
                this.stateManager.update({ currentPage: parseInt(btn.dataset.page) });
                this.fetchData();
            }
        });

        // Tooltip
        this.container.addEventListener('mouseover', (e) => {
            const td = (e.target as HTMLElement).closest('.ts-table tbody td') as HTMLElement;
            if (td && td.scrollWidth > td.clientWidth) this.showTooltip(e as MouseEvent, td.innerText);
        });
        this.container.addEventListener('mouseout', (e) => {
            if ((e.target as HTMLElement).closest('.ts-table tbody td')) this.hideTooltip();
        });
        this.container.addEventListener('mousemove', (e) => {
            if (this.dom.tooltip?.classList.contains('show')) this.moveTooltip(e as MouseEvent);
        });
    }

    private renderColumnList() {
        const state = this.stateManager.getState();
        const list = this.dom.colList;
        if (!list) return;

        list.innerHTML = '';
        if (state.columns.length === 0) {
            list.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:11px">No columns</div>';
            return;
        }

        const allVisible = state.columns.every(c => state.visibleColumns.has(c.column));
        if (this.dom.colsToggleAll) {
            this.dom.colsToggleAll.textContent = allVisible ? 'Hide All' : 'Show All';
        }

        state.columns.forEach(col => {
            const div = document.createElement('div');
            div.className = 'ts-col-item';
            const checked = state.visibleColumns.has(col.column);
            div.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''}><span>${col.displayName || col.column}</span>`;
            div.querySelector('input')?.addEventListener('change', (e: Event) => {
                const on = (e.target as HTMLInputElement).checked;
                if (on) state.visibleColumns.add(col.column);
                else state.visibleColumns.delete(col.column);
                this.stateManager.update({ visibleColumns: state.visibleColumns });
                this.renderTable();
            });
            list.appendChild(div);
        });
    }

    private renderFilterChips() {
        const state = this.stateManager.getState();
        const container = this.dom.filterChips;
        const section = this.dom.filtersSection;
        if (!container || !section) return;

        const hasFilters = Object.keys(state.columnFilters).length > 0 || state.searchValue;
        section.style.display = hasFilters ? 'block' : 'none';

        container.innerHTML = '';

        if (state.searchValue) {
            const chip = document.createElement('div');
            chip.className = 'ts-chip';
            chip.innerHTML = `<span>Search: "${Transformers.escapeHtml(state.searchValue)}"</span><button class="ts-chip-clear" data-type="search"><i class="bi bi-x"></i></button>`;
            chip.querySelector('button')?.addEventListener('click', () => {
                this.dom.search.value = '';
                this.stateManager.update({ searchValue: '', currentPage: 0 });
                this.fetchData();
            });
            container.appendChild(chip);
        }

        Object.entries(state.columnFilters).forEach(([col, val]) => {
            const chip = document.createElement('div');
            chip.className = 'ts-chip';
            chip.innerHTML = `<span>${col}: "${Transformers.escapeHtml(String(val))}"</span><button class="ts-chip-clear" data-col="${col}"><i class="bi bi-x"></i></button>`;
            chip.querySelector('button')?.addEventListener('click', () => {
                const filters = { ...state.columnFilters };
                delete filters[col];
                this.stateManager.update({ columnFilters: filters, currentPage: 0 });
                const input = this.dom.grid?.querySelector(`.ts-filter-input[data-col="${col}"]`) as HTMLInputElement;
                if (input) { input.value = ''; input.classList.remove('has-value'); }
                this.fetchData();
            });
            container.appendChild(chip);
        });
    }

    private updateActionBar() {
        if (!this.dom.actionBar) return;
        const count = this.selectedRows.size;
        this.dom.actionBar.style.display = count > 0 ? 'flex' : 'none';
        this.dom.selCount.textContent = `${count} selected`;
    }

    private updateRowSelection() {
        this.dom.grid?.querySelectorAll('tbody tr').forEach((tr: Element, idx: number) => {
            tr.classList.toggle('selected', this.selectedRows.has(idx));
            const cb = tr.querySelector('input[type="checkbox"]') as HTMLInputElement;
            if (cb) cb.checked = this.selectedRows.has(idx);
        });
        const selectAll = this.dom.grid?.querySelector('#ts-select-all') as HTMLInputElement;
        if (selectAll) {
            const state = this.stateManager.getState();
            selectAll.checked = this.selectedRows.size === state.data.length && state.data.length > 0;
        }
    }

    // Data methods
    private async loadObject() {
        const berdl = (this.dom.berdl as HTMLInputElement).value.trim();
        const token = (this.dom.token as HTMLInputElement).value.trim();

        // Validation
        if (!token) {
            this.showAlert('Auth token is required', 'warning');
            this.dom.token?.focus();
            return;
        }
        if (!berdl) {
            this.showAlert('Object ID is required', 'warning');
            this.dom.berdl?.focus();
            return;
        }

        // Support UPAs (W/O/V), versioned UPAs (W/O/V/v), and UUIDs
        const isUPA = /^\d+\/\d+(\/\d+)?(\/\d+)?$/.test(berdl);
        const isLongID = /^[a-f0-9-]{30,}$/i.test(berdl);

        // Very permissive check for researcher IDs - if it has a slash or is long, allow it
        if (!isUPA && !isLongID && !berdl.includes('/') && berdl.length < 5) {
            this.showAlert('Invalid Object ID format (expected UPA like 76990/7/2 or UUID)', 'warning');
            this.dom.berdl?.focus();
            return;
        }

        this.client.setToken(token);
        this.stateManager.update({ berdlTableId: berdl, loading: true, error: null });
        this.dom.navSection.style.display = 'none';
        this.dom.catSection.style.display = 'none';
        this.dom.colsSection.style.display = 'none';

        try {
            const res = await this.client.listTables(berdl);

            // Validate data type
            const detectedType = this.registry.detectDataType(res);
            if (detectedType) {
                console.log(`Detected data type: ${detectedType}`);
                this.configManager.setCurrentDataType(detectedType);
            } else {
                console.warn('Could not detect specific data type, using default config');
                // Don't crash, just proceed with generic rendering
            }

            const tables = res.tables || [];
            this.stateManager.update({ availableTables: tables });

            if (tables.length === 0) { this.showAlert('No tables found', 'warning'); return; }

            this.populateTableSelect(tables);
            this.dom.navSection.style.display = 'block';

            const initialTable = (this as any)._initialTable;
            const targetTable = initialTable && tables.find((t: any) => t.name === initialTable)
                ? initialTable : tables[0].name;
            this.dom.tableSelect.value = targetTable;
            this.switchTable(targetTable);
        } catch (e: any) {
            this.showAlert(e.message, 'danger');
        } finally {
            this.stateManager.update({ loading: false });
        }
    }

    private populateTableSelect(tables: any[]) {
        const sel = this.dom.tableSelect;
        if (!sel) return;
        sel.innerHTML = '';
        tables.forEach((t: any) => {
            const opt = document.createElement('option');
            opt.value = t.name;
            // Support both 'count' (legacy/mock) and 'row_count' (actual API)
            const countValue = t.row_count ?? t.count;
            const count = typeof countValue === 'number' ? countValue.toLocaleString() : '?';
            opt.textContent = `${t.displayName || t.name} (${count} rows)`;
            sel.appendChild(opt);
        });
    }

    private async switchTable(name: string) {
        const state = this.stateManager.getState();
        const info = state.availableTables.find((t: any) => t.name === name);

        if (info) {
            this.dom.tableInfo.style.display = 'flex';
            this.dom.infoName.textContent = name;
            const cols = typeof info.column_count === 'number' ? info.column_count : '?';
            const rows = typeof info.count === 'number' ? info.count.toLocaleString() : '?';
            this.dom.infoMeta.textContent = `${cols} columns`;
            this.dom.infoRows.textContent = `${rows} rows`;
        }

        this.stateManager.update({ activeTableName: name });
        const config = this.configManager.getTableConfig(name);
        this.categoryManager = new CategoryManager(config);

        this.stateManager.update({
            currentPage: 0, sortColumn: null, columnFilters: {}, searchValue: '',
            data: [], headers: [], columns: []
        });
        this.dom.search.value = '';
        this.selectedRows.clear();
        this.updateActionBar();

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
            this.stateManager.update({
                headers: res.headers, data: res.data || [], totalCount: res.total_count || 0
            });

            this.selectedRows.clear();
            this.updateActionBar();
            this.dom.colsSection.style.display = 'block';
            this.renderColumnList();
            this.renderCategories();
            this.renderTable();
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
            cols.push({ ...c, visible: c.visible !== false, sortable: c.sortable !== false, filterable: c.filterable !== false, width: c.width || 'auto' });
            seen.add(c.column);
        });

        headers.forEach(h => {
            if (!seen.has(h)) {
                cols.push({ column: h, displayName: h.replace(/_/g, ' '), visible: true, sortable: true, filterable: true, width: 'auto', categories: [] });
            }
        });

        this.stateManager.update({ columns: cols });

        if (this.categoryManager) {
            this.categoryManager.setColumns(cols);
            this.stateManager.update({ visibleColumns: this.categoryManager.getVisibleColumns() });
        }
    }

    private renderCategories() {
        if (!this.categoryManager || !this.dom.catList) return;
        const cats = this.categoryManager.getAllCategories();
        this.dom.catList.innerHTML = '';

        if (cats.length === 0) { this.dom.catSection.style.display = 'none'; return; }

        this.dom.catSection.style.display = 'block';
        const allVisible = cats.every(c => c.visible);
        if (this.dom.catToggleAll) this.dom.catToggleAll.textContent = allVisible ? 'Hide All' : 'Show All';

        cats.forEach(cat => {
            const li = document.createElement('li');
            li.className = `ts-toggle-item ${cat.visible ? 'active' : ''}`;
            li.dataset.cat = cat.id;
            li.innerHTML = `
                <div class="ts-toggle-label">
                    <i class="${cat.icon || 'bi bi-folder-fill'}" style="color:${cat.color || 'var(--accent)'}"></i>
                    <span>${cat.name}</span>
                </div>
                <div class="ts-switch ${cat.visible ? 'on' : ''}"></div>
            `;
            this.dom.catList.appendChild(li);
        });
    }

    private renderTable() {
        const state = this.stateManager.getState();
        const grid = this.dom.grid;
        if (!grid) return;

        if (state.columns.length === 0) {
            grid.innerHTML = `<div class="ts-empty"><div class="ts-empty-icon"><i class="bi bi-inbox"></i></div><h3 class="ts-empty-title">No Data</h3><p class="ts-empty-desc">Select a table from the sidebar.</p></div>`;
            return;
        }

        const cols = state.columns.filter(c => state.visibleColumns.has(c.column));
        if (cols.length === 0) {
            grid.innerHTML = `<div class="ts-empty"><div class="ts-empty-icon"><i class="bi bi-eye-slash"></i></div><h3 class="ts-empty-title">All Columns Hidden</h3><p class="ts-empty-desc">Enable columns in the sidebar.</p></div>`;
            return;
        }

        const searchTerm = state.searchValue.toLowerCase();
        let html = '<table class="ts-table"><thead><tr>';

        html += '<th class="ts-col-select ts-col-fixed"><input type="checkbox" id="ts-select-all"></th>';
        if (state.showRowNumbers) html += '<th class="ts-col-num ts-col-fixed">#</th>';

        cols.forEach((c, idx) => {
            const isFirst = idx === 0 && !state.showRowNumbers;
            const fixed = isFirst ? 'ts-col-fixed' : '';
            const sortable = c.sortable ? 'sortable' : '';
            let icon = state.sortColumn === c.column ? (state.sortOrder === 'asc' ? ' <i class="bi bi-sort-up"></i>' : ' <i class="bi bi-sort-down"></i>') : '';
            html += `<th class="${fixed} ${sortable}" data-col="${c.column}" style="width:${c.width}">${c.displayName || c.column}${icon}</th>`;
        });

        html += '</tr><tr class="ts-filter-row">';
        html += '<th class="ts-col-select ts-col-fixed"></th>';
        if (state.showRowNumbers) html += '<th class="ts-col-num ts-col-fixed"></th>';

        cols.forEach((c, idx) => {
            const isFirst = idx === 0 && !state.showRowNumbers;
            const fixed = isFirst ? 'ts-col-fixed' : '';
            const val = state.columnFilters[c.column] || '';
            html += `<th class="${fixed}">`;
            if (c.filterable !== false) {
                html += `<div class="ts-filter-wrap"><input class="ts-filter-input ${val ? 'has-value' : ''}" data-col="${c.column}" value="${Transformers.escapeHtml(val)}" placeholder="Filter..."><button class="ts-filter-clear" data-col="${c.column}"><i class="bi bi-x"></i></button></div>`;
            }
            html += '</th>';
        });

        html += '</tr></thead><tbody>';

        if (state.data.length === 0) {
            const span = cols.length + (state.showRowNumbers ? 2 : 1);
            html += `<tr><td colspan="${span}" style="text-align:center;padding:32px;color:var(--text-muted)"><i class="bi bi-search" style="font-size:20px;opacity:.3;display:block;margin-bottom:6px"></i>No matching records</td></tr>`;
        } else {
            const start = state.currentPage * state.pageSize + 1;
            state.data.forEach((row: any[], i: number) => {
                const obj = this.rowToObj(row);
                const selected = this.selectedRows.has(i);
                html += `<tr class="${selected ? 'selected' : ''}">`;
                html += `<td class="ts-col-select ts-col-fixed"><input type="checkbox" data-row-idx="${i}" ${selected ? 'checked' : ''}></td>`;
                if (state.showRowNumbers) html += `<td class="ts-col-num ts-col-fixed">${start + i}</td>`;

                cols.forEach((c, idx) => {
                    const isFirst = idx === 0 && !state.showRowNumbers;
                    const fixed = isFirst ? 'ts-col-fixed' : '';
                    const raw = obj[c.column];
                    let content = '';
                    if (c.transform) content = Transformers.apply(raw, c.transform, obj);
                    else if (c.column.includes('ID') || c.column === 'ID') {
                        const esc = Transformers.escapeHtml(raw);
                        content = `<span class="ts-copy-id"><span class="ts-mono">${esc}</span><button class="ts-copy-btn" data-id="${esc}"><i class="bi bi-clipboard"></i></button></span>`;
                    } else content = Transformers.escapeHtml(raw);
                    if (searchTerm) content = this.highlightText(content, searchTerm);
                    html += `<td class="${fixed}">${content}</td>`;
                });
                html += '</tr>';
            });
        }

        html += '</tbody></table>';
        grid.innerHTML = html;
    }

    private highlightText(html: string, term: string): string {
        if (!term) return html;
        const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return html.replace(regex, '<mark class="highlight">$1</mark>');
    }

    private rowToObj(row: any[]) {
        const headers = this.stateManager.getState().headers;
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
    }

    private updatePagination(state: AppState) {
        const pager = this.dom.pager;
        if (!pager) return;
        const total = Math.ceil(state.totalCount / state.pageSize);
        const curr = state.currentPage;
        pager.innerHTML = `
            <button class="ts-page-btn" data-page="${curr - 1}" ${curr <= 0 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>
            <span class="ts-page-info">${curr + 1} / ${total || 1}</span>
            <button class="ts-page-btn" data-page="${curr + 1}" ${curr >= total - 1 ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>
        `;
    }

    private exportCsv() {
        const state = this.stateManager.getState();
        if (state.data.length === 0) return;

        // Show loading state
        const btn = this.dom.export;
        const originalHTML = btn?.innerHTML;
        if (btn) {
            btn.innerHTML = '<span class="ts-spinner"></span> Exporting...';
            btn.disabled = true;
        }

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            try {
                this.downloadCsv(state.data, `${state.activeTableName || 'data'}.csv`);
                this.showAlert(`Exported ${state.data.length} rows`, 'success');
            } catch (error) {
                this.showAlert('Export failed', 'danger');
            } finally {
                if (btn && originalHTML) {
                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                }
            }
        }, 50);
    }

    private exportSelectedRows() {
        const state = this.stateManager.getState();
        const selectedData = state.data.filter((_: any, i: number) => this.selectedRows.has(i));
        if (selectedData.length === 0) return;
        this.downloadCsv(selectedData, `${state.activeTableName} _selected.csv`);
        this.showAlert(`Exported ${selectedData.length} rows`, 'success');
    }

    private downloadCsv(data: any[], filename: string) {
        const state = this.stateManager.getState();
        const cols = state.columns.filter(c => state.visibleColumns.has(c.column)).map(c => c.column);
        const rows = data.map((r: any[]) => {
            const obj = this.rowToObj(r);
            return cols.map(c => `"${String(obj[c] ?? '').replace(/"/g, '""')}"`).join(',');
        });
        const csv = [cols.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    }

    private copySelectedIds() {
        const state = this.stateManager.getState();
        const idCol = state.columns.find(c => c.column.includes('ID') || c.column === 'ID');
        if (!idCol) { this.showAlert('No ID column', 'warning'); return; }
        const ids = state.data.filter((_: any, i: number) => this.selectedRows.has(i)).map((r: any[]) => this.rowToObj(r)[idCol.column]).join('\n');
        navigator.clipboard.writeText(ids);
        this.showAlert(`Copied ${this.selectedRows.size} IDs`, 'success');
    }

    private showAlert(msg: string, type: 'danger' | 'warning' | 'success') {
        if (this.dom.alert) {
            const icons = { success: 'check-circle-fill', warning: 'exclamation-triangle-fill', danger: 'x-circle-fill' };
            this.dom.alert.innerHTML = `<div class="ts-alert ts-alert-${type}"><i class="bi bi-${icons[type]}"></i> ${msg}</div>`;
            setTimeout(() => { if (this.dom.alert) this.dom.alert.innerHTML = ''; }, 4000);
        }
    }

    private showTooltip(e: MouseEvent, text: string) {
        if (this.dom.tooltip) { this.dom.tooltip.textContent = text; this.dom.tooltip.classList.add('show'); this.moveTooltip(e); }
    }

    private moveTooltip(e: MouseEvent) {
        if (this.dom.tooltip) { this.dom.tooltip.style.left = (e.clientX + 10) + 'px'; this.dom.tooltip.style.top = (e.clientY + 10) + 'px'; }
    }

    private hideTooltip() {
        if (this.dom.tooltip) this.dom.tooltip.classList.remove('show');
    }
}
