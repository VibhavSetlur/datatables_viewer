# Database to Config Mapping Guide

This guide explains the complete database-to-config mapping system in DataTables Viewer, including both client-side and server-side mappings.

## Overview

The DataTables Viewer uses a **config-centric mapping system** where:
- **Configs are primary** - Each config defines a data type with version, path, and metadata
- **Databases reference configs** - Multiple databases can share the same config (same type)
- **Flexible mapping** - Databases can be mapped by **file path** (recommended) or UPA (Unique Persistent Address)
- **Version management** - Configs can be versioned and databases can reference specific versions

## Mapping System Architecture

### Config-Centric Design

The system is organized around **config definitions** rather than individual database mappings:

```
Config Definition (Primary)
    ↓
Database Mappings (Reference Config)
    ↓
Multiple Databases → Same Config
```

### Two-Level Mapping

1. **CONFIG_DEFINITIONS** - Configs with metadata (version, path, description)
2. **DATABASE_MAPPINGS** - Databases mapped to config IDs (file paths or UPAs)

## Mapping System 1: CONFIG_DEFINITIONS

### Location

`src/core/api/LocalDbClient.ts`

### Purpose

Defines configs that can be shared by multiple databases of the same type.

### Structure

```typescript
interface ConfigDefinition {
    configId: string;        // Unique config identifier (e.g., "berdl_tables")
    configPath: string;       // Path to .json config file
    version?: string;         // Config version (e.g., "1.0.0")
    description?: string;     // Human-readable description
}

const CONFIG_DEFINITIONS: Record<string, ConfigDefinition> = {
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
```

### When to Use

- **Multiple databases share same type** - All BERDL databases use same config
- **Version management** - Track config versions
- **Centralized config** - Single source of truth for each data type

## Mapping System 2: DATABASE_MAPPINGS

### Location

`src/core/api/LocalDbClient.ts`

### Purpose

Maps individual databases (by file path or UPA) to config IDs.

### Structure

```typescript
interface DatabaseMapping {
    dbPath: string;          // Path to .db file
    configId: string;        // Reference to config definition
    configPath?: string;     // Optional: override config path for this database
}

const DATABASE_MAPPINGS: Record<string, DatabaseMapping> = {
    // File path mappings
    '/data/berdl_tables.db': {
        dbPath: '/data/berdl_tables.db',
        configId: 'berdl_tables'
    },
    '/data/berdl_tables_ecoli_562_61143.db': {
        dbPath: '/data/berdl_tables_ecoli_562_61143.db',
        configId: 'berdl_tables'  // Same config as above
    },
    // UPA mappings (for backward compatibility)
    'test/test/0': {
        dbPath: '/data/berdl_tables_ecoli_562_61143.db',
        configId: 'berdl_tables'
    },
    'test/test/1': {
        dbPath: '/data/berdl_tables.db',
        configId: 'berdl_tables'  // Same config
    }
};
```

### Key Features

- **Multiple databases → Same config** - Both databases use `berdl_tables` config
- **File path or UPA** - Can map by either identifier
- **Config override** - Optional per-database config path override

### When to Use

- **Specific database mappings** - Map individual databases to configs
- **Client-side access** - No server required
- **Development** - Quick local testing
- **Offline mode** - Works without network

## Complete Example

### Scenario: Multiple Genome Databases

**Step 1: Define Config**

```typescript
const CONFIG_DEFINITIONS: Record<string, ConfigDefinition> = {
    'genome_data': {
        configId: 'genome_data',
        configPath: '/config/genome-data/v1.0.0/genome-data.json',
        version: '1.0.0',
        description: 'Genome data tables configuration'
    }
};
```

**Step 2: Map Multiple Databases**

```typescript
const DATABASE_MAPPINGS: Record<string, DatabaseMapping> = {
    // All these databases use the same config
    '/data/genomes_ecoli.db': {
        dbPath: '/data/genomes_ecoli.db',
        configId: 'genome_data'
    },
    '/data/genomes_salmonella.db': {
        dbPath: '/data/genomes_salmonella.db',
        configId: 'genome_data'
    },
    '/data/genomes_custom.db': {
        dbPath: '/data/genomes_custom.db',
        configId: 'genome_data'
    },
    // UPA mappings
    'research/genomes/1': {
        dbPath: '/data/genomes_ecoli.db',
        configId: 'genome_data'
    },
    'research/genomes/2': {
        dbPath: '/data/genomes_salmonella.db',
        configId: 'genome_data'
    }
};
```

**Result:** All genome databases share the same config, making it easy to:
- Update config once for all databases
- Maintain consistency
- Version configs together

## Adding a New Config

### Step 1: Define Config

Edit `src/core/api/LocalDbClient.ts`:

```typescript
const CONFIG_DEFINITIONS: Record<string, ConfigDefinition> = {
    // ... existing configs ...
    'my_data_type': {
        configId: 'my_data_type',
        configPath: '/config/my-data-type/v1.0.0/my-data-type.json',
        version: '1.0.0',
        description: 'My data type configuration'
    }
};
```

### Step 2: Generate Config File

```bash
npm run generate-config /path/to/database.db my-data-type
```

This creates:
- `public/config/my-data-type/v1.0.0/my-data-type.json`
- `public/config/my-data-type/README.md`

### Step 3: Map Databases

```typescript
const DATABASE_MAPPINGS: Record<string, DatabaseMapping> = {
    // ... existing mappings ...
    '/data/my-database-1.db': {
        dbPath: '/data/my-database-1.db',
        configId: 'my_data_type'
    },
    '/data/my-database-2.db': {
        dbPath: '/data/my-database-2.db',
        configId: 'my_data_type'  // Same config
    },
    'my/workspace/1': {
        dbPath: '/data/my-database-1.db',
        configId: 'my_data_type'
    }
};
```

## Config Override

### Per-Database Config Override

If a specific database needs a different config:

```typescript
const DATABASE_MAPPINGS: Record<string, DatabaseMapping> = {
    '/data/special-database.db': {
        dbPath: '/data/special-database.db',
        configId: 'my_data_type',
        configPath: '/config/my-data-type/v1.1.0/my-data-type.json'  // Override
    }
};
```

This database uses the override config path instead of the default from CONFIG_DEFINITIONS.

## Mapping System 3: index.json (Pattern-Based)

### Location

`public/config/index.json`

### Purpose

Maps data types to configs using pattern matching for flexible identifier matching.

### Structure

```json
{
  "dataTypes": {
    "my_data_type": {
      "configUrl": "/config/my-data-type/v1.0.0/my-data-type.json",
      "matches": [
        "my-pattern",
        "my-*",
        "*pattern*"
      ],
      "priority": 10,
      "autoLoad": true
    }
  }
}
```

### When to Use

- **Pattern matching** - Flexible identifier matching
- **Production** - Centralized config management
- **Remote databases** - API-based access
- **Version control** - Configs tracked in git

## Config Resolution Order

The system resolves configs in this order:

1. **DATABASE_MAPPINGS** - Direct file path or UPA mapping (client-side)
2. **Database-specific config** - `{db-name}.json` in config directory
3. **index.json patterns** - Pattern matching (by priority)
4. **Default config** - Minimal fallback

### Resolution Flow

```
Database/Identifier
    ↓
Check DATABASE_MAPPINGS (file path or UPA)
    ↓ (if found)
Get configId → CONFIG_DEFINITIONS → configPath
    ↓ (if not found)
Check database-specific config (e.g., genomes.json)
    ↓ (if not found)
Check index.json patterns (by priority)
    ↓ (if not found)
Use default config
```

## API Methods

### Get Config Definition

```typescript
LocalDbClient.getConfigDefinition('berdl_tables')
// Returns: { configId, configPath, version, description }
```

### Get Database Mapping

```typescript
LocalDbClient.getDatabaseMapping('/data/berdl_tables.db')
// Returns: { dbPath, configId, configPath? }
```

### Get Config Path

```typescript
LocalDbClient.getConfigPath('/data/berdl_tables.db')
// Returns: '/config/berdl-tables.json'
// Or override if specified in mapping
```

### Get Database Path

```typescript
LocalDbClient.getDatabasePath('test/test/1')
// Returns: '/data/berdl_tables.db'
```

## Best Practices

### 1. Use Config Definitions for Shared Types

```typescript
// Good: Multiple databases share config
const CONFIG_DEFINITIONS = {
    'genome_data': { ... }
};

const DATABASE_MAPPINGS = {
    '/data/genomes1.db': { configId: 'genome_data' },
    '/data/genomes2.db': { configId: 'genome_data' },
    '/data/genomes3.db': { configId: 'genome_data' }
};
```

### 2. Version Your Configs

```typescript
const CONFIG_DEFINITIONS = {
    'my_type': {
        configId: 'my_type',
        configPath: '/config/my-type/v1.0.0/my-type.json',
        version: '1.0.0'  // Track version
    }
};
```

### 3. Use File Paths for Direct Access

```typescript
// File path mapping (recommended)
'/data/my-database.db': {
    dbPath: '/data/my-database.db',
    configId: 'my_type'
}
```

### 4. Use UPAs for Legacy Support

```typescript
// UPA mapping (backward compatibility)
'workspace/object/1': {
    dbPath: '/data/my-database.db',
    configId: 'my_type'
}
```

### 5. Document Configs

```typescript
const CONFIG_DEFINITIONS = {
    'my_type': {
        configId: 'my_type',
        configPath: '/config/my-type/v1.0.0/my-type.json',
        version: '1.0.0',
        description: 'Clear description of what this config is for'  // Document
    }
};
```

## Migration from Old System

### Old System (UPA → Config)

```typescript
// OLD
const LOCAL_DB_MAP = {
    'test/test/1': {
        upa: 'test/test/1',
        dbPath: '/data/db.db',
        configPath: '/config/config.json'
    }
};
```

### New System (Config → Databases)

```typescript
// NEW
const CONFIG_DEFINITIONS = {
    'my_config': {
        configId: 'my_config',
        configPath: '/config/config.json',
        version: '1.0.0'
    }
};

const DATABASE_MAPPINGS = {
    '/data/db.db': {
        dbPath: '/data/db.db',
        configId: 'my_config'
    },
    'test/test/1': {
        dbPath: '/data/db.db',
        configId: 'my_config'
    }
};
```

## Troubleshooting

### Config Not Found

**Problem:** `getConfigPath()` returns null

**Solutions:**
- Check CONFIG_DEFINITIONS has the configId
- Verify DATABASE_MAPPINGS entry exists
- Check configPath in CONFIG_DEFINITIONS is correct
- Verify config file exists at path

### Database Not Mapped

**Problem:** `getDatabasePath()` returns null

**Solutions:**
- Check DATABASE_MAPPINGS has entry for file path or UPA
- Verify dbPath in mapping is correct
- Check file path format (should start with `/data/`)

### Wrong Config Used

**Problem:** Database using wrong config

**Solutions:**
- Check configId in DATABASE_MAPPINGS
- Verify CONFIG_DEFINITIONS has correct config
- Check for configPath override in mapping
- Review resolution order

## Examples

### Example 1: Single Database, Single Config

```typescript
const CONFIG_DEFINITIONS = {
    'simple_db': {
        configId: 'simple_db',
        configPath: '/config/simple-db.json',
        version: '1.0.0'
    }
};

const DATABASE_MAPPINGS = {
    '/data/simple.db': {
        dbPath: '/data/simple.db',
        configId: 'simple_db'
    }
};
```

### Example 2: Multiple Databases, Same Config

```typescript
const CONFIG_DEFINITIONS = {
    'genome_data': {
        configId: 'genome_data',
        configPath: '/config/genome-data.json',
        version: '1.0.0'
    }
};

const DATABASE_MAPPINGS = {
    '/data/genomes1.db': { dbPath: '/data/genomes1.db', configId: 'genome_data' },
    '/data/genomes2.db': { dbPath: '/data/genomes2.db', configId: 'genome_data' },
    '/data/genomes3.db': { dbPath: '/data/genomes3.db', configId: 'genome_data' }
};
```

### Example 3: Config with Override

```typescript
const CONFIG_DEFINITIONS = {
    'my_type': {
        configId: 'my_type',
        configPath: '/config/my-type/v1.0.0/my-type.json',
        version: '1.0.0'
    }
};

const DATABASE_MAPPINGS = {
    '/data/normal.db': {
        dbPath: '/data/normal.db',
        configId: 'my_type'  // Uses v1.0.0
    },
    '/data/special.db': {
        dbPath: '/data/special.db',
        configId: 'my_type',
        configPath: '/config/my-type/v1.1.0/my-type.json'  // Override to v1.1.0
    }
};
```

## Quick Reference

| Task | Method | Example |
|------|--------|---------|
| Get config definition | `getConfigDefinition(configId)` | `getConfigDefinition('berdl_tables')` |
| Get database mapping | `getDatabaseMapping(path)` | `getDatabaseMapping('/data/db.db')` |
| Get config path | `getConfigPath(path)` | `getConfigPath('/data/db.db')` |
| Get database path | `getDatabasePath(upa)` | `getDatabasePath('test/test/1')` |
| Check if local | `isLocalDb(upa)` | `isLocalDb('test/test/1')` |
| Get all configs | `getAllConfigDefinitions()` | `getAllConfigDefinitions()` |
| Get all mappings | `getAllDatabaseMappings()` | `getAllDatabaseMappings()` |
| Get databases for config | `getDatabasesForConfig(configId)` | `getDatabasesForConfig('berdl_tables')` |

## Summary

The new config-centric mapping system provides:

✅ **Multiple databases → Same config** - Share configs across databases of the same type  
✅ **File path mapping** - Direct file path to config mapping (recommended)  
✅ **UPA support** - Backward compatible with UPA mappings  
✅ **Version management** - Track config versions  
✅ **Config overrides** - Per-database config path overrides  
✅ **Easy maintenance** - Update config once, applies to all databases  

This design makes it much easier to manage multiple databases of the same type while maintaining flexibility for special cases.
