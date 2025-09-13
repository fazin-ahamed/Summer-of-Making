import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });

    // Log to electron main process if available
    if (window.electronAPI) {
      window.electronAPI.showMessage({
        type: 'error',
        title: 'Application Error',
        message: `An unexpected error occurred: ${error.message}`,
        buttons: ['OK'],
      });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <div className="card">
              <div className="card-content text-center">
                <div className="flex justify-center mb-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full">
                    <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                </div>
                
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Something went wrong
                </h2>
                
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  The application encountered an unexpected error and needs to be reloaded.
                </p>

                {this.state.error && (
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-6 text-left">
                    <p className="text-sm font-mono text-gray-800 dark:text-gray-200 break-all">
                      {this.state.error.message}
                    </p>
                  </div>
                )}

                <div className="flex justify-center space-x-3">
                  <button
                    onClick={this.handleReload}
                    className="btn btn-primary flex items-center space-x-2"
                  >
                    <RefreshCw size={16} />
                    <span>Reload Application</span>
                  </button>
                </div>

                {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                  <details className="mt-6 text-left">
                    <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400">
                      Show Error Details
                    </summary>
                    <pre className="mt-2 text-xs text-gray-700 dark:text-gray-300 overflow-auto bg-gray-100 dark:bg-gray-800 p-3 rounded">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}