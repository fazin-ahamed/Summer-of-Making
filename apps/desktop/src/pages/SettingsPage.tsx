import React from 'react';
import { useRecoilState } from 'recoil';
import { Monitor, Moon, Sun, Settings, Save } from 'lucide-react';
import { themeState, userPreferencesState } from '../store/ui';

const SettingsPage: React.FC = () => {
  const [theme, setTheme] = useRecoilState(themeState);
  const [preferences, setPreferences] = useRecoilState(userPreferencesState);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
  };

  const handlePreferenceChange = (key: string, value: any) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    if (window.electronAPI) {
      await window.electronAPI.store.set('userPreferences', preferences);
      await window.electronAPI.showMessage({
        type: 'info',
        title: 'Settings Saved',
        message: 'Your preferences have been saved successfully.',
        buttons: ['OK'],
      });
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
            <Settings className="w-7 h-7 mr-2" />
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Configure your preferences and application settings.
          </p>
        </div>
        <button onClick={handleSave} className="btn btn-primary flex items-center space-x-2">
          <Save size={16} />
          <span>Save Changes</span>
        </button>
      </div>

      <div className="space-y-6">
        {/* Appearance */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Appearance</h2>
          </div>
          <div className="card-content space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Theme
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => handleThemeChange('light')}
                  className={`p-3 border rounded-lg flex items-center justify-center space-x-2 transition-colors ${
                    theme === 'light'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                  }`}
                >
                  <Sun size={16} />
                  <span className="text-sm">Light</span>
                </button>
                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`p-3 border rounded-lg flex items-center justify-center space-x-2 transition-colors ${
                    theme === 'dark'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                  }`}
                >
                  <Moon size={16} />
                  <span className="text-sm">Dark</span>
                </button>
                <button
                  onClick={() => handleThemeChange('system')}
                  className={`p-3 border rounded-lg flex items-center justify-center space-x-2 transition-colors ${
                    theme === 'system'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                  }`}
                >
                  <Monitor size={16} />
                  <span className="text-sm">System</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* API Configuration */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">API Configuration</h2>
          </div>
          <div className="card-content space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Endpoint
              </label>
              <input
                type="url"
                value={preferences.apiEndpoint}
                onChange={(e) => handlePreferenceChange('apiEndpoint', e.target.value)}
                className="input"
                placeholder="http://localhost:3001"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                The URL of the AutoOrganize API server.
              </p>
            </div>
          </div>
        </div>

        {/* Application */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Application</h2>
          </div>
          <div className="card-content space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Auto Launch
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Launch AutoOrganize when your computer starts.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.autoLaunch}
                onChange={(e) => handlePreferenceChange('autoLaunch', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notifications
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Show desktop notifications for important events.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.notifications}
                onChange={(e) => handlePreferenceChange('notifications', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Search Results Per Page
              </label>
              <select
                value={preferences.searchResultsPerPage}
                onChange={(e) => handlePreferenceChange('searchResultsPerPage', parseInt(e.target.value))}
                className="input"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default View
              </label>
              <select
                value={preferences.defaultView}
                onChange={(e) => handlePreferenceChange('defaultView', e.target.value)}
                className="input"
              >
                <option value="list">List</option>
                <option value="grid">Grid</option>
                <option value="graph">Graph</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data & Privacy */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Data & Privacy</h2>
          </div>
          <div className="card-content space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Auto Save
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Automatically save changes to your data.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.autoSave}
                onChange={(e) => handlePreferenceChange('autoSave', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Auto Backup
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Automatically create backups of your data.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.autoBackup}
                onChange={(e) => handlePreferenceChange('autoBackup', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>

            {preferences.autoBackup && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Backup Interval (hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={preferences.backupInterval}
                  onChange={(e) => handlePreferenceChange('backupInterval', parseInt(e.target.value))}
                  className="input"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;