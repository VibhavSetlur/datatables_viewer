/**
 * SQLite Query Service
 * 
 * Handles SQLite database queries server-side, similar to TableScanner
 * Provides efficient querying with indexing support
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';

interface TableInfo {
    name: string;
    displayName?: string;
    row_count: number;
    column_count: number;
    description?: string;
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
    // Join support
    joins?: JoinDefinition[];
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

interface JoinDefinition {
    type: 'inner' | 'left' | 'right' | 'full';
    table: string;
    on: {
        left: string;
        right: string;
    };
}

interface TableDataResponse {
    headers: string[];
    data: any[][];
    total_count: number;
    cached?: boolean;
    execution_time_ms?: number;
}

interface CachedDatabase {
    db: Database.Database;
    lastAccessed: number;
    accessCount: number;
    fileModified: number;
}

// Cache of open database connections with metadata
const dbCache = new Map<string, CachedDatabase>();

// Default lifespan: 30 minutes of inactivity
const DEFAULT_LIFESPAN_MS = 30 * 60 * 1000;

// Cleanup interval: check every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Start cleanup interval
setInterval(() => {
    cleanupExpiredDatabases();
}, CLEANUP_INTERVAL_MS);

/**
 * Clean up databases that have exceeded their lifespan
 */
function cleanupExpiredDatabases(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [path, cached] of dbCache.entries()) {
        const timeSinceAccess = now - cached.lastAccessed;
        if (timeSinceAccess > DEFAULT_LIFESPAN_MS) {
            toRemove.push(path);
        }
    }

    for (const path of toRemove) {
        console.log(`[SQLiteService] Closing expired database: ${path}`);
        closeDatabase(path);
    }

    if (toRemove.length > 0) {
        console.log(`[SQLiteService] Cleaned up ${toRemove.length} expired database(s)`);
    }
}

/**
 * Get file modification time
 */
function getFileModifiedTime(filePath: string): number {
    try {
        const stats = require('fs').statSync(filePath);
        return stats.mtime.getTime();
    } catch {
        return 0;
    }
}

/**
 * Get or create a database connection with caching and lifespan management
 */
export function getDatabase(dbPath: string): Database.Database {
    const cached = dbCache.get(dbPath);
    const fileModified = getFileModifiedTime(dbPath);

    // Check if cached database is still valid
    if (cached) {
        // Check if file was modified (database was updated)
        if (cached.fileModified === fileModified) {
            // Update access time and count
            cached.lastAccessed = Date.now();
            cached.accessCount++;
            return cached.db;
        } else {
            // File was modified, close old connection
            console.log(`[SQLiteService] Database file modified, reloading: ${dbPath}`);
            cached.db.close();
            dbCache.delete(dbPath);
        }
    }

    if (!existsSync(dbPath)) {
        throw new Error(`Database not found: ${dbPath}`);
    }

    const db = new Database(dbPath, { readonly: true });
    
    // Enable optimizations for better performance
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    db.pragma('temp_store = MEMORY');
    db.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O
    
    // Cache the connection with metadata
    dbCache.set(dbPath, {
        db,
        lastAccessed: Date.now(),
        accessCount: 1,
        fileModified
    });

    console.log(`[SQLiteService] Opened database: ${dbPath}`);
    
    return db;
}

/**
 * Close a database connection
 */
export function closeDatabase(dbPath: string): void {
    const cached = dbCache.get(dbPath);
    if (cached) {
        cached.db.close();
        dbCache.delete(dbPath);
        console.log(`[SQLiteService] Closed database: ${dbPath} (accessed ${cached.accessCount} times)`);
    }
}

/**
 * Close all database connections
 */
export function closeAllDatabases(): void {
    let count = 0;
    for (const [path, cached] of dbCache.entries()) {
        cached.db.close();
        count++;
    }
    dbCache.clear();
    console.log(`[SQLiteService] Closed all ${count} database(s)`);
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
    count: number;
    databases: Array<{
        path: string;
        accessCount: number;
        lastAccessed: Date;
        ageMinutes: number;
    }>;
} {
    const now = Date.now();
    const databases = Array.from(dbCache.entries()).map(([path, cached]) => ({
        path,
        accessCount: cached.accessCount,
        lastAccessed: new Date(cached.lastAccessed),
        ageMinutes: Math.floor((now - cached.lastAccessed) / 60000)
    }));

    return {
        count: dbCache.size,
        databases
    };
}

// Cache of indexed tables to avoid repeated index checks
const indexedTables = new Set<string>();

// Query result cache
interface QueryCacheEntry {
    result: TableDataResponse;
    timestamp: number;
    invalidationKey: string; // Based on table modification time
}

const queryCache = new Map<string, QueryCacheEntry>();
const QUERY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000; // Max cached queries

// Prepared statement cache
const statementCache = new Map<string, any>();

// FTS5 table cache
const fts5Tables = new Set<string>();

/**
 * Ensure indices exist for a table (creates them on-demand, cached)
 */
function ensureIndices(db: Database.Database, dbPath: string, tableName: string): void {
    const cacheKey = `${dbPath}:${tableName}`;
    
    // Skip if already indexed
    if (indexedTables.has(cacheKey)) {
        return;
    }

    try {
        // Get column names
        const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
        
        let indicesCreated = 0;
        for (const col of columns) {
            const colName = col.name;
            const indexName = `idx_${tableName}_${colName}`;
            
            // Check if index exists
            const indexCheck = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='index' AND name=?
            `).get(indexName);
            
            if (!indexCheck) {
                // Try to create index (may fail if read-only, which is fine)
                try {
                    db.prepare(`CREATE INDEX IF NOT EXISTS ${indexName} ON "${tableName}"("${colName}")`).run();
                    indicesCreated++;
                } catch (error) {
                    // Index creation failed (likely read-only), continue
                }
            }
        }

        if (indicesCreated > 0) {
            console.log(`[SQLiteService] Created ${indicesCreated} index(es) for ${tableName}`);
        }
        
        // Mark as indexed
        indexedTables.add(cacheKey);
    } catch (error) {
        // If we can't create indices, that's okay - queries will still work
        console.warn(`[SQLiteService] Could not ensure indices for ${tableName}:`, error);
    }
}

/**
 * List tables in a database
 */
export function listTables(dbPath: string, config?: any): {
    tables: TableInfo[];
    type: string;
    object_type: string;
} {
    const db = getDatabase(dbPath);
    
    // Get all tables
    const tablesResult = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%' 
        ORDER BY name
    `).all() as any[];

    const tables: TableInfo[] = [];

    for (const row of tablesResult) {
        const tableName = row.name;

        // Get row count
        const countResult = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as any;
        const rowCount = countResult?.count || 0;

        // Get column count
        const columnsResult = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
        const columnCount = columnsResult.length;

        // Get display name from config if available
        const configEntry = config?.tables?.[tableName];

        tables.push({
            name: tableName,
            displayName: configEntry?.displayName || tableName,
            row_count: rowCount,
            column_count: columnCount,
            description: configEntry?.description
        });
    }

    return {
        tables,
        type: 'local_database',
        object_type: config?.id || 'LocalDatabase'
    };
}

/**
 * Generate cache key for query
 */
function getQueryCacheKey(dbPath: string, req: TableDataRequest): string {
    return `${dbPath}:${req.table_name}:${JSON.stringify(req)}`;
}

/**
 * Get invalidation key (table modification time)
 */
function getInvalidationKey(dbPath: string, tableName: string): string {
    const fileModified = getFileModifiedTime(dbPath);
    return `${dbPath}:${tableName}:${fileModified}`;
}

/**
 * Clean up old query cache entries
 */
function cleanupQueryCache(): void {
    if (queryCache.size <= MAX_CACHE_SIZE) return;

    const now = Date.now();
    const entries = Array.from(queryCache.entries());
    
    // Remove expired entries
    for (const [key, entry] of entries) {
        if (now - entry.timestamp > QUERY_CACHE_TTL) {
            queryCache.delete(key);
        }
    }

    // If still over limit, remove oldest
    if (queryCache.size > MAX_CACHE_SIZE) {
        const sorted = entries
            .filter(([_, entry]) => now - entry.timestamp <= QUERY_CACHE_TTL)
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const toRemove = sorted.slice(0, queryCache.size - MAX_CACHE_SIZE);
        for (const [key] of toRemove) {
            queryCache.delete(key);
        }
    }
}

/**
 * Ensure FTS5 table exists for text search
 */
function ensureFTS5Table(db: Database.Database, dbPath: string, tableName: string): boolean {
    const cacheKey = `${dbPath}:${tableName}`;
    if (fts5Tables.has(cacheKey)) {
        return true;
    }

    try {
        // FTS5 is usually built into SQLite, but creation may fail on read-only DBs
        // We'll try to create it and handle errors gracefully

        // Get text columns
        const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
        const textColumns = columns
            .filter(col => ['TEXT', 'VARCHAR', 'CHAR'].includes(col.type?.toUpperCase()))
            .map(col => col.name);

        if (textColumns.length === 0) {
            return false;
        }

        const fts5TableName = `${tableName}_fts5`;
        
        // Check if FTS5 table already exists
        const exists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name=?
        `).get(fts5TableName);

        if (!exists) {
            // Create FTS5 table
            const fts5Columns = textColumns.join(', ');
            const createFTS5 = `
                CREATE VIRTUAL TABLE IF NOT EXISTS "${fts5TableName}" 
                USING fts5(${fts5Columns}, content="${tableName}", content_rowid="rowid")
            `;
            db.prepare(createFTS5).run();

            // Populate FTS5 table
            const populateFTS5 = `
                INSERT INTO "${fts5TableName}"(rowid, ${fts5Columns})
                SELECT rowid, ${fts5Columns} FROM "${tableName}"
            `;
            db.prepare(populateFTS5).run();

            console.log(`[SQLiteService] Created FTS5 table for ${tableName}`);
        }

        fts5Tables.add(cacheKey);
        return true;
    } catch (error) {
        console.warn(`[SQLiteService] Could not create FTS5 table for ${tableName}:`, error);
        return false;
    }
}

/**
 * Get table data with pagination, sorting, and filtering
 */
export function getTableData(
    dbPath: string,
    req: TableDataRequest
): TableDataResponse {
    const startTime = Date.now();
    
    // Check query cache
    const cacheKey = getQueryCacheKey(dbPath, req);
    const invalidationKey = getInvalidationKey(dbPath, req.table_name);
    const cached = queryCache.get(cacheKey);
    
    if (cached && cached.invalidationKey === invalidationKey) {
        const age = Date.now() - cached.timestamp;
        if (age < QUERY_CACHE_TTL) {
            return {
                ...cached.result,
                cached: true,
                execution_time_ms: Date.now() - startTime
            };
        }
    }

    cleanupQueryCache();

    const db = getDatabase(dbPath);
    const tableName = req.table_name;
    const limit = Math.min(req.limit || 100, 2000); // Increased for 20-200MB DBs
    const offset = req.offset || 0;

    // Ensure indices exist for better performance
    ensureIndices(db, dbPath, tableName);

    // Build column list
    let columnList = '*';
    if (req.columns && req.columns.length > 0) {
        columnList = req.columns.map(c => `"${c}"`).join(', ');
    }

    // Handle aggregations
    if (req.aggregations && req.aggregations.length > 0) {
        return getAggregatedData(db, dbPath, req, startTime);
    }

    // Build WHERE clause for filters
    const whereClauses: string[] = [];
    const params: any[] = [];

    // Advanced filters
    if (req.filters && req.filters.length > 0) {
        const filterClauses = buildAdvancedFilters(db, tableName, req.filters, params);
        whereClauses.push(...filterClauses);
    }

    // Legacy search_value (use FTS5 if available)
    if (req.search_value && req.search_value.trim()) {
        const hasFTS5 = ensureFTS5Table(db, dbPath, tableName);
        
        if (hasFTS5) {
            // Use FTS5 for fast text search
            const fts5TableName = `${tableName}_fts5`;
            whereClauses.push(`rowid IN (SELECT rowid FROM "${fts5TableName}" WHERE "${fts5TableName}" MATCH ?)`);
            params.push(req.search_value);
        } else {
            // Fallback to LIKE search
            const columnsResult = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
            if (columnsResult.length > 0) {
                const searchClauses = columnsResult.map((col) => {
                    const colName = col.name;
                    return `CAST("${colName}" AS TEXT) LIKE ?`;
                });
                whereClauses.push(`(${searchClauses.join(' OR ')})`);
                const searchPattern = `%${req.search_value}%`;
                for (let i = 0; i < columnsResult.length; i++) {
                    params.push(searchPattern);
                }
            }
        }
    }

    // Legacy col_filter (simple LIKE)
    if (req.col_filter) {
        for (const [col, value] of Object.entries(req.col_filter)) {
            if (value !== undefined && value !== null && value !== '') {
                whereClauses.push(`CAST("${col}" AS TEXT) LIKE ?`);
                params.push(`%${String(value)}%`);
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

    // Get total count (with filters) using prepared statement cache
    const countSql = `SELECT COUNT(*) as count FROM "${tableName}" ${whereClause}`;
    let countStmt = statementCache.get(countSql);
    if (!countStmt) {
        countStmt = db.prepare(countSql);
        statementCache.set(countSql, countStmt);
    }
    const countResult = countStmt.get(...params) as any;
    const totalCount = countResult?.count || 0;

    // Get data using prepared statement cache
    const dataSql = `SELECT ${columnList} FROM "${tableName}" ${whereClause} ${orderByClause} LIMIT ? OFFSET ?`;
    
    let dataStmt = statementCache.get(dataSql);
    if (!dataStmt) {
        dataStmt = db.prepare(dataSql);
        statementCache.set(dataSql, dataStmt);
    }

    const dataParams = [...params, limit, offset];
    const rows = dataStmt.all(...dataParams) as any[];

    // Get headers from first row or table schema
    let headers: string[] = [];
    if (rows.length > 0) {
        headers = Object.keys(rows[0]);
    } else {
        // No data, get headers from schema
        const columnsResult = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
        headers = columnsResult.map(col => col.name);
    }

    // Convert rows to arrays
    const data = rows.map(row => {
        return headers.map(header => row[header]);
    });

    const result: TableDataResponse = {
        headers,
        data,
        total_count: totalCount,
        cached: false,
        execution_time_ms: Date.now() - startTime
    };

    // Cache the result
    queryCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
        invalidationKey
    });

    return result;
}

/**
 * Build advanced filter clauses
 */
function buildAdvancedFilters(
    db: Database.Database,
    tableName: string,
    filters: AdvancedFilter[],
    params: any[]
): string[] {
    const clauses: string[] = [];

    for (const filter of filters) {
        const { column, operator, value, value2 } = filter;
        
        let clause = '';
        switch (operator) {
            case 'eq':
                clause = `"${column}" = ?`;
                params.push(value);
                break;
            case 'ne':
                clause = `"${column}" != ?`;
                params.push(value);
                break;
            case 'gt':
                clause = `"${column}" > ?`;
                params.push(value);
                break;
            case 'gte':
                clause = `"${column}" >= ?`;
                params.push(value);
                break;
            case 'lt':
                clause = `"${column}" < ?`;
                params.push(value);
                break;
            case 'lte':
                clause = `"${column}" <= ?`;
                params.push(value);
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
                if (value2 !== undefined) {
                    clause = `"${column}" BETWEEN ? AND ?`;
                    params.push(value, value2);
                }
                break;
            case 'is_null':
                clause = `"${column}" IS NULL`;
                break;
            case 'is_not_null':
                clause = `"${column}" IS NOT NULL`;
                break;
            case 'regex':
                clause = `"${column}" REGEXP ?`;
                params.push(value);
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
function getAggregatedData(
    db: Database.Database,
    dbPath: string,
    req: TableDataRequest,
    startTime: number
): TableDataResponse {
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

    if (req.filters && req.filters.length > 0) {
        const filterClauses = buildAdvancedFilters(db, tableName, req.filters, params);
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

    // Get or create prepared statement
    let stmt = statementCache.get(sql);
    if (!stmt) {
        stmt = db.prepare(sql);
        statementCache.set(sql, stmt);
    }

    const rows = stmt.all(...queryParams) as any[];

    // Get headers
    const headers: string[] = [];
    if (rows.length > 0) {
        headers.push(...Object.keys(rows[0]));
    } else {
        // Get headers from group_by and aggregations
        if (req.group_by) headers.push(...req.group_by);
        if (req.aggregations) {
            req.aggregations.forEach(agg => {
                headers.push(agg.alias || `${agg.function}_${agg.column}`);
            });
        }
    }

    // Convert to arrays
    const data = rows.map(row => headers.map(h => row[h]));

    // Get total count
    const countSql = `SELECT COUNT(*) as count FROM (SELECT ${selectClause} FROM "${tableName}" ${whereClause} ${groupByClause})`;
    const countStmt = db.prepare(countSql);
    const countResult = countStmt.get(...params) as any;
    const totalCount = countResult?.count || rows.length;

    return {
        headers,
        data,
        total_count: totalCount,
        cached: false,
        execution_time_ms: Date.now() - startTime
    };
}
