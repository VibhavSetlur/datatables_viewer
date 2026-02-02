/**
 * Config Resolver (Simplified for KBase Integration)
 * 
 * Resolution flow:
 * 1. KBase Workspace config (if configRef provided in app-config.json)
 * 2. Default fallback config (default-config.json)
 * 
 * @version 4.0.0
 */

import type { DataTypeConfig, TableSchema } from '../../types/schema';
import type { ResolveOptions, ResolveResult } from '../../types/config-api';

import { logger } from '../../utils/logger';
import type { ApiClient } from '../api/ApiClient';

// =============================================================================
// CONFIG RESOLVER CLASS
// =============================================================================

/**
 * ConfigResolver provides unified config resolution.
 * Simplified for KBase integration - loads from workspace or falls back to default.
 */
export class ConfigResolver {

    private defaultConfigCache: DataTypeConfig | null = null;
    private kbaseConfigCache: DataTypeConfig | null = null;

    constructor() {
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Resolve the best available configuration for a data source.
     * 
     * @param sourceRef - Object reference (e.g., "76990/7/2")
     * @param options - Resolution options
     * @returns Resolution result with config and metadata
     */
    public async resolve(
        sourceRef: string,
        options: ResolveOptions = {}
    ): Promise<ResolveResult> {
        // 0. If forceDefault is true, skip other checks
        if (options.forceDefault) {
            const defaultConfig = await this.loadDefaultConfig();
            if (defaultConfig) {
                return {
                    config: defaultConfig,
                    source: 'default',
                    sourceDetail: 'forced_default',
                    fromCache: false
                };
            }
            // Fallback to minimal if default fails
            return {
                config: this.createDefaultConfig(sourceRef),
                source: 'default',
                sourceDetail: 'minimal_fallback',
                fromCache: false
            };
        }

        // 1. If KBase config was loaded (from app-config.json configRef), use it
        if (this.kbaseConfigCache) {
            return {
                config: this.kbaseConfigCache,
                source: 'remote',
                sourceDetail: 'kbase_workspace',
                fromCache: true,
            };
        }

        // 2. Load default config (default-config.json)
        const defaultConfig = await this.loadDefaultConfig();
        if (defaultConfig) {
            return {
                config: defaultConfig,
                source: 'default',
                sourceDetail: 'default_config',
                fromCache: false,
                warning: `Using default display configuration for "${sourceRef}".`,
            };
        }

        // 3. Fallback to minimal generated config
        logger.warn(`[ConfigResolver] No config found for ${sourceRef}, using minimal fallback`);
        return {
            config: this.createDefaultConfig(sourceRef),
            source: 'default',
            sourceDetail: 'minimal_fallback',
            fromCache: false,
            warning: `No configuration found for "${sourceRef}". Database will be rendered with basic settings.`,
        };
    }

    /**
     * Attempt to fetch configuration from the KBase Workspace.
     * Currently a mock implementation that will fail safe for testing.
     * 
     * @param sourceRef The workspace object reference (UPA)
     * @param client The API client to use for the call
     */
    public async resolveFromWorkspace(sourceRef: string, client: ApiClient): Promise<DataTypeConfig | null> {
        // 1. Check Metadata for 'kn_config'
        try {
            logger.debug(`[ConfigResolver] Checking metadata for config: ${sourceRef}`);
            const objInfo = await client.getWorkspaceObjectInfo(sourceRef);

            // KBase Object Info Tuple: [0:objid, ... 10:metadata]
            if (objInfo && objInfo[0] && objInfo[0][10]) {
                const metadata = objInfo[0][10];
                const rawConfig = metadata['kn_config'] || metadata['config'];

                if (rawConfig) {
                    try {
                        const config = JSON.parse(rawConfig);
                        logger.info(`[ConfigResolver] Found config in workspace metadata for ${sourceRef}`);
                        return config as DataTypeConfig;
                    } catch (e) {
                        logger.warn(`[ConfigResolver] Failed to parse config from metadata for ${sourceRef}`, e);
                    }
                }
            }
        } catch (error) {
            logger.warn(`[ConfigResolver] Failed to fetch object info for ${sourceRef}`, error);
        }

        // 2. Fallback: Check for linked config in app-config.json (Sidecar)
        try {
            // This replicates the logic previously in TableRenderer
            logger.debug(`[ConfigResolver] Checking sidecar app-config.json for source: ${sourceRef}`);
            const appConfig = await fetch('./app-config.json').then(r => r.ok ? r.json() : null).catch(() => null);
            const configRef = appConfig?.configRef;

            if (configRef) {
                logger.info(`[ConfigResolver] Found configRef in sidecar: ${configRef}`);
                const response = await client.getWorkspaceObject(configRef);

                // Detailed logging for debugging
                if (response && response.data) {
                    logger.info(`[ConfigResolver] Successfully fetched config object from ${configRef}`);
                    return response.data as DataTypeConfig;
                } else {
                    logger.warn(`[ConfigResolver] Fetched ${configRef} but got no data`);
                }
            } else {
                logger.debug('[ConfigResolver] No configRef found in sidecar app-config.json');
            }

            return null;

        } catch (error) {
            logger.warn('[ConfigResolver] Error resolving from workspace (sidecar)', error);
            return null;
        }
    }

    /**
     * Set the KBase workspace config (called after fetching from workspace API).
     */
    public setKBaseConfig(config: DataTypeConfig): void {
        this.kbaseConfigCache = config;
        logger.info('[ConfigResolver] KBase workspace config loaded');
    }

    /**
     * Clear the KBase workspace config cache.
     */
    public clearKBaseConfig(): void {
        this.kbaseConfigCache = null;
    }

    /**
     * Check if KBase config is loaded.
     */
    public hasKBaseConfig(): boolean {
        return this.kbaseConfigCache !== null;
    }

    /**
     * Resolve table-specific configuration.
     */
    public async resolveTable(
        sourceRef: string,
        tableName: string,
        options: ResolveOptions = {}
    ): Promise<TableSchema | null> {
        const result = await this.resolve(sourceRef, options);
        return result.config.tables?.[tableName] ?? null;
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    /**
     * Create a minimal default config.
     */
    private createDefaultConfig(sourceRef: string): DataTypeConfig {
        const id = this.generateConfigId(sourceRef);
        return {
            id,
            name: `Auto-generated: ${sourceRef}`,
            version: '1.0.0',
            description: 'Minimal configuration generated from source reference',
            tables: {},
        };
    }

    /**
     * Generate a config ID from a source reference.
     */
    private generateConfigId(sourceRef: string): string {
        const safeId = sourceRef.replace(/[^a-zA-Z0-9]/g, '_');
        return `auto_${safeId}`;
    }

    /**
     * Load default config from default-config.json.
     */
    private async loadDefaultConfig(): Promise<DataTypeConfig | null> {
        if (this.defaultConfigCache) {
            return this.defaultConfigCache;
        }

        try {
            const defaultConfigUrl = './config/tables/default-config.json';

            const response = await fetch(defaultConfigUrl);
            if (response.ok) {
                const config = await response.json();
                this.defaultConfigCache = config;
                logger.info('[ConfigResolver] Loaded default config');
                return config;
            }
        } catch (error) {
            logger.warn('[ConfigResolver] Failed to load default config', error);
        }

        return null;
    }
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let resolverInstance: ConfigResolver | null = null;

/**
 * Get the singleton ConfigResolver instance.
 */
export function getConfigResolver(): ConfigResolver {
    if (!resolverInstance) {
        resolverInstance = new ConfigResolver();
    }
    return resolverInstance;
}

/**
 * Reset the ConfigResolver singleton (mainly for testing).
 */
export function resetConfigResolver(): void {
    resolverInstance = null;
}
