import React, { useState } from 'react';
import { useRecoilState } from 'recoil';
import {
  Network,
  Info,
  Filter,
  Download,
  Settings,
  Eye,
  EyeOff,
  BarChart3,
  Share2,
  Layers,
  Search,
  RefreshCw
} from 'lucide-react';
import GraphVisualization from '../components/GraphVisualization';
import { trpc } from '../utils/trpc';

interface GraphNode {
  id: string;
  label: string;
  type: 'document' | 'entity' | 'concept' | 'person' | 'organization' | 'location';
  size: number;
  metadata?: {
    description?: string;
    tags?: string[];
    confidence?: number;
    lastUpdated?: string;
    documentCount?: number;
  };
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: 'mentions' | 'related_to' | 'contains' | 'derived_from' | 'similar_to';
  weight: number;
  metadata?: {
    confidence?: number;
    occurrences?: number;
    context?: string[];
  };
}

const GraphPage: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [showNodePanel, setShowNodePanel] = useState(true);
  const [showStatistics, setShowStatistics] = useState(false);
  const [graphDepth, setGraphDepth] = useState(2);
  const [centerNodeId, setCenterNodeId] = useState<string>('');

  // GraphQL queries for graph data
  const graphQuery = trpc.graph.getKnowledgeGraph.useQuery({
    centerNodeId: centerNodeId || undefined,
    depth: graphDepth,
    minWeight: 0.1,
    maxNodes: 100,
  });

  const statisticsQuery = trpc.graph.getGraphStatistics.useQuery();

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  };

  const handleEdgeClick = (edge: GraphEdge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  };

  const handleCenterOnNode = (nodeId: string) => {
    setCenterNodeId(nodeId);
  };

  const handleRefreshGraph = () => {
    graphQuery.refetch();
    statisticsQuery.refetch();
  };

  const renderNodePanel = () => {
    if (!selectedNode) return null;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
            <div
              className="w-4 h-4 rounded-full mr-2"
              style={{ backgroundColor: getNodeColor(selectedNode.type) }}
            />
            {selectedNode.label}
          </h3>
          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-full capitalize">
            {selectedNode.type}
          </span>
        </div>

        {selectedNode.metadata?.description && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">{selectedNode.metadata.description}</p>
          </div>
        )}

        {selectedNode.metadata?.tags && selectedNode.metadata.tags.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</h4>
            <div className="flex flex-wrap gap-1">
              {selectedNode.metadata.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-xs rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          {selectedNode.metadata?.confidence && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confidence</h4>
              <div className="flex items-center">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full"
                    style={{ width: `${selectedNode.metadata.confidence * 100}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {Math.round(selectedNode.metadata.confidence * 100)}%
                </span>
              </div>
            </div>
          )}

          {selectedNode.metadata?.documentCount && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Documents</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {selectedNode.metadata.documentCount} references
              </p>
            </div>
          )}
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => handleCenterOnNode(selectedNode.id)}
            className="btn btn-primary text-sm"
          >
            Center Graph
          </button>
          <button
            onClick={() => {
              // TODO: Navigate to search with this entity
            }}
            className="btn btn-ghost text-sm"
          >
            Find Related
          </button>
        </div>
      </div>
    );
  };

  const renderEdgePanel = () => {
    if (!selectedEdge) return null;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Connection Details
          </h3>
          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-full capitalize">
            {selectedEdge.type.replace('_', ' ')}
          </span>
        </div>

        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Relationship</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">{selectedEdge.source}</span>
            {' '}→{' '}
            <span className="font-medium">{selectedEdge.target}</span>
          </p>
          {selectedEdge.label && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
              "{selectedEdge.label}"
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Strength</h4>
            <div className="flex items-center">
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${selectedEdge.weight * 100}%` }}
                />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {Math.round(selectedEdge.weight * 100)}%
              </span>
            </div>
          </div>

          {selectedEdge.metadata?.occurrences && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Occurrences</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {selectedEdge.metadata.occurrences} times
              </p>
            </div>
          )}
        </div>

        {selectedEdge.metadata?.context && selectedEdge.metadata.context.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Context Examples</h4>
            <div className="space-y-2">
              {selectedEdge.metadata.context.slice(0, 3).map((context, index) => (
                <p key={index} className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                  "{context}"
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStatistics = () => {
    if (!statisticsQuery.data) return null;

    const stats = statisticsQuery.data.data;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
          <BarChart3 className="w-5 h-5 mr-2" />
          Graph Statistics
        </h3>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
              {stats.totalNodes}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Nodes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.totalEdges}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Edges</div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Node Types</h4>
            {Object.entries(stats.nodeTypeDistribution).map(([type, count]) => (
              <div key={type} className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600 dark:text-gray-400 capitalize flex items-center">
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: getNodeColor(type) }}
                  />
                  {type}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {count}
                </span>
              </div>
            ))}
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Connection Types</h4>
            {Object.entries(stats.edgeTypeDistribution).map(([type, count]) => (
              <div key={type} className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                  {type.replace('_', ' ')}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {stats.density.toFixed(3)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Graph Density</div>
          </div>
        </div>
      </div>
    );
  };

  const getNodeColor = (type: string): string => {
    const colors = {
      document: '#3B82F6',
      entity: '#10B981',
      concept: '#8B5CF6',
      person: '#F59E0B',
      organization: '#EF4444',
      location: '#06B6D4'
    };
    return colors[type as keyof typeof colors] || '#6B7280';
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <Network className="w-7 h-7 mr-2" />
              Knowledge Graph
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Explore the connections and relationships in your knowledge base.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowStatistics(!showStatistics)}
              className={`btn ${showStatistics ? 'btn-primary' : 'btn-ghost'} flex items-center space-x-1`}
            >
              <BarChart3 size={16} />
              <span>Stats</span>
            </button>

            <button
              onClick={() => setShowNodePanel(!showNodePanel)}
              className={`btn ${showNodePanel ? 'btn-primary' : 'btn-ghost'} flex items-center space-x-1`}
            >
              {showNodePanel ? <EyeOff size={16} /> : <Eye size={16} />}
              <span>Panel</span>
            </button>

            <button
              onClick={handleRefreshGraph}
              className="btn btn-ghost flex items-center space-x-1"
              disabled={graphQuery.isLoading}
            >
              <RefreshCw size={16} className={graphQuery.isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Graph Controls */}
        <div className="mt-4 flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Graph Depth:
            </label>
            <select
              value={graphDepth}
              onChange={(e) => setGraphDepth(Number(e.target.value))}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value={1}>1 Level</option>
              <option value={2}>2 Levels</option>
              <option value={3}>3 Levels</option>
              <option value={4}>4 Levels</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Center Node:
            </label>
            <div className="relative">
              <Search className="absolute left-2 top-1.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={centerNodeId}
                onChange={(e) => setCenterNodeId(e.target.value)}
                placeholder="Node ID or search..."
                className="pl-8 pr-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Graph Area */}
        <div className="flex-1 p-6">
          {graphQuery.isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
                <p className="text-gray-600 dark:text-gray-400">Loading knowledge graph...</p>
              </div>
            </div>
          ) : graphQuery.error ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Network className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Failed to load graph
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {graphQuery.error.message}
                </p>
                <button
                  onClick={() => graphQuery.refetch()}
                  className="btn btn-primary"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : (
            <GraphVisualization
              data={graphQuery.data?.data}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              selectedNodeId={selectedNode?.id}
              className="h-full border border-gray-200 dark:border-gray-700"
            />
          )}
        </div>

        {/* Side Panel */}
        {showNodePanel && (
          <div className="w-80 bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 p-6 overflow-y-auto">
            {showStatistics && (
              <div className="mb-6">
                {statisticsQuery.isLoading ? (
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <div className="animate-pulse">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                    </div>
                  </div>
                ) : (
                  renderStatistics()
                )}
              </div>
            )}

            {selectedNode && renderNodePanel()}
            {selectedEdge && renderEdgePanel()}

            {!selectedNode && !selectedEdge && (
              <div className="text-center py-8">
                <Network className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-2">
                  Select a node or edge to view details
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Click on any element in the graph to explore its properties and connections.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphPage;