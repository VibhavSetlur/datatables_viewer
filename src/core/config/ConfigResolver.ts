/**
 * Config Resolver
 * 
 * Implements cascading resolution logic to find the best available
 * configuration for a data source.
 * 
 * Resolution Priority:
 * 1. Remote API (TableScanner Config Control Plane)
 * 2. Static configs (local JSON files via DataTypeRegistry)
 * 3. AI-generated config (triggers generation if needed)
 * 4. Minimal default config
 * 
 * @version 1.0.0
 */

import type { DataTypeConfig, TableSchema } from '../../types/schema';
import type { ResolveOptions, ResolveResult } from '../../types/config-api';
import { DataTypeRegistry } from './DataTypeRegistry';
import { getRemoteConfigProvider } from './RemoteConfigProvider';

// =============================================================================
// CONFIG RESOLVER CLASS
// =============================================================================

/**
 * ConfigResolver provides unified config resolution across multiple sources.
 * It attempts remote resolution first, falls back to static configs,
 * and can trigger AI generation as a last resort.
 */
export class ConfigResolver {
    private registry: DataTypeRegistry;
    private remoteEnabled: boolean = true;

    constructor() {
        this.registry = DataTypeRegistry.getInstance();
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Enable or disable remote resolution.
     */
    public setRemoteEnabled(enabled: boolean): void {
        this.remoteEnabled = enabled;
    }

    /**
     * Check if remote resolution is enabled.
     */
    public isRemoteEnabled(): boolean {
        return this.remoteEnabled && getRemoteConfigProvider().isEnabled();
    }

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
        const preferRemote = options.preferRemote ?? this.remoteEnabled;

        // 1. Try remote first (if enabled and preferred)
        if (preferRemote && this.isRemoteEnabled()) {
            try {
                const remote = getRemoteConfigProvider();
                const result = await remote.resolve(sourceRef, {
                    fingerprint: options.fingerprint,
                    objectType: options.objectType,
                    forceRefresh: options.forceRefresh,
                });

                if (result) {
                    return {
                        config: result.config,
                        source: 'remote',
                        sourceDetail: result.source,
                        fromCache: result.source.startsWith('cached:'),
                    };
                }
            } catch (error) {
                console.warn('[ConfigResolver] Remote resolution failed:', error);
                // Continue to fallbacks
            }
        }

        // 2. Try static configs from registry
        const staticConfig = this.findStaticConfig(sourceRef, options.objectType);
        if (staticConfig) {
            return {
                config: staticConfig,
                source: 'static',
                sourceDetail: `static:${staticConfig.id}`,
                fromCache: true, // Static is always "cached"
            };
        }

        // 3. Try to generate via API (if remote is enabled)
        if (preferRemote && this.isRemoteEnabled()) {
            try {
                const remote = getRemoteConfigProvider();
                const generated = await remote.generateConfig(sourceRef, {
                    forceRegenerate: options.forceRefresh,
                });

                if (generated && generated.config) {
                    return {
                        config: generated.config,
                        source: 'generated',
                        sourceDetail: `generated:${generated.config_source}`,
                        fromCache: generated.cache_hit,
                    };
                }
            } catch (error) {
                console.warn('[ConfigResolver] Config generation failed:', error);
            }
        }

        // 4. Return minimal default
        console.log(`[ConfigResolver] Using default config for ${sourceRef}`);
        return {
            config: this.createDefaultConfig(sourceRef),
            source: 'default',
            sourceDetail: 'minimal_fallback',
            fromCache: false,
        };
    }

    /**
     * Resolve table-specific configuration.
     * 
     * @param sourceRef - Object reference
     * @param tableName - Name of the table
     * @param options - Resolution options
     * @returns TableSchema or null if not found
     */
    public async resolveTable(
        sourceRef: string,
        tableName: string,
        options: ResolveOptions = {}
    ): Promise<TableSchema | null> {
        const result = await this.resolve(sourceRef, options);
        return result.config.tables?.[tableName] ?? null;
    }

    /**
     * Resolve and register a config in the DataTypeRegistry.
     * This is a convenience method for common usage patterns.
     * 
     * @param sourceRef - Object reference
     * @param options - Resolution options
     * @returns The resolved DataTypeConfig or null
     */
    public async resolveAndRegister(
        sourceRef: string,
        options: ResolveOptions = {}
    ): Promise<DataTypeConfig | null> {
        const result = await this.resolve(sourceRef, options);

        if (result.config) {
            // Ensure the config has an ID
            if (!result.config.id) {
                result.config.id = this.generateConfigId(sourceRef);
            }

            // Register in the data type registry
            this.registry.registerDataType(result.config);

            console.log(
                `[ConfigResolver] Registered ${result.config.id} from ${result.source}`
            );
            return result.config;
        }

        return null;
    }

    /**
     * Check if a static config exists for the given source.
     */
    public hasStaticConfig(sourceRef: string, objectType?: string): boolean {
        return this.findStaticConfig(sourceRef, objectType) !== null;
    }

    /**
     * Get resolution hints for a source reference.
     * Useful for debugging and UI feedback.
     */
    public async getResolutionHints(
        sourceRef: string
    ): Promise<{
        hasRemoteConfig: boolean;
        hasStaticConfig: boolean;
        canGenerate: boolean;
        recommendedSource: 'remote' | 'static' | 'generate';
    }> {
        const hasStatic = this.hasStaticConfig(sourceRef);
        let hasRemote = false;
        let canGenerate = false;

        if (this.isRemoteEnabled()) {
            try {
                const remote = getRemoteConfigProvider();
                const tableList = await remote.getTableListWithConfig(sourceRef);

                if (tableList) {
                    hasRemote = tableList.has_cached_config || tableList.has_builtin_config;
                    canGenerate = true; // If we can fetch tables, we can generate
                }
            } catch {
                // Remote unavailable
            }
        }

        let recommendedSource: 'remote' | 'static' | 'generate' = 'static';
        if (hasRemote) {
            recommendedSource = 'remote';
        } else if (canGenerate && !hasStatic) {
            recommendedSource = 'generate';
        }

        return {
            hasRemoteConfig: hasRemote,
            hasStaticConfig: hasStatic,
            canGenerate,
            recommendedSource,
        };
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    /**
     * Find a matching static config by pattern matching.
     */
    private findStaticConfig(
        sourceRef: string,
        objectType?: string
    ): DataTypeConfig | null {
        const appConfig = this.registry.getAppConfig();
        if (!appConfig?.dataTypes) {
            return null;
        }

        // First, try exact match on sourceRef patterns
        for (const [id, ref] of Object.entries(appConfig.dataTypes)) {
            if (ref.matches?.some((pattern) => this.matchPattern(sourceRef, pattern))) {
                const found = this.registry.getDataType(id);
                if (found) return found;
            }
        }

        // Then, try object type matching
        if (objectType) {
            for (const [id, ref] of Object.entries(appConfig.dataTypes)) {
                if (ref.matches?.some((pattern) => this.matchPattern(objectType, pattern))) {
                    const found = this.registry.getDataType(id);
                    if (found) return found;
                }
            }
        }

        return null;
    }

    /**
     * Match a value against a pattern (supports wildcards).
     */
    private matchPattern(value: string, pattern: string): boolean {
        if (pattern.includes('*')) {
            // Convert glob pattern to regex
            const regexPattern = pattern
                .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
                .replace(/\*/g, '.*'); // Convert * to .*
            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(value);
        }
        return value === pattern;
    }

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
