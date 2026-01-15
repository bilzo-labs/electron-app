# Auto-Update Setup Guide

This guide explains how to set up and use the auto-update feature for your Electron app.

## Overview

The app now includes automatic update functionality that checks for new versions from GitHub releases and allows users to download and install updates seamlessly.

## Prerequisites

1. A GitHub repository for your project
2. A GitHub Personal Access Token (PAT) with `repo` permissions
3. electron-updater package (already installed)

## Setup Instructions

### 1. Configure GitHub Repository in package.json

Update the `package.json` file with your GitHub repository information:

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git"
  },
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "YOUR_USERNAME",
        "repo": "YOUR_REPO_NAME"
      }
    ]
  }
}
```

Replace:

- `YOUR_USERNAME` with your GitHub username
- `YOUR_REPO_NAME` with your repository name

### 2. Set Up GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name (e.g., "Electron App Updates")
4. Select the `repo` scope (full control of private repositories)
5. Generate the token and copy it

### 3. Configure Environment Variable

Set the `GH_TOKEN` environment variable before building:

**Windows (PowerShell):**

```powershell
$env:GH_TOKEN="your_github_token_here"
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
```

**Windows (Command Prompt):**

```cmd
set GH_TOKEN=your_github_token_here
```

**Linux/Mac:**

```bash
export GH_TOKEN=your_github_token_here
```

### 4. Build and Publish

When you're ready to release a new version:

1. **Update the version** in `package.json`:

   ```json
   {
     "version": "5.1.0"
   }
   ```

2. **Commit and push** your changes:

   ```bash
   git add .
   git commit -m "Release version 5.1.0"
   git push origin main
   ```

3. **Create a GitHub release tag**:

   ```bash
   git tag v5.1.0
   git push origin v5.1.0
   ```

4. **Build and publish**:

   ```bash
   npm run build:win
   ```

   This will:
   - Build the Windows installer
   - Create a GitHub release
   - Upload the installer and update files
   - Generate `latest.yml` for update checking

### 5. Alternative: Manual GitHub Release

If you prefer to create releases manually:

1. Build the app:

   ```bash
   npm run build:win
   ```

2. Go to your GitHub repository → Releases → Draft a new release

3. Tag version: `v5.1.0` (must match package.json version)

4. Upload files from `dist/` folder:
   - `Bilzo Receipt Sync Setup 5.1.0.exe`
   - `latest.yml`
   - `Bilzo Receipt Sync Setup 5.1.0.exe.blockmap`

5. Publish the release

## How Auto-Update Works

### For Users

1. **Automatic Check**: The app automatically checks for updates when it starts (in production builds only)

2. **Update Available**: When an update is found:
   - A dialog appears asking if you want to download
   - You can also check manually from the Sync Status tab

3. **Download**: If you choose to download:
   - Progress is shown in the UI
   - Download happens in the background

4. **Install**: Once downloaded:
   - A dialog asks if you want to restart and install
   - The app will restart and install the update automatically

### Update Flow

```
App Starts
    ↓
Check for Updates (auto)
    ↓
Update Available? → Yes → Show Dialog
    ↓                        ↓
    No                    Download Update
    ↓                        ↓
Show "Latest Version"    Install on Restart
```

## Features

- ✅ Automatic update checking on app start
- ✅ Manual update check button
- ✅ Download progress indicator
- ✅ User-friendly dialogs
- ✅ Update status display in UI
- ✅ Automatic installation on app quit (if update downloaded)
- ✅ Works only in production builds (skipped in development)

## Troubleshooting

### Updates Not Detected

1. **Check GitHub Release**: Ensure the release exists and files are uploaded
2. **Verify Version**: Version in `package.json` must match the GitHub release tag (without 'v')
3. **Check Token**: Ensure `GH_TOKEN` is set correctly
4. **Repository Config**: Verify `package.json` has correct repository URL

### Build Fails

1. **Missing Token**: Set `GH_TOKEN` environment variable
2. **Wrong Permissions**: Token needs `repo` scope
3. **Repository Not Found**: Check repository name and owner in `package.json`

### Update Download Fails

1. **Network Issues**: Check internet connection
2. **GitHub API Limits**: Wait a few minutes and try again
3. **File Not Found**: Ensure `latest.yml` exists in the GitHub release

## Security Notes

- Never commit your `GH_TOKEN` to version control
- Use environment variables or CI/CD secrets
- Consider using GitHub Actions for automated releases

## CI/CD Integration

You can automate releases using GitHub Actions. Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build:win
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
      - uses: softprops/action-gh-release@v1
        with:
          files: dist/*.exe
```

## Testing Updates

To test the update functionality:

1. Build version 5.0.0 and install it
2. Create a new version 5.1.0 and publish it
3. Run the installed app - it should detect the update
4. Test download and installation

---

**Note**: Auto-update only works in production builds. Development builds (`npm start` or `npm run dev`) skip update checks.
