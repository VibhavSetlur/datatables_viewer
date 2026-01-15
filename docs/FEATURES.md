# Features Overview

Complete feature list for DataTables Viewer.

## Performance Features

### Query Result Caching
- **5-minute TTL**: Cached queries expire after 5 minutes
- **Smart Invalidation**: Automatically invalidates on data changes
- **LRU Eviction**: Removes oldest entries when cache is full (max 1000 queries)
- **10-100x Faster**: Repeated queries return instantly

### FTS5 Full-Text Search
- **Automatic Setup**: Creates FTS5 tables for text columns automatically
- **Fast Search**: 100-1000x faster than LIKE queries
- **Fallback**: Uses LIKE search if FTS5 unavailable

### Prepared Statement Caching
- **Query Reuse**: Reuses prepared statements for identical queries
- **20-50% Faster**: Reduces query compilation overhead

### Connection Pooling
- **30-minute Lifespan**: Database connections cached for 30 minutes
- **Auto-cleanup**: Closes inactive connections automatically
- **File Change Detection**: Reloads database if file modified

### Automatic Indexing
- **On-Demand**: Creates indices automatically when needed
- **All Columns**: Indexes all columns for better query performance

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
- Browse database structure
- Search tables and columns
- View table schemas
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
