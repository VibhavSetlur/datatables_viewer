/**
 * Column Transformers - Enhanced Version
 * 
 * Production-grade plugin-based system for transforming cell content.
 * Supports chaining, conditions, and type-aware rendering.
 * 
 * @version 3.0.0
 */

import type { TransformConfig, TransformCondition } from '../types/schema';

// =============================================================================
// TYPES
// =============================================================================

interface TransformerOptions {
    [key: string]: any;
}

interface RowData {
    [key: string]: any;
}

type TransformerFunction = (value: any, options: TransformerOptions, rowData: RowData) => string;

interface LookupCacheEntry {
    value: string;
    timestamp: number;
}

interface OntologyCacheEntry {
    name: string;
    timestamp: number;
}

// =============================================================================
// TRANSFORMER CLASS
// =============================================================================

export class Transformers {
    private static ontologyCache = new Map<string, OntologyCacheEntry>();
    private static lookupCache = new Map<string, LookupCacheEntry>();
    private static cacheTimeout = 3600000; // 1 hour
    private static customTransformers = new Map<string, TransformerFunction>();

    // =========================================================================
    // UTILITIES
    // =========================================================================

    /**
     * Escape HTML special characters
     */
    public static escapeHtml(text: any): string {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    /**
     * Apply a transformation based on configuration
     * Supports single transform, array of transforms (chain), and conditions
     */
    public static apply(
        value: any,
        transformConfig: TransformConfig | TransformConfig[] | { type: string; options?: any },
        rowData: RowData
    ): string {
        if (!transformConfig) {
            return value !== null && value !== undefined ? Transformers.escapeHtml(String(value)) : '';
        }

        // Handle array of transforms (chaining)
        if (Array.isArray(transformConfig)) {
            return Transformers.chain(value, { transforms: transformConfig }, rowData);
        }

        // Cast to access potential condition/fallback properties
        const config = transformConfig as TransformConfig;

        // Check condition
        if (config.condition && !Transformers.evaluateCondition(config.condition, value, rowData)) {
            // Condition failed, use fallback
            if (config.fallback) {
                if (typeof config.fallback === 'string') {
                    return Transformers.escapeHtml(config.fallback);
                }
                return Transformers.apply(value, config.fallback, rowData);
            }
            return value !== null && value !== undefined ? Transformers.escapeHtml(String(value)) : '';
        }

        const transformerName = transformConfig.type;

        // Check built-in transformers
        if (typeof (Transformers as any)[transformerName] === 'function') {
            return (Transformers as any)[transformerName](value, transformConfig.options || {}, rowData);
        }

        // Check custom transformers
        if (Transformers.customTransformers.has(transformerName)) {
            const fn = Transformers.customTransformers.get(transformerName)!;
            return fn(value, transformConfig.options || {}, rowData);
        }

        console.warn(`Unknown transformer type: "${transformerName}"`);
        return value !== null && value !== undefined ? Transformers.escapeHtml(String(value)) : '';
    }

    /**
     * Evaluate a transform condition
     */
    private static evaluateCondition(condition: TransformCondition, value: any, rowData: RowData): boolean {
        const targetValue = condition.column ? rowData[condition.column] : value;
        const compareValue = condition.value;

        switch (condition.operator) {
            case 'eq': return targetValue === compareValue;
            case 'neq': return targetValue !== compareValue;
            case 'gt': return Number(targetValue) > Number(compareValue);
            case 'gte': return Number(targetValue) >= Number(compareValue);
            case 'lt': return Number(targetValue) < Number(compareValue);
            case 'lte': return Number(targetValue) <= Number(compareValue);
            case 'contains': return String(targetValue).includes(String(compareValue));
            case 'startsWith': return String(targetValue).startsWith(String(compareValue));
            case 'endsWith': return String(targetValue).endsWith(String(compareValue));
            case 'regex': return new RegExp(String(compareValue)).test(String(targetValue));
            case 'isEmpty': return targetValue === null || targetValue === undefined || targetValue === '';
            case 'isNotEmpty': return targetValue !== null && targetValue !== undefined && targetValue !== '';
            default: return true;
        }
    }

    // =========================================================================
    // CHAINING
    // =========================================================================

    /**
     * Chain multiple transforms
     */
    public static chain(value: any, options: TransformerOptions, rowData: RowData): string {
        if (!options.transforms || !Array.isArray(options.transforms)) {
            return Transformers.escapeHtml(String(value ?? ''));
        }

        let result = value;
        for (const transform of options.transforms) {
            // For intermediate steps, we need the raw value, not HTML
            // Only the final step should return HTML
            const isLast = options.transforms.indexOf(transform) === options.transforms.length - 1;
            if (isLast) {
                return Transformers.apply(result, transform, rowData);
            }
            // Get raw result for intermediate steps (strip HTML if needed)
            result = Transformers.apply(result, transform, rowData);
        }
        return Transformers.escapeHtml(String(result ?? ''));
    }

    // =========================================================================
    // NUMBER / FORMATTING TRANSFORMERS
    // =========================================================================

    /**
     * Format numbers with locale, decimals, prefix/suffix
     */
    public static number(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        const num = Number(value);
        if (isNaN(num)) return Transformers.escapeHtml(String(value));

        const decimals = options.decimals ?? 2;
        const locale = options.locale || 'en-US';
        const prefix = options.prefix || '';
        const suffix = options.suffix || '';

        let formatted: string;

        if (options.notation === 'scientific') {
            formatted = num.toExponential(decimals);
        } else if (options.notation === 'compact') {
            formatted = new Intl.NumberFormat(locale, {
                notation: 'compact',
                maximumFractionDigits: decimals
            }).format(num);
        } else if (options.notation === 'engineering') {
            formatted = num.toExponential(decimals);
        } else {
            formatted = new Intl.NumberFormat(locale, {
                minimumFractionDigits: options.minDecimals ?? 0,
                maximumFractionDigits: decimals
            }).format(num);
        }

        return `<span class="ts-number">${Transformers.escapeHtml(prefix)}${formatted}${Transformers.escapeHtml(suffix)}</span>`;
    }

    /**
     * Format percentage (0-1 or 0-100 → display)
     */
    public static percentage(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        let num = Number(value);
        if (isNaN(num)) return Transformers.escapeHtml(String(value));

        // If value is 0-1, multiply by 100
        if (options.scale100 !== false && num >= 0 && num <= 1) {
            num *= 100;
        }

        const decimals = options.decimals ?? 1;
        const formatted = num.toFixed(decimals);

        if (options.showBar) {
            const percent = Math.min(100, Math.max(0, num));
            const color = options.color || '#6366f1';
            return `
                <div class="ts-percentage">
                    <div class="ts-percentage-bar" style="width:${percent}%;background:${color}"></div>
                    <span class="ts-percentage-value">${formatted}%</span>
                </div>
            `;
        }

        return `<span class="ts-number">${formatted}%</span>`;
    }

    /**
     * Format currency
     */
    public static currency(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        const num = Number(value);
        if (isNaN(num)) return Transformers.escapeHtml(String(value));

        const locale = options.locale || 'en-US';
        const currency = options.currency || 'USD';

        const formatted = new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: options.decimals ?? 2,
            maximumFractionDigits: options.decimals ?? 2
        }).format(num);

        return `<span class="ts-currency">${formatted}</span>`;
    }

    /**
     * Format file size (bytes → human readable)
     */
    public static filesize(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        const bytes = Number(value);
        if (isNaN(bytes)) return Transformers.escapeHtml(String(value));

        const binary = options.binary !== false;
        const units = binary
            ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
            : ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const divisor = binary ? 1024 : 1000;

        let size = bytes;
        let unitIndex = 0;
        while (size >= divisor && unitIndex < units.length - 1) {
            size /= divisor;
            unitIndex++;
        }

        const decimals = options.decimals ?? (unitIndex === 0 ? 0 : 2);
        return `<span class="ts-filesize">${size.toFixed(decimals)} ${units[unitIndex]}</span>`;
    }

    /**
     * Format duration (seconds → human readable)
     */
    public static duration(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        let seconds = Number(value);
        if (isNaN(seconds)) return Transformers.escapeHtml(String(value));

        const format = options.format || 'short'; // short | long | clock

        if (format === 'clock') {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            if (h > 0) return `<span class="ts-duration">${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</span>`;
            return `<span class="ts-duration">${m}:${String(s).padStart(2, '0')}</span>`;
        }

        const units = [
            { name: format === 'long' ? 'day' : 'd', seconds: 86400 },
            { name: format === 'long' ? 'hour' : 'h', seconds: 3600 },
            { name: format === 'long' ? 'minute' : 'm', seconds: 60 },
            { name: format === 'long' ? 'second' : 's', seconds: 1 }
        ];

        const parts: string[] = [];
        for (const unit of units) {
            if (seconds >= unit.seconds) {
                const count = Math.floor(seconds / unit.seconds);
                seconds %= unit.seconds;
                if (format === 'long') {
                    parts.push(`${count} ${unit.name}${count !== 1 ? 's' : ''}`);
                } else {
                    parts.push(`${count}${unit.name}`);
                }
            }
        }

        return `<span class="ts-duration">${parts.join(format === 'long' ? ', ' : ' ') || '0s'}</span>`;
    }

    // =========================================================================
    // DATE / TIME TRANSFORMERS
    // =========================================================================

    /**
     * Format date
     */
    public static date(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        const date = new Date(value);
        if (isNaN(date.getTime())) return Transformers.escapeHtml(String(value));

        const locale = options.locale || 'en-US';

        if (options.relative) {
            return `<span class="ts-date" title="${date.toISOString()}">${Transformers.relativeTime(date)}</span>`;
        }

        const formatted = new Intl.DateTimeFormat(locale, {
            dateStyle: options.dateStyle || 'medium'
        }).format(date);

        return `<span class="ts-date">${formatted}</span>`;
    }

    /**
     * Format datetime
     */
    public static datetime(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        const date = new Date(value);
        if (isNaN(date.getTime())) return Transformers.escapeHtml(String(value));

        const locale = options.locale || 'en-US';
        const timezone = options.timezone || undefined;

        const formatted = new Intl.DateTimeFormat(locale, {
            dateStyle: options.dateStyle || 'medium',
            timeStyle: options.timeStyle || 'short',
            timeZone: timezone
        }).format(date);

        return `<span class="ts-datetime">${formatted}</span>`;
    }

    /**
     * Relative time helper
     */
    private static relativeTime(date: Date): string {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const seconds = Math.abs(diff / 1000);
        const future = diff < 0;

        const units: [number, string][] = [
            [31536000, 'year'],
            [2592000, 'month'],
            [86400, 'day'],
            [3600, 'hour'],
            [60, 'minute'],
            [1, 'second']
        ];

        for (const [unitSeconds, unitName] of units) {
            if (seconds >= unitSeconds) {
                const count = Math.floor(seconds / unitSeconds);
                const plural = count !== 1 ? 's' : '';
                return future
                    ? `in ${count} ${unitName}${plural}`
                    : `${count} ${unitName}${plural} ago`;
            }
        }
        return 'just now';
    }

    // =========================================================================
    // BOOLEAN TRANSFORMERS
    // =========================================================================

    /**
     * Format boolean values
     */
    public static boolean(value: any, options: TransformerOptions, _rowData: RowData): string {
        const boolValue = value === true || value === 'true' || value === 1 || value === '1';

        if (options.trueIcon || options.falseIcon) {
            const icon = boolValue ? (options.trueIcon || 'bi-check-circle-fill') : (options.falseIcon || 'bi-x-circle');
            const color = boolValue ? (options.trueColor || '#22c55e') : (options.falseColor || '#ef4444');
            return `<i class="${icon}" style="color:${color};font-size:1.1em"></i>`;
        }

        const text = boolValue ? (options.trueText || 'Yes') : (options.falseText || 'No');
        const color = boolValue ? (options.trueColor || '#22c55e') : (options.falseColor || '#94a3b8');
        return `<span class="ts-boolean" style="color:${color}">${Transformers.escapeHtml(text)}</span>`;
    }

    // =========================================================================
    // VISUALIZATION TRANSFORMERS
    // =========================================================================

    /**
     * Heatmap cell coloring based on value
     */
    public static heatmap(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        const num = Number(value);
        if (isNaN(num)) return Transformers.escapeHtml(String(value));

        const min = options.min ?? -4;
        const max = options.max ?? 4;
        const colorScale = options.colorScale || 'diverging';

        // Normalize to 0-1
        const normalized = (num - min) / (max - min);
        const clamped = Math.max(0, Math.min(1, normalized));

        let background: string;
        let textColor: string;

        if (colorScale === 'diverging') {
            // Blue (0.0) -> White (0.5) -> Red (1.0)
            let r, g, b;
            if (clamped < 0.5) {
                // Blue to White
                const t = clamped * 2; // 0 to 1
                // Blue: 59, 130, 246 (#3b82f6) -> White: 255, 255, 255
                r = Math.round(59 + (255 - 59) * t);
                g = Math.round(130 + (255 - 130) * t);
                b = Math.round(246 + (255 - 246) * t);
                textColor = t < 0.5 ? '#fff' : '#1e293b';
            } else {
                // White to Red
                const t = (clamped - 0.5) * 2; // 0 to 1
                // White: 255, 255, 255 -> Red: 239, 68, 68 (#ef4444)
                r = Math.round(255 + (239 - 255) * t);
                g = Math.round(255 + (68 - 255) * t);
                b = Math.round(255 + (68 - 255) * t);
                textColor = t > 0.5 ? '#fff' : '#1e293b';
            }
            background = `rgb(${r}, ${g}, ${b})`;

        } else if (colorScale === 'sequential') {
            // Light Blue -> Dark Blue
            // #ecfeff -> #0891b2
            const r = Math.round(236 + (8 - 236) * clamped);
            const g = Math.round(254 + (145 - 254) * clamped);
            const b = Math.round(255 + (178 - 255) * clamped);
            background = `rgb(${r}, ${g}, ${b})`;
            textColor = clamped > 0.5 ? '#fff' : '#1e293b';
        } else {
            background = 'transparent';
            textColor = 'inherit';
        }

        const decimals = options.decimals ?? 2;
        const displayValue = options.showValue !== false ? num.toFixed(decimals) : '';

        return `<span class="ts-heatmap" style="background:${background};color:${textColor}">${displayValue}</span>`;
    }

    /**
     * Progress bar
     */
    public static progress(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        const num = Number(value);
        if (isNaN(num)) return Transformers.escapeHtml(String(value));

        const max = options.max ?? 100;
        const percent = Math.min(100, Math.max(0, (num / max) * 100));
        const color = options.color || '#6366f1';
        const showValue = options.showValue !== false;

        return `
            <div class="ts-progress">
                <div class="ts-progress-bar" style="width:${percent}%;background:${color}"></div>
                ${showValue ? `<span class="ts-progress-value">${num}${options.suffix || ''}</span>` : ''}
            </div>
        `;
    }

    // =========================================================================
    // TEXT TRANSFORMERS
    // =========================================================================

    /**
     * Link transformer
     */
    public static link(value: any, options: TransformerOptions, rowData: RowData = {}): string {
        if (value === null || value === undefined || value === '') return '';

        const stringValue = String(value);
        const encodedValue = encodeURIComponent(stringValue);

        let url = options.urlTemplate.replace(/\{value\}/g, encodedValue);

        if (rowData && Object.keys(rowData).length > 0) {
            Object.keys(rowData).forEach(key => {
                const placeholder = `{${key}}`;
                if (url.includes(placeholder)) {
                    url = url.replace(
                        new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
                        encodeURIComponent(String(rowData[key] || ''))
                    );
                }
            });
        }

        let label = stringValue;
        if (options.labelTemplate) {
            label = options.labelTemplate.replace(/\{value\}/g, stringValue);
            if (rowData && Object.keys(rowData).length > 0) {
                Object.keys(rowData).forEach(key => {
                    label = label.replace(
                        new RegExp(`\\{${key}\\}`, 'g'),
                        String(rowData[key] || '')
                    );
                });
            }
        }

        const target = options.target || '_blank';
        const rel = target === '_blank' ? ' rel="noopener noreferrer"' : '';
        const iconHtml = options.icon ? `<i class="${options.icon}"></i> ` : '';

        return `<a href="${url}" target="${target}"${rel} class="ts-cell-link">${iconHtml}${Transformers.escapeHtml(label)}</a>`;
    }

    /**
     * Replace text using string or regex
     */
    public static replace(value: any, options: TransformerOptions): string {
        if (value === null || value === undefined || value === '') return '';

        const str = String(value);
        const find = options.pattern || options.find;
        const replaceWith = options.replaceWith || options.replace || '';

        if (!find) return str;

        if (options.isRegex) {
            try {
                const flags = options.flags || 'g';
                const regex = new RegExp(find, flags);
                return str.replace(regex, replaceWith);
            } catch (e) {
                console.error('Invalid regex in replace transformer', e);
                return str;
            }
        }

        return str.split(find).join(replaceWith);
    }

    /**
     * Merge multiple columns
     */
    public static merge(_value: any, options: TransformerOptions, rowData: RowData): string {
        if (!rowData || !options.columns || !Array.isArray(options.columns)) return '';

        const skipEmpty = options.skipEmpty !== false;

        if (options.template) {
            let result = options.template;
            options.columns.forEach((col: string) => {
                const colValue = rowData[col];
                const placeholder = `{${col}}`;

                if (skipEmpty && (colValue === null || colValue === undefined || colValue === '')) {
                    result = result.replace(new RegExp(`\\s*\\(${placeholder}\\)`, 'g'), '');
                    result = result.replace(new RegExp(`${placeholder}\\s*[|,;:]\\s*`, 'g'), '');
                    result = result.replace(new RegExp(`\\s*[|,;:]\\s*${placeholder}`, 'g'), '');
                    result = result.replace(placeholder, '');
                } else {
                    result = result.replace(placeholder, String(colValue || ''));
                }
            });
            return Transformers.escapeHtml(result.trim());
        }

        const separator = options.separator || ' | ';
        const values = options.columns
            .map((col: string) => rowData[col])
            .filter((v: any) => !skipEmpty || (v !== null && v !== undefined && v !== ''))
            .map((v: any) => String(v));

        return Transformers.escapeHtml(values.join(separator));
    }

    /**
     * Badge/chip display
     */
    public static badge(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        const stringValue = String(value);
        const colorMap = options.colorMap || {};
        const validColor = colorMap[stringValue] || options.color || options.defaultColor;
        let color = validColor;

        if (!color) {
            // Deterministic color generation for unmapped values (Research Grade Palette)
            const palette = [
                '#6366f1', // Indigo
                '#ef4444', // Red
                '#10b981', // Emerald
                '#f59e0b', // Amber
                '#3b82f6', // Blue
                '#8b5cf6', // Violet
                '#ec4899', // Pink
                '#06b6d4', // Cyan
                '#84cc16', // Lime
                '#f97316'  // Orange
            ];
            let hash = 0;
            for (let i = 0; i < stringValue.length; i++) {
                hash = stringValue.charCodeAt(i) + ((hash << 5) - hash);
            }
            color = palette[Math.abs(hash) % palette.length];
        }

        const variant = options.variant || 'default'; // default | subtle | outline

        let style: string;
        if (variant === 'subtle') {
            style = `background:${color}15;color:${color};border:none`;
        } else if (variant === 'outline') {
            style = `background:transparent;color:${color};border:1px solid ${color}`;
        } else {
            style = `background:${color}20;color:${color};border:1px solid ${color}40`;
        }

        return `<span class="ts-badge" style="${style}">${Transformers.escapeHtml(stringValue)}</span>`;
    }

    /**
     * Array as badges
     */
    public static array(value: any, options: TransformerOptions, rowData: RowData): string {
        if (value === null || value === undefined) return '';

        let items: any[];
        if (Array.isArray(value)) {
            items = value;
        } else if (typeof value === 'string') {
            const separator = options.separator || ',';
            items = value.split(separator).map(s => s.trim()).filter(Boolean);
        } else {
            return Transformers.escapeHtml(String(value));
        }

        const limit = options.limit || 5;
        const displayed = items.slice(0, limit);
        const remaining = items.length - limit;

        const badges = displayed.map(item =>
            Transformers.badge(item, { color: options.color || '#6366f1', variant: 'subtle' }, rowData)
        ).join(' ');

        if (remaining > 0) {
            return `${badges} <span class="ts-badge-more">+${remaining}</span>`;
        }

        return badges;
    }

    /**
     * Sequence display (DNA/RNA/Protein)
     */
    public static sequence(value: any, options: TransformerOptions): string {
        if (!value) return '';
        let str = String(value);

        if (options.chunkSize && options.chunkSize > 0) {
            const regex = new RegExp(`.{1,${options.chunkSize}}`, 'g');
            const match = str.match(regex);
            if (match) str = match.join(' ');
        }

        const maxLength = options.maxLength || 30;
        const fullStr = str;
        const showCopy = options.showCopyButton !== false;

        if (str.length > maxLength) {
            str = str.substring(0, maxLength) + '...';
        }

        const copyBtn = showCopy
            ? `<button class="ts-copy-btn" data-id="${Transformers.escapeHtml(fullStr)}" title="Copy sequence"><i class="bi bi-clipboard"></i></button>`
            : '';

        return `<span class="ts-sequence" title="${Transformers.escapeHtml(fullStr)}">${Transformers.escapeHtml(str)}${copyBtn}</span>`;
    }

    /**
     * Truncate text
     */
    public static truncate(value: any, options: TransformerOptions): string {
        if (!value) return '';
        const str = String(value);
        const length = options.length || 50;
        const ellipsis = options.ellipsis ?? '...';

        if (str.length <= length) return Transformers.escapeHtml(str);

        const truncated = str.substring(0, length) + ellipsis;
        return `<span title="${Transformers.escapeHtml(str)}">${Transformers.escapeHtml(truncated)}</span>`;
    }

    // =========================================================================
    // ONTOLOGY / LOOKUP TRANSFORMERS
    // =========================================================================

    /**
     * Pre-load ontology terms into cache
     */
    public static preLoadOntology(map: Record<string, string>, type: string = 'custom'): void {
        const now = Date.now();
        Object.entries(map).forEach(([id, name]) => {
            const cacheKey = `${type}:${id}`;
            Transformers.ontologyCache.set(cacheKey, { name, timestamp: now });
        });
    }

    /**
     * Ontology term display
     */
    public static ontology(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        const delimiter = options.delimiter;
        if (delimiter && typeof value === 'string' && value.includes(delimiter)) {
            const terms = value.split(delimiter).map(t => t.trim()).filter(Boolean);
            if (terms.length === 0) return '';

            // Render each term and join them
            return `<div class="ts-ontology-list" style="display:flex;flex-wrap:wrap;gap:4px">
                ${terms.map(term => Transformers.renderSingleOntologyTerm(term, options)).join('')}
            </div>`;
        }

        return Transformers.renderSingleOntologyTerm(String(value).trim(), options);
    }

    private static renderSingleOntologyTerm(termId: string, options: TransformerOptions): string {
        const cacheKey = `${options.ontologyType || 'custom'}:${termId}`;
        const cached = Transformers.ontologyCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp < Transformers.cacheTimeout)) {
            return Transformers.formatOntologyTerm(termId, cached.name, options);
        }

        // Trigger async lookup
        Transformers.lookupOntologyTerm(termId, options, cacheKey);

        return Transformers.formatOntologyTerm(termId, null, options);
    }

    /**
     * Lookup value from map or API
     */
    public static lookup(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';
        const key = String(value);

        // 1. Static Map
        if (options.map && typeof options.map === 'object') {
            const mapped = options.map[key];
            if (mapped !== undefined) return Transformers.escapeHtml(String(mapped));
        }

        // 2. Async Lookup via URL
        if (options.apiUrl) {
            const cacheKey = `lookup:${options.apiUrl}:${key}`;
            const cached = Transformers.lookupCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < Transformers.cacheTimeout)) {
                return Transformers.escapeHtml(cached.value);
            }

            Transformers.performAsyncLookup(key, options, cacheKey);
            return Transformers.escapeHtml(key) + ' <span class="ts-loading-indicator">...</span>';
        }

        return options.fallback ? Transformers.escapeHtml(options.fallback) : Transformers.escapeHtml(key);
    }

    private static formatOntologyTerm(termId: string, termName: string | null, options: TransformerOptions): string {
        const showId = options.showId !== false;
        const escapedId = Transformers.escapeHtml(termId);
        const style = options.style || 'default';

        // Base URL template replacement
        let url = '#';
        if (options.urlTemplate) {
            url = options.urlTemplate.replace(/\{value\}/g, encodeURIComponent(termId));
        }

        // If name provided, use it for template replacement too if needed
        if (termName && options.urlTemplate && options.urlTemplate.includes('{name}')) {
            url = url.replace(/\{name\}/g, encodeURIComponent(termName));
        }

        const tag = options.urlTemplate ? 'a' : 'span';
        const href = options.urlTemplate ? ` href="${url}" target="_blank" rel="noopener noreferrer"` : '';

        if (style === 'badge') {
            if (termName) {
                return `<${tag}${href} class="ts-badge ts-ontology-badge" data-term="${escapedId}" style="text-decoration:none">${Transformers.escapeHtml(termName)}</${tag}>`;
            }
            return `<${tag}${href} class="ts-badge ts-ontology-badge ts-loading-term" data-term="${escapedId}" style="text-decoration:none">${escapedId}</${tag}>`;
        }

        if (termName) {
            const escapedName = Transformers.escapeHtml(termName);
            if (showId) {
                return `<${tag}${href} class="ts-ontology" data-term="${escapedId}">${escapedName} <span class="ts-ontology-id">(${escapedId})</span></${tag}>`;
            }
            return `<${tag}${href} class="ts-ontology" data-term="${escapedId}">${escapedName}</${tag}>`;
        }

        return `<${tag}${href} class="ts-ontology ts-loading-term" data-term="${escapedId}">${escapedId}</${tag}>`;
    }

    private static async lookupOntologyTerm(termId: string, options: TransformerOptions, cacheKey: string) {
        // Debounce or queue? For now just direct async
        try {
            let name: string | null = null;

            // Check pre-loaded map first if provided in options (fallback if not in global cache)
            if (options.map && options.map[termId]) {
                name = options.map[termId];
            } else {
                switch (options.ontologyType) {
                    case 'GO':
                        name = await Transformers.lookupGO(termId);
                        break;
                    case 'KEGG':
                        name = termId; // Placeholder
                        break;
                    case 'EC':
                        name = termId; // Placeholder
                        break;
                    case 'custom':
                        // If we have a lookup endpoint but NOT a table lookup (which should be pre-loaded)
                        if (options.lookupEndpoint) {
                            name = await Transformers.lookupCustom(termId, options.lookupEndpoint);
                        }
                        break;
                }
            }

            if (name) {
                Transformers.ontologyCache.set(cacheKey, { name, timestamp: Date.now() });
                Transformers.updateOntologyElements(termId, name, options);
            }
        } catch (e) {
            console.warn(`Ontology lookup failed for ${termId}`, e);
        }
    }

    private static updateOntologyElements(termId: string, name: string, options: TransformerOptions) {
        // This is tricky because we might have split elements now.
        // The data-term attribute is on the inner span/a, so this selector still works.
        const elements = document.querySelectorAll(`.ts-ontology[data-term="${termId}"], .ts-ontology-badge[data-term="${termId}"]`);
        elements.forEach(el => {
            el.classList.remove('ts-loading-term');
            const showId = options.showId !== false;

            // Preserve href if it's an anchor

            if (el.classList.contains('ts-ontology-badge')) {
                el.textContent = name;
            } else if (showId) {
                el.innerHTML = `${Transformers.escapeHtml(name)} <span class="ts-ontology-id">(${Transformers.escapeHtml(termId)})</span>`;
            } else {
                el.textContent = name;
            }
        });
    }

    private static async lookupGO(termId: string): Promise<string | null> {
        const response = await fetch(`https://www.ebi.ac.uk/QuickGO/services/ontology/go/terms/${termId}`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.results?.[0]?.name || null;
    }

    private static async lookupCustom(termId: string, endpoint: string): Promise<string | null> {
        const url = endpoint.replace('{value}', encodeURIComponent(termId));
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data.name || data.label || data.term || null;
    }

    private static async performAsyncLookup(key: string, options: TransformerOptions, cacheKey: string) {
        try {
            const url = options.apiUrl.replace('{value}', encodeURIComponent(key));
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                const result = options.valuePath ? data[options.valuePath] : (data.value || data.name || data);
                if (result) {
                    Transformers.lookupCache.set(cacheKey, { value: String(result), timestamp: Date.now() });
                }
            }
        } catch (e) {
            console.error('Async lookup failed', e);
        }
    }

    // =========================================================================
    // CONDITIONAL TRANSFORMER
    // =========================================================================

    /**
     * Conditional rendering based on value
     */
    public static conditional(value: any, options: TransformerOptions, rowData: RowData): string {
        if (!options.conditions || !Array.isArray(options.conditions)) {
            return Transformers.escapeHtml(String(value ?? ''));
        }

        for (const cond of options.conditions) {
            if (Transformers.evaluateCondition(cond.when, value, rowData)) {
                if (cond.transform) {
                    return Transformers.apply(value, cond.transform, rowData);
                }
                if (cond.value !== undefined) {
                    return Transformers.escapeHtml(String(cond.value));
                }
            }
        }

        // Default fallback
        if (options.default) {
            if (typeof options.default === 'object' && options.default.type) {
                return Transformers.apply(value, options.default, rowData);
            }
            return Transformers.escapeHtml(String(options.default));
        }

        return Transformers.escapeHtml(String(value ?? ''));
    }

    // =========================================================================
    // ONTOLOGY LOOKUP TRANSFORMER
    // =========================================================================

    /**
     * Ontology Lookup transformer
     * 
     * Displays ontology term IDs with their descriptions fetched from external sources.
     * - Parses JSON arrays of IDs
     * - Extracts base IDs from compartmentalized IDs (e.g., rxn09165_c0 → rxn09165)
     * - Fetches descriptions from ModelSEED or other APIs
     * - Renders with truncation and tooltip for long descriptions
     * - Makes entire element a clickable link while preserving ID for copy-paste
     * 
     * Options:
     * - ontologyType: 'modelseed_reactions' | 'modelseed_compounds' | 'custom'
     * - urlTemplate: URL pattern with {id} placeholder (e.g., "https://modelseed.org/biochem/reactions/{id}")
     * - idPattern: Regex string to extract base ID (default: "(rxn\\d+)" for reactions)
     * - maxLength: Max characters for description before truncating (default: 50)
     * - showId: Whether to show the ID (default: true)
     * - style: 'inline' | 'badge' (default: 'inline')
     */
    public static ontologyLookup(value: any, options: TransformerOptions, _rowData: RowData): string {
        if (value === null || value === undefined || value === '') return '';

        // Parse JSON array if needed
        let items: string[];
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.startsWith('[')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    items = Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [trimmed];
                } catch {
                    items = [trimmed];
                }
            } else {
                // Split by comma or semicolon
                items = trimmed.split(/[,;]/).map(s => s.trim()).filter(Boolean);
            }
        } else if (Array.isArray(value)) {
            items = value.filter(Boolean).map(String);
        } else {
            items = [String(value)];
        }

        if (items.length === 0) return '';

        // Render each item
        const rendered = items.slice(0, options.limit || 5).map(item =>
            Transformers.renderOntologyLookupTerm(item, options)
        );

        const remaining = items.length - (options.limit || 5);
        const moreTag = remaining > 0
            ? `<span class="ts-ontology-more" title="${items.slice(options.limit || 5).join(', ')}">+${remaining}</span>`
            : '';

        return `<div class="ts-ontology-lookup-list">${rendered.join('')}${moreTag}</div>`;
    }

    /**
     * Render a single ontology lookup term
     */
    private static renderOntologyLookupTerm(rawId: string, options: TransformerOptions): string {
        // Extract base ID using pattern (strip compartment suffixes like _c0)
        const idPattern = options.idPattern || '(rxn\\d+|cpd\\d+)';
        const match = rawId.match(new RegExp(idPattern, 'i'));
        const baseId = match ? match[1] : rawId;

        const cacheKey = `ontolookup:${options.ontologyType || 'custom'}:${baseId}`;
        const cached = Transformers.ontologyCache.get(cacheKey);

        const escapedRawId = Transformers.escapeHtml(rawId);
        const showId = options.showId !== false;
        const maxLength = options.maxLength || 50;
        const style = options.style || 'inline';

        // Build URL
        let url = '#';
        if (options.urlTemplate) {
            url = options.urlTemplate.replace(/\{id\}/g, encodeURIComponent(baseId));
        }

        // If we have cached description
        if (cached && (Date.now() - cached.timestamp < Transformers.cacheTimeout)) {
            return Transformers.formatOntologyLookupTerm(baseId, escapedRawId, cached.name, url, showId, maxLength, style);
        }

        // Trigger async lookup
        Transformers.lookupOntologyDescription(baseId, options, cacheKey);

        // Return loading state - ID is shown, rest placeholder
        return Transformers.formatOntologyLookupTerm(baseId, escapedRawId, null, url, showId, maxLength, style);
    }

    /**
     * Format ontology lookup term HTML
     */
    private static formatOntologyLookupTerm(
        baseId: string,
        rawId: string,
        description: string | null,
        url: string,
        showId: boolean,
        maxLength: number,
        style: string
    ): string {
        const escapedId = Transformers.escapeHtml(baseId);
        const hasUrl = url !== '#';
        const linkAttrs = hasUrl ? `href="${url}" target="_blank" rel="noopener noreferrer"` : '';
        const tag = hasUrl ? 'a' : 'span';

        if (style === 'badge') {
            if (description) {
                const truncated = description.length > maxLength
                    ? description.substring(0, maxLength) + '…'
                    : description;
                const fullTitle = `${rawId}: ${description}`;

                return `<${tag} ${linkAttrs} class="ts-badge ts-ontology-lookup-badge" data-term="${escapedId}" title="${Transformers.escapeHtml(fullTitle)}" style="text-decoration:none">
                    ${showId ? `<span class="ts-ontology-id">${escapedId}</span>: ` : ''}
                    <span class="ts-ontology-name">${Transformers.escapeHtml(truncated)}</span>
                </${tag}>`;
            }
            return `<${tag} ${linkAttrs} class="ts-badge ts-ontology-lookup-badge ts-loading-term" data-term="${escapedId}" title="${rawId}" style="text-decoration:none">${escapedId}</${tag}>`;
        }

        // Inline style (default)
        if (description) {
            const truncated = description.length > maxLength
                ? description.substring(0, maxLength) + '…'
                : description;
            const fullTitle = `${rawId}: ${description}`;

            return `<${tag} ${linkAttrs} class="ts-ontology-lookup" data-term="${escapedId}" title="${Transformers.escapeHtml(fullTitle)}">
                ${showId ? `<span class="ts-ontology-id">${escapedId}</span>: ` : ''}
                <span class="ts-ontology-name">${Transformers.escapeHtml(truncated)}</span>
            </${tag}>`;
        }

        // Loading state - just show ID
        return `<${tag} ${linkAttrs} class="ts-ontology-lookup ts-loading-term" data-term="${escapedId}" title="${rawId}">
            <span class="ts-ontology-id">${escapedId}</span>
            <span class="ts-loading-indicator">…</span>
        </${tag}>`;
    }

    /**
     * Async lookup for ontology descriptions
     */
    private static async lookupOntologyDescription(termId: string, options: TransformerOptions, cacheKey: string): Promise<void> {
        try {
            let name: string | null = null;
            const ontologyType = options.ontologyType || 'custom';

            switch (ontologyType) {
                // ModelSEED metabolic data
                case 'modelseed_reactions':
                    name = await Transformers.lookupModelSeedReaction(termId);
                    break;
                case 'modelseed_compounds':
                    name = await Transformers.lookupModelSeedCompound(termId);
                    break;

                // Gene Ontology (GO)
                case 'go':
                    name = await Transformers.lookupGOTerm(termId);
                    break;

                // KEGG Orthologs
                case 'kegg':
                    name = await Transformers.lookupKEGGOrtholog(termId);
                    break;

                // Pfam Domains
                case 'pfam':
                    name = await Transformers.lookupPfamDomain(termId);
                    break;

                // COG Categories
                case 'cog':
                    name = await Transformers.lookupCOG(termId);
                    break;

                // EC Numbers (Enzyme Commission)
                case 'ec':
                    name = await Transformers.lookupECNumber(termId);
                    break;

                // Sequence Ontology
                case 'so':
                    name = await Transformers.lookupSequenceOntology(termId);
                    break;

                // UniProt Reference Clusters
                case 'uniref':
                    name = await Transformers.lookupUniRef(termId);
                    break;

                // Custom API lookup
                case 'custom':
                    if (options.apiUrl) {
                        const url = options.apiUrl.replace(/\{id\}/g, encodeURIComponent(termId));
                        const response = await fetch(url);
                        if (response.ok) {
                            const data = await response.json();
                            name = data.name || data.definition || data.equation || null;
                        }
                    }
                    break;
            }

            if (name) {
                Transformers.ontologyCache.set(cacheKey, { name, timestamp: Date.now() });
                Transformers.updateOntologyLookupElements(termId, name, options);
            }
        } catch (e) {
            console.warn(`Ontology lookup failed for ${termId}`, e);
        }
    }

    /**
     * Lookup ModelSEED reaction
     */
    private static async lookupModelSeedReaction(reactionId: string): Promise<string | null> {
        try {
            // ModelSEED provides a Solr-based API
            const response = await fetch(`https://modelseed.org/solr/reactions/select?q=id:${reactionId}&wt=json`);
            if (!response.ok) return null;
            const data = await response.json();
            if (data.response?.docs?.length > 0) {
                const doc = data.response.docs[0];
                // Return equation or name
                return doc.definition || doc.name || doc.equation || null;
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Lookup ModelSEED compound
     */
    private static async lookupModelSeedCompound(compoundId: string): Promise<string | null> {
        try {
            const response = await fetch(`https://modelseed.org/solr/compounds/select?q=id:${compoundId}&wt=json`);
            if (!response.ok) return null;
            const data = await response.json();
            if (data.response?.docs?.length > 0) {
                const doc = data.response.docs[0];
                return doc.name || doc.formula || null;
            }
            return null;
        } catch {
            return null;
        }
    }

    // =========================================================================
    // ONTOLOGY API LOOKUP METHODS
    // =========================================================================

    /**
     * Lookup Gene Ontology (GO) term name
     * Uses QuickGO API from EBI
     */
    private static async lookupGOTerm(goId: string): Promise<string | null> {
        try {
            // Normalize GO ID format (GO:0033103 or just 0033103)
            const normalizedId = goId.startsWith('GO:') ? goId : `GO:${goId}`;
            const response = await fetch(
                `https://www.ebi.ac.uk/QuickGO/services/ontology/go/terms/${encodeURIComponent(normalizedId)}`,
                { headers: { 'Accept': 'application/json' } }
            );
            if (!response.ok) return null;
            const data = await response.json();
            if (data.results?.[0]?.name) {
                return data.results[0].name;
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Lookup KEGG Ortholog name
     * Uses KEGG REST API
     */
    private static async lookupKEGGOrtholog(koId: string): Promise<string | null> {
        try {
            // Normalize KO ID format (K11904 or KEGG:K11904)
            const normalizedId = koId.replace(/^KEGG:/i, '').replace(/^ko:/i, '');
            const response = await fetch(`https://rest.kegg.jp/get/${normalizedId}`);
            if (!response.ok) return null;
            const text = await response.text();
            // Parse KEGG flat file format - extract NAME or DEFINITION
            const nameMatch = text.match(/^DEFINITION\s+(.+?)(?:\n|$)/m);
            if (nameMatch) return nameMatch[1].trim();
            const defMatch = text.match(/^NAME\s+(.+?)(?:\n|$)/m);
            if (defMatch) return defMatch[1].trim();
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Lookup Pfam domain name
     * Uses InterPro API
     */
    private static async lookupPfamDomain(pfamId: string): Promise<string | null> {
        try {
            // Normalize Pfam ID (PF00001 or just 00001)
            const normalizedId = pfamId.startsWith('PF') ? pfamId : `PF${pfamId}`;
            const response = await fetch(
                `https://www.ebi.ac.uk/interpro/api/entry/pfam/${normalizedId}`,
                { headers: { 'Accept': 'application/json' } }
            );
            if (!response.ok) return null;
            const data = await response.json();
            return data.metadata?.name || null;
        } catch {
            return null;
        }
    }

    /**
     * Lookup COG category or ID description
     * Uses NCBI COG API for full COG IDs and EggNOG for categories
     */
    private static async lookupCOG(cogId: string): Promise<string | null> {
        try {
            // Handle COG category letters (e.g., "U" or "COG:U")
            const cleanId = cogId.replace(/^COG:/i, '').trim();

            // For single-letter COG categories, use EggNOG API
            if (cleanId.length === 1 && /^[A-Z]$/i.test(cleanId)) {
                return await Transformers.lookupCOGCategory(cleanId.toUpperCase());
            }

            // For full COG IDs (e.g., COG3157), use NCBI COG API
            if (/^COG\d+$/i.test(cleanId)) {
                return await Transformers.lookupCOGId(cleanId.toUpperCase());
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Lookup COG category description from NCBI COG API
     */
    private static async lookupCOGCategory(category: string): Promise<string | null> {
        try {
            // Use NCBI COG API for functional category descriptions
            const response = await fetch(
                `https://www.ncbi.nlm.nih.gov/research/cog/api/cog/?cat=${encodeURIComponent(category)}&format=json`
            );

            if (response.ok) {
                const data = await response.json();
                if (data.results?.[0]?.fun_cat_description) {
                    return data.results[0].fun_cat_description;
                }
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Lookup full COG ID description from NCBI COG database
     */
    private static async lookupCOGId(cogId: string): Promise<string | null> {
        try {
            const response = await fetch(
                `https://www.ncbi.nlm.nih.gov/research/cog/api/cog/${encodeURIComponent(cogId)}/?format=json`
            );

            if (!response.ok) return null;

            const data = await response.json();
            if (data.cog_name) {
                return data.cog_name;
            }
            if (data.fun_cat_description) {
                return data.fun_cat_description;
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Lookup EC number enzyme name
     * Uses KEGG Enzyme database
     */
    private static async lookupECNumber(ecNumber: string): Promise<string | null> {
        try {
            // Normalize EC format (remove "EC:" prefix if present)
            const cleanEc = ecNumber.replace(/^EC:/i, '').trim();
            const response = await fetch(`https://rest.kegg.jp/get/ec:${cleanEc}`);
            if (!response.ok) return null;
            const text = await response.text();
            // Parse KEGG flat file - extract NAME
            const nameMatch = text.match(/^NAME\s+(.+?)(?:\n|$)/m);
            if (nameMatch) {
                // KEGG may have multiple names separated by semicolons
                return nameMatch[1].split(';')[0].trim();
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Lookup Sequence Ontology term from EBI OLS API
     * Provides scalable access to all SO terms without hardcoded values
     */
    private static async lookupSequenceOntology(soId: string): Promise<string | null> {
        try {
            // Normalize SO ID (SO:0001217 or just 0001217)
            const normalizedId = soId.startsWith('SO:') ? soId : `SO:${soId}`;

            // Use EBI Ontology Lookup Service (OLS) API
            // Format: http://purl.obolibrary.org/obo/SO_0001217
            const oboId = normalizedId.replace(':', '_');
            const response = await fetch(
                `https://www.ebi.ac.uk/ols4/api/ontologies/so/terms?iri=http://purl.obolibrary.org/obo/${oboId}`,
                { headers: { 'Accept': 'application/json' } }
            );

            if (!response.ok) {
                // Fallback to OLS v3 API
                const fallbackResponse = await fetch(
                    `https://www.ebi.ac.uk/ols/api/ontologies/so/terms?iri=http://purl.obolibrary.org/obo/${oboId}`,
                    { headers: { 'Accept': 'application/json' } }
                );
                if (!fallbackResponse.ok) return null;
                const data = await fallbackResponse.json();
                if (data._embedded?.terms?.[0]?.label) {
                    return data._embedded.terms[0].label;
                }
                return null;
            }

            const data = await response.json();
            // OLS4 response format
            if (data._embedded?.terms?.[0]?.label) {
                return data._embedded.terms[0].label;
            }
            // Alternative OLS4 format
            if (data.elements?.[0]?.label) {
                return data.elements[0].label;
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Lookup UniRef cluster representative protein name
     * Uses UniProt REST API
     */
    private static async lookupUniRef(unirefId: string): Promise<string | null> {
        try {
            // Normalize UniRef ID (UniRef100_A0A093EEX8 or just A0A093EEX8)
            let cleanId = unirefId;

            // Extract the base accession from UniRef ID
            const match = unirefId.match(/UniRef\d+_(\w+)/i);
            if (match) {
                cleanId = match[1]; // Get the accession part
            }

            // Query UniProt for the protein info
            const response = await fetch(
                `https://rest.uniprot.org/uniprotkb/${cleanId}.json`
            );
            if (!response.ok) return null;
            const data = await response.json();

            // Get recommended name or submitted name
            const proteinDesc = data.proteinDescription;
            if (proteinDesc?.recommendedName?.fullName?.value) {
                return proteinDesc.recommendedName.fullName.value;
            }
            if (proteinDesc?.submissionNames?.[0]?.fullName?.value) {
                return proteinDesc.submissionNames[0].fullName.value;
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Update DOM elements after async lookup completes
     */
    private static updateOntologyLookupElements(termId: string, description: string, options: TransformerOptions): void {
        const maxLength = options.maxLength || 50;
        const showId = options.showId !== false;
        const truncated = description.length > maxLength
            ? description.substring(0, maxLength) + '…'
            : description;

        // Find and update elements
        const elements = document.querySelectorAll(`.ts-ontology-lookup[data-term="${termId}"], .ts-ontology-lookup-badge[data-term="${termId}"]`);
        elements.forEach(el => {
            el.classList.remove('ts-loading-term');
            el.setAttribute('title', `${termId}: ${description}`);

            // Update content
            const idSpan = showId ? `<span class="ts-ontology-id">${Transformers.escapeHtml(termId)}</span>: ` : '';
            el.innerHTML = `${idSpan}<span class="ts-ontology-name">${Transformers.escapeHtml(truncated)}</span>`;
        });
    }

    // =========================================================================
    // REGISTRATION
    // =========================================================================

    /**
     * Register a custom transformer
     */
    public static register(name: string, fn: TransformerFunction): void {
        Transformers.customTransformers.set(name, fn);
        console.log(`Registered custom transformer: ${name}`);
    }

    /**
     * Unregister a custom transformer
     */
    public static unregister(name: string): boolean {
        return Transformers.customTransformers.delete(name);
    }

    /**
     * Get list of all available transformers
     */
    public static getAvailableTransformers(): string[] {
        const builtIn = [
            'number', 'percentage', 'currency', 'filesize', 'duration',
            'date', 'datetime', 'boolean',
            'heatmap', 'progress',
            'link', 'replace', 'merge', 'badge', 'array', 'sequence', 'truncate',
            'ontology', 'ontologyLookup', 'lookup',
            'chain', 'conditional'
        ];
        const custom = Array.from(Transformers.customTransformers.keys());
        return [...builtIn, ...custom];
    }

    /**
     * Apply custom transformer (legacy compatibility)
     */
    public static custom(value: any, options: TransformerOptions, rowData: RowData): string {
        const fn = Transformers.customTransformers.get(options.functionName);
        if (!fn) return value ? String(value) : '';
        try {
            return fn(value, options.params || {}, rowData);
        } catch (e) {
            console.error(`Custom transformer error`, e);
            return value ? String(value) : '';
        }
    }
}
