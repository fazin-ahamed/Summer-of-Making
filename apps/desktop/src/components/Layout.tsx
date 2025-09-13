import React from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { useLocation } from 'react-router-dom';
import { sidebarState, computedThemeState } from '../store/ui';
import Sidebar from './Sidebar';
import TitleBar from './TitleBar';
import StatusBar from './StatusBar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebar, setSidebar] = useRecoilState(sidebarState);
  const theme = useRecoilValue(computedThemeState);
  const location = useLocation();

  // Update active sidebar item based on location
  React.useEffect(() => {
    const path = location.pathname.slice(1) || 'dashboard';
    setSidebar(prev => ({ ...prev, activeItem: path }));
  }, [location.pathname, setSidebar]);

  return (
    <div className={`h-screen flex flex-col ${theme === 'dark' ? 'dark' : ''}`}>
      {/* Title bar for Windows/Linux */}
      {process.platform !== 'darwin' && <TitleBar />}
      
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />
        
        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
            <div className="h-full">
              {children}
            </div>
          </main>
          
          {/* Status bar */}
          <StatusBar />
        </div>
      </div>
    </div>
  );
};

export default Layout;