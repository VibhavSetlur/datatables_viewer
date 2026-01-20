/**
 * Remote Config Provider
 * 
 * Fetches configurations from the TableScanner Config Control Plane API.
 * Implements caching, retry logic, and fallback mechanisms.
 * 
 * @version 1.0.0
 */

import type { DataTypeConfig } from '../../types/schema';
import type {
    ConfigApiSettings,
    ConfigResolveResponse,
    ConfigGenerationResponse,
    TableListWithConfig,
    ConfigCacheEntry,
} from '../../types/config-api';
import { logger } from '../../utils/logger';

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================

const DEFAULT_SETTINGS: ConfigApiSettings = {
    enabled: true,
    baseUrl: 'http://127.0.0.1:8000',
    timeout: 10000,
    cacheEnabled: true,
    cacheTTL: 300000, // 5 minutes
    fallbackToStatic: true,
};

// =============================================================================
// REMOTE CONFIG PROVIDER CLASS
// =============================================================================

/**
 * RemoteConfigProvider handles fetching configurations from the
 * TableScanner Config Control Plane API.
 * 
 * Features:
 * - In-memory caching with TTL
 * - Request timeout handling
 * - Graceful error handling
 * - Token-based authentication
 */
export class RemoteConfigProvider {
    private settings: ConfigApiSettings;
    private cache: Map<string, ConfigCacheEntry>;
    private token: string | null = null;
    private pendingRequests: Map<string, Promise<unknown>> = new Map();

    constructor(settings: Partial<ConfigApiSettings> = {}) {
        this.settings = { ...DEFAULT_SETTINGS, ...settings };
        this.cache = new Map();
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Set authentication token for API requests.
     */
    public setToken(token: string): void {
        this.token = token;
        // Clear cache when token changes (different user = different permissions)
        this.clearCache();
    }

    /**
     * Get the current token.
     */
    public getToken(): string | null {
        return this.token;
    }

    /**
     * Update provider settings.
     */
    public updateSettings(settings: Partial<ConfigApiSettings>): void {
        this.settings = { ...this.settings, ...settings };
    }

    /**
     * Get current settings.
     */
    public getSettings(): ConfigApiSettings {
        return { ...this.settings };
    }

    /**
     * Check if provider is enabled.
     */
    public isEnabled(): boolean {
        return this.settings.enabled;
    }

    /**
     * Resolve configuration for a data source.
     * 
     * @param sourceRef - Object reference (e.g., "76990/7/2")
     * @param options - Resolution options
     * @returns Resolved config and source, or null if not available
     */
    public async resolve(
        sourceRef: string,
        options: {
            fingerprint?: string;
            objectType?: string;
            forceRefresh?: boolean;
        } = {}
    ): Promise<{ config: DataTypeConfig; source: string } | null> {
        if (!this.settings.enabled) {
            logger.debug('[RemoteConfigProvider] Provider disabled');
            return null;
        }

        const cacheKey = this.getCacheKey(sourceRef, options.fingerprint);

        // Check cache first (unless forced refresh)
        if (!options.forceRefresh && this.settings.cacheEnabled) {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                logger.debug(`[RemoteConfigProvider] Cache hit for ${sourceRef}`);
                return { config: cached.config, source: `cached:${cached.source}` };
            }
        }

        try {
            // Deduplicate concurrent requests for the same resource
            const pendingKey = `resolve:${cacheKey}`;
            if (this.pendingRequests.has(pendingKey)) {
                const result = await this.pendingRequests.get(pendingKey) as ConfigResolveResponse | null;
                if (result) {
                    return { config: result.config, source: result.source };
                }
                return null;
            }

            const requestPromise = this.fetchWithTimeout<ConfigResolveResponse>(
                `/config/resolve/${encodeURIComponent(sourceRef)}`,
                {
                    fingerprint: options.fingerprint,
                    object_type: options.objectType,
                }
            );

            this.pendingRequests.set(pendingKey, requestPromise);

            const response = await requestPromise;
            this.pendingRequests.delete(pendingKey);

            if (response && response.config) {
                // Cache the result
                if (this.settings.cacheEnabled) {
                    this.setCache(cacheKey, {
                        config: response.config,
                        source: response.source,
                        timestamp: Date.now(),
                        fingerprint: response.fingerprint,
                    });
                }

                logger.info(
                    `[RemoteConfigProvider] Resolved config for ${sourceRef} from ${response.source}`
                );
                return { config: response.config, source: response.source };
            }
        } catch (error) {
            this.pendingRequests.delete(`resolve:${cacheKey}`);
            logger.warn(
                `[RemoteConfigProvider] Failed to resolve config for ${sourceRef}`,
                error
            );
        }

        return null;
    }

    /**
     * Get table list with config metadata.
     * 
     * TableScanner's /object/{ref}/tables endpoint includes
     * config availability information.
     */
    public async getTableListWithConfig(
        sourceRef: string
    ): Promise<TableListWithConfig | null> {
        if (!this.settings.enabled) {
            return null;
        }

        try {
            return await this.fetchWithTimeout<TableListWithConfig>(
                `/object/${encodeURIComponent(sourceRef)}/tables`
            );
        } catch (error) {
            logger.warn(
                `[RemoteConfigProvider] Failed to get table list for ${sourceRef}`,
                error
            );
            return null;
        }
    }

    /**
     * Trigger config generation for a source.
     * 
     * This calls the AI-powered config generation endpoint.
     */
    public async generateConfig(
        sourceRef: string,
        options: {
            forceRegenerate?: boolean;
            aiProvider?: string;
        } = {}
    ): Promise<ConfigGenerationResponse | null> {
        if (!this.settings.enabled) {
            return null;
        }

        try {
            const response = await this.fetchWithTimeout<ConfigGenerationResponse>(
                `/object/${encodeURIComponent(sourceRef)}/config/generate`,
                {
                    force_regenerate: options.forceRegenerate || false,
                    ai_provider: options.aiProvider || 'auto',
                },
                'POST'
            );

            if (response && response.config) {
                logger.info(
                    `[RemoteConfigProvider] Generated config for ${sourceRef}: ${response.status}`
                );
                return response;
            }
        } catch (error) {
            logger.warn(
                `[RemoteConfigProvider] Failed to generate config for ${sourceRef}`,
                error
            );
        }

        return null;
    }

    /**
     * Get a config by ID from the control plane.
     */
    public async getConfigById(configId: string): Promise<DataTypeConfig | null> {
        if (!this.settings.enabled) {
            return null;
        }

        try {
            const response = await this.fetchWithTimeout<{ config: DataTypeConfig }>(
                `/config/${configId}`
            );
            return response?.config ?? null;
        } catch (error) {
            logger.warn(
                `[RemoteConfigProvider] Failed to get config ${configId}`,
                error
            );
            return null;
        }
    }

    /**
     * Get a cached/generated config by fingerprint.
     */
    public async getConfigByFingerprint(
        fingerprint: string
    ): Promise<DataTypeConfig | null> {
        if (!this.settings.enabled) {
            return null;
        }

        try {
            const response = await this.fetchWithTimeout<DataTypeConfig>(
                `/config/generated/${fingerprint}`
            );
            return response ?? null;
        } catch (error) {
            logger.warn(
                `[RemoteConfigProvider] Failed to get config by fingerprint ${fingerprint}`,
                error
            );
            return null;
        }
    }

    /**
     * Check API health/availability.
     */
    public async checkHealth(): Promise<boolean> {
        try {
            const response = await this.fetchWithTimeout<{ status: string }>('/', {}, 'GET');
            return response?.status === 'running';
        } catch {
            return false;
        }
    }

    /**
     * Clear the in-memory cache.
     */
    public clearCache(): void {
        this.cache.clear();
        logger.debug('[RemoteConfigProvider] Cache cleared');
    }

    /**
     * Get cache statistics.
     */
    public getCacheStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
        };
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    private getCacheKey(sourceRef: string, fingerprint?: string): string {
        return fingerprint ? `${sourceRef}:${fingerprint}` : sourceRef;
    }

    private getFromCache(key: string): ConfigCacheEntry | null {
        const entry = this.cache.get(key);
        if (entry && Date.now() - entry.timestamp < this.settings.cacheTTL) {
            return entry;
        }
        // Expired or not found
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, entry: ConfigCacheEntry): void {
        this.cache.set(key, entry);

        // Limit cache size (LRU-like: just remove oldest entries)
        const MAX_CACHE_SIZE = 100;
        if (this.cache.size > MAX_CACHE_SIZE) {
            const keysToDelete = Array.from(this.cache.keys()).slice(
                0,
                this.cache.size - MAX_CACHE_SIZE
            );
            keysToDelete.forEach((k) => this.cache.delete(k));
        }
    }

    private async fetchWithTimeout<T>(
        endpoint: string,
        params?: Record<string, unknown>,
        method: 'GET' | 'POST' = 'GET'
    ): Promise<T> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.settings.timeout);

        try {
            let url = `${this.settings.baseUrl}${endpoint}`;
            const options: RequestInit = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                signal: controller.signal,
            };

            if (this.token) {
                (options.headers as Record<string, string>)['Authorization'] = this.token;
            }

            if (params && Object.keys(params).length > 0) {
                if (method === 'GET') {
                    const urlObj = new URL(url);
                    Object.entries(params).forEach(([k, v]) => {
                        if (v != null) urlObj.searchParams.set(k, String(v));
                    });
                    url = urlObj.toString();
                } else {
                    options.body = JSON.stringify(params);
                }
            }

            const response = await fetch(url, options);

            if (!response.ok) {
                let errorMsg = `HTTP ${response.status}`;
                try {
                    const data = await response.json();
                    errorMsg = data.detail || data.message || errorMsg;
                } catch {
                    errorMsg = `${errorMsg}: ${response.statusText}`;
                }
                throw new Error(errorMsg);
            }

            return await response.json();
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let instance: RemoteConfigProvider | null = null;

/**
 * Get the singleton RemoteConfigProvider instance.
 */
export function getRemoteConfigProvider(): RemoteConfigProvider {
    if (!instance) {
        instance = new RemoteConfigProvider();
    }
    return instance;
}

/**
 * Initialize the RemoteConfigProvider with custom settings.
 * Call this early in app initialization.
 */
export function initializeRemoteConfigProvider(
    settings: Partial<ConfigApiSettings>
): RemoteConfigProvider {
    instance = new RemoteConfigProvider(settings);
    return instance;
}

/**
 * Reset the singleton instance (mainly for testing).
 */
export function resetRemoteConfigProvider(): void {
    instance = null;
}
