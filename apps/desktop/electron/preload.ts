import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App methods
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
  quit: () => ipcRenderer.invoke('app:quit'),
  minimize: () => ipcRenderer.invoke('app:minimize'),
  maximize: () => ipcRenderer.invoke('app:maximize'),
  close: () => ipcRenderer.invoke('app:close'),

  // Dialog methods
  openFile: (options?: any) => ipcRenderer.invoke('dialog:openFile', options),
  openDirectory: (options?: any) => ipcRenderer.invoke('dialog:openDirectory', options),
  saveFile: (options?: any) => ipcRenderer.invoke('dialog:saveFile', options),
  showMessage: (options: any) => ipcRenderer.invoke('dialog:showMessage', options),

  // Store methods
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
    clear: () => ipcRenderer.invoke('store:clear'),
  },

  // Shell methods
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),

  // Updater methods
  checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),

  // Event listeners
  onMenuAction: (callback: (action: string) => void) => {
    const menuActions = [
      'menu:newSearch',
      'menu:openFiles',
      'menu:preferences',
      'menu:search',
      'menu:advancedSearch',
      'menu:graphView',
      'menu:export',
      'menu:import',
      'menu:about',
    ];

    menuActions.forEach(action => {
      ipcRenderer.on(action, () => callback(action));
    });

    // Return cleanup function
    return () => {
      menuActions.forEach(action => {
        ipcRenderer.removeAllListeners(action);
      });
    };
  },

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// Types for TypeScript
export interface ElectronAPI {
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string>;
  quit: () => Promise<void>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  
  openFile: (options?: any) => Promise<string[] | null>;
  openDirectory: (options?: any) => Promise<string[] | null>;
  saveFile: (options?: any) => Promise<string | null>;
  showMessage: (options: any) => Promise<any>;
  
  store: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    delete: (key: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (path: string) => Promise<void>;
  
  checkForUpdates: () => Promise<void>;
  
  onMenuAction: (callback: (action: string) => void) => () => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}