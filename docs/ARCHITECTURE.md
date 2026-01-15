# Architecture Overview

High-level architecture of DataTables Viewer.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (SPA)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  TableRenderer│  │  ApiClient   │  │ LocalDbClient │ │
│  │  (Orchestrator)│  │  (Router)    │  │ (sql.js)      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                  │                  │         │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │
          │                  │                  │
    ┌─────▼──────┐    ┌─────▼──────┐    ┌─────▼──────┐
    │  Remote    │    │  Integrated │    │  Client-   │
    │  API       │    │  Server     │    │  Side      │
    │  Service   │    │  (Optional) │    │  (Fallback)│
    └────────────┘    └─────────────┘    └────────────┘
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
- **LocalDbClient**: Client-side SQLite (sql.js)
- **Server API**: Express.js service (optional)

### 4. Service Layer (Optional)
- **SQLiteService**: Server-side SQLite with caching
- **ColumnStatsService**: Column statistics
- **ConfigResolver**: Config resolution logic

## Data Flow

### Loading a Database

```
User → URL Parameter (?db=filename)
  ↓
TableRenderer.loadDatabaseFromFile()
  ↓
ApiClient.listTables()
  ↓
[Check: Remote API?] → Yes → Remote API
  ↓ No
[Check: Local Server?] → Yes → Integrated Server
  ↓ No
LocalDbClient (sql.js)
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

### Mode 1: Static Frontend Only
- **Frontend**: Built static files (dist/)
- **Data Access**: LocalDbClient only (sql.js)
- **Use Case**: Testing, Jupyter environment
- **No Server**: Required

### Mode 2: Integrated Deployment
- **Frontend**: Served by integrated server
- **Backend**: Express.js server in same process
- **Data Access**: Server-side SQLite with caching
- **Use Case**: Development, local testing

### Mode 3: Separate Deployment
- **Frontend**: Static files on CDN/static host
- **Backend**: Separate API service
- **Data Access**: Remote API calls
- **Use Case**: Production deployment

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

## Caching Strategy

### Query Result Cache
- **Location**: Server-side (if using server)
- **TTL**: 5 minutes
- **Invalidation**: File modification time
- **Size**: Max 1000 queries

### Database Connection Cache
- **Location**: Server-side
- **Lifespan**: 30 minutes of inactivity
- **Cleanup**: Automatic every 5 minutes

### Prepared Statement Cache
- **Location**: Server-side
- **Scope**: Per database connection
- **Benefit**: 20-50% faster query execution

## API Compatibility

### TableScanner-Compatible Endpoints

All endpoints match TableScanner API:

- `GET /object/{db_name}/tables`
- `GET /object/{db_name}/tables/{table}/data`
- `POST /table-data`
- `GET /schema/{db_name}/tables`
- `GET /object/{db_name}/tables/{table}/stats`
- `POST /api/aggregate/{db_name}/tables/{table}`

### Request/Response Format

Matches TableScanner exactly for compatibility.

## Performance Optimizations

### Frontend
- Code splitting
- Lazy loading
- Efficient re-rendering
- Virtual scrolling (future)

### Backend
- Query result caching
- Connection pooling
- Prepared statements
- FTS5 full-text search
- Automatic indexing

## Security Considerations

### Client-Side
- No sensitive data in client code
- API tokens handled securely
- CORS configured properly

### Server-Side
- Read-only database access
- Input validation
- Rate limiting (future)
- Authentication (future)

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
