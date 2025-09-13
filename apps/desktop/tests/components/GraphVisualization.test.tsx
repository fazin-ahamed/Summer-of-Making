import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';
import { faker } from '@faker-js/faker';
import GraphVisualization from '../src/components/GraphVisualization';
import { trpc } from '../src/utils/trpc';

// Mock Cytoscape
jest.mock('cytoscape', () => {
  return jest.fn(() => ({
    add: jest.fn(),
    remove: jest.fn(),
    layout: jest.fn(() => ({ run: jest.fn() })),
    fit: jest.fn(),
    zoom: jest.fn(),
    pan: jest.fn(),
    nodes: jest.fn(() => ({ length: 0 })),
    edges: jest.fn(() => ({ length: 0 })),
    on: jest.fn(),
    off: jest.fn(),
    destroy: jest.fn()
  }));
});

jest.mock('../src/utils/trpc', () => ({
  trpc: {
    graph: {
      nodes: {
        useQuery: jest.fn(),
      },
      edges: {
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

describe('GraphVisualization Component', () => {
  const mockNodes = [
    {
      id: '1',
      label: 'Document 1',
      type: 'document',
      properties: { weight: 0.8, category: 'research' }
    },
    {
      id: '2',
      label: 'Entity A',
      type: 'entity',
      properties: { weight: 0.6, category: 'person' }
    },
    {
      id: '3',
      label: 'Topic B',
      type: 'topic',
      properties: { weight: 0.9, category: 'technology' }
    }
  ];

  const mockEdges = [
    {
      id: 'e1',
      source: '1',
      target: '2',
      type: 'contains',
      weight: 0.7
    },
    {
      id: 'e2',
      source: '1',
      target: '3',
      type: 'relates_to',
      weight: 0.5
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render graph container and controls', () => {
    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: { nodes: [] },
      isLoading: false,
      error: null
    });

    (trpc.graph.edges.useQuery as jest.Mock).mockReturnValue({
      data: { edges: [] },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    expect(screen.getByTestId('graph-container')).toBeInTheDocument();
    expect(screen.getByLabelText(/layout algorithm/i)).toBeInTheDocument();
    expect(screen.getByText(/fit to view/i)).toBeInTheDocument();
  });

  it('should display loading state', () => {
    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: true,
      error: null
    });

    (trpc.graph.edges.useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: true,
      error: null
    });

    render(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    expect(screen.getByTestId('graph-loading')).toBeInTheDocument();
    expect(screen.getByText(/loading graph data/i)).toBeInTheDocument();
  });

  it('should handle graph data loading and display stats', async () => {
    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: { nodes: mockNodes },
      isLoading: false,
      error: null
    });

    (trpc.graph.edges.useQuery as jest.Mock).mockReturnValue({
      data: { edges: mockEdges },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/3 nodes/i)).toBeInTheDocument();
      expect(screen.getByText(/2 edges/i)).toBeInTheDocument();
    });
  });

  it('should support different layout algorithms', async () => {
    const user = userEvent.setup();

    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: { nodes: mockNodes },
      isLoading: false,
      error: null
    });

    (trpc.graph.edges.useQuery as jest.Mock).mockReturnValue({
      data: { edges: mockEdges },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    const layoutSelect = screen.getByLabelText(/layout algorithm/i);
    
    await user.selectOptions(layoutSelect, 'dagre');
    await waitFor(() => {
      expect(layoutSelect).toHaveValue('dagre');
    });

    await user.selectOptions(layoutSelect, 'circle');
    await waitFor(() => {
      expect(layoutSelect).toHaveValue('circle');
    });
  });

  it('should support node filtering by type', async () => {
    const user = userEvent.setup();

    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: { nodes: mockNodes },
      isLoading: false,
      error: null
    });

    (trpc.graph.edges.useQuery as jest.Mock).mockReturnValue({
      data: { edges: mockEdges },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    // Open filter panel
    await user.click(screen.getByText(/filters/i));

    // Filter to show only documents
    const documentCheckbox = screen.getByLabelText(/document/i);
    await user.click(documentCheckbox);

    const entityCheckbox = screen.getByLabelText(/entity/i);
    await user.click(entityCheckbox);

    const topicCheckbox = screen.getByLabelText(/topic/i);
    await user.click(topicCheckbox);

    // Only documents should be selected
    expect(documentCheckbox).toBeChecked();
    expect(entityCheckbox).not.toBeChecked();
    expect(topicCheckbox).not.toBeChecked();
  });

  it('should support search within graph', async () => {
    const user = userEvent.setup();

    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: { nodes: mockNodes },
      isLoading: false,
      error: null
    });

    (trpc.graph.edges.useQuery as jest.Mock).mockReturnValue({
      data: { edges: mockEdges },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search nodes/i);
    await user.type(searchInput, 'Document');

    await waitFor(() => {
      // Should highlight matching nodes
      expect(screen.getByTestId('search-matches')).toHaveTextContent('1 match');
    });
  });

  it('should handle node selection and show details', async () => {
    const user = userEvent.setup();
    const mockCytoscape = require('cytoscape');
    const mockCyInstance = mockCytoscape();

    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: { nodes: mockNodes },
      isLoading: false,
      error: null
    });

    (trpc.graph.edges.useQuery as jest.Mock).mockReturnValue({
      data: { edges: mockEdges },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    // Simulate node selection
    const onHandler = mockCyInstance.on.mock.calls.find(call => call[0] === 'tap')[1];
    onHandler({
      target: {
        id: () => '1',
        data: () => mockNodes[0]
      }
    });

    await waitFor(() => {
      expect(screen.getByText(/node details/i)).toBeInTheDocument();
      expect(screen.getByText('Document 1')).toBeInTheDocument();
      expect(screen.getByText(/document/i)).toBeInTheDocument();
    });
  });

  it('should support graph export functionality', async () => {
    const user = userEvent.setup();

    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: { nodes: mockNodes },
      isLoading: false,
      error: null
    });

    (trpc.graph.edges.useQuery as jest.Mock).mockReturnValue({
      data: { edges: mockEdges },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    // Open export menu
    await user.click(screen.getByText(/export/i));
    
    // Export as PNG
    await user.click(screen.getByText(/export as png/i));
    
    await waitFor(() => {
      expect(window.electronAPI.saveFile).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: expect.stringContaining('.png'),
          filters: expect.arrayContaining([
            expect.objectContaining({ name: 'PNG', extensions: ['png'] })
          ])
        })
      );
    });
  });

  it('should handle graph manipulation controls', async () => {
    const user = userEvent.setup();
    const mockCytoscape = require('cytoscape');
    const mockCyInstance = mockCytoscape();

    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: { nodes: mockNodes },
      isLoading: false,
      error: null
    });

    (trpc.graph.edges.useQuery as jest.Mock).mockReturnValue({
      data: { edges: mockEdges },
      isLoading: false,
      error: null
    });

    render(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    // Test fit to view
    await user.click(screen.getByText(/fit to view/i));
    expect(mockCyInstance.fit).toHaveBeenCalled();

    // Test zoom controls
    await user.click(screen.getByLabelText(/zoom in/i));
    expect(mockCyInstance.zoom).toHaveBeenCalled();

    await user.click(screen.getByLabelText(/zoom out/i));
    expect(mockCyInstance.zoom).toHaveBeenCalled();

    // Test reset view
    await user.click(screen.getByText(/reset view/i));
    expect(mockCyInstance.fit).toHaveBeenCalled();
    expect(mockCyInstance.zoom).toHaveBeenCalledWith(1);
  });

  it('should handle error states gracefully', async () => {
    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: { message: 'Failed to load graph data' }
    });

    (trpc.graph.edges.useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: { message: 'Failed to load graph data' }
    });

    render(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to load graph data/i)).toBeInTheDocument();
      expect(screen.getByText(/retry/i)).toBeInTheDocument();
    });
  });

  it('should support real-time graph updates', async () => {
    const { rerender } = render(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    // Initial data
    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: { nodes: mockNodes },
      isLoading: false,
      error: null
    });

    (trpc.graph.edges.useQuery as jest.Mock).mockReturnValue({
      data: { edges: mockEdges },
      isLoading: false,
      error: null
    });

    rerender(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/3 nodes/i)).toBeInTheDocument();
    });

    // Updated data with new node
    const updatedNodes = [...mockNodes, {
      id: '4',
      label: 'New Document',
      type: 'document',
      properties: { weight: 0.7, category: 'new' }
    }];

    (trpc.graph.nodes.useQuery as jest.Mock).mockReturnValue({
      data: { nodes: updatedNodes },
      isLoading: false,
      error: null
    });

    rerender(
      <TestWrapper>
        <GraphVisualization />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/4 nodes/i)).toBeInTheDocument();
    });
  });
});