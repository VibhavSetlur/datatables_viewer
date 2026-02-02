/**
 * Config Manager
 * 
 * Manages configuration resolution using a Dual-Slot model:
 * 1. Active Config (Workspace/Remote) - Primary
 * 2. Fallback Config (Default/Local) - Secondary
 * 
 * Also acts as the central registry for defaults, data type configurations,
 * and service discovery, replacing the legacy DataTypeRegistry.
 * 
 * @version 5.0.0
 */

import { getConfigResolver } from './ConfigResolver';
import { logger } from '../../utils/logger';
import type {
    AppConfig,
    DataTypeConfig,
    TableSchema,
    ResolvedTableConfig,
    ResolvedColumnConfig,
    TableSettings,
    GlobalSettings,
    ColumnSchema,
    CategorySchema,
    ColumnDataType,
    TextAlign
} from '../../types/schema';
import type { ApiClient } from '../api/ApiClient';

// =============================================================================
// CONSTANTS & DEFAULTS
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
    },
    defaultSource: '',
    autoLoad: false
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

export class ConfigManager {
    // State
    private activeConfig: DataTypeConfig | null = null;
    private fallbackConfig: DataTypeConfig | null = null;

    // Registry State (Consolidated)
    private appConfig: AppConfig | null = null;
    private globalSettings: Required<GlobalSettings> = { ...DEFAULT_GLOBAL_SETTINGS };
    private serviceUrls: Record<string, string> = {};


    constructor(config?: AppConfig) {
        if (config) {
            this.initializeWithAppConfig(config);
        }
    }

    /**
     * Initialize with static app config (synchronous)
     */
    private initializeWithAppConfig(config: AppConfig) {
        this.appConfig = config;

        // 1. Process Defaults
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

        // 2. Process Service URLs
        this.serviceUrls = {};
        if (config.apis) {
            Object.values(config.apis).forEach(api => {
                if (api.url) {
                    this.serviceUrls[api.id] = api.url;
                }
            });
        }
    }

    /**
     * Async initialization: Loads fallback and attempts to fetch active workspace config.
     * @param sourceRef The source object reference (UPA)
     * @param apiClient API Client for fetching data
     */
    public async initialize(sourceRef: string, apiClient: ApiClient): Promise<void> {
        const resolver = getConfigResolver();

        // 1. Load Fallback (always loaded as safety)
        try {
            const fallbackRes = await resolver.resolve(sourceRef, { forceDefault: true });
            if (fallbackRes.config) {
                this.fallbackConfig = fallbackRes.config;
                logger.info(`[ConfigManager] Fallback config loaded: ${this.fallbackConfig.id}`);
            }
        } catch (e) {
            logger.error('[ConfigManager] Failed to load fallback config', e);
        }

        // 2. Try Workspace (The "Active" slot)
        try {
            const mockRes = await resolver.resolveFromWorkspace(sourceRef, apiClient);
            if (mockRes) {
                this.activeConfig = mockRes;
                logger.info(`[ConfigManager] Active config loaded from Workspace: ${this.activeConfig.id}`);
            }
        } catch (e) {
            logger.warn("[ConfigManager] Workspace config retrieval failed, using fallback.", e);
            this.activeConfig = null;
        }
    }

    /**
     * Get the current effective configuration.
     * Priority: Active > Fallback > Null
     */
    public getConfig(): DataTypeConfig | null {
        return this.activeConfig || this.fallbackConfig || null;
    }

    /**
     * Get table configuration (resolved with defaults)
     * If table not found in config, returns a default configuration to allow auto-detection
     */
    public getTableConfig(tableName: string): ResolvedTableConfig | null {
        const config = this.getConfig();
        if (!config) return null;

        const tableSchema = config.tables[tableName] || {
            displayName: tableName,
            columns: [],
            settings: {}
        };

        return this.resolveTableConfig(config, tableName, tableSchema);
    }

    /**
     * Helper to resolve a specific table config using the merged defaults logic
     */
    private resolveTableConfig(
        dataConfig: DataTypeConfig,
        tableName: string,
        schema: TableSchema
    ): ResolvedTableConfig {
        // Merge settings: global defaults -> dataType defaults -> table settings
        const settings: Required<TableSettings> = {
            ...DEFAULT_TABLE_SETTINGS,
            pageSize: dataConfig.defaults?.pageSize ?? DEFAULT_TABLE_SETTINGS.pageSize,
            density: dataConfig.defaults?.density ?? DEFAULT_TABLE_SETTINGS.density,
            showRowNumbers: dataConfig.defaults?.showRowNumbers ?? DEFAULT_TABLE_SETTINGS.showRowNumbers,
            // Inherit logic can be expanded here
            ...schema.settings
        };

        // Merge categories
        const categories: CategorySchema[] = [
            ...(dataConfig.sharedCategories || []),
            ...(schema.categories || [])
        ];

        // Resolve columns
        const columns: ResolvedColumnConfig[] = schema.columns.map(col =>
            this.resolveColumnConfig(col)
        );

        return {
            name: tableName,
            displayName: schema.displayName || tableName,
            description: schema.description, // Pass through, handled by UI optional chaining
            icon: schema.icon,
            settings,
            categories,
            columns,
            virtualColumns: schema.virtualColumns || [],
            rowConfig: {
                selectable: schema.rowConfig?.selectable ?? true,
                clickable: schema.rowConfig?.clickable ?? false,
                clickAction: schema.rowConfig?.clickAction ?? '',
                heightMode: schema.rowConfig?.heightMode ?? 'auto',
                height: schema.rowConfig?.height ?? 'auto',
                conditionalStyles: schema.rowConfig?.conditionalStyles ?? []
            }
        };
    }

    private resolveColumnConfig(col: ColumnSchema): ResolvedColumnConfig {
        const dataType = col.dataType || 'string';
        const defaultAlign = DATA_TYPE_ALIGNMENTS[dataType] || 'left';

        return {
            column: col.column,
            displayName: col.displayName || col.column.replace(/_/g, ' '),
            dataType,
            visible: col.visible ?? (DEFAULT_COLUMN_CONFIG.visible ?? true),
            sortable: col.sortable ?? (DEFAULT_COLUMN_CONFIG.sortable ?? true),
            filterable: col.filterable ?? (DEFAULT_COLUMN_CONFIG.filterable ?? true),
            searchable: col.searchable ?? (DEFAULT_COLUMN_CONFIG.searchable ?? true),
            copyable: col.copyable ?? (dataType === 'id'),
            width: col.width || 'auto',
            align: col.align || defaultAlign,
            categories: col.categories || [],
            transform: col.transform
        };
    }

    /**
     * Get table schema (raw)
     */
    public getTableSchema(tableName: string): TableSchema | undefined {
        const config = this.getConfig();
        if (!config) return undefined;
        return config.tables[tableName];
    }

    /**
     * Check if table has configuration
     */
    public hasTableConfig(tableName: string): boolean {
        const config = this.getConfig();
        return !!config?.tables[tableName];
    }

    /**
     * Get all table names
     */
    public getTableNames(): string[] {
        const config = this.getConfig();
        return config ? Object.keys(config.tables) : [];
    }

    // =========================================================================
    // APP SETTINGS DELEGATES (Absorbed)
    // =========================================================================

    public getAppName(): string {
        return this.appConfig?.app?.name || 'DataTables Viewer';
    }

    public getServiceUrls(): Record<string, string> {
        return this.serviceUrls;
    }

    /** 
     * Get specific service URL by ID (Upgrade: Direct Lookup)
     */
    public getServiceUrl(serviceId: string): string | undefined {
        return this.serviceUrls[serviceId];
    }

    public getGlobalSettings(): Required<GlobalSettings> {
        return this.globalSettings;
    }

    // =========================================================================
    // LEGACY METHODS (Kept until full removal)
    // =========================================================================

    public getEnvironment(): string {
        return 'appdev'; // Deprecated, strictly legacy
    }
}
