import { Component, type ComponentOptions } from '../Component';


export interface ToolbarOptions extends ComponentOptions {
    onSearch: (term: string) => void;
    onRefresh: () => void;
    onTestConnection?: () => void;
    onSearchNext?: () => void;
    onSearchPrev?: () => void;
    onShare?: () => void;
    getSearchMatchInfo?: () => { current: number; total: number };
    /** Hide standalone-only buttons (Test Connection, Refresh) in KBase mode */
    kbaseMode?: boolean;
}

export class Toolbar extends Component {
    private options: ToolbarOptions;
    private searchTimer: any;

    constructor(options: ToolbarOptions) {
        super(options);
        this.options = options;
    }

    protected render() {
        this.container.innerHTML = `
            <div class="ts-search-box">
                <div class="ts-search-input-wrap">
                    <input type="text" id="ts-search" class="ts-search" 
                        placeholder="Highlight matches (doesn't filter rows)..." 
                        aria-label="Highlight matches in table (does not filter rows)">
                    <button class="ts-search-clear" id="ts-search-clear" aria-label="Clear search">
                        <i class="bi bi-x-lg"></i>
                    </button>
                    <i class="bi bi-search ts-search-icon"></i>
                </div>
                <div class="ts-search-nav">
                    <button class="ts-search-nav-btn" id="ts-search-prev" title="Previous match (Shift+Enter)" aria-label="Previous match">
                        <i class="bi bi-chevron-up"></i>
                    </button>
                    <span class="ts-search-nav-info" id="ts-search-info">0/0</span>
                    <button class="ts-search-nav-btn" id="ts-search-next" title="Next match (Enter)" aria-label="Next match">
                        <i class="bi bi-chevron-down"></i>
                    </button>
                </div>
            </div>
            <div class="ts-spacer" style="flex:1"></div>
            <div class="ts-toolbar-actions">
                <button class="ts-tb-btn" id="ts-share" title="Copy shareable link">
                    <i class="bi bi-share"></i> Share
                </button>
                ${!this.options.kbaseMode ? `
                <button class="ts-tb-btn" id="ts-test-connection" title="Test API Connection" style="margin-left: 8px;">
                    <i class="bi bi-lightning-charge"></i> Test Connection
                </button>
                <button class="ts-tb-btn" id="ts-refresh" title="Refresh Data">
                    <i class="bi bi-arrow-clockwise"></i> Refresh
                </button>
                ` : ''}
                <button class="ts-tb-icon" id="ts-settings-btn" title="Settings">
                    <i class="bi bi-gear-fill"></i>
                </button>
            </div>
        `;
        this.cacheDom({
            search: '#ts-search',
            searchClear: '#ts-search-clear',
            searchPrev: '#ts-search-prev',
            searchNext: '#ts-search-next',
            searchInfo: '#ts-search-info',
            share: '#ts-share',
            testConn: '#ts-test-connection',
            refresh: '#ts-refresh',
            settings: '#ts-settings-btn'
        });
    }

    protected bindEvents() {
        this.dom.search?.addEventListener('input', () => {
            clearTimeout(this.searchTimer);
            const term = (this.dom.search as HTMLInputElement).value;
            // Update nav immediately for better UX
            this.updateSearchNav();
            this.searchTimer = setTimeout(() => {
                this.options.onSearch(term);
                // Update again after search completes
                setTimeout(() => this.updateSearchNav(), 350);
            }, 300);
        });

        // Handle Enter key for navigation
        this.dom.search?.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.options.onSearchNext?.();
                this.updateSearchNav();
            } else if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                this.options.onSearchPrev?.();
                this.updateSearchNav();
            }
        });

        this.dom.searchClear?.addEventListener('click', () => {
            (this.dom.search as HTMLInputElement).value = '';
            this.options.onSearch('');
            this.updateSearchNav();
            (this.dom.search as HTMLInputElement).focus();
        });

        this.dom.searchPrev?.addEventListener('click', () => {
            this.options.onSearchPrev?.();
            this.updateSearchNav();
        });

        this.dom.searchNext?.addEventListener('click', () => {
            this.options.onSearchNext?.();
            this.updateSearchNav();
        });


        this.dom.refresh?.addEventListener('click', () => this.options.onRefresh());

        this.dom.share?.addEventListener('click', () => {
            if (this.options.onShare) {
                this.options.onShare();
            }
        });

        this.dom.testConn?.addEventListener('click', () => {
            if (this.options.onTestConnection) {
                this.options.onTestConnection();
            }
        });

        // Initial update
        setTimeout(() => this.updateSearchNav(), 100);
    }

    /**
     * Update search navigation UI
     */
    public updateSearchNav(): void {
        const searchInput = this.dom.search as HTMLInputElement;
        const searchTerm = searchInput?.value?.trim() || '';
        const navContainer = this.container.querySelector('.ts-search-nav') as HTMLElement;

        if (!navContainer) return;

        // Show/hide navigation based on search term
        if (searchTerm) {
            navContainer.style.opacity = '1';
            navContainer.style.pointerEvents = 'auto';
        } else {
            navContainer.style.opacity = '0';
            navContainer.style.pointerEvents = 'none';
            return;
        }

        if (this.options.getSearchMatchInfo) {
            const info = this.options.getSearchMatchInfo();
            if (this.dom.searchInfo) {
                if (info.total > 0) {
                    (this.dom.searchInfo as HTMLElement).textContent = `${info.current}/${info.total}`;
                    (this.dom.searchPrev as HTMLButtonElement).disabled = false;
                    (this.dom.searchNext as HTMLButtonElement).disabled = false;
                } else {
                    (this.dom.searchInfo as HTMLElement).textContent = '0/0';
                    (this.dom.searchPrev as HTMLButtonElement).disabled = true;
                    (this.dom.searchNext as HTMLButtonElement).disabled = true;
                }
            }
        }
    }

    public getSettingsButton(): HTMLElement | null {
        return this.dom.settings as HTMLElement;
    }

    public setSearch(term: string) {
        if (this.dom.search) {
            (this.dom.search as HTMLInputElement).value = term;
        }
    }

    public focusSearch() {
        if (this.dom.search) {
            (this.dom.search as HTMLInputElement).focus();
            (this.dom.search as HTMLInputElement).select();
        }
    }
}
