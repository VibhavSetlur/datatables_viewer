/**
 * Column Transformers
 * 
 * Plugin-based system for transforming cell content during rendering.
 * Each transformer receives the cell value, options, and full row data.
 * 
 * @fileoverview Column transformation plugins for KBase Table Renderer
 * @author KBase Team
 * @license MIT
 */

'use strict';

/**
 * Transformer registry and implementations
 */
const Transformers = {
    /**
     * Ontology term cache for performance
     * @type {Map<string, {name: string, timestamp: number}>}
     */
    _ontologyCache: new Map(),

    /**
     * Cache timeout in milliseconds (default: 1 hour)
     */
    _cacheTimeout: 3600000,

    // =========================================================================
    // LINK TRANSFORMER
    // =========================================================================

    /**
     * Link Transformer - Converts cell value to external link
     * 
     * @param {string|number|null} value - Cell value
     * @param {Object} options - Transformer options
     * @param {string} options.urlTemplate - URL with {value} placeholder
     * @param {string} [options.labelTemplate] - Display text template
     * @param {string} [options.icon] - Icon class
     * @param {string} [options.target="_blank"] - Link target
     * @param {Object} rowData - Full row data object
     * @returns {string} HTML string
     * 
     * @example
     * // UniProt link
     * Transformers.link("P12345", {
     *     urlTemplate: "https://www.uniprot.org/uniprotkb/{value}"
     * }, rowData);
     * // Returns: <a href="https://www.uniprot.org/uniprotkb/P12345" ...>P12345</a>
     */
    link(value, options, rowData) {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        const stringValue = String(value);
        const encodedValue = encodeURIComponent(stringValue);

        // Build URL from template
        let url = options.urlTemplate.replace(/\{value\}/g, encodedValue);

        // Support additional placeholders from row data
        if (rowData) {
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

        // Build label
        let label = stringValue;
        if (options.labelTemplate) {
            label = options.labelTemplate.replace(/\{value\}/g, stringValue);
            if (rowData) {
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

        return `<a href="${url}" target="${target}"${rel} class="ts-cell-link">${iconHtml}${Transformers._escapeHtml(label)}</a>`;
    },

    // =========================================================================
    // MERGE TRANSFORMER
    // =========================================================================

    /**
     * Merge Transformer - Combines multiple column values
     * 
     * @param {string|number|null} value - Primary cell value (often unused)
     * @param {Object} options - Transformer options
     * @param {string[]} options.columns - Column names to merge
     * @param {string} [options.template] - Custom template like "{col1} ({col2})"
     * @param {string} [options.separator=" | "] - Separator when no template
     * @param {boolean} [options.skipEmpty=true] - Skip null/empty values
     * @param {Object} rowData - Full row data object
     * @returns {string} Merged value
     * 
     * @example
     * // Template merge
     * Transformers.merge(null, {
     *     columns: ["gene_name", "locus_tag"],
     *     template: "{gene_name} ({locus_tag})"
     * }, { gene_name: "dnaA", locus_tag: "RS00005" });
     * // Returns: "dnaA (RS00005)"
     */
    merge(value, options, rowData) {
        if (!rowData || !options.columns || !Array.isArray(options.columns)) {
            return '';
        }

        const skipEmpty = options.skipEmpty !== false;

        // Template-based merge
        if (options.template) {
            let result = options.template;
            options.columns.forEach(col => {
                const colValue = rowData[col];
                const placeholder = `{${col}}`;

                if (skipEmpty && (colValue === null || colValue === undefined || colValue === '')) {
                    // Remove placeholder and surrounding delimiters for empty values
                    result = result.replace(new RegExp(`\\s*\\(${placeholder}\\)`, 'g'), '');
                    result = result.replace(new RegExp(`${placeholder}\\s*[|,;:]\\s*`, 'g'), '');
                    result = result.replace(new RegExp(`\\s*[|,;:]\\s*${placeholder}`, 'g'), '');
                    result = result.replace(placeholder, '');
                } else {
                    result = result.replace(placeholder, String(colValue || ''));
                }
            });
            return Transformers._escapeHtml(result.trim());
        }

        // Separator-based merge
        const separator = options.separator || ' | ';
        const values = options.columns
            .map(col => rowData[col])
            .filter(v => !skipEmpty || (v !== null && v !== undefined && v !== ''))
            .map(v => String(v));

        return Transformers._escapeHtml(values.join(separator));
    },

    // =========================================================================
    // ONTOLOGY TRANSFORMER
    // =========================================================================

    /**
     * Ontology Transformer - Resolves term IDs to human-readable names
     * 
     * This transformer uses caching for performance and returns placeholder
     * until async resolution completes.
     * 
     * @param {string|number|null} value - Ontology term ID
     * @param {Object} options - Transformer options
     * @param {"GO"|"KEGG"|"EC"|"custom"} options.ontologyType - Ontology type
     * @param {boolean} [options.showId=true] - Show ID alongside name
     * @param {string} [options.lookupEndpoint] - Custom API for resolution
     * @param {Object} rowData - Full row data object
     * @returns {string} HTML string with term name
     * 
     * @example
     * Transformers.ontology("GO:0008150", { ontologyType: "GO", showId: true }, {});
     * // Returns: "biological_process (GO:0008150)" or placeholder while loading
     */
    ontology(value, options, rowData) {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        const termId = String(value).trim();
        const cacheKey = `${options.ontologyType}:${termId}`;

        // Check cache
        const cached = Transformers._ontologyCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < Transformers._cacheTimeout)) {
            return Transformers._formatOntologyTerm(termId, cached.name, options);
        }

        // Return placeholder with data attribute for async loading
        const placeholder = Transformers._formatOntologyTerm(termId, null, options);

        // Trigger async lookup (will update DOM when complete)
        Transformers._lookupOntologyTerm(termId, options, cacheKey);

        return placeholder;
    },

    /**
     * Formats ontology term for display
     * @private
     */
    _formatOntologyTerm(termId, termName, options) {
        const showId = options.showId !== false;
        const escapedId = Transformers._escapeHtml(termId);

        if (termName) {
            const escapedName = Transformers._escapeHtml(termName);
            if (showId) {
                return `<span class="ts-ontology" data-term="${escapedId}">${escapedName} <span class="ts-ontology-id">(${escapedId})</span></span>`;
            }
            return `<span class="ts-ontology" data-term="${escapedId}">${escapedName}</span>`;
        }

        // Placeholder while loading
        return `<span class="ts-ontology ts-loading-term" data-term="${escapedId}">${escapedId}</span>`;
    },

    /**
     * Async ontology term lookup
     * @private
     */
    async _lookupOntologyTerm(termId, options, cacheKey) {
        try {
            let name = null;

            switch (options.ontologyType) {
                case 'GO':
                    name = await Transformers._lookupGO(termId);
                    break;
                case 'KEGG':
                    name = await Transformers._lookupKEGG(termId);
                    break;
                case 'EC':
                    name = await Transformers._lookupEC(termId);
                    break;
                case 'custom':
                    if (options.lookupEndpoint) {
                        name = await Transformers._lookupCustom(termId, options.lookupEndpoint);
                    }
                    break;
            }

            if (name) {
                Transformers._ontologyCache.set(cacheKey, {
                    name,
                    timestamp: Date.now()
                });

                // Update DOM elements with this term
                Transformers._updateOntologyElements(termId, name, options);
            }
        } catch (error) {
            console.warn(`Ontology lookup failed for ${termId}:`, error);
        }
    },

    /**
     * Updates DOM elements after async ontology lookup
     * @private
     */
    _updateOntologyElements(termId, name, options) {
        const elements = document.querySelectorAll(`.ts-ontology[data-term="${termId}"]`);
        elements.forEach(el => {
            el.classList.remove('ts-loading-term');
            const showId = options.showId !== false;
            if (showId) {
                el.innerHTML = `${Transformers._escapeHtml(name)} <span class="ts-ontology-id">(${Transformers._escapeHtml(termId)})</span>`;
            } else {
                el.textContent = name;
            }
        });
    },

    /**
     * GO term lookup via QuickGO API
     * @private
     */
    async _lookupGO(termId) {
        const response = await fetch(`https://www.ebi.ac.uk/QuickGO/services/ontology/go/terms/${termId}`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.results?.[0]?.name || null;
    },

    /**
     * KEGG lookup (simplified - returns ID for now)
     * @private
     */
    async _lookupKEGG(termId) {
        // KEGG API is complex; return ID as fallback
        // In production, implement proper KEGG REST API call
        return termId;
    },

    /**
     * EC number lookup via ExPASy
     * @private
     */
    async _lookupEC(termId) {
        // EC lookup would use ExPASy ENZYME database
        // Simplified for now
        return termId;
    },

    /**
     * Custom endpoint lookup
     * @private
     */
    async _lookupCustom(termId, endpoint) {
        const url = endpoint.replace('{value}', encodeURIComponent(termId));
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data.name || data.label || data.term || null;
    },

    // =========================================================================
    // BADGE TRANSFORMER
    // =========================================================================

    /**
     * Badge Transformer - Displays value as colored badge
     * 
     * @param {string|number|null} value - Cell value
     * @param {Object} options - Transformer options
     * @param {Object<string, string>} [options.colorMap] - Value-to-color map
     * @param {string} [options.defaultColor="#6366f1"] - Default badge color
     * @param {Object} rowData - Full row data object
     * @returns {string} HTML badge element
     */
    badge(value, options, rowData) {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        const stringValue = String(value);
        const colorMap = options.colorMap || {};
        const color = colorMap[stringValue] || options.defaultColor || '#6366f1';

        return `<span class="ts-badge" style="background: ${color}20; color: ${color}; border: 1px solid ${color}40;">${Transformers._escapeHtml(stringValue)}</span>`;
    },

    // =========================================================================
    // SEQUENCE TRANSFORMER
    // =========================================================================

    /**
     * Sequence Transformer - Formats DNA/Protein sequences
     * 
     * @param {string} value - Sequence string
     * @param {Object} options - Options
     * @param {boolean} [options.monospace=true] - Use monospace font
     * @param {number} [options.maxLength] - Truncate after N chars
     * @param {number} [options.chunkSize] - Add spaces every N chars (e.g. 10)
     * @returns {string} Formatted HTML
     */
    sequence(value, options) {
        if (!value) return '';
        let str = String(value);

        // Chunking
        if (options.chunkSize && options.chunkSize > 0) {
            const regex = new RegExp(`.{1,${options.chunkSize}}`, 'g');
            str = str.match(regex).join(' ');
        }

        // Truncation
        if (options.maxLength && str.length > options.maxLength) {
            const fullStr = Transformers._escapeHtml(str); // Escape before embedding
            str = str.substring(0, options.maxLength) + '...';
            // Return with title for tooltip
            return `<span title="${fullStr}" style="${options.monospace !== false ? 'font-family: var(--ts-font-mono);' : ''}">${Transformers._escapeHtml(str)}</span>`;
        }

        const style = options.monospace !== false ? 'font-family: var(--ts-font-mono);' : '';
        return `<span style="${style}">${Transformers._escapeHtml(str)}</span>`;
    },

    // =========================================================================
    // TRUNCATE TRANSFORMER
    // =========================================================================

    /**
     * Truncate Transformer - Shortens long text
     */
    truncate(value, options) {
        if (!value) return '';
        const str = String(value);
        const length = options.length || 20;

        if (str.length <= length) return Transformers._escapeHtml(str);

        const truncated = str.substring(0, length) + '...';
        return `<span title="${Transformers._escapeHtml(str)}">${Transformers._escapeHtml(truncated)}</span>`;
    },

    /**
     * Registered custom transformers
     * @type {Map<string, Function>}
     */
    _customTransformers: new Map(),

    /**
     * Register a custom transformer function
     * 
     * @param {string} name - Function name
     * @param {Function} fn - Transformer function (value, options, rowData) => string
     */
    register(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error(`Transformer "${name}" must be a function`);
        }
        Transformers._customTransformers.set(name, fn);
    },

    /**
     * Custom Transformer - Executes registered custom function
     * 
     * @param {string|number|null} value - Cell value
     * @param {Object} options - Transformer options
     * @param {string} options.functionName - Registered function name
     * @param {Object} [options.params] - Additional parameters
     * @param {Object} rowData - Full row data object
     * @returns {string} Transformed value
     */
    custom(value, options, rowData) {
        const fn = Transformers._customTransformers.get(options.functionName);
        if (!fn) {
            console.warn(`Custom transformer "${options.functionName}" not registered`);
            return value ? String(value) : '';
        }

        try {
            return fn(value, options.params || {}, rowData);
        } catch (error) {
            console.error(`Custom transformer "${options.functionName}" error:`, error);
            return value ? String(value) : '';
        }
    },

    // =========================================================================
    // UTILITY METHODS
    // =========================================================================

    /**
     * Escape HTML special characters
     * @private
     */
    _escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    },

    /**
     * Apply a transformation based on configuration
     * 
     * @param {string|number|null} value - Cell value
     * @param {Object} transformConfig - Transform configuration
     * @param {Object} rowData - Full row data object
     * @returns {string} Transformed HTML string
     */
    apply(value, transformConfig, rowData) {
        if (!transformConfig || !transformConfig.type) {
            return value !== null && value !== undefined ? Transformers._escapeHtml(String(value)) : '';
        }

        const transformer = Transformers[transformConfig.type];
        if (!transformer || typeof transformer !== 'function') {
            console.warn(`Unknown transformer type: "${transformConfig.type}"`);
            return value !== null && value !== undefined ? Transformers._escapeHtml(String(value)) : '';
        }

        return transformer(value, transformConfig.options || {}, rowData);
    },

    /**
     * Clear the ontology cache
     */
    clearCache() {
        Transformers._ontologyCache.clear();
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Transformers;
}
