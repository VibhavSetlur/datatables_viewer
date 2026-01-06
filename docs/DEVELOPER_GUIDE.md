# Developer Guide: Extensible Data Type Configuration

This guide explains how to add support for new data types in the DataTables Viewer using the configuration schema.

## Overview

The viewer uses a schema-driven approach to render different types of data. The configuration is split into:
1.  **`index.json`**: The central manifest that registers available data types.
2.  **Data Type Configs** (e.g., `genome-data.json`): Detailed schema files for specific data types.

## 1. Registering a New Data Type

Open `public/config/index.json` and add an entry to the `dataTypes` object.

```json
{
  "dataTypes": {
    "my_new_type": {
      "configUrl": "/config/my-new-type.json",
      "matches": [
        "MyNamespace.MyObjectType-1.0",
        "LegacyName"
      ]
    }
  }
}
```

-   **Keys**: The unique ID for your data type (e.g., `my_new_type`).
-   **`configUrl`**: Path to your specific configuration file.
-   **`matches`**: A list of strings used to auto-detect this type from API responses (e.g., the KBase object type).

## 2. Creating a Data Type Configuration

Create a new JSON file (e.g., `public/config/my-new-type.json`).

### Structure

```json
{
  "id": "my_new_type",
  "name": "My Custom Data Viewer",
  "version": "1.0.0",
  "tables": {
    "MyTableName": { /* Table Schema */ }
  },
  "sharedCategories": [ /* Reusable Categories */ ]
}
```

### Table Schema

Each table in the `tables` object corresponds to a table name returned by the API.

```json
"MyTableName": {
  "displayName": "Friendly Name",
  "columns": [
    {
      "column": "source_col_name",
      "displayName": "Column Header",
      "dataType": "number",
      "transform": { /* Optional Transformation */ }
    }
  ],
  "settings": {
    "defaultSortColumn": "source_col_name"
  }
}
```

## 3. Column Data Types

Supported `dataType` values:

| Type | Description |
| :--- | :--- |
| `string` | Default text |
| `number` | Formatted number (supports decimals) |
| `integer` | Whole numbers |
| `percentage` | 0-1 or 0-100 values formatted as % |
| `date` / `datetime` | Date formatting |
| `boolean` | Checkmarks or True/False tags |
| `id` | Monospace font with copy-to-clipboard button |
| `link` | External links |

## 4. Transformers

Transformers modify how data is displayed. They are defined in the `transform` field.

### Common Transformers

**Link:**
```json
"transform": {
  "type": "link",
  "options": {
    "urlTemplate": "https://example.com/view/{value}",
    "target": "_blank"
  }
}
```

**Heatmap (Coloring):**
```json
"transform": {
  "type": "heatmap",
  "options": {
    "min": 0,
    "max": 100,
    "colorScale": "diverging"
  }
}
```

**Conditionals:**
```json
"transform": {
  "type": "conditional",
  "condition": { "operator": "gt", "value": 50 },
  "true": { "type": "badge", "options": { "color": "green" } },
  "false": { "type": "badge", "options": { "color": "red" } }
}
```

## 5. Verification

1.  Restart the dev server (changes to `public/` are usually hot-reloaded, but a refresh ensures safety).
2.  Your new data type will be automatically detected if the API returns a matching `object_type`.
3.  Alternatively, the registry will fall back to the first available type if no match is found, but console warnings will appear.
