/**
 * Database File Routes
 * 
 * Serves database files (.db) and their associated JSON metadata files (.json)
 * from a mounted directory shared between native OS and Jupyter
 */

import { Router, Request, Response } from 'express';
import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, basename } from 'path';
import { existsSync } from 'fs';

export function serveDatabaseFiles(dataDir: string, configDir: string) {
    const router = Router();

    /**
     * GET /api/databases
     * List all available database files
     */
    router.get('/', async (req: Request, res: Response) => {
        try {
            if (!existsSync(dataDir)) {
                return res.json({ databases: [] });
            }

            const files = await readdir(dataDir);
            const databases = [];

            for (const file of files) {
                if (file.endsWith('.db')) {
                    const dbPath = join(dataDir, file);
                    const stats = await stat(dbPath);
                    const baseName = basename(file, '.db');
                    const jsonPath = join(dataDir, `${baseName}.json`);
                    const configPath = join(configDir, `${baseName}.json`);

                    databases.push({
                        filename: file,
                        basename: baseName,
                        size: stats.size,
                        modified: stats.mtime.toISOString(),
                        has_metadata: existsSync(jsonPath),
                        has_config: existsSync(configPath),
                        db_url: `/data/${file}`,
                        metadata_url: existsSync(jsonPath) ? `/data/${baseName}.json` : null,
                        config_url: existsSync(configPath) ? `/config/${baseName}.json` : null,
                    });
                }
            }

            res.json({ databases });
        } catch (error: any) {
            console.error('[Databases API] Error listing databases:', error);
            res.status(500).json({
                error: 'Failed to list databases',
                message: error.message,
            });
        }
    });

    /**
     * GET /api/databases/:filename
     * Get information about a specific database file
     */
    router.get('/:filename', async (req: Request, res: Response) => {
        try {
            const { filename } = req.params;
            
            // Remove .db extension if provided
            const baseName = filename.endsWith('.db') ? basename(filename, '.db') : filename;
            const dbPath = join(dataDir, `${baseName}.db`);
            const jsonPath = join(dataDir, `${baseName}.json`);
            const configPath = join(configDir, `${baseName}.json`);

            if (!existsSync(dbPath)) {
                return res.status(404).json({
                    error: 'Database not found',
                    filename: `${baseName}.db`,
                });
            }

            const stats = await stat(dbPath);
            let metadata = null;
            let config = null;

            // Try to load metadata JSON
            if (existsSync(jsonPath)) {
                try {
                    const metadataContent = await readFile(jsonPath, 'utf-8');
                    metadata = JSON.parse(metadataContent);
                } catch (error) {
                    console.warn(`[Databases API] Failed to parse metadata for ${baseName}:`, error);
                }
            }

            // Try to load config JSON
            if (existsSync(configPath)) {
                try {
                    const configContent = await readFile(configPath, 'utf-8');
                    config = JSON.parse(configContent);
                } catch (error) {
                    console.warn(`[Databases API] Failed to parse config for ${baseName}:`, error);
                }
            }

            res.json({
                filename: `${baseName}.db`,
                basename: baseName,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                db_url: `/data/${baseName}.db`,
                metadata: metadata,
                metadata_url: existsSync(jsonPath) ? `/data/${baseName}.json` : null,
                config: config,
                config_url: existsSync(configPath) ? `/config/${baseName}.json` : null,
            });
        } catch (error: any) {
            console.error('[Databases API] Error getting database:', error);
            res.status(500).json({
                error: 'Failed to get database info',
                message: error.message,
            });
        }
    });

    /**
     * GET /api/databases/:filename/metadata
     * Get metadata JSON for a database
     */
    router.get('/:filename/metadata', async (req: Request, res: Response) => {
        try {
            const { filename } = req.params;
            const baseName = filename.endsWith('.db') ? basename(filename, '.db') : filename;
            const jsonPath = join(dataDir, `${baseName}.json`);

            if (!existsSync(jsonPath)) {
                return res.status(404).json({
                    error: 'Metadata not found',
                    filename: `${baseName}.json`,
                });
            }

            const metadataContent = await readFile(jsonPath, 'utf-8');
            const metadata = JSON.parse(metadataContent);

            res.json(metadata);
        } catch (error: any) {
            console.error('[Databases API] Error getting metadata:', error);
            res.status(500).json({
                error: 'Failed to get metadata',
                message: error.message,
            });
        }
    });

    /**
     * GET /api/databases/:filename/config
     * Get config JSON for a database
     */
    router.get('/:filename/config', async (req: Request, res: Response) => {
        try {
            const { filename } = req.params;
            const baseName = filename.endsWith('.db') ? basename(filename, '.db') : filename;
            const configPath = join(configDir, `${baseName}.json`);

            if (!existsSync(configPath)) {
                return res.status(404).json({
                    error: 'Config not found',
                    filename: `${baseName}.json`,
                });
            }

            const configContent = await readFile(configPath, 'utf-8');
            const config = JSON.parse(configContent);

            res.json(config);
        } catch (error: any) {
            console.error('[Databases API] Error getting config:', error);
            res.status(500).json({
                error: 'Failed to get config',
                message: error.message,
            });
        }
    });

    return router;
}
