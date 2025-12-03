const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

class TrayManager {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.tray = null;
    this.status = 'idle'; // idle, syncing, error
  }

  create() {
    // Create tray icon (you'll need to add actual icon files)
    const iconPath = this.getIconPath('idle');
    const icon = nativeImage.createFromPath(iconPath);

    this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
    this.tray.setToolTip('Bilzo Receipt Sync - Idle');

    // Build context menu
    this.updateContextMenu();

    // Show window on click
    this.tray.on('click', () => {
      this.windowManager.toggle();
    });

    console.log('System tray created');
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
        click: () => {
          if (syncService) {
            const stats = syncService.getStats();
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
          console.log('Settings clicked');
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
    const iconPath = this.getIconPath(status);
    const icon = nativeImage.createFromPath(iconPath);
    this.tray.setImage(icon.resize({ width: 16, height: 16 }));

    // Update tooltip
    const statusText = {
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
    const iconName = {
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
