import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure store for user preferences
const store = new Store({
  defaults: {
    windowBounds: { width: 1200, height: 800 },
    theme: 'system',
    apiEndpoint: 'http://localhost:3001',
    autoLaunch: false,
    notifications: true,
  },
});

class AutoOrganizeApp {
  private mainWindow: BrowserWindow | null = null;
  private isDevMode: boolean = process.env.NODE_ENV === 'development';

  constructor() {
    this.setupEventHandlers();
    this.setupIPC();
  }

  private setupEventHandlers(): void {
    app.whenReady().then(() => {
      this.createMainWindow();
      this.setupAutoUpdater();
      this.setupAppMenu();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('before-quit', () => {
      if (this.mainWindow) {
        store.set('windowBounds', this.mainWindow.getBounds());
      }
    });
  }

  private createMainWindow(): void {
    const savedBounds = store.get('windowBounds') as { width: number; height: number };

    this.mainWindow = new BrowserWindow({
      width: savedBounds.width,
      height: savedBounds.height,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js'),
      },
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      show: false,
      icon: this.getAppIcon(),
    });

    // Load the app
    if (this.isDevMode) {
      this.mainWindow.loadURL('http://localhost:3000');
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      
      if (this.isDevMode) {
        this.mainWindow?.webContents.openDevTools();
      }
    });

    // Handle external links
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Save window bounds on resize/move
    this.mainWindow.on('resize', () => {
      if (this.mainWindow) {
        store.set('windowBounds', this.mainWindow.getBounds());
      }
    });

    this.mainWindow.on('move', () => {
      if (this.mainWindow) {
        store.set('windowBounds', this.mainWindow.getBounds());
      }
    });
  }

  private setupIPC(): void {
    // Get app version
    ipcMain.handle('app:getVersion', () => {
      return app.getVersion();
    });

    // Get app path
    ipcMain.handle('app:getPath', (_, name: string) => {
      return app.getPath(name as any);
    });

    // Open file dialog
    ipcMain.handle('dialog:openFile', async (_, options) => {
      if (!this.mainWindow) return null;
      
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        ...options,
      });

      return result.canceled ? null : result.filePaths;
    });

    // Open directory dialog
    ipcMain.handle('dialog:openDirectory', async (_, options) => {
      if (!this.mainWindow) return null;
      
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openDirectory'],
        ...options,
      });

      return result.canceled ? null : result.filePaths;
    });

    // Save file dialog
    ipcMain.handle('dialog:saveFile', async (_, options) => {
      if (!this.mainWindow) return null;
      
      const result = await dialog.showSaveDialog(this.mainWindow, {
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'CSV', extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        ...options,
      });

      return result.canceled ? null : result.filePath;
    });

    // Show message box
    ipcMain.handle('dialog:showMessage', async (_, options) => {
      if (!this.mainWindow) return null;
      
      const result = await dialog.showMessageBox(this.mainWindow, options);
      return result;
    });

    // Store operations
    ipcMain.handle('store:get', (_, key: string) => {
      return store.get(key);
    });

    ipcMain.handle('store:set', (_, key: string, value: any) => {
      store.set(key, value);
    });

    ipcMain.handle('store:delete', (_, key: string) => {
      store.delete(key);
    });

    ipcMain.handle('store:clear', () => {
      store.clear();
    });

    // Shell operations
    ipcMain.handle('shell:openExternal', (_, url: string) => {
      return shell.openExternal(url);
    });

    ipcMain.handle('shell:showItemInFolder', (_, path: string) => {
      return shell.showItemInFolder(path);
    });

    // App operations
    ipcMain.handle('app:quit', () => {
      app.quit();
    });

    ipcMain.handle('app:minimize', () => {
      this.mainWindow?.minimize();
    });

    ipcMain.handle('app:maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
    });

    ipcMain.handle('app:close', () => {
      this.mainWindow?.close();
    });

    // Check for updates
    ipcMain.handle('updater:checkForUpdates', () => {
      autoUpdater.checkForUpdatesAndNotify();
    });
  }

  private setupAutoUpdater(): void {
    if (this.isDevMode) return;

    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-available', () => {
      dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: 'Update Available',
        message: 'A new version is available. It will be downloaded in the background.',
        buttons: ['OK'],
      });
    });

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded. The application will restart to apply the update.',
        buttons: ['Restart Now', 'Later'],
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    });
  }

  private setupAppMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Search',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              this.mainWindow?.webContents.send('menu:newSearch');
            },
          },
          {
            label: 'Open Files',
            accelerator: 'CmdOrCtrl+O',
            click: () => {
              this.mainWindow?.webContents.send('menu:openFiles');
            },
          },
          { type: 'separator' },
          {
            label: 'Preferences',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.mainWindow?.webContents.send('menu:preferences');
            },
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            },
          },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectall' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Search',
        submenu: [
          {
            label: 'Find in Documents',
            accelerator: 'CmdOrCtrl+F',
            click: () => {
              this.mainWindow?.webContents.send('menu:search');
            },
          },
          {
            label: 'Advanced Search',
            accelerator: 'CmdOrCtrl+Shift+F',
            click: () => {
              this.mainWindow?.webContents.send('menu:advancedSearch');
            },
          },
        ],
      },
      {
        label: 'Tools',
        submenu: [
          {
            label: 'Graph View',
            accelerator: 'CmdOrCtrl+G',
            click: () => {
              this.mainWindow?.webContents.send('menu:graphView');
            },
          },
          {
            label: 'Export Data',
            click: () => {
              this.mainWindow?.webContents.send('menu:export');
            },
          },
          {
            label: 'Import Data',
            click: () => {
              this.mainWindow?.webContents.send('menu:import');
            },
          },
        ],
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' },
          ...(process.platform === 'darwin' ? [
            { type: 'separator' as const },
            { role: 'front' as const },
          ] : []),
        ],
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About AutoOrganize',
            click: () => {
              this.mainWindow?.webContents.send('menu:about');
            },
          },
          {
            label: 'Check for Updates',
            click: () => {
              autoUpdater.checkForUpdatesAndNotify();
            },
          },
          {
            label: 'View Documentation',
            click: () => {
              shell.openExternal('https://autoorganize.org/docs');
            },
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private getAppIcon(): string | undefined {
    if (process.platform === 'win32') {
      return path.join(__dirname, '../assets/icon.ico');
    } else if (process.platform === 'darwin') {
      return path.join(__dirname, '../assets/icon.icns');
    } else {
      return path.join(__dirname, '../assets/icon.png');
    }
  }
}

// Create app instance
new AutoOrganizeApp();

// Security: Prevent new window creation
app.on('web-contents-created', (_, contents) => {
  contents.on('new-window', (navigationEvent, navigationUrl) => {
    navigationEvent.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// Disable navigation to external URLs
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (navigationEvent, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== 'http://localhost:3000' && parsedUrl.origin !== 'file://') {
      navigationEvent.preventDefault();
    }
  });
});