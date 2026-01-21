import { StateManager } from '../../core/state/StateManager';
import { ApiClient } from '../../core/api/ApiClient';
import { logger } from '../../utils/logger';

export interface StatisticsViewerOptions {
    stateManager: StateManager;
    client?: ApiClient;
    createModal: (title: string, bodyHtml: string) => HTMLElement;
    showAlert: (msg: string, type: string) => void;
}

export class StatisticsViewer {
    private stateManager: StateManager;
    private client: ApiClient;
    private createModal: (title: string, bodyHtml: string) => HTMLElement;
    private showAlert: (msg: string, type: string) => void;

    constructor(options: StatisticsViewerOptions) {
        this.stateManager = options.stateManager;
        this.client = options.client || new ApiClient();
        this.createModal = options.createModal;
        this.showAlert = options.showAlert;
    }

    public async show(tableName: string) {
        const state = this.stateManager.getState();
        if (!state.berdlTableId || !tableName) {
            this.showAlert('No table selected', 'warning');
            return;
        }

        // Helper to safely format numeric values
        const formatNum = (val: any, decimals: number = 2): string => {
            if (val === null || val === undefined) return 'N/A';
            if (typeof val === 'number') {
                return Number.isInteger(val) ? val.toLocaleString() : val.toFixed(decimals);
            }
            return String(val);
        };

        try {
            this.stateManager.update({ loading: true });

            // Get stats from API via client
            const stats = await this.client.getTableStatistics(state.berdlTableId, tableName);

            // Validate response structure
            if (!stats || !Array.isArray(stats.columns)) {
                throw new Error('Invalid statistics response format');
            }

            // Format stats for display
            const statsHtml = `
                <div style="padding:24px;max-width:900px;overflow-y:auto;max-height:80vh">
                    <h2 style="margin-bottom:20px;font-size:18px;font-weight:600">
                        <i class="bi bi-graph-up"></i> Column Statistics: ${tableName}
                    </h2>
                    <div style="margin-bottom:16px;padding:12px;background:var(--c-bg-surface-alt);border-radius:var(--radius-sm);font-size:13px">
                        <strong>Total Rows:</strong> ${(stats.row_count || 0).toLocaleString()}
                    </div>
                    <div style="display:grid;gap:12px">
                        ${stats.columns.map((col: any) => `
                            <div style="padding:16px;background:var(--c-bg-surface);border:1px solid var(--c-border-subtle);border-radius:var(--radius-md)">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                                    <h3 style="font-size:14px;font-weight:600">${col.column || 'Unknown'}</h3>
                                    <span style="font-size:11px;color:var(--c-text-muted);text-transform:uppercase">${col.type || 'TEXT'}</span>
                                </div>
                                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;font-size:12px">
                                    <div><strong>Nulls:</strong> ${(col.null_count ?? 0).toLocaleString()}</div>
                                    <div><strong>Distinct:</strong> ${(col.distinct_count ?? 0).toLocaleString()}</div>
                                    ${col.min != null ? `<div><strong>Min:</strong> ${formatNum(col.min)}</div>` : ''}
                                    ${col.max != null ? `<div><strong>Max:</strong> ${formatNum(col.max)}</div>` : ''}
                                    ${col.mean != null ? `<div><strong>Mean:</strong> ${formatNum(col.mean, 2)}</div>` : ''}
                                    ${col.median != null ? `<div><strong>Median:</strong> ${formatNum(col.median)}</div>` : ''}
                                    ${col.stddev != null ? `<div><strong>StdDev:</strong> ${formatNum(col.stddev, 4)}</div>` : ''}
                                </div>
                                ${col.sample_values && col.sample_values.length > 0 ? `
                                    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--c-border-subtle)">
                                        <div style="font-size:11px;color:var(--c-text-muted);margin-bottom:6px">Sample Values:</div>
                                        <div style="display:flex;flex-wrap:wrap;gap:4px">
                                            ${col.sample_values.slice(0, 10).map((v: any) => `
                                                <span style="padding:2px 8px;background:var(--c-bg-surface-alt);border-radius:4px;font-size:11px;font-family:monospace">${String(v ?? '').substring(0, 30)}</span>
                                            `).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            this.createModal(`Column Statistics: ${tableName}`, statsHtml);
        } catch (error: any) {
            logger.error(`Failed to load statistics: ${error.message}`, error);
            this.showAlert(`Failed to load statistics: ${error.message}`, 'danger');
        } finally {
            this.stateManager.update({ loading: false });
        }
    }
}
