# Contributing to KBase Table Renderer

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Setup

```bash
# Serve the project locally
python -m http.server 8080

# Open http://localhost:8080 in your browser
```

## Code Standards

### JavaScript
- Use ES6+ features (arrow functions, const/let, template literals)
- Document functions with JSDoc comments
- Use meaningful variable and function names
- Keep functions small and focused

### CSS
- Use CSS custom properties for theming
- Follow BEM-like naming conventions (e.g., `.ts-table`, `.ts-table__header`)
- Support both dark and light modes

### HTML
- Use semantic HTML5 elements
- Ensure accessibility (ARIA labels, keyboard navigation)
- Keep markup clean and well-indented

## Pull Request Process

1. Update documentation if needed
2. Test your changes in multiple browsers
3. Ensure no console errors
4. Create a pull request with a clear description

## Adding New Transformers

To add a new column transformer:

1. Add the transformer function to `js/transformers.js`
2. Document the options in `docs/CONFIG_GUIDE.md`
3. Add an example to a config file

Example:

```javascript
// In js/transformers.js
Transformers.myTransformer = (value, options, rowData) => {
    // Your transformation logic
    return transformedValue;
};
```

## Questions?

Open an issue for questions or suggestions.
