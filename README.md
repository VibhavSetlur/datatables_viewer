# DataTables Viewer

A modern, high-performance web application for rendering generic SQL tables with advanced configuration options, built with **Vite** and **TypeScript**.

## 🚀 Overview

This project replaces the legacy GenomeDataTables Viewer with a modular, type-safe architecture. It is designed to be:
- **Generic**: Renders any table data structure provided by the API.
- **Configurable**: Fully driven by `genome-data.config.json`.
- **Performant**: optimized for speed and large datasets.

## 📂 Project Structure

- **`src/`**: Source code
    - **`core/`**: Core logic (ApiClient, StateManager, CategoryManager).
    - **`ui/`**: UI components (TableRenderer).
    - **`utils/`**: Utilities (Transformers, ConfigManager).
    - **`types/`**: TypeScript type definitions.
- **`public/`**: Static assets (`genome-data.config.json`).
- **`archive/`**: Contains the legacy JavaScript/HTML implementation (`js/`, `css/`, `viewer.html`, etc.).

## 🛠️ Setup & Development

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
npm install
```

### Running Locally
Start the development server:
```bash
npm run dev
```
The app will be available at `http://localhost:5173`.

### Building for Production
```bash
npm run build
```
The output will be in the `dist/` directory.

## 📖 Architecture

The application follows a modular design pattern:
- **ApiClient**: Handles communication with the backend (BFF compliant).
- **StateManager**: Centralized state store (Redux-lite pattern) for managing table data, pagination, and filters.
- **TableRenderer**: converting state into optimized DOM elements.
- **Transformers**: Plugin system for transforming cell data (links, badges, ontology terms).
