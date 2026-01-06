/**
 * KBase TableScanner API Client
 * 
 * Wrapper for interacting with the TableScanner REST API.
 * Handles authentication, caching, and error handling.
 * 
 * @fileoverview TableScanner API integration
 * @author KBase Team
 * @license MIT
 */

'use strict';

/**
 * KBase Table Client - API wrapper for TableScanner
 */
class KBaseTableClient {
    /**
     * Create a KBaseTableClient instance
     * 
     * @param {Object} options - Client options
     * @param {string} [options.baseUrl] - TableScanner API base URL
     * @param {string} [options.token] - KBase authentication token
     * @param {string} [options.environment="appdev"] - KBase environment (appdev|prod)
     */
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || this._getDefaultUrl(options.environment);
        this.token = options.token || null;
        this.environment = options.environment || 'appdev';

        /** @type {Map<string, {data: any, timestamp: number}>} Response cache */
        this._cache = new Map();

        /** @type {number} Cache TTL in milliseconds (5 minutes) */
        this._cacheTTL = 300000;
    }

    /**
     * Get default API URL based on environment
     * @private
     */
    _getDefaultUrl(env) {
        const urls = {
            appdev: 'https://appdev.kbase.us/services/berdl_table_scanner',
            prod: 'https://kbase.us/services/berdl_table_scanner',
            local: 'http://localhost:8000'
        };
        return urls[env] || urls.appdev;
    }

    /**
     * Get authorization headers
     * @private
     */
    _getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        if (this.token) {
            headers['Authorization'] = this.token;
        }

        return headers;
    }

    /**
     * Generate cache key from request parameters
     * @private
     */
    _getCacheKey(endpoint, params) {
        return `${endpoint}:${JSON.stringify(params || {})}`;
    }

    /**
     * Check and return cached response if valid
     * @private
     */
    _getFromCache(key) {
        const cached = this._cache.get(key);
        if (cached && (Date.now() - cached.timestamp < this._cacheTTL)) {
            return cached.data;
        }
        return null;
    }

    /**
     * Store response in cache
     * @private
     */
    _setCache(key, data) {
        this._cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Clear the response cache
     */
    clearCache() {
        this._cache.clear();
    }

    /**
     * Make a GET request
     * @private
     */
    async _get(endpoint, params = {}, useCache = true) {
        const cacheKey = this._getCacheKey(endpoint, params);

        if (useCache) {
            const cached = this._getFromCache(cacheKey);
            if (cached) return cached;
        }

        const url = new URL(`${this.baseUrl}${endpoint}`);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                url.searchParams.set(key, String(value));
            }
        });

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: this._getHeaders()
        });

        if (!response.ok) {
            const error = await this._parseError(response);
            throw new Error(error);
        }

        const data = await response.json();
        this._setCache(cacheKey, data);
        return data;
    }

    /**
     * Make a POST request
     * @private
     */
    async _post(endpoint, body, useCache = false) {
        const cacheKey = this._getCacheKey(endpoint, body);

        if (useCache) {
            const cached = this._getFromCache(cacheKey);
            if (cached) return cached;
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: this._getHeaders(),
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await this._parseError(response);
            throw new Error(error);
        }

        const data = await response.json();
        if (useCache) {
            this._setCache(cacheKey, data);
        }
        return data;
    }

    /**
     * Parse error response
     * @private
     */
    async _parseError(response) {
        try {
            const data = await response.json();
            return data.detail || data.message || `HTTP ${response.status}`;
        } catch {
            return `HTTP ${response.status}: ${response.statusText}`;
        }
    }

    // =========================================================================
    // PUBLIC API METHODS
    // =========================================================================

    /**
     * List pangenomes in a BERDLTables object
     * 
     * @param {string} berdlTableId - BERDLTables object reference (e.g., "76990/7/2")
     * @returns {Promise<Object>} Pangenomes response
     */
    async listPangenomes(berdlTableId) {
        return this._get(`/object/${berdlTableId}/pangenomes`, {
            kb_env: this.environment
        });
    }

    /**
     * List tables in a BERDLTables object or pangenome
     * 
     * @param {string} berdlTableId - BERDLTables object reference
     * @param {string} [pangenomeId] - Optional pangenome ID
     * @returns {Promise<Object>} Tables list response
     */
    async listTables(berdlTableId, pangenomeId = null) {
        if (pangenomeId) {
            return this._get(`/object/${berdlTableId}/pangenomes/${pangenomeId}/tables`, {
                kb_env: this.environment
            });
        }
        return this._get(`/object/${berdlTableId}/tables`, {
            kb_env: this.environment
        });
    }

    /**
     * Get table schema (columns)
     * 
     * @param {string} berdlTableId - BERDLTables object reference
     * @param {string} tableName - Table name
     * @returns {Promise<Object>} Schema response with columns
     */
    async getTableSchema(berdlTableId, tableName) {
        return this._get(`/object/${berdlTableId}/tables/${tableName}/schema`, {
            kb_env: this.environment
        });
    }

    /**
     * Query table data via REST endpoint
     * 
     * @param {string} berdlTableId - BERDLTables object reference
     * @param {string} tableName - Table name
     * @param {Object} [options] - Query options
     * @param {number} [options.limit=100] - Maximum rows
     * @param {number} [options.offset=0] - Pagination offset
     * @param {string} [options.sortColumn] - Sort column
     * @param {string} [options.sortOrder="asc"] - Sort direction
     * @param {string} [options.searchValue] - Global search term
     * @param {Object} [options.columnFilters] - Column-specific filters
     * @returns {Promise<Object>} Table data response
     */
    async getTableDataREST(berdlTableId, tableName, options = {}) {
        const params = {
            kb_env: this.environment,
            limit: options.limit || 100,
            offset: options.offset || 0
        };

        if (options.sortColumn) {
            params.sort_column = options.sortColumn;
            params.sort_order = options.sortOrder || 'ASC';
        }

        if (options.searchValue) {
            params.search_value = options.searchValue;
        }

        return this._get(`/object/${berdlTableId}/tables/${tableName}/data`, params, false);
    }

    /**
     * Query table data via POST endpoint (more flexible)
     * 
     * @param {Object} request - Full request object
     * @param {string} request.berdl_table_id - BERDLTables object reference
     * @param {string} request.table_name - Table name
     * @param {number} [request.limit=100] - Maximum rows
     * @param {number} [request.offset=0] - Pagination offset
     * @param {string} [request.columns="all"] - Columns to return
     * @param {string} [request.sort_column] - Sort column
     * @param {string} [request.sort_order="ASC"] - Sort direction
     * @param {string} [request.search_value] - Global search term
     * @param {Object} [request.col_filter] - Column filters
     * @returns {Promise<Object>} Table data response
     */
    async getTableData(request) {
        const body = {
            berdl_table_id: request.berdl_table_id,
            table_name: request.table_name,
            limit: request.limit || 100,
            offset: request.offset || 0,
            kb_env: this.environment
        };

        if (request.columns) body.columns = request.columns;
        if (request.sort_column) body.sort_column = request.sort_column;
        if (request.sort_order) body.sort_order = request.sort_order;
        if (request.search_value) body.search_value = request.search_value;
        if (request.col_filter) body.col_filter = request.col_filter;
        if (request.query_filters) body.query_filters = request.query_filters;

        return this._post('/table-data', body);
    }

    /**
     * Clear server-side cache for a BERDLTables object
     * 
     * @param {string} [berdlTableId] - Optional: clear specific object, or all if not provided
     * @returns {Promise<Object>} Cache clear response
     */
    async clearServerCache(berdlTableId = null) {
        const params = berdlTableId ? { berdl_table_id: berdlTableId } : {};

        const url = new URL(`${this.baseUrl}/clear-cache`);
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: this._getHeaders()
        });

        if (!response.ok) {
            const error = await this._parseError(response);
            throw new Error(error);
        }

        return response.json();
    }

    /**
     * Check service health
     * 
     * @returns {Promise<Object>} Health status
     */
    async checkHealth() {
        return this._get('/health');
    }

    /**
     * Get service status
     * 
     * @returns {Promise<Object>} Service status with version info
     */
    async getStatus() {
        return this._get('/status');
    }

    // =========================================================================
    // CONVENIENCE METHODS
    // =========================================================================

    /**
     * Convert API response to row objects
     * Transforms array-of-arrays format to array of objects
     * 
     * @param {Object} response - Table data response
     * @returns {Array<Object>} Array of row objects
     */
    static responseToObjects(response) {
        if (!response.headers || !response.data) {
            return [];
        }

        return response.data.map(row => {
            const obj = {};
            response.headers.forEach((header, index) => {
                obj[header] = row[index];
            });
            return obj;
        });
    }

    /**
     * Set authentication token
     * 
     * @param {string} token - KBase auth token
     */
    setToken(token) {
        this.token = token;
        this.clearCache();
    }

    /**
     * Set API environment
     * 
     * @param {string} environment - "appdev" or "prod"
     */
    setEnvironment(environment) {
        this.environment = environment;
        this.baseUrl = this._getDefaultUrl(environment);
        this.clearCache();
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KBaseTableClient;
}
