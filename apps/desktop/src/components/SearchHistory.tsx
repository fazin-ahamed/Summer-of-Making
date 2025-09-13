import React, { useState } from 'react';
import { useRecoilState } from 'recoil';
import { 
  Clock, 
  X, 
  Star, 
  Trash2, 
  Search,
  TrendingUp,
  Bookmark
} from 'lucide-react';
import { searchState } from '../store/ui';

interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: Date;
  resultCount: number;
  isSaved: boolean;
  type: 'fulltext' | 'semantic' | 'fuzzy' | 'hybrid';
}

const SearchHistory: React.FC = () => {
  const [search, setSearch] = useRecoilState(searchState);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  
  // Mock search history data - in real app this would come from localStorage or API
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([
    {
      id: '1',
      query: 'machine learning algorithms',
      timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      resultCount: 42,
      isSaved: true,
      type: 'semantic',
    },
    {
      id: '2',
      query: 'neural networks',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      resultCount: 18,
      isSaved: false,
      type: 'hybrid',
    },
    {
      id: '3',
      query: 'data science python',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      resultCount: 73,
      isSaved: true,
      type: 'fulltext',
    },
    {
      id: '4',
      query: 'research papers',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
      resultCount: 156,
      isSaved: false,
      type: 'fulltext',
    },
    {
      id: '5',
      query: 'artificial intelligence',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
      resultCount: 89,
      isSaved: false,
      type: 'semantic',
    },
  ]);

  const filteredHistory = showSavedOnly 
    ? searchHistory.filter(item => item.isSaved)
    : searchHistory;

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  };

  const handleHistoryItemClick = (item: SearchHistoryItem) => {
    setSearch(prev => ({
      ...prev,
      query: item.query,
    }));
  };

  const handleToggleSaved = (id: string) => {
    setSearchHistory(prev => 
      prev.map(item => 
        item.id === id 
          ? { ...item, isSaved: !item.isSaved }
          : item
      )
    );
  };

  const handleDeleteItem = (id: string) => {
    setSearchHistory(prev => prev.filter(item => item.id !== id));
  };

  const clearAllHistory = () => {
    setSearchHistory([]);
  };

  const getSearchTypeColor = (type: SearchHistoryItem['type']) => {
    switch (type) {
      case 'fulltext':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'semantic':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'fuzzy':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'hybrid':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center">
          <Clock className="w-4 h-4 mr-2" />
          Search History
        </h3>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSavedOnly(!showSavedOnly)}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              showSavedOnly
                ? 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
            }`}
          >
            <Star className="w-3 h-3 mr-1 inline" />
            Saved
          </button>
          
          {searchHistory.length > 0 && (
            <button
              onClick={clearAllHistory}
              className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
              title="Clear all history"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="text-center py-8">
          <Search className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {showSavedOnly ? 'No saved searches yet' : 'No search history yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredHistory.map((item) => (
            <div
              key={item.id}
              className="group bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              onClick={() => handleHistoryItemClick(item)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {item.query}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${getSearchTypeColor(item.type)}`}>
                      {item.type === 'fulltext' ? 'text' : item.type}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      {item.resultCount} results
                    </span>
                    <span>{formatTimestamp(item.timestamp)}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSaved(item.id);
                    }}
                    className={`p-1 rounded-full transition-colors ${
                      item.isSaved
                        ? 'text-yellow-500 hover:text-yellow-600'
                        : 'text-gray-400 hover:text-yellow-500'
                    }`}
                    title={item.isSaved ? 'Remove from saved' : 'Save search'}
                  >
                    {item.isSaved ? (
                      <Star className="w-3 h-3 fill-current" />
                    ) : (
                      <Star className="w-3 h-3" />
                    )}
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteItem(item.id);
                    }}
                    className="p-1 rounded-full text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove from history"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Popular/Trending Searches */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center">
          <TrendingUp className="w-4 h-4 mr-2" />
          Trending Searches
        </h4>
        
        <div className="space-y-1">
          {[
            'machine learning',
            'neural networks',
            'data science',
            'research papers',
            'artificial intelligence'
          ].map((term, index) => (
            <button
              key={index}
              onClick={() => setSearch(prev => ({ ...prev, query: term }))}
              className="block w-full text-left text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 py-1 transition-colors"
            >
              {term}
            </button>
          ))}
        </div>
      </div>

      {/* Saved Searches Quick Access */}
      {searchHistory.some(item => item.isSaved) && !showSavedOnly && (
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center">
            <Bookmark className="w-4 h-4 mr-2" />
            Saved Searches
          </h4>
          
          <div className="space-y-1">
            {searchHistory
              .filter(item => item.isSaved)
              .slice(0, 3)
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleHistoryItemClick(item)}
                  className="block w-full text-left text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 py-1 transition-colors truncate"
                >
                  {item.query}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchHistory;