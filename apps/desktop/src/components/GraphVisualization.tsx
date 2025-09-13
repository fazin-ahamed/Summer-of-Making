import React, { useRef, useEffect, useState, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape, { Core, EdgeDefinition, NodeDefinition } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw, 
  Settings,
  Filter,
  Search,
  Download,
  Share2,
  Info,
  Play,
  Pause
} from 'lucide-react';

// Register dagre layout
cytoscape.use(dagre);

interface GraphNode {
  id: string;
  label: string;
  type: 'document' | 'entity' | 'concept' | 'person' | 'organization' | 'location';
  size: number;
  color?: string;
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

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphVisualizationProps {
  data?: GraphData;
  width?: string | number;
  height?: string | number;
  interactive?: boolean;
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
  selectedNodeId?: string;
  className?: string;
}

const GraphVisualization: React.FC<GraphVisualizationProps> = ({
  data,
  width = '100%',
  height = 500,
  interactive = true,
  onNodeClick,
  onEdgeClick,
  selectedNodeId,
  className = '',
}) => {
  const cyRef = useRef<Core | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedLayout, setSelectedLayout] = useState<'dagre' | 'circle' | 'grid' | 'breadthfirst' | 'cose'>('dagre');
  const [showSettings, setShowSettings] = useState(false);
  const [nodeFilter, setNodeFilter] = useState<string>('');
  const [selectedNodeTypes, setSelectedNodeTypes] = useState<Set<string>>(new Set());
  const [zoomLevel, setZoomLevel] = useState(1);

  // Mock data for demonstration
  const mockData: GraphData = {
    nodes: [
      {
        id: '1',
        label: 'Machine Learning',
        type: 'concept',
        size: 40,
        metadata: {
          description: 'A method of data analysis that automates analytical model building',
          tags: ['AI', 'Data Science', 'Technology'],
          confidence: 0.95,
          documentCount: 127
        }
      },
      {
        id: '2',
        label: 'Neural Networks',
        type: 'concept',
        size: 35,
        metadata: {
          description: 'Computing systems inspired by biological neural networks',
          tags: ['Deep Learning', 'AI'],
          confidence: 0.92,
          documentCount: 89
        }
      },
      {
        id: '3',
        label: 'Deep Learning Research.pdf',
        type: 'document',
        size: 25,
        metadata: {
          description: 'Research paper on deep learning techniques',
          tags: ['Research', 'PDF'],
          lastUpdated: '2023-08-15'
        }
      },
      {
        id: '4',
        label: 'Geoffrey Hinton',
        type: 'person',
        size: 30,
        metadata: {
          description: 'Computer scientist known for work on artificial neural networks',
          tags: ['Researcher', 'AI Pioneer'],
          confidence: 0.98
        }
      },
      {
        id: '5',
        label: 'Stanford University',
        type: 'organization',
        size: 28,
        metadata: {
          description: 'Private research university in California',
          tags: ['University', 'Research'],
          confidence: 0.94
        }
      },
      {
        id: '6',
        label: 'Data Science',
        type: 'concept',
        size: 32,
        metadata: {
          description: 'Interdisciplinary field that uses scientific methods to extract knowledge from data',
          tags: ['Analytics', 'Statistics'],
          confidence: 0.91,
          documentCount: 156
        }
      }
    ],
    edges: [
      {
        id: 'e1',
        source: '1',
        target: '2',
        type: 'related_to',
        weight: 0.8,
        label: 'related to',
        metadata: { confidence: 0.85, occurrences: 23 }
      },
      {
        id: 'e2',
        source: '2',
        target: '3',
        type: 'mentions',
        weight: 0.9,
        label: 'mentioned in',
        metadata: { confidence: 0.92, occurrences: 15 }
      },
      {
        id: 'e3',
        source: '4',
        target: '2',
        type: 'related_to',
        weight: 0.95,
        label: 'expert in',
        metadata: { confidence: 0.97, occurrences: 8 }
      },
      {
        id: 'e4',
        source: '4',
        target: '5',
        type: 'related_to',
        weight: 0.7,
        label: 'affiliated with',
        metadata: { confidence: 0.89, occurrences: 5 }
      },
      {
        id: 'e5',
        source: '1',
        target: '6',
        type: 'related_to',
        weight: 0.85,
        label: 'part of',
        metadata: { confidence: 0.88, occurrences: 34 }
      },
      {
        id: 'e6',
        source: '6',
        target: '3',
        type: 'contains',
        weight: 0.75,
        label: 'contains',
        metadata: { confidence: 0.82, occurrences: 12 }
      }
    ]
  };

  const currentData = data || mockData;

  const getNodeColor = (type: string): string => {
    const colors = {
      document: '#3B82F6', // blue
      entity: '#10B981',   // emerald
      concept: '#8B5CF6',  // violet
      person: '#F59E0B',   // amber
      organization: '#EF4444', // red
      location: '#06B6D4'  // cyan
    };
    return colors[type as keyof typeof colors] || '#6B7280';
  };

  const convertToCytoscapeFormat = useCallback((graphData: GraphData) => {
    const filteredNodes = graphData.nodes.filter(node => {
      const matchesFilter = nodeFilter === '' || 
        node.label.toLowerCase().includes(nodeFilter.toLowerCase()) ||
        node.metadata?.tags?.some(tag => tag.toLowerCase().includes(nodeFilter.toLowerCase()));
      
      const matchesType = selectedNodeTypes.size === 0 || selectedNodeTypes.has(node.type);
      
      return matchesFilter && matchesType;
    });

    const filteredNodeIds = new Set(filteredNodes.map(node => node.id));
    const filteredEdges = graphData.edges.filter(edge => 
      filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
    );

    const nodes: NodeDefinition[] = filteredNodes.map(node => ({
      data: {
        id: node.id,
        label: node.label,
        type: node.type,
        size: node.size,
        metadata: node.metadata,
        color: getNodeColor(node.type)
      }
    }));

    const edges: EdgeDefinition[] = filteredEdges.map(edge => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: edge.type,
        weight: edge.weight,
        metadata: edge.metadata
      }
    }));

    return [...nodes, ...edges];
  }, [nodeFilter, selectedNodeTypes]);

  const cytoscapeStylesheet = [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        'label': 'data(label)',
        'width': 'data(size)',
        'height': 'data(size)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '12px',
        'font-weight': 'bold',
        'color': '#ffffff',
        'text-outline-width': 2,
        'text-outline-color': 'data(color)',
        'overlay-opacity': 0.1,
        'z-index': 10
      }
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 3,
        'border-color': '#FFD700',
        'overlay-opacity': 0.2
      }
    },
    {
      selector: 'edge',
      style: {
        'width': (ele: any) => Math.max(1, ele.data('weight') * 5),
        'line-color': '#CBD5E1',
        'target-arrow-color': '#CBD5E1',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '10px',
        'text-rotation': 'autorotate',
        'text-margin-y': -10,
        'color': '#64748B'
      }
    },
    {
      selector: 'edge:selected',
      style: {
        'line-color': '#3B82F6',
        'target-arrow-color': '#3B82F6',
        'width': (ele: any) => Math.max(2, ele.data('weight') * 6)
      }
    },
    {
      selector: `.filtered`,
      style: {
        'opacity': 0.3
      }
    }
  ];

  const applyLayout = useCallback((layoutName: string) => {
    if (!cyRef.current) return;
    
    setIsAnimating(true);
    
    const layoutOptions = {
      dagre: {
        name: 'dagre',
        directed: true,
        padding: 10,
        spacingFactor: 1.2,
        nodeDimensionsIncludeLabels: true,
        animate: true,
        animationDuration: 1000
      },
      circle: {
        name: 'circle',
        radius: 200,
        animate: true,
        animationDuration: 1000
      },
      grid: {
        name: 'grid',
        rows: 3,
        cols: 3,
        animate: true,
        animationDuration: 1000
      },
      breadthfirst: {
        name: 'breadthfirst',
        directed: true,
        spacingFactor: 1.5,
        animate: true,
        animationDuration: 1000
      },
      cose: {
        name: 'cose',
        idealEdgeLength: 100,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 30,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
        animate: true,
        animationDuration: 1000
      }
    };

    const layout = cyRef.current.layout(layoutOptions[layoutName as keyof typeof layoutOptions]);
    layout.run();
    
    setTimeout(() => setIsAnimating(false), 1000);
  }, []);

  const handleZoomIn = () => {
    if (!cyRef.current) return;
    const newZoom = Math.min(zoomLevel * 1.2, 3);
    cyRef.current.zoom(newZoom);
    cyRef.current.center();
    setZoomLevel(newZoom);
  };

  const handleZoomOut = () => {
    if (!cyRef.current) return;
    const newZoom = Math.max(zoomLevel / 1.2, 0.2);
    cyRef.current.zoom(newZoom);
    cyRef.current.center();
    setZoomLevel(newZoom);
  };

  const handleFit = () => {
    if (!cyRef.current) return;
    cyRef.current.fit();
    setZoomLevel(cyRef.current.zoom());
  };

  const handleReset = () => {
    if (!cyRef.current) return;
    cyRef.current.zoom(1);
    cyRef.current.center();
    setZoomLevel(1);
    applyLayout(selectedLayout);
  };

  const handleExport = () => {
    if (!cyRef.current) return;
    const png64 = cyRef.current.png({ scale: 2, full: true });
    const link = document.createElement('a');
    link.download = 'knowledge-graph.png';
    link.href = png64;
    link.click();
  };

  useEffect(() => {
    if (cyRef.current) {
      applyLayout(selectedLayout);
    }
  }, [selectedLayout, applyLayout]);

  useEffect(() => {
    if (cyRef.current && selectedNodeId) {
      const node = cyRef.current.getElementById(selectedNodeId);
      if (node.length > 0) {
        cyRef.current.animate({
          center: { eles: node },
          zoom: 1.5
        }, {
          duration: 500
        });
        node.select();
      }
    }
  }, [selectedNodeId]);

  const nodeTypes = Array.from(new Set(currentData.nodes.map(node => node.type)));

  return (
    <div className={`relative bg-white dark:bg-gray-800 rounded-lg overflow-hidden ${className}`}>
      {/* Control Panel */}
      <div className="absolute top-4 left-4 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 flex items-center space-x-2">
        <button
          onClick={handleZoomIn}
          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        
        <button
          onClick={handleZoomOut}
          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        
        <button
          onClick={handleFit}
          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Fit to Screen"
        >
          <Maximize2 size={16} />
        </button>
        
        <button
          onClick={handleReset}
          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Reset View"
        >
          <RotateCcw size={16} />
        </button>
        
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />
        
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded transition-colors ${
            showSettings
              ? 'text-primary-600 bg-primary-100 dark:bg-primary-900 dark:text-primary-300'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title="Settings"
        >
          <Settings size={16} />
        </button>
        
        <button
          onClick={handleExport}
          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Export as PNG"
        >
          <Download size={16} />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-16 left-4 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 w-80">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-4">Graph Settings</h3>
          
          {/* Layout Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Layout Algorithm
            </label>
            <select
              value={selectedLayout}
              onChange={(e) => setSelectedLayout(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="dagre">Hierarchical (Dagre)</option>
              <option value="cose">Force-directed (CoSE)</option>
              <option value="circle">Circle</option>
              <option value="grid">Grid</option>
              <option value="breadthfirst">Breadth-first</option>
            </select>
          </div>

          {/* Node Filter */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search Nodes
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={nodeFilter}
                onChange={(e) => setNodeFilter(e.target.value)}
                placeholder="Filter nodes..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Node Type Filter */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Node Types
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {nodeTypes.map(type => (
                <label key={type} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedNodeTypes.has(type)}
                    onChange={(e) => {
                      const newTypes = new Set(selectedNodeTypes);
                      if (e.target.checked) {
                        newTypes.add(type);
                      } else {
                        newTypes.delete(type);
                      }
                      setSelectedNodeTypes(newTypes);
                    }}
                    className="mr-2 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize flex items-center">
                    <span
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: getNodeColor(type) }}
                    />
                    {type}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              setNodeFilter('');
              setSelectedNodeTypes(new Set());
            }}
            className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Animation Indicator */}
      {isAnimating && (
        <div className="absolute top-4 right-4 z-20 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 px-3 py-2 rounded-lg flex items-center space-x-2">
          <div className="animate-spin">
            <Play size={14} />
          </div>
          <span className="text-sm">Applying layout...</span>
        </div>
      )}

      {/* Graph Container */}
      <CytoscapeComponent
        elements={convertToCytoscapeFormat(currentData)}
        style={{ width, height }}
        stylesheet={cytoscapeStylesheet}
        cy={(cy) => {
          cyRef.current = cy;
          
          // Handle node clicks
          cy.on('tap', 'node', (event) => {
            const node = event.target;
            const nodeData = node.data();
            if (onNodeClick && interactive) {
              onNodeClick({
                id: nodeData.id,
                label: nodeData.label,
                type: nodeData.type,
                size: nodeData.size,
                metadata: nodeData.metadata
              });
            }
          });

          // Handle edge clicks
          cy.on('tap', 'edge', (event) => {
            const edge = event.target;
            const edgeData = edge.data();
            if (onEdgeClick && interactive) {
              onEdgeClick({
                id: edgeData.id,
                source: edgeData.source,
                target: edgeData.target,
                label: edgeData.label,
                type: edgeData.type,
                weight: edgeData.weight,
                metadata: edgeData.metadata
              });
            }
          });

          // Handle zoom changes
          cy.on('zoom', () => {
            setZoomLevel(cy.zoom());
          });

          // Initial layout
          setTimeout(() => {
            applyLayout(selectedLayout);
          }, 100);
        }}
        layout={{ name: 'preset' }}
        userZoomingEnabled={interactive}
        userPanningEnabled={interactive}
        boxSelectionEnabled={interactive}
      />

      {/* Graph Statistics */}
      <div className="absolute bottom-4 right-4 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3">
        <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center">
            <Info size={14} className="mr-1" />
            {currentData.nodes.length} nodes
          </span>
          <span>{currentData.edges.length} edges</span>
          <span>Zoom: {Math.round(zoomLevel * 100)}%</span>
        </div>
      </div>
    </div>
  );
};

export default GraphVisualization;