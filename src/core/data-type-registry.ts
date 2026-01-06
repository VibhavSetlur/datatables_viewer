/**
 * Data Type Registry
 * 
 * Central registry for managing data type configurations.
 * Implements the Singleton pattern to ensure a single source of truth
 * for all configuration data across the application.
 * 
 * @version 3.0.0
 */

import type {
    AppConfig,
    DataTypeConfig,
    DataTypeReference,
    TableSchema,
    ColumnSchema,
    CategorySchema,
    ResolvedTableConfig,
    ResolvedColumnConfig,
    GlobalSettings,
    TableSettings,
    ColumnDataType,
    TextAlign
} from '../types/schema';

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_GLOBAL_SETTINGS: Required<GlobalSettings> = {
    pageSize: 50,
    theme: 'light',
    density: 'default',
    showRowNumbers: true,
    locale: 'en-US',
    dateFormat: 'YYYY-MM-DD',
    numberFormat: {
        decimals: 2,
        thousandsSeparator: ',',
        decimalSeparator: '.'
    }
};

const DEFAULT_TABLE_SETTINGS: Required<TableSettings> = {
    pageSize: 50,
    density: 'default',
    showRowNumbers: true,
    enableSelection: true,
    enableExport: true,
    enableColumnReorder: false,
    enableColumnResize: true,
    defaultSortColumn: '',
    defaultSortOrder: 'asc'
};

const DEFAULT_COLUMN_CONFIG: Partial<ColumnSchema> = {
    visible: true,
    sortable: true,
    filterable: true,
    searchable: true,
    copyable: false,
    editable: false,
    resizable: true,
    dataType: 'string',
    align: 'left',
    width: 'auto'
};

/**
 * Map data types to default alignment
 */
const DATA_TYPE_ALIGNMENTS: Partial<Record<ColumnDataType, TextAlign>> = {
    number: 'right',
    integer: 'right',
    float: 'right',
    percentage: 'right',
    currency: 'right',
    filesize: 'right',
    duration: 'right',
    boolean: 'center',
    date: 'center',
    datetime: 'center',
    timestamp: 'center'
};

// Filter types are inferred from dataType in the column schema
// No explicit mapping needed here - handled in UI layer

// =============================================================================
// REGISTRY CLASS
// =============================================================================

export class DataTypeRegistry {
    private static instance: DataTypeRegistry | null = null;

    private appConfig: AppConfig | null = null;
    private dataTypes: Map<string, DataTypeConfig> = new Map();
    private loadedUrls: Set<string> = new Set();
    private matchMap: Map<string, string> = new Map(); // Maps object type strings to data type IDs
    private globalSettings: Required<GlobalSettings> = { ...DEFAULT_GLOBAL_SETTINGS };

    // ─── Singleton ─────────────────────────────────────────────────────────

    private constructor() { }

    /**
     * Get the singleton instance
     */
    public static getInstance(): DataTypeRegistry {
        if (!DataTypeRegistry.instance) {
            DataTypeRegistry.instance = new DataTypeRegistry();
        }
        return DataTypeRegistry.instance;
    }

    /**
     * Reset the registry (mainly for testing)
     */
    public static reset(): void {
        DataTypeRegistry.instance = null;
    }

    // ─── Initialization ────────────────────────────────────────────────────

    /**
     * Initialize registry from an app configuration
     */
    public async initialize(config: AppConfig): Promise<void> {
        this.appConfig = config;

        // Apply global settings
        if (config.defaults) {
            this.globalSettings = {
                ...DEFAULT_GLOBAL_SETTINGS,
                ...config.defaults,
                numberFormat: {
                    ...DEFAULT_GLOBAL_SETTINGS.numberFormat,
                    ...config.defaults.numberFormat
                }
            };
        }

        // Initialize match map and load data types
        const loadPromises: Promise<void>[] = [];

        for (const [id, ref] of Object.entries(config.dataTypes)) {
            // Index match strings
            if (ref.matches) {
                ref.matches.forEach(match => this.matchMap.set(match, id));
            }

            if (ref.autoLoad !== false) {
                loadPromises.push(this.loadDataType(id, ref));
            }
        }

        await Promise.all(loadPromises);
    }

    /**
     * Load a data type configuration
     */
    private async loadDataType(_id: string, ref: DataTypeReference): Promise<void> {
        // Inline config takes precedence
        if (ref.config) {
            this.registerDataType(ref.config);
            return;
        }

        // Load from URL
        if (ref.configUrl && !this.loadedUrls.has(ref.configUrl)) {
            try {
                const response = await fetch(ref.configUrl);
                if (!response.ok) {
                    console.warn(`Failed to load config from ${ref.configUrl}: ${response.status}`);
                    return;
                }
                const config = await response.json() as DataTypeConfig;
                this.registerDataType(config);
                this.loadedUrls.add(ref.configUrl);
            } catch (error) {
                console.error(`Error loading data type config from ${ref.configUrl}:`, error);
            }
        }
    }

    // ─── Registration ──────────────────────────────────────────────────────

    /**
     * Register a data type configuration
     */
    public registerDataType(config: DataTypeConfig): void {
        if (!config.id) {
            console.error('DataTypeConfig must have an id');
            return;
        }

        // Validate version
        if (!config.version) {
            console.warn(`DataTypeConfig ${config.id} missing version, defaulting to 1.0.0`);
            config.version = '1.0.0';
        }

        this.dataTypes.set(config.id, config);
        console.log(`Registered data type: ${config.id} v${config.version}`);
    }

    /**
     * Unregister a data type
     */
    public unregisterDataType(id: string): boolean {
        return this.dataTypes.delete(id);
    }

    // ─── Lookup ────────────────────────────────────────────────────────────

    /**
     * Get a data type configuration by ID
     */
    public getDataType(id: string): DataTypeConfig | undefined {
        return this.dataTypes.get(id);
    }

    /**
     * Check if a data type is registered
     */
    public hasDataType(id: string): boolean {
        return this.dataTypes.has(id);
    }

    /**
     * Get all registered data types
     */
    public getAllDataTypes(): DataTypeConfig[] {
        return Array.from(this.dataTypes.values());
    }

    /**
     * Get all data type IDs
     */
    public getDataTypeIds(): string[] {
        return Array.from(this.dataTypes.keys());
    }

    /**
     * Get table schema for a data type
     */
    public getTableSchema(dataTypeId: string, tableName: string): TableSchema | undefined {
        const dataType = this.dataTypes.get(dataTypeId);
        if (!dataType) return undefined;
        return dataType.tables[tableName];
    }

    /**
     * Get column schema for a table
     */
    public getColumnSchema(
        dataTypeId: string,
        tableName: string,
        columnName: string
    ): ColumnSchema | undefined {
        const table = this.getTableSchema(dataTypeId, tableName);
        if (!table) return undefined;
        return table.columns.find(c => c.column === columnName);
    }

    /**
     * Get all table names for a data type
     */
    public getTableNames(dataTypeId: string): string[] {
        const dataType = this.dataTypes.get(dataTypeId);
        if (!dataType) return [];
        return Object.keys(dataType.tables);
    }

    // ─── Resolution ────────────────────────────────────────────────────────

    /**
     * Get fully resolved table configuration with all defaults applied
     */
    public getResolvedTableConfig(
        dataTypeId: string,
        tableName: string
    ): ResolvedTableConfig | null {
        const dataType = this.dataTypes.get(dataTypeId);
        if (!dataType) return null;

        const tableSchema = dataType.tables[tableName];
        if (!tableSchema) return null;

        // Merge settings: global → dataType defaults → table settings
        const settings: Required<TableSettings> = {
            ...DEFAULT_TABLE_SETTINGS,
            pageSize: dataType.defaults?.pageSize ?? DEFAULT_TABLE_SETTINGS.pageSize,
            density: dataType.defaults?.density ?? DEFAULT_TABLE_SETTINGS.density,
            showRowNumbers: dataType.defaults?.showRowNumbers ?? DEFAULT_TABLE_SETTINGS.showRowNumbers,
            enableSelection: dataType.defaults?.enableSelection ?? DEFAULT_TABLE_SETTINGS.enableSelection,
            enableExport: dataType.defaults?.enableExport ?? DEFAULT_TABLE_SETTINGS.enableExport,
            ...tableSchema.settings
        };

        // Merge categories: shared → table-specific
        const categories: CategorySchema[] = [
            ...(dataType.sharedCategories || []),
            ...(tableSchema.categories || [])
        ];

        // Resolve columns
        const columns: ResolvedColumnConfig[] = tableSchema.columns.map(col =>
            this.resolveColumnConfig(col)
        );

        return {
            name: tableName,
            displayName: tableSchema.displayName || tableName,
            settings,
            categories,
            columns,
            virtualColumns: tableSchema.virtualColumns || [],
            rowConfig: {
                selectable: tableSchema.rowConfig?.selectable ?? true,
                clickable: tableSchema.rowConfig?.clickable ?? false,
                clickAction: tableSchema.rowConfig?.clickAction ?? '',
                heightMode: tableSchema.rowConfig?.heightMode ?? 'auto',
                height: tableSchema.rowConfig?.height ?? 'auto',
                conditionalStyles: tableSchema.rowConfig?.conditionalStyles ?? []
            }
        };
    }

    /**
     * Resolve a column configuration with defaults
     */
    private resolveColumnConfig(col: ColumnSchema): ResolvedColumnConfig {
        const dataType = col.dataType || 'string';
        const defaultAlign = DATA_TYPE_ALIGNMENTS[dataType] || 'left';

        return {
            column: col.column,
            displayName: col.displayName || col.column.replace(/_/g, ' '),
            dataType,
            visible: col.visible ?? DEFAULT_COLUMN_CONFIG.visible!,
            sortable: col.sortable ?? DEFAULT_COLUMN_CONFIG.sortable!,
            filterable: col.filterable ?? DEFAULT_COLUMN_CONFIG.filterable!,
            searchable: col.searchable ?? DEFAULT_COLUMN_CONFIG.searchable!,
            copyable: col.copyable ?? (dataType === 'id'),
            width: col.width || 'auto',
            align: col.align || defaultAlign,
            categories: col.categories || [],
            transform: col.transform
        };
    }

    // ─── Global Settings ───────────────────────────────────────────────────

    /**
     * Get global settings
     */
    public getGlobalSettings(): Required<GlobalSettings> {
        return { ...this.globalSettings };
    }

    /**
     * Get app configuration
     */
    public getAppConfig(): AppConfig | null {
        return this.appConfig;
    }

    /**
     * Get API URL from app config
     */
    public getApiUrl(): string | null {
        return this.appConfig?.app.apiUrl || null;
    }

    /**
     * Get app name
     */
    public getAppName(): string {
        return this.appConfig?.app.name || 'DataTables Viewer';
    }

    // ─── Type Detection ────────────────────────────────────────────────────

    /**
     * Detect data type from API response
     * The API should return a dataType field indicating the object type
     */
    public detectDataType(apiResponse: { dataType?: string; type?: string; objectType?: string; object_type?: string }): string | null {
        // Try common field names for type hint
        const typeHint = apiResponse.dataType || apiResponse.type || apiResponse.objectType || apiResponse.object_type;

        if (!typeHint) return null;

        // 1. Check direct ID match
        if (this.hasDataType(typeHint)) {
            return typeHint;
        }

        // 2. Check matches map
        if (this.matchMap.has(typeHint)) {
            return this.matchMap.get(typeHint)!;
        }

        // 3. Normalize type hint (snake_case, lowercase)
        const normalized = typeHint.toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (this.hasDataType(normalized)) {
            return normalized;
        }

        // Return first registered type as fallback
        const firstType = this.getDataTypeIds()[0];
        if (firstType) {
            console.warn(`Unknown data type "${typeHint}", falling back to "${firstType}"`);
            return firstType;
        }

        return null;
    }

    // ─── Legacy Compatibility ──────────────────────────────────────────────

    /**
     * Create a DataTypeConfig from legacy config format
     * This allows gradual migration from the old config structure
     */
    public static fromLegacyConfig(legacyConfig: any): DataTypeConfig {
        const tables: Record<string, TableSchema> = {};

        if (legacyConfig.tables) {
            for (const [tableName, tableConfig] of Object.entries(legacyConfig.tables as Record<string, any>)) {
                tables[tableName] = {
                    displayName: tableConfig.name || tableName,
                    categories: tableConfig.categories || [],
                    columns: (tableConfig.columns || []).map((col: any) => ({
                        column: col.column,
                        displayName: col.displayName,
                        dataType: col.dataType || 'string',
                        visible: col.visible,
                        sortable: col.sortable,
                        filterable: col.filterable,
                        width: col.width,
                        categories: col.categories,
                        transform: col.transform
                    })),
                    settings: tableConfig.settings
                };
            }
        }

        return {
            id: 'legacy',
            name: legacyConfig.name || 'Legacy Config',
            version: '1.0.0',
            description: legacyConfig.description,
            defaults: {
                pageSize: legacyConfig.defaultSettings?.pageSize,
                density: legacyConfig.defaultSettings?.density,
                showRowNumbers: legacyConfig.defaultSettings?.showRowNumbers
            },
            tables
        };
    }
}

// Export singleton getter for convenience
export const getRegistry = () => DataTypeRegistry.getInstance();
