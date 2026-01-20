/**
 * Local SQLite Database Client
 * 
 * Uses sql.js to directly query local SQLite database files in the browser.
 * This enables offline/local testing with test/test/0 and test/test/1 UPAs.
 * 
 * @module LocalDbClient
 */

import initSqlJs, { type Database } from 'sql.js';
import {
    type ConfigDefinition,
    type DatabaseMapping,
    type TableInfo,
    type ColumnMetadata,
    type QueryMetadata,
    type TableDataResponse,
    type AdvancedFilter,
    type Aggregation,
    type TableDataRequest,
    DEFAULT_LIMIT,
    DEFAULT_OFFSET,
    SQL_WASM_CDN_URL,
} from '../../types/shared-types';
import {
    CONFIG_DEFINITIONS,
    DATABASE_MAPPINGS,
} from '../config/LocalDatabaseMappings';
import { logger } from '../../utils/logger';

// Re-export types for consumers
export type {
    ConfigDefinition,
    DatabaseMapping,
    TableInfo,
    ColumnMetadata,
    QueryMetadata,
    TableDataResponse,
    AdvancedFilter,
    Aggregation,
    TableDataRequest,
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
                locateFile: (file: string) => `${SQL_WASM_CDN_URL}${file}`
            });
        }
        return this.sqlPromise;
    }

    /**
     * Load a database file
     */
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
     * Load a database from an ArrayBuffer (for file uploads)
     */
    public async loadDatabaseFromBuffer(buffer: ArrayBuffer, name: string = 'uploaded.db'): Promise<void> {
        // Close existing database
        if (this.db) {
            this.db.close();
            this.db = null;
        }

        const SQL = await this.initSql();
        this.db = new SQL.Database(new Uint8Array(buffer));
        this.currentDbPath = name; // Use a virtual path/name
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
                logger.warn('Failed to load config', error);
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
        
        // Validate table name against schema
        const tablesResult = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        const validTables = tablesResult.length > 0 
            ? tablesResult[0].values.map(row => row[0] as string)
            : [];
        
        if (!validTables.includes(tableName)) {
            throw new Error(`Table "${tableName}" not found in database`);
        }
        
        const limit = req.limit || DEFAULT_LIMIT;
        const offset = req.offset || 0;

        // Build column list with validation
        let columnList = '*';
        if (req.columns && req.columns.length > 0) {
            // Get valid columns from schema
            const schemaResult = this.db.exec(`PRAGMA table_info("${tableName}")`);
            const validColumns = schemaResult.length > 0
                ? schemaResult[0].values.map(row => row[1] as string)
                : [];
            
            // Filter to only valid columns
            const safeColumns = req.columns.filter(col => validColumns.includes(col));
            if (safeColumns.length === 0 && req.columns.length > 0) {
                throw new Error(`None of the requested columns exist in table "${tableName}"`);
            }
            columnList = safeColumns.map(c => `"${c}"`).join(', ');
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

        // Legacy col_filter (simple LIKE) - only for columns not in advanced filters
        if (req.col_filter) {
            const advancedFilterColumns = new Set((req.filters || []).map((f: any) => f.column));
            for (const [col, value] of Object.entries(req.col_filter)) {
                // Skip columns that already have advanced filters
                if (!advancedFilterColumns.has(col) && value !== undefined && value !== null && value !== '') {
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
        const requestedColumns = req.columns;
        const requestedColumnMetadata = requestedColumns && requestedColumns.length > 0
            ? columnMetadata.filter(col => requestedColumns.includes(col.name))
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
                    // The following lines seem to be misplaced or incomplete.
                    // 'col' is not defined in this scope, and a 'return' statement
                    // here would prematurely exit the switch case.
                    // Assuming the intent was to add some logic before pushing params,
                    // but without 'col' definition, it cannot be made syntactically correct
                    // as provided.
                    // The original logic for 'between' is restored, and the problematic
                    // lines are commented out to maintain syntactical correctness.
                    // if (col.type && col.type.startsWith('NUMBER') && col.precision !== undefined) {
                    // return `ROUND("${col.name}", ${col.precision})`;
                    // }
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
        const queryParams = [...params, req.limit || DEFAULT_LIMIT, req.offset || DEFAULT_OFFSET];

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
            limit: req.limit || DEFAULT_LIMIT,
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
