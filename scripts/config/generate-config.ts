/**
 * Config Generator Script
 * 
 * Generates a starter configuration file from a database path.
 * Creates versioning folder structure and provides clear instructions.
 * 
 * Usage: npm run generate-config <db-path> [config-name]
 * Example: npm run generate-config /data/mydb.db my-database-config
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_DIR = join(__dirname, '../../public/config');

interface ColumnInfo {
    name: string;
    type: string;
    notnull: boolean;
    pk: boolean;
    dflt_value: any;
}

interface TableInfo {
    name: string;
    row_count: number;
    columns: ColumnInfo[];
}

/**
 * Generate unique config name
 */
function generateConfigName(dbPath: string, providedName?: string): string {
    if (providedName) {
        return providedName;
    }

    const baseName = basename(dbPath, extname(dbPath));
    // Make it URL-safe and unique
    const sanitized = baseName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return sanitized || 'database-config';
}

/**
 * Get column data type for config
 */
function getConfigDataType(sqliteType: string): string {
    const upper = sqliteType.toUpperCase();

    if (upper.includes('INT')) return 'integer';
    if (upper.includes('REAL') || upper.includes('FLOAT') || upper.includes('DOUBLE')) return 'float';
    if (upper.includes('TEXT') || upper.includes('VARCHAR') || upper.includes('CHAR')) return 'string';
    if (upper.includes('BLOB')) return 'string';
    if (upper.includes('NUMERIC')) return 'number';

    return 'string';
}

/**
 * Generate config from database
 */
async function generateConfig(dbPath: string, configName: string): Promise<void> {
    if (!existsSync(dbPath)) {
        throw new Error(`Database file not found: ${dbPath}`);
    }

    console.log(`\n📊 Analyzing database: ${dbPath}`);
    console.log(`📝 Generating config: ${configName}\n`);

    const db = new Database(dbPath, { readonly: true });

    try {
        // Get all tables
        const tables = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `).all() as Array<{ name: string }>;

        if (tables.length === 0) {
            throw new Error('No tables found in database');
        }

        const tableInfos: TableInfo[] = [];

        for (const table of tables) {
            const tableName = table.name;

            // Get row count
            const rowCountResult = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as any;
            const rowCount = rowCountResult?.count || 0;

            // Get columns
            const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
            const columnInfos: ColumnInfo[] = columns.map(col => ({
                name: col.name,
                type: col.type || 'TEXT',
                notnull: col.notnull === 1,
                pk: col.pk === 1,
                dflt_value: col.dflt_value
            }));

            tableInfos.push({
                name: tableName,
                row_count: rowCount,
                columns: columnInfos
            });
        }

        // Generate config structure
        const config = {
            $schema: './schemas/config.schema.json',
            name: configName,
            version: '1.0.0',
            description: `Configuration for ${basename(dbPath)}`,
            created: new Date().toISOString(),
            dataType: {
                id: configName,
                name: configName,
                description: `Auto-generated config for ${basename(dbPath)}`,
                tables: {} as Record<string, any>
            }
        };

        // Generate table configs
        for (const tableInfo of tableInfos) {
            const columns = tableInfo.columns.map(col => {
                const isNumeric = col.type.toUpperCase().includes('INT') ||
                    col.type.toUpperCase().includes('REAL') ||
                    col.type.toUpperCase().includes('NUMERIC');

                return {
                    column: col.name,
                    displayName: col.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    description: `${col.type} column${col.pk ? ' (Primary Key)' : ''}${col.notnull ? ' (Required)' : ''}`,
                    dataType: getConfigDataType(col.type),
                    visible: true,
                    sortable: true,
                    filterable: true,
                    searchable: true,
                    width: isNumeric ? '120px' : 'auto',
                    align: isNumeric ? 'right' : 'left'
                };
            });

            config.dataType.tables[tableInfo.name] = {
                name: tableInfo.name,
                displayName: tableInfo.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                description: `Table with ${tableInfo.row_count.toLocaleString()} rows`,
                row_count: tableInfo.row_count,
                columns: columns,
                categories: []
            };
        }

        // Create versioning folder structure
        const versionDir = join(CONFIG_DIR, configName, 'v1.0.0');
        await mkdir(versionDir, { recursive: true });

        // Write config file
        const configPath = join(versionDir, `${configName}.json`);
        await writeFile(configPath, JSON.stringify(config, null, 2));

        // Create README with instructions
        const readmePath = join(CONFIG_DIR, configName, 'README.md');
        const readme = `# Configuration: ${configName}

## Overview

This configuration was auto-generated from: \`${dbPath}\`

**Generated:** ${new Date().toISOString()}

## Files

- **Current Version:** \`v1.0.0/${configName}.json\`
- **Schema:** \`schemas/config.schema.json\`

## Versioning

This config uses semantic versioning. To create a new version:

1. Copy the current version folder: \`cp -r v1.0.0 v1.1.0\`
2. Modify the config in the new version folder
3. Update \`version\` field in the config JSON
4. Update this README

## Configuration Structure

### Tables

${tableInfos.map(t => `- **${t.name}**: ${t.row_count.toLocaleString()} rows, ${t.columns.length} columns`).join('\n')}

### Column Types

Columns are automatically configured with appropriate types:
- **Numeric columns** (INTEGER, REAL): Right-aligned, numeric filters
- **Text columns** (TEXT, VARCHAR): Left-aligned, text search filters
- **Primary keys**: Marked and typically used as identifiers

## Customization

Edit \`v1.0.0/${configName}.json\` to customize:
- Column display names
- Visibility settings
- Filter options
- Column widths and alignment
- Categories and grouping

## Usage

Reference this config in your application:

\`\`\`json
{
  "dataType": "${configName}",
  "configPath": "/config/${configName}/v1.0.0/${configName}.json"
}
\`\`\`

## Next Steps

1. Review and customize the generated config
2. Test with your database
3. Create new versions as needed
4. Add to \`public/config/index.json\` if using centralized config management
`;

        await writeFile(readmePath, readme);

        console.log('✅ Configuration generated successfully!\n');
        console.log('📁 Files created:');
        console.log(`   - ${configPath}`);
        console.log(`   - ${readmePath}\n`);
        console.log('📋 Next steps:');
        console.log(`   1. Review: ${configPath}`);
        console.log(`   2. Customize column settings as needed`);
        console.log(`   3. Add to CONFIG_DEFINITIONS in src/core/api/LocalDbClient.ts:`);
        console.log(`      '${configName}': {`);
        console.log(`          configId: '${configName}',`);
        console.log(`          configPath: '/config/${configName}/v1.0.0/${configName}.json',`);
        console.log(`          version: '1.0.0',`);
        console.log(`          description: '${basename(dbPath)} configuration'`);
        console.log(`      }`);
        console.log(`   4. Add database mapping to DATABASE_MAPPINGS:`);
        console.log(`      '/data/${basename(dbPath)}': {`);
        console.log(`          dbPath: '/data/${basename(dbPath)}',`);
        console.log(`          configId: '${configName}'`);
        console.log(`      }`);
        console.log(`   5. Test with your database`);
        console.log(`   6. Add to index.json if using pattern-based matching\n`);
        console.log('💡 Tip: Use semantic versioning (v1.0.0, v1.1.0, etc.) for config updates\n');

    } finally {
        db.close();
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: npm run generate-config <db-path> [config-name]');
        console.error('Example: npm run generate-config /data/mydb.db my-database-config');
        process.exit(1);
    }

    const dbPath = args[0];
    const configName = generateConfigName(dbPath, args[1]);

    try {
        await generateConfig(dbPath, configName);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { generateConfig };
