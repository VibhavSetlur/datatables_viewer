#!/usr/bin/env node
/**
 * Save AI-Generated Config Script
 * 
 * Saves a config received from TableScanner to public/config/ and updates index.json
 * 
 * Usage:
 *   node scripts/save-config.js <config-file> [object-type]
 *   or
 *   echo '{"object_type":"...","config":{...}}' | node scripts/save-config.js
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Use createRequire to load from root node_modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ROOT_DIR = join(__dirname, '../..');
const CONFIG_DIR = join(ROOT_DIR, 'public', 'config');
const INDEX_FILE = join(CONFIG_DIR, 'index.json');
const SCHEMA_FILE = join(CONFIG_DIR, 'schemas', 'config.schema.json');

interface ConfigRequest {
    object_type: string;
    source_ref?: string;
    config: any;
    source?: string;
    fingerprint?: string;
    ai_provider?: string;
    confidence?: number;
}

/**
 * Load and compile JSON schema validator
 */
function loadValidator(): Ajv.ValidateFunction {
    const schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf-8'));
    const dataTypeConfigSchema = {
        ...schema.definitions.DataTypeConfig,
        $schema: schema.$schema,
        definitions: schema.definitions,
    };

    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);

    return ajv.compile(dataTypeConfigSchema);
}

/**
 * Validate config against schema
 */
function validateConfig(config: any, validator: Ajv.ValidateFunction): { valid: boolean; errors: string[] } {
    const valid = validator(config);

    if (valid) {
        return { valid: true, errors: [] };
    }

    const errors = (validator.errors || []).map(err => {
        const path = err.instancePath || '/';
        return `${path}: ${err.message}`;
    });

    return { valid: false, errors };
}

/**
 * Generate filename from object type
 */
function generateFilename(objectType: string): string {
    // Convert "KBaseGeneDataLakes.BERDLTables-1.0" to "berdl-tables.json"
    const parts = objectType.split('.');
    const name = parts[parts.length - 1].toLowerCase();
    const cleanName = name
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return `${cleanName}.json`;
}

/**
 * Update index.json with new config entry
 */
function updateIndexJson(configId: string, filename: string, objectType: string, matches?: string[]): void {
    const indexPath = INDEX_FILE;
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));

    // Generate matches if not provided
    const configMatches = matches || [
        objectType,
        objectType.replace(/-\d+\.\d+$/, '-*'), // Match version wildcard
    ];

    // Add or update dataType entry
    index.dataTypes[configId] = {
        configUrl: `/config/${filename}`,
        matches: configMatches,
        priority: 10,
        autoLoad: true,
    };

    // Write back
    writeFileSync(indexPath, JSON.stringify(index, null, 4) + '\n', 'utf-8');
}

/**
 * Main function
 */
function main() {
    try {
        // Read config from stdin or file
        let configData: ConfigRequest;

        if (process.argv[2]) {
            // Read from file
            const filePath = process.argv[2];
            if (!existsSync(filePath)) {
                console.error(`Error: File not found: ${filePath}`);
                process.exit(1);
            }
            configData = JSON.parse(readFileSync(filePath, 'utf-8'));
        } else {
            // Read from stdin
            let input = '';
            process.stdin.setEncoding('utf-8');
            process.stdin.on('data', (chunk) => {
                input += chunk;
            });
            process.stdin.on('end', () => {
                try {
                    configData = JSON.parse(input);
                    processConfig(configData);
                } catch (error: any) {
                    console.error(`Error parsing JSON: ${error.message}`);
                    process.exit(1);
                }
            });
            return; // Wait for stdin
        }

        processConfig(configData);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

function processConfig(configData: ConfigRequest) {
    // Validate input
    if (!configData.object_type) {
        console.error('Error: Missing required field: object_type');
        process.exit(1);
    }

    if (!configData.config) {
        console.error('Error: Missing required field: config');
        process.exit(1);
    }

    // Validate config against schema
    const validator = loadValidator();
    const validation = validateConfig(configData.config, validator);

    if (!validation.valid) {
        console.error('Validation failed:');
        validation.errors.forEach(err => {
            console.error(`  - ${err}`);
        });
        process.exit(1);
    }

    // Generate filename
    const filename = generateFilename(configData.object_type);
    const configId = configData.config.id || filename.replace('.json', '');
    const filePath = join(CONFIG_DIR, filename);

    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Write config file
    writeFileSync(filePath, JSON.stringify(configData.config, null, 2) + '\n', 'utf-8');
    console.log(`Config saved to: ${filePath}`);

    // Update index.json
    updateIndexJson(configId, filename, configData.object_type);
    console.log(`Updated index.json with entry: ${configId}`);

    console.log('Success: Config saved and index.json updated');
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith('save-config.ts') ||
    process.argv[1]?.endsWith('save-config.js');

if (isMainModule) {
    main();
}

export { processConfig as saveConfig, validateConfig };
