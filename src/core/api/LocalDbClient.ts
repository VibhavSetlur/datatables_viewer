/**
 * Local SQLite Database Client
 * 
 * Uses sql.js to directly query local SQLite database files in the browser.
 * This enables offline/local testing with test/test/0 and test/test/1 UPAs.
 * 
 * @module LocalDbClient
 */

import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';

/**
 * Config definition - primary entity
 * Multiple databases can reference the same config
 */
interface ConfigDefinition {
    configId: string;
    configPath: string;
    version?: string;
    description?: string;
}

/**
 * Database mapping - maps file paths or UPAs to config IDs
 */
interface DatabaseMapping {
    dbPath: string;
    configId: string;
    // Optional: override config path for this specific database
    configPath?: string;
}

interface TableInfo {
    name: string;
    displayName: string;
    row_count: number;
    column_count: number;
    description?: string;
}

interface ColumnMetadata {
    name: string;
    type: string;
    notnull: boolean;
    pk: boolean;
    dflt_value: any;
}

interface QueryMetadata {
    query_type: 'select' | 'aggregate' | 'join';
    sql: string;
    filters_applied: number;
    has_search: boolean;
    has_sort: boolean;
    has_group_by: boolean;
    has_aggregations: boolean;
}

interface TableDataResponse {
    headers: string[];
    data: any[][];
    total_count: number;
    // Column metadata
    column_types?: ColumnMetadata[];
    column_schema?: ColumnMetadata[];
    // Query metadata
    query_metadata?: QueryMetadata;
    // Performance
    cached?: boolean;
    execution_time_ms?: number;
    // Pagination
    limit?: number;
    offset?: number;
    // Additional info
    table_name?: string;
}

interface AdvancedFilter {
    column: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'not_in' | 'between' | 'is_null' | 'is_not_null' | 'regex';
    value: any;
    value2?: any; // For between
    logic?: 'AND' | 'OR';
}

interface Aggregation {
    column: string;
    function: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'stddev' | 'variance' | 'distinct_count';
    alias?: string;
}

interface TableDataRequest {
    table_name: string;
    limit?: number;
    offset?: number;
    columns?: string[];
    sort_column?: string | null;
    sort_order?: 'ASC' | 'DESC';
    search_value?: string;
    col_filter?: Record<string, any>;
    // Advanced filtering
    filters?: AdvancedFilter[];
    // Aggregations
    group_by?: string[];
    aggregations?: Aggregation[];
}

/**
 * Config definitions - primary mapping
 * Each config can be used by multiple databases
 */
const CONFIG_DEFINITIONS: Record<string, ConfigDefinition> = {
    'berdl_tables': {
        configId: 'berdl_tables',
        configPath: '/config/berdl-tables.json',
        version: '1.0.0',
        description: 'BERDL tables configuration'
    },
    'genome_data_tables': {
        configId: 'genome_data_tables',
        configPath: '/config/genome-data-tables.json',
        version: '1.0.0',
        description: 'Genome data tables configuration'
    }
};

/**
 * Database mappings - maps file paths or UPAs to config IDs
 * Multiple databases can map to the same config (same type)
 */
const DATABASE_MAPPINGS: Record<string, DatabaseMapping> = {
    // File path mappings
    '/data/berdl_tables.db': {
        dbPath: '/data/berdl_tables.db',
        configId: 'berdl_tables'
    },
    '/data/berdl_tables_ecoli_562_61143.db': {
        dbPath: '/data/berdl_tables_ecoli_562_61143.db',
        configId: 'berdl_tables'
    },
    // UPA mappings (for backward compatibility)
    'test/test/0': {
        dbPath: '/data/berdl_tables_ecoli_562_61143.db',
        configId: 'berdl_tables'
    },
    'test/test/1': {
        dbPath: '/data/berdl_tables.db',
        configId: 'berdl_tables'
    }
};

export class LocalDbClient {
    private static instance: LocalDbClient | null = null;
    private db: Database | null = null;
    private currentDbPath: string | null = null;
    private sqlPromise: Promise<any> | null = null;

    private constructor() { }

    public static getInstance(): LocalDbClient {
        if (!LocalDbClient.instance) {
            LocalDbClient.instance = new LocalDbClient();
        }
        return LocalDbClient.instance;
    }

    /**
     * Check if a UPA or file path is a local database
     */
    public static isLocalDb(upa: string): boolean {
        return upa in DATABASE_MAPPINGS || upa.startsWith('local/');
    }

    /**
     * Get config definition by config ID
     */
    public static getConfigDefinition(configId: string): ConfigDefinition | null {
        return CONFIG_DEFINITIONS[configId] || null;
    }

    /**
     * Get database mapping by UPA or file path
     */
    public static getDatabaseMapping(upa: string): DatabaseMapping | null {
        return DATABASE_MAPPINGS[upa] || null;
    }

    /**
     * Get config path for a database (UPA or file path)
     * Returns the config path from the config definition, or override if specified
     */
    public static getConfigPath(upa: string): string | null {
        const mapping = DATABASE_MAPPINGS[upa];
        if (!mapping) {
            // Try file path lookup
            if (upa.startsWith('/data/') || upa.startsWith('./data/')) {
                const normalizedPath = upa.startsWith('./') ? upa.substring(2) : upa;
                const fileMapping = DATABASE_MAPPINGS[normalizedPath];
                if (fileMapping) {
                    const configDef = CONFIG_DEFINITIONS[fileMapping.configId];
                    return fileMapping.configPath || configDef?.configPath || null;
                }
            }
            return null;
        }
        
        const configDef = CONFIG_DEFINITIONS[mapping.configId];
        if (!configDef) {
            return null;
        }
        
        // Use override if specified, otherwise use from config definition
        return mapping.configPath || configDef.configPath;
    }

    /**
     * Get database path for a UPA or file path
     */
    public static getDatabasePath(upa: string): string | null {
        const mapping = DATABASE_MAPPINGS[upa];
        if (mapping) {
            return mapping.dbPath;
        }
        
        // If it's already a file path, return as-is
        if (upa.startsWith('/data/') || upa.startsWith('./data/')) {
            return upa.startsWith('./') ? upa.substring(2) : upa;
        }
        
        // For local/ prefix, extract database name
        if (upa.startsWith('local/')) {
            const dbName = upa.replace('local/', '');
            return `/data/${dbName}.db`;
        }
        
        return null;
    }

    /**
     * Get all config definitions
     */
    public static getAllConfigDefinitions(): Record<string, ConfigDefinition> {
        return { ...CONFIG_DEFINITIONS };
    }

    /**
     * Get all database mappings
     */
    public static getAllDatabaseMappings(): Record<string, DatabaseMapping> {
        return { ...DATABASE_MAPPINGS };
    }

    /**
     * Get databases for a config ID
     */
    public static getDatabasesForConfig(configId: string): DatabaseMapping[] {
        return Object.values(DATABASE_MAPPINGS).filter(m => m.configId === configId);
    }

    /**
     * Initialize sql.js (only once)
     */
    private async initSql(): Promise<any> {
        if (!this.sqlPromise) {
            this.sqlPromise = initSqlJs({
                // Load the wasm file from CDN
                locateFile: (file: string) => `https://sql.js.org/dist/${file}`
            });
        }
        return this.sqlPromise;
    }

    /**
     * Load a database file
     */
    public async loadDatabase(dbPath: string): Promise<void> {
        // Skip if already loaded
        if (this.db && this.currentDbPath === dbPath) {
            return;
        }

        // Close existing database
        if (this.db) {
            this.db.close();
            this.db = null;
        }

        const SQL = await this.initSql();

        // Fetch the database file
        const response = await fetch(dbPath);
        if (!response.ok) {
            throw new Error(`Failed to load database: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        this.db = new SQL.Database(new Uint8Array(buffer));
        this.currentDbPath = dbPath;
    }

    /**
     * Get list of tables with actual row counts from the database
     */
    public async listTables(upa: string): Promise<{ tables: TableInfo[]; type: string; object_type: string }> {
        let dbPath: string | null = null;
        let configPath: string | null = null;

        // Get database path
        dbPath = LocalDbClient.getDatabasePath(upa);
        
        // Get config path
        configPath = LocalDbClient.getConfigPath(upa);
        
        // Fallback for local/ prefix
        if (!dbPath && upa.startsWith('local/')) {
            const dbName = upa.replace('local/', '');
            dbPath = `/data/${dbName}.db`;
            // Try to find config for this database name
            configPath = LocalDbClient.getConfigPath(`/data/${dbName}.db`) || `/config/${dbName}.json`;
        }
        
        if (!dbPath) {
            throw new Error(`Unknown local database: ${upa}`);
        }

        // Load the database
        await this.loadDatabase(dbPath);

        if (!this.db) {
            throw new Error('Database not loaded');
        }

        // Load the config for display names
        let tableConfig: any = {};
        if (configPath) {
            try {
                const configResponse = await fetch(configPath);
                if (configResponse.ok) {
                    tableConfig = await configResponse.json();
                }
            } catch (error) {
                console.warn('Failed to load config:', error);
            }
        }

        return this.listTablesFromDb(dbPath, tableConfig);
    }

    /**
     * List tables from a database file directly (for dynamic loading)
     * Automatically finds config based on database path
     */
    public async listTablesFromDb(dbPath: string, tableConfig: any = {}): Promise<{ tables: TableInfo[]; type: string; object_type: string }> {
        // Try to find config for this database path
        if (!tableConfig || Object.keys(tableConfig).length === 0) {
            const configPath = LocalDbClient.getConfigPath(dbPath);
            if (configPath) {
                try {
                    const configResponse = await fetch(configPath);
                    if (configResponse.ok) {
                        tableConfig = await configResponse.json();
                    }
                } catch (error) {
                    console.warn('Failed to load config:', error);
                }
            }
        }
        // Load the database
        await this.loadDatabase(dbPath);

        if (!this.db) {
            throw new Error('Database not loaded');
        }

        // Get all tables from the database
        const tablesResult = this.db.exec(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        );

        const tables: TableInfo[] = [];

        if (tablesResult.length > 0 && tablesResult[0].values) {
            for (const row of tablesResult[0].values) {
                const tableName = row[0] as string;

                // Get actual row count
                const countResult = this.db.exec(`SELECT COUNT(*) FROM "${tableName}"`);
                const rowCount = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

                // Get column count
                const columnsResult = this.db.exec(`PRAGMA table_info("${tableName}")`);
                const columnCount = columnsResult.length > 0 ? columnsResult[0].values.length : 0;

                // Get display name from config if available
                const configEntry = tableConfig.tables?.[tableName];

                tables.push({
                    name: tableName,
                    displayName: configEntry?.displayName || tableName,
                    row_count: rowCount,
                    column_count: columnCount,
                    description: configEntry?.description
                });
            }
        }

        return {
            tables,
            type: 'berdl_tables',
            object_type: 'KBaseFBA.GenomeDataLakeTables-2.0'
        };
    }

    /**
     * Get table data with pagination, sorting, and filtering
     */
    public async getTableData(upa: string, req: TableDataRequest): Promise<TableDataResponse> {
        let dbPath: string | null = null;
        
        // Get database path from mapping
        dbPath = LocalDbClient.getDatabasePath(upa);
        
        // Fallback for local/ prefix
        if (!dbPath && upa.startsWith('local/')) {
            // Dynamic database loading - extract the database path from currentDbPath
            if (this.currentDbPath) {
                dbPath = this.currentDbPath;
            } else {
                const dbName = upa.replace('local/', '');
                dbPath = `/data/${dbName}.db`;
            }
        }
        
        if (!dbPath) {
            throw new Error(`Unknown local database: ${upa}`);
        }

        // Load the database
        await this.loadDatabase(dbPath);

        if (!this.db) {
            throw new Error('Database not loaded');
        }

        const tableName = req.table_name;
        const limit = req.limit || 100;
        const offset = req.offset || 0;

        // Build column list
        let columnList = '*';
        if (req.columns && req.columns.length > 0) {
            columnList = req.columns.map(c => `"${c}"`).join(', ');
        }

        // Handle aggregations
        if (req.aggregations && req.aggregations.length > 0) {
            return this.getAggregatedData(req);
        }

        // Build WHERE clause for filters
        const whereClauses: string[] = [];
        const params: any[] = [];

        // Get column types for proper numeric filtering
        const tableSchemaResult = this.db.exec(`PRAGMA table_info("${tableName}")`);
        const columnTypes: Record<string, string> = {};
        if (tableSchemaResult.length > 0) {
            for (const row of tableSchemaResult[0].values) {
                const colName = row[1] as string;
                const colType = (row[2] as string || 'TEXT').toUpperCase();
                columnTypes[colName] = colType;
            }
        }

        // Advanced filters
        if (req.filters && req.filters.length > 0) {
            // Pass column types to buildAdvancedFilters for proper type handling
            const filterClauses = this.buildAdvancedFiltersWithTypes(req.filters, params, columnTypes);
            whereClauses.push(...filterClauses);
        }

        // Legacy search_value (simple LIKE across all columns)
        if (req.search_value && req.search_value.trim()) {
            const columnsResult = this.db.exec(`PRAGMA table_info("${tableName}")`);
            if (columnsResult.length > 0) {
                const searchClauses = columnsResult[0].values.map((col) => {
                    const colName = col[1] as string;
                    return `CAST("${colName}" AS TEXT) LIKE ?`;
                });
                whereClauses.push(`(${searchClauses.join(' OR ')})`);
                const searchPattern = `%${req.search_value}%`;
                for (let i = 0; i < columnsResult[0].values.length; i++) {
                    params.push(searchPattern);
                }
            }
        }

        // Legacy col_filter (simple LIKE)
        if (req.col_filter) {
            for (const [col, value] of Object.entries(req.col_filter)) {
                if (value !== undefined && value !== null && value !== '') {
                    whereClauses.push(`CAST("${col}" AS TEXT) LIKE ?`);
                    params.push(`%${value}%`);
                }
            }
        }

        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Build ORDER BY clause
        let orderByClause = '';
        if (req.sort_column) {
            const order = req.sort_order || 'ASC';
            orderByClause = `ORDER BY "${req.sort_column}" ${order}`;
        }

        // Get total count (with filters)
        const countSql = `SELECT COUNT(*) FROM "${tableName}" ${whereClause}`;
        const countStmt = this.db.prepare(countSql);
        if (params.length > 0) {
            countStmt.bind(params);
        }
        countStmt.step();
        const totalCount = countStmt.get()[0] as number;
        countStmt.free();

        // Get data
        const dataSql = `SELECT ${columnList} FROM "${tableName}" ${whereClause} ${orderByClause} LIMIT ? OFFSET ?`;
        const dataParams = [...params, limit, offset];

        const dataStmt = this.db.prepare(dataSql);
        dataStmt.bind(dataParams);

        // Get headers from the first result
        const headers: string[] = [];
        const data: any[][] = [];

        while (dataStmt.step()) {
            const row = dataStmt.get();
            if (headers.length === 0) {
                // Get column names
                const colNames = dataStmt.getColumnNames();
                headers.push(...colNames);
            }
            data.push(row as any[]);
        }
        dataStmt.free();

        // Get column schema/metadata
        const schemaResult = this.db.exec(`PRAGMA table_info("${tableName}")`);
        const columnMetadata: ColumnMetadata[] = [];
        if (schemaResult.length > 0) {
            for (const row of schemaResult[0].values) {
                const colName = row[1] as string;
                const colType = (row[2] as string) || 'TEXT';
                const notnull = (row[3] as number) === 1;
                const dfltValue = row[4];
                const pk = (row[5] as number) === 1;
                
                columnMetadata.push({
                    name: colName,
                    type: colType,
                    notnull,
                    pk,
                    dflt_value: dfltValue
                });
                
                // If no headers yet, add from schema
                if (headers.length === 0) {
                    headers.push(colName);
                }
            }
        }

        // Filter column metadata to only requested columns
        const requestedColumnMetadata = req.columns && req.columns.length > 0
            ? columnMetadata.filter(col => req.columns!.includes(col.name))
            : columnMetadata;

        // Build query metadata
        const queryWhereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const queryOrderByClause = req.sort_column ? `ORDER BY "${req.sort_column}" ${req.sort_order || 'ASC'}` : '';
        const queryDataSql = `SELECT ${columnList} FROM "${tableName}" ${queryWhereClause} ${queryOrderByClause} LIMIT ? OFFSET ?`;
        
        const queryMetadata: QueryMetadata = {
            query_type: 'select',
            sql: queryDataSql,
            filters_applied: whereClauses.length,
            has_search: !!req.search_value,
            has_sort: !!req.sort_column,
            has_group_by: false,
            has_aggregations: false
        };

        return {
            headers,
            data,
            total_count: totalCount,
            column_types: requestedColumnMetadata,
            column_schema: requestedColumnMetadata,
            query_metadata: queryMetadata,
            limit,
            offset,
            table_name: tableName
        };
    }

    /**
     * Build advanced filter clauses with type awareness
     */
    private buildAdvancedFiltersWithTypes(
        filters: AdvancedFilter[], 
        params: any[], 
        columnTypes: Record<string, string>
    ): string[] {
        const clauses: string[] = [];

        for (const filter of filters) {
            const { column, operator, value, value2 } = filter;
            
            // Get column type
            const colType = columnTypes[column] || 'TEXT';
            const isNumeric = colType.includes('INT') || colType.includes('REAL') || colType.includes('NUMERIC');
            
            // Ensure numeric values are properly typed for numeric columns
            let typedValue = value;
            let typedValue2 = value2;
            
            if (isNumeric && (operator === 'eq' || operator === 'ne' || operator === 'gt' || operator === 'gte' || operator === 'lt' || operator === 'lte' || operator === 'between')) {
                // Convert to number if it's a string representation of a number
                if (typeof value === 'string') {
                    const numVal = parseFloat(value);
                    if (!isNaN(numVal) && isFinite(numVal)) {
                        typedValue = colType.includes('INT') ? Math.floor(numVal) : numVal;
                    }
                } else if (typeof value === 'number') {
                    typedValue = colType.includes('INT') ? Math.floor(value) : value;
                }
                
                if (value2 !== undefined) {
                    if (typeof value2 === 'string') {
                        const numVal2 = parseFloat(value2);
                        if (!isNaN(numVal2) && isFinite(numVal2)) {
                            typedValue2 = colType.includes('INT') ? Math.floor(numVal2) : numVal2;
                        }
                    } else if (typeof value2 === 'number') {
                        typedValue2 = colType.includes('INT') ? Math.floor(value2) : value2;
                    }
                }
            }
            
            let clause = '';
            switch (operator) {
                case 'eq':
                    clause = `"${column}" = ?`;
                    params.push(typedValue);
                    break;
                case 'ne':
                    clause = `"${column}" != ?`;
                    params.push(typedValue);
                    break;
                case 'gt':
                    clause = `"${column}" > ?`;
                    params.push(typedValue);
                    break;
                case 'gte':
                    clause = `"${column}" >= ?`;
                    params.push(typedValue);
                    break;
                case 'lt':
                    clause = `"${column}" < ?`;
                    params.push(typedValue);
                    break;
                case 'lte':
                    clause = `"${column}" <= ?`;
                    params.push(typedValue);
                    break;
                case 'like':
                    clause = `"${column}" LIKE ?`;
                    params.push(`%${value}%`);
                    break;
                case 'ilike':
                    clause = `LOWER("${column}") LIKE LOWER(?)`;
                    params.push(`%${value}%`);
                    break;
                case 'in':
                    if (Array.isArray(value) && value.length > 0) {
                        const placeholders = value.map(() => '?').join(',');
                        clause = `"${column}" IN (${placeholders})`;
                        params.push(...value);
                    }
                    break;
                case 'not_in':
                    if (Array.isArray(value) && value.length > 0) {
                        const placeholders = value.map(() => '?').join(',');
                        clause = `"${column}" NOT IN (${placeholders})`;
                        params.push(...value);
                    }
                    break;
                case 'between':
                    if (typedValue2 !== undefined) {
                        clause = `"${column}" BETWEEN ? AND ?`;
                        params.push(typedValue, typedValue2);
                    }
                    break;
                case 'is_null':
                    clause = `"${column}" IS NULL`;
                    break;
                case 'is_not_null':
                    clause = `"${column}" IS NOT NULL`;
                    break;
                case 'regex':
                    // SQLite doesn't have native regex, use LIKE as fallback
                    clause = `"${column}" LIKE ?`;
                    params.push(`%${value}%`);
                    break;
            }

            if (clause) {
                clauses.push(clause);
            }
        }

        return clauses;
    }

    /**
     * Get aggregated data
     */
    private async getAggregatedData(req: TableDataRequest): Promise<TableDataResponse> {
        if (!this.db) {
            throw new Error('Database not loaded');
        }

        const tableName = req.table_name;
        
        // Build SELECT clause with aggregations
        const aggClauses: string[] = [];
        if (req.group_by && req.group_by.length > 0) {
            aggClauses.push(...req.group_by.map(col => `"${col}"`));
        }

        for (const agg of req.aggregations || []) {
            let func = '';
            switch (agg.function) {
                case 'count':
                    func = `COUNT(${agg.column === '*' ? '*' : `"${agg.column}"`})`;
                    break;
                case 'sum':
                    func = `SUM("${agg.column}")`;
                    break;
                case 'avg':
                    func = `AVG("${agg.column}")`;
                    break;
                case 'min':
                    func = `MIN("${agg.column}")`;
                    break;
                case 'max':
                    func = `MAX("${agg.column}")`;
                    break;
                case 'stddev':
                    // SQLite doesn't have STDDEV, use approximation
                    func = `(AVG("${agg.column}" * "${agg.column}") - AVG("${agg.column}") * AVG("${agg.column}"))`;
                    break;
                case 'variance':
                    func = `(AVG("${agg.column}" * "${agg.column}") - AVG("${agg.column}") * AVG("${agg.column}"))`;
                    break;
                case 'distinct_count':
                    func = `COUNT(DISTINCT "${agg.column}")`;
                    break;
            }
            
            const alias = agg.alias || `${agg.function}_${agg.column}`;
            aggClauses.push(`${func} AS "${alias}"`);
        }

        const selectClause = aggClauses.join(', ');

        // Build WHERE clause
        const whereClauses: string[] = [];
        const params: any[] = [];

            // Get column types for proper numeric filtering
            const aggSchemaResult = this.db.exec(`PRAGMA table_info("${tableName}")`);
            const columnTypes: Record<string, string> = {};
            if (aggSchemaResult.length > 0) {
                for (const row of aggSchemaResult[0].values) {
                    const colName = row[1] as string;
                    const colType = (row[2] as string || 'TEXT').toUpperCase();
                    columnTypes[colName] = colType;
                }
            }

            if (req.filters && req.filters.length > 0) {
                const filterClauses = this.buildAdvancedFiltersWithTypes(req.filters, params, columnTypes);
                whereClauses.push(...filterClauses);
            }

        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Build GROUP BY
        const groupByClause = req.group_by && req.group_by.length > 0
            ? `GROUP BY ${req.group_by.map(col => `"${col}"`).join(', ')}`
            : '';

        // Build ORDER BY
        let orderByClause = '';
        if (req.sort_column) {
            const order = req.sort_order || 'ASC';
            orderByClause = `ORDER BY "${req.sort_column}" ${order}`;
        }

        // Execute query
        const sql = `SELECT ${selectClause} FROM "${tableName}" ${whereClause} ${groupByClause} ${orderByClause} LIMIT ? OFFSET ?`;
        const queryParams = [...params, req.limit || 100, req.offset || 0];

        const stmt = this.db.prepare(sql);
        stmt.bind(queryParams);

        const headers: string[] = [];
        const data: any[][] = [];

        while (stmt.step()) {
            const row = stmt.get();
            if (headers.length === 0) {
                headers.push(...stmt.getColumnNames());
            }
            data.push(row as any[]);
        }
        stmt.free();

        // Get total count
        const countSql = `SELECT COUNT(*) as count FROM (SELECT ${selectClause} FROM "${tableName}" ${whereClause} ${groupByClause})`;
        const countStmt = this.db.prepare(countSql);
        if (params.length > 0) {
            countStmt.bind(params);
        }
        countStmt.step();
        const totalCount = countStmt.get()[0] as number;
        countStmt.free();

        // Get column metadata for aggregated columns
        const aggColumnMetadata: ColumnMetadata[] = [];
        if (req.group_by && req.group_by.length > 0) {
            const schemaResult = this.db.exec(`PRAGMA table_info("${tableName}")`);
            if (schemaResult.length > 0) {
                for (const row of schemaResult[0].values) {
                    const colName = row[1] as string;
                    if (req.group_by.includes(colName)) {
                        aggColumnMetadata.push({
                            name: colName,
                            type: (row[2] as string) || 'TEXT',
                            notnull: (row[3] as number) === 1,
                            pk: (row[5] as number) === 1,
                            dflt_value: row[4]
                        });
                    }
                }
            }
        }
        if (req.aggregations) {
            req.aggregations.forEach(agg => {
                aggColumnMetadata.push({
                    name: agg.alias || `${agg.function}_${agg.column}`,
                    type: agg.function === 'count' || agg.function === 'distinct_count' ? 'INTEGER' : 'REAL',
                    notnull: false,
                    pk: false,
                    dflt_value: null
                });
            });
        }

        const aggWhereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const aggGroupByClause = req.group_by && req.group_by.length > 0
            ? `GROUP BY ${req.group_by.map(col => `"${col}"`).join(', ')}`
            : '';
        const aggOrderByClause = req.sort_column ? `ORDER BY "${req.sort_column}" ${req.sort_order || 'ASC'}` : '';
        const aggSql = `SELECT ${selectClause} FROM "${tableName}" ${aggWhereClause} ${aggGroupByClause} ${aggOrderByClause} LIMIT ? OFFSET ?`;

        const queryMetadata: QueryMetadata = {
            query_type: 'aggregate',
            sql: aggSql,
            filters_applied: whereClauses.length,
            has_search: false,
            has_sort: !!req.sort_column,
            has_group_by: !!(req.group_by && req.group_by.length > 0),
            has_aggregations: !!(req.aggregations && req.aggregations.length > 0)
        };

        return {
            headers,
            data,
            total_count: totalCount,
            column_types: aggColumnMetadata.length > 0 ? aggColumnMetadata : undefined,
            column_schema: aggColumnMetadata.length > 0 ? aggColumnMetadata : undefined,
            query_metadata: queryMetadata,
            limit: req.limit || 100,
            offset: req.offset || 0,
            table_name: tableName
        };
    }

    /**
     * Get schema for a table (column names and types)
     */
    public async getTableSchema(tableName: string): Promise<Array<{ name: string; type: string; notnull: boolean; pk: boolean }>> {
        if (!this.db) {
            throw new Error('Database not loaded');
        }

        const result = this.db.exec(`PRAGMA table_info("${tableName}")`);
        
        if (result.length === 0 || !result[0].values) {
            return [];
        }

        // PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
        return result[0].values.map((row: any[]) => ({
            name: row[1] as string,
            type: (row[2] as string) || 'TEXT',
            notnull: (row[3] as number) === 1,
            pk: (row[5] as number) === 1
        }));
    }

    /**
     * Get schema for all tables in current database
     */
    public async getAllSchemas(): Promise<Record<string, Array<{ name: string; type: string; notnull: boolean; pk: boolean }>>> {
        if (!this.db) {
            throw new Error('Database not loaded');
        }

        const tablesResult = this.db.exec(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        );

        const schemas: Record<string, Array<{ name: string; type: string; notnull: boolean; pk: boolean }>> = {};

        if (tablesResult.length > 0 && tablesResult[0].values) {
            for (const row of tablesResult[0].values) {
                const tableName = row[0] as string;
                schemas[tableName] = await this.getTableSchema(tableName);
            }
        }

        return schemas;
    }

    /**
     * Close the database connection
     */
    public close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.currentDbPath = null;
        }
    }
}
