# Bilzo Receipt Sync - Electron App

Windows Taskbar application for automatic receipt syncing and customer validation portal.

## Features

- **System Tray Integration**: Runs silently in Windows taskbar
- **Automatic Receipt Sync**: Syncs receipts from SQL Server to remote API every 5 minutes
- **Customer Validation Portal**: Quick lookup for customers, coupons, and loyalty points
- **Offline Support**: Queues failed syncs and retries automatically
- **Auto-start**: Optional Windows boot integration
- **Lightweight**: Minimal memory footprint (~150MB)

## Architecture

```
receipt-sync-electron-app/
├── main/                    # Main process (Electron/Node.js)
│   ├── index.js            # Application entry point
│   ├── tray.js             # System tray management
│   ├── sync-service.js     # Background sync service
│   ├── sql-connector.js    # SQL Server integration
│   └── window-manager.js   # Window management
├── renderer/               # Renderer process (UI)
│   ├── index.html         # Main UI
│   ├── styles.css         # Styling
│   ├── app.js             # UI logic
│   └── preload.js         # IPC bridge
├── shared/
│   └── config.js          # Configuration management
└── assets/                # Icons and resources
```

## Prerequisites

- **Node.js**: v18 or higher
- **Windows OS**: Windows 10/11 (for production deployment)
- **SQL Server**: Access to local SQL Server database
- **Network**: Access to Bilzo API endpoints

## Running SQL Server via Docker

If you don't have SQL Server installed locally, you can run it using Docker. The setup differs based on your system architecture.

### ARM64 Devices (Apple Silicon, ARM-based systems)

**Recommended: Use Azure SQL Edge** (has native ARM64 support)

```bash
docker run -d --name SQL_Edge_Docker \
  -e 'ACCEPT_EULA=1' \
  -e 'MSSQL_SA_PASSWORD=veryStrongPassword' \
  -p 1433:1433 \
  mcr.microsoft.com/azure-sql-edge:latest
```

Azure SQL Edge is compatible with most SQL Server features and runs natively on ARM64.

### AMD64 Devices (Intel/AMD processors)

**Use SQL Server 2022:**

```bash
docker run -d --name SQL_Server_Docker \
  -e 'ACCEPT_EULA=Y' \
  -e 'MSSQL_SA_PASSWORD=Bilzo@123456789' \
  -p 1433:1433 \
  mcr.microsoft.com/mssql/server:2022-latest
```

### Running AMD64 on ARM64 (Apple Silicon with Rosetta 2)

If you need full SQL Server 2022 features on Apple Silicon:

1. Enable Rosetta emulation in Docker Desktop:
   - Go to **Settings → General**
   - Enable **"Use Rosetta for x86_64/amd64 emulation on Apple Silicon"**
   - Restart Docker Desktop

2. Run with platform flag:

```bash
docker run -d --name SQL_Server_Docker \
  --platform linux/amd64 \
  -e 'ACCEPT_EULA=Y' \
  -e 'MSSQL_SA_PASSWORD=veryStrongPassword' \
  -p 1433:1433 \
  mcr.microsoft.com/mssql/server:2022-latest
```

⚠️ **Note**: This runs slower due to emulation overhead.

### Password Requirements

Your SQL Server password must meet these requirements:
- At least 8 characters
- Contains uppercase letters
- Contains lowercase letters
- Contains numbers
- Contains special characters

### Verifying the Container

Check if the container is running:

```bash
docker ps
```

You should see your SQL container in the list.

View container logs:

```bash
docker logs SQL_Server_Docker
# or for Azure SQL Edge
docker logs SQL_Edge_Docker
```

### Connecting to the Docker SQL Server

Update your `.env` file with these settings:

```env
SQL_USER=sa
SQL_PASSWORD=veryStrongPassword
SQL_SERVER=localhost
SQL_DATABASE=master
SQL_PORT=1433
SQL_INSTANCE_NAME=
```

**Note**: Leave `SQL_INSTANCE_NAME` empty when using Docker.

### Managing the Container

**Stop the container:**
```bash
docker stop SQL_Server_Docker
```

**Start the container:**
```bash
docker start SQL_Server_Docker
```

**Remove the container:**
```bash
docker stop SQL_Server_Docker
docker rm SQL_Server_Docker
```

**Persist data with volumes:**

To keep your data even after removing the container, add a volume:

```bash
docker run -d --name SQL_Server_Docker \
  -e 'ACCEPT_EULA=Y' \
  -e 'MSSQL_SA_PASSWORD=veryStrongPassword' \
  -p 1433:1433 \
  -v sql_data:/var/opt/mssql \
  mcr.microsoft.com/mssql/server:2022-latest
```

### Creating Your Database

Once the container is running, connect using a SQL client and create your database:

```sql
CREATE DATABASE your_database_name;
```

Then update `SQL_DATABASE` in your `.env` file accordingly.

## Installation

### 1. Clone or Copy the Project

```bash
cd /Users/anatta/my-project/receipt-sync-electron-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# SQL Server Configuration
SQL_USER=your_sql_username
SQL_PASSWORD=your_sql_password
SQL_SERVER=localhost
SQL_DATABASE=your_database_name
SQL_PORT=50283
SQL_INSTANCE_NAME=SQLEXPRESS

# Receipt API Configuration
RECEIPT_API_URL=https://sls.bilzo.in
RECEIPT_API_KEY=your_api_key_here

# Validation API Configuration
VALIDATION_API_URL=https://sls.bilzo.in
VALIDATION_API_KEY=your_validation_api_key

# Sync Configuration
SYNC_INTERVAL_MINUTES=5
SYNC_ENABLED=true

# Application Configuration
NODE_ENV=production
DEBUG=false
AUTO_START_ON_BOOT=true

# Store Configuration
STORE_ID=your_store_id
ORGANIZATION_ID=your_org_id
CASH_REGISTER_ID=your_register_id
```

### 4. Add Application Icons

**Important**: Before building, add icon files to the `assets/` directory:

- `icon-idle.png` (16x16) - Tray icon when idle
- `icon-syncing.png` (16x16) - Tray icon when syncing
- `icon-error.png` (16x16) - Tray icon on error
- `icon.ico` (256x256) - Main Windows application icon

**Use Bilzo Favicon**: Copy the Bilzo favicon from your website/branding assets and convert to the required formats.

See `assets/ICONS_README.md` for detailed instructions.

## Development

### Run in Development Mode

```bash
npm run dev
```

This will start the app with auto-reload on file changes.

### Enable Debug Mode

Set `DEBUG=true` in `.env` to enable DevTools and verbose logging.

## Building for Production

### Build Windows Installer

```bash
npm run build:win
```

This creates an installer in the `dist/` directory.

### Package Without Installer

```bash
npm run package
```

Creates a portable version in `dist/`.

## Usage

### First Launch

1. Double-click the app or run from Start Menu
2. App appears in the system tray (bottom-right corner)
3. Initial SQL Server connection test runs
4. Background sync starts after 10 seconds

### Accessing the Validation Portal

**Method 1**: Click the tray icon

**Method 2**: Right-click tray icon → "Open Validation Portal"

### Using the Validation Portal

#### Customer Lookup Tab
1. Enter 10-digit mobile number
2. Click "Search Customer"
3. View customer profile, loyalty points, and purchase history

#### Coupon Validation Tab
1. Enter coupon code
2. Optionally enter customer mobile
3. Click "Validate Coupon"
4. See discount details and validity

#### Loyalty Points Tab
1. Enter customer mobile number
2. Click "Check Loyalty Points"
3. View available points, earned/redeemed totals, and tier level

#### Sync Status Tab
1. View sync statistics
2. Check SQL Server connection status
3. Manually trigger sync with "Sync Now" button
4. View last sync time and success/failure counts

### Tray Menu Options

- **Open Validation Portal**: Show main window
- **Sync Now**: Force immediate sync
- **Sync Stats**: View sync statistics
- **Settings**: (Future feature)
- **Quit**: Close application completely

## How It Works

### Background Sync Process

1. **Initial Connection**: App connects to SQL Server on startup
2. **Scheduled Sync**: Every 5 minutes (configurable):
   - Queries recent receipts from SQL Server
   - Transforms data to API format
   - Sends to remote receipt API
   - Tracks success/failures
3. **Retry Logic**: Failed receipts are retried up to 3 times
4. **Offline Queue**: Network failures queue receipts for later sync
5. **Persistence**: Sync state saved using electron-store

### Data Flow

```
SQL Server → SQL Connector → Sync Service → Transform → Receipt API
                                    ↓
                            electron-store (queue)
                                    ↓
                            Retry on failure
```

### API Integration

The app connects to two API endpoints:

1. **Receipt API** (`/api/v1/receipts`): Receives synced receipt data
2. **Validation API**: Multiple endpoints for customer/coupon/loyalty lookups

## Configuration

### Sync Interval

Change sync frequency in `.env`:

```env
SYNC_INTERVAL_MINUTES=10  # Sync every 10 minutes
```

### Batch Size

Modify in `shared/config.js`:

```javascript
batchSize: 100  // Sync up to 100 receipts per batch
```

### Auto-start on Boot

Enable/disable in `.env`:

```env
AUTO_START_ON_BOOT=true
```

## Troubleshooting

### App Won't Start

1. Check `.env` file exists and is configured
2. Verify SQL Server credentials
3. Check Node.js version: `node --version` (should be v18+)
4. Run with debug: Set `DEBUG=true` in `.env`

### SQL Connection Fails

1. Verify SQL Server is running
2. Check firewall settings (port 50283)
3. Confirm credentials in `.env`
4. Test connection:
   - Open app
   - Click tray icon
   - Go to "Sync Status" tab
   - Check "SQL Connection" status

### Sync Not Working

1. Check "Sync Status" tab for errors
2. Verify `SYNC_ENABLED=true` in `.env`
3. Check API key configuration
4. Review logs (check console in Debug mode)
5. Test network connectivity to API endpoints

### Icons Not Showing

1. Ensure icon files exist in `assets/` directory
2. Verify file names match exactly:
   - `icon-idle.png`
   - `icon-syncing.png`
   - `icon-error.png`
   - `icon.ico`
3. Rebuild the app: `npm run build:win`

### Memory Issues

- Default memory limit: ~150MB
- If higher, check for:
  - Memory leaks in sync service
  - Too many queued receipts
  - Large batch sizes
- Solution: Reduce `batchSize` in config

## API Endpoints Reference

### Receipt API

**POST** `/api/v1/receipts`

Headers:
```
Content-Type: application/json
x-api-key: {RECEIPT_API_KEY}
```

Payload: See `sync-service.js` → `transformReceiptData()`

### Validation API

**POST** `/api/v1/coupons/validate`
```json
{
  "couponCode": "SAVE20",
  "mobile": "9876543210"
}
```

**GET** `/api/v1/loyalty/points?mobile=9876543210`

**GET** `/api/v1/customers/profile?mobile=9876543210`

## Security Notes

- API keys stored in `.env` (never commit to version control)
- SQL credentials encrypted in production builds
- HTTPS required for all API communication
- Content Security Policy enabled in renderer

## Performance Optimization

- Lazy loading of receipt details
- Debounced search inputs
- Connection pooling for SQL Server
- Efficient DOM updates in UI
- Minimal renderer process weight

## Logs

### View Logs

**Development**: Check terminal output

**Production**:
- Windows Event Viewer
- App data folder: `%APPDATA%/receipt-sync-electron-app/logs/`

### Log Levels

- `INFO`: Normal operations
- `WARN`: Non-critical issues
- `ERROR`: Sync failures, connection issues

## Updating

### Update Dependencies

```bash
npm update
```

### Update Configuration

1. Stop the app (right-click tray → Quit)
2. Edit `.env` file
3. Restart the app

### Update Code

1. Pull latest changes
2. Run `npm install`
3. Rebuild: `npm run build:win`
4. Install new version

## Uninstall

1. Quit the app (right-click tray → Quit)
2. Go to Windows Settings → Apps
3. Find "Bilzo Receipt Sync"
4. Click Uninstall

## Support

For issues or questions:

1. Check this README
2. Review logs for errors
3. Contact Bilzo Support
4. GitHub Issues (if repository is available)

## License

MIT License - Bilzo Labs

## Credits

Built with:
- [Electron](https://www.electronjs.org/)
- [mssql](https://www.npmjs.com/package/mssql) - SQL Server connector
- [node-schedule](https://www.npmjs.com/package/node-schedule) - Task scheduling
- [electron-store](https://www.npmjs.com/package/electron-store) - Data persistence
- [axios](https://axios-http.com/) - HTTP client

---

**Version**: 1.0.0
**Last Updated**: 2025-11-19
