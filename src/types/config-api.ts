/**
 * TypeScript types for the TableScanner Config Control Plane API.
 * 
 * These types define the contract between DataTables Viewer and
 * the TableScanner backend for configuration management.
 * 
 * @version 1.0.0
 */

import type { DataTypeConfig } from './schema';

// =============================================================================
// ENUMS AND LITERALS
// =============================================================================

/** Configuration lifecycle states */
export type ConfigState = 'draft' | 'proposed' | 'published' | 'deprecated' | 'archived';

/** Source types for configurations */
export type ConfigSourceType = 'object' | 'handle' | 'builtin' | 'custom';

/** Resolution source indicating where the config came from */
export type ConfigSource =
    | 'user_override'
    | 'published'
    | 'generated'
    | 'builtin'
    | 'default'
    | 'cached';

// =============================================================================
// CONFIG RECORD TYPES
// =============================================================================

/**
 * Full configuration record from the Config Control Plane.
 * Includes metadata, lifecycle info, and the actual config.
 */
export interface ConfigRecord {
    /** Unique identifier (UUID) */
    id: string;

    /** Type of source (object, handle, builtin, custom) */
    source_type: ConfigSourceType;

    /** Reference to the source (UPA, handle ID, etc.) */
    source_ref: string;

    /** Database content fingerprint for cache invalidation */
    fingerprint: string | null;

    /** Monotonic version number */
    version: number;

    /** Current lifecycle state */
    state: ConfigState;

    /** Creation timestamp (ISO 8601) */
    created_at: string;

    /** Last update timestamp (ISO 8601) */
    updated_at: string;

    /** User or system that created this config */
    created_by: string;

    /** Publication timestamp (null if not published) */
    published_at: string | null;

    /** User that published this config */
    published_by: string | null;

    /** The actual DataTypeConfig JSON */
    config: DataTypeConfig;

    /** Parent config ID if this extends another */
    extends_id: string | null;

    /** Delta overlays from parent config */
    overlays: Record<string, unknown> | null;

    /** KBase object type (e.g., "KBaseGeneDataLakes.BERDLTables-1.0") */
    object_type: string | null;

    /** AI provider that generated this config (if AI-generated) */
    ai_provider: string | null;

    /** Confidence score for AI-generated configs (0-1) */
    confidence: number;

    /** Time taken to generate this config (ms) */
    generation_time_ms: number | null;

    /** Human-readable description of last change */
    change_summary: string | null;

    /** Author of the last change */
    change_author: string | null;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Response from the /config/resolve endpoint.
 * Returns the best available config for a source reference.
 */
export interface ConfigResolveResponse {
    /** The resolved configuration */
    config: DataTypeConfig;

    /** Where the config came from */
    source: ConfigSource;

    /** Config record ID (null for default configs) */
    config_id: string | null;

    /** Database fingerprint (for cache invalidation) */
    fingerprint: string | null;

    /** Config version number */
    version: number | null;

    /** KBase object type */
    object_type: string | null;

    /** Time taken to resolve (ms) */
    resolution_time_ms: number;
}

/**
 * Response from listing configs.
 */
export interface ConfigListResponse {
    /** List of config records */
    configs: ConfigRecord[];

    /** Total count (for pagination) */
    total: number;

    /** Current page number */
    page: number;

    /** Items per page */
    per_page: number;
}

/**
 * Table info from the /tables endpoint.
 */
export interface TableInfo {
    /** Table name in the SQLite database */
    name: string;

    /** Number of rows in the table */
    row_count: number | null;

    /** Number of columns */
    column_count: number | null;
}

/**
 * Enhanced table list response that includes config metadata.
 * This is returned by TableScanner's /object/{ref}/tables endpoint.
 */
export interface TableListWithConfig {
    /** Source object reference */
    berdl_table_id: string;

    /** List of tables in the database */
    tables: TableInfo[];

    /** KBase object type */
    object_type: string | null;

    /** Fingerprint of cached viewer config */
    config_fingerprint: string | null;

    /** URL to retrieve cached config */
    config_url: string | null;

    /** Whether a viewer config is cached */
    has_cached_config: boolean;

    /** Whether a builtin fallback config exists */
    has_builtin_config: boolean;

    /** ID of the matching builtin config */
    builtin_config_id: string | null;

    /** Column types per table: {table_name: {column: sql_type}} */
    schemas: Record<string, Record<string, string>>;

    /** Database file size in bytes */
    database_size_bytes: number | null;

    /** Total rows across all tables */
    total_rows: number;

    /** API version for compatibility */
    api_version: string;
}

/**
 * Response from config generation endpoint.
 */
export interface ConfigGenerationResponse {
    /** Generation status */
    status: 'generated' | 'cached' | 'fallback' | 'error';

    /** Database fingerprint */
    fingerprint: string;

    /** URL to retrieve config */
    config_url: string;

    /** The generated configuration */
    config: DataTypeConfig;

    /** Whether a fallback was used */
    fallback_used: boolean;

    /** Reason for fallback (if applicable) */
    fallback_reason: string | null;

    /** Source of the config */
    config_source: 'ai' | 'rules' | 'cache' | 'builtin' | 'error';

    /** Number of tables analyzed */
    tables_analyzed: number;

    /** Number of columns inferred */
    columns_inferred: number;

    /** Total rows across tables */
    total_rows: number;

    /** AI provider used (if any) */
    ai_provider_used: string | null;

    /** Whether AI was available */
    ai_available: boolean;

    /** AI error message (if failed) */
    ai_error: string | null;

    /** Generation time in ms */
    generation_time_ms: number;

    /** Whether result was from cache */
    cache_hit: boolean;

    /** KBase object type */
    object_type: string | null;

    /** Object reference */
    object_ref: string | null;

    /** API version */
    api_version: string;
}

// =============================================================================
// API SETTINGS
// =============================================================================

/**
 * Configuration for the Config API client.
 */
export interface ConfigApiSettings {
    /** Whether remote config is enabled */
    enabled: boolean;

    /** Base URL for the Config API */
    baseUrl: string;

    /** Request timeout in milliseconds */
    timeout: number;

    /** Whether to cache resolved configs */
    cacheEnabled: boolean;

    /** Cache time-to-live in milliseconds */
    cacheTTL: number;

    /** Whether to fall back to static configs on API failure */
    fallbackToStatic: boolean;
}

/**
 * Default settings for the Config API.
 */
export const DEFAULT_CONFIG_API_SETTINGS: ConfigApiSettings = {
    enabled: true,
    baseUrl: 'http://127.0.0.1:8000',
    timeout: 10000,
    cacheEnabled: true,
    cacheTTL: 300000, // 5 minutes
    fallbackToStatic: true,
};

// =============================================================================
// AI PROPOSAL TYPES
// =============================================================================

/**
 * Request for AI to propose config changes.
 */
export interface AIProposalRequest {
    /** Natural language description of intent */
    intent: string;

    /** Config ID to modify (for updates) */
    target_config: string | null;

    /** Source ref for new configs */
    target_source_ref: string | null;

    /** Specific tables to affect */
    target_tables: string[];

    /** Proposed config or overlay */
    proposed_changes: Record<string, unknown>;

    /** AI reasoning for changes */
    reasoning: string;

    /** Confidence score (0-1) */
    confidence: number;

    /** Whether human review is needed */
    requires_human_review: boolean;
}

/**
 * Response to AI proposal.
 */
export interface AIProposalResponse {
    /** Proposal status */
    status: 'accepted' | 'needs_revision' | 'rejected';

    /** Proposal ID */
    proposal_id: string;

    /** Created config ID (if accepted) */
    config_id: string | null;

    /** Validation errors */
    validation_errors: string[];

    /** Suggestions for improvement */
    suggestions: string[];

    /** Summary of changes */
    diff_summary: string | null;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Options for config resolution.
 */
export interface ResolveOptions {
    /** Database fingerprint for exact match */
    fingerprint?: string;

    /** KBase object type for fallback matching */
    objectType?: string;

    /** Force refresh (skip cache) */
    forceRefresh?: boolean;

    /** Prefer remote over static */
    preferRemote?: boolean;
}

/**
 * Result of config resolution.
 */
export interface ResolveResult {
    /** The resolved configuration */
    config: DataTypeConfig;

    /** Resolution source category */
    source: 'remote' | 'static' | 'generated' | 'default';

    /** Detailed source info */
    sourceDetail: string;

    /** Whether result came from cache */
    fromCache: boolean;
}

/**
 * Cache entry for resolved configs.
 */
export interface ConfigCacheEntry {
    /** The cached config */
    config: DataTypeConfig;

    /** Source of the config */
    source: string;

    /** Cache timestamp */
    timestamp: number;

    /** Database fingerprint */
    fingerprint: string | null;
}
