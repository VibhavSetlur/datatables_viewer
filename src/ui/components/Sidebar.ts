import { Component, type ComponentOptions } from '../Component';
import { ConfigManager } from '../../core/config/ConfigManager';
import { StateManager, type AppState } from '../../core/state/StateManager';
import { CategoryManager } from '../../core/managers/CategoryManager';
import type { DatabaseInfo } from '../../types/shared-types';

export interface SidebarOptions extends ComponentOptions {
    configManager: ConfigManager;
    stateManager: StateManager;
    onApiChange: (apiId: string) => void;
    onLoadData: () => void;
    onTableChange: (tableName: string) => void;
    onDatabaseChange?: (dbName: string) => void;  // New: handle multi-database selection
    onExport: () => void;
    onReset: () => void;
    onShowSchema: (tableName: string) => void;
    onShowStats: (tableName: string) => void;
    onColumnVisibilityChange: (columns: any[]) => void;
}

export class Sidebar extends Component {
    private configManager: ConfigManager;
    private stateManager: StateManager;
    private categoryManager: CategoryManager | null = null;
    private options: SidebarOptions;
    private expandedCategories: Set<string> = new Set();

    constructor(options: SidebarOptions) {
        super(options);
        this.configManager = options.configManager;
        this.stateManager = options.stateManager;
        this.options = options;

        // Subscribe to state changes to update UI
        this.stateManager.subscribe((state: AppState) => {
            if (this.dom.loadBtn) {
                this.dom.loadBtn.innerHTML = state.loading
                    ? '<span class="ts-spinner"></span> Loading...'
                    : '<i class="bi bi-lightning-charge-fill"></i> Load Data';
                (this.dom.loadBtn as HTMLButtonElement).disabled = state.loading;
            }

            // Update loading indicator in data source section
            this.updateLoadingState(state);

            if (state.activeTableName && state.availableTables.length > 0) {
                this.updateTableInfo(state.activeTableName);
            }

            // Re-render control list when columns change
            if (state.columns.length > 0 && this.dom.controlList) {
                this.renderControlList();
            }

            // Update filter chips if they changed
            this.renderFilterChips();

            // Update aggregations display
            this.updateAggregationsDisplay(state);
        });
    }

    public get onLoadData() {
        return this.options.onLoadData;
    }

    private updateAggregationsDisplay(state: AppState) {
        if (!this.dom.aggregationsSection || !this.dom.aggregationsInfo) return;

        const hasAggregations = state.aggregations && state.aggregations.length > 0;
        const hasGroupBy = state.groupBy && state.groupBy.length > 0;

        if (hasAggregations || hasGroupBy) {
            this.dom.aggregationsSection.style.display = 'block';
            const aggText = state.aggregations?.map(agg =>
                `${agg.function.toUpperCase()}(${agg.column})`
            ).join(', ') || 'None';
            const groupText = state.groupBy?.join(', ') || 'None';
            this.dom.aggregationsInfo.innerHTML = `
                <div style="margin-bottom:4px"><strong>Functions:</strong> ${aggText}</div>
                <div><strong>Group By:</strong> ${groupText}</div>
            `;
        } else {
            this.dom.aggregationsSection.style.display = 'none';
        }
    }

    public setCategoryManager(manager: CategoryManager) {
        this.categoryManager = manager;
        this.renderControlList();
        // Auto-expand control section when data is loaded
        this.expandColumnsSection();
    }

    /** Expand the control section to show available columns */
    public expandColumnsSection() {
        if (this.dom.controlSection) {
            this.dom.controlSection.style.display = 'block';
        }
    }

    /** Collapse the control section */
    public collapseColumnsSection() {
        if (this.dom.controlSection) {
            this.dom.controlSection.style.display = 'none';
        }
    }

    protected render() {
        const appName = this.configManager.getAppName() || 'DataTables Viewer';
        this.container.innerHTML = `
            <header class="ts-sidebar-header">
                <div class="ts-brand">
                    <div class="ts-brand-icon"><i class="bi bi-grid-3x3-gap-fill"></i></div>
                    <span class="ts-brand-name">${appName}</span>
                </div>
            </header>

            <div class="ts-sidebar-body">
            <div class="ts-sidebar-body">

                <!-- Database Selection (for multi-DB objects) -->
                <section class="ts-section" id="ts-db-section" style="display:none; padding: 0 4px;">
                    <div class="ts-section-header">
                        <span class="ts-section-title">Active Database</span>
                    </div>
                    <select class="ts-select" id="ts-database-select"></select>
                </section>

                <!-- Table Selection -->
                <section class="ts-section" id="ts-nav-section" style="display:none; padding: 0 4px;">
                    <div class="ts-section-header">
                        <span class="ts-section-title">Active Table</span>
                    </div>
                    <select class="ts-select" id="ts-table-select"></select>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
                        <button class="ts-btn-secondary" id="ts-view-schema">
                            <i class="bi bi-file-earmark-code"></i> Schema
                        </button>
                        <button class="ts-btn-secondary" id="ts-view-stats">
                            <i class="bi bi-graph-up"></i> Stats
                        </button>
                    </div>
                </section>

                <!-- Data Control (Unified Categories & Columns) -->
                <section class="ts-section" id="ts-control-section" style="display:none; padding: 0 4px;">
                    <div class="ts-section-header">
                        <span class="ts-section-title">Data Control</span>
                        <div class="ts-section-actions">
                            <button class="ts-section-action" id="ts-control-expand-all">Expand All</button>
                            <button class="ts-section-action" id="ts-control-show-all">Show All</button>
                        </div>
                    </div>
                    <div class="ts-control-list" id="ts-control-list"></div>
                </section>

                <!-- Active Filters -->
                <section class="ts-section" id="ts-filters-section" style="display:none; padding: 0 4px;">
                    <div class="ts-section-header">
                        <span class="ts-section-title">Active Filters</span>
                        <div style="display:flex;gap:4px">
                            <button class="ts-section-action" id="ts-advanced-filters" title="Advanced Filters">
                                <i class="bi bi-funnel-fill"></i> Advanced
                            </button>
                            <button class="ts-section-action" id="ts-clear-filters">Clear All</button>
                        </div>
                    </div>
                    <div class="ts-filter-chips" id="ts-filter-chips"></div>
                </section>
                
                <!-- Aggregations -->
                <section class="ts-section" id="ts-aggregations-section" style="display:none; padding: 0 4px;">
                    <div class="ts-section-header">
                        <span class="ts-section-title">Aggregations</span>
                        <button class="ts-section-action" id="ts-aggregations-btn">
                            <i class="bi bi-calculator"></i> Configure
                        </button>
                    </div>
                    <div id="ts-aggregations-info" style="padding:8px;font-size:12px;color:var(--c-text-muted)">
                        No aggregations configured
                    </div>
                </section>
            </div>

            <footer class="ts-sidebar-footer">
                <div class="ts-btn-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <button class="ts-btn-secondary" id="ts-export">
                        <i class="bi bi-download"></i> Export
                    </button>
                    <button class="ts-btn-secondary" id="ts-reset">
                        <i class="bi bi-arrow-counterclockwise"></i> Reset
                    </button>
                </div>
            </footer>
        `;
        this.cacheDom({
            reset: '#ts-reset',
            // Restored DOM elements
            dbSection: '#ts-db-section',           // New: database section
            databaseSelect: '#ts-database-select', // New: database dropdown
            navSection: '#ts-nav-section',
            tableSelect: '#ts-table-select',
            viewSchema: '#ts-view-schema',
            viewStats: '#ts-view-stats',
            controlSection: '#ts-control-section',
            controlList: '#ts-control-list',
            controlExpandAll: '#ts-control-expand-all',
            controlShowAll: '#ts-control-show-all',
            filtersSection: '#ts-filters-section',
            filterChips: '#ts-filter-chips',
            clearFilters: '#ts-clear-filters',
            advancedFilters: '#ts-advanced-filters',
            aggregationsSection: '#ts-aggregations-section',
            aggregationsBtn: '#ts-aggregations-btn',
            aggregationsInfo: '#ts-aggregations-info',
            export: '#ts-export'
        });
    }

    protected bindEvents() {
        // Database Selection (for multi-DB objects)
        this.dom.databaseSelect?.addEventListener('change', (e: Event) => {
            const dbName = (e.target as HTMLSelectElement).value;
            if (this.options.onDatabaseChange) {
                this.options.onDatabaseChange(dbName);
            }
        });

        // Table Selection
        this.dom.tableSelect?.addEventListener('change', (e: Event) => {
            this.options.onTableChange((e.target as HTMLSelectElement).value);
        });

        this.dom.viewSchema?.addEventListener('click', () => {
            const state = this.stateManager.getState();
            if (state.activeTableName) {
                this.options.onShowSchema(state.activeTableName);
            }
        });

        this.dom.viewStats?.addEventListener('click', () => {
            const state = this.stateManager.getState();
            if (state.activeTableName) {
                this.options.onShowStats(state.activeTableName);
            }
        });

        // Column Controls
        this.dom.controlShowAll?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleAllColumns();
        });

        this.dom.controlExpandAll?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleAllCategories();
        });

        // Filters
        this.dom.clearFilters?.addEventListener('click', () => {
            this.stateManager.update({
                columnFilters: {},
                advancedFilters: undefined,
                currentPage: 0
            });
            // Also notify DataGrid to reload
            // (DataGrid subscribes to state, so it should handle this, 
            // but we might need to trigger a fetch if it doesn't automatically)
            // The TableRenderer listens to filter changes via state subscription? 
            // Actually TableRenderer.fetchData() is called by the grid or manually. 
            // Let's rely on TableRenderer observing the state change or just let the user click Refresh if needed?
            // Better: The grid usually triggers a fetch on filter change. 
            // If we update state directly, we might need to trigger the fetch.
            // But for now, let's just update state.
        });



        // Export & Reset

        // Actions
        this.dom.export?.addEventListener('click', () => this.options.onExport());
        this.dom.reset?.addEventListener('click', () => this.options.onReset());

        // Control list delegation
        this.dom.controlList?.addEventListener('click', (e: Event) => {
            const target = e.target as HTMLElement;

            // Category Toggle Switch
            if (target.closest('.ts-switch')) {
                const item = target.closest('.ts-cat-group') as HTMLElement;
                const catId = item?.dataset.cat;
                if (catId && this.categoryManager) {
                    // Update: stateless toggle
                    const currentVisible = this.stateManager.getState().visibleColumns;
                    const newVisible = this.categoryManager.calculateVisibilityChange(catId, currentVisible);
                    this.stateManager.update({ visibleColumns: newVisible });
                    // renderControlList will be called by state subscription
                }
                return;
            }

            // Category Expand/Collapse
            if (target.closest('.ts-cat-head')) {
                const item = target.closest('.ts-cat-group') as HTMLElement;
                const catId = item?.dataset.cat;
                if (catId) {
                    if (this.expandedCategories.has(catId)) this.expandedCategories.delete(catId);
                    else this.expandedCategories.add(catId);
                    item?.classList.toggle('expanded');
                }
                return;
            }

            // Column Checkbox
            if (target.matches('input[type="checkbox"]')) {
                const col = (target as HTMLInputElement).dataset.col;
                if (col) {
                    const state = this.stateManager.getState();
                    if ((target as HTMLInputElement).checked) state.visibleColumns.add(col);
                    else state.visibleColumns.delete(col);
                    this.stateManager.update({ visibleColumns: state.visibleColumns });
                }
            }
        });

        // Global Control Actions
        this.dom.controlExpandAll?.addEventListener('click', () => {
            const groups = this.dom.controlList.querySelectorAll('.ts-cat-group');
            const anyCollapsed = Array.from(groups).some((g: Element) => !g.classList.contains('expanded'));
            groups.forEach((g: Element) => {
                const catId = (g as HTMLElement).dataset.cat;
                if (anyCollapsed) {
                    g.classList.add('expanded');
                    if (catId) this.expandedCategories.add(catId);
                } else {
                    g.classList.remove('expanded');
                    if (catId) this.expandedCategories.delete(catId);
                }
            });
            this.dom.controlExpandAll.textContent = anyCollapsed ? 'Collapse All' : 'Expand All';
        });

        this.dom.controlShowAll?.addEventListener('click', () => {
            this.toggleAllColumns();
        });

        // Schema view click
        if (this.dom.viewSchema) {
            this.dom.viewSchema.addEventListener('click', () => {
                const state = this.stateManager.getState();
                if (state.activeTableName) {
                    this.options.onShowSchema(state.activeTableName);
                } else {
                    const select = this.dom.tableSelect as HTMLSelectElement;
                    if (select?.value) {
                        this.options.onShowSchema(select.value);
                    }
                }
            });
        }

        // Stats view click
        if (this.dom.viewStats) {
            this.dom.viewStats.addEventListener('click', () => {
                const state = this.stateManager.getState();
                if (state.activeTableName) {
                    this.options.onShowStats(state.activeTableName);
                } else {
                    const select = this.dom.tableSelect as HTMLSelectElement;
                    if (select?.value) {
                        this.options.onShowStats(select.value);
                    }
                }
            });
        }

        // Clear filters
        if (this.dom.clearFilters) {
            this.dom.clearFilters.addEventListener('click', () => {
                this.stateManager.update({
                    columnFilters: {},
                    advancedFilters: undefined,
                    currentPage: 0
                });
            });
        }

        // Advanced filters button
        if (this.dom.advancedFilters) {
            this.dom.advancedFilters.addEventListener('click', () => {
                this.showAdvancedFilterPanel();
            });
        }

        // Aggregations button
        if (this.dom.aggregationsBtn) {
            this.dom.aggregationsBtn.addEventListener('click', () => {
                this.showAggregationsPanel();
            });
        }
    }

    private showAdvancedFilterPanel() {
        const state = this.stateManager.getState();
        const columns = state.columns.map(c => ({
            column: c.column,
            displayName: c.displayName || c.column,
            type: (c as any).dataType || 'TEXT'
        }));

        // Create modal for advanced filters
        const modal = document.createElement('div');
        modal.className = 'ts-modal-overlay show';
        modal.innerHTML = `
            <div class="ts-modal" style="max-width:600px">
                <div class="ts-modal-header">
                    <h3>Advanced Filters</h3>
                    <button class="ts-modal-close"><i class="bi bi-x"></i></button>
                </div>
                <div class="ts-modal-body" id="ts-advanced-filter-container"></div>
            </div>
        `;

        document.body.appendChild(modal);

        // Dynamic import to avoid circular dependencies
        import('../components/AdvancedFilterPanel').then(({ AdvancedFilterPanel }) => {
            const container = modal.querySelector('#ts-advanced-filter-container');
            if (!container) return;

            const panel = new AdvancedFilterPanel({
                container: container as HTMLElement,
                columns,
                onApply: (filters: any) => {
                    this.stateManager.update({
                        advancedFilters: filters,
                        currentPage: 0
                    });
                    document.body.removeChild(modal);
                    this.options.onLoadData();
                },
                onCancel: () => {
                    document.body.removeChild(modal);
                }
            });

            if (state.advancedFilters) {
                panel.setFilters(state.advancedFilters);
            }

            modal.querySelector('.ts-modal-close')?.addEventListener('click', () => {
                document.body.removeChild(modal);
            });

            panel.mount();
        });

    }

    private toggleAllColumns() {
        const state = this.stateManager.getState();
        if (state.columns.length === 0) return;

        // Create a NEW Set to ensure state change detection
        const newVisible = new Set<string>();

        // Determine current state: all visible, or not
        const allVisible = state.visibleColumns.size === state.columns.length;

        if (allVisible) {
            // Hide all: newVisible stays empty
        } else {
            // Show all: add all column names to the new set
            state.columns.forEach(c => newVisible.add(c.column));
        }

        // Push update with new Set reference
        this.stateManager.update({ visibleColumns: newVisible });

        // Update button text
        if (this.dom.controlShowAll) {
            this.dom.controlShowAll.textContent = allVisible ? 'Show All' : 'Hide All';
        }
    }

    private toggleAllCategories() {
        // Expand/Collapse all categories
        const categoryHeaders = this.dom.controlList?.querySelectorAll('.ts-category-header');
        if (!categoryHeaders) return;

        // Check if any is collapsed, if so, expand all
        let anyCollapsed = false;
        categoryHeaders.forEach(el => {
            if (el.classList.contains('collapsed')) anyCollapsed = true;
        });

        categoryHeaders.forEach(el => {
            const content = el.nextElementSibling as HTMLElement;
            if (anyCollapsed) {
                el.classList.remove('collapsed');
                el.querySelector('i')?.classList.replace('bi-chevron-right', 'bi-chevron-down');
                if (content) content.style.display = 'block';
            } else {
                el.classList.add('collapsed');
                el.querySelector('i')?.classList.replace('bi-chevron-down', 'bi-chevron-right');
                if (content) content.style.display = 'none';
            }
        });
    }

    private showAggregationsPanel() {
        const state = this.stateManager.getState();
        const columns = state.columns.map(c => ({
            column: c.column,
            displayName: c.displayName || c.column,
            type: (c as any).dataType || 'TEXT'
        }));

        // Create modal for aggregations
        const modal = document.createElement('div');
        modal.className = 'ts-modal-overlay show';
        modal.innerHTML = `
            <div class="ts-modal" style="max-width:600px">
                <div class="ts-modal-header">
                    <h3>Configure Aggregations</h3>
                    <button class="ts-modal-close"><i class="bi bi-x"></i></button>
                </div>
                <div class="ts-modal-body">
                    <div style="margin-bottom:16px">
                        <label style="display:block;margin-bottom:8px;font-weight:500">Group By Columns</label>
                        <select multiple class="ts-select" id="ts-group-by" style="min-height:100px">
                            ${columns.map(col =>
            `<option value="${col.column}">${col.displayName || col.column}</option>`
        ).join('')}
                        </select>
                        <small style="color:var(--c-text-muted)">Hold Ctrl/Cmd to select multiple</small>
                    </div>
                    <div id="ts-aggregations-list"></div>
                    <button class="ts-btn-secondary" id="ts-add-aggregation" style="margin-top:12px">
                        <i class="bi bi-plus"></i> Add Aggregation
                    </button>
                </div>
                <div class="ts-modal-footer">
                    <button class="ts-btn-secondary" id="ts-agg-cancel">Cancel</button>
                    <button class="ts-btn-primary" id="ts-agg-apply">Apply</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const aggregations = state.aggregations || [];
        const groupBy = state.groupBy || [];

        const renderAggregations = () => {
            const list = modal.querySelector('#ts-aggregations-list');
            if (!list) return;

            if (aggregations.length === 0) {
                list.innerHTML = '<p style="color:var(--c-text-muted);font-size:13px">No aggregations. Click "Add Aggregation" to create one.</p>';
                return;
            }

            list.innerHTML = aggregations.map((agg, idx) => `
                <div class="ts-agg-item" style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:8px;padding:12px;background:var(--c-bg-surface-alt);border-radius:var(--radius-sm)">
                    <select class="ts-select" data-agg-col="${idx}">
                        ${columns.map(col =>
                `<option value="${col.column}" ${agg.column === col.column ? 'selected' : ''}>${col.displayName || col.column}</option>`
            ).join('')}
                    </select>
                    <select class="ts-select" data-agg-func="${idx}">
                        <option value="count" ${agg.function === 'count' ? 'selected' : ''}>Count</option>
                        <option value="sum" ${agg.function === 'sum' ? 'selected' : ''}>Sum</option>
                        <option value="avg" ${agg.function === 'avg' ? 'selected' : ''}>Average</option>
                        <option value="min" ${agg.function === 'min' ? 'selected' : ''}>Min</option>
                        <option value="max" ${agg.function === 'max' ? 'selected' : ''}>Max</option>
                        <option value="stddev" ${agg.function === 'stddev' ? 'selected' : ''}>StdDev</option>
                        <option value="variance" ${agg.function === 'variance' ? 'selected' : ''}>Variance</option>
                        <option value="distinct_count" ${agg.function === 'distinct_count' ? 'selected' : ''}>Distinct Count</option>
                    </select>
                    <button class="ts-btn-secondary" data-agg-remove="${idx}" style="padding:8px">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `).join('');

            list.querySelectorAll('[data-agg-col]').forEach(select => {
                select.addEventListener('change', (e) => {
                    const idx = parseInt((e.target as HTMLElement).dataset.aggCol || '0');
                    aggregations[idx].column = (e.target as HTMLSelectElement).value;
                });
            });

            list.querySelectorAll('[data-agg-func]').forEach(select => {
                select.addEventListener('change', (e) => {
                    const idx = parseInt((e.target as HTMLElement).dataset.aggFunc || '0');
                    aggregations[idx].function = (e.target as HTMLSelectElement).value as any;
                });
            });

            list.querySelectorAll('[data-agg-remove]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt((e.target as HTMLElement).dataset.aggRemove || '0');
                    aggregations.splice(idx, 1);
                    renderAggregations();
                });
            });
        };

        modal.querySelector('#ts-add-aggregation')?.addEventListener('click', () => {
            aggregations.push({
                column: columns[0]?.column || '',
                function: 'count'
            });
            renderAggregations();
        });

        modal.querySelector('#ts-agg-apply')?.addEventListener('click', () => {
            const groupBySelect = modal.querySelector('#ts-group-by') as HTMLSelectElement;
            const selectedGroupBy = Array.from(groupBySelect.selectedOptions).map(opt => opt.value);

            this.stateManager.update({
                aggregations: aggregations.length > 0 ? aggregations : undefined,
                groupBy: selectedGroupBy.length > 0 ? selectedGroupBy : undefined,
                currentPage: 0
            });
            document.body.removeChild(modal);
            if (this.options.onLoadData) {
                this.options.onLoadData();
            }
        });

        modal.querySelector('#ts-agg-cancel')?.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.querySelector('.ts-modal-close')?.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        renderAggregations();

        // Set initial group by
        const groupBySelect = modal.querySelector('#ts-group-by') as HTMLSelectElement;
        if (groupBy) {
            Array.from(groupBySelect.options).forEach(opt => {
                opt.selected = groupBy.includes(opt.value);
            });
        }
    }

    public updateTables(tables: any[]) {
        if (!this.dom.navSection) return;

        if (tables.length > 0) {
            this.dom.navSection.style.display = 'block';
            this.dom.tableSelect.innerHTML = '';
            tables.forEach((t: any) => {
                const opt = document.createElement('option');
                opt.value = t.name;
                const countValue = t.row_count ?? t.count;
                const count = typeof countValue === 'number' ? countValue.toLocaleString() : '?';
                opt.textContent = `${t.displayName || t.name} (${count} rows)`;
                this.dom.tableSelect.appendChild(opt);
            });
        } else {
            this.dom.navSection.style.display = 'none';
        }
    }

    public updateTableInfo(name: string) {
        if (this.dom.tableSelect && (this.dom.tableSelect as HTMLSelectElement).value !== name) {
            (this.dom.tableSelect as HTMLSelectElement).value = name;
        }
    }

    /**
     * Update database dropdown for multi-database objects.
     * Always shows the active database. Dropdown is enabled when there are multiple DBs.
     * @param databases - Array of DatabaseInfo from the API response
     */
    public updateDatabases(databases: DatabaseInfo[]) {
        if (!this.dom.dbSection || !this.dom.databaseSelect) return;

        // Always show database section if we have at least one database
        if (databases.length >= 1) {
            this.dom.dbSection.style.display = 'block';
            this.dom.databaseSelect.innerHTML = '';

            databases.forEach((db: DatabaseInfo) => {
                const opt = document.createElement('option');
                opt.value = db.db_name;
                const rowCount = db.row_count != null ? db.row_count.toLocaleString() : '?';
                opt.textContent = db.db_display_name || db.db_name;
                if (db.row_count != null) {
                    opt.textContent += ` (${rowCount} rows)`;
                }
                this.dom.databaseSelect.appendChild(opt);
            });

            // Disable dropdown if only one database (user can see it but can't change)
            (this.dom.databaseSelect as HTMLSelectElement).disabled = databases.length <= 1;

            // Update state with available databases
            this.stateManager.update({
                availableDatabases: databases,
                activeDatabase: databases[0]?.db_name || null
            });
        } else {
            // No databases - hide the section
            this.dom.dbSection.style.display = 'none';
        }
    }

    /**
     * Set the currently selected database in the dropdown.
     * @param dbName - Database name to select
     */
    public setActiveDatabase(dbName: string) {
        if (this.dom.databaseSelect && (this.dom.databaseSelect as HTMLSelectElement).value !== dbName) {
            (this.dom.databaseSelect as HTMLSelectElement).value = dbName;
        }
    }

    public renderControlList() {
        if (!this.dom.controlList) return;
        this.dom.controlSection.style.display = 'block';

        const state = this.stateManager.getState();
        const cats = this.categoryManager ? this.categoryManager.getAllCategories(state.visibleColumns) : [];
        const colsByCat = this.categoryManager ? this.categoryManager.getColumnsByCategory() : new Map();
        const uncategorized = this.categoryManager ? this.categoryManager.getUncategorizedColumns() : state.columns.map(c => c.column);

        let html = '';

        // Render Categorized Groups
        cats.forEach(cat => {
            const catCols = colsByCat.get(cat.id) || [];
            if (catCols.length === 0) return;
            html += this.renderCategoryGroup(cat, catCols, state);
        });

        // Render Uncategorized Group
        if (uncategorized.length > 0) {
            html += this.renderCategoryGroup({
                id: 'other',
                name: 'Other Attributes',
                icon: 'bi-three-dots',
                color: '#64748b',
                visible: true
            } as any, uncategorized, state, true);
        }

        this.dom.controlList.innerHTML = html;

        // Update Show All text
        const allVisible = state.columns.every(c => state.visibleColumns.has(c.column));
        if (this.dom.controlShowAll) this.dom.controlShowAll.textContent = allVisible ? 'Hide All' : 'Show All';
    }

    private renderCategoryGroup(cat: any, colNames: string[], state: AppState, isUncategorized = false) {
        const stateCols = state.columns.reduce((acc: any, c: any) => { acc[c.column] = c; return acc; }, {});
        const isExpanded = this.expandedCategories.has(cat.id);

        return `
            <div class="ts-cat-group ${isExpanded ? 'expanded' : ''}" data-cat="${cat.id}">
                <div class="ts-cat-head">
                    <div class="ts-cat-info">
                        <i class="bi bi-chevron-down ts-cat-arrow"></i>
                        <i class="${cat.icon || 'bi bi-folder-fill'}" style="color:${cat.color || 'var(--c-accent)'}"></i>
                        <span class="ts-cat-name">${cat.name}</span>
                        <span class="ts-cat-count">${colNames.length}</span>
                    </div>
                    ${!isUncategorized ? `<div class="ts-switch ${cat.visible ? 'on' : ''}"></div>` : ''}
                </div>
                <div class="ts-cat-cols">
                    ${colNames.map(colName => {
            const col = stateCols[colName] || { column: colName, displayName: colName };
            return `
                            <label class="ts-col-item">
                                <input type="checkbox" data-col="${colName}" ${state.visibleColumns.has(colName) ? 'checked' : ''}>
                                <span>${col.displayName || colName}</span>
                            </label>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }

    public renderFilterChips() {
        const state = this.stateManager.getState();
        const filters = state.columnFilters;
        const advancedFilters = state.advancedFilters;
        const hasFilters = Object.keys(filters).length > 0 || (advancedFilters && advancedFilters.length > 0);

        if (this.dom.filtersSection) this.dom.filtersSection.style.display = hasFilters ? 'block' : 'none';
        if (!this.dom.filterChips) return;

        const chips: string[] = [];

        // Get columns that have advanced filters (to exclude from simple filter display)
        const advancedFilterColumns = new Set((advancedFilters || []).map(f => f.column));

        // Simple column filters (only for columns without advanced filters)
        Object.entries(filters).forEach(([col, val]) => {
            // Skip columns that have advanced filters - they're displayed below
            if (!advancedFilterColumns.has(col)) {
                chips.push(`
                    <div class="ts-chip">
                        <span class="ts-chip-label">${col}:</span>
                        <span class="ts-chip-value">${val}</span>
                        <button class="ts-chip-clear" data-col="${col}"><i class="bi bi-x"></i></button>
                    </div>
                `);
            }
        });

        // Advanced filters
        if (advancedFilters && advancedFilters.length > 0) {
            advancedFilters.forEach((filter, idx) => {
                const opLabel = this.getOperatorLabel(filter.operator);
                const valueDisplay = filter.operator === 'between'
                    ? `${filter.value} - ${filter.value2}`
                    : filter.operator === 'in' || filter.operator === 'not_in'
                        ? Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)
                        : filter.operator === 'is_null' || filter.operator === 'is_not_null'
                            ? ''
                            : String(filter.value || '');

                chips.push(`
                    <div class="ts-chip ts-chip-advanced">
                        <span class="ts-chip-label">${filter.column} ${opLabel}:</span>
                        <span class="ts-chip-value">${valueDisplay}</span>
                        <button class="ts-chip-clear" data-adv-filter="${idx}"><i class="bi bi-x"></i></button>
                    </div>
                `);
            });
        }

        this.dom.filterChips.innerHTML = chips.join('');

        this.dom.filterChips.querySelectorAll('.ts-chip-clear').forEach(btn => {
            btn.addEventListener('click', (e: Event) => {
                const col = (e.currentTarget as HTMLElement).dataset.col;
                const advFilterIdx = (e.currentTarget as HTMLElement).dataset.advFilter;

                if (col) {
                    const newState = { ...this.stateManager.getState().columnFilters };
                    delete newState[col];
                    this.stateManager.update({ columnFilters: newState, currentPage: 0 });
                } else if (advFilterIdx !== undefined) {
                    const state = this.stateManager.getState();
                    const filterToRemove = state.advancedFilters?.[parseInt(advFilterIdx)];
                    const newFilters = [...(state.advancedFilters || [])];
                    newFilters.splice(parseInt(advFilterIdx), 1);

                    // Also clear the corresponding column filter if it exists
                    const newColumnFilters = { ...state.columnFilters };
                    if (filterToRemove?.column) {
                        delete newColumnFilters[filterToRemove.column];
                    }

                    this.stateManager.update({
                        columnFilters: newColumnFilters,
                        advancedFilters: newFilters.length > 0 ? newFilters : undefined,
                        currentPage: 0
                    });
                }
            });
        });
    }

    private getOperatorLabel(operator: string): string {
        const labels: Record<string, string> = {
            'eq': '=',
            'ne': '!=',
            'gt': '>',
            'gte': '>=',
            'lt': '<',
            'lte': '<=',
            'like': 'contains',
            'ilike': 'contains (i)',
            'in': 'in',
            'not_in': 'not in',
            'between': 'between',
            'is_null': 'is null',
            'is_not_null': 'is not null',
            'regex': 'regex'
        };
        return labels[operator] || operator;
    }


    public getToken(): string {
        return (this.dom.token as HTMLInputElement)?.value || '';
    }

    public setToken(value: string): void {
        if (this.dom.token) {
            (this.dom.token as HTMLInputElement).value = value;
            // Also save to localStorage for persistence
            if (value) {
                localStorage.setItem('kbase_token', value);
            }
        }
    }

    public getBerdlId(): string {
        return (this.dom.berdl as HTMLInputElement)?.value || '';
    }

    public setBerdlId(value: string): void {
        if (this.dom.berdl) {
            (this.dom.berdl as HTMLInputElement).value = value;
        }
    }

    /**
     * Highlight the token field to indicate it's required.
     * Used when a shared link is opened without authentication.
     */
    public highlightTokenField(): void {
        if (this.dom.token) {
            const tokenInput = this.dom.token as HTMLInputElement;
            tokenInput.classList.add('ts-input-required');
            tokenInput.focus();

            // Add visual pulse animation
            tokenInput.style.animation = 'pulse-border 1.5s ease-in-out 2';

            // Remove animation after it completes
            setTimeout(() => {
                tokenInput.style.animation = '';
            }, 3000);
        }

        // Ensure the data source section is expanded
        if (this.dom.sourceBody) {
            this.dom.sourceBody.style.display = 'block';
            this.dom.sourceArrow?.classList.remove('collapsed');
        }
    }

    /**
     * Clear the token field highlighting.
     */
    public clearTokenHighlight(): void {
        if (this.dom.token) {
            const tokenInput = this.dom.token as HTMLInputElement;
            tokenInput.classList.remove('ts-input-required');
            tokenInput.style.animation = '';
        }
    }

    // Compat methods for renderer subscription
    public renderCategories() { this.renderControlList(); }
    public renderColumnList() { this.renderControlList(); }

    private updateLoadingState(state: AppState) {
        if (!this.dom.loadingIndicator || !this.dom.loadingText) return;

        // Only show loading in data source section for initial data load
        // If tables are already loaded, it's not an initial load
        const isInitialLoad = state.loading && state.availableTables.length === 0;

        if (isInitialLoad) {
            // Show loading indicator and keep section open only for initial load
            this.dom.loadingIndicator.style.display = 'block';
            if (this.dom.sourceBody) {
                this.dom.sourceBody.style.display = 'block';
                this.dom.sourceArrow.classList.remove('collapsed');
            }

            // Update loading text
            (this.dom.loadingText as HTMLElement).textContent = 'Fetching tables...';
        } else {
            // Hide loading indicator for other operations (pagination, search, etc.)
            this.dom.loadingIndicator.style.display = 'none';
        }
    }
}
