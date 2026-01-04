const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { config } = require('../shared/config');

class WindowManager {
  constructor() {
    this.window = null;
  }

  create() {
    // Get primary display bounds
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Position window in bottom-right corner (near taskbar)
    const windowWidth = config.window.width;
    const windowHeight = config.window.height;
    const x = screenWidth - windowWidth - 20;
    const y = screenHeight - windowHeight - 20;

    this.window = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      minWidth: config.window.minWidth,
      minHeight: config.window.minHeight,
      icon: path.join(__dirname, '../assets/logo-home.ico'),
      x,
      y,
      show: false,
      frame: true,
      skipTaskbar: true,
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, '../renderer/preload.js')
      }
    });

    // Load the renderer
    this.window.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Hide instead of close
    this.window.on('close', (event) => {
      if (!this.window.isQuitting) {
        event.preventDefault();
        this.hide();
      }
    });

    // Open DevTools in development
    if (config.app.debug) {
      this.window.webContents.openDevTools({ mode: 'detach' });
    }

    console.log('Main window created');
  }

  show() {
    if (this.window) {
      this.window.show();
      this.window.focus();
    }
  }

  hide() {
    if (this.window) {
      this.window.hide();
    }
  }

  toggle() {
    if (this.window) {
      if (this.window.isVisible()) {
        this.hide();
      } else {
        this.show();
      }
    }
  }

  sendToRenderer(channel, data) {
    if (this.window && this.window.webContents) {
      this.window.webContents.send(channel, data);
    }
  }

  destroy() {
    if (this.window) {
      this.window.isQuitting = true;
      this.window.close();
      this.window = null;
    }
  }

  getWindow() {
    return this.window;
  }
}

module.exports = WindowManager;
