/**
 * KBase TableScanner API Client
 * 
 * TypeScript implementation of the KBase Client.
 */

import type { ApiConfig } from '../../types/schema';
import { LocalDbClient } from './LocalDbClient';

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

interface AdvancedFilter {
    column: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'not_in' | 'between' | 'is_null' | 'is_not_null' | 'regex';
    value: any;
    value2?: any;
}

interface Aggregation {
    column: string;
    function: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'stddev' | 'variance' | 'distinct_count';
    alias?: string;
}

interface TableDataRequest {
    berdl_table_id: string;
    table_name: string;
    limit?: number;
    offset?: number;
    columns?: string[];
    sort_column?: string | null;
    sort_order?: 'ASC' | 'DESC';
    search_value?: string;
    col_filter?: Record<string, any>;
    filters?: AdvancedFilter[];
    group_by?: string[];
    aggregations?: Aggregation[];
    query_filters?: any;
    kb_env?: string;
}

interface TableDataResponse {
    headers: string[];
    data: any[][];
    total_count: number;
    cached?: boolean;
    execution_time_ms?: number;
}

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

    private getDefaultUrl(env: string): string {
        // Check for environment variable first (for static deployment)
        // Vite exposes env vars prefixed with VITE_
        const envApiUrl = (import.meta.env?.VITE_API_URL as string) || 
                         (typeof window !== 'undefined' && (window as any).__API_URL__);
        
        if (envApiUrl) {
            return envApiUrl;
        }

        const urls: Record<string, string> = {
            appdev: 'https://appdev.kbase.us/services/berdl_table_scanner',
            prod: 'https://kbase.us/services/berdl_table_scanner',
            local: 'http://127.0.0.1:8000',
            // Use local server if available (DataTables Viewer integrated server)
            local_integrated: 'http://localhost:3000'
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
        // Local SQLite database mode
        if (LocalDbClient.isLocalDb(berdlTableId)) {
            // Check if we have a remote API configured (for separate deployment)
            const hasRemoteApi = this.baseUrl && !this.baseUrl.includes('localhost') && !this.baseUrl.includes('127.0.0.1');
            
            if (hasRemoteApi && berdlTableId.startsWith('local/')) {
                // Use remote API service (separate deployment)
                try {
                    const dbName = berdlTableId.replace('local/', '');
                    return this.request(
                        `${this.baseUrl}/object/${dbName}/tables`,
                        'GET',
                        undefined,
                        true
                    );
                } catch (error) {
                    console.warn('[ApiClient] Remote API query failed, trying local fallback:', error);
                }
            }
            
            // Check if local integrated server is available
            const useLocalServer = await this.isLocalServerAvailable();
            if (useLocalServer && berdlTableId.startsWith('local/')) {
                try {
                    const dbName = berdlTableId.replace('local/', '');
                    const serverPort = '3000';
                    return this.request(
                        `http://localhost:${serverPort}/object/${dbName}/tables`,
                        'GET',
                        undefined,
                        true
                    );
                } catch (error) {
                    console.warn('[ApiClient] Local server query failed, using client-side:', error);
                }
            }
            
            // Fall back to client-side SQLite
            return this.localDb.listTables(berdlTableId);
        }

        // Use remote TableScanner service for non-local databases
        return this.request(`/object/${berdlTableId}/tables`, 'GET', undefined, true);
    }

    /**
     * Check if local server is available
     */
    private async isLocalServerAvailable(): Promise<boolean> {
        try {
            const serverPort = '3000'; // Default server port
            const response = await fetch(`http://localhost:${serverPort}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(1000) // 1 second timeout
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    public async getTableData(req: TableDataRequest): Promise<TableDataResponse> {
        // Check if local server is available for server-side querying
        const useServer = await this.isLocalServerAvailable();
        
        // Local SQLite database mode
        if (LocalDbClient.isLocalDb(req.berdl_table_id)) {
            // Check if we have a remote API configured (for separate deployment)
            const hasRemoteApi = this.baseUrl && !this.baseUrl.includes('localhost') && !this.baseUrl.includes('127.0.0.1');
            
            if (hasRemoteApi && req.berdl_table_id.startsWith('local/')) {
                // Use remote API service (separate deployment)
                try {
                    const dbName = req.berdl_table_id.replace('local/', '');
                    const body = {
                        ...req,
                        berdl_table_id: `local/${dbName}`,
                        limit: req.limit || 100,
                        offset: req.offset || 0,
                    };
                    return this.request(
                        `${this.baseUrl}/table-data`,
                        'POST',
                        body,
                        false
                    );
                } catch (error) {
                    console.warn('[ApiClient] Remote API query failed, trying local fallback:', error);
                }
            }
            
            // Check if local integrated server is available
            if (useServer && req.berdl_table_id.startsWith('local/')) {
                try {
                    const serverPort = '3000';
                    const body = {
                        ...req,
                        limit: req.limit || 100,
                        offset: req.offset || 0,
                    };
                    return this.request(
                        `http://localhost:${serverPort}/table-data`,
                        'POST',
                        body,
                        false
                    );
                } catch (error) {
                    console.warn('[ApiClient] Local server query failed, using client-side:', error);
                }
            }
            
            // Fall back to client-side SQLite
            return this.localDb.getTableData(req.berdl_table_id, {
                table_name: req.table_name,
                limit: req.limit,
                offset: req.offset,
                columns: req.columns,
                sort_column: req.sort_column,
                sort_order: req.sort_order,
                search_value: req.search_value,
                col_filter: req.col_filter
            });
        }

        // Use remote TableScanner service for non-local databases
        const body = {
            ...req,
            limit: req.limit || 100,
            offset: req.offset || 0,
            kb_env: this.environment
        };

        return this.request('/table-data', 'POST', body, false);
    }
}

