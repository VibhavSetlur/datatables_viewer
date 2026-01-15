# Testing Guide

This guide covers how to test the DataTables Viewer with your databases and configurations.

## Quick Start Testing

### 1. Test with Existing Database

If you have a database file ready:

```bash
# Start TableScanner service (if using remote API)
cd server
npm start

# In another terminal, start the frontend
npm run dev
```

Open `http://localhost:5173?db=your-database-name` (without `.db` extension)

### 2. Test with URL Parameters

The viewer supports loading databases via URL:

```
http://localhost:5173?db=genomes
```

This will:
- Load `/data/genomes.db`
- Look for `/config/genomes.json`
- Display the data with appropriate configuration

## Testing Local Databases

### Adding a Test Database

1. **Place database file:**
   ```bash
   cp /path/to/your/database.db public/data/your-database.db
   ```

2. **Generate config (recommended):**
   ```bash
   npm run generate-config public/data/your-database.db your-database-config
   ```

3. **Or create config manually:**
   - Create `public/config/your-database.json`
   - Follow the schema in `public/config/schemas/config.schema.json`

4. **Test:**
   ```bash
   npm run dev
   ```
   Open: `http://localhost:5173?db=your-database`

### Testing with LocalDbClient

For client-side testing (no server needed):

1. **Add to LOCAL_DB_MAP** in `src/core/api/LocalDbClient.ts`:
   ```typescript
   const LOCAL_DB_MAP: Record<string, LocalDbConfig> = {
       'test/test/0': {
           upa: 'test/test/0',
           dbPath: '/data/berdl_tables_ecoli_562_61143.db',
           configPath: '/config/berdl-tables.json'
       },
       'your/test/1': {  // Add your mapping
           upa: 'your/test/1',
           dbPath: '/data/your-database.db',
           configPath: '/config/your-config.json'
       }
   };
   ```

2. **Test in browser:**
   - The viewer will use `LocalDbClient` for `test/test/*` UPAs
   - No server required

## Testing Server-Side Queries

### Start Integrated Server

```bash
cd server
npm start
```

### Test Endpoints

**Health Check:**
```bash
curl https://appdev.kbase.us/services/berdl_table_scanner/health
```

**List Tables:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
     https://appdev.kbase.us/services/berdl_table_scanner/object/your-database/tables
```

**Get Table Data:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
     "https://appdev.kbase.us/services/berdl_table_scanner/object/your-database/tables/your-table/data?limit=10"
```

**Get Schema:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
     https://appdev.kbase.us/services/berdl_table_scanner/schema/your-database/tables/your-table
```

**Get Statistics:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
     https://appdev.kbase.us/services/berdl_table_scanner/object/your-database/tables/your-table/stats
```

### Test Advanced Features

**Numeric Filtering:**
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     https://appdev.kbase.us/services/berdl_table_scanner/table-data \
  -d '{
    "berdl_table_id": "local/your-database",
    "table_name": "your-table",
    "filters": [
      {
        "column": "numeric_column",
        "operator": "gt",
        "value": 50
      }
    ]
  }'
```

**Aggregations:**
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     https://appdev.kbase.us/services/berdl_table_scanner/api/aggregate/your-database/tables/your-table \
  -H "Content-Type: application/json" \
  -d '{
    "group_by": ["category"],
    "aggregations": [
      {
        "column": "value",
        "function": "sum",
        "alias": "total"
      }
    ]
  }'
```

## Testing Configurations

### Validate Config

```bash
npm run validate-config public/config/your-config.json
```

### Test Config Loading

1. **Add to index.json:**
   ```json
   {
     "dataTypes": {
       "your_data_type": {
         "configUrl": "/config/your-config.json",
         "matches": ["your-pattern"],
         "priority": 10,
         "autoLoad": true
       }
     }
   }
   ```

2. **Test in browser:**
   - Open viewer
   - Select data source matching your pattern
   - Verify config is loaded and applied

### Test Config Versioning

1. **Create version folder:**
   ```bash
   mkdir -p public/config/your-config/v1.0.0
   cp your-config.json public/config/your-config/v1.0.0/
   ```

2. **Create new version:**
   ```bash
   cp -r public/config/your-config/v1.0.0 public/config/your-config/v1.1.0
   # Edit v1.1.0/your-config.json
   ```

3. **Update configUrl in index.json:**
   ```json
   "configUrl": "/config/your-config/v1.1.0/your-config.json"
   ```

## Testing Numeric Filtering

### Verify Type Detection

1. **Check schema endpoint:**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
        https://appdev.kbase.us/services/berdl_table_scanner/schema/your-db/tables/your-table
   ```

2. **Verify column types:**
   - INTEGER columns should show `"type": "INTEGER"`
   - REAL columns should show `"type": "REAL"`

### Test Filter Conversion

**Test > operator on INTEGER column:**
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     https://appdev.kbase.us/services/berdl_table_scanner/table-data \
  -d '{
    "berdl_table_id": "local/your-db",
    "table_name": "your-table",
    "filters": [
      {
        "column": "contigs",
        "operator": "gt",
        "value": "50"
      }
    ]
  }'
```

**Expected:** Value `"50"` should be converted to number `50` before SQL binding.

**Verify in response:**
- Check `query_metadata.sql` - should show numeric comparison
- Check results - should return rows where contigs > 50

## Testing Performance

### Check Cache Stats

```bash
# Cache stats are managed by TableScanner service
# See TableScanner documentation for cache management
```

**Expected:**
- Database connections cached
- Query results cached (if repeated)
- Execution times tracked

### Test Query Caching

1. **First request:**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
        "https://appdev.kbase.us/services/berdl_table_scanner/object/your-db/tables/your-table/data?limit=100"
   ```
   - Note `execution_time_ms`
   - Should have `"cached": false`

2. **Second request (within 5 minutes):**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
        "https://appdev.kbase.us/services/berdl_table_scanner/object/your-db/tables/your-table/data?limit=100"
   ```
   - Should have `"cached": true`
   - Should have lower `execution_time_ms`

## Testing Error Cases

### Invalid Database

```bash
curl -H "Authorization: Bearer $TOKEN" \
     https://appdev.kbase.us/services/berdl_table_scanner/object/nonexistent/tables
```

**Expected:** `404` with error message

### Invalid Table

```bash
curl -H "Authorization: Bearer $TOKEN" \
     https://appdev.kbase.us/services/berdl_table_scanner/object/your-db/tables/nonexistent/data
```

**Expected:** `404` or `500` with error message

### Invalid Filter

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     https://appdev.kbase.us/services/berdl_table_scanner/table-data \
  -d '{
    "berdl_table_id": "local/your-db",
    "table_name": "your-table",
    "filters": [
      {
        "column": "nonexistent",
        "operator": "gt",
        "value": 50
      }
    ]
  }'
```

**Expected:** Error or empty results

## Browser Testing

### Open Browser Console

1. **Check for errors:**
   - Open DevTools (F12)
   - Check Console tab
   - Look for JavaScript errors

2. **Check network requests:**
   - Network tab
   - Verify API calls succeed
   - Check response formats

3. **Check schema loading:**
   - Look for schema fetch requests
   - Verify column types are loaded

### Test Filter Input

1. **Open viewer with database**
2. **Type in filter box:**
   - For numeric column: `>50` or `>=100`
   - For text column: `search term`
3. **Verify:**
   - Filter is applied correctly
   - Results update
   - Filter chip appears in sidebar

### Test Type-Aware Filtering

1. **Numeric column:**
   - Type `>50` in filter
   - Verify numeric comparison (not string)
   - Check query_metadata in response

2. **Text column:**
   - Type `search` in filter
   - Verify text search (LIKE)
   - Check query_metadata in response

## Automated Testing

### Run Unit Tests

```bash
npm test
```

### Run Type Checking

```bash
npm run typecheck
```

### Run Build

```bash
npm run build
```

## Troubleshooting Tests

### Database Not Found

**Problem:** `404 Database not found`

**Solutions:**
- Check database file exists in `public/data/` or `DATA_DIR`
- Verify database name matches (case-sensitive)
- Check file permissions

### Config Not Loading

**Problem:** Config not applied to database

**Solutions:**
- Verify config file exists
- Check `index.json` has correct mapping
- Verify `configUrl` path is correct
- Check browser console for errors

### Numeric Filters Not Working

**Problem:** Numeric filters return wrong results

**Solutions:**
- Check column type in schema endpoint
- Verify filter value is converted to number
- Check `query_metadata.sql` in response
- Ensure column type is INTEGER/REAL, not TEXT

### Performance Issues

**Problem:** Slow queries

**Solutions:**
- Check if indices are created (automatic)
- Verify query caching is working
- Check database file size
- Review execution_time_ms in responses

## Test Checklist

Before deploying:

- [ ] Database loads correctly
- [ ] Config is applied
- [ ] Tables are listed
- [ ] Data is displayed
- [ ] Numeric filters work
- [ ] Text filters work
- [ ] Sorting works
- [ ] Pagination works
- [ ] Schema endpoint works
- [ ] Statistics endpoint works
- [ ] Aggregations work
- [ ] Query caching works
- [ ] Error handling works
- [ ] Performance is acceptable
