# Scripts

Simple scripts for managing DataTables Viewer configurations.

## Config Management (scripts/config/)

### validate-config.sh

Validates a config JSON file against the schema.

#### Usage

```bash
# Validate a file
./scripts/config/validate-config.sh path/to/config.json

# Or pipe JSON
cat config.json | ./scripts/config/validate-config.sh

# Or use npm script
npm run validate-config path/to/config.json
```

### version-config.sh

Manages config versions with folder structure.

#### Usage

```bash
./scripts/config/version-config.sh <config-file.json> [version] [message]
```

### generate-config.ts

Generates a starter configuration file from a database path.

#### Usage

```bash
npm run generate-config <db-path> [config-name]
```

### save-config.ts

Saves AI-generated configs (used by API handler).

## Server (scripts/server/)

### api-handler.ts

API Handler for TableScanner. Receives POST requests and uses `save-config.ts`.

#### Usage

```bash
npm run config-api
```

### extract-server-docs.ts

Extracts server documentation.

## Testing (scripts/test/)

### test-system.sh

Test script for config management system.

#### Usage

```bash
./scripts/test/test-system.sh
```

## Folder Structure

```
scripts/
  config/           # Config management scripts
    generate-config.ts
    save-config.ts
    validate-config.ts
    validate-config.sh
    version-config.sh
  server/           # Server-related scripts
    api-handler.ts
    extract-server-docs.ts
    start-server.sh
  test/             # Test scripts
    test-system.sh
    test-config.json
```

## Requirements

- `jq` - For JSON processing (usually pre-installed on Linux/Mac)
- `node` - For execution
- `bash` - Shell script execution
