import { ConfigManager } from '../../core/config/ConfigManager';
import { StateManager } from '../../core/state/StateManager';
import { ApiClient } from '../../core/api/ApiClient';
import { logger } from '../../utils/logger';

export interface SchemaViewerOptions {
    configManager: ConfigManager;
    stateManager: StateManager;
    client: ApiClient;
    createModal: (title: string, bodyHtml: string) => HTMLElement;
    switchTable: (name: string) => Promise<void>;
    fetchData: () => void;
}

export class SchemaViewer {
    private configManager: ConfigManager;
    private stateManager: StateManager;
    private client: ApiClient;
    private createModal: (title: string, bodyHtml: string) => HTMLElement;
    private switchTable: (name: string) => Promise<void>;
    private fetchData: () => void;

    private searchTerm: string = '';
    private searchResults: Array<{ table: any; columns: any[]; hasDataMatches?: boolean }> = [];
    private isSearchingData: boolean = false;
    private modal: HTMLElement | null = null;

    constructor(options: SchemaViewerOptions) {
        this.configManager = options.configManager;
        this.stateManager = options.stateManager;
        this.client = options.client;
        this.createModal = options.createModal;
        this.switchTable = options.switchTable.bind(options.switchTable);
        this.fetchData = options.fetchData.bind(options.fetchData);
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



    public async show(initialTable?: string) {
        const state = this.stateManager.getState();
        const tables = state.availableTables || [];

        const activeTable: string | null = initialTable || null;
        this.searchTerm = '';
        this.searchResults = [];
        this.isSearchingData = false;

        const renderSidebar = (active: string | null, searchQuery: string = '') => {
            const hasSearch = searchQuery.trim().length > 0;

            return `
                <div class="glass-sidebar" style="width:260px;display:flex;flex-direction:column;height:100%">
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
                                <button id="ts-search-data-btn" class="ts-btn-secondary" style="flex:1;height:28px;font-size:11px;padding:0 8px;${this.isSearchingData ? 'opacity:0.6' : ''}" ${this.isSearchingData ? 'disabled' : ''}>
                                    <i class="bi bi-${this.isSearchingData ? 'hourglass-split' : 'search'}"></i> ${this.isSearchingData ? 'Searching...' : 'Search Data'}
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
                                    ${this.searchResults.length > 0 ? `Results (${this.searchResults.length})` : 'No Results'}
                                </span>
                            </div>
                            ${this.searchResults.length > 0 ? this.searchResults.map((result: any) => {
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

            if (this.searchTerm && this.searchResults.length > 0) {
                return `
                    <div style="padding:40px;max-width:960px;margin:0 auto">
                        <div style="margin-bottom:32px">
                            <h2 style="font-size:24px;font-weight:700;color:var(--c-text-primary);margin-bottom:8px">
                                Search Results for "${this.searchTerm}"
                            </h2>
                            <p style="color:var(--c-text-secondary);font-size:14px">Found ${this.searchResults.length} table${this.searchResults.length !== 1 ? 's' : ''} with matches</p>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:16px">
                            ${this.searchResults.map((result: any) => {
                    const matchCount = result.columns.length + (result.hasDataMatches ? 1 : 0);
                    return `
                                    <div class="ts-card-nav" data-target="${result.table.name}" data-search="${this.searchTerm}" style="cursor:pointer">
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

        const updateView = (target: string, searchQuery: string = this.searchTerm) => {
            const sidebar = this.modal?.querySelector('#ts-schema-sidebar');
            const main = this.modal?.querySelector('#ts-schema-main');
            if (sidebar) sidebar.innerHTML = renderSidebar(target === '__overview__' ? null : target, searchQuery);
            if (main) {
                main.innerHTML = target === '__overview__' ? renderOverview() : renderTableDetail(target);
                main.scrollTop = 0;
            }
            bindEvents();
        };

        const performSearch = async (query: string, searchData: boolean = false): Promise<void> => {
            this.searchTerm = query.trim();
            this.searchResults = [];

            if (!this.searchTerm) {
                updateView('__overview__');
                return;
            }

            const queryLower = this.searchTerm.toLowerCase();
            const currentState = this.stateManager.getState();

            // Client-side search: tables and columns
            for (const table of tables) {
                const tableMatches = table.name.toLowerCase().includes(queryLower);
                const config = this.configManager.getTableConfig(table.name);
                const isLive = currentState.activeTableName === table.name;
                const columns = isLive ? currentState.columns : (config.columns || []);

                const matchingColumns = columns.filter((c: any) => {
                    const colName = (c.displayName || c.column || '').toLowerCase();
                    const colKey = (c.column || '').toLowerCase();
                    const desc = (c.description || '').toLowerCase();
                    return colName.includes(queryLower) || colKey.includes(queryLower) || desc.includes(queryLower);
                });

                if (tableMatches || matchingColumns.length > 0) {
                    this.searchResults.push({
                        table,
                        columns: matchingColumns,
                        hasDataMatches: false
                    });
                }
            }

            // API-based search for cell values if requested
            if (searchData && currentState.berdlTableId) {
                this.isSearchingData = true;
                const sidebar = this.modal?.querySelector('#ts-schema-sidebar');
                if (sidebar) sidebar.innerHTML = renderSidebar(null, this.searchTerm);
                bindEvents();

                const dataSearchPromises = tables.map(async (table: any) => {
                    try {
                        const res = await this.client.getTableData({
                            berdl_table_id: currentState.berdlTableId || '',
                            table_name: table.name,
                            limit: 1,
                            offset: 0,
                            search_value: this.searchTerm
                        });

                        if (res.total_count > 0) {
                            const existing = this.searchResults.find(r => r.table.name === table.name);
                            if (existing) {
                                existing.hasDataMatches = true;
                            } else {
                                this.searchResults.push({
                                    table,
                                    columns: [],
                                    hasDataMatches: true
                                });
                            }
                        }
                    } catch (e) {
                        logger.warn(`Failed to search data in table ${table.name}`, e);
                    }
                });

                await Promise.all(dataSearchPromises);
                this.isSearchingData = false;
            }

            updateView('__overview__');
        };

        const bindEvents = () => {
            if (!this.modal) return;

            // Database search input
            const dbSearchInput = this.modal.querySelector('#ts-db-search') as HTMLInputElement;
            const dbSearchClear = this.modal.querySelector('#ts-db-search-clear');
            const searchDataBtn = this.modal.querySelector('#ts-search-data-btn');

            if (dbSearchInput) {
                let searchDebounce: any = null;
                dbSearchInput.addEventListener('input', () => {
                    const query = dbSearchInput.value;
                    this.searchTerm = query;

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
                    this.searchTerm = '';
                    this.searchResults = [];
                    this.isSearchingData = false;
                    updateView('__overview__', '');
                });
            }

            if (searchDataBtn) {
                searchDataBtn.addEventListener('click', async () => {
                    if (!this.searchTerm || this.isSearchingData) return;
                    await performSearch(this.searchTerm, true);
                });
            }

            // Navigation items and cards
            this.modal.querySelectorAll('.ts-nav-item, .ts-card-nav').forEach(el => {
                el.addEventListener('click', () => {
                    const target = (el as HTMLElement).dataset.target;
                    const searchQuery = (el as HTMLElement).dataset.search;
                    if (target) {
                        if (target !== '__overview__' && searchQuery) {
                            // Close modal and load table with search
                            const closeBtn = this.modal?.querySelector('.ts-modal-close') as HTMLElement;
                            if (closeBtn) closeBtn.click();

                            // Switch to the table and apply search
                            this.switchTable(target).then(() => {
                                this.stateManager.update({ searchValue: searchQuery, currentPage: 0 });
                                this.fetchData();
                            });
                        } else {
                            updateView(target, searchQuery || this.searchTerm);
                        }
                    }
                });
            });

            // Column filter in table detail view
            const filterInput = this.modal.querySelector('#ts-schema-filter') as HTMLInputElement;
            const container = this.modal.querySelector('#ts-schema-items-container');
            if (filterInput && container) {
                filterInput.addEventListener('input', () => {
                    const term = filterInput.value.toLowerCase();
                    container.querySelectorAll('.ts-schema-item').forEach(item => {
                        const text = (item.textContent || '').toLowerCase();
                        (item as HTMLElement).style.display = text.includes(term) ? 'flex' : 'none';
                    });
                });
            }

            const exportBtn = this.modal.querySelector('#ts-export-current');
            exportBtn?.addEventListener('click', () => {
                const table = (exportBtn as HTMLElement).dataset.table;
                if (!table) return;
                const currentState = this.stateManager.getState();
                const config = this.configManager.getTableConfig(table);
                const cols = (currentState.activeTableName === table) ? currentState.columns : (config.columns || []);
                const schemaData = JSON.stringify(config || { tableName: table, columns: cols }, null, 2);
                const blob = new Blob([schemaData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${table}_schema.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        };

        const layout = `
            <div style="display:flex;height:100%;overflow:hidden">
                <div id="ts-schema-sidebar">${renderSidebar(activeTable || null)}</div>
                <div id="ts-schema-main" style="flex:1;overflow-y:auto;background:var(--c-bg-app-solid);position:relative">
                    ${activeTable ? renderTableDetail(activeTable) : renderOverview()}
                </div>
            </div>
        `;

        this.modal = this.createModal('Database Explorer', layout);
        const modalBody = this.modal.querySelector('.ts-modal-body') as HTMLElement;
        if (modalBody) {
            modalBody.style.padding = '0';
            modalBody.style.height = 'calc(80vh - 60px)';
        }

        bindEvents();
    }
}
