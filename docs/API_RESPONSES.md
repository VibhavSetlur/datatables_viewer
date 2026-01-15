# API Response Format Documentation

## Overview

All API responses from the DataTables Viewer service include comprehensive metadata to help developers configure data viewing based on column types, query information, and other contextual data.

## Standard Response Structure

### Table Data Response

```typescript
interface TableDataResponse {
    // Core data
    headers: string[];                    // Column names
    data: any[][];                       // Row data as arrays
    total_count: number;                  // Total rows matching query
    
    // Column metadata (NEW)
    column_types?: ColumnMetadata[];     // Type information for each column
    column_schema?: ColumnMetadata[];    // Full schema information
    
    // Query metadata (NEW)
    query_metadata?: QueryMetadata;      // Information about the query performed
    
    // Performance metrics
    cached?: boolean;                     // Whether result was from cache
    execution_time_ms?: number;          // Query execution time
    
    // Pagination
    limit?: number;                       // Rows per page
    offset?: number;                      // Current offset
    
    // Context
    table_name?: string;                 // Table queried
    database_path?: string;              // Database file path (server only)
}
```

### Column Metadata

```typescript
interface ColumnMetadata {
    name: string;          // Column name
    type: string;          // SQLite type (INTEGER, REAL, TEXT, etc.)
    notnull: boolean;      // Whether column is NOT NULL
    pk: boolean;           // Whether column is primary key
    dflt_value: any;       // Default value (if any)
}
```

**Example:**
```json
{
    "name": "genome_id",
    "type": "TEXT",
    "notnull": true,
    "pk": true,
    "dflt_value": null
}
```

### Query Metadata

```typescript
interface QueryMetadata {
    query_type: 'select' | 'aggregate' | 'join';  // Type of query
    sql: string;                                   // SQL query executed
    filters_applied: number;                       // Number of filters
    has_search: boolean;                          // Whether global search was used
    has_sort: boolean;                            // Whether sorting was applied
    has_group_by: boolean;                        // Whether GROUP BY was used
    has_aggregations: boolean;                    // Whether aggregations were used
}
```

**Example:**
```json
{
    "query_type": "select",
    "sql": "SELECT * FROM \"genomes\" WHERE \"contigs\" > ? ORDER BY \"genome_id\" ASC LIMIT ? OFFSET ?",
    "filters_applied": 1,
    "has_search": false,
    "has_sort": true,
    "has_group_by": false,
    "has_aggregations": false
}
```

## Complete Response Example

```json
{
    "headers": ["genome_id", "gtdb_taxonomy", "ncbi_taxonomy", "contigs", "features"],
    "data": [
        ["GCA_000005825.1", "d__Bacteria;...", "2", "562", "61143"],
        ["GCA_000005825.2", "d__Bacteria;...", "2", "563", "61144"]
    ],
    "total_count": 42,
    "column_types": [
        {
            "name": "genome_id",
            "type": "TEXT",
            "notnull": true,
            "pk": true,
            "dflt_value": null
        },
        {
            "name": "gtdb_taxonomy",
            "type": "TEXT",
            "notnull": false,
            "pk": false,
            "dflt_value": null
        },
        {
            "name": "contigs",
            "type": "INTEGER",
            "notnull": false,
            "pk": false,
            "dflt_value": null
        },
        {
            "name": "features",
            "type": "INTEGER",
            "notnull": false,
            "pk": false,
            "dflt_value": null
        }
    ],
    "column_schema": [
        // Same as column_types
    ],
    "query_metadata": {
        "query_type": "select",
        "sql": "SELECT * FROM \"genomes\" WHERE \"contigs\" > ? ORDER BY \"genome_id\" ASC LIMIT ? OFFSET ?",
        "filters_applied": 1,
        "has_search": false,
        "has_sort": true,
        "has_group_by": false,
        "has_aggregations": false
    },
    "cached": false,
    "execution_time_ms": 15,
    "limit": 50,
    "offset": 0,
    "table_name": "genomes",
    "database_path": "/data/genomes.db"
}
```

## Using Column Types for Configuration

### Type-Based Rendering

Use `column_types` to configure how data is displayed:

```typescript
// Example: Configure display based on type
response.column_types?.forEach(col => {
    if (col.type === 'INTEGER' || col.type === 'REAL') {
        // Configure numeric formatting
        configureNumericColumn(col.name, {
            format: 'number',
            alignment: 'right',
            filterOperators: ['<', '<=', '>', '>=', '=', '!=']
        });
    } else if (col.type === 'TEXT') {
        // Configure text formatting
        configureTextColumn(col.name, {
            format: 'text',
            alignment: 'left',
            filterOperators: ['contains', '=', '!=', 'starts_with', 'ends_with']
        });
    }
});
```

### Filter Configuration

Use column types to determine appropriate filter operators:

```typescript
function getFilterOperators(columnType: string): string[] {
    const upper = columnType.toUpperCase();
    if (upper.includes('INT') || upper.includes('REAL') || upper.includes('NUMERIC')) {
        return ['<', '<=', '>', '>=', '=', '!=', 'between'];
    }
    return ['contains', '=', '!=', 'in', 'not_in', 'starts_with', 'ends_with'];
}
```

### Validation

Use schema information for data validation:

```typescript
function validateValue(column: ColumnMetadata, value: any): boolean {
    if (column.notnull && (value === null || value === undefined)) {
        return false;
    }
    
    if (column.type === 'INTEGER' && !Number.isInteger(value)) {
        return false;
    }
    
    if (column.type === 'REAL' && typeof value !== 'number') {
        return false;
    }
    
    return true;
}
```

## Query Metadata Usage

### Debugging

Use `query_metadata.sql` to see exactly what query was executed:

```typescript
console.log('Query executed:', response.query_metadata?.sql);
console.log('Filters applied:', response.query_metadata?.filters_applied);
```

### Performance Monitoring

Track query performance:

```typescript
if (response.execution_time_ms && response.execution_time_ms > 1000) {
    console.warn('Slow query detected:', {
        time: response.execution_time_ms,
        query: response.query_metadata?.sql
    });
}
```

### UI Configuration

Use query metadata to configure UI elements:

```typescript
if (response.query_metadata?.has_aggregations) {
    // Show aggregation controls
    showAggregationPanel();
}

if (response.query_metadata?.has_group_by) {
    // Show group by indicators
    highlightGroupedColumns();
}
```

## Server vs Client Responses

### Server Response (Integrated Server)

- Includes `database_path`
- May include `cached: true` if from cache
- `execution_time_ms` includes network + query time

### Client Response (LocalDbClient)

- No `database_path` (client-side)
- Always `cached: false`
- `execution_time_ms` is query time only

Both include the same metadata structure for consistency.

## Migration Guide

### Before (Old Response)

```typescript
{
    headers: string[];
    data: any[][];
    total_count: number;
}
```

### After (New Response)

```typescript
{
    headers: string[];
    data: any[][];
    total_count: number;
    column_types?: ColumnMetadata[];      // NEW
    column_schema?: ColumnMetadata[];     // NEW
    query_metadata?: QueryMetadata;       // NEW
    cached?: boolean;                      // NEW
    execution_time_ms?: number;           // NEW
    limit?: number;                        // NEW
    offset?: number;                      // NEW
    table_name?: string;                  // NEW
    database_path?: string;               // NEW (server only)
}
```

All new fields are optional, so existing code continues to work. Gradually adopt new fields as needed.
