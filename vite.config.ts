import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // Serve the data directory for local SQLite files
    publicDir: 'public',
    server: {
        fs: {
            // Allow serving files from data directory
            allow: ['.', 'data']
        }
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html')
            }
        }
    },
    // Optimizations for sql.js
    optimizeDeps: {
        exclude: ['sql.js']
    },
    // Handle the data directory as static assets
    assetsInclude: ['**/*.db']
});
