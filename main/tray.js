const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const getLogger = require('../shared/logger');

const logger = getLogger();

class TrayManager {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.tray = null;
    this.status = 'idle'; // idle, syncing, error
  }

  create() {
    // Create tray icon using the application logo
    const iconPath = path.join(__dirname, '../assets/logo-home.ico');
    let icon;

    try {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        logger.warn('Tray icon file not found or invalid:', iconPath);
        throw new Error('Icon file is empty');
      }
    } catch (error) {
      logger.error('Failed to load tray icon:', error.message);
      // Create a simple fallback icon
      const fs = require('fs');
      if (fs.existsSync(iconPath)) {
        // Try again with a different approach
        icon = nativeImage.createFromPath(iconPath);
      }
      if (!icon || icon.isEmpty()) {
        logger.warn('Using default tray icon');
        // Use a simple colored image as fallback
        icon = nativeImage.createFromDataURL(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        );
      }
    }

    // Resize icon for tray (Windows typically uses 16x16)
    const trayIcon = icon.resize({ width: 16, height: 16 });
    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('Bilzo Receipt Sync - Idle');

    // Build context menu
    this.updateContextMenu();

    // Show window on click
    this.tray.on('click', () => {
      this.windowManager.toggle();
    });

    logger.info('System tray created');
  }

  updateContextMenu(syncService = null) {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Validation Portal',
        click: () => {
          this.windowManager.show();
        }
      },
      { type: 'separator' },
      {
        label: 'Sync Now',
        enabled: syncService !== null,
        click: () => {
          if (syncService) {
            syncService.forceSyncNow();
          }
        }
      },
      {
        label: 'Sync Stats',
        enabled: syncService !== null,
        click: async () => {
          if (syncService) {
            const stats = await syncService.getStats();
            this.windowManager.sendToRenderer('sync-stats', stats);
            this.windowManager.show();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => {
          // TODO: Open settings window
          logger.info('Settings clicked');
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  updateStatus(status) {
    this.status = status;

    // Update icon based on status
    // const iconPath = this.getIconPath(status);
    // const icon = nativeImage.createFromPath(iconPath);
    // this.tray.setImage(icon.resize({ width: 16, height: 16 }));

    // Update tooltip
    const statusText =
      {
        idle: 'Idle',
        syncing: 'Syncing...',
        error: 'Error'
      }[status] || 'Unknown';

    this.tray.setToolTip(`Bilzo Receipt Sync - ${statusText}`);
  }

  updateTooltip(text) {
    this.tray.setToolTip(text);
  }

  getIconPath(status) {
    // Use different icons for different statuses
    // For now, we'll create simple colored icons programmatically
    const iconName =
      {
        idle: 'icon-idle.png',
        syncing: 'icon-syncing.png',
        error: 'icon-error.png'
      }[status] || 'icon-idle.png';

    return path.join(__dirname, '../assets', iconName);
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;
