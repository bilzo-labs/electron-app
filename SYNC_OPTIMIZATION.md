# Sync Optimization - Implementation Summary

## Overview

Implemented an intelligent receipt sync system that tracks the last synced receipt to avoid redundant syncing and reduce database load.

## Key Changes

### 1. **Last Receipt Date Tracking**
- Added `lastSyncedReceiptDate` to track the timestamp of the most recent synced receipt
- Stored persistently in electron-store
- Updated after each successful sync

### 2. **Smart SQL Queries**
- Modified `getRecentReceipts()` to accept optional `sinceDate` parameter
- SQL queries now use `WHERE InvoiceDate > @sinceDate` instead of fixed 24-hour window
- Implemented across all POS types:
  - HDPOS: `main/sql-queries-hdpos.js`
  - QuickBill: `main/sql-queries-quickbill.js`
  - Generic: `main/sql-connector.js`

### 3. **In-Memory Queue System**
- Replaced persistent `syncedReceipts` array with in-memory queues
- `syncQueue`: Active receipts being processed
- `failedQueue`: Failed receipts awaiting retry
- Queues cleared after each sync cycle

### 4. **Optional Server Synchronization**
- Added `LAST_SYNCED_RECEIPT_ENDPOINT` configuration
- Fetches last synced date from server before each sync
- Uses the more recent date between local and server
- Helps maintain sync state across multiple clients or after reinstalls

## Benefits

### Performance
- **Reduced SQL Load**: Only queries new receipts, not entire 24-hour window
- **Faster Queries**: Smaller result sets = faster response times
- **Less Network Traffic**: Fewer duplicate API calls

### Reliability
- **No Duplicate Syncs**: Receipts only synced once
- **Resume from Last Position**: Continues from where it left off after restart
- **Multi-Client Sync**: Server endpoint keeps multiple instances aligned

### Storage Efficiency
- **Minimal Local Storage**: Only stores last date (not thousands of receipt IDs)
- **In-Memory Processing**: No disk I/O during active sync
- **Auto-Cleanup**: Queues cleared after processing

## Configuration

### Required
No additional configuration required - works out of the box with local tracking.

### Optional - Server Sync Endpoint

**Add to `.env`:**
```env
LAST_SYNCED_RECEIPT_ENDPOINT=/api/v1/receipts/last-synced?storeId={STORE_ID}
```

**API Response Format:**
```json
{
  "lastSyncedDate": "2024-01-15T10:30:00.000Z",
  "storeId": "STORE123",
  "receiptCount": 1543
}
```

**Placeholders:**
- `{STORE_ID}` - Replaced with `STORE_ID` from .env
- `{ORGANIZATION_ID}` - Replaced with `ORGANIZATION_ID` from .env

## Technical Implementation

### File Changes

#### `main/sync-service.js`
- Added `lastSyncedReceiptDate` property
- Converted to in-memory queue system (`syncQueue`, `failedQueue`)
- Added `fetchLastSyncedFromServer()` method
- Updated `processReceipts()` to track latest receipt date
- Modified `runSync()` to pass `sinceDate` to SQL queries

#### `main/sql-connector.js`
- Updated `getRecentReceipts(limit, sinceDate)` signature
- Added parameterized date filtering
- Changed order to `ASC` for chronological processing

#### `main/sql-queries-hdpos.js`
- Added `sinceDate` parameter support
- Updated query with dynamic date filter
- Changed order to `ASC`

#### `main/sql-queries-quickbill.js`
- Added `sinceDate` parameter to placeholder queries
- Updated TODO comments with new signature

#### `shared/config.js`
- Added `lastSyncedEndpoint` to `receiptApi` config

#### `.env.example`
- Added `LAST_SYNCED_RECEIPT_ENDPOINT` configuration

## Usage Examples

### First Sync (No History)
```
1. lastSyncedReceiptDate = null
2. Query: WHERE InvoiceDate >= DATEADD(hour, -24, GETDATE())
3. Syncs all receipts from last 24 hours
4. Updates lastSyncedReceiptDate to most recent receipt date
```

### Subsequent Syncs
```
1. lastSyncedReceiptDate = "2024-01-15T10:30:00.000Z"
2. Query: WHERE InvoiceDate > '2024-01-15T10:30:00.000Z'
3. Only syncs NEW receipts after that date
4. Updates lastSyncedReceiptDate to latest receipt
```

### With Server Endpoint
```
1. Fetch lastSyncedDate from server
2. Compare with local lastSyncedReceiptDate
3. Use more recent date
4. Query for receipts after that date
5. Sync and update both local and (via API) server
```

## Monitoring

### Stats Available via `getStats()`
```javascript
{
  totalSynced: 1543,
  totalFailed: 2,
  lastSyncTime: "2024-01-15T12:00:00Z",
  lastSyncedReceiptDate: "2024-01-15T11:55:30Z",
  isSyncing: false,
  queueSize: 0,
  failedCount: 2,
  lastError: null
}
```

### Console Logs
```
SQL Connector initialized for POS Type: HDPOS
Last synced receipt date: 2024-01-15T10:30:00.000Z
Starting receipt sync...
Fetching receipts since: 2024-01-15T10:30:00.000Z
Found 5 receipts to process
✓ Synced receipt: INV-001 (2024-01-15T10:31:00.000Z)
✓ Synced receipt: INV-002 (2024-01-15T10:32:00.000Z)
```

## Migration from Old System

The system automatically migrates:

**Old System:**
- Stored all synced receipt IDs in `syncedReceipts` array
- Queried last 24 hours every time
- Filtered duplicates in memory

**New System:**
- Only stores last synced date
- Queries only new receipts
- No in-memory filtering needed

**Migration:**
On first run with new code, the system will:
1. Check for `lastSyncedReceiptDate` (doesn't exist yet)
2. Fall back to 24-hour query
3. Sync receipts and establish `lastSyncedReceiptDate`
4. Future syncs use optimized queries

Old `syncedReceipts` array can be manually removed from electron-store if desired.

## Testing

### Test Scenarios

1. **First Run (No History)**
   - Should sync last 24 hours
   - Should set lastSyncedReceiptDate

2. **Subsequent Run**
   - Should only query new receipts
   - Should skip already-synced receipts

3. **Server Endpoint (if configured)**
   - Should fetch from server
   - Should use more recent date
   - Should handle server errors gracefully

4. **Failed Receipts**
   - Should retry from failedQueue
   - Should update date on success
   - Should respect retry limits

5. **Restart After Crash**
   - Should resume from lastSyncedReceiptDate
   - Should not re-sync old receipts

## Future Enhancements

Potential improvements:

1. **Batch Date Updates**: Update server with last synced date after each batch
2. **Conflict Resolution**: Handle out-of-order receipt syncs
3. **Gap Detection**: Detect and fill gaps in synced receipts
4. **Performance Metrics**: Track query times and optimize further
5. **Configurable Lookback**: Option to resync receipts within X hours

## Support

For issues or questions:
- Check console logs for sync status
- Verify `lastSyncedReceiptDate` in stats
- Review SQL query logs
- Test server endpoint (if configured)
