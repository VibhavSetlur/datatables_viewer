/**
 * Config Generator Service
 * 
 * Generates configurations for databases using AI or rule-based inference.
 * This is the core of TableScanner's config generation functionality.
 */

import { listTables, getTableData } from './sqlite-service.js';
import { createConfig, getConfigByObjectType, configExists } from './config-service.js';
import { createHash } from 'crypto';
import type { DataTypeConfig } from '../types.js';

interface GenerateConfigOptions {
    forceRegenerate?: boolean;
    aiProvider?: string;
    objectType?: string;
    sourceRef?: string;
}

interface GenerateConfigResult {
    status: 'generated' | 'cached' | 'fallback' | 'error';
    fingerprint: string;
    config: DataTypeConfig;
    config_id: string;
    object_type: string | null;
    fallback_used: boolean;
    fallback_reason: string | null;
    config_source: 'ai' | 'rules' | 'cache' | 'builtin' | 'error';
    tables_analyzed: number;
    columns_inferred: number;
    total_rows: number;
    ai_provider_used: string | null;
    ai_available: boolean;
    ai_error: string | null;
    generation_time_ms: number;
    cache_hit: boolean;
}

/**
 * Generate a fingerprint for a database
 */
export function generateFingerprint(dbPath: string, tables: any[]): string {
    const data = {
        path: dbPath,
        tables: tables.map(t => ({
            name: t.name,
            row_count: t.row_count,
            column_count: t.column_count
        }))
    };
    return createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
}

/**
 * Infer object type from database structure
 */
function inferObjectType(tables: any[]): string {
    const tableNames = tables.map(t => t.name.toLowerCase());
    
    // Common patterns
    if (tableNames.some(n => n.includes('gene'))) {
        return 'KBaseFBA.GenomeDataLakeTables-2.0';
    }
    if (tableNames.some(n => n.includes('berdl'))) {
        return 'KBaseGeneDataLakes.BERDLTables-1.0';
    }
    if (tableNames.some(n => n.includes('metabolic'))) {
        return 'KBaseFBA.FBAModel-1.0';
    }
    
    return 'LocalDatabase';
}

/**
 * Generate a basic config using rule-based inference
 */
function generateBasicConfig(
    dbPath: string,
    tables: any[],
    objectType: string,
    sourceRef?: string
): DataTypeConfig {
    const config: DataTypeConfig = {
        id: objectType.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: objectType,
        version: '1.0.0',
        description: `Auto-generated configuration for ${objectType}`,
        tables: {}
    };

    // Generate table configs
    for (const table of tables) {
        // Get sample data to infer column types
        let sampleData;
        try {
            sampleData = getTableData(dbPath, {
                table_name: table.name,
                limit: 10
            });
        } catch (error) {
            // If we can't get sample data, create basic columns from table info
            sampleData = {
                headers: [],
                data: [],
                total_count: 0
            };
        }

        const columns: any[] = [];
        for (let i = 0; i < sampleData.headers.length; i++) {
            const header = sampleData.headers[i];
            const sampleValues = sampleData.data.map(row => row[i]).filter(v => v != null);
            
            // Infer column type
            let columnType = 'string';
            if (sampleValues.length > 0) {
                const firstValue = sampleValues[0];
                if (typeof firstValue === 'number') {
                    columnType = Number.isInteger(firstValue) ? 'integer' : 'number';
                } else if (typeof firstValue === 'boolean') {
                    columnType = 'boolean';
                } else if (firstValue instanceof Date || (typeof firstValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(firstValue))) {
                    columnType = 'date';
                }
            }

            columns.push({
                column: header,
                displayName: header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                type: columnType,
                visible: true,
                sortable: true,
                filterable: true
            });
        }

        config.tables[table.name] = {
            displayName: table.displayName || table.name,
            description: table.description || `Table: ${table.name}`,
            columns: columns,
            defaultSort: columns.length > 0 ? { column: columns[0].column, order: 'asc' } : undefined
        };
    }

    return config;
}

/**
 * Generate config for a database
 */
export async function generateConfig(
    dbPath: string,
    options: GenerateConfigOptions = {}
): Promise<GenerateConfigResult> {
    const startTime = Date.now();
    
    try {
        // List tables
        const tablesResult = listTables(dbPath);
        const tables = tablesResult.tables;
        
        if (tables.length === 0) {
            throw new Error('No tables found in database');
        }

        // Generate fingerprint
        const fingerprint = generateFingerprint(dbPath, tables);
        
        // Infer object type
        const objectType = options.objectType || inferObjectType(tables);
        
        // Check if config already exists
        if (!options.forceRegenerate) {
            const existing = getConfigByObjectType(objectType);
            if (existing && existing.fingerprint === fingerprint) {
                return {
                    status: 'cached',
                    fingerprint,
                    config: JSON.parse(existing.config_json),
                    config_id: existing.id,
                    object_type: objectType,
                    fallback_used: false,
                    fallback_reason: null,
                    config_source: 'cache',
                    tables_analyzed: tables.length,
                    columns_inferred: tables.reduce((sum, t) => sum + t.column_count, 0),
                    total_rows: tables.reduce((sum, t) => sum + t.row_count, 0),
                    ai_provider_used: null,
                    ai_available: false,
                    ai_error: null,
                    generation_time_ms: Date.now() - startTime,
                    cache_hit: true
                };
            }
        }

        // Generate config using rule-based inference
        // (AI integration can be added here later)
        const config = generateBasicConfig(
            dbPath,
            tables,
            objectType,
            options.sourceRef
        );

        // Save config
        const record = createConfig({
            object_type: objectType,
            source_ref: options.sourceRef || null,
            config,
            source: 'rules', // or 'ai' when AI is integrated
            fingerprint,
            ai_provider: options.aiProvider || null,
            confidence: null, // AI confidence when AI is used
            generation_time_ms: Date.now() - startTime
        });

        return {
            status: 'generated',
            fingerprint,
            config,
            config_id: record.id,
            object_type: objectType,
            fallback_used: false,
            fallback_reason: null,
            config_source: 'rules',
            tables_analyzed: tables.length,
            columns_inferred: tables.reduce((sum, t) => sum + t.column_count, 0),
            total_rows: tables.reduce((sum, t) => sum + t.row_count, 0),
            ai_provider_used: null,
            ai_available: false, // Set to true when AI is integrated
            ai_error: null,
            generation_time_ms: Date.now() - startTime,
            cache_hit: false
        };
    } catch (error: any) {
        return {
            status: 'error',
            fingerprint: '',
            config: {} as DataTypeConfig,
            config_id: '',
            object_type: null,
            fallback_used: true,
            fallback_reason: error.message,
            config_source: 'error',
            tables_analyzed: 0,
            columns_inferred: 0,
            total_rows: 0,
            ai_provider_used: null,
            ai_available: false,
            ai_error: error.message,
            generation_time_ms: Date.now() - startTime,
            cache_hit: false
        };
    }
}
