/**
 * Configuration Schema Types
 * 
 * Production-grade TypeScript interfaces for the extensible configuration system.
 * These types define the contract for data type configurations, table schemas,
 * and column rendering specifications.
 * 
 * @version 3.0.0
 */

// =============================================================================
// DATA TYPES
// =============================================================================

/**
 * Supported column data types that inform default rendering behavior.
 * The renderer will apply sensible defaults based on the declared type.
 */
export type ColumnDataType =
    | 'string'      // Plain text
    | 'number'      // Generic number
    | 'integer'     // Whole number
    | 'float'       // Decimal number
    | 'boolean'     // True/false
    | 'date'        // Date only (YYYY-MM-DD)
    | 'datetime'    // Date + time
    | 'timestamp'   // Unix timestamp
    | 'json'        // JSON object/array
    | 'array'       // Array of values
    | 'sequence'    // DNA/RNA/Protein sequence
    | 'id'          // Identifier (monospace, copy button)
    | 'url'         // URL (auto-link)
    | 'email'       // Email (auto-mailto)
    | 'ontology'    // Ontology term (GO:xxxxx, KEGG:xxxxx)
    | 'percentage'  // 0-1 value displayed as percentage
    | 'filesize'    // Bytes → human readable
    | 'duration'    // Seconds → human readable
    | 'currency'    // Currency value
    | 'color'       // Color hex/rgb
    | 'image'       // Image URL
    | 'custom';     // Custom handling

/**
 * Text alignment options for columns
 */
export type TextAlign = 'left' | 'center' | 'right';

/**
 * Filter types for different column data types
 */
export type FilterType =
    | 'text'        // Text contains
    | 'exact'       // Exact match
    | 'range'       // Min/max for numbers
    | 'select'      // Dropdown of unique values
    | 'multiselect' // Multiple selection
    | 'date'        // Date picker
    | 'boolean';    // True/false toggle

// =============================================================================
// TRANSFORM CONFIGURATION
// =============================================================================

/**
 * Condition for applying a transform
 */
export interface TransformCondition {
    /** Column to check */
    column?: string;
    /** Operator for comparison */
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'isEmpty' | 'isNotEmpty';
    /** Value to compare against */
    value?: any;
}

/**
 * Transform configuration for rendering cell content
 */
export interface TransformConfig {
    /** Transformer type name */
    type: string;
    /** Transformer-specific options */
    options?: Record<string, any>;
    /** Condition for applying this transform */
    condition?: TransformCondition;
    /** Fallback if condition fails */
    fallback?: TransformConfig | string;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validation rule for column values
 */
export interface ValidationRule {
    type: 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
    value?: any;
    message?: string;
}

// =============================================================================
// COLUMN SCHEMA
// =============================================================================

/**
 * Complete column definition with all configuration options
 */
export interface ColumnSchema {
    /** API column name (must match data field) */
    column: string;

    /** Display name in UI (defaults to column name) */
    displayName?: string;

    /** Tooltip/description text */
    description?: string;

    /** Data type for default rendering behavior */
    dataType?: ColumnDataType;

    // ─── Visibility & Layout ─────────────────────────────────────────────

    /** Whether column is visible by default */
    visible?: boolean;

    /** Fixed width (e.g., "120px", "10rem") */
    width?: string;

    /** Minimum width */
    minWidth?: string;

    /** Maximum width */
    maxWidth?: string;

    /** Text alignment */
    align?: TextAlign;

    /** Pin column (left sticky, right sticky) */
    pin?: 'left' | 'right' | false;

    // ─── Behavior ─────────────────────────────────────────────────────────

    /** Enable sorting */
    sortable?: boolean;

    /** Enable filtering */
    filterable?: boolean;

    /** Filter type override (inferred from dataType by default) */
    filterType?: FilterType;

    /** Include in global search */
    searchable?: boolean;

    /** Show copy button on hover */
    copyable?: boolean;

    /** Enable cell editing (future) */
    editable?: boolean;

    /** Allow resizing */
    resizable?: boolean;

    // ─── Categorization ───────────────────────────────────────────────────

    /** Category IDs this column belongs to */
    categories?: string[];

    /** Priority for display order (lower = higher priority) */
    priority?: number;

    // ─── Rendering ────────────────────────────────────────────────────────

    /** Transform configuration (single or chained) */
    transform?: TransformConfig | TransformConfig[];

    /** CSS class to add to cell */
    cssClass?: string;

    /** Inline styles */
    style?: Record<string, string>;

    // ─── Validation ───────────────────────────────────────────────────────

    /** Validation rules */
    validation?: ValidationRule[];
}

/**
 * Virtual/computed column that derives value from other columns
 */
export interface VirtualColumnSchema extends Omit<ColumnSchema, 'column'> {
    /** Virtual column identifier */
    column: string;

    /** Mark as virtual */
    virtual: true;

    /** Source columns for computation */
    sourceColumns: string[];

    /** Computation method */
    compute: {
        /** Computation type */
        type: 'merge' | 'concat' | 'formula' | 'custom';
        /** Template for merge (e.g., "{col1} - {col2}") */
        template?: string;
        /** Formula expression (for formula type) */
        formula?: string;
        /** Custom function name (for custom type) */
        function?: string;
    };
}

// =============================================================================
// CATEGORY SCHEMA
// =============================================================================

/**
 * Column category for grouping related columns
 */
export interface CategorySchema {
    /** Unique category identifier */
    id: string;

    /** Display name */
    name: string;

    /** Bootstrap icon class */
    icon?: string;

    /** Brand color */
    color?: string;

    /** Description text */
    description?: string;

    /** Visible by default */
    defaultVisible?: boolean;

    /** Display order priority */
    order?: number;
}

// =============================================================================
// ROW CONFIGURATION
// =============================================================================

/**
 * Row-level configuration
 */
export interface RowConfiguration {
    /** Enable row selection */
    selectable?: boolean;

    /** Enable click action */
    clickable?: boolean;

    /** Click action handler name */
    clickAction?: string;

    /** Row height mode */
    heightMode?: 'auto' | 'fixed';

    /** Fixed row height */
    height?: string;

    /** Conditional row styling */
    conditionalStyles?: Array<{
        condition: TransformCondition;
        cssClass?: string;
        style?: Record<string, string>;
    }>;
}

// =============================================================================
// TABLE SCHEMA
// =============================================================================

/**
 * Table-specific settings
 */
export interface TableSettings {
    /** Page size for pagination */
    pageSize?: number;

    /** Density mode */
    density?: 'compact' | 'default' | 'presentation';

    /** Show row numbers */
    showRowNumbers?: boolean;

    /** Enable row selection */
    enableSelection?: boolean;

    /** Enable export functionality */
    enableExport?: boolean;

    /** Enable column reordering */
    enableColumnReorder?: boolean;

    /** Enable column resizing */
    enableColumnResize?: boolean;

    /** Default sort column */
    defaultSortColumn?: string;

    /** Default sort order */
    defaultSortOrder?: 'asc' | 'desc';
}

/**
 * Complete table definition
 */
export interface TableSchema {
    /** Display name (defaults to table key) */
    displayName?: string;

    /** Description text */
    description?: string;

    /** Bootstrap icon class */
    icon?: string;

    /** Table-specific settings (overrides data type defaults) */
    settings?: TableSettings;

    /** Column categories */
    categories?: CategorySchema[];

    /** Column definitions (ordered) */
    columns: ColumnSchema[];

    /** Virtual/computed columns */
    virtualColumns?: VirtualColumnSchema[];

    /** Row-level configuration */
    rowConfig?: RowConfiguration;
}

// =============================================================================
// DATA TYPE CONFIGURATION
// =============================================================================

/**
 * Default settings for a data type
 */
export interface DataTypeDefaults {
    pageSize?: number;
    density?: 'compact' | 'default' | 'presentation';
    showRowNumbers?: boolean;
    enableSelection?: boolean;
    enableExport?: boolean;
    theme?: 'light' | 'dark' | 'system';
}

/**
 * Custom transformer registration
 */
export interface TransformerRegistration {
    /** Transformer name */
    name: string;

    /** JavaScript function path or inline code */
    handler: string;

    /** Description */
    description?: string;
}

/**
 * Complete data type configuration
 * Defines how a specific type of data object (e.g., GenomeDataTables) should be rendered
 */
export interface DataTypeConfig {
    /** Unique identifier (e.g., "genome_data_tables") */
    id: string;

    /** Human-readable name */
    name: string;

    /** Description */
    description?: string;

    /** Schema version for compatibility */
    version: string;

    /** Bootstrap icon class */
    icon?: string;

    /** Brand color */
    color?: string;

    // ─── Defaults ─────────────────────────────────────────────────────────

    /** Default settings for all tables of this type */
    defaults?: DataTypeDefaults;

    // ─── Tables ───────────────────────────────────────────────────────────

    /** Table definitions keyed by table name */
    tables: Record<string, TableSchema>;

    // ─── Shared Configuration ─────────────────────────────────────────────

    /** Categories shared across all tables */
    sharedCategories?: CategorySchema[];

    /** Custom transformers for this data type */
    transformers?: TransformerRegistration[];
}

// =============================================================================
// APP CONFIGURATION
// =============================================================================

/**
 * Data type reference in manifest
 */
export interface DataTypeReference {
    /**
     * URL to load data type config from
     */
    configUrl?: string;

    /**
     * Inline configuration
     */
    config?: DataTypeConfig;

    /**
     * Whether to load on app startup (default: true)
     */
    autoLoad?: boolean;

    /**
     * List of object type strings that this data type handles.
     * Used for auto-detection from API responses.
     * e.g. ["KBaseFBA.GenomeDataLakeTables-2.0"]
     */
    matches?: string[];
    /** Load priority (lower = earlier) */
    priority?: number;
}

/**
 * Global application settings
 */
export interface GlobalSettings {
    pageSize?: number;
    theme?: 'light' | 'dark' | 'system';
    density?: 'compact' | 'default' | 'presentation';
    showRowNumbers?: boolean;
    locale?: string;
    dateFormat?: string;
    numberFormat?: {
        decimals?: number;
        thousandsSeparator?: string;
        decimalSeparator?: string;
    };
}

/**
 * Root application configuration
 */
export interface AppConfig {
    /** Application metadata */
    app: {
        name: string;
        version?: string;
        description?: string;
        apiUrl?: string;
        environment?: 'local' | 'appdev' | 'prod';
    };

    /** Data type manifest */
    dataTypes: Record<string, DataTypeReference>;

    /** Global default settings */
    defaults?: GlobalSettings;
}

// =============================================================================
// RUNTIME TYPES
// =============================================================================

/**
 * Resolved column configuration (after merging defaults)
 */
export interface ResolvedColumnConfig extends Required<Pick<ColumnSchema,
    'column' | 'visible' | 'sortable' | 'filterable' | 'searchable' | 'copyable'
>> {
    displayName: string;
    dataType: ColumnDataType;
    width: string;
    align: TextAlign;
    categories: string[];
    transform?: TransformConfig | TransformConfig[];
}

/**
 * Resolved table configuration
 */
export interface ResolvedTableConfig {
    name: string;
    displayName: string;
    settings: Required<TableSettings>;
    categories: CategorySchema[];
    columns: ResolvedColumnConfig[];
    virtualColumns: VirtualColumnSchema[];
    rowConfig: Required<RowConfiguration>;
}
