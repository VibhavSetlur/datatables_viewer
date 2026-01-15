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

interface LocalDbConfig {
    upa: string;
    dbPath: string;
    configPath: string;
}

interface TableInfo {
    name: string;
    displayName: string;
    row_count: number;
    column_count: number;
    description?: string;
}

interface TableDataResponse {
    headers: string[];
    data: any[][];
    total_count: number;
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
}

// Mapping of test UPAs to local database files
const LOCAL_DB_MAP: Record<string, LocalDbConfig> = {
    'test/test/0': {
        upa: 'test/test/0',
        dbPath: '/data/berdl_tables_ecoli_562_61143.db',
        configPath: '/config/berdl-tables.json'
    },
    'test/test/1': {
        upa: 'test/test/1',
        dbPath: '/data/berdl_tables.db',
        configPath: '/config/berdl-tables.json'
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
     * Check if a UPA is a local database UPA
     */
    public static isLocalDb(upa: string): boolean {
        return upa in LOCAL_DB_MAP || upa.startsWith('local/');
    }

    /**
     * Get the config for a local database UPA
     */
    public static getConfig(upa: string): LocalDbConfig | null {
        return LOCAL_DB_MAP[upa] || null;
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
        const config = LOCAL_DB_MAP[upa];
        if (!config) {
            throw new Error(`Unknown local database UPA: ${upa}`);
        }

        // Load the database
        await this.loadDatabase(config.dbPath);

        if (!this.db) {
            throw new Error('Database not loaded');
        }

        // Load the config for display names
        let tableConfig: any = {};
        try {
            const configResponse = await fetch(config.configPath);
            if (configResponse.ok) {
                tableConfig = await configResponse.json();
            }
        } catch (error) {
            console.warn('Failed to load config:', error);
        }

        return this.listTablesFromDb(config.dbPath, tableConfig);
    }

    /**
     * List tables from a database file directly (for dynamic loading)
     */
    public async listTablesFromDb(dbPath: string, tableConfig: any = {}): Promise<{ tables: TableInfo[]; type: string; object_type: string }> {
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
        let dbPath: string;
        
        if (upa.startsWith('local/')) {
            // Dynamic database loading - extract the database path from currentDbPath
            if (!this.currentDbPath) {
                throw new Error(`Database not loaded for UPA: ${upa}`);
            }
            dbPath = this.currentDbPath;
        } else {
            const config = LOCAL_DB_MAP[upa];
            if (!config) {
                throw new Error(`Unknown local database UPA: ${upa}`);
            }
            dbPath = config.dbPath;
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

        // Build WHERE clause for filters
        const whereClauses: string[] = [];
        const params: any[] = [];

        if (req.search_value && req.search_value.trim()) {
            // Get all column names for full-text search across columns
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

        // If no data, still get headers from the table schema
        if (headers.length === 0) {
            const schemaResult = this.db.exec(`PRAGMA table_info("${tableName}")`);
            if (schemaResult.length > 0) {
                for (const row of schemaResult[0].values) {
                    headers.push(row[1] as string);
                }
            }
        }

        return {
            headers,
            data,
            total_count: totalCount
        };
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
