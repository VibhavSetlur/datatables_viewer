/**
 * StateManager Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateManager } from '../../src/core/StateManager';
// import { createMockInitialState, createMockLoadedState } from '../fixtures/data-factory';

describe('StateManager', () => {
    let stateManager: StateManager;

    beforeEach(() => {
        stateManager = new StateManager();
    });

    describe('initialization', () => {
        it('should initialize with default state', () => {
            const state = stateManager.getState();

            expect(state.data).toEqual([]);
            expect(state.loading).toBe(false);
            expect(state.currentPage).toBe(0);
            expect(state.pageSize).toBe(50);
            expect(state.error).toBeNull();
        });

        it('should have empty selections initially', () => {
            const state = stateManager.getState();

            expect(state.selectedRows.size).toBe(0);
            expect(state.visibleColumns.size).toBe(0);
        });
    });

    describe('update()', () => {
        it('should update state with partial data', () => {
            stateManager.update({ loading: true });

            expect(stateManager.getState().loading).toBe(true);
        });

        it('should maintain immutability', () => {
            const initial = stateManager.getState();
            stateManager.update({ loading: true });
            const updated = stateManager.getState();

            expect(initial.loading).toBe(false);
            expect(updated.loading).toBe(true);
            expect(initial).not.toBe(updated);
        });

        it('should merge multiple properties', () => {
            stateManager.update({
                loading: true,
                currentPage: 5,
                searchQuery: 'test'
            });

            const state = stateManager.getState();
            expect(state.loading).toBe(true);
            expect(state.currentPage).toBe(5);
            expect(state.searchQuery).toBe('test');
        });

        it('should handle Set updates correctly', () => {
            const selected = new Set([1, 2, 3]);
            stateManager.update({ selectedRows: selected });

            expect(stateManager.getState().selectedRows).toEqual(selected);
        });
    });

    describe('subscribe()', () => {
        it('should notify subscribers on update', () => {
            const subscriber = vi.fn();
            stateManager.subscribe(subscriber);

            stateManager.update({ loading: true });

            expect(subscriber).toHaveBeenCalledTimes(1);
            expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({
                loading: true
            }));
        });

        it('should support multiple subscribers', () => {
            const sub1 = vi.fn();
            const sub2 = vi.fn();
            const sub3 = vi.fn();

            stateManager.subscribe(sub1);
            stateManager.subscribe(sub2);
            stateManager.subscribe(sub3);

            stateManager.update({ currentPage: 2 });

            expect(sub1).toHaveBeenCalled();
            expect(sub2).toHaveBeenCalled();
            expect(sub3).toHaveBeenCalled();
        });

        it('should return unsubscribe function', () => {
            const subscriber = vi.fn();
            const unsubscribe = stateManager.subscribe(subscriber);

            stateManager.update({ loading: true });
            expect(subscriber).toHaveBeenCalledTimes(1);

            unsubscribe();
            stateManager.update({ loading: false });
            expect(subscriber).toHaveBeenCalledTimes(1); // Still 1
        });

        it('should pass complete state to subscribers', () => {
            const subscriber = vi.fn();
            stateManager.subscribe(subscriber);

            stateManager.update({ loading: true });

            const passedState = subscriber.mock.calls[0][0];
            expect(passedState).toHaveProperty('data');
            expect(passedState).toHaveProperty('loading');
            expect(passedState).toHaveProperty('currentPage');
            expect(passedState).toHaveProperty('selectedRows');
        });
    });

    describe('reset()', () => {
        it('should reset to initial state', () => {
            // Modify state
            stateManager.update({
                loading: true,
                currentPage: 10,
                searchQuery: 'test query',
                activeTableName: 'genes'
            });

            // Reset
            stateManager.reset();

            const state = stateManager.getState();
            expect(state.loading).toBe(false);
            expect(state.currentPage).toBe(0);
            expect(state.searchQuery).toBe('');
            expect(state.activeTableName).toBeNull();
        });

        it('should notify subscribers on reset', () => {
            const subscriber = vi.fn();
            stateManager.subscribe(subscriber);

            stateManager.update({ loading: true });
            subscriber.mockClear();

            stateManager.reset();

            expect(subscriber).toHaveBeenCalled();
        });
    });

    describe('complex state scenarios', () => {
        it('should handle data loading workflow', () => {
            const subscriber = vi.fn();
            stateManager.subscribe(subscriber);

            // Start loading
            stateManager.update({ loading: true, error: null });
            expect(stateManager.getState().loading).toBe(true);

            // Data received
            const mockData = [{ id: 1 }, { id: 2 }];
            stateManager.update({
                loading: false,
                data: mockData,
                totalCount: 2
            });

            const state = stateManager.getState();
            expect(state.loading).toBe(false);
            expect(state.data).toEqual(mockData);
            expect(state.totalCount).toBe(2);

            expect(subscriber).toHaveBeenCalledTimes(2);
        });

        it('should handle error state', () => {
            stateManager.update({ loading: true });
            stateManager.update({
                loading: false,
                error: 'Network error'
            });

            const state = stateManager.getState();
            expect(state.loading).toBe(false);
            expect(state.error).toBe('Network error');
        });

        it('should handle selection changes', () => {
            const rows = new Set([0, 1, 2]);
            stateManager.update({ selectedRows: rows });

            expect(stateManager.getState().selectedRows.size).toBe(3);

            // Clear selection
            stateManager.update({ selectedRows: new Set() });
            expect(stateManager.getState().selectedRows.size).toBe(0);
        });

        it('should handle pagination', () => {
            stateManager.update({ totalCount: 1000 });

            // Navigate pages
            stateManager.update({ currentPage: 5 });
            expect(stateManager.getState().currentPage).toBe(5);

            // Change page size
            stateManager.update({ pageSize: 100, currentPage: 0 });
            const state = stateManager.getState();
            expect(state.pageSize).toBe(100);
            expect(state.currentPage).toBe(0);
        });
    });
});
