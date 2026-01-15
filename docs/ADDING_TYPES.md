# Adding New Data Types

This guide explains how to add new data types to the DataTables Viewer, including creating type configurations and registering them in the system.

## Overview

Data types in DataTables Viewer define:
- Table structures and schemas
- Column configurations
- Display settings
- Filter options
- Transformations

## Understanding Data Types

### What is a Data Type?

A data type is a configuration that describes how to display and interact with a specific kind of database or data structure. For example:
- `genome_data_tables` - Configuration for genome databases
- `berdl_tables` - Configuration for BERDL table databases
- `metabolic_models` - Configuration for metabolic model data

### Data Type Structure

```json
{
  "$schema": "./schemas/config.schema.json",
  "name": "my_data_type",
  "version": "1.0.0",
  "description": "Description of this data type",
  "dataType": {
    "id": "my_data_type",
    "name": "My Data Type",
    "description": "Full description",
    "tables": {
      "table_name": {
        "name": "table_name",
        "displayName": "Table Name",
        "columns": [
          {
            "column": "column_name",
            "displayName": "Column Name",
            "dataType": "string",
            "visible": true,
            "sortable": true,
            "filterable": true
          }
        ]
      }
    }
  }
}
```

## Creating a New Data Type

### Method 1: Generate from Database (Recommended)

The easiest way to create a new data type:

```bash
# Generate config from existing database
npm run generate-config /path/to/database.db my-data-type

# This creates:
# - public/config/my-data-type/v1.0.0/my-data-type.json
# - public/config/my-data-type/README.md
```

The generated config includes:
- All tables from the database
- Column information with types
- Default display settings
- Proper structure following the schema

### Method 2: Create Manually

1. **Create config file:**
   ```bash
   mkdir -p public/config/my-data-type/v1.0.0
   touch public/config/my-data-type/v1.0.0/my-data-type.json
   ```

2. **Write config following schema:**
   ```json
   {
     "$schema": "./schemas/config.schema.json",
     "name": "my_data_type",
     "version": "1.0.0",
     "description": "My custom data type",
     "dataType": {
       "id": "my_data_type",
       "name": "My Data Type",
       "description": "Description of my data type",
       "tables": {
         "my_table": {
           "name": "my_table",
           "displayName": "My Table",
           "columns": [
             {
               "column": "id",
               "displayName": "ID",
               "dataType": "integer",
               "visible": true,
               "sortable": true,
               "filterable": true,
               "width": "100px",
               "align": "right"
             },
             {
               "column": "name",
               "displayName": "Name",
               "dataType": "string",
               "visible": true,
               "sortable": true,
               "filterable": true
             }
           ]
         }
       }
     }
   }
   ```

3. **Validate:**
   ```bash
   npm run validate-config public/config/my-data-type/v1.0.0/my-data-type.json
   ```

## Registering a Data Type

### Add to index.json

Edit `public/config/index.json`:

```json
{
  "dataTypes": {
    "my_data_type": {
      "configUrl": "/config/my-data-type/v1.0.0/my-data-type.json",
      "matches": [
        "my-pattern-1",
        "my-pattern-2",
        "pattern-*"
      ],
      "priority": 10,
      "autoLoad": true
    }
  }
}
```

**Fields:**
- `configUrl` - Path to config file (relative to `/config/`)
- `matches` - Patterns that identify this data type
- `priority` - Higher priority = checked first (1-100)
- `autoLoad` - Load automatically on startup

### Pattern Matching

Patterns support wildcards:

- `exact-match` - Exact match only
- `prefix-*` - Matches anything starting with "prefix-"
- `*suffix` - Matches anything ending with "suffix"
- `*middle*` - Matches anything containing "middle"

**Examples:**
```json
"matches": [
  "KBaseFBA.GenomeDataLakeTables-1.0",  // Exact match
  "KBaseFBA.GenomeDataLakeTables-*",   // Any version
  "genome/*",                           // Any genome workspace
  "*GenomeData*"                        // Contains "GenomeData"
]
```

### Priority System

When multiple patterns match, the one with **higher priority** wins:

```json
{
  "dataTypes": {
    "specific_type": {
      "configUrl": "/config/specific.json",
      "matches": ["exact-match"],
      "priority": 20,  // Higher priority
      "autoLoad": true
    },
    "general_type": {
      "configUrl": "/config/general.json",
      "matches": ["*"],
      "priority": 1,   // Lower priority
      "autoLoad": true
    }
  }
}
```

## Column Configuration

### Column Data Types

Supported column `dataType` values:

- `string` - Text data
- `number` - Generic number
- `integer` - Whole numbers
- `float` - Decimal numbers
- `boolean` - True/false
- `date` - Date values
- `datetime` - Date and time
- `timestamp` - Unix timestamp
- `json` - JSON objects
- `array` - Arrays
- `id` - Identifiers (monospace, copy button)
- `url` - URLs (auto-link)
- `email` - Email addresses
- `percentage` - 0-1 values as percentages
- `filesize` - Bytes as human-readable
- `duration` - Seconds as human-readable

### Column Properties

```json
{
  "column": "column_name",
  "displayName": "Display Name",
  "description": "Column description",
  "dataType": "integer",
  
  // Visibility
  "visible": true,
  
  // Behavior
  "sortable": true,
  "filterable": true,
  "searchable": true,
  "copyable": false,
  "editable": false,
  "resizable": true,
  
  // Layout
  "width": "120px",
  "minWidth": "80px",
  "maxWidth": "200px",
  "align": "right",
  "pin": false,
  
  // Categorization
  "categories": ["core", "metadata"],
  "priority": 1,
  
  // Filtering
  "filterType": "number",
  
  // Query features
  "queryFeatures": {
    "advancedFilters": true,
    "aggregations": true,
    "groupBy": true
  }
}
```

## Advanced Column Configuration

### Transformations

Apply transformations to column values:

```json
{
  "column": "taxonomy",
  "transform": {
    "type": "ontology",
    "options": {
      "lookupTable": "taxonomy_lookup",
      "lookupKey": "id",
      "lookupValue": "name"
    }
  }
}
```

### Categories

Group columns into categories:

```json
{
  "column": "genome_id",
  "categories": ["core", "identifiers"]
}
```

Categories can be toggled in the UI sidebar.

### Filter Configuration

Configure filter behavior:

```json
{
  "column": "value",
  "dataType": "integer",
  "filterType": "number",
  "queryFeatures": {
    "advancedFilters": true,
    "customOperators": ["<", "<=", ">", ">=", "=", "!=", "between"]
  }
}
```

## Versioning Data Types

### Create New Version

```bash
# Copy existing version
cp -r public/config/my-type/v1.0.0 public/config/my-type/v1.1.0

# Edit new version
vim public/config/my-type/v1.1.0/my-type.json

# Update version field
# "version": "1.1.0"

# Update index.json
# "configUrl": "/config/my-type/v1.1.0/my-type.json"
```

### Version Structure

```
public/config/
└── my-data-type/
    ├── v1.0.0/
    │   └── my-data-type.json
    ├── v1.1.0/
    │   └── my-data-type.json
    └── README.md
```

## Testing Your Data Type

### 1. Validate Config

```bash
npm run validate-config public/config/my-type/v1.0.0/my-type.json
```

### 2. Test in Browser

```bash
npm run dev
```

Open viewer and:
- Select data source matching your pattern
- Verify config loads
- Check tables display correctly
- Test column configurations
- Verify filters work

### 3. Test Pattern Matching

```bash
# Test with different identifiers
# Should match your pattern and load config
```

## Examples

### Example 1: Simple Data Type

```json
{
  "$schema": "./schemas/config.schema.json",
  "name": "simple_data",
  "version": "1.0.0",
  "dataType": {
    "id": "simple_data",
    "name": "Simple Data",
    "tables": {
      "items": {
        "name": "items",
        "displayName": "Items",
        "columns": [
          {
            "column": "id",
            "displayName": "ID",
            "dataType": "integer",
            "visible": true
          },
          {
            "column": "name",
            "displayName": "Name",
            "dataType": "string",
            "visible": true
          }
        ]
      }
    }
  }
}
```

### Example 2: Complex Data Type with Categories

```json
{
  "$schema": "./schemas/config.schema.json",
  "name": "genome_data",
  "version": "1.0.0",
  "dataType": {
    "id": "genome_data",
    "name": "Genome Data",
    "tables": {
      "genomes": {
        "name": "genomes",
        "displayName": "Genomes",
        "columns": [
          {
            "column": "genome_id",
            "displayName": "Genome ID",
            "dataType": "id",
            "categories": ["core"],
            "priority": 1,
            "visible": true
          },
          {
            "column": "taxonomy",
            "displayName": "Taxonomy",
            "dataType": "string",
            "categories": ["core"],
            "visible": true
          },
          {
            "column": "contigs",
            "displayName": "Contigs",
            "dataType": "integer",
            "categories": ["statistics"],
            "align": "right",
            "visible": true
          }
        ]
      }
    }
  }
}
```

### Example 3: Register in index.json

```json
{
  "dataTypes": {
    "genome_data": {
      "configUrl": "/config/genome-data/v1.0.0/genome-data.json",
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

## Best Practices

1. **Use generate-config** - Start with generated config, then customize
2. **Follow schema** - Always validate against schema
3. **Use semantic versioning** - v1.0.0, v1.1.0, v2.0.0
4. **Document patterns** - Add comments explaining match patterns
5. **Set appropriate priorities** - More specific = higher priority
6. **Test thoroughly** - Verify all features work
7. **Version your changes** - Create new versions for updates
8. **Keep names unique** - Avoid conflicts with existing types

## Troubleshooting

### Config Not Loading

**Problem:** Data type not recognized

**Solutions:**
- Check `index.json` entry exists
- Verify `configUrl` path is correct
- Check pattern matching (test with exact match first)
- Verify `autoLoad: true` if needed

### Pattern Not Matching

**Problem:** Pattern doesn't match identifier

**Solutions:**
- Test with exact match first
- Check wildcard syntax (`*` not `.*`)
- Verify priority (higher wins)
- Check for typos in pattern

### Columns Not Displaying

**Problem:** Columns not visible

**Solutions:**
- Check `visible: true` in config
- Verify column names match database
- Check categories (may be hidden)
- Verify config is loaded (check browser console)

### Validation Errors

**Problem:** Config validation fails

**Solutions:**
- Run `npm run validate-config` for details
- Check against schema: `public/config/schemas/config.schema.json`
- Verify required fields are present
- Check version format (semantic versioning)
