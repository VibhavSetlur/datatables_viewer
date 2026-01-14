/**
 * Vite Configuration
 * 
 * Configures the development server and build process for the DataTables Viewer.
 * Includes special handling for sql.js (SQLite in browser) compatibility.
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // Serve the public directory for static assets
    publicDir: 'public',

    // Development server configuration
    server: {
        fs: {
            // Allow serving files from data directory for local SQLite files
            allow: ['.', 'data']
        }
    },

    // Build configuration
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html')
            }
        }
    },

    // Dependency optimization
    optimizeDeps: {
        // Include sql.js in optimization to fix ESM/CJS interop
        include: ['sql.js']
    },

    // Handle .db files as static assets
    assetsInclude: ['**/*.db'],

    // ESBuild configuration for CommonJS compatibility
    esbuild: {
        // Ensure proper handling of CommonJS modules
        format: 'esm'
    }
});
