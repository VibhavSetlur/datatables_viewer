/**
 * Config Generation Routes
 * 
 * TableScanner-compatible config generation endpoints
 */

import { Router, Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { generateConfig } from '../services/config-generator.js';

export function createConfigGenerationRouter(dataDir: string) {
    const router = Router();

    /**
     * POST /object/{db_name}/config/generate
     * Generate configuration for a database (TableScanner-compatible)
     */
    router.post('/:db_name/config/generate', async (req: Request, res: Response) => {
        try {
            const { db_name } = req.params;
            const {
                force_regenerate = false,
                ai_provider = 'auto',
                object_type,
                source_ref
            } = req.body;

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

            // Generate config
            const result = await generateConfig(dbPath, {
                forceRegenerate: force_regenerate,
                aiProvider: ai_provider,
                objectType: object_type,
                sourceRef: source_ref || `local/${baseName}`
            });

            if (result.status === 'error') {
                return res.status(500).json({
                    error: 'Failed to generate config',
                    message: result.fallback_reason,
                    result
                });
            }

            // Return in TableScanner-compatible format
            res.json({
                status: result.status,
                fingerprint: result.fingerprint,
                config_url: `/api/configs/${result.config_id}`,
                config: result.config,
                fallback_used: result.fallback_used,
                fallback_reason: result.fallback_reason,
                config_source: result.config_source,
                tables_analyzed: result.tables_analyzed,
                columns_inferred: result.columns_inferred,
                total_rows: result.total_rows,
                ai_provider_used: result.ai_provider_used,
                ai_available: result.ai_available,
                ai_error: result.ai_error,
                generation_time_ms: result.generation_time_ms,
                cache_hit: result.cache_hit,
                object_type: result.object_type,
                object_ref: result.config_id,
                api_version: '1.0.0'
            });
        } catch (error: any) {
            console.error('[Config Generation] Error:', error);
            res.status(500).json({
                error: 'Failed to generate config',
                message: error.message,
            });
        }
    });

    return router;
}
