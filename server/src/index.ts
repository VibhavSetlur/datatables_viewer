/**
 * DataTables Viewer - Fast SQLite Service with Caching
 * 
 * Provides fast server-side SQLite querying with connection caching,
 * automatic indexing, and lifespan management.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createObjectsRouter } from './routes/objects.js';
import { createTableDataRouter } from './routes/table-data.js';
import { createSchemaRouter } from './routes/schema.js';
import { createAggregateRouter } from './routes/aggregate.js';
import { closeAllDatabases, getCacheStats } from './services/sqlite-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Get directories from environment or use defaults
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '../../../public/config');
const ROOT_DIR = path.join(__dirname, '../..');

console.log(`[Server] DataTables Viewer - Fast SQLite Service`);
console.log(`[Server] Data directory: ${DATA_DIR}`);
console.log(`[Server] Config directory: ${CONFIG_DIR}`);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// TableScanner-compatible query endpoints (server-side with caching)
app.use('/object', createObjectsRouter(DATA_DIR, CONFIG_DIR));
app.use('/table-data', createTableDataRouter(DATA_DIR, CONFIG_DIR));
app.use('/schema', createSchemaRouter(DATA_DIR));
app.use('/api/aggregate', createAggregateRouter(DATA_DIR));

// Serve static database files (for direct download if needed)
app.use('/data', express.static(DATA_DIR, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.db')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', 'inline');
        }
    }
}));

// Serve static config files (including versions)
app.use('/config', express.static(CONFIG_DIR));

// Serve the built application (if built) or use Vite dev server
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(ROOT_DIR, 'dist')));
} else {
    app.use(express.static(path.join(ROOT_DIR, 'public')));
}

// Health check with cache stats
app.get('/health', (req, res) => {
    const stats = getCacheStats();
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        mode: 'cached_sqlite',
        data_dir: DATA_DIR,
        config_dir: CONFIG_DIR,
        cache: {
            databases_cached: stats.count,
            databases: stats.databases
        }
    });
});

// Cache stats endpoint
app.get('/cache/stats', (req, res) => {
    res.json(getCacheStats());
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, closing databases...');
    closeAllDatabases();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[Server] SIGINT received, closing databases...');
    closeAllDatabases();
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log(`[Server] DataTables Viewer running on http://localhost:${PORT}`);
            console.log(`[Server] Query endpoints:`);
            console.log(`  - GET  /object/{db_name}/tables`);
            console.log(`  - GET  /object/{db_name}/tables/{table}/data`);
            console.log(`  - GET  /object/{db_name}/tables/{table}/stats`);
            console.log(`  - POST /table-data`);
            console.log(`  - POST /api/aggregate/{db_name}/tables/{table}`);
            console.log(`  - GET  /schema/{db_name}/tables`);
            console.log(`  - GET  /schema/{db_name}/tables/{table}`);
    console.log(`[Server] Static files:`);
    console.log(`  - /data/*.db`);
    console.log(`  - /config/*.json`);
    console.log(`[Server] Cache management:`);
    console.log(`  - Database lifespan: 30 minutes of inactivity`);
    console.log(`  - Auto-cleanup: Every 5 minutes`);
    console.log(`  - GET /health - Health check with cache stats`);
    console.log(`  - GET /cache/stats - Detailed cache statistics`);
});
