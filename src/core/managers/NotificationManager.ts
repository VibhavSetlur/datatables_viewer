/**
 * Notification System
 * 
 * Toast notification system for user feedback with multiple severity levels,
 * auto-dismiss, and action support.
 * 
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export type NotificationType = 'info' | 'success' | 'warning' | 'danger';

export interface NotificationAction {
    label: string;
    handler: () => void;
    variant?: 'primary' | 'secondary';
}

export interface NotificationOptions {
    /** Unique identifier */
    id?: string;
    /** Notification title */
    title?: string;
    /** Notification message */
    message: string;
    /** Notification type */
    type?: NotificationType;
    /** Duration in ms (0 = persistent) */
    duration?: number;
    /** Show close button */
    dismissible?: boolean;
    /** Action buttons */
    actions?: NotificationAction[];
    /** Icon override */
    icon?: string;
    /** Show progress bar */
    progress?: boolean;
}

interface ActiveNotification extends Required<Omit<NotificationOptions, 'actions'>> {
    actions: NotificationAction[];
    element: HTMLElement;
    timer?: number;
    startTime: number;
}

// =============================================================================
// NOTIFICATION MANAGER
// =============================================================================

export class NotificationManager {
    private static instance: NotificationManager;
    private container: HTMLElement | null = null;
    private notifications: Map<string, ActiveNotification> = new Map();
    private counter = 0;

    private readonly defaults: Required<Omit<NotificationOptions, 'id' | 'title' | 'actions'>> = {
        message: '',
        type: 'info',
        duration: 5000,
        dismissible: true,
        icon: '',
        progress: true
    };

    private readonly icons: Record<NotificationType, string> = {
        info: 'bi-info-circle-fill',
        success: 'bi-check-circle-fill',
        warning: 'bi-exclamation-triangle-fill',
        danger: 'bi-x-circle-fill'
    };

    private constructor() {
        this.createContainer();
    }

    public static getInstance(): NotificationManager {
        if (!NotificationManager.instance) {
            NotificationManager.instance = new NotificationManager();
        }
        return NotificationManager.instance;
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Show a notification
     */
    public show(options: NotificationOptions): string {
        const id = options.id || `notification-${++this.counter}`;

        // Remove existing notification with same ID
        if (this.notifications.has(id)) {
            this.dismiss(id);
        }

        const notification: ActiveNotification = {
            id,
            title: options.title || '',
            message: options.message,
            type: options.type || this.defaults.type,
            duration: options.duration ?? this.defaults.duration,
            dismissible: options.dismissible ?? this.defaults.dismissible,
            icon: options.icon || this.icons[options.type || 'info'],
            progress: options.progress ?? this.defaults.progress,
            actions: options.actions || [],
            element: this.createNotificationElement(id, options),
            startTime: Date.now()
        };

        this.notifications.set(id, notification);
        this.container?.appendChild(notification.element);

        // Trigger animation
        requestAnimationFrame(() => {
            notification.element.classList.add('show');
        });

        // Auto-dismiss
        if (notification.duration > 0) {
            notification.timer = window.setTimeout(() => {
                this.dismiss(id);
            }, notification.duration);
        }

        return id;
    }

    /**
     * Shorthand methods
     */
    public info(message: string, options?: Partial<NotificationOptions>): string {
        return this.show({ ...options, message, type: 'info' });
    }

    public success(message: string, options?: Partial<NotificationOptions>): string {
        return this.show({ ...options, message, type: 'success' });
    }

    public warning(message: string, options?: Partial<NotificationOptions>): string {
        return this.show({ ...options, message, type: 'warning' });
    }

    public danger(message: string, options?: Partial<NotificationOptions>): string {
        return this.show({ ...options, message, type: 'danger' });
    }

    /**
     * Dismiss a notification
     */
    public dismiss(id: string): void {
        const notification = this.notifications.get(id);
        if (!notification) return;

        if (notification.timer) {
            clearTimeout(notification.timer);
        }

        notification.element.classList.remove('show');
        notification.element.classList.add('hiding');

        setTimeout(() => {
            notification.element.remove();
            this.notifications.delete(id);
        }, 300);
    }

    /**
     * Dismiss all notifications
     */
    public dismissAll(): void {
        this.notifications.forEach((_, id) => this.dismiss(id));
    }

    /**
     * Update notification message
     */
    public update(id: string, options: Partial<NotificationOptions>): void {
        const notification = this.notifications.get(id);
        if (!notification) return;

        if (options.message) {
            const msgEl = notification.element.querySelector('.ts-notification-message');
            if (msgEl) msgEl.textContent = options.message;
        }

        if (options.title) {
            const titleEl = notification.element.querySelector('.ts-notification-title');
            if (titleEl) titleEl.textContent = options.title;
        }
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    private createContainer(): void {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = 'ts-notification-container';
        this.container.setAttribute('aria-live', 'polite');
        this.container.setAttribute('aria-label', 'Notifications');
        document.body.appendChild(this.container);
    }

    private createNotificationElement(id: string, options: NotificationOptions): HTMLElement {
        const type = options.type || 'info';
        const icon = options.icon || this.icons[type];
        const duration = options.duration ?? this.defaults.duration;
        const progress = options.progress ?? this.defaults.progress;

        const el = document.createElement('div');
        el.className = `ts-notification ts-notification-${type}`;
        el.setAttribute('role', 'alert');
        el.setAttribute('data-notification-id', id);

        el.innerHTML = `
            <div class="ts-notification-icon">
                <i class="${icon}"></i>
            </div>
            <div class="ts-notification-content">
                ${options.title ? `<div class="ts-notification-title">${options.title}</div>` : ''}
                <div class="ts-notification-message">${options.message}</div>
                ${options.actions?.length ? `
                    <div class="ts-notification-actions">
                        ${options.actions.map((a, i) => `
                            <button class="ts-notification-action ${a.variant === 'primary' ? 'primary' : ''}" data-action="${i}">
                                ${a.label}
                            </button>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
            ${options.dismissible !== false ? `
                <button class="ts-notification-close" aria-label="Close">
                    <i class="bi bi-x"></i>
                </button>
            ` : ''}
            ${progress && duration > 0 ? `
                <div class="ts-notification-progress">
                    <div class="ts-notification-progress-bar" style="animation-duration: ${duration}ms"></div>
                </div>
            ` : ''}
        `;

        // Bind events
        el.querySelector('.ts-notification-close')?.addEventListener('click', () => {
            this.dismiss(id);
        });

        options.actions?.forEach((action, index) => {
            el.querySelector(`[data-action="${index}"]`)?.addEventListener('click', () => {
                action.handler();
                if (action.variant !== 'primary') {
                    this.dismiss(id);
                }
            });
        });

        // Pause on hover
        el.addEventListener('mouseenter', () => {
            const n = this.notifications.get(id);
            if (n?.timer) {
                clearTimeout(n.timer);
                const progressBar = el.querySelector('.ts-notification-progress-bar') as HTMLElement;
                if (progressBar) progressBar.style.animationPlayState = 'paused';
            }
        });

        el.addEventListener('mouseleave', () => {
            const n = this.notifications.get(id);
            if (n && n.duration > 0) {
                const elapsed = Date.now() - n.startTime;
                const remaining = Math.max(n.duration - elapsed, 1000);
                n.timer = window.setTimeout(() => this.dismiss(id), remaining);
                const progressBar = el.querySelector('.ts-notification-progress-bar') as HTMLElement;
                if (progressBar) progressBar.style.animationPlayState = 'running';
            }
        });

        return el;
    }
}

// Export singleton
export const notifications = NotificationManager.getInstance();
