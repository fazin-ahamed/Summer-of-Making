import { 
  DocumentInfo, 
  Entity, 
  EntityType, 
  DataSourceType, 
  SearchResult,
  AutoOrganizeError 
} from '@autoorganize/types';

// File system utilities
export class FileUtils {
  static getFileExtension(filePath: string): string {
    return filePath.split('.').pop()?.toLowerCase() || '';
  }

  static isTextFile(filePath: string): boolean {
    const textExtensions = [
      'txt', 'md', 'markdown', 'doc', 'docx', 'pdf', 'rtf',
      'odt', 'html', 'htm', 'xml', 'json', 'csv', 'tsv'
    ];
    return textExtensions.includes(this.getFileExtension(filePath));
  }

  static isImageFile(filePath: string): boolean {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'];
    return imageExtensions.includes(this.getFileExtension(filePath));
  }

  static sanitizeFileName(fileName: string): string {
    return fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
  }

  static getRelativePath(fullPath: string, basePath: string): string {
    return fullPath.replace(basePath, '').replace(/^[/\\]/, '');
  }
}

// Text processing utilities
export class TextUtils {
  static extractSnippet(text: string, query: string, maxLength: number = 200): string {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) {
      return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
    }

    const start = Math.max(0, index - maxLength / 2);
    const end = Math.min(text.length, start + maxLength);
    
    let snippet = text.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    
    return snippet;
  }

  static highlightMatches(text: string, query: string): string {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  static wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  static estimateReadingTime(text: string, wordsPerMinute: number = 200): number {
    const words = this.wordCount(text);
    return Math.ceil(words / wordsPerMinute);
  }

  static truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

// Date and time utilities
export class DateUtils {
  static formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 7) {
      return date.toLocaleDateString();
    } else if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  }

  static isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  static isThisWeek(date: Date): boolean {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return date >= weekAgo && date <= now;
  }
}

// Hash utilities
export class HashUtils {
  static async generateHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  static generateId(): string {
    return crypto.randomUUID();
  }
}

// Validation utilities
export class ValidationUtils {
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static isValidFilePath(path: string): boolean {
    const invalidChars = /[<>:"|?*]/;
    return !invalidChars.test(path) && path.trim().length > 0;
  }
}

// Search utilities
export class SearchUtils {
  static rankResults(results: SearchResult[], query: string): SearchResult[] {
    return results.sort((a, b) => {
      // Primary sort by relevance score
      if (a.relevance_score !== b.relevance_score) {
        return b.relevance_score - a.relevance_score;
      }
      
      // Secondary sort by exact title matches
      const aExactMatch = a.title.toLowerCase().includes(query.toLowerCase());
      const bExactMatch = b.title.toLowerCase().includes(query.toLowerCase());
      
      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;
      
      // Tertiary sort by title length (shorter titles ranked higher)
      return a.title.length - b.title.length;
    });
  }

  static groupResultsByType(results: SearchResult[]): Record<string, SearchResult[]> {
    return results.reduce((groups, result) => {
      const type = result.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(result);
      return groups;
    }, {} as Record<string, SearchResult[]>);
  }
}

// Entity utilities
export class EntityUtils {
  static getEntityIcon(type: EntityType): string {
    const icons: Record<EntityType, string> = {
      [EntityType.PERSON]: '👤',
      [EntityType.ORGANIZATION]: '🏢',
      [EntityType.LOCATION]: '📍',
      [EntityType.DATE]: '📅',
      [EntityType.FINANCIAL]: '💰',
      [EntityType.TECHNICAL]: '⚙️',
      [EntityType.PROJECT]: '📋',
      [EntityType.CUSTOM]: '🏷️',
    };
    return icons[type] || '🏷️';
  }

  static getEntityColor(type: EntityType): string {
    const colors: Record<EntityType, string> = {
      [EntityType.PERSON]: '#3B82F6',      // Blue
      [EntityType.ORGANIZATION]: '#8B5CF6', // Purple
      [EntityType.LOCATION]: '#10B981',     // Green
      [EntityType.DATE]: '#F59E0B',         // Yellow
      [EntityType.FINANCIAL]: '#EF4444',    // Red
      [EntityType.TECHNICAL]: '#6B7280',    // Gray
      [EntityType.PROJECT]: '#F97316',      // Orange
      [EntityType.CUSTOM]: '#8B5CF6',       // Purple
    };
    return colors[type] || '#6B7280';
  }

  static formatEntityName(entity: Entity): string {
    if (entity.type === EntityType.PERSON) {
      return entity.name.split(' ').map(part => 
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      ).join(' ');
    }
    return entity.name;
  }
}

// Configuration utilities
export class ConfigUtils {
  static getDefaultConfig() {
    return {
      ingestion: {
        watch_paths: [],
        file_patterns: ['**/*'],
        exclude_patterns: ['node_modules/**', '.git/**', '*.tmp'],
        auto_extract_entities: true,
        auto_build_relationships: true,
      },
      encryption: {
        enabled: false,
        algorithm: 'AES-256-GCM',
        key_derivation: 'PBKDF2',
      },
      search: {
        max_results: 50,
        snippet_length: 200,
        highlight_matches: true,
      },
      ui: {
        theme: 'light',
        language: 'en',
        show_previews: true,
        auto_save: true,
      },
    };
  }

  static validateConfig(config: any): boolean {
    try {
      // Add configuration validation logic here
      return true;
    } catch (error) {
      console.error('Configuration validation failed:', error);
      return false;
    }
  }
}

// Error handling utilities
export class ErrorUtils {
  static createError(message: string, code: string, details?: Record<string, any>): AutoOrganizeError {
    return new AutoOrganizeError(message, code, details);
  }

  static isNetworkError(error: any): boolean {
    return error.code === 'NETWORK_ERROR' || 
           error.message?.includes('network') ||
           error.message?.includes('connection');
  }

  static isFileSystemError(error: any): boolean {
    return error.code === 'ENOENT' || 
           error.code === 'EACCES' ||
           error.code === 'EPERM';
  }

  static formatErrorMessage(error: any): string {
    if (error instanceof AutoOrganizeError) {
      return error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }
    
    if (error.message) {
      return error.message;
    }
    
    return 'An unknown error occurred';
  }
}

// Performance utilities
export class PerformanceUtils {
  private static timers: Map<string, number> = new Map();

  static startTimer(name: string): void {
    this.timers.set(name, Date.now());
  }

  static endTimer(name: string): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      console.warn(`Timer '${name}' was not started`);
      return 0;
    }
    
    const duration = Date.now() - startTime;
    this.timers.delete(name);
    return duration;
  }

  static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  static throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}

// Export all utilities
export {
  FileUtils,
  TextUtils,
  DateUtils,
  HashUtils,
  ValidationUtils,
  SearchUtils,
  EntityUtils,
  ConfigUtils,
  ErrorUtils,
  PerformanceUtils,
};