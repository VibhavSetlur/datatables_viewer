/**
 * Column Statistics Service
 * 
 * Pre-computes and caches column statistics for data exploration
 */

import { getDatabase } from './sqlite-service.js';
import { existsSync, statSync } from 'fs';

interface ColumnStats {
    column: string;
    type: string;
    null_count: number;
    distinct_count: number;
    min?: any;
    max?: any;
    mean?: number;
    median?: number;
    stddev?: number;
    sample_values?: any[];
}

interface TableStats {
    table: string;
    row_count: number;
    columns: ColumnStats[];
    last_updated: number;
}

// Cache of table statistics
const statsCache = new Map<string, TableStats>();

/**
 * Get column statistics for a table
 */
export function getColumnStats(dbPath: string, tableName: string): TableStats {
    const cacheKey = `${dbPath}:${tableName}`;
    const fileModified = statSync(dbPath).mtime.getTime();
    
    const cached = statsCache.get(cacheKey);
    if (cached && cached.last_updated === fileModified) {
        return cached;
    }

    const db = getDatabase(dbPath);
    
    // Get row count
    const rowCountResult = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as any;
    const rowCount = rowCountResult?.count || 0;

    // Get column info
    const columnsInfo = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
    
    const columnStats: ColumnStats[] = [];

    for (const colInfo of columnsInfo) {
        const colName = colInfo.name;
        const colType = colInfo.type?.toUpperCase() || 'TEXT';
        
        const stats: ColumnStats = {
            column: colName,
            type: colType,
            null_count: 0,
            distinct_count: 0
        };

        // Get null count
        const nullCountResult = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}" WHERE "${colName}" IS NULL`).get() as any;
        stats.null_count = nullCountResult?.count || 0;

        // Get distinct count
        const distinctResult = db.prepare(`SELECT COUNT(DISTINCT "${colName}") as count FROM "${tableName}"`).get() as any;
        stats.distinct_count = distinctResult?.count || 0;

        // For numeric columns, get statistics
        if (['INTEGER', 'REAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].includes(colType)) {
            try {
                const numericStats = db.prepare(`
                    SELECT 
                        MIN("${colName}") as min_val,
                        MAX("${colName}") as max_val,
                        AVG("${colName}") as mean_val
                    FROM "${tableName}"
                    WHERE "${colName}" IS NOT NULL
                `).get() as any;

                stats.min = numericStats?.min_val;
                stats.max = numericStats?.max_val;
                stats.mean = numericStats?.mean_val ? parseFloat(numericStats.mean_val) : undefined;

                // Calculate stddev approximation
                if (stats.mean !== undefined) {
                    const varianceResult = db.prepare(`
                        SELECT AVG(("${colName}" - ?) * ("${colName}" - ?)) as variance
                        FROM "${tableName}"
                        WHERE "${colName}" IS NOT NULL
                    `).get(stats.mean, stats.mean) as any;
                    
                    if (varianceResult?.variance) {
                        stats.stddev = Math.sqrt(parseFloat(varianceResult.variance));
                    }
                }

                // Get median (approximate)
                if (rowCount > 0) {
                    const medianResult = db.prepare(`
                        SELECT "${colName}" as median_val
                        FROM "${tableName}"
                        WHERE "${colName}" IS NOT NULL
                        ORDER BY "${colName}"
                        LIMIT 1 OFFSET ?
                    `).get(Math.floor((rowCount - stats.null_count) / 2)) as any;
                    stats.median = medianResult?.median_val;
                }
            } catch (error) {
                // Skip numeric stats if calculation fails
            }
        }

        // Get sample values (first 10 non-null values)
        try {
            const samples = db.prepare(`
                SELECT DISTINCT "${colName}" as sample
                FROM "${tableName}"
                WHERE "${colName}" IS NOT NULL
                LIMIT 10
            `).all() as any[];
            stats.sample_values = samples.map(s => s.sample);
        } catch (error) {
            stats.sample_values = [];
        }

        columnStats.push(stats);
    }

    const tableStats: TableStats = {
        table: tableName,
        row_count: rowCount,
        columns: columnStats,
        last_updated: fileModified
    };

    statsCache.set(cacheKey, tableStats);
    return tableStats;
}

/**
 * Clear statistics cache
 */
export function clearStatsCache(dbPath?: string): void {
    if (dbPath) {
        const keys = Array.from(statsCache.keys()).filter(k => k.startsWith(dbPath));
        keys.forEach(k => statsCache.delete(k));
    } else {
        statsCache.clear();
    }
}
