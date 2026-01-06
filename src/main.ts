/**
 * DataTables Viewer - Entry Point
 */
import { TableRenderer } from './ui/TableRenderer';

document.addEventListener('DOMContentLoaded', async () => {
    const appContainer = document.querySelector<HTMLDivElement>('#app');

    if (appContainer) {
        const renderer = new TableRenderer({
            container: appContainer,
            configUrl: 'genome-data.config.json' // Relative to public/
        });

        await renderer.init();

        // Expose for debugging
        (window as any).tableRenderer = renderer;
    } else {
        console.error('App container #app not found');
    }
});
