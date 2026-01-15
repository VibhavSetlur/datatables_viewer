/**
 * Smart Filter Parser
 * 
 * Parses user input into filter operations based on column type
 * Supports: <500, <=500, >500, >=500, =500, 500, !=500, etc.
 */

export type ColumnType = 'INTEGER' | 'REAL' | 'TEXT' | 'NUMERIC' | 'BLOB' | 'unknown';

export interface ParsedFilter {
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'not_in' | 'between' | 'is_null' | 'is_not_null';
    value: any;
    value2?: any;
    originalInput: string;
}

/**
 * Normalize SQLite type to standard type
 */
export function normalizeColumnType(sqliteType: string | null | undefined): ColumnType {
    if (!sqliteType) return 'unknown';
    
    const upper = sqliteType.toUpperCase();
    
    if (upper.includes('INT')) return 'INTEGER';
    if (upper.includes('REAL') || upper.includes('FLOAT') || upper.includes('DOUBLE') || upper.includes('DECIMAL')) return 'REAL';
    if (upper.includes('TEXT') || upper.includes('VARCHAR') || upper.includes('CHAR')) return 'TEXT';
    if (upper.includes('BLOB')) return 'BLOB';
    if (upper.includes('NUMERIC')) return 'NUMERIC';
    
    return 'unknown';
}

/**
 * Check if a type is numeric
 */
export function isNumericType(type: ColumnType): boolean {
    return type === 'INTEGER' || type === 'REAL' || type === 'NUMERIC';
}

/**
 * Parse filter input with smart operator detection
 */
export function parseFilterInput(input: string, columnType: ColumnType = 'TEXT'): ParsedFilter | null {
    if (!input || input.trim() === '') {
        return null;
    }

    const trimmed = input.trim();
    
    // Handle null checks
    if (trimmed.toLowerCase() === 'null' || trimmed === '') {
        return {
            operator: 'is_null',
            value: null,
            originalInput: trimmed
        };
    }

    // Handle not null
    if (trimmed.toLowerCase() === 'not null' || trimmed.toLowerCase() === '!null') {
        return {
            operator: 'is_not_null',
            value: null,
            originalInput: trimmed
        };
    }

    // Numeric operators: <, <=, >, >=, =, !=
    if (isNumericType(columnType)) {
        // Match operators at start: <500, <=500, >500, >=500, =500, !=500
        const operatorMatch = trimmed.match(/^(<=|>=|!=|<|>|=)(.+)$/);
        
        if (operatorMatch) {
            const [, op, valueStr] = operatorMatch;
            const numValue = parseFloat(valueStr.trim());
            
            if (isNaN(numValue)) {
                // Invalid number, fall back to text matching
                return parseTextFilter(trimmed);
            }

            switch (op) {
                case '<':
                    return { operator: 'lt', value: numValue, originalInput: trimmed };
                case '<=':
                    return { operator: 'lte', value: numValue, originalInput: trimmed };
                case '>':
                    return { operator: 'gt', value: numValue, originalInput: trimmed };
                case '>=':
                    return { operator: 'gte', value: numValue, originalInput: trimmed };
                case '=':
                    return { operator: 'eq', value: numValue, originalInput: trimmed };
                case '!=':
                    return { operator: 'ne', value: numValue, originalInput: trimmed };
            }
        }

        // No operator - try to parse as number
        const numValue = parseFloat(trimmed);
        if (!isNaN(numValue)) {
            return { operator: 'eq', value: numValue, originalInput: trimmed };
        }
    }

    // Text operators and patterns
    return parseTextFilter(trimmed);
}

/**
 * Parse text filter (for TEXT columns or fallback)
 */
function parseTextFilter(input: string): ParsedFilter {
    // Check for IN operator: in(value1,value2,value3) or value1,value2,value3
    if (input.includes(',')) {
        const values = input.split(',').map(v => v.trim()).filter(v => v);
        if (values.length > 1) {
            return {
                operator: 'in',
                value: values,
                originalInput: input
            };
        }
    }

    // Check for NOT IN: not in(value1,value2) or !value1,value2
    if (input.startsWith('!') && input.includes(',')) {
        const values = input.substring(1).split(',').map(v => v.trim()).filter(v => v);
        if (values.length > 1) {
            return {
                operator: 'not_in',
                value: values,
                originalInput: input
            };
        }
    }

    // Check for BETWEEN: between 10 and 20 or 10..20 or 10-20
    const betweenMatch = input.match(/^between\s+(\S+)\s+and\s+(\S+)$/i) ||
                        input.match(/^(\S+)\s*\.\.\s*(\S+)$/) ||
                        input.match(/^(\S+)\s*-\s*(\S+)$/);
    
    if (betweenMatch) {
        const [, val1, val2] = betweenMatch;
        return {
            operator: 'between',
            value: val1.trim(),
            value2: val2.trim(),
            originalInput: input
        };
    }

    // Check for exact match: =value
    if (input.startsWith('=')) {
        return {
            operator: 'eq',
            value: input.substring(1).trim(),
            originalInput: input
        };
    }

    // Check for not equal: !=value or !value
    if (input.startsWith('!=') || (input.startsWith('!') && input.length > 1)) {
        return {
            operator: 'ne',
            value: input.startsWith('!=') ? input.substring(2).trim() : input.substring(1).trim(),
            originalInput: input
        };
    }

    // Default: LIKE (contains) for text
    return {
        operator: 'ilike',
        value: input,
        originalInput: input
    };
}

/**
 * Get suggested operators for a column type
 */
export function getSuggestedOperators(columnType: ColumnType): string[] {
    if (isNumericType(columnType)) {
        return ['=', '!=', '<', '<=', '>', '>=', 'between'];
    }
    return ['contains', '=', '!=', 'in', 'not in'];
}
