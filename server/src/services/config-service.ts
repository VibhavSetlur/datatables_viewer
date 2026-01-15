/**
 * Config Service
 * 
 * Business logic for managing configurations
 */

import { getDatabase } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import type { DataTypeConfig } from '../types.js';

export interface ConfigRecord {
    id: string;
    object_type: string;
    source_ref: string | null;
    config_json: string;
    source: string;
    created_at: string;
    updated_at: string;
    created_by: string;
    updated_by: string;
    fingerprint: string | null;
    version: number;
    state: string;
    ai_provider: string | null;
    confidence: number | null;
    generation_time_ms: number | null;
}

export interface CreateConfigRequest {
    object_type: string;
    source_ref?: string;
    config: DataTypeConfig;
    source?: string;
    fingerprint?: string;
    ai_provider?: string;
    confidence?: number;
    generation_time_ms?: number;
}

export interface UpdateConfigRequest {
    config: DataTypeConfig;
    updated_by?: string;
    change_summary?: string;
}

/**
 * Create a new config record
 */
export function createConfig(request: CreateConfigRequest): ConfigRecord {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const configJson = JSON.stringify(request.config);
    
    const stmt = db.prepare(`
        INSERT INTO configs (
            id, object_type, source_ref, config_json, source,
            created_at, updated_at, created_by, updated_by,
            fingerprint, version, state, ai_provider, confidence, generation_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
        id,
        request.object_type,
        request.source_ref || null,
        configJson,
        request.source || 'ai_generated',
        now,
        now,
        'system',
        'system',
        request.fingerprint || null,
        1,
        'published',
        request.ai_provider || null,
        request.confidence || null,
        request.generation_time_ms || null
    );
    
    return getConfigById(id)!;
}

/**
 * Get config by ID
 */
export function getConfigById(id: string): ConfigRecord | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM configs WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return {
        id: row.id,
        object_type: row.object_type,
        source_ref: row.source_ref,
        config_json: row.config_json,
        source: row.source,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
        updated_by: row.updated_by,
        fingerprint: row.fingerprint,
        version: row.version,
        state: row.state,
        ai_provider: row.ai_provider,
        confidence: row.confidence,
        generation_time_ms: row.generation_time_ms,
    };
}

/**
 * Get config by object_type
 */
export function getConfigByObjectType(objectType: string): ConfigRecord | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM configs WHERE object_type = ? AND state = ?');
    const row = stmt.get(objectType, 'published') as any;
    
    if (!row) return null;
    
    return {
        id: row.id,
        object_type: row.object_type,
        source_ref: row.source_ref,
        config_json: row.config_json,
        source: row.source,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
        updated_by: row.updated_by,
        fingerprint: row.fingerprint,
        version: row.version,
        state: row.state,
        ai_provider: row.ai_provider,
        confidence: row.confidence,
        generation_time_ms: row.generation_time_ms,
    };
}

/**
 * Check if config exists for object_type
 */
export function configExists(objectType: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare('SELECT 1 FROM configs WHERE object_type = ? AND state = ? LIMIT 1');
    const row = stmt.get(objectType, 'published');
    return !!row;
}

/**
 * Update an existing config
 */
export function updateConfig(
    id: string,
    request: UpdateConfigRequest
): ConfigRecord | null {
    const db = getDatabase();
    const existing = getConfigById(id);
    
    if (!existing) {
        return null;
    }
    
    // Save to history
    const historyStmt = db.prepare(`
        INSERT INTO config_history (config_id, version, config_json, change_summary, change_author)
        VALUES (?, ?, ?, ?, ?)
    `);
    historyStmt.run(
        id,
        existing.version,
        existing.config_json,
        request.change_summary || 'Updated configuration',
        request.updated_by || 'system'
    );
    
    // Update config
    const configJson = JSON.stringify(request.config);
    const now = new Date().toISOString();
    
    const updateStmt = db.prepare(`
        UPDATE configs SET
            config_json = ?,
            updated_at = ?,
            updated_by = ?,
            version = version + 1
        WHERE id = ?
    `);
    
    updateStmt.run(
        configJson,
        now,
        request.updated_by || 'system',
        id
    );
    
    return getConfigById(id);
}

/**
 * List all configs
 */
export function listConfigs(options: {
    limit?: number;
    offset?: number;
    state?: string;
} = {}): { configs: ConfigRecord[]; total: number } {
    const db = getDatabase();
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    const state = options.state || 'published';
    
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM configs WHERE state = ?');
    const total = (countStmt.get(state) as any).count;
    
    const listStmt = db.prepare(`
        SELECT * FROM configs 
        WHERE state = ?
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
    `);
    
    const rows = listStmt.all(state, limit, offset) as any[];
    
    const configs = rows.map(row => ({
        id: row.id,
        object_type: row.object_type,
        source_ref: row.source_ref,
        config_json: row.config_json,
        source: row.source,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
        updated_by: row.updated_by,
        fingerprint: row.fingerprint,
        version: row.version,
        state: row.state,
        ai_provider: row.ai_provider,
        confidence: row.confidence,
        generation_time_ms: row.generation_time_ms,
    }));
    
    return { configs, total };
}

/**
 * Delete a config (soft delete by setting state to 'archived')
 */
export function deleteConfig(id: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE configs SET state = ? WHERE id = ?');
    const result = stmt.run('archived', id);
    return result.changes > 0;
}

/**
 * Update config state (lifecycle management)
 */
export function updateConfigState(
    id: string,
    newState: 'draft' | 'proposed' | 'published' | 'archived',
    updatedBy: string = 'system'
): ConfigRecord | null {
    const db = getDatabase();
    const existing = getConfigById(id);
    
    if (!existing) {
        return null;
    }

    const now = new Date().toISOString();
    const stmt = db.prepare(`
        UPDATE configs SET
            state = ?,
            updated_at = ?,
            updated_by = ?,
            ${newState === 'published' ? 'version = version + 1,' : ''}
            ${newState === 'published' ? 'published_at = ?,' : ''}
            ${newState === 'published' ? 'published_by = ?' : ''}
        WHERE id = ?
    `);

    if (newState === 'published') {
        stmt.run(newState, now, updatedBy, now, updatedBy, id);
    } else {
        stmt.run(newState, now, updatedBy, id);
    }

    return getConfigById(id);
}

/**
 * Get configs by state
 */
export function getConfigsByState(
    state: 'draft' | 'proposed' | 'published' | 'archived',
    options: { limit?: number; offset?: number } = {}
): { configs: ConfigRecord[]; total: number } {
    return listConfigs({
        state,
        limit: options.limit,
        offset: options.offset
    });
}
