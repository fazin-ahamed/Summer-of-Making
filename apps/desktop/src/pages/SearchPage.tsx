import React, { useState, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { 
  Search, 
  Filter, 
  X, 
  Calendar,
  FileText,
  Clock,
  Tag,
  Settings,
  Download,
  Star,
  Loader
} from 'lucide-react';
import { searchState } from '../store/ui';
import { trpc } from '../utils/trpc';
import SearchResults from '../components/SearchResults';
import SearchFilters from '../components/SearchFilters';
import SearchHistory from '../components/SearchHistory';
import { useDebounce } from '../hooks/useDebounce';

const SearchPage: React.FC = () => {
  const [search, setSearch] = useRecoilState(searchState);
  const [showFilters, setShowFilters] = useState(false);
  const [searchType, setSearchType] = useState<'fulltext' | 'semantic' | 'fuzzy' | 'hybrid'>('hybrid');
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  
  // Debounce search query to avoid too many API calls
  const debouncedQuery = useDebounce(search.query, 500);

  // Search API call
  const searchQuery = trpc.search.search.useQuery(
    {
      query: debouncedQuery,
      type: searchType,
      filters: {
        fileTypes: search.filters.fileTypes,
        dateRange: {
          start: search.filters.dateRange.start,
          end: search.filters.dateRange.end,
        },
        tags: search.filters.tags,
      },
      pagination: {
        page: 1,
        limit: 20,
      },
      sortBy: 'relevance',
      sortOrder: 'desc',
    },
    {
      enabled: debouncedQuery.length > 0,
      keepPreviousData: true,
    }
  );

  // Auto-complete suggestions
  const autoCompleteQuery = trpc.search.autoComplete.useQuery(
    {
      query: search.query,
      maxSuggestions: 5,
    },
    {
      enabled: search.query.length > 2,
    }
  );

  // Update search state based on query results
  useEffect(() => {
    setSearch(prev => ({
      ...prev,
      isLoading: searchQuery.isLoading,
      results: searchQuery.data?.data?.results || [],
      totalResults: searchQuery.data?.data?.totalCount || 0,
    }));
  }, [searchQuery.data, searchQuery.isLoading, setSearch]);

  const handleSearchChange = (value: string) => {
    setSearch(prev => ({ ...prev, query: value }));
  };

  const handleFilterChange = (key: string, value: any) => {
    setSearch(prev => ({
      ...prev,
      filters: {
        ...prev.filters,
        [key]: value,
      },
    }));
  };

  const clearSearch = () => {
    setSearch(prev => ({
      ...prev,
      query: '',
      results: [],
      totalResults: 0,
    }));
  };

  const clearFilters = () => {
    setSearch(prev => ({
      ...prev,
      filters: {
        fileTypes: [],
        dateRange: { start: null, end: null },
        tags: [],
      },
    }));
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSearchChange(suggestion);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Search Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <Search className="w-7 h-7 mr-2" />
                Search
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Find documents, entities, and connections in your knowledge base.
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsAdvancedMode(!isAdvancedMode)}
                className={`btn ${
                  isAdvancedMode ? 'btn-primary' : 'btn-ghost'
                } flex items-center space-x-1`}
              >
                <Settings size={16} />
                <span>{isAdvancedMode ? 'Simple' : 'Advanced'}</span>
              </button>
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`btn ${
                  showFilters ? 'btn-primary' : 'btn-ghost'
                } flex items-center space-x-1`}
              >
                <Filter size={16} />
                <span>Filters</span>
                {(search.filters.fileTypes.length > 0 || 
                  search.filters.tags.length > 0 || 
                  search.filters.dateRange.start) && (
                  <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    !
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search.query}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search for documents, entities, or content..."
                className="search-input w-full text-lg py-3 pl-10 pr-12"
                autoFocus
              />
              {search.query && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              )}
              
              {search.isLoading && (
                <div className="absolute right-12 top-3">
                  <Loader className="w-5 h-5 animate-spin text-primary-500" />
                </div>
              )}
            </div>

            {/* Auto-complete suggestions */}
            {autoCompleteQuery.data?.data && search.query.length > 2 && (
              <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg mt-1 z-10">
                {autoCompleteQuery.data.data.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion.text)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <Search size={16} className="text-gray-400" />
                    <span>{suggestion.text}</span>
                    <span className="text-xs text-gray-500 ml-auto capitalize">
                      {suggestion.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search Type Selector */}
          {isAdvancedMode && (
            <div className="mt-4 flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Search Type:
              </span>
              {(['fulltext', 'semantic', 'fuzzy', 'hybrid'] as const).map((type) => (
                <label key={type} className="flex items-center space-x-1">
                  <input
                    type="radio"
                    name="searchType"
                    value={type}
                    checked={searchType === type}
                    onChange={(e) => setSearchType(e.target.value as any)}
                    className="text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                    {type === 'fulltext' ? 'Full-text' : type}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar for filters and history */}
        <div className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ${
          showFilters ? 'w-80' : 'w-0'
        } overflow-hidden`}>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Filters</h2>
              <button
                onClick={clearFilters}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Clear All
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            <SearchFilters
              filters={search.filters}
              onFilterChange={handleFilterChange}
            />
            
            <div className="border-t border-gray-200 dark:border-gray-700 mt-4">
              <SearchHistory />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          {search.query ? (
            <div className="p-6">
              {/* Search Stats */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {search.isLoading ? (
                      'Searching...'
                    ) : (
                      `${search.totalResults.toLocaleString()} results for "${search.query}"`
                    )}
                  </span>
                  
                  {searchQuery.data?.searchTime && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <Clock size={12} className="mr-1" />
                      {searchQuery.data.searchTime}ms
                    </span>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <button className="btn btn-ghost text-sm flex items-center space-x-1">
                    <Star size={14} />
                    <span>Save Search</span>
                  </button>
                  
                  <button className="btn btn-ghost text-sm flex items-center space-x-1">
                    <Download size={14} />
                    <span>Export</span>
                  </button>
                </div>
              </div>

              {/* Search Results */}
              <SearchResults
                results={search.results}
                isLoading={search.isLoading}
                query={search.query}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <Search className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Start your search
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Enter a query above to search through your documents, entities, and knowledge graph.
                </p>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Try searching for:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {['machine learning', 'neural networks', 'data science', 'research papers'].map((example) => (
                      <button
                        key={example}
                        onClick={() => handleSearchChange(example)}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchPage;