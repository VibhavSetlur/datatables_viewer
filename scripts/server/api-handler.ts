#!/usr/bin/env node
/**
 * API Handler for TableScanner
 * 
 * Receives POST requests from TableScanner and saves configs to public/config/
 * Can be used as a simple HTTP server or called directly
 * 
 * Usage as server:
 *   node scripts/api-handler.js
 * 
 * Usage as script:
 *   echo '{"object_type":"...","config":{...}}' | node scripts/api-handler.js
 */

import { readFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAVE_SCRIPT = join(__dirname, '../config/save-config.ts');

/**
 * Handle config save request
 */
async function handleConfigSave(configData: any): Promise<void> {
    return new Promise((resolve, reject) => {
        // Use node with tsx loader from root node_modules
        const rootDir = join(__dirname, '../..');
        const tsxPath = join(rootDir, 'node_modules', '.bin', 'tsx');
        const nodePath = process.execPath;

        // Try to use tsx from root, fallback to npx
        const command = require('fs').existsSync(tsxPath) ? nodePath : 'npx';
        const args = require('fs').existsSync(tsxPath)
            ? [tsxPath, SAVE_SCRIPT]
            : ['tsx', SAVE_SCRIPT];

        const child = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: rootDir, // Run from root to access node_modules
        });

        child.stdin.write(JSON.stringify(configData));
        child.stdin.end();

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(stdout);
                resolve();
            } else {
                console.error(stderr);
                reject(new Error(`Process exited with code ${code}`));
            }
        });
    });
}

/**
 * Main function
 */
async function main() {
    // Check if running as server or script
    const isServer = process.argv.includes('--server');

    if (isServer) {
        // Simple HTTP server mode
        const http = await import('http');

        const server = http.createServer(async (req, res) => {
            if (req.method === 'POST' && req.url === '/api/configs') {
                let body = '';

                req.on('data', (chunk) => {
                    body += chunk.toString();
                });

                req.on('end', async () => {
                    try {
                        const configData = JSON.parse(body);
                        await handleConfigSave(configData);

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'stored',
                            message: 'Config saved successfully',
                        }));
                    } catch (error: any) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            error: 'Failed to save config',
                            message: error.message,
                        }));
                    }
                });
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        });

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`Config API handler listening on http://localhost:${PORT}`);
            console.log(`POST configs to: http://localhost:${PORT}/api/configs`);
        });
    } else {
        // Script mode - read from stdin
        let input = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
            input += chunk;
        });
        process.stdin.on('end', async () => {
            try {
                const configData = JSON.parse(input);
                await handleConfigSave(configData);
                process.exit(0);
            } catch (error: any) {
                console.error(`Error: ${error.message}`);
                process.exit(1);
            }
        });
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
