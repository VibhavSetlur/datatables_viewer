# Quick Start Guide

Get DataTables Viewer running in 5 minutes.

## Prerequisites

- Node.js 18+ and npm 9+
- A SQLite database file (`.db`)

## Installation

```bash
# Clone repository
git clone <repo-url>
cd DataTables_Viewer

# Install dependencies
npm install
```

## Running Locally

### 1. Start Development Server

```bash
npm run dev
```

Opens at `http://localhost:5173`

### 2. Add Database Files

Place your database files in `public/data/`:

```bash
# Create data directory
mkdir -p public/data

# Copy your database
cp /path/to/your/database.db public/data/mydb.db
```

### 3. Add Config (Optional)

Create a JSON config file in `public/config/`:

```bash
# Create config directory
mkdir -p public/config

# Create config file
cat > public/config/mydb.json << 'EOF'
{
  "id": "mydb",
  "name": "My Database",
  "tables": {
    "my_table": {
      "displayName": "My Table",
      "columns": [
        {
          "column": "id",
          "displayName": "ID"
        }
      ]
    }
  }
}
EOF
```

### 4. Open Database

Navigate to:
```
http://localhost:5173/?db=mydb
```

The viewer will load:
- Database: `public/data/mydb.db`
- Config: `public/config/mydb.json` (if exists)

## Using the Integrated Server (Optional)

For better performance with caching:

```bash
# Start the integrated server
cd server
npm install
npm start

# Server runs on http://localhost:3000
# Frontend automatically uses it if available
```

## Production Build

```bash
# Build static files
npm run build

# Output: dist/ folder
# Deploy dist/ to any static host
```

## Common Tasks

### Load Database via URL

```
http://localhost:5173/?db=filename
```

### View Column Statistics

1. Load a database
2. Click "Stats" button in sidebar
3. View detailed column statistics

### Export Data

1. Select rows (optional)
2. Click "Export" in sidebar
3. Choose format (CSV, JSON, TSV)

### Use Remote API

Set environment variable before building:

```bash
VITE_API_URL=https://api.example.com npm run build
```

## Troubleshooting

### Database Not Loading

- Check file exists: `public/data/filename.db`
- Check file permissions
- Check browser console for errors

### Config Not Loading

- Config is optional - viewer works without it
- Check file exists: `public/config/filename.json`
- Validate JSON syntax

### Server Not Available

- Frontend falls back to client-side SQLite automatically
- Check server logs if using integrated server
- Verify `DATA_DIR` and `CONFIG_DIR` environment variables

## Next Steps

- Read [CONFIG_MANAGEMENT.md](CONFIG_MANAGEMENT.md) for advanced configuration
- Read [DEPLOYMENT.md](../DEPLOYMENT.md) for production deployment
- Read [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for extending functionality
