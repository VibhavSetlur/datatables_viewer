/**
 * DataTables Viewer - Entry Point
 */
import { TableRenderer } from './ui/TableRenderer';
import { logger } from './utils/logger';

document.addEventListener('DOMContentLoaded', async () => {
    const appContainer = document.querySelector<HTMLDivElement>('#app');

    if (appContainer) {
        // Check for URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const dbParam = urlParams.get('db');

        const renderer = new TableRenderer({
            container: appContainer
        });

        await renderer.init();

        // If database parameter is provided, set it for initial load
        if (dbParam) {
            logger.info(`Database parameter detected: ${dbParam}`);
            // Note: Client-side database loading is no longer supported.
            // Use the upload feature or provide a KBase object reference.
        }

        // Expose for debugging (only in development)
        if (import.meta.env.DEV) {
            (window as any).tableRenderer = renderer;
        }
    } else {
        logger.error('App container #app not found');
    }
});
