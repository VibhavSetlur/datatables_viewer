import { Component, type ComponentOptions } from '../Component';
import { ConfigManager } from '../../utils/config-manager';
import { StateManager, type AppState } from '../../core/state/StateManager';
import { CategoryManager } from '../../core/managers/CategoryManager';

export interface SidebarOptions extends ComponentOptions {
    configManager: ConfigManager;
    stateManager: StateManager;
    onApiChange: (apiId: string) => void;
    onLoadData: () => void;
    onTableChange: (tableName: string) => void;
    onExport: () => void;
    onReset: () => void;
    onShowSchema: (tableName: string) => void;
    onShowStats: (tableName: string) => void;
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

            // Collapse data source section only after data has loaded and is visible
            // Wait for both tables to be available and data to be loaded
            if (!state.loading && state.availableTables.length > 0 && state.data.length > 0 && state.activeTableName) {
                // Small delay to ensure data is visible before collapsing
                setTimeout(() => {
                    if (this.dom.sourceBody && this.dom.sourceBody.style.display !== 'none') {
                        this.dom.sourceBody.style.display = 'none';
                        this.dom.sourceArrow.classList.add('collapsed');
                    }
                }, 500); // Slightly longer delay to ensure data is rendered
            }

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
                <!-- Connection -->
                <section class="ts-section" id="ts-source-section" style="padding: 0 4px;">
                    <div class="ts-section-header collapsible" id="ts-source-head">
                        <span class="ts-section-title">Data Source</span>
                        <div style="display:flex; align-items:center; gap:8px">
                            <i class="bi bi-chevron-down ts-section-arrow" id="ts-source-arrow"></i>
                            <i class="bi bi-database-fill-gear ts-text-muted"></i>
                        </div>
                    </div>
                    <div id="ts-source-body">
                        <div class="ts-field">
                            <label class="ts-label">Auth Token <span style="color:red">*</span></label>
                            <input type="password" class="ts-input" id="ts-token" placeholder="Enter KBase token...">
                        </div>
                        <div class="ts-field">
                            <label class="ts-label">Object ID / UPA</label>
                            <input type="text" class="ts-input" id="ts-berdl" 
                                placeholder="e.g., 76990/7/2" value="76990/7/2">
                        </div>
                        <button class="ts-btn-primary" id="ts-load" style="height: 34px;">
                            <i class="bi bi-lightning-charge-fill"></i> Load Data
                        </button>
                        <div id="ts-loading-indicator" style="display:none;margin-top:12px;padding:12px;background:var(--c-bg-surface);border-radius:var(--radius-sm);border:1px solid var(--c-border-subtle)">
                            <div style="display:flex;align-items:center;gap:10px;color:var(--c-text-secondary);font-size:13px">
                                <span class="ts-spinner" style="width:16px;height:16px"></span>
                                <span id="ts-loading-text">Loading data...</span>
                            </div>
                        </div>
                    </div>
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
            token: '#ts-token',
            berdl: '#ts-berdl',
            loadBtn: '#ts-load',
            sourceHead: '#ts-source-head',
            sourceBody: '#ts-source-body',
            sourceArrow: '#ts-source-arrow',
            loadingIndicator: '#ts-loading-indicator',
            loadingText: '#ts-loading-text',
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
            export: '#ts-export',
            reset: '#ts-reset'
        });
    }

    protected bindEvents() {
        // Load
        this.dom.loadBtn?.addEventListener('click', () => {
            // Explicitly open data source section when user clicks Load Data
            if (this.dom.sourceBody) {
                this.dom.sourceBody.style.display = 'block';
                this.dom.sourceArrow.classList.remove('collapsed');
            }
            this.options.onLoadData();
            // Keep source section open to show loading state
            // It will collapse automatically when data loads (handled in state subscription)
        });

        this.dom.sourceHead?.addEventListener('click', () => {
            const isHidden = this.dom.sourceBody.style.display === 'none';
            this.dom.sourceBody.style.display = isHidden ? 'block' : 'none';
            this.dom.sourceArrow.classList.toggle('collapsed', !isHidden);
        });

        this.dom.berdl?.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') this.dom.loadBtn.click();
        });

        // Table Select
        this.dom.tableSelect?.addEventListener('change', (e: Event) => {
            this.options.onTableChange((e.target as HTMLSelectElement).value);
        });

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
                    this.categoryManager.toggleCategory(catId);
                    this.stateManager.update({ visibleColumns: this.categoryManager.getVisibleColumns() });
                    this.renderControlList();
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
            const panel = new AdvancedFilterPanel({
            container: modal.querySelector('#ts-advanced-filter-container')!,
            columns,
            onApply: (filters) => {
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

        let aggregations = state.aggregations || [];
        let groupBy = state.groupBy || [];

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

    public renderControlList() {
        if (!this.dom.controlList) return;
        this.dom.controlSection.style.display = 'block';

        const state = this.stateManager.getState();
        const cats = this.categoryManager ? this.categoryManager.getAllCategories() : [];
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
        
        // Simple column filters
        Object.entries(filters).forEach(([col, val]) => {
            chips.push(`
                <div class="ts-chip">
                    <span class="ts-chip-label">${col}:</span>
                    <span class="ts-chip-value">${val}</span>
                    <button class="ts-chip-clear" data-col="${col}"><i class="bi bi-x"></i></button>
                </div>
            `);
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
                    : String(filter.value);
                
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
                    const newFilters = [...(state.advancedFilters || [])];
                    newFilters.splice(parseInt(advFilterIdx), 1);
                    this.stateManager.update({ 
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

    private toggleAllColumns() {
        const state = this.stateManager.getState();
        const allVisible = state.columns.every(c => state.visibleColumns.has(c.column));
        const newVisible = new Set<string>(state.visibleColumns);

        state.columns.forEach(c => {
            if (allVisible) newVisible.delete(c.column);
            else newVisible.add(c.column);
        });

        this.stateManager.update({ visibleColumns: newVisible });
        this.renderControlList();
    }

    public getToken(): string {
        return (this.dom.token as HTMLInputElement)?.value || '';
    }

    public getBerdlId(): string {
        return (this.dom.berdl as HTMLInputElement)?.value || '';
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
