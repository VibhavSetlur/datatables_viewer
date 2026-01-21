/**
 * KBase TableScanner API Client
 * 
 * TypeScript implementation of the KBase Client.
 */

import type { ApiConfig } from '../../types/schema';
import { LocalDbClient } from './LocalDbClient';
import {
    type AdvancedFilter,
    type Aggregation,
    type ApiTableDataRequest,
    type ColumnMetadata,
    type QueryMetadata,
    type TableDataResponse,
    DEFAULT_LIMIT,
    DEFAULT_OFFSET,
} from '../../types/shared-types';

interface ClientOptions {
    apiConfig?: ApiConfig;
    baseUrl?: string;
    token?: string;
    environment?: 'appdev' | 'prod' | 'local';
    headers?: Record<string, string>;
}

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

// Re-export types that external code may need
export type {
    AdvancedFilter,
    Aggregation,
    ColumnMetadata,
    QueryMetadata,
    TableDataResponse,
};

// Use ApiTableDataRequest for API calls
type TableDataRequest = ApiTableDataRequest;

export class ApiClient {
    private baseUrl: string;
    private token: string | null;
    private environment: string;
    private customHeaders: Record<string, string>;
    private cache: Map<string, CacheEntry<any>>;
    private cacheTTL: number;
    private localDb: LocalDbClient;

    constructor(options: ClientOptions = {}) {
        this.environment = options.environment || 'appdev';

        if (options.apiConfig) {
            this.baseUrl = options.apiConfig.url;
            this.customHeaders = options.apiConfig.headers || {};
        } else {
            this.baseUrl = options.baseUrl || this.getDefaultUrl(this.environment);
            this.customHeaders = options.headers || {};
        }

        this.token = options.token || null;
        this.cache = new Map();
        this.cacheTTL = 300000; // 5 minutes
        this.localDb = LocalDbClient.getInstance();
    }

    /**
     * Get schema for a specific table.
     * Tries remote TableScanner first, then falls back to LocalDbClient.
     */
    public async getTableSchema(
        berdlTableId: string,
        tableName: string
    ): Promise<Array<{ name: string; type: string; notnull?: boolean; pk?: boolean }>> {
        // Local databases: prefer LocalDbClient
        if (LocalDbClient.isLocalDb(berdlTableId)) {
            const localSchema = await this.localDb.getTableSchema(tableName);
            return localSchema;
        }

        // Remote: TableScanner schema endpoint
        try {
            const schema = await this.request(
                `/schema/${berdlTableId}/tables/${tableName}`,
                'GET',
                undefined,
                true
            );
            // TableScanner returns { columns: [...] }
            if (schema && Array.isArray((schema as any).columns)) {
                return (schema as any).columns;
            }
            // Some deployments may return array directly
            if (Array.isArray(schema)) return schema as any;
        } catch (error) {
            console.warn('[ApiClient] Remote schema fetch failed, falling back to local if available', error);
        }

        // Fallback to LocalDbClient if reachable
        if (LocalDbClient.isLocalDb(berdlTableId)) {
            return this.localDb.getTableSchema(tableName);
        }

        return [];
    }

    private getDefaultUrl(env: string): string {
        // Check for environment variable first (for static deployment)
        // Vite exposes env vars prefixed with VITE_
        const envApiUrl = (import.meta.env?.VITE_API_URL as string) ||
            (typeof window !== 'undefined' && (window as any).__API_URL__);

        if (envApiUrl) {
            return envApiUrl;
        }

        // TableScanner service URLs (external service)
        const urls: Record<string, string> = {
            appdev: 'https://appdev.kbase.us/services/berdl_table_scanner',
            prod: 'https://kbase.us/services/berdl_table_scanner',
            local: 'http://127.0.0.1:8000'  // Local TableScanner service
        };
        return urls[env] || urls.appdev;
    }


    private getHeaders(): HeadersInit {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...this.customHeaders
        };
        if (this.token) {
            (headers as any)['Authorization'] = this.token;
        }
        return headers;
    }

    private getCacheKey(endpoint: string, params: any): string {
        return `${endpoint}:${JSON.stringify(params || {})}`;
    }

    private getFromCache<T>(key: string): T | null {
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.timestamp < this.cacheTTL)) {
            return cached.data;
        }
        return null;
    }

    private setCache<T>(key: string, data: T): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    public clearCache(): void {
        this.cache.clear();
    }

    public setToken(token: string): void {
        this.token = token;
        this.clearCache();
    }

    public updateConfig(config: ApiConfig): void {
        this.baseUrl = config.url;
        this.customHeaders = config.headers || {};
        this.clearCache();
    }

    public setEnvironment(environment: 'appdev' | 'prod' | 'local'): void {
        this.environment = environment;
        this.baseUrl = this.getDefaultUrl(environment);
        this.clearCache();
    }

    private async request<T>(endpoint: string, method: string, body?: any, useCache = false): Promise<T> {
        const cacheKey = this.getCacheKey(endpoint, body);

        if (useCache && method === 'GET') {
            const cached = this.getFromCache<T>(cacheKey);
            if (cached) return cached;
        }
        if (useCache && method === 'POST') {
            const cached = this.getFromCache<T>(cacheKey);
            if (cached) return cached;
        }

        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
        const options: RequestInit = {
            method,
            headers: this.getHeaders(),
        };

        let fetchUrl = url;
        if (body) {
            if (method === 'GET') {
                const urlObj = new URL(url);
                Object.entries(body as Record<string, any>).forEach(([k, v]) => {
                    if (v != null) urlObj.searchParams.set(k, String(v));
                });
                fetchUrl = urlObj.toString();
            } else {
                options.body = JSON.stringify(body);
            }
        }

        const response = await fetch(fetchUrl, options);

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

        const data = await response.json();
        if (useCache) {
            this.setCache(cacheKey, data);
        }
        return data as T;
    }

    // Public Methods

    public async listTables(berdlTableId: string): Promise<any> {
        // Local SQLite database mode (client-side)
        if (LocalDbClient.isLocalDb(berdlTableId)) {
            // Check if we have a remote TableScanner API configured
            const hasRemoteApi = this.baseUrl && !this.baseUrl.includes('localhost') && !this.baseUrl.includes('127.0.0.1');

            if (hasRemoteApi && berdlTableId.startsWith('local/')) {
                // Use remote TableScanner service (separate deployment)
                try {
                    const dbName = berdlTableId.replace('local/', '');
                    return this.request(
                        `${this.baseUrl}/object/${dbName}/tables`,
                        'GET',
                        undefined,
                        true
                    );
                } catch (error) {
                    console.warn('[ApiClient] Remote TableScanner API failed, falling back to client-side:', error);
                    // Fall back to client-side SQLite
                    return this.localDb.listTables(berdlTableId);
                }
            }

            // Use LocalDbClient for client-side SQLite (no server needed)
            return this.localDb.listTables(berdlTableId);
        }

        // Use remote TableScanner service for non-local databases (KBase objects)
        return this.request(`/object/${berdlTableId}/tables`, 'GET', undefined, true);
    }


    public async getTableData(req: TableDataRequest): Promise<TableDataResponse> {
        // Local SQLite database mode
        if (LocalDbClient.isLocalDb(req.berdl_table_id)) {
            // Check if we have a remote TableScanner API configured
            const hasRemoteApi = this.baseUrl && !this.baseUrl.includes('localhost') && !this.baseUrl.includes('127.0.0.1');

            if (hasRemoteApi && req.berdl_table_id.startsWith('local/')) {
                // Use remote TableScanner service (separate deployment)
                try {
                    const dbName = req.berdl_table_id.replace('local/', '');
                    const body = {
                        ...req,
                        berdl_table_id: `local/${dbName}`,
                        limit: req.limit || DEFAULT_LIMIT,
                        offset: req.offset || DEFAULT_OFFSET,
                    };
                    return this.request(
                        `${this.baseUrl}/table-data`,
                        'POST',
                        body,
                        false
                    );
                } catch (error) {
                    console.warn('[ApiClient] Remote TableScanner API failed, falling back to client-side:', error);
                    // Fall back to client-side SQLite
                    return this.localDb.getTableData(req.berdl_table_id, req);
                }
            }

            // Use LocalDbClient for client-side SQLite (no server needed)
            return this.localDb.getTableData(req.berdl_table_id, req);
        }

        // Use remote TableScanner service for non-local databases
        const body = {
            ...req,
            limit: req.limit || DEFAULT_LIMIT,
            offset: req.offset || DEFAULT_OFFSET,
            kb_env: this.environment
        };

        return this.request('/table-data', 'POST', body, false);
    }

    /**
     * Get schema information for all tables in a database.
     * Used for schema-based config matching.
     */
    public async getSchema(berdlTableId: string): Promise<Record<string, Record<string, string>> | null> {
        try {
            // Try schema endpoint
            return await this.request(`/schema/${berdlTableId}/tables`, 'GET', undefined, true);
        } catch {
            // Schema endpoint not available, return null
            return null;
        }
    }
}

