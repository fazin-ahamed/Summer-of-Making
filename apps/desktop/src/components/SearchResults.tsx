import React from 'react';
import { 
  FileText, 
  Database, 
  Link, 
  Star,
  ExternalLink,
  Calendar,
  User,
  Tag,
  Zap
} from 'lucide-react';

interface SearchResult {
  id: string;
  title: string;
  content: string;
  snippet: string;
  score: number;
  filePath: string;
  fileType: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
  tags: string[];
  entities: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
  highlights: Array<{
    field: string;
    fragments: string[];
  }>;
}

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  query: string;
}

const SearchResults: React.FC<SearchResultsProps> = ({ results, isLoading, query }) => {
  const getFileIcon = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return <FileText className=\"w-5 h-5 text-red-500\" />;
      case 'doc':
      case 'docx':
        return <FileText className=\"w-5 h-5 text-blue-500\" />;
      case 'txt':
      case 'md':
        return <FileText className=\"w-5 h-5 text-gray-500\" />;
      default:
        return <FileText className=\"w-5 h-5 text-gray-400\" />;
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className=\"search-highlight\">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const handleResultClick = (result: SearchResult) => {
    // In a real app, this would open the document or navigate to its details
    if (window.electronAPI) {
      window.electronAPI.showItemInFolder(result.filePath);
    }
  };

  if (isLoading) {
    return (
      <div className=\"space-y-4\">
        {[...Array(5)].map((_, index) => (
          <div key={index} className=\"card animate-pulse\">
            <div className=\"card-content\">
              <div className=\"flex items-start space-x-3\">
                <div className=\"w-5 h-5 bg-gray-300 rounded\"></div>
                <div className=\"flex-1\">
                  <div className=\"h-4 bg-gray-300 rounded w-3/4 mb-2\"></div>
                  <div className=\"h-3 bg-gray-300 rounded w-full mb-1\"></div>
                  <div className=\"h-3 bg-gray-300 rounded w-2/3\"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className=\"text-center py-12\">
        <Database className=\"w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4\" />
        <h3 className=\"text-lg font-medium text-gray-900 dark:text-gray-100 mb-2\">
          No results found
        </h3>
        <p className=\"text-gray-600 dark:text-gray-400\">
          Try adjusting your search terms or filters to find what you're looking for.
        </p>
      </div>
    );
  }

  return (
    <div className=\"space-y-4\">
      {results.map((result) => (
        <div 
          key={result.id} 
          className=\"card hover:shadow-md transition-shadow cursor-pointer\"
          onClick={() => handleResultClick(result)}
        >
          <div className=\"card-content\">
            <div className=\"flex items-start space-x-4\">
              {/* File Icon */}
              <div className=\"flex-shrink-0 mt-1\">
                {getFileIcon(result.fileType)}
              </div>

              {/* Content */}
              <div className=\"flex-1 min-w-0\">
                {/* Title and Score */}
                <div className=\"flex items-start justify-between mb-2\">
                  <h3 className=\"text-lg font-medium text-gray-900 dark:text-gray-100 line-clamp-1\">
                    {highlightText(result.title, query)}
                  </h3>
                  <div className=\"flex items-center space-x-2 ml-4\">
                    <div className=\"flex items-center space-x-1\">
                      <Zap className=\"w-4 h-4 text-yellow-500\" />
                      <span className=\"text-sm text-gray-600 dark:text-gray-400\">
                        {Math.round(result.score * 100)}%
                      </span>
                    </div>
                    <button className=\"p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors\">
                      <Star className=\"w-4 h-4 text-gray-400\" />
                    </button>
                  </div>
                </div>

                {/* Snippet */}
                <p className=\"text-gray-700 dark:text-gray-300 mb-3 line-clamp-2\">
                  {highlightText(result.snippet, query)}
                </p>

                {/* Metadata */}
                <div className=\"flex items-center flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400\">
                  <div className=\"flex items-center space-x-1\">
                    <Calendar className=\"w-4 h-4\" />
                    <span>{new Date(result.modifiedAt).toLocaleDateString()}</span>
                  </div>
                  
                  <div className=\"flex items-center space-x-1\">
                    <FileText className=\"w-4 h-4\" />
                    <span>{result.fileType.toUpperCase()}</span>
                  </div>
                  
                  <div className=\"flex items-center space-x-1\">
                    <Database className=\"w-4 h-4\" />
                    <span>{(result.size / 1024).toFixed(1)} KB</span>
                  </div>

                  <button 
                    className=\"flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors\"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.electronAPI) {
                        window.electronAPI.showItemInFolder(result.filePath);
                      }
                    }}
                  >
                    <ExternalLink className=\"w-4 h-4\" />
                    <span>Open Location</span>
                  </button>
                </div>

                {/* Tags */}
                {result.tags.length > 0 && (
                  <div className=\"flex items-center flex-wrap gap-2 mt-3\">
                    <Tag className=\"w-4 h-4 text-gray-400\" />
                    {result.tags.slice(0, 5).map((tag, index) => (
                      <span 
                        key={index}
                        className=\"px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs\"
                      >
                        {tag}
                      </span>
                    ))}
                    {result.tags.length > 5 && (
                      <span className=\"text-xs text-gray-500 dark:text-gray-400\">
                        +{result.tags.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {/* Entities */}
                {result.entities.length > 0 && (
                  <div className=\"flex items-center flex-wrap gap-2 mt-2\">
                    <User className=\"w-4 h-4 text-gray-400\" />
                    {result.entities.slice(0, 3).map((entity, index) => (
                      <span 
                        key={index}
                        className=\"px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-xs flex items-center space-x-1\"
                      >
                        <span>{entity.value}</span>
                        <span className=\"text-blue-500 dark:text-blue-400\">
                          ({Math.round(entity.confidence * 100)}%)
                        </span>
                      </span>
                    ))}
                    {result.entities.length > 3 && (
                      <span className=\"text-xs text-gray-500 dark:text-gray-400\">
                        +{result.entities.length - 3} entities
                      </span>
                    )}
                  </div>
                )}

                {/* Highlights */}
                {result.highlights.length > 0 && (
                  <div className=\"mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg\">
                    <p className=\"text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1\">
                      Highlights:
                    </p>
                    <div className=\"space-y-1\">
                      {result.highlights.slice(0, 2).map((highlight, index) => (
                        <p key={index} className=\"text-sm text-yellow-700 dark:text-yellow-300\">
                          <span className=\"font-medium capitalize\">{highlight.field}:</span>{' '}
                          <span dangerouslySetInnerHTML={{ __html: highlight.fragments.join(' ... ') }} />
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SearchResults;", "original_text": ""}]