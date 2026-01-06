# Configuration Guide

The GenomeDataTables Viewer is driven by a powerful, JSON-based configuration system. This allows data table developers to define presentation logic—including column visibility, data transformation, and categorization—without writing any code.

## File Location

The configuration file is typically located at `configs/genome-data.config.json`.
The application loads this file dynamically at runtime.

## Schema Overview

The configuration object has the following high-level structure:

```typescript
interface ViewerConfig {
  name: string;             // Application Title
  description?: string;     // Brief description
  categories: Category[];   // List of Semantic Categories
  columns: ColumnConfig[];  // List of Column Definitions
  defaultSettings?: {
    pageSize?: number;      // Default rows per page (default: 100)
    theme?: 'light'|'dark'; // Default theme
  }
}
```

## 1. Categories

Categories allow you to group related columns (e.g., "Genomic Info", "External Links"). Users can toggle these groups on/off to declutter the view.

```json
"categories": [
  {
    "id": "core",           // Unique ID referenced by columns
    "name": "Core Info",    // Display Name
    "description": "Essential gene identifiers",
    "icon": "bi-database",  // Bootstrap Icon class (optional)
    "color": "#6366f1",     // Color for the toggle button (optional)
    "defaultVisible": true  // Initial visibility state
  }
]
```

## 2. Columns

Column configurations map SQL columns to the UI and define how they should be rendered.

```typescript
interface ColumnConfig {
  column: string;           // SQL Column Name (Case Sensitive)
  displayName?: string;     // Header Label (Defaults to column name)
  categories?: string[];    // List of Category IDs this column belongs to
  width?: string;           // CSS width (e.g., "150px")
  sortable?: boolean;       // Enable sorting? (default: true)
  filterable?: boolean;     // Enable filtering? (default: true)
  transform?: Transform;    // Data transformation logic
}
```

### Column Visibility Logic
A column is **visible** if:
1.  It is **Uncategorized** (has no `categories` array).
2.  OR, at least **one** of its assigned categories is valid and currently toggled ON.

## 3. Transformers

Transformers modify the raw data before rendering.

### `link`
Turns the cell value into a clickable hyperlink.

```json
{
  "type": "link",
  "options": {
    "urlTemplate": "https://www.uniprot.org/uniprotkb/{value}",
    "target": "_blank",
    "icon": "bi-link-45deg"
  }
}
```
-   `{value}`: Replaced by the cell's value.
-   `{Other_Col}`: You can inject values from other columns in the same row.

### `merge`
Combines multiple columns into a single cell. Useful for "Synthetic Columns" that don't exist in the SQL table.

```json
{
  "type": "merge",
  "options": {
    "columns": ["Gene_Name", "Locus_Tag"],
    "template": "{Gene_Name} <small>({Locus_Tag})</small>"
  }
}
```

### `ontology`
Fetches human-readable names for ontology terms (e.g., GO:0008150 -> "biological_process").
*Note: This feature performs async lookups.*

```json
{
  "type": "ontology",
  "options": {
    "ontologyType": "GO",  // Options: "GO", "KEGG", "EC", "custom"
    "showId": true         // Show "Term Name (ID)" vs just "Term Name"
  }
}
```

### `sequence`
Truncates long sequence strings and adds a tooltip.

```json
{
  "type": "sequence",
  "options": {
    "maxLength": 15
  }
}
```

## Example Configuration

```json
{
  "name": "E. coli Pangenome",
  "categories": [
    { "id": "ids", "name": "Identifiers", "color": "#10b981" }
  ],
  "columns": [
    {
      "column": "gene_id",
      "displayName": "Gene ID",
      "categories": ["ids"]
    },
    {
      "column": "uniprot",
      "displayName": "UniProt",
      "categories": ["ids"],
      "transform": {
        "type": "link",
        "options": { "urlTemplate": "https://www.uniprot.org/uniprotkb/{value}" }
      }
    }
  ]
}
```
