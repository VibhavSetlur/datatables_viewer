/**
 * Plugin System
 * 
 * Extensible architecture allowing developers to add custom functionality
 * through a well-defined plugin API.
 * 
 * @version 1.0.0
 */

import { EventBus, eventBus } from '../state/EventBus';
import type { StateManager, AppState } from '../state/StateManager';
import { logger } from '../../utils/logger';

// =============================================================================
// PLUGIN INTERFACES
// =============================================================================

/**
 * Plugin lifecycle hooks
 */
export interface PluginHooks {
    /** Called when plugin is registered */
    onRegister?: () => void;

    /** Called when plugin is activated */
    onActivate?: () => void;

    /** Called when plugin is deactivated */
    onDeactivate?: () => void;

    /** Called when data is loaded */
    onDataLoad?: (data: { tableId: string; headers: string[]; data: any[][] }) => void;

    /** Called before rendering */
    onBeforeRender?: (state: AppState) => AppState;

    /** Called after rendering */
    onAfterRender?: (container: HTMLElement) => void;

    /** Called before export */
    onBeforeExport?: (data: any[][], format: string) => any[][];

    /** Called on cell render (for custom cell content) */
    onCellRender?: (value: any, column: string, row: any) => string | null;

    /** Called when row is selected */
    onRowSelect?: (index: number, selected: boolean, data: any) => void;

    /** Called when state changes */
    onStateChange?: (state: AppState, prevState: AppState) => void;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
    /** Unique plugin identifier */
    id: string;

    /** Display name */
    name: string;

    /** Version string */
    version: string;

    /** Description */
    description?: string;

    /** Author */
    author?: string;

    /** Dependencies (other plugin IDs) */
    dependencies?: string[];

    /** Whether plugin is enabled by default */
    defaultEnabled?: boolean;

    /** Settings schema */
    settingsSchema?: PluginSettingsSchema;
}

/**
 * Plugin settings schema for UI generation
 */
export interface PluginSettingsSchema {
    [key: string]: {
        type: 'string' | 'number' | 'boolean' | 'select' | 'color';
        label: string;
        description?: string;
        default?: any;
        options?: Array<{ value: any; label: string }>;  // For select type
        min?: number;  // For number type
        max?: number;  // For number type
    };
}

/**
 * Plugin API - provided to plugins for interacting with the app
 */
export interface PluginAPI {
    /** State manager for reading/updating app state */
    stateManager: StateManager;

    /** Event bus for event-driven communication */
    events: EventBus;

    /** Get plugin settings */
    getSettings: () => Record<string, any>;

    /** Update plugin settings */
    setSettings: (settings: Record<string, any>) => void;

    /** Register a custom transformer */
    registerTransformer: (name: string, handler: TransformerHandler) => void;

    /** Register a custom action */
    registerAction: (action: PluginAction) => void;

    /** Register a toolbar button */
    registerToolbarButton: (button: ToolbarButton) => void;

    /** Register a context menu item */
    registerContextMenuItem: (item: ContextMenuItem) => void;

    /** Show a notification */
    showNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;

    /** Show a modal dialog */
    showModal: (options: ModalOptions) => Promise<any>;

    /** Get selected rows */
    getSelectedRows: () => { index: number; data: any }[];

    /** Refresh data */
    refreshData: () => Promise<void>;
}

/**
 * Transformer handler function
 */
export type TransformerHandler = (
    value: any,
    options: Record<string, any>,
    row: Record<string, any>,
    column: string
) => string;

/**
 * Plugin action
 */
export interface PluginAction {
    id: string;
    label: string;
    icon?: string;
    shortcut?: string;
    handler: (api: PluginAPI) => void | Promise<void>;
}

/**
 * Toolbar button
 */
export interface ToolbarButton {
    id: string;
    label: string;
    icon: string;
    tooltip?: string;
    position?: 'left' | 'right';
    onClick: (api: PluginAPI) => void;
}

/**
 * Context menu item
 */
export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: string;
    separator?: boolean;
    condition?: (context: { row?: any; column?: string; selection: any[] }) => boolean;
    onClick: (context: { row?: any; column?: string; selection: any[] }, api: PluginAPI) => void;
}

/**
 * Modal options
 */
export interface ModalOptions {
    title: string;
    content: string | HTMLElement;
    width?: string;
    height?: string;
    buttons?: Array<{
        label: string;
        variant?: 'primary' | 'secondary' | 'danger';
        onClick?: () => void | Promise<void>;
    }>;
}

/**
 * Full plugin definition
 */
export interface Plugin extends PluginConfig, PluginHooks {
    /** Initialize the plugin with the API */
    init?: (api: PluginAPI) => void | Promise<void>;

    /** Cleanup when plugin is destroyed */
    destroy?: () => void;
}

// =============================================================================
// PLUGIN MANAGER
// =============================================================================

interface RegisteredPlugin {
    plugin: Plugin;
    enabled: boolean;
    settings: Record<string, any>;
    api: PluginAPI | null;
}

export class PluginManager {
    private static instance: PluginManager;
    private plugins: Map<string, RegisteredPlugin> = new Map();
    private stateManager: StateManager | null = null;
    private transformers: Map<string, TransformerHandler> = new Map();
    private actions: Map<string, PluginAction> = new Map();
    private toolbarButtons: ToolbarButton[] = [];
    private contextMenuItems: ContextMenuItem[] = [];
    private notificationHandler: ((msg: string, type: string) => void) | null = null;
    private modalHandler: ((options: ModalOptions) => Promise<any>) | null = null;
    private refreshHandler: (() => Promise<void>) | null = null;
    private getSelectionHandler: (() => { index: number; data: any }[]) | null = null;

    private constructor() { }

    public static getInstance(): PluginManager {
        if (!PluginManager.instance) {
            PluginManager.instance = new PluginManager();
        }
        return PluginManager.instance;
    }

    /**
     * Set the state manager reference
     */
    public setStateManager(stateManager: StateManager): void {
        this.stateManager = stateManager;
    }

    /**
     * Set handler functions from the main app
     */
    public setHandlers(handlers: {
        showNotification?: (msg: string, type: string) => void;
        showModal?: (options: ModalOptions) => Promise<any>;
        refreshData?: () => Promise<void>;
        getSelectedRows?: () => { index: number; data: any }[];
    }): void {
        if (handlers.showNotification) this.notificationHandler = handlers.showNotification;
        if (handlers.showModal) this.modalHandler = handlers.showModal;
        if (handlers.refreshData) this.refreshHandler = handlers.refreshData;
        if (handlers.getSelectedRows) this.getSelectionHandler = handlers.getSelectedRows;
    }

    /**
     * Register a plugin
     */
    public register(plugin: Plugin): void {
        if (this.plugins.has(plugin.id)) {
            logger.warn(`Plugin ${plugin.id} is already registered`);
            return;
        }

        // Check dependencies
        if (plugin.dependencies) {
            for (const dep of plugin.dependencies) {
                if (!this.plugins.has(dep)) {
                    logger.error(`Plugin ${plugin.id} requires ${dep} which is not registered`);
                    return;
                }
            }
        }

        // Initialize settings with defaults
        const settings: Record<string, any> = {};
        if (plugin.settingsSchema) {
            for (const [key, schema] of Object.entries(plugin.settingsSchema)) {
                settings[key] = schema.default;
            }
        }

        // Load saved settings from localStorage
        const savedSettings = this.loadSettings(plugin.id);
        Object.assign(settings, savedSettings);

        this.plugins.set(plugin.id, {
            plugin,
            enabled: false,
            settings,
            api: null
        });

        plugin.onRegister?.();
        eventBus.emit('plugin:registered', { name: plugin.id });

        // Auto-enable if defaultEnabled
        if (plugin.defaultEnabled !== false) {
            this.enable(plugin.id);
        }
    }

    /**
     * Enable a plugin
     */
    public async enable(pluginId: string): Promise<boolean> {
        const registered = this.plugins.get(pluginId);
        if (!registered) {
            logger.error(`Plugin ${pluginId} not found`);
            return false;
        }

        if (registered.enabled) {
            return true;
        }

        const api = this.createPluginAPI(pluginId);
        registered.api = api;

        try {
            await registered.plugin.init?.(api);
            registered.enabled = true;
            registered.plugin.onActivate?.();
            eventBus.emit('plugin:activated', { name: pluginId });
            return true;
        } catch (error) {
            logger.error(`Failed to initialize plugin ${pluginId}`, error);
            return false;
        }
    }

    /**
     * Disable a plugin
     */
    public disable(pluginId: string): boolean {
        const registered = this.plugins.get(pluginId);
        if (!registered || !registered.enabled) {
            return false;
        }

        registered.plugin.onDeactivate?.();
        registered.plugin.destroy?.();
        registered.enabled = false;
        registered.api = null;

        eventBus.emit('plugin:deactivated', { name: pluginId });
        return true;
    }

    /**
     * Get registered plugins
     */
    public getPlugins(): Array<{ id: string; name: string; enabled: boolean; config: PluginConfig }> {
        return Array.from(this.plugins.entries()).map(([id, reg]) => ({
            id,
            name: reg.plugin.name,
            enabled: reg.enabled,
            config: reg.plugin
        }));
    }

    /**
     * Get plugin settings
     */
    public getPluginSettings(pluginId: string): Record<string, any> {
        return this.plugins.get(pluginId)?.settings || {};
    }

    /**
     * Update plugin settings
     */
    public setPluginSettings(pluginId: string, settings: Record<string, any>): void {
        const registered = this.plugins.get(pluginId);
        if (registered) {
            Object.assign(registered.settings, settings);
            this.saveSettings(pluginId, registered.settings);
        }
    }

    /**
     * Get registered transformers
     */
    public getTransformers(): Map<string, TransformerHandler> {
        return new Map(this.transformers);
    }

    /**
     * Get transformer by name
     */
    public getTransformer(name: string): TransformerHandler | undefined {
        return this.transformers.get(name);
    }

    /**
     * Get toolbar buttons
     */
    public getToolbarButtons(): ToolbarButton[] {
        return [...this.toolbarButtons];
    }

    /**
     * Get context menu items
     */
    public getContextMenuItems(): ContextMenuItem[] {
        return [...this.contextMenuItems];
    }

    // =========================================================================
    // LIFECYCLE HOOKS - Call these from the main app
    // =========================================================================

    public callHook<K extends keyof PluginHooks>(
        hookName: K,
        ...args: Parameters<NonNullable<PluginHooks[K]>>
    ): void {
        for (const [, registered] of this.plugins) {
            if (registered.enabled && registered.plugin[hookName]) {
                try {
                    (registered.plugin[hookName] as (...args: unknown[]) => void)(...args);
                } catch (error) {
                    logger.error(`Error in plugin hook ${hookName}`, error);
                }
            }
        }
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    private createPluginAPI(pluginId: string): PluginAPI {
        const registered = this.plugins.get(pluginId);
        if (!registered) {
            throw new Error(`Plugin ${pluginId} not found when creating API`);
        }

        if (!this.stateManager) {
            throw new Error('StateManager not initialized in PluginManager');
        }

        return {
            stateManager: this.stateManager,
            events: eventBus,

            getSettings: () => ({ ...registered.settings }),

            setSettings: (settings) => {
                Object.assign(registered.settings, settings);
                this.saveSettings(pluginId, registered.settings);
            },

            registerTransformer: (name, handler) => {
                this.transformers.set(`${pluginId}:${name}`, handler);
            },

            registerAction: (action) => {
                this.actions.set(`${pluginId}:${action.id}`, action);
            },

            registerToolbarButton: (button) => {
                this.toolbarButtons.push({ ...button, id: `${pluginId}:${button.id}` });
            },

            registerContextMenuItem: (item) => {
                this.contextMenuItems.push({ ...item, id: `${pluginId}:${item.id}` });
            },

            showNotification: (message, type = 'info') => {
                this.notificationHandler?.(message, type);
            },

            showModal: async (options) => {
                return this.modalHandler?.(options);
            },

            getSelectedRows: () => {
                return this.getSelectionHandler?.() || [];
            },

            refreshData: async () => {
                await this.refreshHandler?.();
            }
        };
    }

    private loadSettings(pluginId: string): Record<string, any> {
        try {
            const stored = localStorage.getItem(`plugin:${pluginId}`);
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    }

    private saveSettings(pluginId: string, settings: Record<string, any>): void {
        try {
            localStorage.setItem(`plugin:${pluginId}`, JSON.stringify(settings));
        } catch (error) {
            logger.error(`Failed to save settings for plugin ${pluginId}`, error);
        }
    }
}

// Export singleton
export const pluginManager = PluginManager.getInstance();
