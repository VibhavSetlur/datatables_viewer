/**
 * Shared Types for DataTables Viewer
 * 
 * Centralized type definitions used by both ApiClient and LocalDbClient.
 * These types align with the TableScanner API response format.
 * 
 * @module shared-types
 */

// =============================================================================
// FILTER OPERATORS
// =============================================================================

/**
 * Filter operators supported by both LocalDbClient and TableScanner API.
 * These operators define how column values are compared in WHERE clauses.
 */
export type FilterOperator =
    | 'eq'          // Equal (=)
    | 'ne'          // Not equal (!=)
    | 'gt'          // Greater than (>)
    | 'gte'         // Greater than or equal (>=)
    | 'lt'          // Less than (<)
    | 'lte'         // Less than or equal (<=)
    | 'like'        // SQL LIKE (case-sensitive)
    | 'ilike'       // SQL LIKE (case-insensitive)
    | 'in'          // IN (value is array)
    | 'not_in'      // NOT IN (value is array)
    | 'between'     // BETWEEN (uses value and value2)
    | 'is_null'     // IS NULL
    | 'is_not_null' // IS NOT NULL
    | 'regex';      // Regular expression match

/**
 * Advanced filter for querying table data.
 * Supports complex filtering operations on individual columns.
 */
export interface AdvancedFilter {
    /** Column name to filter on */
    column: string;
    /** Filter operator */
    operator: FilterOperator;
    /** Primary filter value */
    value: unknown;
    /** Secondary value (for 'between' operator) */
    value2?: unknown;
    /** Logical connector for multiple filters (default: AND) */
    logic?: 'AND' | 'OR';
}

// =============================================================================
// AGGREGATION FUNCTIONS
// =============================================================================

/**
 * Aggregation functions supported by LocalDbClient and TableScanner API.
 */
export type AggregationFunction =
    | 'count'           // COUNT(column) or COUNT(*)
    | 'sum'             // SUM(column)
    | 'avg'             // AVG(column)
    | 'min'             // MIN(column)
    | 'max'             // MAX(column)
    | 'stddev'          // Standard deviation
    | 'variance'        // Variance
    | 'distinct_count'; // COUNT(DISTINCT column)

/**
 * Aggregation specification for grouped queries.
 */
export interface Aggregation {
    /** Column to aggregate (use '*' for count) */
    column: string;
    /** Aggregation function */
    function: AggregationFunction;
    /** Optional alias for the result column */
    alias?: string;
}

// =============================================================================
// COLUMN METADATA
// =============================================================================

/**
 * Column metadata from SQLite PRAGMA table_info.
 * Matches TableScanner API column_schema format.
 */
export interface ColumnMetadata {
    /** Column name */
    name: string;
    /** SQLite data type (TEXT, INTEGER, REAL, BLOB, etc.) */
    type: string;
    /** Whether column has NOT NULL constraint */
    notnull: boolean;
    /** Whether column is part of primary key */
    pk: boolean;
    /** Default value if any */
    dflt_value: unknown;
}

// =============================================================================
// QUERY METADATA
// =============================================================================

/**
 * Metadata about the executed query.
 * Provides debugging information about query execution.
 */
export interface QueryMetadata {
    /** Type of query executed */
    query_type: 'select' | 'aggregate' | 'join';
    /** Generated SQL statement */
    sql: string;
    /** Number of filter conditions applied */
    filters_applied: number;
    /** Whether search was included */
    has_search: boolean;
    /** Whether sorting was applied */
    has_sort: boolean;
    /** Whether GROUP BY was used */
    has_group_by: boolean;
    /** Whether aggregation functions were used */
    has_aggregations: boolean;
}

// =============================================================================
// TABLE INFO
// =============================================================================

/**
 * Table information returned from list tables operation.
 */
export interface TableInfo {
    /** Table name in database */
    name: string;
    /** Display name for UI */
    displayName: string;
    /** Total row count */
    row_count: number;
    /** Number of columns */
    column_count: number;
    /** Optional table description */
    description?: string;
}

/**
 * Database information for multi-database objects.
 * Returned when a workspace object contains multiple pangenome databases.
 */
export interface DatabaseInfo {
    /** Database identifier (e.g., pangenome_id) */
    db_name: string;
    /** Human-readable display name */
    db_display_name: string | null;
    /** Tables contained in this database */
    tables: TableInfo[];
    /** Total rows across all tables in this database */
    row_count: number | null;
    /** Schema information per table */
    schemas: Record<string, Record<string, string>> | null;
}

// =============================================================================
// REQUEST TYPES
// =============================================================================

/**
 * Request parameters for fetching table data.
 * Used by both LocalDbClient and ApiClient.
 */
export interface TableDataRequest {
    /** Table name to query */
    table_name: string;
    /** Maximum rows to return (default: 100) */
    limit?: number;
    /** Offset for pagination (default: 0) */
    offset?: number;
    /** Specific columns to return (default: all) */
    columns?: string[];
    /** Column to sort by */
    sort_column?: string | null;
    /** Sort direction */
    sort_order?: 'ASC' | 'DESC';
    /** Global search value (searches all columns) */
    search_value?: string;
    /** Simple column filters (legacy, uses LIKE) */
    col_filter?: Record<string, unknown>;
    /** Advanced filters with operators */
    filters?: AdvancedFilter[];
    /** Columns to group by */
    group_by?: string[];
    /** Aggregation functions to apply */
    aggregations?: Aggregation[];
}

/**
 * Extended request for API client with additional fields.
 */
export interface ApiTableDataRequest extends TableDataRequest {
    /** BERDL table ID / object reference */
    berdl_table_id: string;
    /** Query filters (advanced API format) */
    query_filters?: unknown;
    /** KBase environment */
    kb_env?: string;
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

/**
 * Response from table data queries.
 * Matches TableScanner API TableDataResponse format exactly.
 */
export interface TableDataResponse {
    /** Column names in order */
    headers: string[];
    /** Row data as 2D array */
    data: unknown[][];
    /** Total count matching filters (before pagination) */
    total_count: number;
    /** Column type metadata */
    column_types?: ColumnMetadata[];
    /** Column schema information */
    column_schema?: ColumnMetadata[];
    /** Query execution metadata */
    query_metadata?: QueryMetadata;
    /** Whether result was from cache */
    cached?: boolean;
    /** Query execution time in milliseconds */
    execution_time_ms?: number;
    /** Applied limit */
    limit?: number;
    /** Applied offset */
    offset?: number;
    /** Table name queried */
    table_name?: string;
    /** Database path (LocalDbClient only) */
    database_path?: string;
}

/**
 * Response from list tables operation.
 */
export interface TableListResponse {
    /** List of tables in database (flattened for backward compat) */
    tables: TableInfo[];
    /** Database type identifier */
    type: string;
    /** KBase object type */
    object_type: string;
    /** BERDL table ID / object reference */
    berdl_table_id?: string;
    /** Total rows across all tables */
    total_rows?: number;
    /** API version */
    api_version?: string;
    /** List of databases (for multi-database objects) */
    databases?: DatabaseInfo[];
    /** Whether this object contains multiple databases */
    has_multiple_databases?: boolean;
    /** Schema information per table */
    schemas?: Record<string, Record<string, string>>;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Config definition for local database mapping.
 */
export interface ConfigDefinition {
    /** Unique config identifier */
    configId: string;
    /** Path to config JSON file */
    configPath: string;
    /** Config version */
    version?: string;
    /** Human-readable description */
    description?: string;
}

/**
 * Database mapping - maps file paths or UPAs to config IDs.
 */
export interface DatabaseMapping {
    /** Path to database file */
    dbPath: string;
    /** Config ID to use */
    configId: string;
    /** Optional override for config path */
    configPath?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default limit for pagination */
export const DEFAULT_LIMIT = 100;

/** Default offset for pagination */
export const DEFAULT_OFFSET = 0;

/** Maximum allowed limit per request */
export const MAX_LIMIT = 10000;

/** CDN URL for sql.js WASM files */
export const SQL_WASM_CDN_URL = 'https://sql.js.org/dist/';
