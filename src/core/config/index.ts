/**
 * Config System - Unified Exports
 * 
 * Simplified for KBase integration.
 * Config is loaded from app-config.json or defaults to fallback.
 * 
 * @version 4.0.0
 */



// Core classes and singletons
export {
    ConfigResolver,
    getConfigResolver
} from './ConfigResolver';
export { ConfigManager } from './ConfigManager';

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
