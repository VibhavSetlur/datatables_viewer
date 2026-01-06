# GenomeDataTables Viewer

A research-grade, highly configurable visualization suite for rendering SQL-based genome data tables. Designed for flexibility, this tool allows data scientists to define how genomic data is presented without changing application code.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![KBase](https://img.shields.io/badge/KBase-Compatible-green.svg)](https://kbase.us)

## Features

-   **Data Agnostic**: Renders any SQL-based data table exposed via the TableScanner API.
-   **Configurable Transformations**: Define column logic (Links, Merges, Ontology Lookups, Sequences) via JSON.
-   **Semantic Categorization**: Group columns by biological context (e.g., "Functional Annotation", "Genomic Coordinates") with user-controllable toggles.
-   **Research-Grade UI**: Polished, professional interface with Sticky Headers, Pagination, and Sort/Filter capabilities.

## Quick Start

### 1. Serve the Application
The viewer requires a simple HTTP server to run (to handle JSON config loading).

```bash
# Serve the directory using Python
python3 -m http.server 8000

# OR using Node.js
# npx http-server .
```

### 2. Open in Browser
Visit `http://localhost:8000` in your web browser.

By default, it will attempt to load the configuration from `configs/genome-data.config.json` and connect to the KBase environment defined in `APP_CONFIG`.

### 3. URL Parameters
You can override default settings via URL parameters:
-   `?berdl=76990/7/2`: Load a specific BERDL table object.
-   `?table=genes`: Load a specific table name immediately.
-   `?token=XYZ`: Provide an auth token (for development).

## Configuration

Control the viewer's behavior using `configs/genome-data.config.json`.

```json
{
  "columns": [
    {
      "column": "Uniprot_ID",
      "displayName": "UniProt",
      "transform": {
        "type": "link",
        "options": { "urlTemplate": "https://www.uniprot.org/uniprotkb/{value}" }
      }
    }
  ]
}
```

See [docs/CONFIGURATION_GUIDE.md](docs/CONFIGURATION_GUIDE.md) for the complete schema and transformation options.

## Project Structure

```text
├── index.html                  # Application Entry Point
├── configs/                    # JSON Configurations
├── css/                        # Research-Grade Styles
├── js/                         # Application Logic
│   ├── table-renderer.js       # Main Rendering Engine
│   ├── transformers.js         # Column Transformation Logic
│   ├── category-manager.js     # Column Grouping Logic
│   └── kbase-client.js         # API Client
└── docs/                       # Comprehensive Documentation
    ├── CONFIGURATION_GUIDE.md  # JSON Schema & Examples
    └── DEVELOPER_GUIDE.md      # Architecture & Extension
```

## Developer Guide

Want to extend the viewer or create custom transformers? Check [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md).

## Requirements

-   Modern Web Browser (Chrome, Firefox, Safari, Edge)
-   GenomeDataTables / TableScanner API Endpoint
-   KBase Auth Token (if accessing private data)

## License

MIT License - see [LICENSE](LICENSE) for details.
