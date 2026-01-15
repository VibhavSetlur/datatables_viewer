/**
 * Object-based REST API Routes
 * 
 * Provides TableScanner-compatible path-based REST API:
 * - GET /object/{db_name}/tables - List tables
 * - GET /object/{db_name}/tables/{table_name}/data - Get table data
 * 
 * This matches TableScanner's API structure for easy integration
 */

import { Router, Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { listTables, getTableData } from '../services/sqlite-service.js';
import { resolveConfig } from '../services/config-resolver.js';
import { getColumnStats } from '../services/column-stats.js';

export function createObjectsRouter(dataDir: string, configDir: string) {
    const router = Router();

    /**
     * GET /object/{db_name}/tables
     * List all tables in a database (TableScanner-compatible)
     */
    router.get('/:db_name/tables', async (req: Request, res: Response) => {
        try {
            const { db_name } = req.params;
            
            // Remove .db extension if provided
            const baseName = db_name.endsWith('.db') 
                ? db_name.replace('.db', '') 
                : db_name;
            
            const dbPath = join(dataDir, `${baseName}.db`);

            if (!existsSync(dbPath)) {
                return res.status(404).json({
                    error: 'Database not found',
                    db_name: baseName,
                });
            }

            // Try to load config for better table info
            let config: any = null;
            const configPath = join(configDir, `${baseName}.json`);
            if (existsSync(configPath)) {
                try {
                    const configContent = await readFile(configPath, 'utf-8');
                    config = JSON.parse(configContent);
                } catch (error) {
                    console.warn(`[Objects API] Failed to load config for ${baseName}:`, error);
                }
            }

            // Get table list
            const result = listTables(dbPath, config);

            // Resolve config for object type detection
            const configResult = await resolveConfig(dbPath, baseName, {
                objectType: result.object_type,
                sourceRef: `local/${baseName}`
            });

            // Return in TableScanner-compatible format
            res.json({
                berdl_table_id: `local/${baseName}`,
                object_type: configResult.config.id || result.object_type,
                tables: result.tables.map(t => ({
                    name: t.name,
                    displayName: t.displayName || t.name,
                    row_count: t.row_count,
                    column_count: t.column_count,
                    description: t.description
                })),
                source: 'Local',
                has_config: configResult.source !== 'default',
                config_source: configResult.source
            });
        } catch (error: any) {
            console.error('[Objects API] Error listing tables:', error);
            res.status(500).json({
                error: 'Failed to list tables',
                message: error.message,
            });
        }
    });

    /**
     * GET /object/{db_name}/tables/{table_name}/data
     * Get table data with query parameters (TableScanner-compatible)
     */
    router.get('/:db_name/tables/:table_name/data', async (req: Request, res: Response) => {
        try {
            const { db_name, table_name } = req.params;
            
            // Remove .db extension if provided
            const baseName = db_name.endsWith('.db') 
                ? db_name.replace('.db', '') 
                : db_name;
            
            const dbPath = join(dataDir, `${baseName}.db`);

            if (!existsSync(dbPath)) {
                return res.status(404).json({
                    error: 'Database not found',
                    db_name: baseName,
                });
            }

            // Parse query parameters
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
            const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
            const columns = req.query.columns 
                ? (req.query.columns as string).split(',').map(c => c.trim())
                : undefined;
            const sort_column = req.query.sort_column as string | undefined;
            const sort_order = (req.query.sort_order as 'ASC' | 'DESC') || 'ASC';
            const search_value = req.query.search_value as string | undefined;

            // Build column filters from query params
            const col_filter: Record<string, any> = {};
            Object.keys(req.query).forEach(key => {
                if (key.startsWith('filter_')) {
                    const colName = key.replace('filter_', '');
                    col_filter[colName] = req.query[key];
                }
            });

            // Get table data
            const result = getTableData(dbPath, {
                table_name,
                limit,
                offset,
                columns,
                sort_column: sort_column || null,
                sort_order,
                search_value,
                col_filter: Object.keys(col_filter).length > 0 ? col_filter : undefined
            });

            // Return in TableScanner-compatible format
            res.json({
                headers: result.headers,
                data: result.data,
                total_count: result.total_count,
                limit,
                offset,
                cached: result.cached || false,
                execution_time_ms: result.execution_time_ms
            });
        } catch (error: any) {
            console.error('[Objects API] Error getting table data:', error);
            res.status(500).json({
                error: 'Failed to get table data',
                message: error.message,
            });
        }
    });

    /**
     * GET /object/{db_name}/tables/{table_name}/stats
     * Get column statistics for a table
     */
    router.get('/:db_name/tables/:table_name/stats', async (req: Request, res: Response) => {
        try {
            const { db_name, table_name } = req.params;
            
            const baseName = db_name.endsWith('.db') 
                ? db_name.replace('.db', '') 
                : db_name;
            
            const dbPath = join(dataDir, `${baseName}.db`);

            if (!existsSync(dbPath)) {
                return res.status(404).json({
                    error: 'Database not found',
                    db_name: baseName,
                });
            }

            const stats = getColumnStats(dbPath, table_name);
            res.json(stats);
        } catch (error: any) {
            console.error('[Objects API] Error getting stats:', error);
            res.status(500).json({
                error: 'Failed to get statistics',
                message: error.message,
            });
        }
    });

    return router;
}
