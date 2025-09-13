import React, { useState } from 'react';
import { 
  Calendar, 
  FileText, 
  Tag, 
  X, 
  Plus,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface SearchFilters {
  fileTypes: string[];
  dateRange: {
    start: string | null;
    end: string | null;
  };
  tags: string[];
}

interface SearchFiltersProps {
  filters: SearchFilters;
  onFilterChange: (key: string, value: any) => void;
}

const SearchFilters: React.FC<SearchFiltersProps> = ({ filters, onFilterChange }) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['fileTypes', 'dateRange', 'tags'])
  );
  const [newTag, setNewTag] = useState('');

  const fileTypes = [
    { value: 'pdf', label: 'PDF Documents', count: 324 },
    { value: 'doc', label: 'Word Documents', count: 156 },
    { value: 'docx', label: 'Word Documents (New)', count: 89 },
    { value: 'txt', label: 'Text Files', count: 234 },
    { value: 'md', label: 'Markdown Files', count: 67 },
    { value: 'html', label: 'HTML Files', count: 45 },
    { value: 'xlsx', label: 'Excel Files', count: 23 },
    { value: 'pptx', label: 'PowerPoint Files', count: 12 },
  ];

  const popularTags = [
    'research', 'machine-learning', 'data-science', 'neural-networks',
    'python', 'javascript', 'react', 'typescript', 'ai', 'deep-learning'
  ];

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handleFileTypeChange = (fileType: string, checked: boolean) => {
    const currentTypes = filters.fileTypes;
    const newTypes = checked
      ? [...currentTypes, fileType]
      : currentTypes.filter(type => type !== fileType);
    onFilterChange('fileTypes', newTypes);
  };

  const handleDateRangeChange = (field: 'start' | 'end', value: string) => {
    onFilterChange('dateRange', {
      ...filters.dateRange,
      [field]: value || null,
    });
  };

  const handleTagAdd = (tag: string) => {
    if (tag && !filters.tags.includes(tag)) {
      onFilterChange('tags', [...filters.tags, tag]);
    }
    setNewTag('');
  };

  const handleTagRemove = (tagToRemove: string) => {
    onFilterChange('tags', filters.tags.filter(tag => tag !== tagToRemove));
  };

  const handleNewTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleTagAdd(newTag.trim());
  };

  const SectionHeader: React.FC<{ title: string; section: string; icon: React.ReactNode }> = ({ 
    title, 
    section, 
    icon 
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="flex items-center justify-between w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      <div className="flex items-center space-x-2">
        {icon}
        <span className="font-medium text-gray-900 dark:text-gray-100">{title}</span>
      </div>
      {expandedSections.has(section) ? (
        <ChevronDown className="w-4 h-4 text-gray-500" />
      ) : (
        <ChevronRight className="w-4 h-4 text-gray-500" />
      )}
    </button>
  );

  return (
    <div className="space-y-1">
      {/* File Types */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <SectionHeader
          title="File Types"
          section="fileTypes"
          icon={<FileText className="w-4 h-4 text-gray-500" />}
        />
        {expandedSections.has('fileTypes') && (
          <div className="p-3 space-y-2">
            {fileTypes.map((fileType) => (
              <label key={fileType.value} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.fileTypes.includes(fileType.value)}
                  onChange={(e) => handleFileTypeChange(fileType.value, e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                  {fileType.label}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {fileType.count}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Date Range */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <SectionHeader
          title="Date Range"
          section="dateRange"
          icon={<Calendar className="w-4 h-4 text-gray-500" />}
        />
        {expandedSections.has('dateRange') && (
          <div className="p-3 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From
              </label>
              <input
                type="date"
                value={filters.dateRange.start || ''}
                onChange={(e) => handleDateRangeChange('start', e.target.value)}
                className="input text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                To
              </label>
              <input
                type="date"
                value={filters.dateRange.end || ''}
                onChange={(e) => handleDateRangeChange('end', e.target.value)}
                className="input text-sm"
              />
            </div>
            
            {/* Quick date presets */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Today', days: 0 },
                { label: 'Last Week', days: 7 },
                { label: 'Last Month', days: 30 },
                { label: 'Last Year', days: 365 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    const end = new Date().toISOString().split('T')[0];
                    const start = new Date(Date.now() - preset.days * 24 * 60 * 60 * 1000)
                      .toISOString().split('T')[0];
                    onFilterChange('dateRange', { start, end });
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tags */}
      <div>
        <SectionHeader
          title="Tags"
          section="tags"
          icon={<Tag className="w-4 h-4 text-gray-500" />}
        />
        {expandedSections.has('tags') && (
          <div className="p-3 space-y-3">
            {/* Selected tags */}
            {filters.tags.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Selected:
                </span>
                <div className="flex flex-wrap gap-2">
                  {filters.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-full text-xs"
                    >
                      {tag}
                      <button
                        onClick={() => handleTagRemove(tag)}
                        className="ml-1 hover:text-primary-900 dark:hover:text-primary-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Add new tag */}
            <form onSubmit={handleNewTagSubmit} className="flex space-x-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add tag..."
                className="input flex-1 text-sm"
              />
              <button
                type="submit"
                disabled={!newTag.trim()}
                className="btn btn-primary p-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            {/* Popular tags */}
            <div className="space-y-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Popular:
              </span>
              <div className="flex flex-wrap gap-2">
                {popularTags
                  .filter(tag => !filters.tags.includes(tag))
                  .slice(0, 8)
                  .map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleTagAdd(tag)}
                      className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchFilters;