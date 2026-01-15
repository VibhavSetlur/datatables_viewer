# Architecture Overview

High-level architecture of DataTables Viewer.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (SPA)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  TableRenderer│  │  ApiClient   │  │ LocalDbClient │ │
│  │  (Orchestrator)│  │  (Router)    │  │ (sql.js)      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                  │                  │         │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │
          │                  │                  │
    ┌─────▼──────┐    ┌─────▼──────┐    ┌─────▼──────┐
    │  TableScanner│    │  LocalDbClient │    │  Client-   │
    │  Service     │    │  (Client-Side) │    │  Side      │
    │  (External)   │    │  (sql.js)      │    │  (Fallback)│
    └─────────────┘    └──────────────┘    └────────────┘
```

## Component Layers

### 1. Presentation Layer (UI)
- **TableRenderer**: Main orchestrator
- **DataGrid**: Table display component
- **Sidebar**: Navigation and controls
- **Toolbar**: Search and actions

### 2. Business Logic Layer
- **StateManager**: Centralized state management
- **ConfigManager**: Configuration handling
- **CategoryManager**: Column category management
- **ExportManager**: Data export functionality

### 3. Data Access Layer
- **ApiClient**: Routes requests to appropriate service
- **LocalDbClient**: Client-side SQLite (sql.js) - for local databases
- **TableScanner Service**: External API service (for KBase objects and remote databases)

## Data Flow

### Loading a Database

```
User → URL Parameter (?db=filename)
  ↓
TableRenderer.loadDatabaseFromFile()
  ↓
ApiClient.listTables()
  ↓
[Check: Remote TableScanner API?] → Yes → TableScanner Service
  ↓ No
LocalDbClient (sql.js) - Client-side SQLite
  ↓
Display Tables
```

### Querying Data

```
User Action (search/filter/sort)
  ↓
StateManager.update()
  ↓
TableRenderer.fetchData()
  ↓
ApiClient.getTableData()
  ↓
[Same routing as above]
  ↓
Return Data
  ↓
Update UI
```

## Deployment Modes

### Mode 1: Static Frontend Only (Client-Side)
- **Frontend**: Built static files (dist/)
- **Data Access**: LocalDbClient only (sql.js)
- **Use Case**: Testing, Jupyter environment, offline use
- **No Server**: Required
- **Databases**: Must be in `public/data/` directory

### Mode 2: Static Frontend + TableScanner Service
- **Frontend**: Static files on CDN/static host
- **Backend**: External TableScanner service (separate deployment)
- **Data Access**: Remote API calls to TableScanner
- **Use Case**: Production deployment, KBase integration
- **Configuration**: Set `VITE_API_URL` to TableScanner service URL

## State Management

### State Flow

```
User Action
  ↓
StateManager.update()
  ↓
Notify Subscribers
  ↓
Components Re-render
  ↓
UI Updates
```

### State Structure

```typescript
{
  berdlTableId: string | null,
  activeTableName: string | null,
  headers: string[],
  data: Record<string, any>[],
  totalCount: number,
  currentPage: number,
  pageSize: number,
  sortColumn: string | null,
  sortOrder: 'asc' | 'desc',
  searchValue: string,
  columnFilters: Record<string, any>,
  loading: boolean,
  queryCached?: boolean,
  queryTime?: number
}
```

## API Routing Logic

### ApiClient Routing

The `ApiClient` intelligently routes requests:

1. **Local Database (UPA starts with `local/` or in `DATABASE_MAPPINGS`)**:
   - If `VITE_API_URL` is set and points to TableScanner → Use TableScanner service
   - Otherwise → Use LocalDbClient (client-side sql.js)

2. **Remote Database (KBase object UPA)**:
   - Always use TableScanner service (configured via `VITE_API_URL`)

3. **Fallback**:
   - If TableScanner fails → Fall back to LocalDbClient (if local database)

## TableScanner Service Integration

### Service URL Configuration

The frontend connects to TableScanner service via:

- **Environment Variable**: `VITE_API_URL` (set during build)
- **Default URLs**:
  - `appdev`: `https://appdev.kbase.us/services/berdl_table_scanner`
  - `prod`: `https://kbase.us/services/berdl_table_scanner`
  - `local`: `http://127.0.0.1:8000` (local TableScanner instance)

### TableScanner API Compatibility

All endpoints match TableScanner API:

- `GET /object/{db_name}/tables` - List tables
- `GET /object/{db_name}/tables/{table}/data` - Get table data
- `POST /table-data` - Query table data
- `GET /schema/{db_name}/tables` - Get schema
- `GET /object/{db_name}/tables/{table}/stats` - Column statistics
- `POST /api/aggregate/{db_name}/tables/{table}` - Aggregations

### Request/Response Format

Matches TableScanner exactly for compatibility.

## Performance Optimizations

### Frontend
- Code splitting
- Lazy loading
- Efficient re-rendering
- Virtual scrolling (future)

### TableScanner Service (External)
- Query result caching
- Connection pooling
- Prepared statements
- FTS5 full-text search
- Automatic indexing

### LocalDbClient (Client-Side)
- In-memory SQLite database
- Direct file access
- No network overhead
- Suitable for small-medium databases (20-200MB)

## Security Considerations

### Client-Side
- No sensitive data in client code
- API tokens handled securely (for TableScanner)
- CORS configured properly

### TableScanner Service
- Handles authentication
- Input validation
- Rate limiting
- Database access control

## Extension Points

### Plugins
- Plugin system for custom functionality
- Event hooks for integration
- API for plugin developers

### Transformers
- Custom cell transformers
- Transformer registry
- Pre-built transformers

### Config System
- JSON-based configuration
- Schema validation
- Version control friendly
