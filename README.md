# DataTables Viewer

Production-grade, configurable data table viewer for research applications with integrated SQLite query optimization and caching.

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)

## Overview

DataTables Viewer is a high-performance table viewer designed for researchers working with SQLite databases (20-200MB). It features:

- 🚀 **Fast Query Performance** - Server-side caching, FTS5 search, prepared statements
- 📊 **Flexible Deployment** - Static frontend + optional separate API service
- 🔍 **Advanced Filtering** - Multiple operators, aggregations, column statistics
- 📁 **Local Database Support** - Client-side SQLite via `sql.js` for testing
- 🎨 **Rich Transformers** - Links, badges, heatmaps, sequences, ontologies
- ⌨️ **Keyboard Navigation** - Full keyboard support
- 🌙 **Dark Mode** - Light, dark, and system themes
- 📤 **Export** - CSV, JSON, TSV export

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

### Two Deployment Modes

1. **Integrated**: Frontend + server together (development/local)
2. **Separate**: Static frontend + remote API service (production)

The frontend automatically detects and uses:
- Remote API (if `VITE_API_URL` is set)
- Local integrated server (if available on localhost:3000)
- Client-side SQLite (fallback via `sql.js`)

### Components

- **Frontend**: TypeScript SPA (Vite) → builds to static HTML/JS/CSS
- **Backend** (optional): Express.js server with SQLite caching
- **LocalDbClient**: Client-side SQLite for testing (no server needed)

## Features

### Performance Optimizations

- **Query Result Caching**: 5-minute TTL, smart invalidation
- **FTS5 Full-Text Search**: Fast text search (100-1000x faster than LIKE)
- **Prepared Statement Caching**: Reuses queries for 20-50% faster execution
- **Connection Pooling**: 30-minute database connection lifespan
- **Automatic Indexing**: Creates indices on-demand for better performance

### Advanced Query Features

- **Filtering**: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `not_in`, `between`, `is_null`, `is_not_null`, `regex`
- **Aggregations**: `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `STDDEV`, `VARIANCE`, `DISTINCT_COUNT`
- **Grouping**: `GROUP BY` support for statistical analysis
- **Column Statistics**: Pre-computed stats (min, max, mean, median, stddev)

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
# Build with API URL (for separate deployment)
VITE_API_URL=https://api.example.com npm run build

# Deploy dist/ folder to:
# - CDN (CloudFlare, AWS CloudFront)
# - Static hosting (Netlify, Vercel, GitHub Pages)
# - Web server (Nginx, Apache)
# - Jupyter environment
```

### Server Deployment (Optional)

```bash
cd server
npm install

# Run with environment variables
DATA_DIR=/path/to/databases \
CONFIG_DIR=/path/to/configs \
PORT=3000 \
npm start
```

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
├── server/                     # Optional Express.js server
│   └── src/
│       ├── routes/             # API routes
│       └── services/           # SQLite service with caching
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

## Documentation

| Document | Description |
|----------|-------------|
| [docs/QUICK_START.md](docs/QUICK_START.md) | Get started in 5 minutes |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment guide (static frontend + separate API) |
| [docs/FEATURES.md](docs/FEATURES.md) | Complete feature list |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture overview |
| [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) | Architecture and extending the viewer |
| [docs/API.md](docs/API.md) | API reference |
| [docs/CONFIG_MANAGEMENT.md](docs/CONFIG_MANAGEMENT.md) | Managing configurations |
| [docs/TABLESCANNER_INTEGRATION.md](docs/TABLESCANNER_INTEGRATION.md) | TableScanner API compatibility |
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
