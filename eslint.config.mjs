/**
 * ESLint Configuration (Flat Config Format)
 * 
 * Modern ESLint configuration for TypeScript projects.
 * Uses the flat config format introduced in ESLint 9.
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
    // Base JavaScript recommended rules
    js.configs.recommended,

    // TypeScript recommended rules
    ...tseslint.configs.recommended,

    // Global configuration
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.es2022,
                ...globals.node
            },
            parserOptions: {
                project: './tsconfig.json'
            }
        }
    },

    // Source files configuration
    {
        files: ['src/**/*.ts'],
        rules: {
            // TypeScript-specific rules
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-non-null-assertion': 'warn',

            // General code quality
            'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'always', { null: 'ignore' }],

            // Best practices
            'no-duplicate-imports': 'error',
            'no-template-curly-in-string': 'warn'
        }
    },

    // Test files configuration
    {
        files: ['tests/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'no-console': 'off'
        }
    },

    // Script files configuration
    {
        files: ['scripts/**/*.ts'],
        rules: {
            'no-console': 'off'
        }
    },

    // Ignore patterns
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            '*.js',
            '*.cjs',
            'vite.config.ts',
            'vitest.config.ts',
            'archive/**'
        ]
    }
);
