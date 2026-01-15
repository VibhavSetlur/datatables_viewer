# Deployment Guide

## Overview

DataTables Viewer supports flexible deployment options:

1. **Static Frontend Only**: Lightweight HTML/JS/CSS with client-side SQLite (no server needed)
2. **Static Frontend + TableScanner Service**: Frontend on CDN + separate TableScanner API service

## Deployment Mode 1: Static Frontend Only (Client-Side)

### Use Case
- Testing and development
- Jupyter environment
- Offline use
- Local databases only

### Build the Frontend

```bash
# Build static files
npm run build

# Output: dist/ folder contains all static files
# - index.html
# - assets/ (JS, CSS bundles)
```

### Deploy Static Files

Deploy the `dist/` folder to:
- **CDN**: CloudFlare, AWS CloudFront, etc.
- **Static Hosting**: Netlify, Vercel, GitHub Pages
- **Web Server**: Nginx, Apache (just serve the `dist/` folder)
- **S3**: AWS S3 + CloudFront
- **Jupyter Environment**: Mount `dist/` folder

### Add Database Files

Place database files in `public/data/` directory (or mount external directory):

```
public/data/
  ├── mydb.db
  └── another.db
```

### Access Databases

Open databases via URL parameter:
```
http://your-domain/?db=mydb
```

The viewer uses **LocalDbClient** (client-side `sql.js`) to load and query databases directly in the browser - **no server required**.

## Deployment Mode 2: Static Frontend + TableScanner Service

### Use Case
- Production deployment
- KBase integration
- Remote databases
- Server-side caching and optimizations

### Frontend (Static Site)

#### Build the Frontend

```bash
# Build with TableScanner API URL
VITE_API_URL=https://appdev.kbase.us/services/berdl_table_scanner npm run build

# Or set in .env file
echo "VITE_API_URL=https://appdev.kbase.us/services/berdl_table_scanner" > .env
npm run build
```

The built files will have the TableScanner API URL baked in.

#### Deploy Static Files

Deploy the `dist/` folder to:
- **CDN**: CloudFlare, AWS CloudFront
- **Static Hosting**: Netlify, Vercel, GitHub Pages
- **Web Server**: Nginx, Apache

### TableScanner Service (Backend)

Deploy the [TableScanner service](https://github.com/kbase/tablescanner/tree/ai-integration) separately:

```bash
# See TableScanner repository for deployment
# https://github.com/kbase/tablescanner/tree/ai-integration

# TableScanner provides:
# - Server-side SQLite querying
# - Connection pooling and caching
# - FTS5 full-text search
# - Column statistics
# - Aggregations
```

The TableScanner service runs independently and provides the API endpoints that the frontend calls.

## Deployment Scenarios

### Scenario 1: Static Frontend Only (Client-Side)

**Frontend:**
- Build: `npm run build`
- Deploy `dist/` to CDN/static host
- Databases in `public/data/` directory
- Uses LocalDbClient (sql.js) - no server needed

**Use Cases:**
- Jupyter environment
- Local testing
- Offline use
- Small-medium databases (20-200MB)

### Scenario 2: Static Frontend + TableScanner Service

**Frontend:**
- Build: `VITE_API_URL=https://api.example.com npm run build`
- Deploy `dist/` to CDN/static host
- Set `VITE_API_URL` to TableScanner service URL

**Backend:**
- Deploy TableScanner service separately
- Expose API endpoints
- Frontend calls the remote TableScanner API

**Use Cases:**
- Production deployment
- KBase integration
- Remote databases
- Server-side optimizations

## API Endpoints Required

The frontend expects these endpoints (TableScanner-compatible):

- `GET /object/{db_name}/tables` - List tables
- `GET /object/{db_name}/tables/{table}/data` - Get table data
- `POST /table-data` - Query table data
- `GET /schema/{db_name}/tables` - Get schema
- `GET /object/{db_name}/tables/{table}/stats` - Column statistics
- `POST /api/aggregate/{db_name}/tables/{table}` - Aggregations

These are provided by the TableScanner service.

## Environment Variables

### Frontend Build
- `VITE_API_URL` - TableScanner service URL (e.g., `https://appdev.kbase.us/services/berdl_table_scanner`)

### TableScanner Service
See [TableScanner documentation](https://github.com/kbase/tablescanner/tree/ai-integration) for service configuration.

## Example: Deploy to Netlify + TableScanner Service

1. **Build frontend:**
   ```bash
   VITE_API_URL=https://appdev.kbase.us/services/berdl_table_scanner npm run build
   ```

2. **Deploy to Netlify:**
   - Connect GitHub repo
   - Build command: `VITE_API_URL=https://appdev.kbase.us/services/berdl_table_scanner npm run build`
   - Publish directory: `dist`

3. **Deploy TableScanner separately:**
   - Deploy TableScanner service to your cloud provider
   - Frontend automatically calls the TableScanner API

## Deployment to Jupyter Environment

For testing in Jupyter on Poplar:

### 1. Build Static Files

```bash
npm run build
```

### 2. Deploy dist/ Folder

Copy `dist/` folder to Jupyter environment:
- Mount shared directory to `/data/` and `/config/`
- Serve `dist/` folder via Jupyter

### 3. Add Database Files

Place files in mounted directory:
```
/data/mydb.db
/config/mydb.json (optional)
```

### 4. Access via URL

```
http://jupyter-url/?db=mydb
```

The viewer will:
- Load database from `/data/mydb.db`
- Load config from `/config/mydb.json` (if exists)
- Work entirely client-side using LocalDbClient (no server needed)

## Benefits of Each Deployment Mode

### Static Frontend Only

✅ **No Server Required** - Works entirely client-side  
✅ **Simple Deployment** - Just static files  
✅ **Offline Capable** - No network needed after initial load  
✅ **Jupyter Compatible** - Perfect for Jupyter environment  
✅ **Fast for Local DBs** - Direct file access via sql.js  

### Static Frontend + TableScanner Service

✅ **Server-Side Optimizations** - Caching, connection pooling  
✅ **KBase Integration** - Access KBase objects  
✅ **Remote Databases** - Query databases on server  
✅ **Scalable** - Frontend on CDN, API on dedicated servers  
✅ **Production Ready** - Full feature set with server-side caching  

## Routing Logic

The frontend automatically routes requests:

1. **Local Database** (UPA starts with `local/` or in `DATABASE_MAPPINGS`):
   - If `VITE_API_URL` is set → Try TableScanner service first
   - If TableScanner fails or not configured → Use LocalDbClient (sql.js)

2. **Remote Database** (KBase object UPA):
   - Always use TableScanner service (configured via `VITE_API_URL`)

3. **Fallback**:
   - If TableScanner fails → Fall back to LocalDbClient (if local database)
