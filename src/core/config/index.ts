/**
 * Config System - Unified Exports
 * 
 * This file provides a clean public API for the configuration system.
 * Import from here instead of individual files.
 * 
 * @version 3.1.0
 */

// Core classes and singletons
export { DataTypeRegistry, getRegistry } from './DataTypeRegistry';
export {
    ConfigResolver,
    getConfigResolver,
    resetConfigResolver
} from './ConfigResolver';
export {
    RemoteConfigProvider,
    getRemoteConfigProvider,
    initializeRemoteConfigProvider,
    resetRemoteConfigProvider
} from './RemoteConfigProvider';

// Re-export types for convenience
export type {
    ConfigApiSettings,
    ConfigRecord,
    ConfigResolveResponse,
    ConfigGenerationResponse,
    TableListWithConfig,
    ConfigSource,
    ConfigState,
    ConfigSourceType,
    ResolveOptions,
    ResolveResult,
    ConfigCacheEntry,
    AIProposalRequest,
    AIProposalResponse,
} from '../../types/config-api';

// Type re-exports from schema
export type {
    DataTypeConfig,
    TableSchema,
    ColumnSchema,
    AppConfig,
    ApiConfig,
} from '../../types/schema';

/**
 * Initialize the config system with remote support.
 * Call this early in your application lifecycle.
 * 
 * @param options - Optional settings override
 * @returns The initialized DataTypeRegistry
 */
export async function initializeConfigSystem(options?: {
    configUrl?: string;
    enableRemote?: boolean;
    remoteSettings?: Partial<import('../../types/config-api').ConfigApiSettings>;
}): Promise<import('./DataTypeRegistry').DataTypeRegistry> {
    const registry = (await import('./DataTypeRegistry')).DataTypeRegistry.getInstance();

    // Load app config
    if (options?.configUrl) {
        try {
            const response = await fetch(options.configUrl);
            const appConfig = await response.json();
            await registry.initialize(appConfig);
        } catch (error) {
            console.error('[Config] Failed to load app config:', error);
        }
    }

    // Initialize remote if requested
    if (options?.enableRemote !== false) {
        registry.initializeRemoteConfig(options?.remoteSettings);
    }

    return registry;
}
