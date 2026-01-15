# Deployment Guide

## Overview

DataTables Viewer supports flexible deployment options:

1. **Static Frontend Only**: Lightweight HTML/JS/CSS (no server needed)
2. **Integrated Deployment**: Frontend + server together (development/local)
3. **Separate Deployment**: Static frontend + remote API service (production)

## Separate Deployment (Recommended for Production)

### Frontend (Static Site)

The frontend is a **lightweight static site** (HTML/JS/CSS) that can be deployed anywhere:

#### Build the Frontend

```bash
# Build static files
npm run build

# Output: dist/ folder contains all static files
# - index.html
# - assets/ (JS, CSS bundles)
```

#### Deploy Static Files

Deploy the `dist/` folder to:
- **CDN**: CloudFlare, AWS CloudFront, etc.
- **Static Hosting**: Netlify, Vercel, GitHub Pages
- **Web Server**: Nginx, Apache (just serve the `dist/` folder)
- **S3**: AWS S3 + CloudFront

#### Configure API URL

Set the API service URL using environment variable:

```bash
# During build
VITE_API_URL=https://api.example.com npm run build

# Or set in .env file
echo "VITE_API_URL=https://api.example.com" > .env
npm run build
```

The built files will have the API URL baked in.

### Backend (API Service)

Deploy the server separately (in `/server` directory):

```bash
cd server
npm install
npm run build

# Run with environment variables
DATA_DIR=/path/to/databases \
CONFIG_DIR=/path/to/configs \
PORT=3000 \
npm start
```

Or use Docker, PM2, systemd, etc.

## Deployment Scenarios

### Scenario 1: Static Frontend + Separate API

**Frontend:**
- Build: `npm run build`
- Deploy `dist/` to CDN/static host
- Set `VITE_API_URL=https://your-api-service.com`

**Backend:**
- Deploy `/server` to your server/cloud
- Expose API endpoints
- Frontend calls the remote API

### Scenario 2: Integrated (Current)

**Both together:**
- Frontend serves from integrated server
- Server handles both static files and API
- Good for development/local use

## API Endpoints Required

The frontend expects these endpoints (TableScanner-compatible):

- `GET /object/{db_name}/tables` - List tables
- `GET /object/{db_name}/tables/{table}/data` - Get table data
- `POST /table-data` - Query table data
- `GET /schema/{db_name}/tables` - Get schema
- `GET /object/{db_name}/tables/{table}/stats` - Column statistics
- `POST /api/aggregate/{db_name}/tables/{table}` - Aggregations

## Environment Variables

### Frontend Build
- `VITE_API_URL` - API service URL (e.g., `https://api.example.com`)

### Backend Runtime
- `DATA_DIR` - Path to database files
- `CONFIG_DIR` - Path to config JSON files
- `PORT` - Server port (default: 3000)

## Example: Deploy to Netlify + Separate API

1. **Build frontend:**
   ```bash
   VITE_API_URL=https://api.yourservice.com npm run build
   ```

2. **Deploy to Netlify:**
   - Connect GitHub repo
   - Build command: `VITE_API_URL=https://api.yourservice.com npm run build`
   - Publish directory: `dist`

3. **Deploy API separately:**
   - Deploy `/server` to your cloud provider
   - Set `DATA_DIR` and `CONFIG_DIR`
   - Frontend automatically calls the API

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
- Work entirely client-side (no server needed)

## Benefits of Separate Deployment

✅ **Lightweight Frontend**: Just static files, no server needed  
✅ **Scalable**: Frontend on CDN, API on dedicated servers  
✅ **Flexible**: Update frontend/backend independently  
✅ **Cost-Effective**: Static hosting is cheap/free  
✅ **Fast**: CDN delivery for frontend assets  
✅ **Jupyter Compatible**: Works in Jupyter environment without server  
