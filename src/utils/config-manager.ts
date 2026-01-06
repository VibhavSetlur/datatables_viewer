/**
 * Config Manager - Enhanced Version
 * 
 * Manages loading and serving configuration for different data types and tables.
 * Integrates with DataTypeRegistry for extensible type support.
 * 
 * @version 3.0.0
 */

import { DataTypeRegistry } from '../core/data-type-registry';
import type {
    AppConfig,
    DataTypeConfig,
    TableSchema,
    ResolvedTableConfig
} from '../types/schema';

// =============================================================================
// LEGACY INTERFACES (for backward compatibility)
// =============================================================================

export interface TransformerConfig {
    type: string;
    options?: Record<string, any>;
    condition?: any;
    fallback?: any;
}

export interface TableColumnConfig {
    column: string;
    displayName?: string;
    width?: string;
    visible?: boolean;
    sortable?: boolean;
    filterable?: boolean;
    transform?: TransformerConfig | TransformerConfig[];
    categories?: string[];
}

export interface CategoryConfig {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    description?: string;
    defaultVisible?: boolean;
}

export interface TableConfig {
    name?: string;
    columns?: TableColumnConfig[];
    categories?: CategoryConfig[];
    settings?: Record<string, any>;
}

export interface LegacyAppConfig {
    name?: string;
    description?: string;
    apiUrl?: string;
    environment?: 'local' | 'appdev' | 'prod';
    defaultSettings?: Record<string, any>;
    tables?: Record<string, TableConfig>;
}

// =============================================================================
// CONFIG MANAGER
// =============================================================================

export class ConfigManager {
    private registry: DataTypeRegistry;
    private legacyConfig: LegacyAppConfig | null = null;
    private currentDataTypeId: string | null = null;
    private isLegacyMode: boolean = false;

    constructor(config?: any) {
        this.registry = DataTypeRegistry.getInstance();

        if (config) {
            // Detect config format
            if (this.isNewConfigFormat(config)) {
                // New AppConfig format
                this.initializeFromAppConfig(config as AppConfig);
            } else {
                // Legacy format - convert and register
                this.initializeFromLegacyConfig(config as LegacyAppConfig);
            }
        }
    }

    /**
     * Check if config is new format (has dataTypes field)
     */
    private isNewConfigFormat(config: any): boolean {
        return config && (config.dataTypes || config.app?.name);
    }

    /**
     * Initialize from new AppConfig format
     */
    private initializeFromAppConfig(config: AppConfig): void {
        this.isLegacyMode = false;
        // The registry will handle loading from AppConfig
        // For now, we'll handle inline configs
        Object.entries(config.dataTypes || {}).forEach(([id, ref]) => {
            if (ref.config) {
                this.registry.registerDataType(ref.config);
                if (!this.currentDataTypeId) {
                    this.currentDataTypeId = id;
                }
            }
        });
    }

    /**
     * Initialize from legacy config format
     */
    private initializeFromLegacyConfig(config: LegacyAppConfig): void {
        this.isLegacyMode = true;
        this.legacyConfig = config;

        // Convert to new format and register
        const dataTypeConfig = DataTypeRegistry.fromLegacyConfig(config);
        this.registry.registerDataType(dataTypeConfig);
        this.currentDataTypeId = 'legacy';
    }

    /**
     * Async initialization from URLs
     */
    public async initializeAsync(configUrl?: string): Promise<void> {
        if (!configUrl) return;

        try {
            const response = await fetch(configUrl);
            if (!response.ok) {
                console.warn(`Failed to load config from ${configUrl}`);
                return;
            }

            const config = await response.json();

            if (this.isNewConfigFormat(config)) {
                // Initialize registry from app config
                await this.registry.initialize(config as AppConfig);

                // Set first available data type as current
                const typeIds = this.registry.getDataTypeIds();
                if (typeIds.length > 0) {
                    this.currentDataTypeId = typeIds[0];
                }
            } else {
                // Legacy format
                this.initializeFromLegacyConfig(config);
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
        }
    }

    // =========================================================================
    // DATA TYPE MANAGEMENT
    // =========================================================================

    /**
     * Set the current data type (from API response)
     */
    public setCurrentDataType(dataTypeId: string): boolean {
        if (this.registry.hasDataType(dataTypeId)) {
            this.currentDataTypeId = dataTypeId;
            return true;
        }

        // Try to detect from various formats
        const detected = this.registry.detectDataType({ dataType: dataTypeId });
        if (detected) {
            this.currentDataTypeId = detected;
            return true;
        }

        console.warn(`Data type "${dataTypeId}" not found in registry`);
        return false;
    }

    /**
     * Get current data type ID
     */
    public getCurrentDataTypeId(): string | null {
        return this.currentDataTypeId;
    }

    /**
     * Get current data type config
     */
    public getCurrentDataType(): DataTypeConfig | undefined {
        if (!this.currentDataTypeId) return undefined;
        return this.registry.getDataType(this.currentDataTypeId);
    }

    /**
     * Detect and set data type from API response
     */
    public detectDataType(apiResponse: any): string | null {
        const detected = this.registry.detectDataType(apiResponse);
        if (detected) {
            this.currentDataTypeId = detected;
        }
        return detected;
    }

    // =========================================================================
    // TABLE CONFIG ACCESS
    // =========================================================================

    /**
     * Get table configuration (resolved with defaults)
     */
    public getTableConfig(tableName: string): TableConfig & { name: string } {
        if (this.currentDataTypeId) {
            const resolved = this.registry.getResolvedTableConfig(this.currentDataTypeId, tableName);
            if (resolved) {
                return this.convertResolvedToLegacy(resolved);
            }
        }

        // Fallback to legacy
        if (this.legacyConfig?.tables?.[tableName]) {
            const tableConfig = this.legacyConfig.tables[tableName];
            return {
                name: tableConfig.name || tableName,
                categories: tableConfig.categories || [],
                columns: tableConfig.columns || [],
                settings: {
                    ...this.legacyConfig.defaultSettings,
                    ...(tableConfig.settings || {})
                }
            };
        }

        // Default empty config
        return {
            name: tableName,
            categories: [],
            columns: [],
            settings: this.getGlobalSettings()
        };
    }

    /**
     * Get table schema (new format)
     */
    public getTableSchema(tableName: string): TableSchema | undefined {
        if (!this.currentDataTypeId) return undefined;
        return this.registry.getTableSchema(this.currentDataTypeId, tableName);
    }

    /**
     * Get resolved table config (new format)
     */
    public getResolvedTableConfig(tableName: string): ResolvedTableConfig | null {
        if (!this.currentDataTypeId) return null;
        return this.registry.getResolvedTableConfig(this.currentDataTypeId, tableName);
    }

    /**
     * Check if table has configuration
     */
    public hasTableConfig(tableName: string): boolean {
        if (this.currentDataTypeId) {
            const schema = this.registry.getTableSchema(this.currentDataTypeId, tableName);
            if (schema) return true;
        }

        // Check legacy
        return !!(this.legacyConfig?.tables &&
            Object.prototype.hasOwnProperty.call(this.legacyConfig.tables, tableName));
    }

    /**
     * Get all table names for current data type
     */
    public getTableNames(): string[] {
        if (this.currentDataTypeId) {
            return this.registry.getTableNames(this.currentDataTypeId);
        }

        if (this.legacyConfig?.tables) {
            return Object.keys(this.legacyConfig.tables);
        }

        return [];
    }

    // =========================================================================
    // APP SETTINGS
    // =========================================================================

    /**
     * Get app name
     */
    public getAppName(): string {
        return this.registry.getAppName() ||
            this.legacyConfig?.name ||
            'DataTables Viewer';
    }

    /**
     * Get API URL
     */
    public getApiUrl(): string | null {
        return this.registry.getApiUrl() ||
            this.legacyConfig?.apiUrl ||
            null;
    }

    /**
     * Get environment
     */
    public getEnvironment(): 'local' | 'appdev' | 'prod' {
        const appConfig = this.registry.getAppConfig();
        return appConfig?.app.environment ||
            this.legacyConfig?.environment ||
            'local';
    }

    /**
     * Get global settings
     */
    public getGlobalSettings(): Record<string, any> {
        const registrySettings = this.registry.getGlobalSettings();
        const legacySettings = this.legacyConfig?.defaultSettings || {};

        // Merge with registry settings taking precedence, then legacy overrides
        return {
            ...registrySettings,
            ...legacySettings
        };
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Convert resolved config to legacy format for backward compatibility
     */
    private convertResolvedToLegacy(resolved: ResolvedTableConfig): TableConfig & { name: string } {
        return {
            name: resolved.displayName,
            categories: resolved.categories.map(cat => ({
                id: cat.id,
                name: cat.name,
                icon: cat.icon,
                color: cat.color,
                description: cat.description,
                defaultVisible: cat.defaultVisible
            })),
            columns: resolved.columns.map(col => ({
                column: col.column,
                displayName: col.displayName,
                width: col.width,
                visible: col.visible,
                sortable: col.sortable,
                filterable: col.filterable,
                categories: col.categories,
                transform: Array.isArray(col.transform)
                    ? { type: 'chain', options: { transforms: col.transform } }
                    : col.transform as TransformerConfig | undefined
            })),
            settings: {
                pageSize: resolved.settings.pageSize,
                density: resolved.settings.density,
                showRowNumbers: resolved.settings.showRowNumbers,
                enableSelection: resolved.settings.enableSelection,
                enableExport: resolved.settings.enableExport
            }
        };
    }

    /**
     * Get the registry instance
     */
    public getRegistry(): DataTypeRegistry {
        return this.registry;
    }

    /**
     * Check if in legacy mode
     */
    public isLegacy(): boolean {
        return this.isLegacyMode;
    }
}
