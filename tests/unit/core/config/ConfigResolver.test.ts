import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigResolver } from '@core/config/ConfigResolver';
import { ApiClient } from '@core/api/ApiClient';
import { logger } from '@utils/logger';

// Mock logger
vi.mock('@utils/logger', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    }
}));

// Mock fetch
global.fetch = vi.fn();

describe('ConfigResolver - KBase Integration', () => {
    let resolver: ConfigResolver;
    let mockClient: ApiClient;

    beforeEach(() => {
        resolver = new ConfigResolver();
        mockClient = {
            getWorkspaceObjectInfo: vi.fn(),
            getWorkspaceObject: vi.fn(),
        } as unknown as ApiClient;
        vi.clearAllMocks();
    });

    it('should resolve config from metadata using kn_config key', async () => {
        const mockConfig = { id: 'test-config', tables: {} };
        const mockMeta = { kn_config: JSON.stringify(mockConfig) };
        const mockInfo = [[0, 'name', 'type', 'date', 1, 'user', 123, 'ws', 'chk', 100, mockMeta]];

        // @ts-ignore
        mockClient.getWorkspaceObjectInfo.mockResolvedValue(mockInfo);

        const result = await resolver.resolveFromWorkspace('1/2/3', mockClient);

        expect(result).toEqual(mockConfig);
        expect(mockClient.getWorkspaceObjectInfo).toHaveBeenCalledWith('1/2/3');
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Found config in workspace metadata'));
    });

    it('should fallback to config key in metadata', async () => {
        const mockConfig = { id: 'test-config-2', tables: {} };
        const mockMeta = { config: JSON.stringify(mockConfig) };
        const mockInfo = [[0, 'name', 'type', 'date', 1, 'user', 123, 'ws', 'chk', 100, mockMeta]];

        // @ts-ignore
        mockClient.getWorkspaceObjectInfo.mockResolvedValue(mockInfo);

        const result = await resolver.resolveFromWorkspace('1/2/3', mockClient);

        expect(result).toEqual(mockConfig);
    });

    it('should fallback to sidecar if metadata config is missing', async () => {
        // Mock empty metadata
        const mockInfo = [[0, 'name', 'type', 'date', 1, 'user', 123, 'ws', 'chk', 100, {}]];
        // @ts-ignore
        mockClient.getWorkspaceObjectInfo.mockResolvedValue(mockInfo);

        // Mock sidecar fetch
        const sidecarConfig = { configRef: '4/5/6' };
        // @ts-ignore
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(sidecarConfig)
        });

        // Mock getWorkspaceObject for sidecar ref
        const wsConfig = { id: 'sidecar-config' };
        // @ts-ignore
        mockClient.getWorkspaceObject.mockResolvedValue({ data: wsConfig });

        const result = await resolver.resolveFromWorkspace('1/2/3', mockClient);

        expect(result).toEqual(wsConfig);
        expect(mockClient.getWorkspaceObject).toHaveBeenCalledWith('4/5/6');
    });

    it('should return null if both metadata and sidecar fail', async () => {
        // Mock error in metadata fetch
        // @ts-ignore
        mockClient.getWorkspaceObjectInfo.mockRejectedValue(new Error('Workspace Error'));

        // Mock sidecar not found
        // @ts-ignore
        global.fetch.mockResolvedValue({
            ok: false
        });

        const result = await resolver.resolveFromWorkspace('1/2/3', mockClient);

        expect(result).toBeNull();
    });
});
