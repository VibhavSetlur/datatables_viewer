import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [resolve(__dirname, './tests/setup.ts')],
        include: ['tests/**/*.test.ts'],
        exclude: ['tests/e2e/**', 'node_modules'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'text-summary', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.d.ts',
                'src/main.ts',
                'src/vite-env.d.ts',
                'node_modules'
            ],
            thresholds: {
                statements: 70,
                branches: 60,
                functions: 70,
                lines: 70
            }
        },
        testTimeout: 10000,
        hookTimeout: 10000
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            '@core': resolve(__dirname, './src/core'),
            '@ui': resolve(__dirname, './src/ui'),
            '@utils': resolve(__dirname, './src/utils'),
            '@types': resolve(__dirname, './src/types')
        }
    }
});
