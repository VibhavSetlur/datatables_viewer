/**
 * Category Manager
 * 
 * Manages column visibility based on category groupings.
 * Stateless implementation - relies on external state for visibility source of truth.
 */

import type { TableConfig, CategoryConfig } from '../config/ConfigManager';

interface CategoryState extends CategoryConfig {
    visible: boolean; // Computed visibility based on current columns
}

export class CategoryManager {
    private categories: Map<string, CategoryConfig>;
    private columnsByCategory: Map<string, Set<string>>;
    private initialVisibleCategories: Set<string>;
    private uncategorizedColumns: Set<string>;

    constructor(config: TableConfig) {
        this.categories = new Map();
        this.columnsByCategory = new Map();
        this.initialVisibleCategories = new Set();
        this.uncategorizedColumns = new Set();

        this.initialize(config);
    }

    private initialize(config: TableConfig): void {
        const categories = config.categories || [];
        // Initial setup from config
        categories.forEach(cat => {
            this.categories.set(cat.id, cat);
            this.columnsByCategory.set(cat.id, new Set());
            if (cat.defaultVisible !== false) {
                this.initialVisibleCategories.add(cat.id);
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

    /**
     * Returns the set of columns that should be visible by default
     * based on category configuration. Used for initial state only.
     */
    public getInitialVisibleColumns(): Set<string> {
        const visibleCols = new Set<string>();

        // 1. Add categories
        this.initialVisibleCategories.forEach(catId => {
            const cols = this.columnsByCategory.get(catId);
            if (cols) {
                cols.forEach(c => visibleCols.add(c));
            }
        });

        // 2. Add uncategorized (Always visible defaults)
        this.uncategorizedColumns.forEach(c => visibleCols.add(c));

        return visibleCols;
    }

    public getColumnsForCategory(catId: string): Set<string> {
        return this.columnsByCategory.get(catId) || new Set();
    }

    /**
     * Calculates the new visibility state when a category is toggled.
     * If all columns in category are visible -> Hide all
     * If any column is hidden -> Show all
     */
    public calculateVisibilityChange(catId: string, currentVisibleColumns: Set<string>): Set<string> {
        const catCols = this.columnsByCategory.get(catId);
        if (!catCols || catCols.size === 0) return new Set(currentVisibleColumns);

        const newVisible = new Set(currentVisibleColumns);
        const colArray = Array.from(catCols);

        // Check if all columns in this category are currently visible
        const allVisible = colArray.every(col => currentVisibleColumns.has(col));

        if (allVisible) {
            // Hide all
            colArray.forEach(col => newVisible.delete(col));
        } else {
            // Show all
            colArray.forEach(col => newVisible.add(col));
        }

        return newVisible;
    }

    /**
     * Returns category metadata with computed visibility status based on provided column state.
     */
    public getAllCategories(currentVisibleColumns: Set<string>): (CategoryState & { columnCount: number })[] {
        return Array.from(this.categories.values()).map(cat => {
            const catCols = this.columnsByCategory.get(cat.id);
            const colCount = catCols?.size || 0;

            // A category is considered "visible" (checked) if ALL its columns are visible
            // Partial visibility could be supported (indeterminate state), but for now:
            // All visible = checked
            // Any hidden = unchecked (allows "Show All" behavior on click)
            const isVisible = colCount > 0 &&
                Array.from(catCols || []).every(c => currentVisibleColumns.has(c));

            return {
                ...cat,
                visible: isVisible,
                columnCount: colCount
            };
        });
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
}
