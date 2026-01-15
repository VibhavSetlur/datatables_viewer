/**
 * Keyboard Shortcuts Manager
 * 
 * Handles global keyboard shortcuts for improved research workflow.
 * Supports customizable shortcuts and conflict detection.
 * 
 * @version 1.0.0
 */

import { eventBus } from '../state/EventBus';

// =============================================================================
// TYPES
// =============================================================================

export interface Shortcut {
    /** Unique identifier */
    id: string;

    /** Key combination (e.g., "Ctrl+F", "Escape", "Ctrl+Shift+E") */
    keys: string;

    /** Description for help menu */
    description: string;

    /** Category for grouping */
    category: 'navigation' | 'selection' | 'actions' | 'filters' | 'general';

    /** Handler function */
    handler: (e: KeyboardEvent) => void;

    /** Whether the shortcut is enabled */
    enabled?: boolean;

    /** Prevent default browser behavior */
    preventDefault?: boolean;
}

// =============================================================================
// KEYBOARD MANAGER
// =============================================================================

export class KeyboardManager {
    private static instance: KeyboardManager;
    private shortcuts: Map<string, Shortcut> = new Map();
    private keyMap: Map<string, string> = new Map();  // normalized key combo -> shortcut id
    private enabled: boolean = true;

    private constructor() {
        this.bindGlobalHandler();
    }

    public static getInstance(): KeyboardManager {
        if (!KeyboardManager.instance) {
            KeyboardManager.instance = new KeyboardManager();
        }
        return KeyboardManager.instance;
    }

    /**
     * Register a keyboard shortcut
     */
    public register(shortcut: Shortcut): void {
        const normalized = this.normalizeKeys(shortcut.keys);

        // Check for conflicts
        if (this.keyMap.has(normalized)) {
            console.warn(`Shortcut conflict: ${shortcut.keys} is already registered for ${this.keyMap.get(normalized)}`);
        }

        this.shortcuts.set(shortcut.id, {
            ...shortcut,
            enabled: shortcut.enabled !== false,
            preventDefault: shortcut.preventDefault !== false
        });
        this.keyMap.set(normalized, shortcut.id);
    }

    /**
     * Unregister a shortcut
     */
    public unregister(id: string): void {
        const shortcut = this.shortcuts.get(id);
        if (shortcut) {
            const normalized = this.normalizeKeys(shortcut.keys);
            this.keyMap.delete(normalized);
            this.shortcuts.delete(id);
        }
    }

    /**
     * Enable/disable a shortcut
     */
    public setEnabled(id: string, enabled: boolean): void {
        const shortcut = this.shortcuts.get(id);
        if (shortcut) {
            shortcut.enabled = enabled;
        }
    }

    /**
     * Enable/disable all shortcuts
     */
    public setGlobalEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Get all registered shortcuts
     */
    public getShortcuts(): Shortcut[] {
        return Array.from(this.shortcuts.values());
    }

    /**
     * Get shortcuts by category
     */
    public getShortcutsByCategory(category: string): Shortcut[] {
        return this.getShortcuts().filter(s => s.category === category);
    }

    /**
     * Show help modal
     */
    public showHelp(): void {
        eventBus.emit('modal:opened', { type: 'keyboard-help' });

        // Create help modal content
        const content = this.renderHelpContent();

        // Dispatch custom event for help display
        document.dispatchEvent(new CustomEvent('keyboard-help', {
            detail: { content }
        }));
    }

    /**
     * Hide help modal
     */
    public hideHelp(): void {
        eventBus.emit('modal:closed', { type: 'keyboard-help' });
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    private bindGlobalHandler(): void {
        document.addEventListener('keydown', (e) => {
            if (!this.enabled) return;

            // Don't trigger shortcuts when typing in inputs (unless Escape)
            if (this.isInputElement(e.target as Element) && e.key !== 'Escape') {
                return;
            }

            const normalized = this.eventToNormalizedKey(e);
            const shortcutId = this.keyMap.get(normalized);

            if (shortcutId) {
                const shortcut = this.shortcuts.get(shortcutId);
                if (shortcut && shortcut.enabled) {
                    if (shortcut.preventDefault) {
                        e.preventDefault();
                    }
                    try {
                        shortcut.handler(e);
                    } catch (error) {
                        console.error(`Error in shortcut handler ${shortcutId}:`, error);
                    }
                }
            }
        });
    }

    private isInputElement(element: Element): boolean {
        const tagName = element.tagName.toLowerCase();
        return tagName === 'input' ||
            tagName === 'textarea' ||
            tagName === 'select' ||
            (element as HTMLElement).contentEditable === 'true';
    }

    private normalizeKeys(keys: string): string {
        const parts = keys.toLowerCase().split('+').map(p => p.trim());
        const sorted = [];

        // Order: Ctrl, Alt, Shift, Meta, Key
        if (parts.includes('ctrl') || parts.includes('control')) sorted.push('ctrl');
        if (parts.includes('alt')) sorted.push('alt');
        if (parts.includes('shift')) sorted.push('shift');
        if (parts.includes('meta') || parts.includes('cmd') || parts.includes('command')) sorted.push('meta');

        // Add the actual key (not a modifier)
        const key = parts.find(p =>
            !['ctrl', 'control', 'alt', 'shift', 'meta', 'cmd', 'command'].includes(p)
        );
        if (key) sorted.push(key);

        return sorted.join('+');
    }

    private eventToNormalizedKey(e: KeyboardEvent): string {
        const parts = [];

        if (e.ctrlKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');
        if (e.metaKey) parts.push('meta');

        // Normalize key names
        let key = e.key.toLowerCase();
        if (key === ' ') key = 'space';
        if (key === 'arrowup') key = 'up';
        if (key === 'arrowdown') key = 'down';
        if (key === 'arrowleft') key = 'left';
        if (key === 'arrowright') key = 'right';

        // Don't add modifier keys themselves
        if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
            parts.push(key);
        }

        return parts.join('+');
    }

    private renderHelpContent(): string {
        const categories = {
            navigation: { title: 'Navigation', icon: 'bi-compass' },
            selection: { title: 'Selection', icon: 'bi-check2-square' },
            actions: { title: 'Actions', icon: 'bi-lightning' },
            filters: { title: 'Filters', icon: 'bi-funnel' },
            general: { title: 'General', icon: 'bi-gear' }
        };

        let html = '<div class="keyboard-help">';

        for (const [catId, catInfo] of Object.entries(categories)) {
            const shortcuts = this.getShortcutsByCategory(catId as any);
            if (shortcuts.length === 0) continue;

            html += `
                <div class="keyboard-help-category">
                    <h3><i class="${catInfo.icon}"></i> ${catInfo.title}</h3>
                    <div class="keyboard-help-list">
            `;

            for (const shortcut of shortcuts) {
                const keys = this.formatKeysForDisplay(shortcut.keys);
                html += `
                    <div class="keyboard-help-item">
                        <span class="keyboard-help-desc">${shortcut.description}</span>
                        <span class="keyboard-help-keys">${keys}</span>
                    </div>
                `;
            }

            html += '</div></div>';
        }

        html += '</div>';
        return html;
    }

    private formatKeysForDisplay(keys: string): string {
        return keys.split('+')
            .map(k => `<kbd>${k.charAt(0).toUpperCase() + k.slice(1)}</kbd>`)
            .join(' + ');
    }
}

// =============================================================================
// DEFAULT SHORTCUTS
// =============================================================================

export function registerDefaultShortcuts(handlers: {
    onSearch?: () => void;
    onExport?: () => void;
    onRefresh?: () => void;
    onReset?: () => void;
    onSelectAll?: () => void;
    onClearSelection?: () => void;
    onToggleTheme?: () => void;
    onShowSchema?: () => void;
    onNextPage?: () => void;
    onPrevPage?: () => void;
    onFirstPage?: () => void;
    onLastPage?: () => void;
}): void {
    const km = KeyboardManager.getInstance();

    // General
    km.register({
        id: 'help',
        keys: '?',
        description: 'Show keyboard shortcuts',
        category: 'general',
        handler: () => km.showHelp()
    });

    km.register({
        id: 'close-modal',
        keys: 'Escape',
        description: 'Close modal / Clear selection',
        category: 'general',
        handler: () => {
            // Try to close any open modal first
            const modal = document.querySelector('.ts-modal-overlay.show');
            if (modal) {
                modal.classList.remove('show');
                return;
            }
            // Otherwise clear selection
            handlers.onClearSelection?.();
        }
    });

    // Search & Filters
    if (handlers.onSearch) {
        km.register({
            id: 'search',
            keys: 'Ctrl+F',
            description: 'Focus search box',
            category: 'filters',
            handler: handlers.onSearch
        });

        km.register({
            id: 'search-alt',
            keys: '/',
            description: 'Focus search box',
            category: 'filters',
            handler: handlers.onSearch
        });
    }

    // Actions
    if (handlers.onExport) {
        km.register({
            id: 'export',
            keys: 'Ctrl+E',
            description: 'Export data',
            category: 'actions',
            handler: handlers.onExport
        });
    }

    if (handlers.onRefresh) {
        km.register({
            id: 'refresh',
            keys: 'Ctrl+R',
            description: 'Refresh data',
            category: 'actions',
            handler: handlers.onRefresh,
            preventDefault: true  // Prevent browser refresh
        });
    }

    if (handlers.onReset) {
        km.register({
            id: 'reset',
            keys: 'Ctrl+Shift+R',
            description: 'Reset all filters',
            category: 'actions',
            handler: handlers.onReset,
            preventDefault: true
        });
    }

    if (handlers.onShowSchema) {
        km.register({
            id: 'schema',
            keys: 'Ctrl+I',
            description: 'Show database schema',
            category: 'actions',
            handler: handlers.onShowSchema
        });
    }

    // Selection
    if (handlers.onSelectAll) {
        km.register({
            id: 'select-all',
            keys: 'Ctrl+A',
            description: 'Select all rows',
            category: 'selection',
            handler: handlers.onSelectAll
        });
    }

    if (handlers.onClearSelection) {
        km.register({
            id: 'clear-selection',
            keys: 'Ctrl+D',
            description: 'Clear selection',
            category: 'selection',
            handler: handlers.onClearSelection
        });
    }

    // Navigation
    if (handlers.onNextPage) {
        km.register({
            id: 'next-page',
            keys: 'Ctrl+Right',
            description: 'Next page',
            category: 'navigation',
            handler: handlers.onNextPage
        });
    }

    if (handlers.onPrevPage) {
        km.register({
            id: 'prev-page',
            keys: 'Ctrl+Left',
            description: 'Previous page',
            category: 'navigation',
            handler: handlers.onPrevPage
        });
    }

    if (handlers.onFirstPage) {
        km.register({
            id: 'first-page',
            keys: 'Ctrl+Home',
            description: 'First page',
            category: 'navigation',
            handler: handlers.onFirstPage
        });
    }

    if (handlers.onLastPage) {
        km.register({
            id: 'last-page',
            keys: 'Ctrl+End',
            description: 'Last page',
            category: 'navigation',
            handler: handlers.onLastPage
        });
    }

    // Theme
    if (handlers.onToggleTheme) {
        km.register({
            id: 'toggle-theme',
            keys: 'Ctrl+Shift+T',
            description: 'Toggle dark/light theme',
            category: 'general',
            handler: handlers.onToggleTheme
        });
    }
}

// Export singleton
export const keyboardManager = KeyboardManager.getInstance();
