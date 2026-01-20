/**
 * Preferences Manager
 * 
 * Centralized user preferences with persistence, validation,
 * and reactive updates.
 * 
 * @version 1.0.0
 */

import { eventBus } from '../state/EventBus';
import { logger } from '../../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface UserPreferences {
    // Display
    theme: 'light' | 'dark' | 'system';
    density: 'compact' | 'normal' | 'comfortable';
    fontSize: 'small' | 'medium' | 'large';

    // Table
    pageSize: number;
    showRowNumbers: boolean;
    showGridLines: boolean;
    stickyHeader: boolean;
    stickyFirstColumn: boolean;

    // Behavior
    confirmBeforeExport: boolean;
    rememberColumnWidths: boolean;
    rememberSortOrder: boolean;
    rememberFilters: boolean;

    // Export
    defaultExportFormat: 'csv' | 'json' | 'tsv' | 'xlsx';
    includeHiddenColumns: boolean;
    exportSelectedOnly: boolean;

    // Accessibility
    reduceMotion: boolean;
    highContrast: boolean;
    keyboardNavigation: boolean;
}

type PreferenceKey = keyof UserPreferences;
type PreferenceValue<K extends PreferenceKey> = UserPreferences[K];

interface PreferenceSchema<T> {
    default: T;
    validate: (value: unknown) => value is T;
    onApply?: (value: T) => void;
}

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

const PREFERENCE_SCHEMAS: { [K in PreferenceKey]: PreferenceSchema<UserPreferences[K]> } = {
    theme: {
        default: 'system',
        validate: (v): v is 'light' | 'dark' | 'system' =>
            ['light', 'dark', 'system'].includes(v as string),
        onApply: (value) => {
            const resolved = value === 'system'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : value;
            document.documentElement.setAttribute('data-theme', resolved);
        }
    },
    density: {
        default: 'normal',
        validate: (v): v is 'compact' | 'normal' | 'comfortable' =>
            ['compact', 'normal', 'comfortable'].includes(v as string),
        onApply: (value) => {
            document.documentElement.setAttribute('data-density', value);
        }
    },
    fontSize: {
        default: 'medium',
        validate: (v): v is 'small' | 'medium' | 'large' =>
            ['small', 'medium', 'large'].includes(v as string),
        onApply: (value) => {
            const sizes = { small: '13px', medium: '14px', large: '16px' };
            document.documentElement.style.setProperty('--font-size-base', sizes[value]);
        }
    },
    pageSize: {
        default: 50,
        validate: (v): v is number =>
            typeof v === 'number' && [10, 25, 50, 100, 250, 500].includes(v)
    },
    showRowNumbers: {
        default: true,
        validate: (v): v is boolean => typeof v === 'boolean'
    },
    showGridLines: {
        default: true,
        validate: (v): v is boolean => typeof v === 'boolean'
    },
    stickyHeader: {
        default: true,
        validate: (v): v is boolean => typeof v === 'boolean'
    },
    stickyFirstColumn: {
        default: true,
        validate: (v): v is boolean => typeof v === 'boolean'
    },
    confirmBeforeExport: {
        default: false,
        validate: (v): v is boolean => typeof v === 'boolean'
    },
    rememberColumnWidths: {
        default: true,
        validate: (v): v is boolean => typeof v === 'boolean'
    },
    rememberSortOrder: {
        default: true,
        validate: (v): v is boolean => typeof v === 'boolean'
    },
    rememberFilters: {
        default: false,
        validate: (v): v is boolean => typeof v === 'boolean'
    },
    defaultExportFormat: {
        default: 'csv',
        validate: (v): v is 'csv' | 'json' | 'tsv' | 'xlsx' =>
            ['csv', 'json', 'tsv', 'xlsx'].includes(v as string)
    },
    includeHiddenColumns: {
        default: false,
        validate: (v): v is boolean => typeof v === 'boolean'
    },
    exportSelectedOnly: {
        default: false,
        validate: (v): v is boolean => typeof v === 'boolean'
    },
    reduceMotion: {
        default: false,
        validate: (v): v is boolean => typeof v === 'boolean',
        onApply: (value) => {
            document.documentElement.classList.toggle('reduce-motion', value);
        }
    },
    highContrast: {
        default: false,
        validate: (v): v is boolean => typeof v === 'boolean',
        onApply: (value) => {
            document.documentElement.classList.toggle('high-contrast', value);
        }
    },
    keyboardNavigation: {
        default: true,
        validate: (v): v is boolean => typeof v === 'boolean'
    }
};

const STORAGE_KEY = 'datatables_preferences';

// =============================================================================
// PREFERENCES MANAGER
// =============================================================================

export class PreferencesManager {
    private static instance: PreferencesManager;
    private preferences: UserPreferences;
    private listeners: Map<PreferenceKey, Set<(value: any) => void>> = new Map();

    private constructor() {
        this.preferences = this.loadPreferences();
        this.applyAllPreferences();
        this.setupSystemListeners();
    }

    public static getInstance(): PreferencesManager {
        if (!PreferencesManager.instance) {
            PreferencesManager.instance = new PreferencesManager();
        }
        return PreferencesManager.instance;
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Get all preferences
     */
    public getAll(): Readonly<UserPreferences> {
        return { ...this.preferences };
    }

    /**
     * Get a single preference
     */
    public get<K extends PreferenceKey>(key: K): PreferenceValue<K> {
        return this.preferences[key];
    }

    /**
     * Set a single preference
     */
    public set<K extends PreferenceKey>(key: K, value: PreferenceValue<K>): boolean {
        const schema = PREFERENCE_SCHEMAS[key];

        if (!schema.validate(value)) {
            logger.warn(`Invalid value for preference "${key}"`, { value });
            return false;
        }

        const oldValue = this.preferences[key];
        if (oldValue === value) return true;

        this.preferences[key] = value;
        this.savePreferences();

        // Apply side effects
        if (schema.onApply) {
            (schema.onApply as (v: typeof value) => void)(value);
        }

        // Notify listeners
        this.notifyListeners(key, value);
        eventBus.emit('preferences:changed', { key, value, oldValue });

        return true;
    }

    /**
     * Set multiple preferences
     */
    public setMany(updates: Partial<UserPreferences>): void {
        for (const [key, value] of Object.entries(updates)) {
            this.set(key as PreferenceKey, value as any);
        }
    }

    /**
     * Reset a preference to default
     */
    public reset<K extends PreferenceKey>(key: K): void {
        const defaultValue = PREFERENCE_SCHEMAS[key].default;
        this.set(key, defaultValue as PreferenceValue<K>);
    }

    /**
     * Reset all preferences to defaults
     */
    public resetAll(): void {
        const keys = Object.keys(PREFERENCE_SCHEMAS) as PreferenceKey[];
        for (const key of keys) {
            this.reset(key);
        }
    }

    /**
     * Subscribe to preference changes
     */
    public subscribe<K extends PreferenceKey>(
        key: K,
        callback: (value: PreferenceValue<K>) => void
    ): () => void {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key)?.add(callback);

        // Return unsubscribe function
        return () => {
            this.listeners.get(key)?.delete(callback);
        };
    }

    /**
     * Get default value for a preference
     */
    public getDefault<K extends PreferenceKey>(key: K): PreferenceValue<K> {
        return PREFERENCE_SCHEMAS[key].default as PreferenceValue<K>;
    }

    /**
     * Export preferences as JSON
     */
    public export(): string {
        return JSON.stringify(this.preferences, null, 2);
    }

    /**
     * Import preferences from JSON
     */
    public import(json: string): boolean {
        try {
            const data = JSON.parse(json);
            const validated: Partial<UserPreferences> = {};

            for (const [key, schema] of Object.entries(PREFERENCE_SCHEMAS)) {
                const k = key as PreferenceKey;
                if (k in data && schema.validate(data[k])) {
                    (validated as any)[k] = data[k];
                }
            }

            this.setMany(validated);
            return true;
        } catch (e) {
            logger.error('Failed to import preferences', e);
            return false;
        }
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    private loadPreferences(): UserPreferences {
        const defaults = {} as UserPreferences;
        for (const [key, schema] of Object.entries(PREFERENCE_SCHEMAS)) {
            (defaults as any)[key] = schema.default;
        }

        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return defaults;

            const parsed = JSON.parse(stored);
            const result = { ...defaults };

            for (const [key, schema] of Object.entries(PREFERENCE_SCHEMAS)) {
                const k = key as PreferenceKey;
                if (k in parsed && schema.validate(parsed[k])) {
                    (result as any)[k] = parsed[k];
                }
            }

            return result;
        } catch (e) {
            logger.warn('Failed to load preferences', e);
            return defaults;
        }
    }

    private savePreferences(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.preferences));
        } catch (e) {
            logger.error('Failed to save preferences', e);
        }
    }

    private applyAllPreferences(): void {
        const keys = Object.keys(PREFERENCE_SCHEMAS) as PreferenceKey[];
        for (const key of keys) {
            const schema = PREFERENCE_SCHEMAS[key];
            if (schema.onApply) {
                // Force type safety for the dynamic access
                const value = this.preferences[key];
                (schema.onApply as (v: typeof value) => void)(value);
            }
        }
    }

    private notifyListeners<K extends PreferenceKey>(key: K, value: PreferenceValue<K>): void {
        this.listeners.get(key)?.forEach(cb => cb(value));
    }

    private setupSystemListeners(): void {
        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (this.preferences.theme === 'system') {
                PREFERENCE_SCHEMAS.theme.onApply?.('system');
            }
        });

        // Listen for reduced motion preference
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
            if (e.matches && !this.preferences.reduceMotion) {
                this.set('reduceMotion', true);
            }
        });
    }
}

// Export singleton
export const preferences = PreferencesManager.getInstance();
