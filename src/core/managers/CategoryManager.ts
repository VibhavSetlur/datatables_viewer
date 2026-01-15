/**
 * Category Manager
 * 
 * Manages column visibility based on category groupings.
 */

import type { TableConfig, CategoryConfig } from '../../utils/config-manager';

interface CategoryState extends CategoryConfig {
    visible: boolean;
}

export class CategoryManager {
    private categories: Map<string, CategoryState>;
    private columnsByCategory: Map<string, Set<string>>;
    private visibleCategories: Set<string>;
    private uncategorizedColumns: Set<string>;

    constructor(config: TableConfig) {
        this.categories = new Map();
        this.columnsByCategory = new Map();
        this.visibleCategories = new Set();
        this.uncategorizedColumns = new Set();

        this.initialize(config);
    }

    private initialize(config: TableConfig): void {
        const categories = config.categories || [];
        // Initial setup from config
        categories.forEach(cat => {
            this.categories.set(cat.id, {
                ...cat,
                visible: cat.defaultVisible !== false
            });
            this.columnsByCategory.set(cat.id, new Set());
            if (cat.defaultVisible !== false) {
                this.visibleCategories.add(cat.id);
            }
        });

        // Columns will be registered via setColumns after data load or initial config
        if (config.columns) {
            this.setColumns(config.columns);
        }
    }

    public setColumns(columns: any[]) {
        // Reset column mappings
        this.uncategorizedColumns.clear();
        this.categories.forEach((_, key) => this.columnsByCategory.get(key)?.clear());

        columns.forEach(col => {
            const columnName = col.column;
            let isCategorized = false;

            if (col.categories && Array.isArray(col.categories) && col.categories.length > 0) {
                col.categories.forEach((catId: string) => {
                    if (this.categories.has(catId)) {
                        this.columnsByCategory.get(catId)?.add(columnName);
                        isCategorized = true;
                    }
                });
            }

            if (!isCategorized) {
                this.uncategorizedColumns.add(columnName);
            }
        });
    }

    public getVisibleColumns(): Set<string> {
        const visibleCols = new Set<string>();

        // 1. Add categories
        this.visibleCategories.forEach(catId => {
            const cols = this.columnsByCategory.get(catId);
            if (cols) {
                cols.forEach(c => visibleCols.add(c));
            }
        });

        // 2. Add uncategorized (Always visible)
        this.uncategorizedColumns.forEach(c => visibleCols.add(c));

        return visibleCols;
    }

    public getAllCategories(): (CategoryState & { columnCount: number })[] {
        return Array.from(this.categories.values()).map(cat => ({
            ...cat,
            visible: this.visibleCategories.has(cat.id),
            columnCount: this.columnsByCategory.get(cat.id)?.size || 0
        }));
    }

    public getColumnsByCategory(): Map<string, string[]> {
        const result = new Map<string, string[]>();
        this.columnsByCategory.forEach((cols, catId) => {
            result.set(catId, Array.from(cols));
        });
        return result;
    }

    public getUncategorizedColumns(): string[] {
        return Array.from(this.uncategorizedColumns);
    }

    public toggleCategory(catId: string): void {
        const isVisible = this.visibleCategories.has(catId);
        if (isVisible) {
            this.visibleCategories.delete(catId);
        } else {
            this.visibleCategories.add(catId);
        }
    }

    public showAllCategories(): void {
        this.categories.forEach((_, catId) => {
            this.visibleCategories.add(catId);
        });
    }
}
