/**
 * Config Resolver
 * 
 * Implements robust resolution logic to find the best available
 * configuration for a data source.
 * 
 * Resolution Priority:
 * 1. Pattern matching (UPA/object type patterns from index.json)
 * 2. Schema-based matching (compare table/column names)
 * 3. Default config (default-config.json)
 * 
 * @version 3.0.0
 */

import type { DataTypeConfig, TableSchema } from '../../types/schema';
import type { ResolveOptions, ResolveResult, SchemaInfo } from '../../types/config-api';
import { DataTypeRegistry } from './DataTypeRegistry';
import { logger } from '../../utils/logger';

// =============================================================================
// CONFIG RESOLVER CLASS
// =============================================================================

/**
 * ConfigResolver provides unified config resolution from static sources.
 * Uses pattern matching and schema-based matching to find the appropriate config.
 */
export class ConfigResolver {
    private registry: DataTypeRegistry;
    private schemaMatchCache: Map<string, { configId: string; score: number; timestamp: number }> = new Map();
    private defaultConfigCache: DataTypeConfig | null = null;

    constructor() {
        this.registry = DataTypeRegistry.getInstance();
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
        // 1. Try pattern matching (UPA/object type patterns from index.json)
        const staticConfig = this.findStaticConfig(sourceRef, options.objectType);
        if (staticConfig) {
            return {
                config: staticConfig,
                source: 'static',
                sourceDetail: `static:${staticConfig.id}`,
                fromCache: true,
            };
        }

        // 2. Try schema-based matching if schema info is available
        if (options.schema && options.schema.tables.length > 0) {
            const schemaMatch = await this.findSchemaMatch(options.schema);
            if (schemaMatch) {
                return {
                    config: schemaMatch.config,
                    source: 'schema_match',
                    sourceDetail: `schema_match:${schemaMatch.configId} (score: ${schemaMatch.score.toFixed(2)})`,
                    fromCache: false,
                    warning: `No pattern match found. Matched by schema similarity (${(schemaMatch.score * 100).toFixed(0)}% match).`,
                };
            }
        }

        // 3. Load default config (default-config.json)
        const defaultConfig = await this.loadDefaultConfig();
        if (defaultConfig) {
            return {
                config: defaultConfig,
                source: 'default',
                sourceDetail: 'default_config',
                fromCache: false,
                warning: `No configuration found for "${sourceRef}". Using default configuration. Consider adding a mapping in index.json.`,
            };
        }

        // 4. Fallback to minimal generated config
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

            logger.debug(
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
        hasStaticConfig: boolean;
        recommendedSource: 'static' | 'default';
    }> {
        const hasStatic = this.hasStaticConfig(sourceRef);

        return {
            hasStaticConfig: hasStatic,
            recommendedSource: hasStatic ? 'static' : 'default',
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

    /**
     * Find config by schema matching (table/column name comparison).
     * Efficiently compares database schema against config schemas.
     */
    private async findSchemaMatch(
        schema: SchemaInfo
    ): Promise<{ config: DataTypeConfig; configId: string; score: number } | null> {
        // Check cache first
        const cacheKey = this.getSchemaCacheKey(schema);
        const cached = this.schemaMatchCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 300000) { // 5 min cache
            const config = this.registry.getDataType(cached.configId);
            if (config) {
                return { config, configId: cached.configId, score: cached.score };
            }
        }

        const appConfig = this.registry.getAppConfig();
        if (!appConfig?.dataTypes) {
            return null;
        }

        let bestMatch: { config: DataTypeConfig; configId: string; score: number } | null = null;
        const dbTables = new Set(schema.tables.map(t => t.toLowerCase()));
        const dbColumns = new Map<string, Set<string>>();
        
        // Normalize column names for comparison
        for (const [table, cols] of Object.entries(schema.columns)) {
            dbColumns.set(table.toLowerCase(), new Set(cols.map(c => c.toLowerCase())));
        }

        // Check each config with schema matching enabled
        for (const [configId, ref] of Object.entries(appConfig.dataTypes)) {
            const schemaMatch = (ref as any).schemaMatch;
            if (!schemaMatch?.enabled) continue;

            const config = this.registry.getDataType(configId);
            if (!config?.tables) continue;

            const requiredTables = schemaMatch.requiredTables || [];
            const requiredColumns = schemaMatch.requiredColumns || {};
            const minScore = schemaMatch.minMatchScore || 0.6;

            // Calculate match score
            let score = 0;
            let totalChecks = 0;

            // Check required tables
            for (const reqTable of requiredTables) {
                totalChecks++;
                if (dbTables.has(reqTable.toLowerCase())) {
                    score += 1;
                    
                    // Check required columns for this table
                    const reqCols = requiredColumns[reqTable] || [];
                    if (reqCols.length > 0) {
                        const dbCols = dbColumns.get(reqTable.toLowerCase());
                        if (dbCols) {
                            const matchedCols = reqCols.filter((col: string) => 
                                dbCols.has(col.toLowerCase())
                            ).length;
                            score += (matchedCols / reqCols.length) * 0.5; // Column match contributes 50% of table score
                        }
                    }
                }
            }

            if (totalChecks === 0) continue;

            const finalScore = score / totalChecks;
            if (finalScore >= minScore && (!bestMatch || finalScore > bestMatch.score)) {
                bestMatch = { config, configId, score: finalScore };
            }
        }

        // Cache result
        if (bestMatch) {
            this.schemaMatchCache.set(cacheKey, {
                configId: bestMatch.configId,
                score: bestMatch.score,
                timestamp: Date.now(),
            });
        }

        return bestMatch;
    }

    /**
     * Generate cache key from schema info.
     */
    private getSchemaCacheKey(schema: SchemaInfo): string {
        const tables = schema.tables.sort().join(',');
        const columns = Object.entries(schema.columns)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([table, cols]) => `${table}:${cols.sort().join(',')}`)
            .join('|');
        return `${tables}|${columns}`;
    }

    /**
     * Load default config from default-config.json.
     */
    private async loadDefaultConfig(): Promise<DataTypeConfig | null> {
        if (this.defaultConfigCache) {
            return this.defaultConfigCache;
        }

        try {
            const appConfig = this.registry.getAppConfig();
            const defaultConfigUrl = (appConfig as any)?.defaultConfig?.configUrl || '/config/default-config.json';
            
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
