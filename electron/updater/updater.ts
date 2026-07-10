import { autoUpdater, UpdateInfo } from 'electron-updater';
import { BrowserWindow } from 'electron';

// Update progress information interface
export interface UpdateProgressInfo {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

// Logger for update events
function logUpdate(message: string, ...args: any[]): void {
  console.log(`[AutoUpdater] ${message}`, ...args);
}

// Configure autoUpdater
function configureAutoUpdater(): void {
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
    sendUpdateEventToRenderer('update-downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  // When an error occurs
  autoUpdater.on('error', (error: Error) => {
    logUpdate('Update error:', error.message);
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
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logUpdate('Error checking for updates:', message);
    sendUpdateEventToRenderer('update-error', { message });
  }
}

// Install update and quit
export function installUpdate(): void {
  try {
    logUpdate('Installing update and quitting...');
    autoUpdater.quitAndInstall();
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
