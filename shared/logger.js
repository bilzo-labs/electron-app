const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Logger {
  constructor() {
    this.logDir = null;
    this.logFile = null;
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = 5;
    this.initialize();
  }

  initialize() {
    try {
      // Get log directory in app data folder
      let userDataPath;
      try {
        if (app && typeof app.getPath === 'function') {
          userDataPath = app.getPath('userData');
        } else {
          // Fallback when app is not available yet
          const appName = 'receipt-sync-electron-app';
          if (process.platform === 'win32') {
            userDataPath = path.join(
              process.env.APPDATA || process.env.LOCALAPPDATA || process.env.USERPROFILE,
              appName
            );
          } else if (process.platform === 'darwin') {
            userDataPath = path.join(process.env.HOME || '~', 'Library', 'Application Support', appName);
          } else {
            userDataPath = path.join(process.env.HOME || '~', '.config', appName);
          }
        }
      } catch (err) {
        // Fallback path
        const appName = 'receipt-sync-electron-app';
        userDataPath = path.join(process.env.APPDATA || process.env.HOME || process.cwd(), appName);
      }

      this.logDir = path.join(userDataPath, 'logs');

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Create log file path with date
      const today = new Date().toISOString().split('T')[0];
      this.logFile = path.join(this.logDir, `app-${today}.log`);

      // Rotate logs if needed
      this.rotateLogs();
    } catch (error) {
      // Fallback to console if file logging fails
      console.error('Failed to initialize logger:', error);
    }
  }

  rotateLogs() {
    try {
      if (!fs.existsSync(this.logDir)) return;

      const files = fs
        .readdirSync(this.logDir)
        .filter((f) => f.startsWith('app-') && f.endsWith('.log'))
        .map((f) => ({
          name: f,
          path: path.join(this.logDir, f),
          time: fs.statSync(path.join(this.logDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // Remove old log files
      while (files.length >= this.maxLogFiles) {
        const fileToRemove = files.pop();
        try {
          fs.unlinkSync(fileToRemove.path);
        } catch (err) {
          // Ignore deletion errors
        }
      }

      // Rotate current log if it's too large
      if (this.logFile && fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxLogSize) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const rotatedFile = this.logFile.replace('.log', `-${timestamp}.log`);
          fs.renameSync(this.logFile, rotatedFile);
        }
      }
    } catch (error) {
      // Ignore rotation errors
    }
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedArgs = args
      .map((arg) => {
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack}`;
        }
        if (typeof arg === 'object') {
          return JSON.stringify(arg, null, 2);
        }
        return String(arg);
      })
      .join(' ');

    return `[${timestamp}] [${level}] ${message}${formattedArgs ? ' ' + formattedArgs : ''}\n`;
  }

  writeToFile(level, message, ...args) {
    try {
      if (!this.logFile) return;

      const logMessage = this.formatMessage(level, message, ...args);
      fs.appendFileSync(this.logFile, logMessage, 'utf8');
    } catch (error) {
      // Fallback to console if file write fails
      console.error('Failed to write to log file:', error);
    }
  }

  log(level, message, ...args) {
    // Always write to console (for development)
    const consoleMethod = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
    consoleMethod(`[${level}]`, message, ...args);

    // Write to file
    this.writeToFile(level, message, ...args);
  }

  info(message, ...args) {
    this.log('INFO', message, ...args);
  }

  warn(message, ...args) {
    this.log('WARN', message, ...args);
  }

  error(message, ...args) {
    this.log('ERROR', message, ...args);
  }

  debug(message, ...args) {
    this.log('DEBUG', message, ...args);
  }

  getLogPath() {
    return this.logFile;
  }

  getLogDir() {
    return this.logDir;
  }

  // Get recent log entries
  getRecentLogs(lines = 100) {
    try {
      if (!this.logFile || !fs.existsSync(this.logFile)) {
        return 'No log file found';
      }

      const content = fs.readFileSync(this.logFile, 'utf8');
      const logLines = content.split('\n').filter((line) => line.trim());
      return logLines.slice(-lines).join('\n');
    } catch (error) {
      return `Error reading logs: ${error.message}`;
    }
  }
}

// Create singleton instance
let loggerInstance = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

module.exports = getLogger;
