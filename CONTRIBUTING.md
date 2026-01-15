# Contributing to DataTables Viewer

Thank you for your interest in contributing!

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd DataTables_Viewer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

## Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow TypeScript best practices
   - Add tests for new features
   - Update documentation

3. **Test your changes**
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

4. **Commit your changes**
   ```bash
   git commit -m "Add: your feature description"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Use meaningful variable names
- Add JSDoc comments for public APIs
- Run `npm run lint` before committing

## Testing

- Write unit tests for new features
- Ensure all tests pass: `npm test`
- Check coverage: `npm run test:coverage`

## Documentation

- Update relevant docs when adding features
- Keep README.md up to date
- Add examples for new features

## What to Commit

### ✅ Do Commit
- Source code changes
- Documentation updates
- Configuration files
- Built `dist/` folder (for deployment)

### ❌ Don't Commit
- Database files (`.db`)
- Node modules (`node_modules/`)
- Environment files (`.env`)
- Personal/archive files

## Questions?

Open an issue or contact the maintainers.
