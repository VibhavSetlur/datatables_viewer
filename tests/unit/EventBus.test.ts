/**
 * EventBus Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../src/core/state/EventBus';

// Helper to cast bus to any for testing arbitrary events
const asAny = (bus: EventBus) => bus as any;

describe('EventBus', () => {
    let bus: EventBus;

    beforeEach(() => {
        // Get fresh instance (reset singleton for testing)
        bus = EventBus.getInstance();
        bus.clear();
    });

    describe('on()', () => {
        it('should subscribe to events', () => {
            const handler = vi.fn();
            asAny(bus).on('test:event', handler);
            asAny(bus).emit('test:event', { value: 42 });

            expect(handler).toHaveBeenCalledWith({ value: 42 });
        });

        it('should support multiple handlers for same event', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            asAny(bus).on('test:event', handler1);
            asAny(bus).on('test:event', handler2);
            asAny(bus).emit('test:event', { data: 'test' });

            expect(handler1).toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
        });

        it('should return unsubscribe function', () => {
            const handler = vi.fn();
            const unsub = asAny(bus).on('test:event', handler);

            asAny(bus).emit('test:event', {});
            expect(handler).toHaveBeenCalledTimes(1);

            unsub();
            asAny(bus).emit('test:event', {});
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('once()', () => {
        it('should only fire handler once', () => {
            const handler = vi.fn();
            asAny(bus).once('single:event', handler);

            asAny(bus).emit('single:event', {});
            asAny(bus).emit('single:event', {});
            asAny(bus).emit('single:event', {});

            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('should pass payload correctly', () => {
            const handler = vi.fn();
            asAny(bus).once('single:event', handler);

            asAny(bus).emit('single:event', { key: 'value' });

            expect(handler).toHaveBeenCalledWith({ key: 'value' });
        });
    });

    describe('off()', () => {
        it('should remove specific handler', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            asAny(bus).on('test:event', handler1);
            asAny(bus).on('test:event', handler2);
            asAny(bus).off('test:event', handler1);

            asAny(bus).emit('test:event', {});

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
        });

        it('should handle removing non-existent handler gracefully', () => {
            const handler = vi.fn();
            expect(() => asAny(bus).off('no:event', handler)).not.toThrow();
        });
    });

    describe('emit()', () => {
        it('should pass payload to handlers', () => {
            const handler = vi.fn();
            const payload = { id: 1, name: 'test' };

            asAny(bus).on('test:event', handler);
            asAny(bus).emit('test:event', payload);

            expect(handler).toHaveBeenCalledWith(payload);
        });

        it('should work without payload', () => {
            const handler = vi.fn();

            asAny(bus).on('test:event', handler);
            asAny(bus).emit('test:event');

            expect(handler).toHaveBeenCalledWith(undefined);
        });

        it('should not throw for events with no listeners', () => {
            expect(() => asAny(bus).emit('no:listeners', { data: 'test' })).not.toThrow();
        });
    });

    describe('wildcard (*)', () => {
        it('should receive all events', () => {
            const handler = vi.fn();
            bus.onAny(handler);

            asAny(bus).emit('event:one', { a: 1 });
            asAny(bus).emit('event:two', { b: 2 });
            asAny(bus).emit('event:three', { c: 3 });

            expect(handler).toHaveBeenCalledTimes(3);
        });

        it('should receive event name and payload', () => {
            const handler = vi.fn();
            bus.onAny(handler);

            asAny(bus).emit('test:event', { value: 42 });

            expect(handler).toHaveBeenCalledWith('test:event', { value: 42 });
        });
    });

    describe('clear()', () => {
        it('should clear specific event listeners', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            asAny(bus).on('event:one', handler1);
            asAny(bus).on('event:two', handler2);
            asAny(bus).clear('event:one');

            asAny(bus).emit('event:one', {});
            asAny(bus).emit('event:two', {});

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
        });

        it('should clear all listeners when called without argument', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            asAny(bus).on('event:one', handler1);
            asAny(bus).on('event:two', handler2);
            bus.clear();

            asAny(bus).emit('event:one', {});
            asAny(bus).emit('event:two', {});

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should not break other handlers if one throws', () => {
            const handler1 = vi.fn(() => { throw new Error('Test error'); });
            const handler2 = vi.fn();

            asAny(bus).on('test:event', handler1);
            asAny(bus).on('test:event', handler2);

            // Should not throw
            expect(() => asAny(bus).emit('test:event', {})).not.toThrow();

            // Second handler should still be called
            expect(handler2).toHaveBeenCalled();
        });
    });
});
