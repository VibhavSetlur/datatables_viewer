import { Component, type ComponentOptions } from '../Component';
import { StateManager } from '../../core/state/StateManager';
import { Transformers } from '../../utils/transformers';

export interface DataGridOptions extends ComponentOptions {
    stateManager: StateManager;
    onSort: (column: string, order: 'asc' | 'desc') => void;
    onFilter: (column: string, value: string) => void;
    onRowSelect: (index: number, selected: boolean, all?: boolean) => void;
    getColumnType?: (columnName: string) => string;
}

export class DataGrid extends Component {
    private stateManager: StateManager;
    private options: DataGridOptions;
    private tooltip: HTMLElement | null = null;

    // Focus State for Filter Inputs
    private focusedFilterCol: string | null = null;
    private selectionStart: number | null = null;
    private selectionEnd: number | null = null;
    private filterDebounceTimer: any = null;

    // Search Match Tracking
    private searchMatches: Array<{ element: HTMLElement; row: number; col: number }> = [];
    private currentMatchIndex: number = -1;

    constructor(options: DataGridOptions) {
        super(options);
        this.stateManager = options.stateManager;
        this.options = options;

        this.stateManager.subscribe(() => {
            this.render();
        });
    }

    protected render() {
        const state = this.stateManager.getState();
        // We render directly into container, or maybe container IS the grid wrapper
        // The container passed should be the element with id 'ts-grid' ideally

        if (state.columns.length === 0) {
            this.container.innerHTML = `
                <div class="ts-empty">
                    <div class="ts-empty-icon"><i class="bi bi-inbox-fill"></i></div>
                    <h3 class="ts-empty-title">No Data Loaded</h3>
                    <p class="text-muted">Select a data source from the sidebar to begin.</p>
                </div>`;
            return;
        }

        const cols = state.columns.filter(c => state.visibleColumns.has(c.column));
        if (cols.length === 0) {
            this.container.innerHTML = `
                <div class="ts-empty">
                    <div class="ts-empty-icon"><i class="bi bi-layout-three-columns"></i></div>
                    <h3 class="ts-empty-title">All Columns Hidden</h3>
                    <p class="text-muted">Enable columns in the sidebar to view data.</p>
                </div>`;
            return;
        }

        const searchTerm = state.searchValue ? state.searchValue.trim().toLowerCase() : '';
        let html = '<table class="ts-table"><thead><tr>';

        // Checkbox column for select all
        const allSelected = state.data.length > 0 && state.data.every((_, i) => this.selection.has(i));
        html += `<th class="ts-col-select ts-col-fixed"><input type="checkbox" id="ts-select-all" ${allSelected ? 'checked' : ''}></th>`;

        // Row number column
        if (state.showRowNumbers) html += '<th class="ts-col-num ts-col-fixed">#</th>';

        cols.forEach((c, idx) => {
            const isFirst = idx === 0 && !state.showRowNumbers;
            const fixed = isFirst ? 'ts-col-fixed' : '';
            const sortable = c.sortable ? 'sortable' : '';
            const icon = state.sortColumn === c.column ? (state.sortOrder === 'asc' ? ' <i class="bi bi-sort-up"></i>' : ' <i class="bi bi-sort-down"></i>') : '';
            // For auto width, add min-width to prevent columns from collapsing
            const widthStyle = c.width && c.width !== 'auto' 
                ? `width:${c.width}` 
                : 'min-width:80px';  // Ensure auto columns have minimum width
            html += `<th class="${fixed} ${sortable}" data-col="${c.column}" style="${widthStyle}">${c.displayName || c.column}${icon}</th>`;
        });

        // Filter row - directly aligned under headers
        html += '</tr><tr class="ts-filter-row">';

        // Empty cell for checkbox column in filter row
        html += '<th class="ts-col-select ts-col-fixed" style="width:48px"></th>';

        // Empty cell for row number column in filter row
        if (state.showRowNumbers) html += '<th class="ts-col-num ts-col-fixed" style="width:60px"></th>';

        cols.forEach((c, idx) => {
            const isFirst = idx === 0 && !state.showRowNumbers;
            const fixed = isFirst ? 'ts-col-fixed' : '';
            const val = state.columnFilters[c.column] || '';
            // For auto width, add min-width to prevent columns from collapsing
            const widthStyle = c.width && c.width !== 'auto' 
                ? `width:${c.width}` 
                : 'min-width:80px';  // Ensure auto columns have minimum width
            
            // Get column type for smart filtering
            const columnType = this.options.getColumnType ? this.options.getColumnType(c.column) : 'TEXT';
            const isNumeric = ['INTEGER', 'REAL', 'NUMERIC'].includes(columnType.toUpperCase());
            const placeholder = isNumeric ? 'e.g., <500, >=100, =50' : 'Filter...';
            const tooltip = isNumeric 
                ? 'Supports: <, <=, >, >=, =, !=, between, or just number' 
                : 'Text search, =value, !=value, in(list), between';
            
            html += `<th class="${fixed}" style="${widthStyle}">`;
            if (c.filterable !== false) {
                html += `<div class="ts-filter-wrap"><input class="ts-filter-input ${val ? 'has-value' : ''}" data-col="${c.column}" data-type="${columnType}" value="${Transformers.escapeHtml(val)}" placeholder="${placeholder}" title="${tooltip}"><button class="ts-filter-clear" data-col="${c.column}"><i class="bi bi-x"></i></button></div>`;
            } else {
                html += '<div style="height:28px"></div>'; // Spacer for alignment
            }
            html += '</th>';
        });

        html += '</tr></thead><tbody>';

        if (state.data.length === 0) {
            const span = cols.length + (state.showRowNumbers ? 1 : 0);
            html += `<tr><td colspan="${span}" style="text-align:center;padding:32px;color:var(--text-muted)"><i class="bi bi-search" style="font-size:20px;opacity:.3;display:block;margin-bottom:6px"></i>No matching records</td></tr>`;
        } else {
            const start = state.currentPage * state.pageSize + 1;
            // We need selectedRows set. App should manage selection state? 
            // Or StateManager? The previous Monolith had selectedRows Set.
            // Let's assume App passes it or StateManager has it. 
            // For now, I'll assume StateManager has been upgraded or we need to pass selection via options?
            // Ideally selection is part of ephemeral state.
            // Let's add 'selectedRows' to AppState? Or just assume empty for now and fix later.
            // The Refactoring plan didn't explicitly say "Add selectedRows to AppState".
            // I'll assume I need to handle it or App tracks it. 
            // Let's make it a property of DataGrid that App can read? Or better, use StateManager.
            // I'll add a 'selection' Set to this class for now and expose it.

            state.data.forEach((row: Record<string, any>, i: number) => {
                // row is already an object, matched to existing code structure
                const selected = this.isRowSelected(i);
                const rowNum = start + i;

                html += `<tr class="${selected ? 'selected' : ''}" data-idx="${i}">`;

                // Checkbox cell
                html += `<td class="ts-col-select ts-col-fixed"><input type="checkbox" class="ts-row-checkbox" data-idx="${i}" ${selected ? 'checked' : ''}></td>`;

                // Row number
                if (state.showRowNumbers) html += `<td class="ts-col-num ts-col-fixed">${rowNum}</td>`;

                cols.forEach((c, idx) => {
                    const isFirst = idx === 0 && !state.showRowNumbers;
                    const fixed = isFirst ? 'ts-col-fixed' : '';
                    const raw = row[c.column];
                    let content = '';
                    const rawStr = raw != null ? String(raw) : '';
                    
                    if (c.transform) {
                        content = Transformers.apply(raw, c.transform, row);
                    } else if (c.column.includes('ID') || c.column === 'ID') {
                        const esc = Transformers.escapeHtml(rawStr);
                        content = `<span class="ts-copy-id"><span class="ts-mono">${esc}</span><button class="ts-copy-btn" data-id="${esc}"><i class="bi bi-clipboard"></i></button></span>`;
                    } else {
                        content = Transformers.escapeHtml(rawStr);
                    }

                    // Apply search highlighting if there's a search term
                    if (searchTerm && searchTerm.trim()) {
                        const highlighted = this.highlightText(content, searchTerm);
                        content = highlighted.content;
                    }
                    html += `<td class="${fixed}" data-row="${i}" data-col="${c.column}">${content}</td>`;
                });
                html += '</tr>';
            });
        }

        html += '</tbody></table>';
        this.container.innerHTML = html;
        
        // Track search matches after rendering
        if (state.searchValue && state.searchValue.trim()) {
            this.trackSearchMatches(state.searchValue.trim());
        } else {
            // Clear matches if no search term
            this.searchMatches = [];
            this.currentMatchIndex = -1;
        }
        
        this.bindEvents(); // Re-bind after render
        this.restoreFocus();
    }

    private restoreFocus() {
        if (this.focusedFilterCol) {
            const input = this.container.querySelector(`input.ts-filter-input[data-col="${this.focusedFilterCol}"]`) as HTMLInputElement | null;
            if (input) {
                input.focus();
                if (this.selectionStart !== null && this.selectionEnd !== null) {
                    input.setSelectionRange(this.selectionStart, this.selectionEnd);
                }
            }
        }
    }

    private selection = new Set<number>();

    public getSelection(): Set<number> {
        return this.selection;
    }

    public clearSelection() {
        this.selection.clear();
        this.render();
    }

    public selectAll() {
        const state = this.stateManager.getState();
        state.data.forEach((_, i) => this.selection.add(i));
        this.render();
        this.options.onRowSelect(-1, true, true);
    }

    /** Clear filter focus state - useful when programmatically resetting filters */
    public clearFilterFocus() {
        this.focusedFilterCol = null;
        this.selectionStart = null;
        this.selectionEnd = null;
        if (this.filterDebounceTimer) {
            clearTimeout(this.filterDebounceTimer);
            this.filterDebounceTimer = null;
        }
    }

    // Internal helper for now, usually passed in or managed via state
    private isRowSelected(index: number): boolean {
        return this.selection.has(index);
    }

    protected bindEvents() {
        // Handle checkbox changes for row selection
        this.container.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;

            // Select All checkbox
            if (target.id === 'ts-select-all') {
                const state = this.stateManager.getState();
                if (target.checked) {
                    // Select all visible rows
                    state.data.forEach((_, i) => this.selection.add(i));
                } else {
                    // Deselect all
                    this.selection.clear();
                }
                this.render();
                this.options.onRowSelect(-1, target.checked, true); // -1 signals "all", true for batch
                return;
            }

            // Individual row checkbox
            if (target.classList.contains('ts-row-checkbox')) {
                const idx = parseInt(target.dataset.idx || '-1');
                if (idx >= 0) {
                    if (target.checked) {
                        this.selection.add(idx);
                    } else {
                        this.selection.delete(idx);
                    }
                    this.render();
                    this.options.onRowSelect(idx, target.checked);
                }
                return;
            }
        });

        this.container.onclick = (e) => {
            const target = e.target as HTMLElement;

            // Sort
            const th = target.closest('th.sortable');
            if (th) {
                const col = (th as HTMLElement).dataset.col;
                if (col) {
                    const state = this.stateManager.getState();
                    const order = state.sortColumn === col && state.sortOrder === 'asc' ? 'desc' : 'asc';
                    this.options.onSort(col, order);
                }
                return;
            }

            // Filter inputs are handled via 'input' event, but clear button is click
            const clearBtn = target.closest('.ts-filter-clear');
            if (clearBtn) {
                const col = (clearBtn as HTMLElement).dataset.col;
                if (col) this.options.onFilter(col, ''); // Clear
                return;
            }

            // Row selection by clicking anywhere on the row (except checkboxes, buttons, inputs, links)
            if (target.tagName !== 'BUTTON' && target.tagName !== 'INPUT' && !target.closest('a') && !target.closest('.ts-copy-btn')) {
                const tr = target.closest('tr');
                if (tr && tr.parentElement?.tagName === 'TBODY') {
                    const idx = parseInt(tr.dataset.idx || '-1');
                    if (idx >= 0) {
                        const isSelected = this.selection.has(idx);
                        if (isSelected) this.selection.delete(idx);
                        else this.selection.add(idx);

                        this.render();
                        this.options.onRowSelect(idx, !isSelected);
                    }
                }
            }

            // Copy ID
            const copyBtn = target.closest('.ts-copy-btn');
            if (copyBtn) {
                const text = (copyBtn as HTMLElement).dataset.id;
                if (text) {
                    navigator.clipboard.writeText(text);
                }
            }
        };

        // Filter inputs
        this.container.oninput = (e) => {
            const target = e.target as HTMLInputElement;
            if (target.classList.contains('ts-filter-input')) {
                const col = target.dataset.col;
                if (col) {
                    this.focusedFilterCol = col;
                    this.selectionStart = target.selectionStart;
                    this.selectionEnd = target.selectionEnd;

                    if (this.filterDebounceTimer) clearTimeout(this.filterDebounceTimer);

                    this.filterDebounceTimer = setTimeout(() => {
                        this.options.onFilter(col, target.value);
                    }, 300); // 300ms debounce
                }
            }
        };

        // Track cursor position even if not inputting (e.g. arrow keys)
        this.container.onkeyup = (e) => {
            const target = e.target as HTMLInputElement;
            if (target.classList.contains('ts-filter-input')) {
                this.selectionStart = target.selectionStart;
                this.selectionEnd = target.selectionEnd;
            }
        };

        this.container.addEventListener('focusin', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.classList.contains('ts-filter-input')) {
                this.focusedFilterCol = target.dataset.col || null;
            } else {
                this.focusedFilterCol = null;
            }
        });

        // Tooltips
        this.container.onmouseover = (e) => {
            const cell = (e.target as HTMLElement).closest('td');
            if (cell && cell.scrollWidth > cell.clientWidth) {
                const text = cell.textContent?.trim();
                if (text) this.showTooltip(e as MouseEvent, text);
            }
        };
        this.container.onmouseout = (e) => {
            const cell = (e.target as HTMLElement).closest('td');
            if (cell) this.hideTooltip();
        };

    }

    private showTooltip(e: MouseEvent, text: string) {
        if (!this.tooltip) {
            this.tooltip = document.createElement('div');
            this.tooltip.className = 'ts-tooltip';
            this.tooltip.id = 'ts-tooltip';
            document.body.appendChild(this.tooltip);
        }
        this.tooltip.textContent = text;
        this.tooltip.classList.add('show');
        this.tooltip.style.left = (e.clientX + 10) + 'px';
        this.tooltip.style.top = (e.clientY + 10) + 'px';
    }

    private hideTooltip() {
        if (this.tooltip) this.tooltip.classList.remove('show');
    }

    private highlightText(html: string, term: string): { content: string; hasMatches: boolean } {
        if (!term || !term.trim()) return { content: html, hasMatches: false };
        
        // Escape the search term for regex (but allow word boundaries for better matching)
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match the term as a substring (case-insensitive) - this allows "su" to match "succinate"
        const regex = new RegExp(`(${escapedTerm})`, 'gi');
        
        // Check if term exists in the HTML (checking text content)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const textContent = (tempDiv.textContent || tempDiv.innerText || '').toLowerCase();
        const hasMatches = textContent.includes(term.toLowerCase());
        
        if (!hasMatches) {
            return { content: html, hasMatches: false };
        }
        
        // Try simple replace first (works for plain text or escaped HTML)
        if (!html.includes('<') || html === Transformers.escapeHtml(textContent)) {
            regex.lastIndex = 0;
            return {
                content: html.replace(regex, '<mark class="highlight">$1</mark>'),
                hasMatches: true
            };
        }
        
        // For HTML content with tags, walk through text nodes and highlight
        const walker = document.createTreeWalker(
            tempDiv,
            NodeFilter.SHOW_TEXT,
            null
        );
        
        const replacements: Array<{ node: Text; replacement: string }> = [];
        let node: Text | null;
        
        while (node = walker.nextNode() as Text) {
            if (node.textContent) {
                regex.lastIndex = 0;
                if (regex.test(node.textContent)) {
                    regex.lastIndex = 0;
                    const replacement = node.textContent.replace(regex, '<mark class="highlight">$1</mark>');
                    replacements.push({ node, replacement });
                }
            }
        }
        
        // Apply replacements
        replacements.forEach(({ node, replacement }) => {
            const parent = node.parentElement;
            if (parent) {
                const tempSpan = document.createElement('span');
                tempSpan.innerHTML = replacement;
                while (tempSpan.firstChild) {
                    parent.insertBefore(tempSpan.firstChild, node);
                }
                parent.removeChild(node);
            }
        });
        
        return {
            content: tempDiv.innerHTML,
            hasMatches: replacements.length > 0
        };
    }

    /**
     * Track all search matches in the rendered table for navigation
     */
    private trackSearchMatches(searchTerm: string): void {
        this.searchMatches = [];
        if (!searchTerm || !searchTerm.trim()) {
            this.currentMatchIndex = -1;
            return;
        }

        // Find all highlight marks in the rendered table
        const marks = this.container.querySelectorAll('mark.highlight');
        
        marks.forEach((mark) => {
            const cell = mark.closest('td[data-row][data-col]');
            if (cell) {
                this.searchMatches.push({
                    element: mark as HTMLElement,
                    row: parseInt(cell.getAttribute('data-row') || '0'),
                    col: 0 // Column index not critical for scrolling
                });
            }
        });

        // Reset to first match if we have matches
        if (this.searchMatches.length > 0) {
            this.currentMatchIndex = 0;
            this.highlightCurrentMatch();
        } else {
            this.currentMatchIndex = -1;
        }
    }

    /**
     * Navigate to next search match
     */
    public navigateToNextMatch(): boolean {
        if (this.searchMatches.length === 0) return false;
        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMatches.length;
        this.highlightCurrentMatch();
        return true;
    }

    /**
     * Navigate to previous search match
     */
    public navigateToPreviousMatch(): boolean {
        if (this.searchMatches.length === 0) return false;
        this.currentMatchIndex = this.currentMatchIndex <= 0 
            ? this.searchMatches.length - 1 
            : this.currentMatchIndex - 1;
        this.highlightCurrentMatch();
        return true;
    }

    /**
     * Highlight the current match and scroll to it
     */
    private highlightCurrentMatch(): void {
        // Remove active class from all matches
        this.container.querySelectorAll('mark.highlight').forEach(m => {
            m.classList.remove('active');
        });

        if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.searchMatches.length) {
            const match = this.searchMatches[this.currentMatchIndex];
            match.element.classList.add('active');
            this.scrollToMatch(match.element);
        }
    }

    /**
     * Scroll to show the highlighted match
     */
    private scrollToMatch(element: HTMLElement): void {
        const cell = element.closest('td');
        if (!cell) return;

        const grid = this.container.closest('.ts-grid');
        if (!grid) return;

        // Get cell position relative to grid
        const cellRect = cell.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();

        // Check if cell is visible (with some padding)
        const padding = 50;
        const isVisible = (
            cellRect.top >= gridRect.top + padding &&
            cellRect.bottom <= gridRect.bottom - padding &&
            cellRect.left >= gridRect.left + padding &&
            cellRect.right <= gridRect.right - padding
        );

        if (!isVisible) {
            // Scroll to make cell visible - use the grid container for scrolling
            const scrollContainer = grid;
            const cellOffsetTop = (cell as HTMLElement).offsetTop;
            const cellOffsetLeft = (cell as HTMLElement).offsetLeft;
            const containerHeight = scrollContainer.clientHeight;
            const containerWidth = scrollContainer.clientWidth;
            
            // Calculate scroll position to center the cell
            const scrollTop = cellOffsetTop - (containerHeight / 2) + (cell.clientHeight / 2);
            const scrollLeft = cellOffsetLeft - (containerWidth / 2) + (cell.clientWidth / 2);
            
            scrollContainer.scrollTo({
                top: Math.max(0, scrollTop),
                left: Math.max(0, scrollLeft),
                behavior: 'smooth'
            });
        }
    }

    /**
     * Get current match info for display
     */
    public getSearchMatchInfo(): { current: number; total: number } {
        return {
            current: this.currentMatchIndex >= 0 ? this.currentMatchIndex + 1 : 0,
            total: this.searchMatches.length
        };
    }

    /**
     * Check if there are search matches
     */
    public hasSearchMatches(): boolean {
        return this.searchMatches.length > 0;
    }
}
