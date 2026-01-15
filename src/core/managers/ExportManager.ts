/**
 * Export Manager
 * 
 * Handles data export in multiple formats with streaming support
 * for large datasets, progress reporting, and customization options.
 * 
 * @version 1.0.0
 */

import { eventBus } from '../state/EventBus';

// =============================================================================
// TYPES
// =============================================================================

export type ExportFormat = 'csv' | 'tsv' | 'json' | 'json-lines' | 'xlsx';

export interface ExportColumn {
    key: string;
    header: string;
    transform?: (value: any, row: Record<string, any>) => string;
}

export interface ExportOptions {
    /** Export format */
    format: ExportFormat;
    /** Filename (without extension) */
    filename?: string;
    /** Columns to export */
    columns?: ExportColumn[];
    /** Include column headers */
    includeHeaders?: boolean;
    /** Field delimiter for CSV/TSV */
    delimiter?: string;
    /** Line ending style */
    lineEnding?: 'unix' | 'windows';
    /** JSON formatting */
    jsonPretty?: boolean;
    /** Chunk size for large exports */
    chunkSize?: number;
    /** Progress callback */
    onProgress?: (progress: number, message: string) => void;
}

interface ExportResult {
    success: boolean;
    filename: string;
    format: ExportFormat;
    rowCount: number;
    byteSize: number;
    duration: number;
    error?: string;
}

// =============================================================================
// EXPORT MANAGER
// =============================================================================

export class ExportManager {
    private static instance: ExportManager;

    private readonly defaults: Required<Omit<ExportOptions, 'columns' | 'onProgress'>> = {
        format: 'csv',
        filename: 'export',
        includeHeaders: true,
        delimiter: ',',
        lineEnding: 'unix',
        jsonPretty: false,
        chunkSize: 1000
    };

    private constructor() { }

    public static getInstance(): ExportManager {
        if (!ExportManager.instance) {
            ExportManager.instance = new ExportManager();
        }
        return ExportManager.instance;
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Export data to file
     */
    public async export(
        data: Record<string, any>[],
        options: ExportOptions
    ): Promise<ExportResult> {
        const startTime = Date.now();
        const opts = { ...this.defaults, ...options };

        eventBus.emit('export:started', { format: opts.format, rowCount: data.length });

        try {
            // Determine columns
            const columns = opts.columns || this.inferColumns(data);

            // Generate content
            let content: string;
            let mimeType: string;
            let extension: string;

            switch (opts.format) {
                case 'csv':
                    content = this.toCSV(data, columns, opts);
                    mimeType = 'text/csv;charset=utf-8';
                    extension = 'csv';
                    break;
                case 'tsv':
                    content = this.toCSV(data, columns, { ...opts, delimiter: '\t' });
                    mimeType = 'text/tab-separated-values;charset=utf-8';
                    extension = 'tsv';
                    break;
                case 'json':
                    content = this.toJSON(data, columns, opts);
                    mimeType = 'application/json;charset=utf-8';
                    extension = 'json';
                    break;
                case 'json-lines':
                    content = this.toJSONLines(data, columns, opts);
                    mimeType = 'application/x-ndjson;charset=utf-8';
                    extension = 'jsonl';
                    break;
                case 'xlsx':
                    // For XLSX, we'd need a library like SheetJS
                    // Fallback to CSV for now
                    console.warn('XLSX export not yet implemented, falling back to CSV');
                    content = this.toCSV(data, columns, opts);
                    mimeType = 'text/csv;charset=utf-8';
                    extension = 'csv';
                    break;
                default:
                    throw new Error(`Unsupported export format: ${opts.format}`);
            }

            // Save file
            const filename = `${opts.filename}.${extension}`;
            this.downloadFile(content, filename, mimeType);

            const result: ExportResult = {
                success: true,
                filename,
                format: opts.format,
                rowCount: data.length,
                byteSize: new Blob([content]).size,
                duration: Date.now() - startTime
            };

            eventBus.emit('export:completed', result);
            return result;

        } catch (error: any) {
            const result: ExportResult = {
                success: false,
                filename: opts.filename,
                format: opts.format,
                rowCount: 0,
                byteSize: 0,
                duration: Date.now() - startTime,
                error: error.message || String(error)
            };

            eventBus.emit('export:failed', {
                ...result,
                error: result.error as string
            });
            return result;
        }
    }

    /**
     * Export to clipboard
     */
    public async toClipboard(
        data: Record<string, any>[],
        options?: Partial<ExportOptions>
    ): Promise<boolean> {
        const opts: ExportOptions = {
            format: 'tsv',
            includeHeaders: true,
            ...options
        };

        try {
            const columns = opts.columns || this.inferColumns(data);
            const content = this.toCSV(data, columns, { ...this.defaults, ...opts, delimiter: '\t' });

            await navigator.clipboard.writeText(content);
            eventBus.emit('export:clipboard', { rowCount: data.length });
            return true;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    }

    /**
     * Get file extension for format
     */
    public getExtension(format: ExportFormat): string {
        const extensions: Record<ExportFormat, string> = {
            'csv': 'csv',
            'tsv': 'tsv',
            'json': 'json',
            'json-lines': 'jsonl',
            'xlsx': 'xlsx'
        };
        return extensions[format] || 'txt';
    }

    /**
     * Get MIME type for format
     */
    public getMimeType(format: ExportFormat): string {
        const types: Record<ExportFormat, string> = {
            'csv': 'text/csv',
            'tsv': 'text/tab-separated-values',
            'json': 'application/json',
            'json-lines': 'application/x-ndjson',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        };
        return types[format] || 'text/plain';
    }

    // =========================================================================
    // FORMATTERS
    // =========================================================================

    private toCSV(
        data: Record<string, any>[],
        columns: ExportColumn[],
        opts: Required<Omit<ExportOptions, 'columns' | 'onProgress'>>
    ): string {
        const lines: string[] = [];
        const lineEnding = opts.lineEnding === 'windows' ? '\r\n' : '\n';
        const delimiter = opts.delimiter;

        // Headers
        if (opts.includeHeaders) {
            lines.push(columns.map(c => this.escapeCSV(c.header, delimiter)).join(delimiter));
        }

        // Rows
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const values = columns.map(col => {
                let value = row[col.key];
                if (col.transform) {
                    value = col.transform(value, row);
                }
                return this.escapeCSV(this.formatValue(value), delimiter);
            });
            lines.push(values.join(delimiter));

            // Progress reporting for large datasets
            if (opts.chunkSize && i > 0 && i % opts.chunkSize === 0) {
                const progress = (i / data.length) * 100;
                eventBus.emit('export:progress', { progress, processed: i, total: data.length });
            }
        }

        return lines.join(lineEnding);
    }

    private toJSON(
        data: Record<string, any>[],
        columns: ExportColumn[],
        opts: Required<Omit<ExportOptions, 'columns' | 'onProgress'>>
    ): string {
        const filtered = data.map(row => {
            const obj: Record<string, any> = {};
            columns.forEach(col => {
                let value = row[col.key];
                if (col.transform) {
                    value = col.transform(value, row);
                }
                obj[col.key] = value;
            });
            return obj;
        });

        return opts.jsonPretty
            ? JSON.stringify(filtered, null, 2)
            : JSON.stringify(filtered);
    }

    private toJSONLines(
        data: Record<string, any>[],
        columns: ExportColumn[],
        opts: Required<Omit<ExportOptions, 'columns' | 'onProgress'>>
    ): string {
        const lineEnding = opts.lineEnding === 'windows' ? '\r\n' : '\n';

        return data.map(row => {
            const obj: Record<string, any> = {};
            columns.forEach(col => {
                let value = row[col.key];
                if (col.transform) {
                    value = col.transform(value, row);
                }
                obj[col.key] = value;
            });
            return JSON.stringify(obj);
        }).join(lineEnding);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private inferColumns(data: Record<string, any>[]): ExportColumn[] {
        if (data.length === 0) return [];

        const keys = new Set<string>();
        data.forEach(row => {
            Object.keys(row).forEach(key => keys.add(key));
        });

        return Array.from(keys).map(key => ({
            key,
            header: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        }));
    }

    private escapeCSV(value: string, delimiter: string): string {
        if (value.includes('"') || value.includes(delimiter) || value.includes('\n') || value.includes('\r')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    private formatValue(value: any): string {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    private downloadFile(content: string, filename: string, mimeType: string): void {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }
}

// Export singleton
export const exportManager = ExportManager.getInstance();
