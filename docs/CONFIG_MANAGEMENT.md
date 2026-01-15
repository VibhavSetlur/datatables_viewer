# Config Management

This document describes how AI-generated configs from TableScanner are managed in DataTables Viewer.

## Overview

DataTables Viewer uses a file-based config system. AI-generated configs from TableScanner are saved to `public/config/` and automatically registered in `index.json`.

## Architecture

```
TableScanner (AI Generator)
    ↓ POST /api/configs or pipe to script
Config Handler Script
    ↓ Validate against schema
    ↓ Save to public/config/
    ↓ Update index.json
Frontend (reads from public/config/)
```

## Config Storage

### File Structure

```
public/config/
├── index.json              # Main config registry
├── genome-data-tables.json # Example config
├── berdl-tables.json       # Example config
└── schemas/
    └── config.schema.json  # Validation schema
```

### Config Files

Each config is saved as a JSON file with a filename derived from the object_type:
- `KBaseGeneDataLakes.BERDLTables-1.0` → `berdltables.json`
- `KBaseFBA.GenomeDataLakeTables-2.0` → `genomedatalaketables.json`

### index.json

The `index.json` file is automatically updated when new configs are added:

```json
{
  "dataTypes": {
    "berdl_tables": {
      "configUrl": "/config/berdltables.json",
      "matches": [
        "KBaseGeneDataLakes.BERDLTables-1.0",
        "KBaseGeneDataLakes.BERDLTables-*"
      ],
      "priority": 10,
      "autoLoad": true
    }
  }
}
```

## TableScanner Integration

### Option 1: HTTP API Handler

Start the config API handler:
```bash
npm run config-api
```

TableScanner can POST configs to:
```
# Configs are managed via static JSON files
# See ADDING_DATABASES.md and DATABASE_MAPPING.md for details
Content-Type: application/json

{
  "object_type": "KBaseGeneDataLakes.BERDLTables-1.0",
  "source_ref": "76990/7/2",
  "config": { ... },
  "source": "ai_generated",
  "fingerprint": "abc123...",
  "ai_provider": "openai",
  "confidence": 0.95
}
```

### Option 2: Direct Script Call

TableScanner can pipe config data directly to the save script:
```bash
echo '{"object_type":"...","config":{...}}' | npm run save-config
```

Or save to a file first:
```bash
# TableScanner saves config to file
npm run save-config /path/to/config.json
```

## Validation

All configs are validated against the JSON schema before being saved.

### Automatic Validation

The save script automatically validates configs:
- JSON syntax validation
- Schema validation
- User-friendly error messages

### Manual Validation

Developers can validate their configs:
```bash
npm run validate-config public/config/my-config.json
```

**Example output:**
```
Validation passed: Config is valid
```

Or if errors:
```
Validation failed:
  At /tables/Genes/columns/0: must have required property 'column'
  At /version: must match pattern "^\\d+\\.\\d+\\.\\d+$"
```

## Developer Workflow

### Creating a New Config

1. Create a config file following the schema
2. Validate it:
   ```bash
   npm run validate-config my-config.json
   ```
3. Copy to `public/config/`:
   ```bash
   cp my-config.json public/config/my-config.json
   ```
4. Manually update `index.json` to register it

### Editing an Existing Config

1. Edit the config file in `public/config/`
2. Validate it:
   ```bash
   npm run validate-config public/config/my-config.json
   ```
3. The frontend will automatically pick up changes on reload

### Testing Configs

1. Start the dev server:
   ```bash
   npm run dev
   ```
2. The config will be loaded automatically if `autoLoad: true` in `index.json`
3. Test with your data source

## Config Resolution

The frontend resolves configs in this order:

1. **Static configs** (from `public/config/` via `index.json`)
2. **Remote API** (TableScanner for generation)
3. **Default config** (minimal fallback)

Static configs are always checked first, so saved configs take precedence.

## Error Handling

### Validation Errors

If a config fails validation:
- The save operation is aborted
- Clear error messages are displayed
- No files are modified

### File Errors

If there are file system errors:
- Clear error messages are shown
- The operation fails gracefully
- No partial files are created

## Best Practices

1. **Always validate** before saving configs
2. **Use descriptive filenames** (auto-generated from object_type)
3. **Keep index.json clean** (auto-updated by scripts)
4. **Test configs** with real data before committing
5. **Version control** all config files

## Troubleshooting

### Config not loading

- Check `index.json` has the entry
- Verify `configUrl` path is correct
- Check browser console for errors
- Validate the config file

### Validation fails

- Check error messages for specific issues
- Verify against schema: `public/config/schemas/config.schema.json`
- Ensure all required fields are present
- Check version format (must be semantic version)

### File not found

- Ensure config file exists in `public/config/`
- Check `configUrl` in `index.json` matches file location
- Verify file permissions
