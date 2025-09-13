import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';
import { faker } from '@faker-js/faker';
import SearchInterface from '../src/components/SearchInterface';
import { trpc } from '../src/utils/trpc';

// Mock the tRPC client
jest.mock('../src/utils/trpc', () => ({
  trpc: {
    search: {
      query: {
        useQuery: jest.fn(),
      },
      suggest: {
        useQuery: jest.fn(),
      }
    }
  }
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return (
    <RecoilRoot>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </RecoilRoot>
  );
};

describe('SearchInterface Component', () => {
  const mockSearchResults = [
    {
      documentId: faker.string.uuid(),
      title: 'React Testing Best Practices',
      snippet: 'Learn how to test React components effectively...',
      score: 0.95,
      createdAt: faker.date.recent().toISOString()
    },
    {
      documentId: faker.string.uuid(),
      title: 'Advanced TypeScript Features',
      snippet: 'Explore advanced TypeScript patterns and techniques...',
      score: 0.87,
      createdAt: faker.date.recent().toISOString()
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render search input and placeholder text', () => {
    (trpc.search.query.useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <SearchInterface />
      </TestWrapper>
    );

    expect(screen.getByPlaceholderText(/search documents/i)).toBeInTheDocument();
    expect(screen.getByText(/start searching/i)).toBeInTheDocument();
  });

  it('should display search results when query is performed', async () => {
    const user = userEvent.setup();
    
    (trpc.search.query.useQuery as jest.Mock).mockReturnValue({
      data: {
        results: mockSearchResults,
        pagination: { total: 2, hasMore: false }
      },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <SearchInterface />
      </TestWrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search documents/i);
    await user.type(searchInput, 'React testing');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('React Testing Best Practices')).toBeInTheDocument();
      expect(screen.getByText('Advanced TypeScript Features')).toBeInTheDocument();
    });
  });

  it('should show loading state during search', () => {
    (trpc.search.query.useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: true,
      error: null
    });

    render(
      <TestWrapper>
        <SearchInterface />
      </TestWrapper>
    );

    expect(screen.getByTestId('search-loading')).toBeInTheDocument();
  });

  it('should display error message when search fails', async () => {
    (trpc.search.query.useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: { message: 'Search service unavailable' }
    });

    render(
      <TestWrapper>
        <SearchInterface />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/search service unavailable/i)).toBeInTheDocument();
    });
  });

  it('should support different search modes', async () => {
    const user = userEvent.setup();
    const mockQueryFn = jest.fn();
    
    (trpc.search.query.useQuery as jest.Mock).mockImplementation(mockQueryFn);
    mockQueryFn.mockReturnValue({
      data: { results: [], pagination: { total: 0, hasMore: false } },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <SearchInterface />
      </TestWrapper>
    );

    // Switch to fuzzy search mode
    const searchModeSelect = screen.getByLabelText(/search mode/i);
    await user.selectOptions(searchModeSelect, 'fuzzy');

    const searchInput = screen.getByPlaceholderText(/search documents/i);
    await user.type(searchInput, 'progamming'); // Misspelled intentionally
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockQueryFn).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'progamming',
          mode: 'fuzzy'
        })
      );
    });
  });

  it('should handle search suggestions', async () => {
    const user = userEvent.setup();
    const mockSuggestions = ['programming', 'project management', 'productivity'];

    (trpc.search.suggest.useQuery as jest.Mock).mockReturnValue({
      data: { suggestions: mockSuggestions },
      isLoading: false,
      error: null
    });

    (trpc.search.query.useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <SearchInterface />
      </TestWrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search documents/i);
    await user.type(searchInput, 'prog');

    await waitFor(() => {
      expect(screen.getByText('programming')).toBeInTheDocument();
      expect(screen.getByText('project management')).toBeInTheDocument();
    });

    // Click on a suggestion
    await user.click(screen.getByText('programming'));
    expect(searchInput).toHaveValue('programming');
  });

  it('should support keyboard navigation in search results', async () => {
    const user = userEvent.setup();
    
    (trpc.search.query.useQuery as jest.Mock).mockReturnValue({
      data: {
        results: mockSearchResults,
        pagination: { total: 2, hasMore: false }
      },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <SearchInterface />
      </TestWrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search documents/i);
    await user.type(searchInput, 'React');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('React Testing Best Practices')).toBeInTheDocument();
    });

    // Navigate with arrow keys
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('search-result-0')).toHaveClass('highlighted');

    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('search-result-1')).toHaveClass('highlighted');

    // Open document with Enter
    await user.keyboard('{Enter}');
    expect(window.electronAPI.openFile).toHaveBeenCalledWith(mockSearchResults[1].documentId);
  });

  it('should support search filters', async () => {
    const user = userEvent.setup();
    const mockQueryFn = jest.fn();
    
    (trpc.search.query.useQuery as jest.Mock).mockImplementation(mockQueryFn);
    mockQueryFn.mockReturnValue({
      data: { results: [], pagination: { total: 0, hasMore: false } },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <SearchInterface />
      </TestWrapper>
    );

    // Open filter panel
    await user.click(screen.getByLabelText(/filters/i));

    // Set date range filter
    const dateFromInput = screen.getByLabelText(/from date/i);
    await user.type(dateFromInput, '2023-01-01');

    const dateToInput = screen.getByLabelText(/to date/i);
    await user.type(dateToInput, '2023-12-31');

    // Set file type filter
    const fileTypeSelect = screen.getByLabelText(/file type/i);
    await user.selectOptions(fileTypeSelect, 'pdf');

    // Apply filters
    await user.click(screen.getByText(/apply filters/i));

    const searchInput = screen.getByPlaceholderText(/search documents/i);
    await user.type(searchInput, 'test query');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockQueryFn).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'test query',
          filters: expect.objectContaining({
            dateFrom: '2023-01-01',
            dateTo: '2023-12-31',
            fileType: 'pdf'
          })
        })
      );
    });
  });

  it('should handle empty search results', async () => {
    const user = userEvent.setup();
    
    (trpc.search.query.useQuery as jest.Mock).mockReturnValue({
      data: {
        results: [],
        pagination: { total: 0, hasMore: false }
      },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <SearchInterface />
      </TestWrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search documents/i);
    await user.type(searchInput, 'nonexistent_query_xyz');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
      expect(screen.getByText(/try different keywords/i)).toBeInTheDocument();
    });
  });

  it('should support pagination for search results', async () => {
    const user = userEvent.setup();
    const mockQueryFn = jest.fn();
    
    (trpc.search.query.useQuery as jest.Mock).mockImplementation(mockQueryFn);
    mockQueryFn.mockReturnValue({
      data: {
        results: mockSearchResults,
        pagination: { total: 50, offset: 0, limit: 10, hasMore: true }
      },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <SearchInterface />
      </TestWrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search documents/i);
    await user.type(searchInput, 'test');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText(/showing 1-10 of 50/i)).toBeInTheDocument();
      expect(screen.getByText(/next page/i)).toBeInTheDocument();
    });

    // Click next page
    await user.click(screen.getByText(/next page/i));

    await waitFor(() => {
      expect(mockQueryFn).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'test',
          offset: 10,
          limit: 10
        })
      );
    });
  });
});