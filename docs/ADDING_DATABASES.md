# Adding New Databases

This guide explains how to add new databases to the DataTables Viewer, including local databases, remote databases, and mapping them to configurations.

## Overview

Databases can be added in two ways:
1. **Local databases** - SQLite files served from the file system
2. **Remote databases** - Accessed via API (TableScanner, KBase, etc.)

## Adding Local Databases

### Method 1: Using URL Parameter (Recommended)

The simplest way to add a local database:

1. **Place database file:**
   ```bash
   cp /path/to/your/database.db public/data/your-database.db
   ```

2. **Generate config:**
   ```bash
   npm run generate-config public/data/your-database.db your-database-config
   ```

3. **Access via URL:**
   ```
   http://localhost:5173?db=your-database
   ```

The viewer will:
- Load `/data/your-database.db`
- Look for `/config/your-database.json` or use generated config
- Display the data

### Method 2: Add to Config and Database Mappings

For client-side access without a server:

1. **Define config (if not exists) in `src/core/config/LocalDatabaseMappings.ts`:**
   ```typescript
   const CONFIG_DEFINITIONS: Record<string, ConfigDefinition> = {
       // ... existing configs ...
       'your_config': {
           configId: 'your_config',
           configPath: '/config/your-config/v1.0.0/your-config.json',
           version: '1.0.0',
           description: 'Your database configuration'
       }
   };
   ```

2. **Map database to config:**
   ```typescript
   const DATABASE_MAPPINGS: Record<string, DatabaseMapping> = {
       // File path mapping (recommended)
       '/data/your-database.db': {
           dbPath: '/data/your-database.db',
           configId: 'your_config'
       },
       // UPA mapping (optional, for backward compatibility)
       'your/workspace/1': {
           dbPath: '/data/your-database.db',
           configId: 'your_config'
       }
   };
   ```

3. **Use in viewer:**
   - File path: `/data/your-database.db` maps to `your_config`
   - UPA: `your/workspace/1` maps to same database and config
   - Multiple databases can share the same config

### Method 3: TableScanner Service (Remote API)

For server-side querying with caching and optimizations:

1. **Deploy TableScanner service:**
   ```bash
   # See TableScanner repository for deployment
   # https://github.com/kbase/tablescanner/tree/ai-integration
   ```

2. **Configure frontend:**
   ```bash
   # Build with TableScanner URL
   VITE_API_URL=https://appdev.kbase.us/services/berdl_table_scanner npm run build
   ```

3. **Access via API:**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
        https://appdev.kbase.us/services/berdl_table_scanner/object/your-database/tables
   ```

## Database to Config Mapping

### Understanding the Mapping System

There are two mapping systems:

1. **DATABASE_MAPPINGS** - Maps file paths and/or UPAs to config IDs (client-side)
2. **index.json** - Maps data types to configs (both client and server)

### Mapping in CONFIG_DEFINITIONS and DATABASE_MAPPINGS

**Location:** `src/core/config/LocalDatabaseMappings.ts`

**Structure:**
```typescript
// Config definitions (primary)
interface ConfigDefinition {
    configId: string;        // Unique config ID (e.g., "berdl_tables")
    configPath: string;       // Path to .json config
    version?: string;         // Config version
    description?: string;     // Description
}

const CONFIG_DEFINITIONS: Record<string, ConfigDefinition> = {
    'your_config': {
        configId: 'your_config',
        configPath: '/config/your-config/v1.0.0/your-config.json',
        version: '1.0.0',
        description: 'Your database configuration'
    }
};

// Database mappings (reference configs)
interface DatabaseMapping {
    dbPath: string;          // Path to .db file
    configId: string;        // Reference to config definition
    configPath?: string;     // Optional override
}

const DATABASE_MAPPINGS: Record<string, DatabaseMapping> = {
    // File path mapping
    '/data/your-database.db': {
        dbPath: '/data/your-database.db',
        configId: 'your_config'
    },
    // UPA mapping (optional)
    'your/upa/here': {
        dbPath: '/data/your-database.db',
        configId: 'your_config'
    }
};
```

**When to use:**
- Client-side database access
- Multiple databases sharing same config
- Testing without server
- File path or UPA mappings

### Mapping in index.json

**Location:** `public/config/index.json`

**Structure:**
```json
{
  "dataTypes": {
    "your_data_type": {
      "configUrl": "/config/your-config.json",
      "matches": [
        "your-pattern-1",
        "your-pattern-2",
        "pattern-*"
      ],
      "priority": 10,
      "autoLoad": true
    }
  }
}
```

**Fields:**
- `configUrl` - Path to config file
- `matches` - Patterns that match this config (supports wildcards)
- `priority` - Higher priority = checked first
- `autoLoad` - Load automatically on startup

**When to use:**
- Type-based config matching
- Multiple databases sharing same config
- Pattern-based matching (e.g., `KBaseFBA.*`)

### Config Resolution Order

The system resolves configs in this order:

1. **Database-specific config** - `{db-name}.json` in config directory
2. **Pattern matching** - Matches from `index.json`
3. **Default config** - Minimal fallback

## Step-by-Step: Adding a New Database

### Step 1: Prepare Database File

```bash
# Copy database to data directory
cp /path/to/source.db public/data/my-new-database.db

# Verify it's accessible
ls -lh public/data/my-new-database.db
```

### Step 2: Generate Config

```bash
# Generate starter config
npm run generate-config public/data/my-new-database.db my-new-database-config

# This creates:
# - public/config/my-new-database-config/v1.0.0/my-new-database-config.json
# - public/config/my-new-database-config/README.md
```

### Step 3: Review Generated Config

```bash
# Open and review
cat public/config/my-new-database-config/v1.0.0/my-new-database-config.json
```

**Customize as needed:**
- Column display names
- Visibility settings
- Filter options
- Column widths

### Step 4: Add Config Definition and Database Mapping

Edit `src/core/config/LocalDatabaseMappings.ts`:

```typescript
// Add to CONFIG_DEFINITIONS
const CONFIG_DEFINITIONS: Record<string, ConfigDefinition> = {
    // ... existing configs ...
    'my_new_database_config': {
        configId: 'my_new_database_config',
        configPath: '/config/my-new-database-config/v1.0.0/my-new-database-config.json',
        version: '1.0.0',
        description: 'My new database configuration'
    }
};

// Add to DATABASE_MAPPINGS
const DATABASE_MAPPINGS: Record<string, DatabaseMapping> = {
    // ... existing mappings ...
    // File path mapping (recommended)
    '/data/my-new-database.db': {
        dbPath: '/data/my-new-database.db',
        configId: 'my_new_database_config'
    },
    // Optional: UPA mapping
    'my/workspace/1': {
        dbPath: '/data/my-new-database.db',
        configId: 'my_new_database_config'
    }
};
```

### Step 5: Add to index.json (Optional)

If you want pattern-based matching:

```json
{
  "dataTypes": {
    "my_new_database": {
      "configUrl": "/config/my-new-database-config/v1.0.0/my-new-database-config.json",
      "matches": [
        "my-new-database",
        "my-db-*"
      ],
      "priority": 10,
      "autoLoad": true
    }
  }
}
```

### Step 6: Test

```bash
# Start dev server
npm run dev

# Open in browser
# http://localhost:5173?db=my-new-database
# Or use file path: /data/my-new-database.db
# Or use UPA: my/workspace/1
```

## Adding Remote Databases

### Via API Configuration

1. **Add API to index.json:**
   ```json
   {
     "apis": {
       "my_remote_api": {
         "id": "my_remote_api",
         "name": "My Remote API",
         "url": "https://api.example.com",
         "type": "rest"
       }
     }
   }
   ```

2. **Add data type mapping:**
   ```json
   {
     "dataTypes": {
       "remote_data": {
         "configUrl": "/config/remote-config.json",
         "matches": [
           "remote/workspace/*"
         ],
         "priority": 5,
         "autoLoad": true
       }
     }
   }
   ```

3. **Use in viewer:**
   - Select API: "My Remote API"
   - Enter workspace/object ID
   - Config will be matched and applied

## Database Naming Conventions

### File Names

- Use lowercase with hyphens: `my-database.db`
- Avoid spaces and special characters
- Keep names descriptive but concise

### Config Names

- Match database name when possible: `my-database-config`
- Use semantic versioning: `v1.0.0`, `v1.1.0`
- Keep names unique across all configs

### UPA Patterns

- Format: `workspace/object/version` (e.g., `test/test/1`)
- Use consistent patterns for related databases
- Document patterns in README

## Versioning Configs

### Create New Version

```bash
# Copy existing version
cp -r public/config/my-config/v1.0.0 public/config/my-config/v1.1.0

# Edit new version
vim public/config/my-config/v1.1.0/my-config.json

# Update version in config file
# "version": "1.1.0"

# Update index.json to point to new version
# "configUrl": "/config/my-config/v1.1.0/my-config.json"
```

### Version Structure

```
public/config/
└── my-config/
    ├── v1.0.0/
    │   └── my-config.json
    ├── v1.1.0/
    │   └── my-config.json
    └── README.md
```

## Troubleshooting

### Database Not Found

**Problem:** `404 Database not found`

**Solutions:**
- Check file exists in `public/data/` or `DATA_DIR`
- Verify filename matches (case-sensitive)
- Check file permissions: `chmod 644 database.db`

### Config Not Loading

**Problem:** Config not applied

**Solutions:**
- Verify config file exists at specified path
- Check `index.json` mapping is correct
- Verify `configUrl` matches actual file location
- Check browser console for errors

### Mapping Not Working

**Problem:** Database not matching config

**Solutions:**
- Check CONFIG_DEFINITIONS has the configId
- Verify DATABASE_MAPPINGS entry exists for file path or UPA
- Check configId in DATABASE_MAPPINGS matches CONFIG_DEFINITIONS
- Verify pattern matching in `index.json` if using pattern-based
- Check priority order (higher = checked first)
- Verify UPA format matches pattern

### Multiple Configs for Same Database

**Problem:** Wrong config being used

**Solutions:**
- Check priority in `index.json` (higher priority wins)
- Verify pattern matching order
- Use more specific patterns
- Check `autoLoad` settings

## Best Practices

1. **Use generate-config script** - Ensures proper structure
2. **Version your configs** - Use semantic versioning
3. **Document mappings** - Add comments in code/configs
4. **Test thoroughly** - Verify database and config work together
5. **Keep names unique** - Avoid conflicts
6. **Use patterns wisely** - Specific patterns first, wildcards last
7. **Set appropriate priorities** - More specific = higher priority

## Examples

### Example 1: Simple Local Database

```bash
# 1. Add database
cp genomes.db public/data/genomes.db

# 2. Generate config
npm run generate-config public/data/genomes.db genomes-config

# 3. Access
# http://localhost:5173?db=genomes
```

### Example 2: Client-Side Mapping

```typescript
// In LocalDatabaseMappings.ts

// Step 1: Define config
const CONFIG_DEFINITIONS: Record<string, ConfigDefinition> = {
    'genomes_config': {
        configId: 'genomes_config',
        configPath: '/config/genomes-config/v1.0.0/genomes-config.json',
        version: '1.0.0',
        description: 'Genomes database configuration'
    }
};

// Step 2: Map databases to config
const DATABASE_MAPPINGS: Record<string, DatabaseMapping> = {
    // File path mapping
    '/data/genomes.db': {
        dbPath: '/data/genomes.db',
        configId: 'genomes_config'
    },
    // UPA mapping
    'research/genomes/1': {
        dbPath: '/data/genomes.db',
        configId: 'genomes_config'
    }
};
```

### Example 3: Pattern-Based Matching

```json
// In index.json
{
  "dataTypes": {
    "genome_data": {
      "configUrl": "/config/genome-config.json",
      "matches": [
        "KBaseFBA.GenomeDataLakeTables-*",
        "genome/*"
      ],
      "priority": 10,
      "autoLoad": true
    }
  }
}
```
