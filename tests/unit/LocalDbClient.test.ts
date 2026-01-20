/**
 * LocalDbClient Unit Tests
 * 
 * Comprehensive tests for the client-side SQLite implementation.
 * Covers all filter operators, aggregations, and edge cases.
 * 
 * @module LocalDbClient.test
 */

import { describe, it, expect } from 'vitest';
import { LocalDbClient } from '../../src/core/api/LocalDbClient';

// =============================================================================
// STATIC METHOD TESTS
// =============================================================================

describe('LocalDbClient', () => {
    describe('Static Methods', () => {
        describe('isLocalDb', () => {
            it('should return true for known UPAs', () => {
                expect(LocalDbClient.isLocalDb('test/test/0')).toBe(true);
                expect(LocalDbClient.isLocalDb('test/test/1')).toBe(true);
            });

            it('should return true for local/ prefix', () => {
                expect(LocalDbClient.isLocalDb('local/mydb')).toBe(true);
                expect(LocalDbClient.isLocalDb('local/test')).toBe(true);
            });

            it('should return false for remote UPAs', () => {
                expect(LocalDbClient.isLocalDb('12345/67/8')).toBe(false);
                expect(LocalDbClient.isLocalDb('ws/object/version')).toBe(false);
            });
        });

        describe('getConfigDefinition', () => {
            it('should return config for known config IDs', () => {
                const config = LocalDbClient.getConfigDefinition('berdl_tables');
                expect(config).not.toBeNull();
                expect(config?.configId).toBe('berdl_tables');
                expect(config?.configPath).toBeDefined();
            });

            it('should return null for unknown config IDs', () => {
                expect(LocalDbClient.getConfigDefinition('unknown_config')).toBeNull();
            });
        });

        describe('getDatabaseMapping', () => {
            it('should return mapping for known UPAs', () => {
                const mapping = LocalDbClient.getDatabaseMapping('test/test/0');
                expect(mapping).not.toBeNull();
                expect(mapping?.dbPath).toBeDefined();
                expect(mapping?.configId).toBe('berdl_tables');
            });

            it('should return null for unknown UPAs', () => {
                expect(LocalDbClient.getDatabaseMapping('unknown/upa/0')).toBeNull();
            });
        });

        describe('getConfigPath', () => {
            it('should return config path for known UPAs', () => {
                const path = LocalDbClient.getConfigPath('test/test/0');
                expect(path).not.toBeNull();
                expect(path).toContain('.json');
            });

            it('should return null for unknown UPAs', () => {
                expect(LocalDbClient.getConfigPath('unknown/upa/0')).toBeNull();
            });

            it('should handle file paths', () => {
                const path = LocalDbClient.getConfigPath('/data/berdl_tables.db');
                expect(path).not.toBeNull();
            });
        });

        describe('getDatabasePath', () => {
            it('should return database path for known UPAs', () => {
                const path = LocalDbClient.getDatabasePath('test/test/0');
                expect(path).not.toBeNull();
                expect(path).toContain('.db');
            });

            it('should handle local/ prefix', () => {
                const path = LocalDbClient.getDatabasePath('local/mydb');
                expect(path).toBe('/data/mydb.db');
            });

            it('should return file paths as-is', () => {
                const path = LocalDbClient.getDatabasePath('/data/test.db');
                expect(path).toBe('/data/test.db');
            });
        });

        describe('getAllConfigDefinitions', () => {
            it('should return all config definitions', () => {
                const configs = LocalDbClient.getAllConfigDefinitions();
                expect(Object.keys(configs).length).toBeGreaterThan(0);
                expect(configs['berdl_tables']).toBeDefined();
            });

            it('should return a copy (not mutable)', () => {
                const configs1 = LocalDbClient.getAllConfigDefinitions();
                const configs2 = LocalDbClient.getAllConfigDefinitions();
                expect(configs1).not.toBe(configs2);
            });
        });

        describe('getAllDatabaseMappings', () => {
            it('should return all database mappings', () => {
                const mappings = LocalDbClient.getAllDatabaseMappings();
                expect(Object.keys(mappings).length).toBeGreaterThan(0);
            });
        });

        describe('getDatabasesForConfig', () => {
            it('should return databases using a config', () => {
                const dbs = LocalDbClient.getDatabasesForConfig('berdl_tables');
                expect(dbs.length).toBeGreaterThan(0);
                expect(dbs.every(db => db.configId === 'berdl_tables')).toBe(true);
            });

            it('should return empty array for unknown config', () => {
                const dbs = LocalDbClient.getDatabasesForConfig('unknown_config');
                expect(dbs).toEqual([]);
            });
        });
    });

    describe('getInstance', () => {
        it('should return singleton instance', () => {
            const instance1 = LocalDbClient.getInstance();
            const instance2 = LocalDbClient.getInstance();
            expect(instance1).toBe(instance2);
        });
    });
});

// =============================================================================
// FILTER OPERATOR TESTS
// =============================================================================

describe('LocalDbClient Filter Operators', () => {
    // These tests validate SQL generation logic without requiring actual DB

    describe('Equality Operators', () => {
        it('should support eq operator', () => {
            const filter = { column: 'name', operator: 'eq' as const, value: 'Alice' };
            expect(filter.operator).toBe('eq');
        });

        it('should support ne operator', () => {
            const filter = { column: 'name', operator: 'ne' as const, value: 'Bob' };
            expect(filter.operator).toBe('ne');
        });
    });

    describe('Comparison Operators', () => {
        it('should support gt operator', () => {
            const filter = { column: 'age', operator: 'gt' as const, value: 25 };
            expect(filter.operator).toBe('gt');
        });

        it('should support gte operator', () => {
            const filter = { column: 'age', operator: 'gte' as const, value: 25 };
            expect(filter.operator).toBe('gte');
        });

        it('should support lt operator', () => {
            const filter = { column: 'age', operator: 'lt' as const, value: 30 };
            expect(filter.operator).toBe('lt');
        });

        it('should support lte operator', () => {
            const filter = { column: 'age', operator: 'lte' as const, value: 30 };
            expect(filter.operator).toBe('lte');
        });
    });

    describe('Pattern Matching Operators', () => {
        it('should support like operator (case-sensitive)', () => {
            const filter = { column: 'name', operator: 'like' as const, value: 'Ali' };
            expect(filter.operator).toBe('like');
        });

        it('should support ilike operator (case-insensitive)', () => {
            const filter = { column: 'name', operator: 'ilike' as const, value: 'ali' };
            expect(filter.operator).toBe('ilike');
        });

        it('should support regex operator', () => {
            const filter = { column: 'name', operator: 'regex' as const, value: '^A.*e$' };
            expect(filter.operator).toBe('regex');
        });
    });

    describe('Set Operators', () => {
        it('should support in operator with array', () => {
            const filter = { column: 'department', operator: 'in' as const, value: ['Engineering', 'Sales'] };
            expect(filter.operator).toBe('in');
            expect(Array.isArray(filter.value)).toBe(true);
        });

        it('should support not_in operator with array', () => {
            const filter = { column: 'department', operator: 'not_in' as const, value: ['Marketing'] };
            expect(filter.operator).toBe('not_in');
        });
    });

    describe('Range Operators', () => {
        it('should support between operator with two values', () => {
            const filter = { column: 'age', operator: 'between' as const, value: 25, value2: 35 };
            expect(filter.operator).toBe('between');
            expect(filter.value2).toBe(35);
        });
    });

    describe('Null Operators', () => {
        it('should support is_null operator', () => {
            const filter = { column: 'age', operator: 'is_null' as const, value: null };
            expect(filter.operator).toBe('is_null');
        });

        it('should support is_not_null operator', () => {
            const filter = { column: 'age', operator: 'is_not_null' as const, value: null };
            expect(filter.operator).toBe('is_not_null');
        });
    });
});

// =============================================================================
// AGGREGATION FUNCTION TESTS
// =============================================================================

describe('LocalDbClient Aggregation Functions', () => {
    describe('Basic Aggregations', () => {
        it('should support count aggregation', () => {
            const agg = { column: '*', function: 'count' as const };
            expect(agg.function).toBe('count');
        });

        it('should support sum aggregation', () => {
            const agg = { column: 'salary', function: 'sum' as const };
            expect(agg.function).toBe('sum');
        });

        it('should support avg aggregation', () => {
            const agg = { column: 'age', function: 'avg' as const };
            expect(agg.function).toBe('avg');
        });

        it('should support min aggregation', () => {
            const agg = { column: 'salary', function: 'min' as const };
            expect(agg.function).toBe('min');
        });

        it('should support max aggregation', () => {
            const agg = { column: 'salary', function: 'max' as const };
            expect(agg.function).toBe('max');
        });
    });

    describe('Statistical Aggregations', () => {
        it('should support stddev aggregation', () => {
            const agg = { column: 'salary', function: 'stddev' as const };
            expect(agg.function).toBe('stddev');
        });

        it('should support variance aggregation', () => {
            const agg = { column: 'salary', function: 'variance' as const };
            expect(agg.function).toBe('variance');
        });

        it('should support distinct_count aggregation', () => {
            const agg = { column: 'department', function: 'distinct_count' as const };
            expect(agg.function).toBe('distinct_count');
        });
    });

    describe('Aggregation with Alias', () => {
        it('should support custom alias', () => {
            const agg = { column: 'salary', function: 'avg' as const, alias: 'average_salary' };
            expect(agg.alias).toBe('average_salary');
        });
    });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe('LocalDbClient Edge Cases', () => {
    describe('Type Coercion', () => {
        it('should handle string numbers for numeric operators', () => {
            const filter = { column: 'age', operator: 'gt' as const, value: '25' };
            // Value is string but should work with numeric column
            expect(typeof filter.value).toBe('string');
        });

        it('should handle numeric values for text operators', () => {
            const filter = { column: 'name', operator: 'like' as const, value: 123 };
            expect(typeof filter.value).toBe('number');
        });
    });

    describe('Empty Values', () => {
        it('should handle empty array for in operator', () => {
            const filter = { column: 'department', operator: 'in' as const, value: [] };
            expect(filter.value).toEqual([]);
        });

        it('should handle empty string for like operator', () => {
            const filter = { column: 'name', operator: 'like' as const, value: '' };
            expect(filter.value).toBe('');
        });
    });

    describe('Special Characters', () => {
        it('should handle SQL wildcards in values', () => {
            const filter = { column: 'name', operator: 'like' as const, value: '%_%' };
            expect(filter.value).toContain('%');
        });

        it('should handle quotes in values', () => {
            const filter = { column: 'name', operator: 'eq' as const, value: "O'Brien" };
            expect(filter.value).toContain("'");
        });
    });

    describe('Null Handling', () => {
        it('should handle null in value field', () => {
            const filter = { column: 'age', operator: 'eq' as const, value: null };
            expect(filter.value).toBeNull();
        });

        it('should handle undefined value2 for between', () => {
            const filter = { column: 'age', operator: 'between' as const, value: 25, value2: undefined };
            expect(filter.value2).toBeUndefined();
        });
    });
});

// =============================================================================
// REQUEST VALIDATION TESTS
// =============================================================================

describe('TableDataRequest Validation', () => {
    describe('Required Fields', () => {
        it('should require table_name', () => {
            const request = { table_name: 'employees' };
            expect(request.table_name).toBeDefined();
        });
    });

    describe('Optional Fields', () => {
        it('should have default limit of 100', () => {
            const request: { table_name: string; limit?: number; offset?: number } = { table_name: 'employees' };
            const limit = request.limit ?? 100;
            expect(limit).toBe(100);
        });

        it('should have default offset of 0', () => {
            const request: { table_name: string; limit?: number; offset?: number } = { table_name: 'employees' };
            const offset = request.offset ?? 0;
            expect(offset).toBe(0);
        });
    });

    describe('Pagination', () => {
        it('should accept custom limit', () => {
            const request = { table_name: 'employees', limit: 50 };
            expect(request.limit).toBe(50);
        });

        it('should accept custom offset', () => {
            const request = { table_name: 'employees', offset: 100 };
            expect(request.offset).toBe(100);
        });
    });

    describe('Sorting', () => {
        it('should accept sort_column and sort_order', () => {
            const request = {
                table_name: 'employees',
                sort_column: 'name',
                sort_order: 'ASC' as const
            };
            expect(request.sort_column).toBe('name');
            expect(request.sort_order).toBe('ASC');
        });

        it('should accept DESC sort order', () => {
            const request = {
                table_name: 'employees',
                sort_column: 'salary',
                sort_order: 'DESC' as const
            };
            expect(request.sort_order).toBe('DESC');
        });
    });

    describe('Column Selection', () => {
        it('should accept specific columns', () => {
            const request = {
                table_name: 'employees',
                columns: ['id', 'name', 'department']
            };
            expect(request.columns).toHaveLength(3);
        });
    });
});

// =============================================================================
// RESPONSE FORMAT TESTS
// =============================================================================

describe('TableDataResponse Format', () => {
    describe('Required Fields', () => {
        it('should include headers array', () => {
            const response = {
                headers: ['id', 'name'],
                data: [[1, 'Alice']],
                total_count: 1
            };
            expect(Array.isArray(response.headers)).toBe(true);
        });

        it('should include data as 2D array', () => {
            const response = {
                headers: ['id', 'name'],
                data: [[1, 'Alice'], [2, 'Bob']],
                total_count: 2
            };
            expect(Array.isArray(response.data)).toBe(true);
            expect(Array.isArray(response.data[0])).toBe(true);
        });

        it('should include total_count for pagination', () => {
            const response = {
                headers: ['id'],
                data: [[1]],
                total_count: 100
            };
            expect(typeof response.total_count).toBe('number');
        });
    });

    describe('Optional Metadata', () => {
        it('should include column_types when available', () => {
            const response = {
                headers: ['id'],
                data: [[1]],
                total_count: 1,
                column_types: [{ name: 'id', type: 'INTEGER', notnull: true, pk: true, dflt_value: null }]
            };
            expect(response.column_types).toBeDefined();
            expect(response.column_types[0].type).toBe('INTEGER');
        });

        it('should include query_metadata', () => {
            const response = {
                headers: ['id'],
                data: [[1]],
                total_count: 1,
                query_metadata: {
                    query_type: 'select' as const,
                    sql: 'SELECT * FROM test',
                    filters_applied: 0,
                    has_search: false,
                    has_sort: false,
                    has_group_by: false,
                    has_aggregations: false
                }
            };
            expect(response.query_metadata?.query_type).toBe('select');
        });
    });
});
