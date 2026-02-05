/**
 * LogViewer Component
 *
 * Modal dialog displaying system logs for debugging data loading and configuration issues.
 */

import { logger, type LogEntry } from '../../utils/logger';

export class LogViewer {
    private modal: HTMLElement | null = null;

    /**
     * Show the log viewer modal.
     */
    public show(): void {
        if (this.modal) {
            this.modal.remove();
        }

        const logs = logger.getLogHistory();

        this.modal = document.createElement('div');
        this.modal.className = 'ts-modal-overlay show';
        this.modal.innerHTML = `
            <div class="ts-modal" style="max-width:800px; max-height:80vh; display:flex; flex-direction:column;">
                <div class="ts-modal-header">
                    <h3><i class="bi bi-terminal"></i> System Logs</h3>
                    <button class="ts-modal-close"><i class="bi bi-x"></i></button>
                </div>
                <div class="ts-modal-body" style="flex:1; overflow:hidden; display:flex; flex-direction:column; padding:0;">
                    <div style="display:flex; gap:8px; padding:12px; border-bottom:1px solid var(--c-border);">
                        <select class="ts-select" id="ts-log-filter" style="width:120px;">
                            <option value="all">All Levels</option>
                            <option value="debug">Debug</option>
                            <option value="info">Info</option>
                            <option value="warn">Warn</option>
                            <option value="error">Error</option>
                        </select>
                        <button class="ts-btn-secondary" id="ts-log-copy">
                            <i class="bi bi-clipboard"></i> Copy
                        </button>
                        <button class="ts-btn-secondary" id="ts-log-download">
                            <i class="bi bi-download"></i> Download
                        </button>
                        <button class="ts-btn-secondary" id="ts-log-clear">
                            <i class="bi bi-trash"></i> Clear
                        </button>
                        <span style="flex:1;"></span>
                        <span id="ts-log-count" style="color:var(--c-text-muted); font-size:12px; align-self:center;">
                            ${logs.length} entries
                        </span>
                    </div>
                    <div id="ts-log-list" style="flex:1; overflow-y:auto; font-family:monospace; font-size:12px; padding:8px;">
                        ${this.renderLogs(logs)}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this.bindEvents();
    }

    private renderLogs(logs: LogEntry[], filter: string = 'all'): string {
        const filtered = filter === 'all' ? logs : logs.filter(l => l.level === filter);

        if (filtered.length === 0) {
            return '<div style="color:var(--c-text-muted); text-align:center; padding:24px;">No logs to display</div>';
        }

        return filtered.map(log => {
            const levelColors: Record<string, string> = {
                debug: 'var(--c-text-muted)',
                info: 'var(--c-accent)',
                warn: '#f59e0b',
                error: '#ef4444'
            };
            const color = levelColors[log.level] || 'inherit';
            const dataStr = log.data ? ` ${JSON.stringify(log.data)}` : '';

            return `
                <div style="padding:4px 8px; border-bottom:1px solid var(--c-border-light); display:flex; gap:8px;">
                    <span style="color:var(--c-text-muted); min-width:180px;">${log.timestamp}</span>
                    <span style="color:${color}; font-weight:600; min-width:50px; text-transform:uppercase;">${log.level}</span>
                    <span style="flex:1; word-break:break-word;">${this.escapeHtml(log.message)}${dataStr ? `<span style="color:var(--c-text-muted)">${this.escapeHtml(dataStr)}</span>` : ''}</span>
                </div>
            `;
        }).join('');
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private bindEvents(): void {
        if (!this.modal) return;

        // Close button
        this.modal.querySelector('.ts-modal-close')?.addEventListener('click', () => this.hide());

        // Click outside to close
        this.modal.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).classList.contains('ts-modal-overlay')) {
                this.hide();
            }
        });

        // Filter
        const filterSelect = this.modal.querySelector('#ts-log-filter') as HTMLSelectElement;
        filterSelect?.addEventListener('change', () => {
            const logList = this.modal?.querySelector('#ts-log-list');
            const countSpan = this.modal?.querySelector('#ts-log-count');
            if (logList) {
                const logs = logger.getLogHistory();
                const filtered = filterSelect.value === 'all' ? logs : logs.filter(l => l.level === filterSelect.value);
                logList.innerHTML = this.renderLogs(logs, filterSelect.value);
                if (countSpan) countSpan.textContent = `${filtered.length} entries`;
            }
        });

        // Copy
        this.modal.querySelector('#ts-log-copy')?.addEventListener('click', () => {
            const logs = logger.getLogHistory();
            const text = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}${l.data ? ' ' + JSON.stringify(l.data) : ''}`).join('\n');
            navigator.clipboard.writeText(text).then(() => {
                const btn = this.modal?.querySelector('#ts-log-copy') as HTMLButtonElement;
                if (btn) {
                    const originalText = btn.innerHTML;
                    btn.innerHTML = '<i class="bi bi-check"></i> Copied!';
                    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
                }
            });
        });

        // Download
        this.modal.querySelector('#ts-log-download')?.addEventListener('click', () => {
            const logs = logger.getLogHistory();
            const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `datatables-viewer-logs-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        // Clear
        this.modal.querySelector('#ts-log-clear')?.addEventListener('click', () => {
            logger.clearHistory();
            const logList = this.modal?.querySelector('#ts-log-list');
            const countSpan = this.modal?.querySelector('#ts-log-count');
            if (logList) logList.innerHTML = this.renderLogs([]);
            if (countSpan) countSpan.textContent = '0 entries';
        });
    }

    public hide(): void {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
    }
}
