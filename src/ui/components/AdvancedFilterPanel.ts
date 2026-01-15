/**
 * Advanced Filter Panel Component
 * 
 * Provides UI for building advanced filters with multiple operators
 */

import { Component, type ComponentOptions } from '../Component';

export interface AdvancedFilterPanelOptions extends ComponentOptions {
    columns: Array<{ column: string; displayName: string; type?: string }>;
    onApply: (filters: AdvancedFilter[]) => void;
    onCancel: () => void;
}

export interface AdvancedFilter {
    column: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'not_in' | 'between' | 'is_null' | 'is_not_null' | 'regex';
    value: any;
    value2?: any;
    logic?: 'AND' | 'OR';
}

export class AdvancedFilterPanel extends Component {
    private options: AdvancedFilterPanelOptions;
    private filters: AdvancedFilter[] = [];

    constructor(options: AdvancedFilterPanelOptions) {
        super(options);
        this.options = options;
    }

    protected render() {
        this.container.innerHTML = `
            <div class="ts-advanced-filter-panel">
                <div class="ts-advanced-filter-header">
                    <h3>Advanced Filters</h3>
                    <button class="ts-close-btn" id="ts-filter-close">
                        <i class="bi bi-x"></i>
                    </button>
                </div>
                <div class="ts-advanced-filter-body">
                    <div id="ts-filter-list"></div>
                    <button class="ts-btn-secondary" id="ts-add-filter">
                        <i class="bi bi-plus"></i> Add Filter
                    </button>
                </div>
                <div class="ts-advanced-filter-footer">
                    <button class="ts-btn-secondary" id="ts-filter-cancel">Cancel</button>
                    <button class="ts-btn-primary" id="ts-filter-apply">Apply Filters</button>
                </div>
            </div>
        `;
        this.renderFilterList();
        this.cacheDom({
            filterList: '#ts-filter-list',
            addFilter: '#ts-add-filter',
            apply: '#ts-filter-apply',
            cancel: '#ts-filter-cancel',
            close: '#ts-filter-close'
        });
    }

    protected bindEvents() {
        this.dom.addFilter?.addEventListener('click', () => {
            this.addFilter();
        });

        this.dom.apply?.addEventListener('click', () => {
            this.options.onApply(this.filters);
        });

        this.dom.cancel?.addEventListener('click', () => {
            this.options.onCancel();
        });

        this.dom.close?.addEventListener('click', () => {
            this.options.onCancel();
        });
    }

    private renderFilterList() {
        if (!this.dom.filterList) return;

        if (this.filters.length === 0) {
            this.dom.filterList.innerHTML = `
                <div class="ts-filter-empty">
                    <i class="bi bi-funnel"></i>
                    <p>No filters added. Click "Add Filter" to create one.</p>
                </div>
            `;
            return;
        }

        this.dom.filterList.innerHTML = this.filters.map((filter, index) => {
            const column = this.options.columns.find(c => c.column === filter.column);
            const operators = this.getOperatorsForType(column?.type);
            
            return `
                <div class="ts-filter-item" data-index="${index}">
                    <div class="ts-filter-row">
                        <select class="ts-filter-column" data-index="${index}">
                            ${this.options.columns.map(col => 
                                `<option value="${col.column}" ${filter.column === col.column ? 'selected' : ''}>${col.displayName || col.column}</option>`
                            ).join('')}
                        </select>
                        <select class="ts-filter-operator" data-index="${index}">
                            ${operators.map(op => 
                                `<option value="${op.value}" ${filter.operator === op.value ? 'selected' : ''}>${op.label}</option>`
                            ).join('')}
                        </select>
                        ${this.needsValue(filter.operator) ? `
                            <input type="text" class="ts-filter-value" data-index="${index}" 
                                placeholder="Value" value="${this.escapeHtml(String(filter.value || ''))}">
                        ` : ''}
                        ${filter.operator === 'between' ? `
                            <input type="text" class="ts-filter-value2" data-index="${index}" 
                                placeholder="To" value="${this.escapeHtml(String(filter.value2 || ''))}">
                        ` : ''}
                        ${filter.operator === 'in' || filter.operator === 'not_in' ? `
                            <input type="text" class="ts-filter-value" data-index="${index}" 
                                placeholder="Comma-separated values" value="${Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value || '')}">
                        ` : ''}
                        <button class="ts-filter-remove" data-index="${index}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Bind events
        this.dom.filterList.querySelectorAll('.ts-filter-column').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = parseInt((e.target as HTMLElement).dataset.index || '0');
                this.updateFilterColumn(index, (e.target as HTMLSelectElement).value);
            });
        });

        this.dom.filterList.querySelectorAll('.ts-filter-operator').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = parseInt((e.target as HTMLElement).dataset.index || '0');
                this.updateFilterOperator(index, (e.target as HTMLSelectElement).value);
            });
        });

        this.dom.filterList.querySelectorAll('.ts-filter-value').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt((e.target as HTMLElement).dataset.index || '0');
                this.updateFilterValue(index, (e.target as HTMLInputElement).value);
            });
        });

        this.dom.filterList.querySelectorAll('.ts-filter-value2').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt((e.target as HTMLElement).dataset.index || '0');
                this.updateFilterValue2(index, (e.target as HTMLInputElement).value);
            });
        });

        this.dom.filterList.querySelectorAll('.ts-filter-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt((e.target as HTMLElement).closest('[data-index]')?.getAttribute('data-index') || '0');
                this.removeFilter(index);
            });
        });
    }

    private addFilter() {
        this.filters.push({
            column: this.options.columns[0]?.column || '',
            operator: 'eq',
            value: ''
        });
        this.renderFilterList();
    }

    private removeFilter(index: number) {
        this.filters.splice(index, 1);
        this.renderFilterList();
    }

    private updateFilterColumn(index: number, column: string) {
        if (this.filters[index]) {
            this.filters[index].column = column;
        }
    }

    private updateFilterOperator(index: number, operator: string) {
        if (this.filters[index]) {
            this.filters[index].operator = operator as AdvancedFilter['operator'];
            if (!this.needsValue(operator as AdvancedFilter['operator'])) {
                delete this.filters[index].value;
                delete this.filters[index].value2;
            }
            this.renderFilterList();
        }
    }

    private updateFilterValue(index: number, value: string) {
        if (this.filters[index]) {
            const operator = this.filters[index].operator;
            if (operator === 'in' || operator === 'not_in') {
                this.filters[index].value = value.split(',').map(v => v.trim()).filter(v => v);
            } else {
                this.filters[index].value = value;
            }
        }
    }

    private updateFilterValue2(index: number, value: string) {
        if (this.filters[index]) {
            this.filters[index].value2 = value;
        }
    }

    private needsValue(operator: string): boolean {
        return !['is_null', 'is_not_null'].includes(operator);
    }

    private getOperatorsForType(type?: string): Array<{ value: string; label: string }> {
        const allOperators = [
            { value: 'eq', label: 'Equals (=)' },
            { value: 'ne', label: 'Not equals (!=)' },
            { value: 'gt', label: 'Greater than (>)' },
            { value: 'gte', label: 'Greater or equal (>=)' },
            { value: 'lt', label: 'Less than (<)' },
            { value: 'lte', label: 'Less or equal (<=)' },
            { value: 'like', label: 'Contains (LIKE)' },
            { value: 'ilike', label: 'Contains (case-insensitive)' },
            { value: 'in', label: 'In list' },
            { value: 'not_in', label: 'Not in list' },
            { value: 'between', label: 'Between' },
            { value: 'is_null', label: 'Is null' },
            { value: 'is_not_null', label: 'Is not null' },
            { value: 'regex', label: 'Regex (LIKE fallback)' }
        ];

        // For numeric types, prioritize comparison operators
        if (type && ['INTEGER', 'REAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].includes(type.toUpperCase())) {
            return allOperators.filter(op => 
                ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null', 'in', 'not_in'].includes(op.value)
            );
        }

        return allOperators;
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    public setFilters(filters: AdvancedFilter[]) {
        this.filters = [...filters];
        this.renderFilterList();
    }

    public getFilters(): AdvancedFilter[] {
        return [...this.filters];
    }
}
