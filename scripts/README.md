# Scripts

Simple scripts for managing DataTables Viewer configurations.

## validate-config.sh

Validates a config JSON file against the schema.

### Usage

```bash
# Validate a file
./scripts/validate-config.sh path/to/config.json

# Or pipe JSON
cat config.json | ./scripts/validate-config.sh

# Or use npm script
npm run validate-config path/to/config.json
```

### Examples

```bash
# Validate a config file
./scripts/validate-config.sh public/config/my-config.json

# Validate from stdin
echo '{"id":"test","version":"1.0.0","tables":{}}' | ./scripts/validate-config.sh
```

## version-config.sh

Manages config versions with folder structure.

### Usage

```bash
./scripts/version-config.sh <config-file.json> [version] [message]
```

### Examples

```bash
# Version a config (uses version from config file)
./scripts/version-config.sh my-config.json

# Specify version explicitly
./scripts/version-config.sh my-config.json 1.0.0

# With message
./scripts/version-config.sh my-config.json 1.0.0 "Initial version"
```

### Folder Structure

Creates the following structure:

```
public/config/versions/
  {config-type}/
    v1.0.0/
      config.json
      metadata.json
    v1.1.0/
      config.json
      metadata.json
    latest -> v1.1.0
    index.json
```

### Metadata

Each version includes a `metadata.json` file:

```json
{
  "config_type": "my_config",
  "version": "1.0.0",
  "created_at": "2024-01-01T00:00:00Z",
  "created_by": "username",
  "message": "Initial version",
  "source_file": "my-config.json"
}
```

### Index

Each config type has an `index.json`:

```json
{
  "config_type": "my_config",
  "versions": ["v1.0.0", "v1.1.0"],
  "latest": "v1.1.0",
  "created_at": "2024-01-01T00:00:00Z"
}
```

## Workflow

1. **Edit config**: Edit your JSON config file
2. **Validate**: Run `./scripts/validate-config.sh my-config.json`
3. **Version**: Run `./scripts/version-config.sh my-config.json 1.0.0 "Description"`
4. **Use**: The config is now versioned and available in the versions folder

## Requirements

- `jq` - For JSON processing (usually pre-installed on Linux/Mac)
- `node` - For validation (uses TypeScript validator)
- `bash` - Shell script execution
