/**
 * KBase TableScanner API Client
 * 
 * TypeScript implementation of the KBase Client.
 * All database operations now go through the server API (no client-side SQLite).
 */

import type { ApiConfig } from '../../types/schema';
import { logger } from '../../utils/logger';
import {
    type AdvancedFilter,
    type Aggregation,
    type ApiTableDataRequest,
    type TableDataRequest,
    type ColumnMetadata,
    type QueryMetadata,
    type TableDataResponse,
    type TableListResponse,
    DEFAULT_LIMIT,
    DEFAULT_OFFSET,
} from '../../types/shared-types';

interface ClientOptions {
    apiConfig?: ApiConfig;
    /** Map of service IDs to URLs */
    serviceUrls?: Record<string, string>;
    baseUrl?: string;
    token?: string;
    /** @deprecated Use serviceUrls instead */
    environment?: string;
    headers?: Record<string, string>;
}

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

interface UploadResponse {
    handle: string;
    filename: string;
    size_bytes: number;
    message: string;
}

// Re-export types that external code may need
export type {
    AdvancedFilter,
    Aggregation,
    ColumnMetadata,
    QueryMetadata,
    TableDataResponse,
    UploadResponse,
};

// Use ApiTableDataRequest for API calls by default
type ApiTableRequest = ApiTableDataRequest;

export class ApiClient {
    private baseUrl: string;
    private serviceUrls: Record<string, string> = {};
    private token: string | null;
    private environment: string;
    private customHeaders: Record<string, string>;
    private cache: Map<string, CacheEntry<any>>;
    private cacheTTL: number;

    constructor(options: ClientOptions = {}) {
        this.environment = options.environment || 'appdev';
        this.serviceUrls = options.serviceUrls || {};

        if (options.apiConfig) {
            this.baseUrl = options.apiConfig.url;
            this.customHeaders = options.apiConfig.headers || {};
        } else {
            this.baseUrl = options.baseUrl || this.serviceUrls['tablescanner'] || this.getDefaultUrl(this.environment);
            this.customHeaders = options.headers || {};
        }

        this.token = options.token || null;
        this.cache = new Map();
        this.cacheTTL = 300000; // 5 minutes
    }

    /**
     * Check if a database ID is a local/uploaded database.
     */
    public static isLocalDb(berdlTableId: string): boolean {
        return berdlTableId.startsWith('local:') || berdlTableId.startsWith('local/');
    }

    /**
     * Get schema for a specific table.
     */
    public async getTableSchema(
        berdlTableId: string,
        tableName: string
    ): Promise<Array<{ name: string; type: string; notnull?: boolean; pk?: boolean }>> {
        try {
            const schema = await this.request(
                `/object/${berdlTableId}/tables/${tableName}/schema`,
                'GET',
                undefined,
                true
            );
            // TableScanner returns { columns: [...] }
            if (schema && Array.isArray((schema as any).columns)) {
                return (schema as any).columns;
            }
            if (Array.isArray(schema)) return schema as any;
        } catch (error) {
            logger.warn('[ApiClient] Schema fetch failed', error);
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
            // TableScanner API expects "Bearer <token>" format
            const authValue = this.token.startsWith('Bearer ')
                ? this.token
                : `Bearer ${this.token}`;
            (headers as any)['Authorization'] = authValue;
        } else {
            // Try to get token from kbase_session cookie
            const cookieToken = this.getKBaseSessionCookie();
            if (cookieToken) {
                (headers as any)['Authorization'] = `Bearer ${cookieToken}`;
            }
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
            let errorDetails: any = null;
            try {
                const data = await response.json();
                errorDetails = data;
                // Try multiple common error message fields - prioritize detail field
                if (data.detail && typeof data.detail === 'string' && data.detail.length > 0) {
                    errorMsg = data.detail;
                } else {
                    errorMsg = data.message || data.error || data.msg || errorMsg;
                }
                // For 500 errors with Shock API issues, include full context
                if (response.status === 500 && data.detail && data.detail.includes('shock-api')) {
                    errorMsg = data.detail; // Use the full detail message
                }
            } catch {
                const text = await response.text().catch(() => '');
                errorMsg = text || `${errorMsg}: ${response.statusText}`;
            }

            // Create error with additional context
            const error = new Error(errorMsg);
            (error as any).status = response.status;
            (error as any).details = errorDetails;
            throw error;
        }

        const data = await response.json();
        if (useCache) {
            this.setCache(cacheKey, data);
        }
        return data as T;
    }

    // Public Methods

    /**
     * Upload a SQLite database file to the server.
     * Returns a handle that can be used as berdl_table_id.
     */
    /**
     * Helper to get kbase_session cookie.
     * Checks 'kbase_session' first, then 'kbase_session_backup'.
     */
    private getKBaseSessionCookie(): string | null {
        if (typeof document === 'undefined') {
            return null;
        }

        try {
            const cookies = document.cookie.split('; ').reduce((acc, cookie) => {
                const [key, value] = cookie.split('=');
                if (key && value) {
                    acc[key.trim()] = value.trim();
                }
                return acc;
            }, {} as Record<string, string>);

            // 1. Try primary session cookie
            if (cookies.kbase_session) {
                logger.debug('[ApiClient] Found kbase_session cookie');
                return cookies.kbase_session;
            }

            // 2. Try backup session cookie
            if (cookies.kbase_session_backup) {
                logger.debug('[ApiClient] Found kbase_session_backup cookie');
                return cookies.kbase_session_backup;
            }

            logger.debug('[ApiClient] No KBase session cookies found');
        } catch (error) {
            logger.warn('[ApiClient] Error parsing cookies', error);
        }

        return null;
    }


    public async listTables(berdlTableId: string): Promise<any> {
        // All databases now go through the API
        return this.request(`/object/${berdlTableId}/tables`, 'GET', undefined, true);
    }

    /**
     * Test connection to the API server.
     */
    public async testConnection(): Promise<{ status: string; version?: string; detail?: string }> {
        try {
            // Try the health endpoint first
            return await this.request('/health', 'GET', undefined, false);
        } catch (_error) {
            // Fallback to root endpoint
            try {
                return await this.request('/', 'GET', undefined, false);
            } catch (e: any) {
                throw new Error(`Connection failed: ${e.message}`);
            }
        }
    }



    public async getTableData(req: ApiTableRequest): Promise<TableDataResponse> {
        // All databases now go through the API
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

    /**
     * Get statistics for a specific table.
     */
    public async getTableStatistics(berdlTableId: string, tableName: string): Promise<any> {
        return this.request(`/object/${berdlTableId}/tables/${tableName}/stats`, 'GET', undefined, true);
    }

    // ===== Multi-Database Support (v2.1) =====

    /**
     * List all databases in a workspace object.
     * Use this for objects containing multiple pangenomes.
     * @param berdlTableId - Workspace object reference (UPA format)
     */
    public async listDatabases(berdlTableId: string): Promise<TableListResponse> {
        return this.request(`/object/${berdlTableId}/databases`, 'GET', undefined, true);
    }

    /**
     * List tables in a specific database within a multi-database object.
     * @param berdlTableId - Workspace object reference (UPA format)
     * @param dbName - Database name within the object
     */
    public async listTablesInDatabase(berdlTableId: string, dbName: string): Promise<TableListResponse> {
        return this.request(`/object/${berdlTableId}/db/${encodeURIComponent(dbName)}/tables`, 'GET', undefined, true);
    }

    /**
     * Get table data from a specific database within a multi-database object.
     * @param berdlTableId - Workspace object reference (UPA format)
     * @param dbName - Database name within the object
     * @param req - Table data request parameters
     */
    public async getTableDataFromDatabase(
        berdlTableId: string,
        dbName: string,
        req: TableDataRequest
    ): Promise<TableDataResponse> {
        const params = new URLSearchParams({
            limit: String(req.limit || DEFAULT_LIMIT),
            offset: String(req.offset || DEFAULT_OFFSET),
            kb_env: this.environment
        });

        if (req.sort_column) params.set('sort_column', req.sort_column);
        if (req.sort_order) params.set('sort_order', req.sort_order);
        if (req.search_value) params.set('search', req.search_value);

        const path = `/object/${berdlTableId}/db/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(req.table_name)}/data?${params.toString()}`;
        return this.request(path, 'GET', undefined, true);
    }

    // ===== KBase Workspace JSON-RPC Bridge =====

    /**
     * Get the KBase Workspace service URL based on configuration.
     */
    private getWorkspaceUrl(): string {
        if (this.serviceUrls['workspace']) {
            return this.serviceUrls['workspace'];
        }

        // Fallback to legacy hardcoded logic if not configured
        const urls: Record<string, string> = {
            appdev: 'https://appdev.kbase.us/services/ws',
            prod: 'https://kbase.us/services/ws',
            local: 'https://appdev.kbase.us/services/ws'
        };
        return urls[this.environment] || urls.appdev;
    }

    /**
     * Make a JSON-RPC call to the KBase Workspace service.
     * @param method The Workspace method to call (e.g., 'get_objects2')
     * @param params The parameters array for the method
     * @returns The result from the Workspace service
     */
    public async workspaceRpc<T>(method: string, params: any[]): Promise<T> {
        const wsUrl = this.getWorkspaceUrl();
        const response = await fetch(wsUrl, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                version: '1.1',
                method: `Workspace.${method}`,
                params: params,
                id: Date.now().toString()
            })
        });

        if (!response.ok) {
            throw new Error(`Workspace RPC failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        if (result.error) {
            throw new Error(result.error.message || 'Workspace RPC error');
        }
        return result.result[0];
    }

    /**
     * Fetch a workspace object by reference (UPA).
     * @param ref The object reference (e.g., '76990/7/2')
     * @returns The object data
     */
    public async getWorkspaceObject(ref: string): Promise<any> {
        const result = await this.workspaceRpc<{ data: any[] }>('get_objects2', [{
            objects: [{ ref }]
        }]);
        return result.data[0].data;
    }

    /**
     * Get workspace object info by reference.
     * @param ref The object reference (e.g., '76990/7/2')
     * @returns Object info array
     */
    public async getWorkspaceObjectInfo(ref: string): Promise<any[]> {
        return this.workspaceRpc<any[]>('get_object_info3', [{
            objects: [{ ref }],
            includeMetadata: 1
        }]);
    }
}
