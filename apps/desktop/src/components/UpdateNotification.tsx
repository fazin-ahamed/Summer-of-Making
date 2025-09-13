import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export const UpdateNotification: React.FC = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    // Listen for update events from Electron
    // This would be connected to the auto-updater events in a real implementation
    
    // Mock update notification for demo
    const timer = setTimeout(() => {
      // Uncomment to test update notification
      // setShowUpdate(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    
    // Simulate download progress
    for (let i = 0; i <= 100; i += 10) {
      setUpdateProgress(i);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    setIsDownloading(false);
    setShowUpdate(false);
    
    // In a real app, this would trigger the update installation
    if (window.electronAPI) {
      window.electronAPI.showMessage({
        type: 'info',
        title: 'Update Ready',
        message: 'The update has been downloaded and will be installed when you restart the application.',
        buttons: ['Restart Now', 'Later'],
      });
    }
  };

  const handleDismiss = () => {
    setShowUpdate(false);
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Update Available
          </h3>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={16} />
          </button>
        </div>
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          A new version of AutoOrganize is available with bug fixes and improvements.
        </p>

        {isDownloading ? (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Downloading...</span>
              <span>{updateProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${updateProgress}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <div className="flex space-x-2">
            <button
              onClick={handleDownload}
              className="btn btn-primary flex items-center space-x-1 text-sm"
            >
              <Download size={14} />
              <span>Download</span>
            </button>
            <button
              onClick={handleDismiss}
              className="btn btn-ghost text-sm"
            >
              Later
            </button>
          </div>
        )}
      </div>
    </div>
  );
};