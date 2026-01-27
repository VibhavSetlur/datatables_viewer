# DataTables Viewer

**DataTables Viewer** is a high-performance data viewing platform for exploring, searching, and analyzing large-scale research datasets. It offers developer-friendly features for customizing table layouts and adding new functionality. It bridges the gap between raw database storage and interactive visualization, offering seamless integration with KBase and standard SQLite databases.

[![Version](https://img.shields.io/badge/version-3.1.1-blue.svg)](CHANGELOG.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-64%20passed-success.svg)](tests/unit/)

---

## Key Features

### Deep Exploration
- **Advanced Filtering**: Support for 15+ operators (`regex`, `like`, `null` checks, etc.) and complex aggregations.
- **Full-Text Search**: Optimized FTS5 search (via TableScanner) for lightning-fast keyword lookup across massive tables.
- **Column Statistics**: One-click access to distribution metrics, including min, max, mean, median, and stddev.

### State and Sharing (v3.1.1)
- **Bidirectional URL Sync**: The browser address bar reflects your current view (database, table, filters, sort, page) in real-time.
- **Deep Linking**: Generate shareable URLs that restore the **exact** application state, including authentication handling for private databases.
- **State Persistence**: Automatic recovery of view settings across sessions.

### Bioinformatics Integration
- **Cell Transformers**: Rich visualization for complex data types (Heatmaps, Sequences, Badges, Links).
- **Ontology Cards**: Interactive hover cards for GO, KEGG, Pfam, COG, EC, and UniProt terms with live metadata fetching.
- **Gene Cards**: Deep integration with UniProt and KEGG REST APIs for real-time protein/gene property lookup.

### Architecture
- **Dual Engine**: High-performance client-side SQLite via `sql.js` for local data; high-concurrency TableScanner API for remote/shared databases.
- **Extensible Plugin System**: Decoupled architecture allowing custom transformers, keyboard shortcuts, and UI extensions.
- **Production-Ready**: Zero linting warnings, 100% type safety, and 60+ unit tests covering core logic.

---

## Quick Start

### Development Environment
```bash
# 1. Install dependencies
npm install

# 2. Start the local development server
npm run dev

# 3. Access the viewer
# http://localhost:5173 
```

### Loading Data
- **Via UI**: Use the sidebar to upload a `.db` file or enter a KBase Object ID.
- **Via URL**: Pass the `db` parameter directly: `?db=76990/7/2`.

---

## Project Structure

```text
src/
├── core/                # Core Logic
│   ├── api/             # API Clients (Local & Remote)
│   ├── config/          # Dynamic Configuration Resolver
│   └── state/           # State Management (URL Sync, Event Bus)
├── ui/                  # Component Library
│   ├── components/      # Reusable UI Elements
│   └── views/           # Table, Schema, and Stats Renderers
└── utils/               # Data Transformers & Helpers
```

---

## Scripts

| Command | Action |
|:---|:---|
| `npm run build` | Compile for production (outputs to `dist/`) |
| `npm test` | Execute full unit test suite (Vitest) |
| `npm run lint` | Run ESLint strict checks |
| `npm run typecheck` | Perform static type analysis (TSC) |
| `npm run generate-config` | Auto-generate Table layout from SQLite schema |

---

## Documentation

- **[Quick Start Guide](docs/QUICK_START.md)** - Get running in 5 minutes.
- **[Deployment Manual](DEPLOYMENT.md)** - Guide for static and service-based hosting.
- **[Plugin API](docs/API.md)** - Extending the viewer with custom components.
- **[Config Management](docs/CONFIG_MANAGEMENT.md)** - Tuning table layouts and transforms.
- **[Changelog](CHANGELOG.md)** - Detailed version history.

---

## Contributing and Support

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on our workflow and coding standards.

**License**: Distributed under the [MIT License](LICENSE).
