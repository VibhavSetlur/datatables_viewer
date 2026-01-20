/**
 * SQL Identifier Validation Utilities
 * 
 * Provides safe validation and sanitization of SQL identifiers (table names, column names)
 * to prevent SQL injection attacks.
 */

/**
 * Validates that an identifier contains only safe characters.
 * SQLite identifiers can contain letters, digits, underscores, and must be quoted if they contain
 * special characters. This function ensures identifiers match safe patterns.
 * 
 * @param identifier - The identifier to validate
 * @returns true if the identifier is safe to use in SQL queries
 */
export function isValidSqlIdentifier(identifier: string): boolean {
    if (!identifier || typeof identifier !== 'string') {
        return false;
    }

    // SQLite identifiers can be:
    // - Unquoted: letters, digits, underscore, and must start with letter or underscore
    // - Quoted: can contain any character except null and the quote character
    // We'll validate against a safe subset: alphanumeric, underscore, and common safe characters
    
    // Check for SQL injection patterns
    const dangerousPatterns = [
        /['";]/g,           // Quote characters
        /--/g,              // SQL comments
        /\/\*/g,            // Multi-line comment start
        /\*\//g,            // Multi-line comment end
        /;/g,               // Statement separator
        /\s/g,              // Whitespace (shouldn't be in identifiers)
        /[<>]/g,            // Comparison operators
        /[()]/g,            // Parentheses
        /\[|\]/g,           // Brackets
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(identifier)) {
            return false;
        }
    }

    // Must contain at least one valid character
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);
}

/**
 * Validates a column name against a whitelist of known columns.
 * This is the safest approach - only allow columns that exist in the schema.
 * 
 * @param columnName - The column name to validate
 * @param allowedColumns - Array of valid column names from schema
 * @returns true if the column is in the whitelist
 */
export function isColumnAllowed(columnName: string, allowedColumns: string[]): boolean {
    if (!columnName || !Array.isArray(allowedColumns)) {
        return false;
    }
    return allowedColumns.includes(columnName);
}

/**
 * Validates a table name against a whitelist of known tables.
 * 
 * @param tableName - The table name to validate
 * @param allowedTables - Array of valid table names
 * @returns true if the table is in the whitelist
 */
export function isTableAllowed(tableName: string, allowedTables: string[]): boolean {
    if (!tableName || !Array.isArray(allowedTables)) {
        return false;
    }
    return allowedTables.includes(tableName);
}

/**
 * Escapes an identifier for safe use in SQL queries.
 * This wraps the identifier in double quotes (SQLite standard).
 * 
 * @param identifier - The identifier to escape
 * @returns The escaped identifier
 */
export function escapeSqlIdentifier(identifier: string): string {
    if (!identifier || typeof identifier !== 'string') {
        throw new Error('Invalid identifier: must be a non-empty string');
    }

    // Replace any double quotes in the identifier with two double quotes (SQLite escaping)
    const escaped = identifier.replace(/"/g, '""');
    return `"${escaped}"`;
}

/**
 * Validates and escapes a column name for use in SQL queries.
 * Throws an error if the column name is invalid.
 * 
 * @param columnName - The column name to validate and escape
 * @param allowedColumns - Optional whitelist of allowed columns
 * @returns The escaped column name
 * @throws Error if the column name is invalid or not in whitelist
 */
export function validateAndEscapeColumn(
    columnName: string,
    allowedColumns?: string[]
): string {
    if (!isValidSqlIdentifier(columnName)) {
        throw new Error(`Invalid column name: ${columnName}`);
    }

    if (allowedColumns && !isColumnAllowed(columnName, allowedColumns)) {
        throw new Error(`Column not allowed: ${columnName}`);
    }

    return escapeSqlIdentifier(columnName);
}

/**
 * Validates and escapes a table name for use in SQL queries.
 * Throws an error if the table name is invalid.
 * 
 * @param tableName - The table name to validate and escape
 * @param allowedTables - Optional whitelist of allowed tables
 * @returns The escaped table name
 * @throws Error if the table name is invalid or not in whitelist
 */
export function validateAndEscapeTable(
    tableName: string,
    allowedTables?: string[]
): string {
    if (!isValidSqlIdentifier(tableName)) {
        throw new Error(`Invalid table name: ${tableName}`);
    }

    if (allowedTables && !isTableAllowed(tableName, allowedTables)) {
        throw new Error(`Table not allowed: ${tableName}`);
    }

    return escapeSqlIdentifier(tableName);
}
