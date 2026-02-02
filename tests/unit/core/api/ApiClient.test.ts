import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '@core/api/ApiClient';
import { logger } from '@utils/logger';

// Mock logger to avoid console spam
vi.mock('@utils/logger', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    }
}));

describe('ApiClient - KBase Integration', () => {
    let client: ApiClient;

    beforeEach(() => {
        // Reset document.cookie before each test
        Object.defineProperty(document, 'cookie', {
            value: '',
            writable: true
        });
        vi.clearAllMocks();
    });

    it('should use token provided in constructor', () => {
        client = new ApiClient({ token: 'explicit-token' });
        // @ts-ignore - accessing private method for testing
        const headerToken = (client.getHeaders() as any)['Authorization'];
        expect(headerToken).toBe('Bearer explicit-token');
    });

    it('should find kbase_session cookie', () => {
        document.cookie = 'kbase_session=cookie-token; path=/';
        client = new ApiClient();

        // @ts-ignore - accessing private method for testing
        const headerToken = (client.getHeaders() as any)['Authorization'];
        expect(headerToken).toBe('Bearer cookie-token');
        expect(logger.debug).toHaveBeenCalledWith('[ApiClient] Found kbase_session cookie');
    });

    it('should fallback to kbase_session_backup if kbase_session missing', () => {
        document.cookie = 'kbase_session_backup=backup-token; path=/';
        client = new ApiClient();

        // @ts-ignore - accessing private method for testing
        const headerToken = (client.getHeaders() as any)['Authorization'];
        expect(headerToken).toBe('Bearer backup-token');
        expect(logger.debug).toHaveBeenCalledWith('[ApiClient] Found kbase_session_backup cookie');
    });

    it('should prefer kbase_session over backup', () => {
        document.cookie = 'kbase_session=primary-token; kbase_session_backup=backup-token';
        client = new ApiClient();

        // @ts-ignore - accessing private method for testing
        const headerToken = (client.getHeaders() as any)['Authorization'];
        expect(headerToken).toBe('Bearer primary-token');
        expect(logger.debug).toHaveBeenCalledWith('[ApiClient] Found kbase_session cookie');
    });

    it('should handle no cookies', () => {
        document.cookie = '';
        client = new ApiClient();

        // @ts-ignore - accessing private method for testing
        const headers = client.getHeaders() as any;
        expect(headers['Authorization']).toBeUndefined();
        expect(logger.debug).toHaveBeenCalledWith('[ApiClient] No KBase session cookies found');
    });
});
