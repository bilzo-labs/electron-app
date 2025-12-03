# Project Structure

Complete overview of the Bilzo Receipt Sync Electron App structure.

## Directory Tree

```
receipt-sync-electron-app/
├── main/                           # Main Process (Node.js/Electron)
│   ├── index.js                    # Application entry point & IPC handlers
│   ├── tray.js                     # System tray management
│   ├── sync-service.js             # Background receipt sync service
│   ├── sql-connector.js            # SQL Server database connection
│   └── window-manager.js           # Window lifecycle management
│
├── renderer/                       # Renderer Process (UI)
│   ├── index.html                  # Main UI structure
│   ├── styles.css                  # Application styling
│   ├── app.js                      # UI logic & event handling
│   └── preload.js                  # IPC bridge (contextBridge)
│
├── shared/                         # Shared Configuration
│   └── config.js                   # Environment & app configuration
│
├── assets/                         # Icons & Resources
│   ├── icon-idle.png              # Tray icon - idle state (16x16)
│   ├── icon-syncing.png           # Tray icon - syncing state (16x16)
│   ├── icon-error.png             # Tray icon - error state (16x16)
│   ├── icon.ico                   # Windows app icon (256x256)
│   ├── create-icons.js            # Icon generation helper script
│   └── ICONS_README.md            # Icon creation instructions
│
├── dist/                           # Build output (generated)
│   └── [installers & packages]
│
├── node_modules/                   # Dependencies (generated)
│
├── .env                            # Environment variables (DO NOT COMMIT)
├── .env.example                    # Environment template
├── .gitignore                      # Git ignore rules
├── package.json                    # NPM configuration & scripts
├── setup.sh                        # Unix/Mac setup script
├── setup.bat                       # Windows setup script
├── README.md                       # Main documentation
└── PROJECT_STRUCTURE.md            # This file

```

## File Descriptions

### Main Process Files

#### `main/index.js`
- **Purpose**: Application entry point
- **Features**:
  - Initializes Electron app
  - Creates window and tray managers
  - Sets up IPC handlers for renderer communication
  - Manages app lifecycle (ready, quit, etc.)
  - Handles single instance lock
- **Key Functions**:
  - `app.whenReady()` - Initialization
  - `ipcMain.handle()` - API request handlers

#### `main/tray.js`
- **Purpose**: System tray management
- **Features**:
  - Creates tray icon
  - Updates icon based on sync status
  - Manages context menu
  - Handles tray click events
- **States**: idle, syncing, error
- **Class**: `TrayManager`

#### `main/sync-service.js`
- **Purpose**: Background receipt synchronization
- **Features**:
  - Scheduled sync every N minutes
  - Fetches receipts from SQL Server
  - Transforms data to API format
  - Sends to remote Receipt API
  - Retry logic for failed syncs
  - Offline queue management
- **Key Methods**:
  - `start()` - Start scheduled sync
  - `runSync()` - Execute sync operation
  - `processReceipts()` - Batch processing
  - `retryFailedReceipts()` - Retry logic
  - `transformReceiptData()` - Data transformation
- **Class**: `SyncService`

#### `main/sql-connector.js`
- **Purpose**: SQL Server database integration
- **Features**:
  - Connection pooling
  - Receipt queries
  - Error handling
  - Health checks
- **Key Methods**:
  - `connect()` - Establish connection
  - `getRecentReceipts()` - Fetch receipt list
  - `getReceiptDetails()` - Fetch full receipt data
  - `isHealthy()` - Connection status
- **Singleton**: `sqlConnector`

#### `main/window-manager.js`
- **Purpose**: Main window lifecycle management
- **Features**:
  - Creates popup window
  - Positions in bottom-right corner
  - Hide instead of close behavior
  - IPC communication to renderer
- **Key Methods**:
  - `create()` - Create window
  - `show()` / `hide()` / `toggle()` - Visibility
  - `sendToRenderer()` - Send data to UI
- **Class**: `WindowManager`

### Renderer Process Files

#### `renderer/index.html`
- **Purpose**: Main UI structure
- **Features**:
  - 4 tabs: Customer, Coupon, Loyalty, Sync
  - Form inputs for validation
  - Result display containers
  - Message notifications
- **Layout**: Header → Tabs → Content → Messages

#### `renderer/styles.css`
- **Purpose**: Application styling
- **Features**:
  - Modern gradient design
  - Responsive components
  - Tab navigation styling
  - Form and button styles
  - Animation effects
  - Custom scrollbar
- **Theme**: Purple gradient (#667eea → #764ba2)

#### `renderer/app.js`
- **Purpose**: UI logic and event handling
- **Features**:
  - Tab navigation
  - Form validation
  - API calls via IPC
  - Result display
  - Message notifications
  - Auto-refresh sync status
- **Key Functions**:
  - `handleCustomerSearch()` - Customer lookup
  - `handleCouponValidation()` - Coupon validation
  - `handleLoyaltyCheck()` - Loyalty points check
  - `updateSyncStatus()` - Sync stats refresh

#### `renderer/preload.js`
- **Purpose**: Secure IPC bridge
- **Features**:
  - Exposes safe API to renderer
  - Uses contextBridge for security
  - Prevents Node.js exposure
- **Exposed API**: `window.electronAPI`

### Shared Files

#### `shared/config.js`
- **Purpose**: Centralized configuration
- **Features**:
  - Reads from .env
  - SQL Server settings
  - API endpoints
  - Sync parameters
  - Window dimensions
  - Validation logic
- **Exports**: `config` object, `validateConfig()` function

### Configuration Files

#### `.env`
- **Purpose**: Environment variables (secret)
- **Contents**:
  - SQL Server credentials
  - API keys
  - Sync settings
  - Feature flags
- **Security**: Never commit to Git

#### `.env.example`
- **Purpose**: Template for .env
- **Usage**: Copy to .env and configure

#### `package.json`
- **Purpose**: NPM configuration
- **Scripts**:
  - `npm start` - Run app
  - `npm run dev` - Dev mode with auto-reload
  - `npm run build` - Build installer
  - `npm run build:win` - Windows-specific build
- **Dependencies**: Electron, mssql, axios, etc.

## Data Flow

### Receipt Sync Flow

```
SQL Server
    ↓
sqlConnector.getRecentReceipts()
    ↓
syncService.processReceipts()
    ↓
transformReceiptData()
    ↓
sendToReceiptAPI()
    ↓
Remote API (https://sls.bilzo.in)
    ↓
Success → Mark as synced
Failure → Add to retry queue
```

### UI Interaction Flow

```
User Input (renderer/app.js)
    ↓
IPC Call (window.electronAPI.*)
    ↓
Main Process Handler (main/index.js)
    ↓
API Request (axios)
    ↓
Response
    ↓
IPC Response
    ↓
Display Result (renderer/app.js)
```

## Key Technologies

- **Electron**: Desktop app framework
- **Node.js**: Runtime environment
- **mssql**: SQL Server connector
- **axios**: HTTP client
- **node-schedule**: Task scheduling
- **electron-store**: Data persistence
- **electron-builder**: App packaging

## Build Process

1. **Development**:
   ```bash
   npm run dev
   ```
   - Runs with nodemon
   - Auto-reload on changes
   - DevTools enabled

2. **Production Build**:
   ```bash
   npm run build:win
   ```
   - Compiles renderer
   - Packages main process
   - Creates NSIS installer
   - Output: `dist/Bilzo Receipt Sync Setup.exe`

## Storage

### electron-store Locations

**Development**:
```
~/AppData/Roaming/receipt-sync-electron-app/config.json
```

**Production**:
```
%APPDATA%/Bilzo Receipt Sync/config.json
```

### Stored Data

- `lastSyncTime`: Last successful sync timestamp
- `syncedReceipts`: Array of synced receipt IDs
- `failedReceipts`: Queue of failed syncs
- `totalSynced`: Total receipts synced
- `totalFailed`: Total failed syncs

## Security

### Content Security Policy
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               style-src 'self' 'unsafe-inline';
               script-src 'self' 'unsafe-inline'">
```

### IPC Security
- `nodeIntegration: false`
- `contextIsolation: true`
- `enableRemoteModule: false`
- Uses preload script with contextBridge

### Credentials
- API keys in .env (not in code)
- SQL credentials encrypted in production
- HTTPS for all API calls

## Performance Considerations

- Connection pooling for SQL Server
- Batch processing (50 receipts/batch)
- Lazy loading of receipt details
- Debounced search inputs
- Minimal renderer memory (~50MB)
- Total footprint: ~150MB

## Error Handling

- SQL connection errors: Retry with backoff
- API errors: Queue for retry (up to 3 attempts)
- Network errors: Offline queue
- User errors: Toast notifications
- Uncaught exceptions: Logged to console

## Future Enhancements

- [ ] Settings window for configuration
- [ ] Multi-language support
- [ ] Receipt history viewer
- [ ] Advanced filtering
- [ ] Export sync reports
- [ ] Notification sounds
- [ ] Database backup/restore
- [ ] Multiple store support

---

**Last Updated**: 2025-11-19
