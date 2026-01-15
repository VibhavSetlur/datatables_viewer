/**
 * Schema Lookup Routes
 * 
 * Provides schema information for tables and columns
 */

import { Router, Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { getDatabase } from '../services/sqlite-service.js';

export function createSchemaRouter(dataDir: string) {
    const router = Router();

    /**
     * GET /schema/{db_name}/tables/{table_name}
     * Get schema information for a table
     */
    router.get('/:db_name/tables/:table_name', (req: Request, res: Response) => {
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

            const db = getDatabase(dbPath);
            
            // Get table schema
            const columns = db.prepare(`PRAGMA table_info("${table_name}")`).all() as any[];
            
            const schema = columns.map(col => ({
                name: col.name,
                type: col.type,
                notnull: col.notnull === 1,
                dflt_value: col.dflt_value,
                pk: col.pk === 1
            }));

            // Get indexes
            const indexes = db.prepare(`
                SELECT name, sql FROM sqlite_master 
                WHERE type='index' AND tbl_name=?
            `).all(table_name) as any[];

            res.json({
                table: table_name,
                columns: schema,
                indexes: indexes.map(idx => ({
                    name: idx.name,
                    sql: idx.sql
                }))
            });
        } catch (error: any) {
            console.error('[Schema API] Error:', error);
            res.status(500).json({
                error: 'Failed to get schema',
                message: error.message,
            });
        }
    });

    /**
     * GET /schema/{db_name}/tables
     * Get all table schemas
     */
    router.get('/:db_name/tables', (req: Request, res: Response) => {
        try {
            const { db_name } = req.params;
            
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

            const db = getDatabase(dbPath);
            
            // Get all tables
            const tables = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            `).all() as any[];

            const schemas: any[] = [];

            for (const table of tables) {
                const tableName = table.name;
                const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
                
                schemas.push({
                    table: tableName,
                    columns: columns.map(col => ({
                        name: col.name,
                        type: col.type,
                        notnull: col.notnull === 1,
                        dflt_value: col.dflt_value,
                        pk: col.pk === 1
                    }))
                });
            }

            res.json({
                database: baseName,
                tables: schemas
            });
        } catch (error: any) {
            console.error('[Schema API] Error:', error);
            res.status(500).json({
                error: 'Failed to get schemas',
                message: error.message,
            });
        }
    });

    return router;
}
