/**
 * Table Renderer
 * 
 * Core table rendering engine with configuration-driven features.
 * Integrates transformers, category manager, and KBase client.
 * 
 * @fileoverview Main table rendering component
 * @author KBase Team
 * @license MIT
 */

'use strict';

/**
 * TableRenderer - Main table rendering engine
 */
class TableRenderer {
    /**
     * Create a TableRenderer instance
     * 
     * @param {Object} options - Renderer options
     * @param {HTMLElement} options.container - Container element for the table
     * @param {Object} [options.config] - Table configuration object
     * @param {string} [options.configUrl] - URL to load configuration from
     * @param {KBaseTableClient} [options.client] - API client instance
     */
    constructor(options) {
        if (!options.container) {
            throw new Error('TableRenderer requires a container element');
        }

        this.container = options.container;
        this.config = null;
        this.configUrl = options.configUrl || null;
        this.client = options.client || null;

        /** @type {CategoryManager|null} */
        this.categoryManager = null;

        /** @type {Object} Current state */
        this.state = {
            berdlTableId: null,
            tableName: null,
            headers: [],
            data: [],
            totalCount: 0,
            filteredCount: 0,
            currentPage: 0,
            pageSize: 100,
            sortColumn: null,
            sortOrder: 'asc',
            columnFilters: {},
            searchValue: '',
            visibleColumns: new Set(),
            loading: false,
            error: null,
            theme: 'dark'
        };

        /** @type {Object} DOM element references */
        this.dom = {};

        /** @type {Map<string, Object>} Column config lookup */
        this.columnConfigMap = new Map();
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    /**
     * Initialize the renderer
     * 
     * @param {Object} [config] - Configuration to use (overrides configUrl)
     */
    async init(config = null) {
        try {
            // Load configuration
            if (config) {
                this.config = typeof mergeWithDefaults === 'function'
                    ? mergeWithDefaults(config)
                    : config;
            } else if (typeof window.DEFAULT_CONFIG !== 'undefined') {
                // Use embedded config (for portable viewer)
                this.config = typeof mergeWithDefaults === 'function'
                    ? mergeWithDefaults(window.DEFAULT_CONFIG)
                    : window.DEFAULT_CONFIG;
                console.log('Loaded configuration from embedded DEFAULT_CONFIG');
            } else if (this.configUrl) {
                const response = await fetch(this.configUrl);
                if (!response.ok) throw new Error(`Failed to load config: ${response.status}`);
                const loadedConfig = await response.json();
                this.config = typeof mergeWithDefaults === 'function'
                    ? mergeWithDefaults(loadedConfig)
                    : loadedConfig;
            } else {
                this.config = {
                    name: 'Table Viewer',
                    categories: [],
                    columns: [],
                    defaultSettings: { pageSize: 100, theme: 'dark' }
                };
            }

            // Validate config
            if (typeof validateConfig === 'function') {
                const validation = validateConfig(this.config);
                if (!validation.valid) {
                    console.warn('Configuration validation warnings:', validation.errors);
                }
            }

            // Build column config lookup
            this.config.columns.forEach(col => {
                this.columnConfigMap.set(col.column, col);
            });

            // Initialize category manager
            if (typeof CategoryManager !== 'undefined') {
                this.categoryManager = new CategoryManager(this.config);
            }

            // Apply default settings
            const defaults = this.config.defaultSettings || {};
            this.state.pageSize = defaults.pageSize || 100;
            this.state.sortColumn = defaults.sortColumn || null;
            this.state.sortOrder = defaults.sortOrder || 'asc';
            this.state.theme = defaults.theme || 'dark';

            // IMPORTANT: Initialize Client with Configured Environment
            // Default to 'local' if not specified for robust testing
            const env = this.config.environment || 'local';

            // If client wasn't passed in constructor, create it now
            if (!this.client && typeof KBaseTableClient !== 'undefined') {
                this.client = new KBaseTableClient({
                    environment: env,
                    // Allow explicit API URL override from config
                    baseUrl: this.config.apiUrl || null
                });
            } else if (this.client) {
                // If client exists, just update environment
                this.client.setEnvironment(env);
            }

            // Render UI
            this._renderUI();
            this._bindEvents();
            this._applyTheme();

        } catch (error) {
            console.error('TableRenderer init error:', error);
            this.state.error = error.message;
            this._renderError();
        }
    }

    // =========================================================================
    // UI RENDERING
    // =========================================================================

    /**
     * Render the complete UI structure
     * @private
     */
    _renderUI() {
        this.container.innerHTML = `
            <div class="ts-app" data-theme="${this.state.theme}" data-density="${this.state.density || 'normal'}">
                <!-- Header -->
                <header class="ts-header">
                    <div class="ts-header-title">
                        <i class="bi bi-grid-3x3-gap-fill"></i>
                        <span id="ts-title">${this._escapeHtml(this.config.name)}</span>
                    </div>
                    <div class="ts-toolbar-group">
                        <button class="ts-btn" id="ts-reset-btn" title="Reset Filters & Sorts">
                            <i class="bi bi-arrow-counterclockwise"></i> Reset View
                        </button>
                        <div class="ts-dropdown">
                            <button class="ts-btn ts-btn-icon" id="ts-settings-btn" title="View Settings">
                                <i class="bi bi-gear"></i>
                            </button>
                            <div class="ts-panel" id="ts-settings-panel" style="right: 0; min-width: 200px;">
                                <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--ts-primary);">Display Options</div>
                                <div class="ts-setting-item">
                                    <label>Theme</label>
                                    <button class="ts-btn ts-btn-sm" id="ts-theme-toggle" style="width: 100%">
                                        <i class="bi bi-moon-stars"></i> Toggle Theme
                                    </button>
                                </div>
                                <div class="ts-setting-item" style="margin-top: 0.75rem;">
                                    <label>Density</label>
                                    <div class="ts-btn-group" style="display: flex; gap: 4px;">
                                        <button class="ts-btn ts-btn-sm" data-density="compact" style="flex:1">Compact</button>
                                        <button class="ts-btn ts-btn-sm" data-density="normal" style="flex:1">Normal</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Main content -->
                <main class="ts-main">
                    <div class="ts-container">
                        <!-- Alert area -->
                        <div id="ts-alerts"></div>

                        <!-- Data Source Control -->
                        <div class="ts-toolbar" id="ts-connection-toolbar">
                        
                        <!-- DATA CONNECTION BAR -->
                        <div class="ts-toolbar ts-connection-toolbar">
                             <div class="ts-toolbar-group" style="flex: 1;">
                                <label style="font-size: 0.75rem; color: var(--ts-text-muted); font-weight: 500;">DATA SOURCE:</label>
                                <input type="text" class="ts-input" id="ts-berdl-id" placeholder="BERDL Table ID (e.g., 76990/7/2)" style="flex: 1; font-family: var(--ts-font-mono);">
                                <button class="ts-btn ts-btn-primary" id="ts-load-btn">
                                    <i class="bi bi-cloud-download"></i> Load Data
                                </button>
                             </div>
                             
                             <div class="ts-toolbar-divider"></div>
                             
                             <div class="ts-toolbar-group">
                                <input type="password" class="ts-input" id="ts-token-input" placeholder="KBase Token (Optional)" style="width: 150px;">
                             </div>
                        </div>

                        <!-- CATEGORY TABS -->
                        <div id="ts-category-panel" class="ts-category-panel"></div>

                        <!-- TABLE CONTROLS -->
                        <div class="ts-toolbar ts-table-toolbar">
                            <div class="ts-toolbar-group" style="flex: 1;">
                                <div style="position: relative; width: 100%; max-width: 400px;">
                                    <i class="bi bi-search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--ts-text-muted);"></i>
                                    <input type="text" class="ts-input ts-input-lg" id="ts-search" placeholder="Search Filter..." style="width: 100%; padding-left: 32px;">
                                </div>
                            </div>

                            <div class="ts-toolbar-group">
                                <button class="ts-btn" id="ts-filters-btn" title="Toggle Filters">
                                    <i class="bi bi-funnel"></i> Filters 
                                    <span id="ts-active-filter-badge" class="ts-badge ts-badge-info" style="display:none; margin-left: 4px;">0</span>
                                </button>
                                
                                <div class="ts-dropdown">
                                    <button class="ts-btn" id="ts-columns-btn">
                                        <i class="bi bi-layout-three-columns"></i> Columns
                                    </button>
                                    <div class="ts-panel" id="ts-column-panel">
                                        <!-- Columns injected here -->
                                        <div style="padding: 1rem; text-align: center; color: var(--ts-text-muted);">
                                            Load a table to manage columns
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="ts-toolbar-divider"></div>
                                
                                <button class="ts-btn" id="ts-refresh-btn" title="Refresh Data">
                                    <i class="bi bi-arrow-clockwise"></i>
                                </button>
                                
                                <div class="ts-dropdown">
                                    <button class="ts-btn" id="ts-export-btn">
                                        <i class="bi bi-download"></i> Export
                                    </button>
                                    <div class="ts-panel" id="ts-export-panel" style="min-width: 200px;">
                                        <div class="ts-setting-item">
                                            <button class="ts-btn" style="width: 100%; justify-content: flex-start; margin-bottom: 4px;" onclick="window.tableRenderer._exportCsv()">
                                                <i class="bi bi-file-earmark-spreadsheet"></i> CSV (Current View)
                                            </button>
                                            <button class="ts-btn" style="width: 100%; justify-content: flex-start;" onclick="window.tableRenderer._exportCsvAll()">
                                                <i class="bi bi-database-down"></i> CSV (All Rows)
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <button class="ts-btn ts-btn-danger" id="ts-reset-btn" title="Reset View">
                                    Reset
                                </button>
                            </div>
                        </div>

                        <!-- ALERTS AREA -->
                        <div id="ts-alert-area"></div>

                        <!-- DATA TABLE -->
                        <div class="ts-table-container">
                            <div class="ts-table-scroll" id="ts-table-scroll">
                                <div class="ts-empty">
                                    <i class="bi bi-inbox"></i>
                                    <h3>Ready to Explore</h3>
                                    <p>Enter a Table ID above to load genomic data.</p>
                                </div>
                            </div>
                            
                            <!-- STATUS BAR -->
                            <div class="ts-status-bar">
                                <div class="ts-status-item" id="ts-status-text">
                                    Ready
                                </div>
                                <div class="ts-pagination" id="ts-pagination">
                                    <!-- Pagination injected here -->
                                </div>
                                <div class="ts-status-item">
                                    <select class="ts-select" id="ts-page-size" style="padding: 2px 24px 2px 8px; height: 28px;">
                                        <option value="20">20 / page</option>
                                        <option value="50">50 / page</option>
                                        <option value="100" selected>100 / page</option>
                                        <option value="500">500 / page</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                <!-- Hidden Tooltip -->
                <div id="ts-tooltip" class="ts-tooltip"></div>
            </div>
        `;

        // Cache DOM elements
        this.dom = {
            app: this.container.querySelector('.ts-app'),
            header: this.container.querySelector('.ts-header'), // Fixed selector
            settingsBtn: this.container.querySelector('#ts-settings-btn'),
            settingsPanel: this.container.querySelector('#ts-settings-panel'),
            themeToggle: this.container.querySelector('#ts-theme-toggle'),

            loadBtn: this.container.querySelector('#ts-load-btn'),
            berdlId: this.container.querySelector('#ts-berdl-id'),
            tokenInput: this.container.querySelector('#ts-token-input'),

            categoryPanel: this.container.querySelector('#ts-category-panel'),

            search: this.container.querySelector('#ts-search'),
            filtersBtn: this.container.querySelector('#ts-filters-btn'),
            columnsBtn: this.container.querySelector('#ts-columns-btn'),
            columnPanel: this.container.querySelector('#ts-column-panel'),
            refreshBtn: this.container.querySelector('#ts-refresh-btn'),
            exportBtn: this.container.querySelector('#ts-export-btn'),
            exportPanel: this.container.querySelector('#ts-export-panel'),
            resetBtn: this.container.querySelector('#ts-reset-btn'),

            alertArea: this.container.querySelector('#ts-alert-area'),
            tableScroll: this.container.querySelector('#ts-table-scroll'),
            pagination: this.container.querySelector('#ts-pagination'),
            pageSize: this.container.querySelector('#ts-page-size'),
            statusText: this.container.querySelector('#ts-status-text'),
            tooltip: this.container.querySelector('#ts-tooltip')
        };

        // Add stubs for removed elements to prevent errors in existing event listeners
        this.dom.tableSelect = { addEventListener: () => { }, value: null };
        this.dom.fetchBtn = { addEventListener: () => { }, disabled: false, classList: { add: () => { }, remove: () => { } } };
        this.dom.envSelect = { addEventListener: () => { }, value: 'local' };

        // Set initial page size
        if (this.dom.pageSize) {
            this.dom.pageSize.value = String(this.state.pageSize);
        }
    }

    /**
     * Bind event listeners
     * @private
     */
    _bindEvents() {
        // Load BERDLTable
        this.dom.loadBtn.addEventListener('click', () => this._loadBerdlTable());
        this.dom.berdlId.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this._loadBerdlTable();
        });

        // Token input
        if (this.dom.tokenInput) {
            this.dom.tokenInput.addEventListener('change', () => {
                this.setToken(this.dom.tokenInput.value);
            });
        }

        // Table selection
        this.dom.tableSelect.addEventListener('change', () => {
            if (this.dom.tableSelect.value) {
                this.dom.fetchBtn.disabled = false;
                this.dom.fetchBtn.classList.add('ts-btn-primary');
            } else {
                this.dom.fetchBtn.disabled = true;
                this.dom.fetchBtn.classList.remove('ts-btn-primary');
            }
        });

        // Fetch data
        this.dom.fetchBtn.addEventListener('click', () => this._fetchTableData());

        // Environment change
        this.dom.envSelect.addEventListener('change', () => {
            if (this.client) {
                this.client.setEnvironment(this.dom.envSelect.value);
            }
        });

        // Search
        this.dom.search.addEventListener('input', this._debounce(() => {
            this.state.searchValue = this.dom.search.value;
            this.state.currentPage = 0;
            this._fetchTableData();
        }, 300));

        // Page size
        this.dom.pageSize.addEventListener('change', () => {
            this.state.pageSize = parseInt(this.dom.pageSize.value);
            this.state.currentPage = 0;
            this._fetchTableData();
        });

        // Toggle filters
        this.dom.filtersBtn.addEventListener('click', () => {
            const filterRow = this.dom.tableScroll.querySelector('.ts-filter-row');
            if (filterRow) {
                const isHidden = filterRow.style.display === 'none';
                filterRow.style.display = isHidden ? '' : 'none';
                this.dom.filtersBtn.classList.toggle('active', isHidden);
            }
        });

        // Column panel toggle
        this.dom.columnsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dom.columnPanel.classList.toggle('show');
            this.dom.settingsPanel.classList.remove('show');
            this.dom.exportPanel.classList.remove('show');
        });

        // Settings panel toggle
        this.dom.settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dom.settingsPanel.classList.toggle('show');
            this.dom.columnPanel.classList.remove('show');
            this.dom.exportPanel.classList.remove('show');
        });

        // Export panel toggle
        this.dom.exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dom.exportPanel.classList.toggle('show');
            this.dom.columnPanel.classList.remove('show');
            this.dom.settingsPanel.classList.remove('show');
        });

        // Reset view
        this.dom.resetBtn.addEventListener('click', () => this._resetView());

        // Theme toggle
        this.dom.themeToggle.addEventListener('click', () => this._toggleTheme());

        // Density buttons
        const densityBtns = this.dom.settingsPanel.querySelectorAll('[data-density]');
        densityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const density = btn.dataset.density;
                this.state.density = density;
                this.dom.app.dataset.density = density;
                // Update active state
                densityBtns.forEach(b => b.classList.toggle('active', b.dataset.density === density));
            });
        });

        // Click outside to close panels
        document.addEventListener('click', (e) => {
            if (!this.dom.columnPanel.contains(e.target) && !this.dom.columnsBtn.contains(e.target)) {
                this.dom.columnPanel.classList.remove('show');
            }
            if (!this.dom.settingsPanel.contains(e.target) && !this.dom.settingsBtn.contains(e.target)) {
                this.dom.settingsPanel.classList.remove('show');
            }
            if (!this.dom.exportPanel.contains(e.target) && !this.dom.exportBtn.contains(e.target)) {
                this.dom.exportPanel.classList.remove('show');
            }
        });

        // Table header sorting
        this.container.addEventListener('click', (e) => {
            const th = e.target.closest('.ts-table th[data-col]');
            if (th && !e.target.classList.contains('ts-col-filter')) {
                const col = th.dataset.col;
                if (this.state.sortColumn === col) {
                    this.state.sortOrder = this.state.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    this.state.sortColumn = col;
                    this.state.sortOrder = 'asc';
                }
                this.state.currentPage = 0;
                this._fetchTableData();
            }
        });

        // Column filter input
        this.container.addEventListener('input', this._debounce((e) => {
            if (e.target.dataset.filter) {
                const col = e.target.dataset.filter;
                const val = e.target.value.trim();

                if (val) {
                    this.state.columnFilters[col] = val;
                } else {
                    delete this.state.columnFilters[col];
                }

                // Update badge
                const count = Object.keys(this.state.columnFilters).length;
                const badge = this.container.querySelector('#ts-active-filter-badge');
                if (badge) {
                    badge.textContent = count;
                    badge.style.display = count > 0 ? 'inline-flex' : 'none';
                }

                this.state.currentPage = 0;
                this._fetchTableData();
            }
        }, 500));

        // Pagination
        this.container.addEventListener('click', (e) => {
            const btn = e.target.closest('.ts-page-btn[data-page]');
            if (btn && !btn.disabled) {
                this.state.currentPage = parseInt(btn.dataset.page);
                this._fetchTableData();
            }
        });

        // Column visibility toggle
        this.container.addEventListener('change', (e) => {
            if (e.target.dataset.toggleCol) {
                const col = e.target.dataset.toggleCol;
                if (e.target.checked) {
                    this.state.visibleColumns.add(col);
                } else {
                    this.state.visibleColumns.delete(col);
                }
                this._updateColumnVisibility();
            }
        });

        // Category toggles
        this.container.addEventListener('click', (e) => {
            const toggle = e.target.closest('.ts-category-toggle');
            if (toggle && this.categoryManager) {
                const catId = toggle.dataset.category;
                this.categoryManager.toggleCategory(catId);

                // Active state handled by render
                toggle.classList.toggle('active'); // Optimistic UI update

                this.state.visibleColumns = this.categoryManager.getVisibleColumns();
                this._updateColumnVisibility();
                this._updateColumnPanel();
            }
        });

        // Cell tooltip
        this.container.addEventListener('mouseover', (e) => {
            if (e.target.matches('.ts-table td')) {
                this._showTooltip(e, e.target);
            }
        });

        this.container.addEventListener('mouseout', (e) => {
            if (e.target.matches('.ts-table td')) {
                this._hideTooltip();
            }
        });

        this.container.addEventListener('mousemove', (e) => {
            if (this.dom.tooltip.classList.contains('show')) {
                const tooltipWidth = this.dom.tooltip.offsetWidth;
                const tooltipHeight = this.dom.tooltip.offsetHeight;

                // Smart positioning to avoid off-screen
                let left = e.clientX + 12;
                let top = e.clientY + 12;

                if (left + tooltipWidth > window.innerWidth) {
                    left = e.clientX - tooltipWidth - 12;
                }

                if (top + tooltipHeight > window.innerHeight) {
                    top = e.clientY - tooltipHeight - 12;
                }

                this.dom.tooltip.style.left = left + 'px';
                this.dom.tooltip.style.top = top + 'px';
            }
        });
    }

    // =========================================================================
    // DATA OPERATIONS
    // =========================================================================

    /**
     * Load BERDLTable and list available tables
     * @private
     */
    async _loadBerdlTable() {
        const berdlId = this.dom.berdlId.value.trim();
        if (!berdlId) {
            this._showAlert('Please enter a BERDLTable ID', 'warning');
            return;
        }

        this.state.berdlTableId = berdlId;
        this._setLoading(true);

        try {
            if (!this.client) {
                this.client = new KBaseTableClient({
                    environment: this.dom.envSelect.value,
                    token: this.token
                });
            }

            const response = await this.client.listTables(berdlId);

            // Populate table select
            this.dom.tableSelect.innerHTML = '<option value="">Select a table...</option>';
            (response.tables || []).forEach(table => {
                const option = document.createElement('option');
                option.value = table.name;
                option.textContent = `${table.name} (${table.row_count || '?'} rows)`;
                this.dom.tableSelect.appendChild(option);
            });

            this.dom.tableSelect.disabled = false;
            this.dom.fetchBtn.disabled = true;
            this._showAlert(`Loaded ${response.tables?.length || 0} tables`, 'success');

        } catch (error) {
            console.error('Load error:', error);
            this._showAlert(`Error: ${error.message}`, 'danger');
        } finally {
            this._setLoading(false);
        }
    }

    /**
     * Fetch table data
     * @private
     */
    async _fetchTableData() {
        const tableName = this.dom.tableSelect.value;
        if (!this.state.berdlTableId || !tableName) return;

        this.state.tableName = tableName;
        this._setLoading(true);

        try {
            const request = {
                berdl_table_id: this.state.berdlTableId,
                table_name: tableName,
                limit: this.state.pageSize,
                offset: this.state.currentPage * this.state.pageSize
            };

            if (this.state.sortColumn) {
                request.sort_column = this.state.sortColumn;
                request.sort_order = this.state.sortOrder.toUpperCase();
            }

            if (this.state.searchValue) {
                request.search_value = this.state.searchValue;
            }

            if (Object.keys(this.state.columnFilters).length > 0) {
                request.col_filter = this.state.columnFilters;
            }

            const response = await this.client.getTableData(request);

            // Update state
            // Update state: Start with API headers
            const apiHeaders = response.headers || [];
            this.state.headers = [...apiHeaders];

            // Add configured columns that are not in API headers (synthetic columns)
            if (this.config && this.config.columns) {
                this.config.columns.forEach(col => {
                    // Only add if it creates a new column (e.g. merge)
                    if (!this.state.headers.includes(col.column)) {
                        this.state.headers.push(col.column);
                    }
                });
            }

            this.state.data = response.data || [];
            this.state.totalCount = response.total_count || 0;
            this.state.filteredCount = response.filtered_count || 0;

            // Initialize visible columns from category manager or show all
            if (this.categoryManager && this.state.visibleColumns.size === 0) {
                this.state.visibleColumns = this.categoryManager.getVisibleColumns();
                // Also add any columns not in config
                this.state.headers.forEach(h => {
                    if (!this.columnConfigMap.has(h)) {
                        this.state.visibleColumns.add(h);
                    }
                });
            } else if (this.state.visibleColumns.size === 0) {
                this.state.visibleColumns = new Set(this.state.headers);
            }

            // Render
            this._renderCategoryPanel();
            this._renderTable();
            this._updateStatusBar(response);
            this._updateColumnPanel();

            // Show toolbars
            this.dom.categoryPanel.style.display = this.config.categories?.length ? 'flex' : 'none';
            this.dom.tableToolbar.style.display = 'flex';
            this.dom.statusBar.style.display = 'flex';
            this.dom.empty.style.display = 'none';

        } catch (error) {
            console.error('Fetch error:', error);
            this._showAlert(`Error: ${error.message}`, 'danger');
        } finally {
            this._setLoading(false);
        }
    }

    // =========================================================================
    // TABLE RENDERING
    // =========================================================================

    /**
     * Render the data table
     * @private
     */
    _renderTable() {
        if (this.state.headers.length === 0) {
            this.dom.tableScroll.innerHTML = '<div class="ts-empty"><i class="bi bi-inbox"></i><p>No data available</p></div>';
            return;
        }

        // Convert data to row objects for transformers
        const rowObjects = this.state.data.map(row => {
            const obj = {};
            this.state.headers.forEach((h, i) => obj[h] = row[i]);
            return obj;
        });

        let html = '<table class="ts-table">';

        // Header row
        html += '<thead><tr>';
        this.state.headers.forEach(header => {
            const config = this.columnConfigMap.get(header) || {};
            const isVisible = this.state.visibleColumns.has(header);
            const isSortable = config.sortable !== false;
            const sortClass = this.state.sortColumn === header
                ? (this.state.sortOrder === 'asc' ? 'sort-asc' : 'sort-desc')
                : '';

            html += `<th data-col="${this._escapeHtml(header)}" 
                        class="${isVisible ? '' : 'hidden-col'} ${isSortable ? 'sortable' : ''} ${sortClass}">
                        ${this._escapeHtml(config.displayName || header)}
                    </th>`;
        });
        html += '</tr>';

        // Filter row (hidden by default)
        html += '<tr class="ts-filter-row" style="display: none;">';
        this.state.headers.forEach(header => {
            const config = this.columnConfigMap.get(header) || {};
            const isVisible = this.state.visibleColumns.has(header);
            const isFilterable = config.filterable !== false;

            html += `<th class="${isVisible ? '' : 'hidden-col'}">`;
            if (isFilterable) {
                const filterValue = this.state.columnFilters[header] || '';
                html += `<input type="text" class="ts-col-filter" 
                            data-filter="${this._escapeHtml(header)}" 
                            placeholder="Filter..." 
                            value="${this._escapeHtml(filterValue)}">`;
            }
            html += '</th>';
        });
        html += '</tr></thead>';

        // Body rows
        html += '<tbody>';
        rowObjects.forEach(rowObj => {
            html += '<tr>';
            this.state.headers.forEach((header, colIdx) => {
                const config = this.columnConfigMap.get(header) || {};
                const isVisible = this.state.visibleColumns.has(header);
                const rawValue = rowObj[header];
                const align = config.align ? `align-${config.align}` : '';

                // Apply transformation
                let cellContent;
                if (config.transform && typeof Transformers !== 'undefined') {
                    cellContent = Transformers.apply(rawValue, config.transform, rowObj);
                } else {
                    cellContent = rawValue !== null && rawValue !== undefined
                        ? this._escapeHtml(String(rawValue))
                        : '';
                }

                html += `<td data-col="${colIdx}" 
                            data-raw="${this._escapeHtml(String(rawValue || ''))}"
                            class="${isVisible ? '' : 'hidden-col'} ${align}">
                            ${cellContent}
                        </td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>';

        this.dom.tableScroll.innerHTML = html;
    }

    /**
     * Render category toggle panel
     * @private
     */
    _renderCategoryPanel() {
        if (!this.categoryManager || !this.config.categories?.length) {
            this.dom.categoryPanel.innerHTML = '';
            return;
        }

        const categories = this.categoryManager.getAllCategories();

        let html = '<span style="font-size: 0.75rem; color: var(--ts-text-muted); margin-right: 0.5rem;">Categories:</span>';

        categories.forEach(cat => {
            const iconHtml = cat.icon ? `<i class="${cat.icon}"></i>` : '';
            const activeClass = cat.visible ? 'active' : '';
            const style = cat.color ? `border-color: ${cat.color}40;` : '';

            html += `<button class="ts-category-toggle ${activeClass}" 
                            data-category="${this._escapeHtml(cat.id)}"
                            style="${style}"
                            title="${this._escapeHtml(cat.description || '')}">
                        ${iconHtml}
                        <span>${this._escapeHtml(cat.name)}</span>
                        <span class="ts-category-count">${cat.columnCount}</span>
                    </button>`;
        });

        this.dom.categoryPanel.innerHTML = html;
    }

    /**
     * Update column visibility in table
     * @private
     */
    _updateColumnVisibility() {
        const table = this.dom.tableScroll.querySelector('.ts-table');
        if (!table) return;

        this.state.headers.forEach((header, idx) => {
            const isVisible = this.state.visibleColumns.has(header);

            // Update header cells
            const ths = table.querySelectorAll(`th[data-col="${header}"], .ts-filter-row th:nth-child(${idx + 1})`);
            ths.forEach(th => th.classList.toggle('hidden-col', !isVisible));

            // Update data cells
            const tds = table.querySelectorAll(`td[data-col="${idx}"]`);
            tds.forEach(td => td.classList.toggle('hidden-col', !isVisible));
        });
    }

    /**
     * Update column visibility panel
     * @private
     */
    _updateColumnPanel() {
        let html = '<div style="margin-bottom: 0.5rem; display: flex; gap: 4px;">';
        html += '<button class="ts-btn ts-btn-sm" id="ts-select-all-cols">All</button>';
        html += '<button class="ts-btn ts-btn-sm" id="ts-select-none-cols">None</button>';
        html += '</div>';

        this.state.headers.forEach(header => {
            const config = this.columnConfigMap.get(header) || {};
            const isVisible = this.state.visibleColumns.has(header);
            const displayName = config.displayName || header;

            html += `<label class="ts-col-toggle">
                        <input type="checkbox" data-toggle-col="${this._escapeHtml(header)}" 
                               ${isVisible ? 'checked' : ''}>
                        <span>${this._escapeHtml(displayName)}</span>
                    </label>`;
        });

        this.dom.columnPanel.innerHTML = html;

        // Bind select all/none
        this.dom.columnPanel.querySelector('#ts-select-all-cols')?.addEventListener('click', () => {
            this.state.visibleColumns = new Set(this.state.headers);
            this._updateColumnVisibility();
            this._updateColumnPanel();
        });

        this.dom.columnPanel.querySelector('#ts-select-none-cols')?.addEventListener('click', () => {
            this.state.visibleColumns.clear();
            this._updateColumnVisibility();
            this._updateColumnPanel();
        });
    }

    /**
     * Update status bar with detailed metrics
     * @private
     */
    _updateStatusBar(response) {
        // Calculate range
        const total = this.state.filteredCount;
        const start = total === 0 ? 0 : (this.state.currentPage * this.state.pageSize) + 1;
        const end = Math.min((this.state.currentPage + 1) * this.state.pageSize, total);

        // Status Text
        let statusHtml = `
            <div class="ts-status-item">
                <span>Showing</span>
                <span class="ts-status-value">${start.toLocaleString()} - ${end.toLocaleString()}</span>
                <span>of</span>
                <span class="ts-status-value">${total.toLocaleString()}</span>
                <span>rows</span>
            </div>
        `;

        if (this.state.filteredCount < this.state.totalCount) {
            statusHtml += `
                <div class="ts-status-item">
                    <span style="opacity: 0.7">(filtered from ${this.state.totalCount.toLocaleString()})</span>
                </div>
             `;
        }

        if (response.response_time_ms) {
            statusHtml += `
                <div class="ts-status-item" style="margin-left: auto;">
                    <i class="bi bi-lightning-charge" style="color: var(--ts-warning);"></i>
                    <span>${response.response_time_ms.toFixed(0)} ms</span>
                </div>
            `;
        }

        // We replace the individual spans with this robust HTML
        // Note: The original generic _renderUI setup created generic spans (ts-status-text), 
        // we might need to query the container directly or rebuild it.
        // Let's assume we can wipe ts-status-bar and rebuild it if needed, or target specific containers.
        // Looking at _renderUI: it has <div class="ts-status-bar" id="ts-status-bar"><span id="ts-status-text"></span><div style="flex:1"></div><div id="ts-pagination"></div></div>

        if (this.dom.statusText) {
            this.dom.statusText.innerHTML = statusHtml;
            // Ensure the status text container flexes correctly
            this.dom.statusText.style.display = 'flex';
            this.dom.statusText.style.gap = '1rem';
            this.dom.statusText.style.alignItems = 'center';
        }

        // Render pagination
        this._renderPagination();
    }

    /**
     * Render pagination controls
     * @private
     */
    _renderPagination() {
        const totalPages = Math.ceil(this.state.filteredCount / this.state.pageSize);
        if (totalPages <= 1) {
            this.dom.pagination.innerHTML = '';
            return;
        }

        let html = '';

        // First / Prev
        html += `<button class="ts-page-btn" data-page="0" ${this.state.currentPage === 0 ? 'disabled' : ''} title="First Page">
                    <i class="bi bi-chevron-double-left"></i>
                </button>`;
        html += `<button class="ts-page-btn" data-page="${this.state.currentPage - 1}" 
                    ${this.state.currentPage === 0 ? 'disabled' : ''} title="Previous Page">
                    <i class="bi bi-chevron-left"></i>
                </button>`;

        // Smart Page numbers (Show first, last, and window around current)
        const windowSize = 2; // +/- 2 pages
        const startPage = Math.max(0, this.state.currentPage - windowSize);
        const endPage = Math.min(totalPages - 1, this.state.currentPage + windowSize);

        if (startPage > 0) {
            html += `<span style="padding: 0 4px; opacity: 0.5;">...</span>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="ts-page-btn ${i === this.state.currentPage ? 'active' : ''}" 
                        data-page="${i}">${i + 1}</button>`;
        }

        if (endPage < totalPages - 1) {
            html += `<span style="padding: 0 4px; opacity: 0.5;">...</span>`;
        }

        // Next / Last
        html += `<button class="ts-page-btn" data-page="${this.state.currentPage + 1}" 
                    ${this.state.currentPage >= totalPages - 1 ? 'disabled' : ''} title="Next Page">
                    <i class="bi bi-chevron-right"></i>
                </button>`;
        html += `<button class="ts-page-btn" data-page="${totalPages - 1}" 
                    ${this.state.currentPage >= totalPages - 1 ? 'disabled' : ''} title="Last Page">
                    <i class="bi bi-chevron-double-right"></i>
                </button>`;

        this.dom.pagination.innerHTML = html;
    }

    // =========================================================================
    // UI HELPERS
    // =========================================================================

    /**
     * Show loading state
     * @private
     */
    _setLoading(loading) {
        this.state.loading = loading;
        this.dom.loadBtn.disabled = loading;
        this.dom.fetchBtn.disabled = loading || !this.dom.tableSelect.value;

        if (loading && this.dom.empty) {
            this.dom.empty.innerHTML = '<div class="ts-spinner"></div><p>Loading...</p>';
        }
    }

    /**
     * Show alert message
     * @private
     */
    _showAlert(message, type = 'info') {
        const alert = document.createElement('div');
        alert.className = `ts-alert ts-alert-${type}`;
        alert.innerHTML = `<i class="bi bi-${type === 'success' ? 'check-circle' : type === 'danger' ? 'x-circle' : 'info-circle'}"></i>
                          <span>${this._escapeHtml(message)}</span>`;

        this.dom.alerts.innerHTML = '';
        this.dom.alerts.appendChild(alert);

        // Auto-remove after 5 seconds
        setTimeout(() => alert.remove(), 5000);
    }

    /**
     * Show tooltip
     * @private
     */
    _showTooltip(event, cell) {
        const colIdx = parseInt(cell.dataset.col);
        const header = this.state.headers[colIdx];
        const rawValue = cell.dataset.raw;
        const config = this.columnConfigMap.get(header) || {};

        this.dom.tooltipHeader.textContent = config.displayName || header;
        this.dom.tooltipValue.textContent = rawValue || '(empty)';
        this.dom.tooltip.style.left = (event.clientX + 12) + 'px';
        this.dom.tooltip.style.top = (event.clientY + 12) + 'px';
        this.dom.tooltip.classList.add('show');
    }

    /**
     * Hide tooltip
     * @private
     */
    _hideTooltip() {
        this.dom.tooltip.classList.remove('show');
    }

    /**
     * Toggle theme
     * @private
     */
    _toggleTheme() {
        this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
        this._applyTheme();
    }

    /**
     * Apply current theme
     * @private
     */
    _applyTheme() {
        this.dom.app.dataset.theme = this.state.theme;
        const icon = this.dom.themeToggle.querySelector('i');
        if (icon) {
            icon.className = this.state.theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
        }
    }

    /**
     * Reset view to defaults
     * @private
     */
    _resetView() {
        this.state.visibleColumns = new Set(this.state.headers);
        this.state.sortColumn = null;
        this.state.sortOrder = 'asc';
        this.state.columnFilters = {};
        this.state.searchValue = '';
        this.state.currentPage = 0;
        this.dom.search.value = '';

        if (this.categoryManager) {
            this.categoryManager.resetToDefaults(this.config);
            this.state.visibleColumns = this.categoryManager.getVisibleColumns();
            // Add unconfigured columns
            this.state.headers.forEach(h => {
                if (!this.columnConfigMap.has(h)) {
                    this.state.visibleColumns.add(h);
                }
            });
        }

        this._renderCategoryPanel();
        this._fetchTableData();
    }

    /**
     * Export current view to CSV
     * @private
     */
    _exportCsv() {
        const visibleHeaders = this.state.headers.filter(h => this.state.visibleColumns.has(h));

        // Header row
        let csv = visibleHeaders.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';

        // Data rows
        this.state.data.forEach(row => {
            const values = this.state.headers
                .filter(h => this.state.visibleColumns.has(h))
                .map((h, i) => {
                    const idx = this.state.headers.indexOf(h);
                    const val = row[idx];
                    if (val === null || val === undefined) return '';
                    return `"${String(val).replace(/"/g, '""')}"`;
                });
            csv += values.join(',') + '\n';
        });

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${this.state.tableName || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    }

    /**
     * Render error state
     * @private
     */
    _renderError() {
        this.container.innerHTML = `
            <div class="ts-app">
                <div class="ts-main">
                    <div class="ts-alert ts-alert-danger">
                        <i class="bi bi-exclamation-triangle"></i>
                        <span>Error: ${this._escapeHtml(this.state.error)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // =========================================================================
    // UTILITY METHODS
    // =========================================================================

    /**
     * Escape HTML
     * @private
     */
    _escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    /**
     * Debounce function
     * @private
     */
    _debounce(fn, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Set KBase authentication token
     * @param {string} token - KBase auth token
     */
    setToken(token) {
        this.token = token;
        if (this.client) {
            this.client.setToken(token);
        }
    }

    /**
     * Load a specific BERDLTable and table
     * @param {string} berdlTableId - BERDLTable object ID
     * @param {string} tableName - Table name
     */
    async loadTable(berdlTableId, tableName) {
        this.dom.berdlId.value = berdlTableId;
        await this._loadBerdlTable();
        this.dom.tableSelect.value = tableName;
        await this._fetchTableData();
    }

    /**
     * Get current data as array of objects
     * @returns {Array<Object>} Current displayed data
     */
    getData() {
        return this.state.data.map(row => {
            const obj = {};
            this.state.headers.forEach((h, i) => obj[h] = row[i]);
            return obj;
        });
    }

    /**
     * Destroy the renderer and clean up
     */
    destroy() {
        this.container.innerHTML = '';
        this.config = null;
        this.categoryManager = null;
        this.client = null;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TableRenderer;
}
