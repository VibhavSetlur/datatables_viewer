#!/usr/bin/env node
/**
 * Config Validation Script
 * 
 * Validates a config file against the JSON schema
 * 
 * Usage:
 *   node scripts/validate-config.js <config-file>
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Use createRequire to load from root node_modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(join(__dirname, '..'));
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ROOT_DIR = join(__dirname, '..');
const SCHEMA_FILE = join(ROOT_DIR, 'public', 'config', 'schemas', 'config.schema.json');

/**
 * Load and compile JSON schema validator
 */
function loadValidator(): Ajv.ValidateFunction {
    if (!existsSync(SCHEMA_FILE)) {
        throw new Error(`Schema file not found: ${SCHEMA_FILE}`);
    }
    
    const schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf-8'));
    const dataTypeConfigSchema = {
        ...schema.definitions.DataTypeConfig,
        $schema: schema.$schema,
    };
    
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    
    return ajv.compile(dataTypeConfigSchema);
}

/**
 * Validate config and return user-friendly errors
 */
function validateConfigFile(filePath: string): { valid: boolean; errors: string[] } {
    if (!existsSync(filePath)) {
        return {
            valid: false,
            errors: [`File not found: ${filePath}`],
        };
    }
    
    let config: any;
    try {
        config = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (error: any) {
        return {
            valid: false,
            errors: [`Invalid JSON: ${error.message}`],
        };
    }
    
    const validator = loadValidator();
    const valid = validator(config);
    
    if (valid) {
        return { valid: true, errors: [] };
    }
    
    // Format errors in a user-friendly way
    const errors = (validator.errors || []).map(err => {
        const path = err.instancePath || '/';
        const message = err.message || 'Validation error';
        const params = err.params ? ` (${JSON.stringify(err.params)})` : '';
        return `At ${path}: ${message}${params}`;
    });
    
    return { valid: false, errors };
}

/**
 * Main function
 */
function main() {
    const filePath = process.argv[2];
    
    if (!filePath) {
        console.error('Usage: node scripts/validate-config.js <config-file>');
        process.exit(1);
    }
    
    const result = validateConfigFile(filePath);
    
    if (result.valid) {
        console.log('Validation passed: Config is valid');
        process.exit(0);
    } else {
        console.error('Validation failed:');
        result.errors.forEach(err => {
            console.error(`  ${err}`);
        });
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { validateConfigFile };
