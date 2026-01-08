import { Component, type ComponentOptions } from '../Component';
import { ConfigManager } from '../../utils/config-manager';
import { StateManager, type AppState } from '../../core/StateManager';
import { CategoryManager } from '../../core/CategoryManager';

export interface SidebarOptions extends ComponentOptions {
    configManager: ConfigManager;
    stateManager: StateManager;
    onApiChange: (apiId: string) => void;
    onLoadData: () => void;
    onTableChange: (tableName: string) => void;
    onExport: () => void;
    onReset: () => void;
    onShowSchema: (tableName: string) => void;
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

                if (state.activeTableName && state.availableTables.length > 0) {
                    this.updateTableInfo(state.activeTableName);
                }
            }

            // Re-render control list when columns change
            if (state.columns.length > 0 && this.dom.controlList) {
                this.renderControlList();
            }

            // Update filter chips if they changed
            this.renderFilterChips();
        });
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
                    </div>
                </section>

                <!-- Table Selection -->
                <section class="ts-section" id="ts-nav-section" style="display:none; padding: 0 4px;">
                    <div class="ts-section-header">
                        <span class="ts-section-title">Active Table</span>
                    </div>
                    <select class="ts-select" id="ts-table-select"></select>
                    <button class="ts-btn-secondary" id="ts-view-schema" style="margin-top:8px;">
                        <i class="bi bi-file-earmark-code"></i> View Schema
                    </button>
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
                        <button class="ts-section-action" id="ts-clear-filters">Clear All</button>
                    </div>
                    <div class="ts-filter-chips" id="ts-filter-chips"></div>
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
            navSection: '#ts-nav-section',
            tableSelect: '#ts-table-select',
            viewSchema: '#ts-view-schema',
            controlSection: '#ts-control-section',
            controlList: '#ts-control-list',
            controlExpandAll: '#ts-control-expand-all',
            controlShowAll: '#ts-control-show-all',
            filtersSection: '#ts-filters-section',
            filterChips: '#ts-filter-chips',
            clearFilters: '#ts-clear-filters',
            export: '#ts-export',
            reset: '#ts-reset'
        });
    }

    protected bindEvents() {
        // Load
        this.dom.loadBtn?.addEventListener('click', () => {
            this.options.onLoadData();
            // Collapse source on load to save space
            if (this.dom.sourceBody) {
                this.dom.sourceBody.style.display = 'none';
                this.dom.sourceArrow.classList.add('collapsed');
            }
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
                    if (select && select.value) {
                        this.options.onShowSchema(select.value);
                    } else {
                        alert("Please select a table to view its schema.");
                    }
                }
            });
        }

        // Clear filters
        this.dom.clearFilters?.addEventListener('click', () => {
            this.stateManager.update({ columnFilters: {}, currentPage: 0 });
        });
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
        const hasFilters = Object.keys(filters).length > 0;

        if (this.dom.filtersSection) this.dom.filtersSection.style.display = hasFilters ? 'block' : 'none';
        if (!this.dom.filterChips) return;

        this.dom.filterChips.innerHTML = Object.entries(filters).map(([col, val]) => `
            <div class="ts-chip">
                <span class="ts-chip-label">${col}:</span>
                <span class="ts-chip-value">${val}</span>
                <button class="ts-chip-clear" data-col="${col}"><i class="bi bi-x"></i></button>
            </div>
        `).join('');

        this.dom.filterChips.querySelectorAll('.ts-chip-clear').forEach(btn => {
            btn.addEventListener('click', (e: Event) => {
                const col = (e.currentTarget as HTMLElement).dataset.col;
                if (col) {
                    const newState = { ...this.stateManager.getState().columnFilters };
                    delete newState[col];
                    this.stateManager.update({ columnFilters: newState, currentPage: 0 });
                }
            });
        });
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
}
