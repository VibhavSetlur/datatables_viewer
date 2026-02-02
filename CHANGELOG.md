# Changelog

All notable changes to DataTables Viewer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Multi-Database Object Support** - Handle KBase workspace objects containing multiple pangenome databases
  - New database selection dropdown in sidebar (hidden for single-DB objects)
  - `handleDatabaseChange()` method in TableRenderer for seamless DB switching
  - `listDatabases()`, `listTablesInDatabase()`, `getTableDataFromDatabase()` API methods
  - StateManager extended with `activeDatabase` and `availableDatabases`
  - Updated `loadObjectFromSidecar()` to detect multi-DB API responses

## [3.1.1] - 2026-01-27

### Added
- **URL State Unit Tests** - Added 33 comprehensive tests for `UrlStateManager` to verify bidirectional state synchronization, parameter parsing, and shareable URL generation.

### Fixed
- **URL Synchronization** - Resolved issue where the browser's address bar did not update after manually loading a database via the sidebar.
- **Deep Linking Robustness** - Improved shareable URL generation to use absolute paths for more reliable state restoration across different environments.
- **Strict Lint Compliance** - Resolved all structural ESLint and TypeScript warnings, including fixing scoped case declarations in ontology lookups.
- **Type Safety** - Eliminated unsafe non-null assertions (!) in `TableRenderer` and `UrlStateManager` in favor of defensive type-narrowing and null-checks.

## [3.1.0] - 2026-01-22

### Added
- **Rich Gene Cards** - Enhanced UI for UniProt and KEGG columns with hoverable cards containing descriptions and metadata
- **Expanded Ontology Support** - Transformers now support UniProt and KEGG Entry lookups with vertical layout for multiple items
- **UniProt API Integration** - Direct fetching of protein and gene names from UniProt REST API
- **Improved KEGG Lookup** - Support for generic KEGG entries beyond just orthologs

## [3.0.1] - 2026-01-21

### Fixed

- **Build & CI stability** - Ensure the `data/` directory always exists in builds (including GitHub Actions) by tracking a `.gitkeep` placeholder and updating `.gitignore` rules so the `public/data` symlink target is present without committing large `.db` files

### Added

#### Architecture & Backend
- **Event Bus System** (`src/core/EventBus.ts`) - Type-safe publish/subscribe system for decoupled component communication with support for one-time listeners, wildcard subscriptions, and event history debugging
- **Plugin Manager** (`src/core/PluginManager.ts`) - Full plugin architecture allowing developers to extend functionality with custom transformers, toolbar buttons, context menu items, and lifecycle hooks
- **Keyboard Manager** (`src/core/KeyboardManager.ts`) - Comprehensive keyboard shortcuts system with conflict detection, customizable shortcuts, and built-in help modal

#### Documentation
- **Comprehensive README** - Complete documentation covering architecture, configuration, quick start, and troubleshooting
- **API Reference** (`docs/API.md`) - Detailed developer documentation for all core classes, state management, events, plugins, and theming

#### UI/UX Features
- **Density Controls** - Full support for compact/normal/comfortable row density modes with proper CSS variables and settings UI
- **Row Selection Highlighting** - Complete row highlighting on selection including all fixed columns with accent border
- **Selection Count Status** - Status bar now shows number of selected rows
- **Keyboard Help Modal** - Press `?` to see all available keyboard shortcuts
- **Loading Skeletons** - CSS skeleton animations for loading states
- **Print Styles** - Optimized CSS for printing tables
- **Responsive Design** - Mobile-friendly breakpoints for sidebar and toolbar

#### Configuration
- **Enhanced Config System** - Multi-API support, feature flags, locale settings, number formatting options
- **Data Type Registry** - Support for multiple data types with auto-detection
- **Feature Flags** - Enable/disable features like schema explorer, column search, export formats

### Changed

#### UI Improvements
- **Dark Theme** - Complete overhaul with proper dark row colors (`#0f1626` / `#131b2e`) for better contrast
- **Light Theme** - Professional clean aesthetic with subtle gradients and refined shadows
- **Settings Popup** - Updated density options from default/presentation to normal/comfortable
- **Toolbar Buttons** - Separated Refresh (re-fetch keeping state) from Reset (clear all)
- **Schema Explorer** - Enhanced database explorer modal with sidebar navigation

#### Code Quality
- **Type Safety** - Improved TypeScript types throughout
- **Lint Fixes** - Resolved all lint warnings and errors
- **Code Organization** - Better separation of concerns with dedicated manager classes

### Fixed
- Row selection now properly highlights entire row including checkbox and row number columns
- Filter debounce no longer interferes with reset functionality
- Dark theme input fields now have proper readable backgrounds
- Status bar properly updates with selection count

### Developer Features
- **Custom Transformers** - Register custom cell transformers via plugin API
- **Toolbar Extensions** - Add custom buttons to the toolbar
- **Event Subscriptions** - Subscribe to all data, selection, and UI events
- **State Access** - Plugins have full access to state manager
- **Settings Persistence** - Plugin settings automatically saved to localStorage

## [3.0.0] - 2026-01-08

### Added
- Initial Tier-1 production architecture
- Centralized state management
- Event-driven UI updates
- Advanced configuration resolution system

## [2.5.0] - 2025-12

### Added
- Schema Explorer modal with table navigation
- Column categories with toggle visibility
- Virtual columns (computed from other columns)
- Conditional styling based on cell values

### Changed
- Improved sidebar layout with collapsible sections
- Better horizontal scrolling for wide datasets

## [2.0.0] - 2025-11

### Added
- Complete TypeScript rewrite
- Component-based architecture (Sidebar, Toolbar, DataGrid)
- State management with reactive updates
- Configuration system with JSON configs

### Changed
- Modular codebase structure
- Improved performance with virtual DOM updates

## [1.0.0] - 2025-10

### Added
- Initial release
- Basic table rendering
- Sorting and filtering
- CSV export
- Light/dark theme support
