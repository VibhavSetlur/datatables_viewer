/**
 * Developer Config Sync Service
 * 
 * Syncs developer-edited JSON config files to the database.
 * Matches TableScanner's developer config sync functionality.
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { createConfig, getConfigByObjectType, updateConfig } from './config-service.js';
import { validateConfig } from './validator.js';
import type { DataTypeConfig } from '../types.js';

interface SyncResult {
    filename: string;
    status: 'synced' | 'updated' | 'error' | 'skipped';
    config_id?: string;
    error?: string;
}

/**
 * Sync a single developer config file
 */
export async function syncDeveloperConfig(
    configPath: string,
    options: { force?: boolean } = {}
): Promise<SyncResult> {
    try {
        if (!existsSync(configPath)) {
            return {
                filename: basename(configPath),
                status: 'error',
                error: 'File not found'
            };
        }

        const content = await readFile(configPath, 'utf-8');
        const config: DataTypeConfig = JSON.parse(content);

        // Validate config
        const validation = validateConfig(config);
        if (!validation.valid) {
            return {
                filename: basename(configPath),
                status: 'error',
                error: `Validation failed: ${validation.errors.join(', ')}`
            };
        }

        // Determine object type from config
        const objectType = config.id || basename(configPath, '.json');

        // Check if config exists
        const existing = getConfigByObjectType(objectType);

        if (existing) {
            if (!options.force) {
                return {
                    filename: basename(configPath),
                    status: 'skipped',
                    config_id: existing.id,
                    error: 'Config already exists (use force=true to update)'
                };
            }

            // Update existing config
            const updated = updateConfig(existing.id, {
                config,
                updated_by: 'developer',
                change_summary: `Synced from ${basename(configPath)}`
            });

            return {
                filename: basename(configPath),
                status: 'updated',
                config_id: updated?.id
            };
        } else {
            // Create new config
            const record = createConfig({
                object_type: objectType,
                config,
                source: 'developer',
                created_by: 'developer'
            });

            return {
                filename: basename(configPath),
                status: 'synced',
                config_id: record.id
            };
        }
    } catch (error: any) {
        return {
            filename: basename(configPath),
            status: 'error',
            error: error.message
        };
    }
}

/**
 * Sync all developer configs from a directory
 */
export async function syncDeveloperConfigs(
    configDir: string,
    options: { force?: boolean; pattern?: string } = {}
): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    if (!existsSync(configDir)) {
        return [{
            filename: configDir,
            status: 'error',
            error: 'Directory not found'
        }];
    }

    const files = await readdir(configDir);
    const configFiles = files.filter(f => 
        f.endsWith('.json') && 
        !f.includes('index') && 
        !f.includes('schema') &&
        (!options.pattern || f.includes(options.pattern))
    );

    for (const file of configFiles) {
        const configPath = join(configDir, file);
        const fileStat = await stat(configPath);
        
        if (fileStat.isFile()) {
            const result = await syncDeveloperConfig(configPath, options);
            results.push(result);
        }
    }

    return results;
}
