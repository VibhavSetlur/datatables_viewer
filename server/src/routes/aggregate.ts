/**
 * Aggregation Routes
 * 
 * Provides aggregation query endpoints for statistical analysis
 */

import { Router, Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { getTableData } from '../services/sqlite-service.js';

export function createAggregateRouter(dataDir: string) {
    const router = Router();

    /**
     * POST /api/aggregate/{db_name}/tables/{table_name}
     * Get aggregated data with grouping and statistical functions
     */
    router.post('/:db_name/tables/:table_name', async (req: Request, res: Response) => {
        try {
            const { db_name, table_name } = req.params;
            const {
                group_by,
                aggregations,
                filters,
                limit = 100,
                offset = 0,
                sort_column,
                sort_order = 'ASC'
            } = req.body;

            if (!aggregations || aggregations.length === 0) {
                return res.status(400).json({
                    error: 'Missing required field: aggregations'
                });
            }

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

            const result = getTableData(dbPath, {
                table_name,
                group_by,
                aggregations,
                filters,
                limit,
                offset,
                sort_column,
                sort_order
            });

            res.json(result);
        } catch (error: any) {
            console.error('[Aggregate API] Error:', error);
            res.status(500).json({
                error: 'Failed to get aggregated data',
                message: error.message,
            });
        }
    });

    return router;
}
