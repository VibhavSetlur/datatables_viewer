/**
 * Event Bus
 * 
 * A type-safe event system for decoupled communication between components.
 * Supports event namespacing, one-time listeners, and wildcard subscriptions.
 * 
 * @version 1.0.0
 */

// =============================================================================
// EVENT TYPES
// =============================================================================

export interface DataTableEvents {
    // Data Events
    'data:loading': { tableId: string };
    'data:loaded': { tableId: string; rowCount: number; headers: string[] };
    'data:error': { tableId: string; error: Error };
    'data:refreshed': { tableId: string };

    // Selection Events
    'selection:changed': { indices: number[]; count: number };
    'selection:row': { index: number; selected: boolean; data: any };
    'selection:all': { selected: boolean; count: number };
    'selection:cleared': {};

    // Navigation Events
    'page:changed': { page: number; pageSize: number; total: number };
    'sort:changed': { column: string; order: 'asc' | 'desc' };
    'filter:changed': { column: string; value: any };
    'filter:cleared': { column?: string };
    'search:changed': { term: string };

    // UI Events
    'theme:changed': { theme: 'light' | 'dark' };
    'density:changed': { density: 'compact' | 'normal' | 'comfortable' };
    'column:visibility': { column: string; visible: boolean };
    'column:reorder': { from: number; to: number };
    'modal:opened': { type: string; data?: any };
    'modal:closed': { type: string };

    // Cell Events
    'cell:click': { row: number; column: string; value: any; element: HTMLElement };
    'cell:dblclick': { row: number; column: string; value: any };
    'cell:expand': { row: number; column: string; fullText: string };
    'cell:copy': { value: string; column: string };

    // Export Events
    'export:started': { format: string; rowCount: number };
    'export:completed': { format: string; filename: string; rowCount: number; byteSize: number; duration: number; error?: string };
    'export:failed': { format: string; filename?: string; error: string; rowCount: number; byteSize?: number; duration?: number };
    'export:progress': { progress: number; processed: number; total: number };
    'export:clipboard': { rowCount: number };

    // Preferences Events
    'preferences:changed': { key: string; value: any; oldValue: any };

    // Lifecycle Events
    'init:started': {};
    'init:completed': { config: any };
    'destroy': {};

    // Plugin Events
    'plugin:registered': { name: string };
    'plugin:activated': { name: string };
    'plugin:deactivated': { name: string };

    // Debug
    '*': { event: string; data: any };
}

type EventName = keyof DataTableEvents;
type EventData<T extends EventName> = DataTableEvents[T];

interface EventListener<T extends EventName> {
    callback: (data: EventData<T>) => void;
    once: boolean;
}

// =============================================================================
// EVENT BUS IMPLEMENTATION
// =============================================================================

export class EventBus {
    private static instance: EventBus;
    private listeners: Map<EventName, Set<EventListener<any>>> = new Map();
    private wildcardListeners: Set<(event: string, data: any) => void> = new Set();
    private eventHistory: Array<{ event: EventName; data: any; timestamp: number }> = [];
    private maxHistorySize = 100;
    private debug = false;

    private constructor() {
        // Check for debug mode
        if (typeof localStorage !== 'undefined') {
            this.debug = localStorage.getItem('DATATABLE_DEBUG') === 'true';
        }
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): EventBus {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }

    /**
     * Subscribe to an event
     */
    public on<T extends EventName>(
        event: T,
        callback: (data: EventData<T>) => void
    ): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }

        const listener: EventListener<T> = { callback, once: false };
        this.listeners.get(event)!.add(listener);

        // Return unsubscribe function
        return () => {
            this.listeners.get(event)?.delete(listener);
        };
    }

    /**
     * Subscribe to an event, but only fire once
     */
    public once<T extends EventName>(
        event: T,
        callback: (data: EventData<T>) => void
    ): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }

        const listener: EventListener<T> = { callback, once: true };
        this.listeners.get(event)!.add(listener);

        return () => {
            this.listeners.get(event)?.delete(listener);
        };
    }

    /**
     * Unsubscribe from an event
     */
    public off<T extends EventName>(
        event: T,
        callback?: (data: EventData<T>) => void
    ): void {
        if (!callback) {
            // Remove all listeners for this event
            this.listeners.delete(event);
            return;
        }

        const listeners = this.listeners.get(event);
        if (listeners) {
            for (const listener of listeners) {
                if (listener.callback === callback) {
                    listeners.delete(listener);
                    break;
                }
            }
        }
    }

    /**
     * Subscribe to all events (for debugging/logging)
     */
    public onAny(callback: (event: string, data: any) => void): () => void {
        this.wildcardListeners.add(callback);
        return () => {
            this.wildcardListeners.delete(callback);
        };
    }

    /**
     * Emit an event
     */
    public emit<T extends EventName>(event: T, data: EventData<T>): void {
        if (this.debug) {
            console.log(`[EventBus] ${event}`, data);
        }

        // Add to history
        this.eventHistory.push({
            event,
            data,
            timestamp: Date.now()
        });

        // Trim history if needed
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }

        // Notify specific listeners
        const listeners = this.listeners.get(event);
        if (listeners) {
            const toRemove: EventListener<T>[] = [];

            for (const listener of listeners) {
                try {
                    listener.callback(data);
                    if (listener.once) {
                        toRemove.push(listener);
                    }
                } catch (error) {
                    console.error(`[EventBus] Error in listener for ${event}:`, error);
                }
            }

            // Remove one-time listeners
            for (const listener of toRemove) {
                listeners.delete(listener);
            }
        }

        // Notify wildcard listeners
        for (const callback of this.wildcardListeners) {
            try {
                callback(event, data);
            } catch (error) {
                console.error('[EventBus] Error in wildcard listener:', error);
            }
        }

        // Emit to explicit '*' channel if subscribed
        if (this.listeners.has('*')) {
            const starListeners = this.listeners.get('*');
            if (starListeners) {
                const payload = { event, data };
                for (const listener of starListeners) {
                    listener.callback(payload as any);
                }
            }
        }
    }

    /**
     * Get event history
     */
    public getHistory(): Array<{ event: EventName; data: any; timestamp: number }> {
        return [...this.eventHistory];
    }

    /**
     * Clear event history
     */
    public clearHistory(): void {
        this.eventHistory = [];
    }

    /**
     * Enable/disable debug mode
     */
    public setDebug(enabled: boolean): void {
        this.debug = enabled;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('DATATABLE_DEBUG', enabled ? 'true' : 'false');
        }
    }

    /**
     * Get listener count for an event
     */
    public listenerCount(event: EventName): number {
        return this.listeners.get(event)?.size ?? 0;
    }

    /**
     * Clear listeners
     */
    public clear(event?: EventName): void {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
            this.wildcardListeners.clear();
        }
    }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();
