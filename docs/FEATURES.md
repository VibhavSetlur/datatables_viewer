# Features Overview

Complete feature list for DataTables Viewer.

## Performance Features

### Client-Side SQLite (LocalDbClient)
- **Direct File Access**: No network overhead for local databases
- **In-Memory Processing**: Fast queries using sql.js
- **Suitable for**: Small-medium databases (20-200MB)
- **No Server Required**: Works entirely in browser

### TableScanner Service (External)
- **Query Result Caching**: 5-minute TTL, smart invalidation
- **FTS5 Full-Text Search**: 100-1000x faster than LIKE queries
- **Prepared Statement Caching**: 20-50% faster query execution
- **Connection Pooling**: 30-minute database connection lifespan
- **Automatic Indexing**: Creates indices on-demand
- **Server-Side Optimizations**: Full caching and performance features

## Query Features

### Advanced Filtering

Supported operators:
- `eq` - Equals
- `ne` - Not equals
- `gt` - Greater than
- `gte` - Greater than or equal
- `lt` - Less than
- `lte` - Less than or equal
- `like` - Pattern match (case-sensitive)
- `ilike` - Pattern match (case-insensitive)
- `in` - Value in list
- `not_in` - Value not in list
- `between` - Range query
- `is_null` - Null check
- `is_not_null` - Not null check
- `regex` - Regular expression

### Aggregations

Supported functions:
- `COUNT` - Count rows
- `SUM` - Sum values
- `AVG` - Average
- `MIN` - Minimum
- `MAX` - Maximum
- `STDDEV` - Standard deviation
- `VARIANCE` - Variance
- `DISTINCT_COUNT` - Count distinct values

### Grouping
- `GROUP BY` support for statistical analysis
- Multiple grouping columns
- Aggregations with grouping

### Column Statistics
- Pre-computed statistics for all columns
- Min, max, mean, median, stddev
- Null counts, distinct counts
- Sample values
- Accessible via API and UI

## UI Features

### Performance Indicators
- Shows cached query status (⚡ icon)
- Displays query execution time
- Visible in status bar and performance indicator

### Column Statistics View
- Click "Stats" button in sidebar
- View detailed statistics for all columns
- Modal display with organized layout

### Schema Explorer
- Browse database structure with live schema fetch
- Search tables, columns, and data matches
- View real SQL types with PK / Not-Null badges
- Manual schema refresh per table
- Works with remote TableScanner or local SQLite fallback
- Click "Schema" button in sidebar

### Category Management
- Group columns by category
- Toggle category visibility
- Expand/collapse categories
- Show/hide all columns

### Cell Transformers

Transform cell values for display:
- **Link**: Clickable hyperlinks with templates
- **Badge**: Colored badges with custom colors
- **Number**: Formatted numbers with precision
- **Heatmap**: Color gradients based on values
- **Boolean**: Icons for true/false
- **Sequence**: DNA/protein sequence display
- **Ontology**: GO terms and ontology lookups

### Keyboard Navigation
- `?` - Show keyboard help
- `Ctrl+A` - Select all rows
- `Ctrl+Shift+E` - Export to CSV
- `Esc` - Clear selection
- `R` - Refresh data
- `↑/↓` - Navigate rows
- `Enter` - Activate selected row

### Export
- CSV export
- JSON export
- TSV export
- Selected rows only (optional)
- Include/exclude columns

### Themes
- Light theme
- Dark theme
- System theme (auto-detect)

### Density Modes
- Compact - More rows visible
- Normal - Balanced spacing
- Comfortable - More spacing

## Deployment Features

### Flexible Deployment
- **Static Frontend**: Builds to static HTML/JS/CSS
- **Separate API**: Can use remote API service
- **Integrated Server**: Optional integrated server
- **Client-Side Fallback**: Works without server via `sql.js`

### API Compatibility
- TableScanner-compatible endpoints
- RESTful API design
- JSON responses
- Error handling

## Configuration Features

### File-Based Config
- JSON configuration files
- Automatic registration
- Schema validation
- Version control friendly

### URL Parameters
- `?db=filename` - Load database
- Automatic config loading
- Error handling

### Environment Variables
- `VITE_API_URL` - API service URL
- `DATA_DIR` - Database directory (server)
- `CONFIG_DIR` - Config directory (server)
- `PORT` - Server port

## Developer Features

### TypeScript
- Full type safety
- IntelliSense support
- Compile-time error checking

### Modular Architecture
- Component-based UI
- Manager pattern for features
- State management
- Event bus for communication

### Testing
- Unit tests
- Integration tests
- E2E tests (Playwright)
- Coverage reports

### Development Tools
- Hot module replacement
- Type checking
- Linting
- Formatting
