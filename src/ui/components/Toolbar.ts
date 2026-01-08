import { Component, type ComponentOptions } from '../Component';

export interface ToolbarOptions extends ComponentOptions {
    onSearch: (term: string) => void;
    onRefresh: () => void;
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
                <input type="text" id="ts-search" class="ts-search" 
                    placeholder="Search data..." 
                    aria-label="Search all table columns">
                <button class="ts-search-clear" id="ts-search-clear" aria-label="Clear search">
                    <i class="bi bi-x-lg"></i>
                </button>
                <i class="bi bi-search ts-search-icon"></i>
            </div>
            <div class="ts-spacer" style="flex:1"></div>
            <div class="ts-toolbar-actions">
                <button class="ts-tb-btn" id="ts-refresh" title="Refresh Data">
                    <i class="bi bi-arrow-clockwise"></i> Refresh
                </button>
                <button class="ts-tb-icon" id="ts-settings-btn" title="Settings">
                    <i class="bi bi-gear-fill"></i>
                </button>
            </div>
        `;
        this.cacheDom({
            search: '#ts-search',
            searchClear: '#ts-search-clear',
            refresh: '#ts-refresh',
            settings: '#ts-settings-btn'
        });
    }

    protected bindEvents() {
        this.dom.search?.addEventListener('input', () => {
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => {
                const term = (this.dom.search as HTMLInputElement).value;
                this.options.onSearch(term);
            }, 300);
        });

        this.dom.searchClear?.addEventListener('click', () => {
            (this.dom.search as HTMLInputElement).value = '';
            this.options.onSearch('');
            (this.dom.search as HTMLInputElement).focus();
        });

        this.dom.refresh?.addEventListener('click', () => this.options.onRefresh());

        // Settings event is handled by parent listening to this button ID or we expose a callback
        // For now, let's keep it simple and just let TableRenderer attach to the ID via bubbling or direct selection
        // But since Toolbar is a component, it should ideally expose an event. 
        // We'll update the interface in the next step or just let TableRenderer grab it.
        // Actually, let's update interface now.
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
