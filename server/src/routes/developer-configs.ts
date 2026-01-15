/**
 * Developer Config Sync Routes
 * 
 * Endpoints for syncing developer-edited JSON configs to the database
 */

import { Router, Request, Response } from 'express';
import { join } from 'path';
import { syncDeveloperConfig, syncDeveloperConfigs } from '../services/developer-config-sync.js';

export function createDeveloperConfigsRouter(configDir: string) {
    const router = Router();

    /**
     * POST /api/developer-configs/sync
     * Sync all developer configs from the config directory
     */
    router.post('/sync', async (req: Request, res: Response) => {
        try {
            const { force = false, pattern } = req.body;

            const results = await syncDeveloperConfigs(configDir, {
                force: force === true,
                pattern
            });

            const summary = {
                total: results.length,
                synced: results.filter(r => r.status === 'synced').length,
                updated: results.filter(r => r.status === 'updated').length,
                skipped: results.filter(r => r.status === 'skipped').length,
                errors: results.filter(r => r.status === 'error').length,
                results
            };

            res.json(summary);
        } catch (error: any) {
            console.error('[Developer Configs] Error syncing:', error);
            res.status(500).json({
                error: 'Failed to sync developer configs',
                message: error.message,
            });
        }
    });

    /**
     * POST /api/developer-configs/sync/:filename
     * Sync a specific developer config file
     */
    router.post('/sync/:filename', async (req: Request, res: Response) => {
        try {
            const { filename } = req.params;
            const { force = false } = req.body;

            const configPath = join(configDir, filename.endsWith('.json') ? filename : `${filename}.json`);

            const result = await syncDeveloperConfig(configPath, {
                force: force === true
            });

            if (result.status === 'error') {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error: any) {
            console.error('[Developer Configs] Error syncing file:', error);
            res.status(500).json({
                error: 'Failed to sync developer config',
                message: error.message,
            });
        }
    });

    return router;
}
