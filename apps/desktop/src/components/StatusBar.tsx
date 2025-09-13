import React from 'react';
import { useRecoilValue } from 'recoil';
import { Wifi, WifiOff, Clock, HardDrive } from 'lucide-react';
import { appLoadingState } from '../store/ui';

const StatusBar: React.FC = () => {
  const appLoading = useRecoilValue(appLoadingState);
  const [currentTime, setCurrentTime] = React.useState(new Date());

  // Update time every second
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="h-6 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 text-xs text-gray-600 dark:text-gray-400">
      <div className="flex items-center space-x-4">
        {/* API Connection Status */}
        <div className="flex items-center space-x-1">
          {appLoading.isConnectedToAPI ? (
            <>
              <Wifi size={12} className="text-green-500" />
              <span>Connected</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-red-500" />
              <span>Disconnected</span>
            </>
          )}
        </div>

        {/* Storage indicator */}
        <div className="flex items-center space-x-1">
          <HardDrive size={12} />
          <span>Local Storage</span>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Last sync time */}
        {appLoading.lastConnectionCheck && (
          <div className="flex items-center space-x-1">
            <Clock size={12} />
            <span>
              Last check: {appLoading.lastConnectionCheck.toLocaleTimeString()}
            </span>
          </div>
        )}

        {/* Current time */}
        <div className="flex items-center space-x-1">
          <span>{currentTime.toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;"