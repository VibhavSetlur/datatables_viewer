# DataTables Viewer

Production-grade, configurable data table viewer for research applications with client-side SQLite support and TableScanner service integration.

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)

## Overview

DataTables Viewer is a high-performance table viewer designed for researchers working with SQLite databases (20-200MB). It features:

-  **Fast Query Performance** - Client-side SQLite via `sql.js` or TableScanner service with caching
-  **Flexible Deployment** - Static frontend + optional TableScanner service
-  **Advanced Filtering** - Multiple operators, aggregations, column statistics
-  **Local Database Support** - Client-side SQLite via `sql.js` for testing (no server needed)
-  **Rich Transformers** - Links, badges, heatmaps, sequences, ontologies
- ⌨ **Keyboard Navigation** - Full keyboard support
-  **Dark Mode** - Light, dark, and system themes
-  **Export** - CSV, JSON, TSV export
-  **Schema Explorer** - Live schema fetch per table with real SQL types, PK/Not-Null badges, search, and manual refresh

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open browser
open http://localhost:5173
```

### Load Database via URL

Open a database directly via URL parameter:

```
http://localhost:5173/?db=filename
```

This loads:
- Database: `/data/filename.db`
- Config: `/config/filename.json` (optional)

### Production Build

```bash
# Build static files
npm run build

# Output: dist/ folder (ready to deploy)
```

## Architecture

### Two Data Access Modes

1. **Client-Side (LocalDbClient)**: Uses `sql.js` for local databases (no server needed)
2. **TableScanner Service**: External API service for KBase objects and remote databases

The frontend automatically detects and uses:
- TableScanner service (if `VITE_API_URL` is set)
- LocalDbClient (fallback for local databases via `sql.js`)

### Components

- **Frontend**: TypeScript SPA (Vite) → builds to static HTML/JS/CSS
- **LocalDbClient**: Client-side SQLite for local databases (no server needed)
- **TableScanner Service**: External API service (separate deployment) - see [TableScanner](https://github.com/kbase/tablescanner/tree/ai-integration)

## Features

### Performance Optimizations

- **Client-Side SQLite**: Direct database access via `sql.js` (no network overhead)
- **TableScanner Integration**: Server-side caching, FTS5 search, prepared statements (via TableScanner service)
- **Efficient Rendering**: Code splitting, lazy loading, virtual scrolling

### Advanced Query Features

- **Filtering**: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `not_in`, `between`, `is_null`, `is_not_null`, `regex`
- **Aggregations**: `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `STDDEV`, `VARIANCE`, `DISTINCT_COUNT`
- **Grouping**: `GROUP BY` support for statistical analysis
- **Column Statistics**: Pre-computed stats (min, max, mean, median, stddev) - via TableScanner

### UI Features

- **Performance Indicators**: Shows cached status and query execution time
- **Column Statistics**: View detailed column stats via sidebar button
- **Schema Explorer**: Browse database structure
- **Category Management**: Group and toggle column visibility
- **Cell Transformers**: Links, badges, heatmaps, sequences, ontologies

## Deployment

### Static Frontend Deployment

The frontend builds to static files that can be deployed anywhere:

```bash
# Build with TableScanner API URL (for separate deployment)
VITE_API_URL=https://appdev.kbase.us/services/berdl_table_scanner npm run build

# Deploy dist/ folder to:
# - CDN (CloudFlare, AWS CloudFront)
# - Static hosting (Netlify, Vercel, GitHub Pages)
# - Web server (Nginx, Apache)
# - Jupyter environment
```

### TableScanner Service Deployment

For production use with KBase objects or remote databases, deploy the [TableScanner service](https://github.com/kbase/tablescanner/tree/ai-integration) separately:

```bash
# See TableScanner repository for deployment instructions
# https://github.com/kbase/tablescanner/tree/ai-integration
```

The TableScanner service provides:
- Server-side SQLite querying with caching
- Connection pooling and performance optimizations
- FTS5 full-text search
- Column statistics
- Aggregations and advanced filtering

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Configuration

### Database Files

Place database files in `/data/` directory:
```
data/
  ├── mydb.db
  └── another.db
```

### Config Files (Optional)

Place JSON config files in `/config/` directory:
```
config/
  ├── mydb.json
  └── another.json
```

Config files define table layouts, column transforms, and categories. See [docs/CONFIG_MANAGEMENT.md](docs/CONFIG_MANAGEMENT.md).

### URL Parameters

- `?db=filename` - Load database (without .db extension)
- Example: `?db=mydb` loads `/data/mydb.db` and `/config/mydb.json`

## API Endpoints

The viewer is compatible with TableScanner API:

- `GET /object/{db_name}/tables` - List tables
- `GET /object/{db_name}/tables/{table}/data` - Get table data
- `POST /table-data` - Query table data
- `GET /schema/{db_name}/tables` - Get schema
- `GET /object/{db_name}/tables/{table}/stats` - Column statistics
- `POST /api/aggregate/{db_name}/tables/{table}` - Aggregations

## Project Structure

```
DataTables_Viewer/
├── dist/                      # Built static files (tracked in git)
├── public/
│   ├── data/                  # Database files (NOT in git)
│   └── config/                 # JSON configuration files
├── src/
│   ├── main.ts                # Entry point
│   ├── core/
│   │   ├── api/               # API clients (ApiClient, LocalDbClient)
│   │   ├── managers/          # Feature managers
│   │   └── state/             # State management
│   ├── ui/                    # UI components
│   └── utils/                 # Utilities
├── scripts/                    # Config management scripts
└── docs/                       # Documentation
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm test` | Run tests |
| `npm run validate-config` | Validate config JSON |
| `npm run typecheck` | TypeScript type checking |
| `npm run generate-config` | Generate config from database |

## Documentation

| Document | Description |
|----------|-------------|
| [docs/QUICK_START.md](docs/QUICK_START.md) | Get started in 5 minutes |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment guide (static frontend + TableScanner service) |
| [docs/FEATURES.md](docs/FEATURES.md) | Complete feature list |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture overview |
| [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) | Architecture and extending the viewer |
| [docs/API_RESPONSES.md](docs/API_RESPONSES.md) | API response format documentation |
| [docs/CONFIG_MANAGEMENT.md](docs/CONFIG_MANAGEMENT.md) | Managing configurations |
| [docs/TESTING.md](docs/TESTING.md) | Testing guide |
| [docs/ADDING_DATABASES.md](docs/ADDING_DATABASES.md) | Adding new databases |
| [docs/ADDING_TYPES.md](docs/ADDING_TYPES.md) | Adding new data types |
| [docs/DATABASE_MAPPING.md](docs/DATABASE_MAPPING.md) | Database-to-config mapping guide |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.
