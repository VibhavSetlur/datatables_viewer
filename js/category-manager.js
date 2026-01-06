/**
 * Category Manager
 * 
 * Manages column visibility based on category groupings.
 * Enables bulk show/hide of related columns.
 * 
 * @fileoverview Category-based column visibility management
 * @author KBase Team
 * @license MIT
 */

'use strict';

/**
 * CategoryManager - Manages column visibility by category
 */
class CategoryManager {
    /**
     * Create a CategoryManager instance
     * 
     * @param {Object} config - Table renderer configuration
     * @param {Array<{id: string, name: string, defaultVisible?: boolean}>} config.categories
     * @param {Array<{column: string, categories?: string[]}>} config.columns
     */
    constructor(config) {
        /** @type {Map<string, Object>} Category definitions by ID */
        this.categories = new Map();

        /** @type {Map<string, Set<string>>} Columns belonging to each category */
        this.columnsByCategory = new Map();

        /** @type {Map<string, Set<string>>} Categories for each column */
        this.categoriesByColumn = new Map();

        /** @type {Set<string>} Currently visible category IDs */
        this.visibleCategories = new Set();

        /** @type {Set<string>} All column names */
        this.allColumns = new Set();

        /** @type {Set<string>} Columns not assigned to any category */
        this.uncategorizedColumns = new Set();

        this._initialize(config);
    }

    /**
     * Initialize category mappings from configuration
     * @private
     */
    _initialize(config) {
        const categories = config.categories || [];
        const columns = config.columns || [];

        // Build category lookup
        categories.forEach(cat => {
            this.categories.set(cat.id, {
                id: cat.id,
                name: cat.name,
                icon: cat.icon || null,
                color: cat.color || null,
                description: cat.description || null
            });
            this.columnsByCategory.set(cat.id, new Set());

            // Set initial visibility
            if (cat.defaultVisible !== false) {
                this.visibleCategories.add(cat.id);
            }
        });

        // Build column-to-category mappings
        columns.forEach(col => {
            const columnName = col.column;
            this.allColumns.add(columnName);
            this.categoriesByColumn.set(columnName, new Set());

            if (col.categories && col.categories.length > 0) {
                col.categories.forEach(catId => {
                    if (this.categories.has(catId)) {
                        this.columnsByCategory.get(catId).add(columnName);
                        this.categoriesByColumn.get(columnName).add(catId);
                    } else {
                        console.warn(`Column "${columnName}" references unknown category: "${catId}"`);
                    }
                });
            } else {
                // Track uncategorized columns
                this.uncategorizedColumns.add(columnName);
            }
        });
    }

    // =========================================================================
    // CATEGORY OPERATIONS
    // =========================================================================

    /**
     * Toggle a category's visibility
     * 
     * @param {string} categoryId - Category ID to toggle
     * @returns {Set<string>} Updated set of visible columns
     */
    toggleCategory(categoryId) {
        if (!this.categories.has(categoryId)) {
            console.warn(`Unknown category: "${categoryId}"`);
            return this.getVisibleColumns();
        }

        if (this.visibleCategories.has(categoryId)) {
            this.visibleCategories.delete(categoryId);
        } else {
            this.visibleCategories.add(categoryId);
        }

        return this.getVisibleColumns();
    }

    /**
     * Show a specific category
     * 
     * @param {string} categoryId - Category ID to show
     * @returns {Set<string>} Updated set of visible columns
     */
    showCategory(categoryId) {
        if (this.categories.has(categoryId)) {
            this.visibleCategories.add(categoryId);
        }
        return this.getVisibleColumns();
    }

    /**
     * Hide a specific category
     * 
     * @param {string} categoryId - Category ID to hide
     * @returns {Set<string>} Updated set of visible columns
     */
    hideCategory(categoryId) {
        this.visibleCategories.delete(categoryId);
        return this.getVisibleColumns();
    }

    /**
     * Show all categories
     * 
     * @returns {Set<string>} Updated set of visible columns
     */
    showAllCategories() {
        this.categories.forEach((_, catId) => {
            this.visibleCategories.add(catId);
        });
        return this.getVisibleColumns();
    }

    /**
     * Hide all categories
     * 
     * @returns {Set<string>} Updated set of visible columns
     */
    hideAllCategories() {
        this.visibleCategories.clear();
        return this.getVisibleColumns();
    }

    /**
     * Check if a category is currently visible
     * 
     * @param {string} categoryId - Category ID to check
     * @returns {boolean} Whether category is visible
     */
    isCategoryVisible(categoryId) {
        return this.visibleCategories.has(categoryId);
    }

    // =========================================================================
    // COLUMN VISIBILITY
    // =========================================================================

    /**
     * Get all currently visible columns
     * 
     * A column is visible if:
     * - It has no categories (uncategorized) - always visible
     * - At least one of its categories is visible
     * 
     * @returns {Set<string>} Set of visible column names
     */
    getVisibleColumns() {
        const visible = new Set();

        // Uncategorized columns are always visible
        this.uncategorizedColumns.forEach(col => visible.add(col));

        // Add columns from visible categories
        this.visibleCategories.forEach(catId => {
            const columns = this.columnsByCategory.get(catId);
            if (columns) {
                columns.forEach(col => visible.add(col));
            }
        });

        return visible;
    }

    /**
     * Check if a specific column is visible
     * 
     * @param {string} columnName - Column name to check
     * @returns {boolean} Whether column is visible
     */
    isColumnVisible(columnName) {
        // Uncategorized columns are always visible
        if (this.uncategorizedColumns.has(columnName)) {
            return true;
        }

        // Check if any of the column's categories are visible
        const columnCategories = this.categoriesByColumn.get(columnName);
        if (!columnCategories || columnCategories.size === 0) {
            return true; // No categories = visible
        }

        for (const catId of columnCategories) {
            if (this.visibleCategories.has(catId)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get categories for a specific column
     * 
     * @param {string} columnName - Column name
     * @returns {Array<Object>} Array of category objects
     */
    getColumnCategories(columnName) {
        const catIds = this.categoriesByColumn.get(columnName);
        if (!catIds) return [];

        return Array.from(catIds)
            .map(id => this.categories.get(id))
            .filter(Boolean);
    }

    // =========================================================================
    // CATEGORY INFO
    // =========================================================================

    /**
     * Get all category definitions
     * 
     * @returns {Array<Object>} Array of category objects with visibility state
     */
    getAllCategories() {
        return Array.from(this.categories.values()).map(cat => ({
            ...cat,
            visible: this.visibleCategories.has(cat.id),
            columnCount: this.columnsByCategory.get(cat.id)?.size || 0
        }));
    }

    /**
     * Get a specific category by ID
     * 
     * @param {string} categoryId - Category ID
     * @returns {Object|null} Category object or null
     */
    getCategory(categoryId) {
        const cat = this.categories.get(categoryId);
        if (!cat) return null;

        return {
            ...cat,
            visible: this.visibleCategories.has(categoryId),
            columnCount: this.columnsByCategory.get(categoryId)?.size || 0
        };
    }

    /**
     * Get columns for a specific category
     * 
     * @param {string} categoryId - Category ID
     * @returns {Array<string>} Array of column names
     */
    getCategoryColumns(categoryId) {
        const columns = this.columnsByCategory.get(categoryId);
        return columns ? Array.from(columns) : [];
    }

    // =========================================================================
    // STATE MANAGEMENT
    // =========================================================================

    /**
     * Get current visibility state (for persistence)
     * 
     * @returns {Object} State object
     */
    getState() {
        return {
            visibleCategories: Array.from(this.visibleCategories)
        };
    }

    /**
     * Restore visibility state
     * 
     * @param {Object} state - Previously saved state
     */
    setState(state) {
        if (state && Array.isArray(state.visibleCategories)) {
            this.visibleCategories.clear();
            state.visibleCategories.forEach(catId => {
                if (this.categories.has(catId)) {
                    this.visibleCategories.add(catId);
                }
            });
        }
    }

    /**
     * Reset to default visibility from configuration
     * 
     * @param {Object} config - Original configuration
     */
    resetToDefaults(config) {
        this.visibleCategories.clear();
        (config.categories || []).forEach(cat => {
            if (cat.defaultVisible !== false) {
                this.visibleCategories.add(cat.id);
            }
        });
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CategoryManager;
}
