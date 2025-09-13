import React from 'react';
import { useRecoilValue } from 'recoil';
import { 
  Search, 
  FileText, 
  Database, 
  Share2, 
  TrendingUp,
  Clock,
  Activity
} from 'lucide-react';
import { appLoadingState } from '../store/ui';
import { trpc } from '../utils/trpc';

const DashboardPage: React.FC = () => {
  const appLoading = useRecoilValue(appLoadingState);

  // Fetch dashboard data
  const systemHealth = trpc.system.health.useQuery(undefined, {
    enabled: appLoading.isConnectedToAPI,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const recentActivity = [
    { id: 1, type: 'search', description: 'Searched for "machine learning"', time: '2 minutes ago' },
    { id: 2, type: 'document', description: 'Added document: research-paper.pdf', time: '15 minutes ago' },
    { id: 3, type: 'entity', description: 'Created entity: Neural Networks', time: '1 hour ago' },
    { id: 4, type: 'graph', description: 'Updated relationship graph', time: '2 hours ago' },
  ];

  const stats = [
    { 
      label: 'Total Documents', 
      value: '1,247', 
      icon: FileText, 
      color: 'text-blue-600', 
      bgColor: 'bg-blue-100 dark:bg-blue-900' 
    },
    { 
      label: 'Entities Found', 
      value: '3,892', 
      icon: Database, 
      color: 'text-green-600', 
      bgColor: 'bg-green-100 dark:bg-green-900' 
    },
    { 
      label: 'Connections', 
      value: '7,234', 
      icon: Share2, 
      color: 'text-purple-600', 
      bgColor: 'bg-purple-100 dark:bg-purple-900' 
    },
    { 
      label: 'Searches Today', 
      value: '42', 
      icon: Search, 
      color: 'text-yellow-600', 
      bgColor: 'bg-yellow-100 dark:bg-yellow-900' 
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Welcome back! Here's what's happening with your knowledge base.
          </p>
        </div>
        
        {/* System status */}
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            systemHealth.isSuccess ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {systemHealth.isSuccess ? 'System Online' : 'System Offline'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="card">
              <div className="card-content">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {stat.label}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {stat.value}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              Recent Activity
            </h2>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-primary-500 rounded-full mt-2"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {activity.description}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center mt-1">
                      <Clock className="w-3 h-3 mr-1" />
                      {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Quick Actions
            </h2>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-2 gap-4">
              <button className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-400 dark:hover:border-primary-500 transition-colors group">
                <div className="text-center">
                  <Search className="w-8 h-8 mx-auto mb-2 text-gray-400 group-hover:text-primary-500" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    New Search
                  </p>
                </div>
              </button>
              
              <button className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-400 dark:hover:border-primary-500 transition-colors group">
                <div className="text-center">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-gray-400 group-hover:text-primary-500" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Add Documents
                  </p>
                </div>
              </button>
              
              <button className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-400 dark:hover:border-primary-500 transition-colors group">
                <div className="text-center">
                  <Share2 className="w-8 h-8 mx-auto mb-2 text-gray-400 group-hover:text-primary-500" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    View Graph
                  </p>
                </div>
              </button>
              
              <button className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-400 dark:hover:border-primary-500 transition-colors group">
                <div className="text-center">
                  <Database className="w-8 h-8 mx-auto mb-2 text-gray-400 group-hover:text-primary-500" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Browse Entities
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* System Information */}
      {systemHealth.data && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              System Status
            </h2>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(systemHealth.data.components || {}).map(([component, status]) => (
                <div key={component} className="text-center">
                  <div className={`w-4 h-4 rounded-full mx-auto mb-2 ${
                    status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                    {component.replace('_', ' ')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {status}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;