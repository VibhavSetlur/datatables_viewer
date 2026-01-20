# Production Deployment Checklist

Use this checklist before deploying DataTables Viewer to production.

## Pre-Deployment Verification

### Code Quality
- [x] All TypeScript type checks pass (`npm run typecheck`)
- [x] All linting checks pass (`npm run lint`)
- [x] All unit tests pass (`npm test`)
- [x] No console errors in development build
- [x] Code follows project style guidelines

### Build & Assets
- [x] Production build succeeds (`npm run build`)
- [x] Build output is in `dist/` directory
- [x] All assets are included in build
- [x] Source maps configured (optional for production)
- [x] Bundle sizes are acceptable (< 300KB gzipped)

### Configuration
- [x] Environment variables documented
- [x] `VITE_API_URL` set correctly (if using TableScanner)
- [x] Config files validated (`npm run validate-config`)
- [x] Default config exists and is valid
- [x] Database mappings are correct

### Security
- [x] SQL injection prevention verified
- [x] Input validation in place
- [x] Column name validation implemented
- [x] Error messages don't expose sensitive data
- [x] No hardcoded secrets or tokens

### Documentation
- [x] README.md is up to date
- [x] Deployment guide is accurate
- [x] API documentation is complete
- [x] Configuration guide is clear
- [x] Troubleshooting guide exists

### Testing
- [x] Unit tests cover core functionality
- [x] Manual testing completed
- [x] Error scenarios tested
- [x] Browser compatibility verified
- [x] Performance benchmarks met

## Deployment Steps

### 1. Build for Production
```bash
# Set API URL if using TableScanner service
export VITE_API_URL=https://appdev.kbase.us/services/berdl_table_scanner

# Build
npm run build
```

### 2. Verify Build Output
```bash
# Check dist/ directory
ls -la dist/

# Verify files exist:
# - dist/index.html
# - dist/assets/*.js
# - dist/assets/*.css
# - dist/config/*.json (if any)
```

### 3. Deploy Static Files
- [ ] Upload `dist/` contents to hosting service
- [ ] Configure web server (if needed)
- [ ] Set up CDN (if using)
- [ ] Configure CORS (if needed)

### 4. Deploy Database Files
- [ ] Place database files in `/data/` directory
- [ ] Verify file permissions
- [ ] Test database access

### 5. Deploy Config Files
- [ ] Place config files in `/config/` directory
- [ ] Validate all configs (`npm run validate-config`)
- [ ] Update `index.json` if needed

## Post-Deployment Verification

### Functional Testing
- [ ] Application loads without errors
- [ ] Database loads successfully
- [ ] Tables are displayed correctly
- [ ] Filtering works
- [ ] Sorting works
- [ ] Pagination works
- [ ] Export functions work
- [ ] Search works

### Performance Testing
- [ ] Initial load time < 2s
- [ ] Database load time acceptable
- [ ] Query response time < 500ms
- [ ] No memory leaks observed
- [ ] Smooth scrolling/rendering

### Error Handling
- [ ] Error messages are user-friendly
- [ ] Network errors handled gracefully
- [ ] Invalid input handled properly
- [ ] Missing data handled correctly

### Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

## Monitoring Setup

### Error Tracking (Optional)
- [ ] Error tracking service configured
- [ ] Error alerts set up
- [ ] Log aggregation configured

### Performance Monitoring (Optional)
- [ ] Performance metrics collection
- [ ] Query performance tracking
- [ ] User interaction analytics

### Health Checks
- [ ] Health check endpoint (if applicable)
- [ ] Uptime monitoring
- [ ] Alert notifications configured

## Rollback Plan

### If Issues Occur
1. [ ] Identify the issue
2. [ ] Check error logs
3. [ ] Revert to previous version if needed
4. [ ] Document the issue
5. [ ] Fix and redeploy

### Rollback Steps
```bash
# Revert to previous build
git checkout <previous-commit>
npm run build
# Redeploy dist/ directory
```

## Sign-Off

- [ ] Code review completed
- [ ] Security review completed
- [ ] Performance review completed
- [ ] Documentation review completed
- [ ] Stakeholder approval obtained

**Deployment Date**: _______________
**Deployed By**: _______________
**Version**: 3.0.0
**Environment**: _______________

## Notes

_Add any deployment-specific notes or issues here_
