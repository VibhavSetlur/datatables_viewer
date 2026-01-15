/**
 * Table Data POST Endpoint
 * 
 * Provides TableScanner-compatible POST endpoint for programmatic queries:
 * POST /table-data
 * 
 * This matches TableScanner's flat POST API structure
 */

import { Router, Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { getTableData } from '../services/sqlite-service.js';

export function createTableDataRouter(dataDir: string, configDir: string) {
    const router = Router();

    /**
     * POST /table-data
     * Query table data programmatically (TableScanner-compatible)
     */
    router.post('/', async (req: Request, res: Response) => {
        try {
            const {
                berdl_table_id,
                table_name,
                limit = 100,
                offset = 0,
                columns,
                sort_column,
                sort_order = 'ASC',
                search_value,
                col_filter,
                kb_env // Ignored for local databases
            } = req.body;

            if (!berdl_table_id || !table_name) {
                return res.status(400).json({
                    error: 'Missing required fields: berdl_table_id and table_name are required'
                });
            }

            // Handle local database IDs (format: local/db_name)
            let dbPath: string;
            if (berdl_table_id.startsWith('local/')) {
                const dbName = berdl_table_id.replace('local/', '');
                dbPath = join(dataDir, `${dbName}.db`);
            } else {
                // For non-local databases, we'd need to fetch from KBase
                // For now, return error
                return res.status(400).json({
                    error: 'Only local databases are supported. Use format: local/db_name'
                });
            }

            if (!existsSync(dbPath)) {
                return res.status(404).json({
                    error: 'Database not found',
                    berdl_table_id,
                    db_path: dbPath
                });
            }

            // Get table data
            const result = getTableData(dbPath, {
                table_name,
                limit: typeof limit === 'number' ? limit : parseInt(limit),
                offset: typeof offset === 'number' ? offset : parseInt(offset),
                columns: Array.isArray(columns) ? columns : undefined,
                sort_column: sort_column || null,
                sort_order: sort_order as 'ASC' | 'DESC',
                search_value,
                col_filter
            });

            // Return in TableScanner-compatible format
            res.json({
                headers: result.headers,
                data: result.data,
                total_count: result.total_count,
                limit: result.data.length,
                offset,
                cached: result.cached || false,
                execution_time_ms: result.execution_time_ms
            });
        } catch (error: any) {
            console.error('[Table Data API] Error:', error);
            res.status(500).json({
                error: 'Failed to get table data',
                message: error.message,
            });
        }
    });

    return router;
}
