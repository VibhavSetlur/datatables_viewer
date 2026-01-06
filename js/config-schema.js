/**
 * Configuration Schema Definitions
 * 
 * Type definitions for the table renderer configuration.
 * Uses JSDoc for IDE support without requiring TypeScript.
 * 
 * @fileoverview Configuration type definitions for KBase Table Renderer
 * @author KBase Team
 * @license MIT
 */

'use strict';

// =============================================================================
// TRANSFORMER CONFIGURATION TYPES
// =============================================================================

/**
 * Link transformer options - converts cell value to clickable link
 * @typedef {Object} LinkTransformOptions
 * @property {string} urlTemplate - URL with {value} placeholder (e.g., "https://uniprot.org/{value}")
 * @property {string} [labelTemplate] - Display text template (default: raw value)
 * @property {string} [icon] - Bootstrap Icons class (e.g., "bi-box-arrow-up-right")
 * @property {string} [target="_blank"] - Link target attribute
 */

/**
 * Merge transformer options - combines multiple column values
 * @typedef {Object} MergeTransformOptions
 * @property {string[]} columns - Column names to merge
 * @property {string} [template] - Custom template like "{col1} ({col2})"
 * @property {string} [separator=" | "] - Separator when no template provided
 */

/**
 * Ontology transformer options - resolves term IDs to names
 * @typedef {Object} OntologyTransformOptions
 * @property {"GO"|"KEGG"|"EC"|"custom"} ontologyType - Ontology database type
 * @property {string} [lookupEndpoint] - Custom API endpoint for resolution
 * @property {boolean} [showId=true] - Display ID alongside name
 * @property {number} [cacheTimeout=3600000] - Cache timeout in milliseconds
 */

/**
 * Badge transformer options - displays value as colored badge
 * @typedef {Object} BadgeTransformOptions
 * @property {Object<string, string>} [colorMap] - Value-to-color mapping
 * @property {string} [defaultColor="#6366f1"] - Fallback badge color
 */

/**
 * Custom transformer options - user-defined transformation
 * @typedef {Object} CustomTransformOptions
 * @property {string} functionName - Registered function name in Transformers
 * @property {Object} [params] - Additional parameters passed to function
 */

/**
 * Transformer configuration
 * @typedef {Object} TransformerConfig
 * @property {"link"|"merge"|"ontology"|"badge"|"custom"} type - Transformer type
 * @property {LinkTransformOptions|MergeTransformOptions|OntologyTransformOptions|BadgeTransformOptions|CustomTransformOptions} options
 */

// =============================================================================
// COLUMN CONFIGURATION
// =============================================================================

/**
 * Configuration for a single table column
 * @typedef {Object} ColumnConfig
 * @property {string} column - Column name in the data source
 * @property {string} [displayName] - UI display name (default: column name)
 * @property {string[]} [categories=[]] - Category IDs this column belongs to
 * @property {TransformerConfig} [transform] - Content transformation
 * @property {boolean} [hidden=false] - Initially hidden from view
 * @property {number} [width] - Column width in pixels
 * @property {boolean} [sortable=true] - Allow sorting by this column
 * @property {boolean} [filterable=true] - Allow filtering by this column
 * @property {string} [align="left"] - Text alignment ("left"|"center"|"right")
 */

// =============================================================================
// CATEGORY CONFIGURATION
// =============================================================================

/**
 * Configuration for a column category (grouping)
 * @typedef {Object} CategoryConfig
 * @property {string} id - Unique category identifier
 * @property {string} name - Display name in UI
 * @property {string} [icon] - Bootstrap Icons class
 * @property {string} [color] - Badge/icon color (hex or CSS color)
 * @property {boolean} [defaultVisible=true] - Initially visible
 * @property {string} [description] - Tooltip description
 */

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================

/**
 * Default table settings
 * @typedef {Object} DefaultSettings
 * @property {number} [pageSize=100] - Rows per page
 * @property {string} [sortColumn] - Default sort column
 * @property {"asc"|"desc"} [sortOrder="asc"] - Default sort direction
 * @property {"dark"|"light"} [theme="dark"] - Default theme
 * @property {boolean} [showFilters=false] - Show column filters initially
 */

// =============================================================================
// MAIN CONFIGURATION
// =============================================================================

/**
 * Complete table renderer configuration
 * @typedef {Object} TableRendererConfig
 * @property {string} name - Configuration name
 * @property {string} [description] - Description for users
 * @property {string} [version="1.0.0"] - Configuration version
 * @property {CategoryConfig[]} [categories=[]] - Category definitions
 * @property {ColumnConfig[]} columns - Column configurations
 * @property {DefaultSettings} [defaultSettings={}] - Default table settings
 */

// =============================================================================
// API RESPONSE TYPES (from TableScanner)
// =============================================================================

/**
 * Table data response from TableScanner API
 * @typedef {Object} TableDataResponse
 * @property {string[]} headers - Column names in order
 * @property {Array<Array<string|number|null>>} data - Row data as array of arrays
 * @property {number} row_count - Number of rows in this response
 * @property {number} total_count - Total rows in table (before filtering)
 * @property {number} filtered_count - Rows matching filter criteria
 * @property {string} table_name - Name of the queried table
 * @property {number} response_time_ms - Total response time in milliseconds
 * @property {number} [db_query_ms] - Database query time
 * @property {number} [conversion_ms] - Data conversion time
 * @property {string} [source] - Data source ("Cache" or "Downloaded")
 */

/**
 * Table info from list tables response
 * @typedef {Object} TableInfo
 * @property {string} name - Table name
 * @property {number} [row_count] - Number of rows
 * @property {number} [column_count] - Number of columns
 */

// =============================================================================
// CONFIG VALIDATION
// =============================================================================

/**
 * Validates a table renderer configuration
 * @param {Object} config - Configuration object to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
function validateConfig(config) {
    const errors = [];

    // Required fields
    if (!config.name || typeof config.name !== 'string') {
        errors.push('Configuration must have a "name" string property');
    }

    if (!Array.isArray(config.columns) || config.columns.length === 0) {
        errors.push('Configuration must have a non-empty "columns" array');
    }

    // Validate categories
    if (config.categories) {
        if (!Array.isArray(config.categories)) {
            errors.push('"categories" must be an array');
        } else {
            const categoryIds = new Set();
            config.categories.forEach((cat, i) => {
                if (!cat.id) errors.push(`Category at index ${i} missing "id"`);
                if (!cat.name) errors.push(`Category at index ${i} missing "name"`);
                if (categoryIds.has(cat.id)) {
                    errors.push(`Duplicate category id: "${cat.id}"`);
                }
                categoryIds.add(cat.id);
            });
        }
    }

    // Validate columns
    if (Array.isArray(config.columns)) {
        const columnNames = new Set();
        config.columns.forEach((col, i) => {
            if (!col.column) {
                errors.push(`Column at index ${i} missing "column" property`);
            }
            if (columnNames.has(col.column)) {
                errors.push(`Duplicate column: "${col.column}"`);
            }
            columnNames.add(col.column);

            // Validate transformer
            if (col.transform) {
                const validTypes = ['link', 'merge', 'ontology', 'badge', 'custom'];
                if (!validTypes.includes(col.transform.type)) {
                    errors.push(`Column "${col.column}" has invalid transform type: "${col.transform.type}"`);
                }
            }

            // Validate category references
            if (col.categories && config.categories) {
                const validCategoryIds = new Set(config.categories.map(c => c.id));
                col.categories.forEach(catId => {
                    if (!validCategoryIds.has(catId)) {
                        errors.push(`Column "${col.column}" references unknown category: "${catId}"`);
                    }
                });
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Merges user config with defaults
 * @param {Partial<TableRendererConfig>} userConfig - User configuration
 * @returns {TableRendererConfig} Complete configuration with defaults
 */
function mergeWithDefaults(userConfig) {
    const defaults = {
        name: 'Untitled Configuration',
        description: '',
        version: '1.0.0',
        categories: [],
        columns: [],
        defaultSettings: {
            pageSize: 100,
            sortOrder: 'asc',
            theme: 'dark',
            showFilters: false
        }
    };

    return {
        ...defaults,
        ...userConfig,
        defaultSettings: {
            ...defaults.defaultSettings,
            ...(userConfig.defaultSettings || {})
        }
    };
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { validateConfig, mergeWithDefaults };
}
