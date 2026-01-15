/**
 * DataTables Viewer - Entry Point
 */
import { TableRenderer } from './ui/TableRenderer';

document.addEventListener('DOMContentLoaded', async () => {
    const appContainer = document.querySelector<HTMLDivElement>('#app');

    if (appContainer) {
        // Check for URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const dbParam = urlParams.get('db');

        const renderer = new TableRenderer({
            container: appContainer,
            configUrl: 'genome-data.config.json' // Relative to public/
        });

        await renderer.init();

        // If database parameter is provided, load it (client-side)
        if (dbParam) {
            try {
                await renderer.loadDatabaseFromFile(dbParam);
            } catch (error: any) {
                console.error('Failed to load database from URL parameter:', error);
                appContainer.innerHTML = `
                    <div class="ts-alert ts-alert-danger">
                        <i class="bi bi-x-circle-fill"></i> 
                        Failed to load database: ${error.message}
                        <br><br>
                        <small>Usage: ?db=filename (without .db extension)</small>
                        <br>
                        <small>Database file should be at: /data/${dbParam}.db</small>
                    </div>
                `;
            }
        }

        // Expose for debugging
        (window as any).tableRenderer = renderer;
    } else {
        console.error('App container #app not found');
    }
});
