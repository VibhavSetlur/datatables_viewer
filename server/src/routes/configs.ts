/**
 * Config API Routes
 * 
 * REST API endpoints for config management
 */

import { Router, Request, Response } from 'express';
import {
    createConfig,
    getConfigById,
    getConfigByObjectType,
    configExists,
    updateConfig,
    listConfigs,
    deleteConfig,
    updateConfigState,
    getConfigsByState,
} from '../services/config-service.js';
import { validateConfig } from '../services/validator.js';
import type { DataTypeConfig } from '../types.js';

const router = Router();

/**
 * POST /api/configs
 * Create or update a config
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const {
            object_type,
            source_ref,
            config,
            source = 'ai_generated',
            fingerprint,
            ai_provider,
            confidence,
            generation_time_ms,
        } = req.body;

        // Validate required fields
        if (!object_type || !config) {
            return res.status(400).json({
                error: 'Missing required fields: object_type and config are required',
            });
        }

        // Validate config structure
        const validation = validateConfig(config);
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Invalid config structure',
                validation_errors: validation.errors,
            });
        }

        // Check if config already exists
        const existing = getConfigByObjectType(object_type);
        
        if (existing) {
            // Update existing config
            const updated = updateConfig(existing.id, {
                config,
                updated_by: 'system',
                change_summary: `Updated from ${source}`,
            });

            if (!updated) {
                return res.status(500).json({ error: 'Failed to update config' });
            }

            return res.status(200).json({
                status: 'updated',
                config_id: updated.id,
                object_type: updated.object_type,
            });
        }

        // Create new config
        const record = createConfig({
            object_type,
            source_ref,
            config,
            source,
            fingerprint,
            ai_provider,
            confidence,
            generation_time_ms,
        });

        res.status(201).json({
            status: 'stored',
            config_id: record.id,
            object_type: record.object_type,
        });
    } catch (error: any) {
        console.error('[Configs API] Error creating config:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * GET /api/configs/check
 * Check if config exists for object_type
 */
router.get('/check', (req: Request, res: Response) => {
    try {
        const { object_type } = req.query;

        if (!object_type || typeof object_type !== 'string') {
            return res.status(400).json({
                error: 'Missing required query parameter: object_type',
            });
        }

        const exists = configExists(object_type);
        const config = exists ? getConfigByObjectType(object_type) : null;

        res.json({
            exists,
            object_type,
            config_id: config?.id || null,
        });
    } catch (error: any) {
        console.error('[Configs API] Error checking config:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * GET /api/configs
 * Get config by object_type or list all configs
 */
router.get('/', (req: Request, res: Response) => {
    try {
        const { object_type } = req.query;

        if (object_type && typeof object_type === 'string') {
            // Get specific config
            const config = getConfigByObjectType(object_type);
            
            if (!config) {
                return res.status(404).json({
                    error: 'Config not found',
                    object_type,
                });
            }

            const configData: DataTypeConfig = JSON.parse(config.config_json);
            
            res.json({
                config: configData,
                object_type: config.object_type,
                source: config.source,
                created_at: config.created_at,
                updated_at: config.updated_at,
                config_id: config.id,
                version: config.version,
            });
        } else {
            // List all configs
            const { limit, offset, state } = req.query;
            const result = listConfigs({
                limit: limit ? parseInt(limit as string) : undefined,
                offset: offset ? parseInt(offset as string) : undefined,
                state: state as string,
            });

            res.json({
                configs: result.configs.map(c => ({
                    id: c.id,
                    object_type: c.object_type,
                    source_ref: c.source_ref,
                    source: c.source,
                    created_at: c.created_at,
                    updated_at: c.updated_at,
                    version: c.version,
                    state: c.state,
                })),
                total: result.total,
            });
        }
    } catch (error: any) {
        console.error('[Configs API] Error getting config:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * GET /api/configs/:id
 * Get config by ID
 */
router.get('/:id', (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const config = getConfigById(id);

        if (!config) {
            return res.status(404).json({
                error: 'Config not found',
                config_id: id,
            });
        }

        const configData: DataTypeConfig = JSON.parse(config.config_json);

        res.json({
            config: configData,
            object_type: config.object_type,
            source: config.source,
            created_at: config.created_at,
            updated_at: config.updated_at,
            config_id: config.id,
            version: config.version,
            fingerprint: config.fingerprint,
            ai_provider: config.ai_provider,
            confidence: config.confidence,
        });
    } catch (error: any) {
        console.error('[Configs API] Error getting config by ID:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * PUT /api/configs/:id
 * Update an existing config
 */
router.put('/:id', (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { config, updated_by, change_summary } = req.body;

        if (!config) {
            return res.status(400).json({
                error: 'Missing required field: config',
            });
        }

        // Validate config structure
        const validation = validateConfig(config);
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Invalid config structure',
                validation_errors: validation.errors,
            });
        }

        const updated = updateConfig(id, {
            config,
            updated_by: updated_by || 'developer',
            change_summary: change_summary || 'Manual update',
        });

        if (!updated) {
            return res.status(404).json({
                error: 'Config not found',
                config_id: id,
            });
        }

        res.json({
            status: 'updated',
            config_id: updated.id,
            object_type: updated.object_type,
            version: updated.version,
        });
    } catch (error: any) {
        console.error('[Configs API] Error updating config:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * DELETE /api/configs/:id
 * Soft delete a config (archive it)
 */
router.delete('/:id', (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const deleted = deleteConfig(id);

        if (!deleted) {
            return res.status(404).json({
                error: 'Config not found',
                config_id: id,
            });
        }

        res.json({
            status: 'deleted',
            config_id: id,
        });
    } catch (error: any) {
        console.error('[Configs API] Error deleting config:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * PUT /api/configs/:id/state
 * Update config lifecycle state (draft → proposed → published)
 */
router.put('/:id/state', (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { state, updated_by } = req.body;

        if (!state || !['draft', 'proposed', 'published', 'archived'].includes(state)) {
            return res.status(400).json({
                error: 'Invalid state. Must be: draft, proposed, published, or archived',
            });
        }

        const updated = updateConfigState(id, state, updated_by || 'system');

        if (!updated) {
            return res.status(404).json({
                error: 'Config not found',
                config_id: id,
            });
        }

        res.json({
            status: 'updated',
            config_id: updated.id,
            state: updated.state,
            version: updated.version,
        });
    } catch (error: any) {
        console.error('[Configs API] Error updating state:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * GET /api/configs/state/:state
 * Get configs by lifecycle state
 */
router.get('/state/:state', (req: Request, res: Response) => {
    try {
        const { state } = req.params;
        const { limit, offset } = req.query;

        if (!['draft', 'proposed', 'published', 'archived'].includes(state)) {
            return res.status(400).json({
                error: 'Invalid state. Must be: draft, proposed, published, or archived',
            });
        }

        const result = getConfigsByState(state as any, {
            limit: limit ? parseInt(limit as string) : undefined,
            offset: offset ? parseInt(offset as string) : undefined,
        });

        res.json({
            configs: result.configs.map(c => ({
                id: c.id,
                object_type: c.object_type,
                source_ref: c.source_ref,
                source: c.source,
                created_at: c.created_at,
                updated_at: c.updated_at,
                version: c.version,
                state: c.state,
            })),
            total: result.total,
            state,
        });
    } catch (error: any) {
        console.error('[Configs API] Error getting configs by state:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

export default router;
