# Quick Start Guide

Get the Bilzo Receipt Sync app running in 5 minutes.

## Prerequisites Checklist

- [ ] Windows 10/11 PC
- [ ] Node.js v18+ installed
- [ ] SQL Server access with credentials
- [ ] Bilzo API key
- [ ] Bilzo favicon/logo files

## Step 1: Setup Environment

### On Windows:

1. Open Command Prompt or PowerShell in the project directory
2. Run the setup script:
   ```cmd
   setup.bat
   ```

### On Mac/Linux (for development):

1. Open Terminal in the project directory
2. Run the setup script:
   ```bash
   ./setup.sh
   ```

## Step 2: Configure Environment Variables

Edit the `.env` file that was created:

```env
# Required - SQL Server
SQL_USER=sa
SQL_PASSWORD=YourPassword123
SQL_SERVER=localhost
SQL_DATABASE=YourRetailDB
SQL_PORT=50283

# Required - API Keys
RECEIPT_API_KEY=your_bilzo_api_key_here
VALIDATION_API_KEY=your_bilzo_api_key_here

# Optional - Store Info
STORE_ID=STORE001
ORGANIZATION_ID=ORG001
```

### Where to Get API Keys:
1. Log in to Bilzo Admin Portal
2. Go to Settings → API Keys
3. Copy your organization's API key

## Step 3: Add Icon Files

Copy the Bilzo favicon to the `assets/` folder and rename:

```
assets/
├── icon-idle.png       (16x16 - Use Bilzo favicon)
├── icon-syncing.png    (16x16 - Yellowish version)
├── icon-error.png      (16x16 - Reddish version)
└── icon.ico           (256x256 - Windows icon)
```

### Quick Icon Generation:

**Option 1**: Use online converter
- Go to https://favicon.io/favicon-converter/
- Upload Bilzo logo
- Download PNG and ICO files
- Rename and place in `assets/`

**Option 2**: Use existing favicon
- Download from `https://bilzo.in/favicon.ico`
- Convert to PNG using an image editor
- Create 3 color variations

## Step 4: Test Run

Run in development mode to test:

```bash
npm run dev
```

### What Should Happen:
1. App icon appears in system tray (bottom-right)
2. Console shows "SQL Server connected successfully"
3. First sync starts after 10 seconds
4. Click tray icon to open validation portal

### Troubleshooting First Run:

**Icon doesn't appear?**
- Check if app is running: Look for "Electron" in Task Manager
- Check assets/ folder for icon files

**SQL Connection fails?**
- Verify SQL Server is running
- Check credentials in .env
- Test with SQL Server Management Studio first

**Sync fails?**
- Check API key is correct
- Verify network connectivity
- Check RECEIPT_API_URL is accessible

## Step 5: Build for Production

Once everything works in dev mode:

```bash
npm run build:win
```

This creates an installer in `dist/` folder:
- `Bilzo Receipt Sync Setup 1.0.0.exe`

### Install on Target PC:

1. Copy the installer to the POS/cashier computer
2. Run the installer
3. Copy your configured `.env` file to:
   ```
   C:\Users\[Username]\AppData\Local\Programs\bilzo-receipt-sync\.env
   ```
4. Launch "Bilzo Receipt Sync" from Start Menu

## Step 6: Verify It's Working

### Check Sync Status:

1. Click tray icon
2. Go to "Sync Status" tab
3. Verify:
   - SQL Connection: Connected ✓
   - Last Sync: Shows recent time
   - Total Synced: Incrementing

### Test Validation Portal:

1. Click tray icon
2. Go to "Customer Lookup" tab
3. Enter a customer mobile number
4. Click "Search Customer"
5. Should display customer info

## Common Tasks

### Change Sync Interval

Edit `.env`:
```env
SYNC_INTERVAL_MINUTES=10  # Change from 5 to 10 minutes
```

Restart the app.

### View Sync Logs

**Development**: Check terminal/console

**Production**:
- Right-click tray icon → Sync Stats
- Check Windows Event Viewer

### Manually Trigger Sync

1. Right-click tray icon
2. Click "Sync Now"

Or:
1. Click tray icon
2. Go to "Sync Status" tab
3. Click "Sync Now" button

### Disable Auto-Start

Edit `.env`:
```env
AUTO_START_ON_BOOT=false
```

Restart the app.

## Usage Workflow

### Typical Cashier Workflow:

1. Customer asks about loyalty points
2. Cashier clicks tray icon
3. Enters mobile number
4. Views points and coupons
5. Applies discount in billing software
6. Closes validation portal (automatically hides)
7. Returns to billing software

**Time**: ~5-10 seconds

## Next Steps

- [ ] Add app to multiple POS stations
- [ ] Train cashiers on usage
- [ ] Monitor sync statistics
- [ ] Set up backup/monitoring

## Support

### Before Contacting Support:

1. Check README.md for detailed troubleshooting
2. Review logs for error messages
3. Verify configuration in .env
4. Test SQL and API connectivity separately

### Information to Provide:

- Error messages from console/logs
- Configuration (hide sensitive data)
- Windows version
- Node.js version
- Steps to reproduce issue

## Resources

- **Full Documentation**: See README.md
- **Project Structure**: See PROJECT_STRUCTURE.md
- **Icon Instructions**: See assets/ICONS_README.md

---

**Need Help?**
Contact Bilzo Support or check the documentation files included in this project.

**Version**: 1.0.0
