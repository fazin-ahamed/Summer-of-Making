import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { 
  Home,
  Search,
  FileText,
  Share2,
  Settings,
  Database,
  Menu,
  X
} from 'lucide-react';
import { sidebarState } from '../store/ui';

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, path: '/dashboard' },
  { id: 'search', label: 'Search', icon: Search, path: '/search' },
  { id: 'documents', label: 'Documents', icon: FileText, path: '/documents' },
  { id: 'entities', label: 'Entities', icon: Database, path: '/entities' },
  { id: 'graph', label: 'Graph', icon: Share2, path: '/graph' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
];

const Sidebar: React.FC = () => {
  const sidebar = useRecoilValue(sidebarState);
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = React.useState(sidebar.isCollapsed);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className={`sidebar transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-64'}`}>
      {/* Sidebar header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
        {!isCollapsed && (
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">AO</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-gray-100">AutoOrganize</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {isCollapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`sidebar-item ${isActive ? 'active' : ''} ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon size={20} className={isCollapsed ? '' : 'mr-3'} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">U</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                User
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                Local Mode
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;