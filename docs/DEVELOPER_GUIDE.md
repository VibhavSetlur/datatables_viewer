# Developer Guide

This guide is for developers who want to extend the GenomeDataTables Viewer, including adding new visualization types, customizing the API client, or understanding the internal architecture.

## Architecture Overview

The Application follows a vanilla JS, module-based architecture with no build step, ensuring maximum portability and ease of deployment.

-   **`table-renderer.js`**: Where the magic happens. A class-based controller that manages state (sort, filter, pagination) and DOM updates.
-   **`transformers.js`**: A functional utility library for cell rendering.
-   **`category-manager.js`**: Handles the logic for which columns should be shown based on category toggles.

### State Management
The `TableRenderer` allows for reactive updates.
1.  User clicks a toggle in `CategoryManager`.
2.  `CategoryManager` updates its set of visible category IDs.
3.  `TableRenderer` re-computes the list of visible columns (union of uncategorized + visible categories).
4.  `TableRenderer` re-renders hierarchical DOM (headers, filter rows, body).

## Extending Transformers

To add a new transformer (e.g., a Sparkline visualization):

1.  Open `js/transformers.js`.
2.  Add a new method to the `Transformers` object.

```javascript
sparkline(value, options, row) {
    // Value might be "1,2,5,3"
    const points = value.split(',').map(Number);
    // ... logic to render SVG sparkline ...
    return `<svg>...</svg>`;
}
```

3.  Use it in `genome-data.config.json`:
    ```json
    "transform": { "type": "sparkline" }
    ```

## KBase API Integration
The viewer expects a standard TableScanner API:
-   `GET /tables`: List available tables.
-   `POST /query`: Fetch paginated data (supports `filter`, `sort`, `limit`, `offset`).

To support a different backend, modify `js/kbase-client.js`.
