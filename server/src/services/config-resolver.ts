/**
 * Config Resolver Service
 * 
 * Server-side config resolution with cascading fallbacks
 * Matches TableScanner's config resolution logic
 */

import { getConfigByObjectType, configExists } from './config-service.js';
import { generateConfig } from './config-generator.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import type { DataTypeConfig } from '../types.js';

interface ResolveOptions {
    objectType?: string;
    sourceRef?: string;
    forceRefresh?: boolean;
    preferRemote?: boolean;
}

interface ResolveResult {
    config: DataTypeConfig;
    source: 'static' | 'database' | 'generated' | 'default';
    sourceDetail: string;
    fromCache: boolean;
    config_id?: string;
}

/**
 * Resolve config for a database with cascading fallbacks
 */
export async function resolveConfig(
    dbPath: string,
    dbName: string,
    options: ResolveOptions = {}
): Promise<ResolveResult> {
    // 1. Try to get from database (published configs)
    if (options.objectType) {
        const dbConfig = getConfigByObjectType(options.objectType);
        if (dbConfig && dbConfig.state === 'published') {
            return {
                config: JSON.parse(dbConfig.config_json),
                source: 'database',
                sourceDetail: `database:${dbConfig.id}`,
                fromCache: true,
                config_id: dbConfig.id
            };
        }
    }

    // 2. Try static config files
    const configDir = process.env.CONFIG_DIR || join(process.cwd(), 'public/config');
    const staticConfigPath = join(configDir, `${dbName}.json`);
    
    if (existsSync(staticConfigPath)) {
        try {
            const configContent = await readFile(staticConfigPath, 'utf-8');
            const config = JSON.parse(configContent);
            return {
                config,
                source: 'static',
                sourceDetail: `static:${dbName}.json`,
                fromCache: true
            };
        } catch (error) {
            console.warn(`[ConfigResolver] Failed to load static config: ${error}`);
        }
    }

    // 3. Try to generate config
    if (existsSync(dbPath)) {
        try {
            const generated = await generateConfig(dbPath, {
                objectType: options.objectType,
                sourceRef: options.sourceRef || `local/${dbName}`,
                forceRegenerate: options.forceRefresh
            });

            if (generated.status === 'generated' || generated.status === 'cached') {
                return {
                    config: generated.config,
                    source: 'generated',
                    sourceDetail: `generated:${generated.config_source}`,
                    fromCache: generated.cache_hit,
                    config_id: generated.config_id
                };
            }
        } catch (error) {
            console.warn(`[ConfigResolver] Failed to generate config: ${error}`);
        }
    }

    // 4. Return minimal default
    return {
        config: {
            id: `default_${dbName}`,
            name: `Default: ${dbName}`,
            version: '1.0.0',
            description: 'Minimal default configuration',
            tables: {}
        },
        source: 'default',
        sourceDetail: 'minimal_fallback',
        fromCache: false
    };
}
