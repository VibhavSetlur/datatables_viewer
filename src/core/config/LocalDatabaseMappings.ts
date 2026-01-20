/**
 * Local Database Mappings
 * 
 * Centralized configuration for local SQLite database paths and config mappings.
 * Extracted from LocalDbClient for maintainability and easier configuration updates.
 * 
 * @module LocalDatabaseMappings
 */

import { type ConfigDefinition, type DatabaseMapping } from '../../types/shared-types';

/**
 * Config definitions - primary mapping.
 * Each config can be used by multiple databases.
 */
export const CONFIG_DEFINITIONS: Record<string, ConfigDefinition> = {
    'berdl_tables': {
        configId: 'berdl_tables',
        configPath: '/config/berdl-tables.json',
        version: '1.0.0',
        description: 'BERDL tables configuration'
    },
    'genome_data_tables': {
        configId: 'genome_data_tables',
        configPath: '/config/genome-data-tables.json',
        version: '1.0.0',
        description: 'Genome data tables configuration'
    }
};

/**
 * Database mappings - maps file paths or UPAs to config IDs.
 * Multiple databases can map to the same config (same type).
 */
export const DATABASE_MAPPINGS: Record<string, DatabaseMapping> = {
    // File path mappings
    '/data/berdl_tables.db': {
        dbPath: '/data/berdl_tables.db',
        configId: 'berdl_tables'
    },
    '/data/berdl_tables_ecoli_562_61143.db': {
        dbPath: '/data/berdl_tables_ecoli_562_61143.db',
        configId: 'berdl_tables'
    },
    // UPA mappings (for backward compatibility and testing)
    'test/test/0': {
        dbPath: '/data/berdl_tables_ecoli_562_61143.db',
        configId: 'berdl_tables'
    },
    'test/test/1': {
        dbPath: '/data/berdl_tables.db',
        configId: 'berdl_tables'
    }
};

// Re-export types for consumers
export type { ConfigDefinition, DatabaseMapping };
