import { autoUpdater, UpdateInfo } from 'electron-updater';
import { BrowserWindow, app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// Update progress information interface
export interface UpdateProgressInfo {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

// Log file path for debugging
const logFilePath = path.join(app.getPath('userData'), 'updater-debug.log');

// Flag to prevent duplicate update dialogs
let updateDialogVisible = false;

// Logger for update events (console + file)
function logUpdate(message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [AutoUpdater] ${message} ${args.length > 0 ? JSON.stringify(args, null, 2) : ''}\n`;

  // Log to console
  console.log(`[AutoUpdater] ${message}`, ...args);

  // Log to file for debugging in production
  try {
    fs.appendFileSync(logFilePath, logMessage, 'utf-8');
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

// Configure autoUpdater
function configureAutoUpdater(): void {
  // Log current version
  logUpdate('Current version:', autoUpdater.currentVersion.version);

  // Log feed URL and configuration
  logUpdate('Feed URL:', autoUpdater.getFeedURL());
  logUpdate('Auto download enabled:', autoUpdater.autoDownload);
  logUpdate('Auto install on quit:', autoUpdater.autoInstallOnAppQuit);

  // Enable automatic download of updates
  autoUpdater.autoDownload = true;

  // Don't automatically install updates on quit (user confirmation required)
  autoUpdater.autoInstallOnAppQuit = false;

  logUpdate('AutoUpdater configured (using electron-builder.yml publish configuration)');
}

// Send update event to renderer process
function sendUpdateEventToRenderer(event: string, data?: any): void {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send(`update-${event}`, data);
    }
  });
}

// Initialize autoUpdater event listeners
function initializeEventListeners(): void {
  // When checking for updates
  autoUpdater.on('checking-for-update', () => {
    logUpdate('Checking for updates...');
  });

  // When an update is available
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logUpdate('Update available:', info);
    sendUpdateEventToRenderer('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  // When no update is available
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    logUpdate('No update available:', info);
    sendUpdateEventToRenderer('update-not-available', {
      version: info.version,
    });
  });

  // Download progress
  autoUpdater.on('download-progress', (progress: UpdateProgressInfo) => {
    logUpdate('Download progress:', {
      percent: progress.percent.toFixed(2),
      transferred: formatBytes(progress.transferred),
      total: formatBytes(progress.total),
      speed: formatBytes(progress.bytesPerSecond) + '/s',
    });
    sendUpdateEventToRenderer('update-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
      transferredFormatted: formatBytes(progress.transferred),
      totalFormatted: formatBytes(progress.total),
      speedFormatted: formatBytes(progress.bytesPerSecond) + '/s',
    });
  });

  // When update is downloaded
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logUpdate('Update downloaded:', info);
    
    // Keep existing IPC event so renderer continues receiving update events
    sendUpdateEventToRenderer('update-downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });

    // Prevent duplicate dialogs - ignore if dialog is already visible
    if (updateDialogVisible) {
      logUpdate('Update dialog already visible, skipping duplicate dialog');
      return;
    }

    // Log successful download
    logUpdate('Update downloaded successfully.');

    // Set flag to prevent duplicate dialogs
    updateDialogVisible = true;

    // Show native dialog to user
    // This follows Electron best practices for update installation
    const windows = BrowserWindow.getAllWindows();
    const focusedWindow = windows.find(w => w.isFocused()) || windows[0];

    if (focusedWindow && !focusedWindow.isDestroyed()) {
      dialog.showMessageBox(focusedWindow, {
        type: 'info',
        title: 'BilPow Update',
        message: 'A new version of BilPow has been downloaded.',
        detail: 'Restart BilPow now to complete the installation.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0, // "Restart now" is default
        cancelId: 1,  // "Later" is cancel button
      }).then((result) => {
        // Reset flag after dialog closes
        updateDialogVisible = false;

        if (result.response === 0) {
          // User chose "Restart now"
          logUpdate('User accepted update installation.');
          
          // Wait 500ms before restarting to allow UI to clean up
          setTimeout(() => {
            // Reuse the existing installUpdate() function
            installUpdate();
          }, 500);
        } else {
          // User chose "Later"
          logUpdate('User postponed installation.');
        }
      }).catch((error) => {
        // Reset flag on error
        updateDialogVisible = false;
        logUpdate('Error showing update dialog:', error.message);
      });
    } else {
      // No window available, reset flag
      updateDialogVisible = false;
      logUpdate('No window available to show update dialog');
    }
  });

  // When an error occurs
  autoUpdater.on('error', (error: Error) => {
    logUpdate('Update error:', error.message, error.stack);
    sendUpdateEventToRenderer('update-error', {
      message: error.message,
      stack: error.stack,
    });
  });
}

// Format bytes to human-readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Check for updates
export async function checkForUpdates(): Promise<void> {
  try {
    logUpdate('Checking for updates...');
    const result = await autoUpdater.checkForUpdates();
    logUpdate('Check result:', result);
    if (result) {
      logUpdate('Update check details:', {
        versionInfo: result.updateInfo,
        downloadPromise: result.downloadPromise ? 'pending' : 'none',
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logUpdate('Error checking for updates:', message);
    if (error instanceof Error && error.stack) {
      logUpdate('Error stack:', error.stack);
    }
    sendUpdateEventToRenderer('update-error', { message });
  }
}

// Install update and quit
// Parameters: isSilent (default false), forceRestart (default true)
export function installUpdate(isSilent: boolean = false, forceRestart: boolean = true): void {
  try {
    logUpdate('Installing update and quitting...');
    autoUpdater.quitAndInstall(isSilent, forceRestart);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logUpdate('Error installing update:', message);
    sendUpdateEventToRenderer('update-error', { message });
  }
}

// Initialize the updater system
export function initializeUpdater(): void {
  // Skip initialization in development mode
  if (process.env.NODE_ENV === 'development') {
    logUpdate('Skipping updater initialization in development mode');
    return;
  }

  try {
    configureAutoUpdater();
    initializeEventListeners();
    logUpdate('AutoUpdater initialized successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logUpdate('Failed to initialize AutoUpdater:', message);
  }
}

// Start automatic update check after a delay
export function scheduleAutoUpdateCheck(delayMs: number = 5000): void {
  if (process.env.NODE_ENV === 'development') {
    logUpdate('Skipping auto-update check in development mode');
    return;
  }

  logUpdate(`Scheduling auto-update check in ${delayMs}ms`);
  setTimeout(() => {
    checkForUpdates();
  }, delayMs);
}

// Get current version
export function getCurrentVersion(): string {
  return autoUpdater.currentVersion.version;
}
