# AutoOrganize User Guide

## Welcome to AutoOrganize

AutoOrganize is a powerful personal knowledge management system that helps you capture, organize, and discover insights from your documents and information. This guide will help you get started and make the most of all features.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Document Management](#document-management)
3. [Search and Discovery](#search-and-discovery)
4. [Knowledge Graph](#knowledge-graph)
5. [Mobile App](#mobile-app)
6. [Advanced Features](#advanced-features)
7. [Tips and Best Practices](#tips-and-best-practices)
8. [Troubleshooting](#troubleshooting)

## Getting Started

### Installation

#### Desktop Application

1. **Download**: Get the latest version from [releases page](https://github.com/autoorganize/releases)
2. **Install**: 
   - **Windows**: Run the `.exe` installer
   - **macOS**: Open the `.dmg` file and drag to Applications
   - **Linux**: Use the `.AppImage` file or install via package manager

3. **First Launch**: 
   - Accept the privacy policy
   - Choose your data storage location
   - Set up encryption (recommended)

#### Mobile Application

1. **Download**: Available on App Store and Google Play
2. **Setup**: 
   - Create account or sign in
   - Enable camera permissions for document scanning
   - Connect to your desktop app (optional)

### Initial Setup

#### 1. Configure Data Storage

Choose where your documents will be stored:

- **Local Only**: All data stays on your device (most private)
- **Cloud Sync**: Sync across devices using your cloud service
- **Hybrid**: Local with selective cloud backup

#### 2. Set Up Encryption

AutoOrganize uses strong encryption to protect your data:

1. Go to **Settings** → **Security**
2. Click **Enable Encryption**
3. Create a strong master password
4. **Important**: Store your recovery key safely - you cannot recover data without it

#### 3. Configure File Watching

Automatically import documents from folders:

1. Go to **Settings** → **File Watching**
2. Click **Add Folder**
3. Choose folders to monitor
4. Select processing options:
   - **Auto-import**: Automatically add new files
   - **Extract entities**: Find people, places, organizations
   - **Generate embeddings**: Enable semantic search

## Document Management

### Adding Documents

#### Method 1: Drag and Drop

1. Open AutoOrganize desktop app
2. Drag files from your file manager into the main window
3. Choose processing options in the dialog
4. Click **Import**

#### Method 2: File Menu

1. Click **File** → **Import Documents**
2. Select files or folders
3. Configure import settings
4. Click **Import**

#### Method 3: Mobile Scanning

1. Open AutoOrganize mobile app
2. Tap the **Camera** icon
3. Position document in the frame
4. Tap capture when edges are detected
5. Review and edit if needed
6. Tap **Save**

### Supported File Types

| Category | Formats |
|----------|---------|
| **Documents** | PDF, DOC, DOCX, TXT, RTF, ODT |
| **Presentations** | PPT, PPTX, ODP |
| **Spreadsheets** | XLS, XLSX, CSV, ODS |
| **Web** | HTML, HTM, MHTML |
| **Images** | PNG, JPG, JPEG, GIF, BMP, TIFF |
| **Other** | MD, JSON, XML, EPUB |

### Document Properties

Each document has the following properties:

- **Title**: Document name (auto-extracted or manual)
- **Content**: Full text content
- **Metadata**: Author, creation date, tags, category
- **Entities**: Extracted people, places, organizations, dates
- **Language**: Auto-detected language
- **Relationships**: Connections to other documents

### Organizing Documents

#### Tags and Categories

1. **Select documents** in the main view
2. **Right-click** → **Edit Properties**
3. **Add tags**: Type and press Enter
4. **Set category**: Choose from dropdown or create new
5. **Click Save**

#### Custom Metadata

Add custom fields to documents:

1. Go to **Settings** → **Document Fields**
2. Click **Add Field**
3. Define field name and type
4. Apply to existing documents (optional)

#### Folders and Collections

Create virtual folders to organize documents:

1. Click **Collections** in sidebar
2. Click **New Collection**
3. Name your collection
4. Drag documents into the collection

## Search and Discovery

### Basic Search

#### Simple Text Search

1. Click the **search bar** at the top
2. Type your search terms
3. Press **Enter** or click search icon
4. Browse results

#### Search Modes

Choose different search modes for better results:

- **Standard**: Exact word matching
- **Fuzzy**: Handles typos and variations
- **Semantic**: Finds similar meaning
- **Boolean**: Use AND, OR, NOT operators
- **Wildcard**: Use * and ? for pattern matching

#### Search Filters

Narrow down results using filters:

1. Click **Filters** button in search results
2. Set criteria:
   - **Date range**: When document was created/modified
   - **File type**: PDF, Word, etc.
   - **Author**: Document creator
   - **Tags**: Specific tags
   - **Size**: File size range
   - **Language**: Document language

#### Advanced Search Syntax

Use special operators for precise searches:

```
title:"project requirements"     # Search in title only
author:john                      # Documents by specific author
tag:important                    # Documents with specific tag
created:2023                     # Documents from 2023
size:>1MB                        # Large documents
type:pdf                         # Only PDF files
"exact phrase"                   # Exact phrase matching
project AND requirements        # Both terms must appear
project OR requirements          # Either term can appear
project NOT outdated             # Exclude documents with "outdated"
```

### Search Results

#### Understanding Results

Each search result shows:

- **Title**: Document title with search terms highlighted
- **Snippet**: Relevant excerpt with context
- **Score**: Relevance score (0-100%)
- **Metadata**: File type, date, author, size
- **Tags**: Associated tags

#### Sorting Options

Sort results by:

- **Relevance**: Best matches first (default)
- **Date**: Newest or oldest first
- **Title**: Alphabetical order
- **Size**: Largest or smallest first
- **Author**: By document creator

#### Quick Actions

From search results, you can:

- **Open**: View the full document
- **Preview**: Quick look without opening
- **Edit**: Modify document properties
- **Share**: Export or send to others
- **Related**: Find similar documents

### Saved Searches

Save frequently used searches:

1. Perform a search with filters
2. Click **Save Search** button
3. Name your saved search
4. Access from **Saved Searches** in sidebar

### Search Analytics

View your search patterns:

1. Go to **Tools** → **Search Analytics**
2. See:
   - Most frequent searches
   - Search performance metrics
   - Popular documents
   - Search trends over time

## Knowledge Graph

The knowledge graph visualizes relationships between your documents, entities, and concepts.

### Viewing the Graph

1. Click **Graph** in the main navigation
2. Use controls to:
   - **Zoom**: Mouse wheel or pinch gestures
   - **Pan**: Click and drag background
   - **Select**: Click on nodes or edges
   - **Multi-select**: Hold Ctrl/Cmd and click

### Graph Layout Options

Choose different layouts for better visualization:

- **Force-directed**: Natural clustering
- **Hierarchical**: Tree-like structure
- **Circular**: Nodes arranged in circles
- **Grid**: Organized grid layout
- **Custom**: Manually position nodes

### Node Types

The graph contains different types of nodes:

#### Documents (Blue circles)
- Represent your actual documents
- Size indicates importance or connections
- Click to open the document

#### Entities (Colored by type)
- **People** (Green): Extracted person names
- **Organizations** (Orange): Companies, institutions
- **Locations** (Red): Places, addresses
- **Dates** (Purple): Important dates and events
- **Concepts** (Gray): Abstract topics and themes

#### Topics (Yellow hexagons)
- Auto-generated themes from document content
- Represent clusters of related documents

### Edge Types

Connections between nodes represent different relationships:

- **Contains**: Document contains an entity
- **Mentions**: Casual reference to an entity
- **Relates to**: Semantic relationship
- **Co-occurs**: Entities appear together
- **Similar**: Documents with similar content

### Graph Filters

Filter what's shown in the graph:

1. Click **Filters** panel
2. Toggle node types on/off
3. Adjust relationship strength threshold
4. Filter by date range or other criteria

### Graph Navigation

#### Finding Connections

1. **Right-click any node** → **Find Connections**
2. Set maximum degrees of separation (1-5)
3. Choose relationship types to follow
4. Click **Search**

#### Shortest Path

Find how two entities are connected:

1. Select first node
2. Hold **Shift** and select second node
3. Right-click → **Show Shortest Path**

#### Subgraph Extraction

Create focused views:

1. Select nodes of interest (Ctrl/Cmd + click)
2. Right-click → **Extract Subgraph**
3. View only selected nodes and their connections

### Graph Analysis

#### Centrality Analysis

Identify the most important nodes:

1. Go to **Graph** → **Analysis** → **Centrality**
2. Choose metric:
   - **Degree**: Most connected nodes
   - **Betweenness**: Bridge nodes connecting communities
   - **Closeness**: Nodes close to all others
   - **PageRank**: Overall importance score

#### Community Detection

Find clusters of related content:

1. Go to **Graph** → **Analysis** → **Communities**
2. AutoOrganize will automatically detect communities
3. View community statistics and members

#### Export Graph Data

Export for use in other tools:

1. Go to **File** → **Export** → **Graph Data**
2. Choose format:
   - **JSON**: Full graph data
   - **CSV**: Nodes and edges tables
   - **GraphML**: Standard graph format
   - **GEXF**: Gephi format

## Mobile App

### Document Scanning

#### Camera Scanning

1. Open AutoOrganize mobile app
2. Tap **Scan** button
3. **Position document**: Align with guidelines
4. **Auto-capture**: When edges are detected (green frame)
5. **Manual capture**: Tap camera button
6. **Review**: Check quality and crop if needed
7. **Enhance**: Auto-enhance or manual adjustments
8. **Save**: Add to your knowledge base

#### Scan Quality Tips

- **Good lighting**: Use natural light when possible
- **Stable position**: Hold device steady
- **Flat surface**: Place document on flat surface
- **High contrast**: Dark text on light background works best
- **Clean background**: Remove clutter around document

#### Multi-page Documents

Scan multiple pages in sequence:

1. Scan first page normally
2. Tap **Add Page** after saving
3. Scan additional pages
4. All pages combine into single document
5. Reorder pages if needed

#### Batch Scanning

Scan multiple separate documents quickly:

1. Tap **Batch Scan** mode
2. Scan documents one after another
3. Each document auto-saves
4. Review and edit later

### OCR and Text Recognition

#### Automatic OCR

- Enabled by default for all scans
- Supports 100+ languages
- Works on printed and handwritten text
- Processes in the background

#### Manual OCR Correction

If text recognition isn't perfect:

1. Open scanned document
2. Tap **Edit Text**
3. Correct any errors
4. Tap **Save**

#### Language Detection

- Auto-detects document language
- Optimizes OCR for detected language
- Manually override if needed

### Mobile Search

#### Voice Search

1. Tap microphone icon in search bar
2. Speak your search query
3. Review transcription
4. Tap **Search**

#### Quick Filters

Access common filters quickly:

- **Recent**: Documents from last week
- **Images**: Scanned documents only
- **Important**: High-priority documents
- **Unread**: New documents

#### Offline Search

- Core search works offline
- Semantic search requires internet
- Recently accessed documents cached

### Sync and Backup

#### Desktop Sync

Connect mobile app to desktop:

1. Open desktop app → **Settings** → **Mobile Sync**
2. Generate QR code
3. Scan QR code with mobile app
4. Documents sync automatically

#### Cloud Backup

Backup to cloud services:

1. Go to **Settings** → **Backup**
2. Choose cloud provider:
   - iCloud (iOS)
   - Google Drive (Android)
   - Dropbox
   - OneDrive
3. Configure backup schedule
4. Enable encryption for cloud storage

## Advanced Features

### Automation Rules

Create rules to automatically process documents:

#### Setting Up Rules

1. Go to **Settings** → **Automation**
2. Click **New Rule**
3. Define trigger:
   - File added to watched folder
   - Document contains specific text
   - File type matches pattern
   - Author is specific person

4. Define actions:
   - Add specific tags
   - Move to collection
   - Extract entities
   - Send notification
   - Run custom script

#### Example Rules

**Auto-categorize invoices:**
```
Trigger: Document contains "Invoice" or "Bill"
Actions: 
- Add tag "invoice"
- Move to "Financial Documents" collection
- Extract entities (amounts, dates, vendors)
```

**Process research papers:**
```
Trigger: PDF file added AND title contains "Research"
Actions:
- Add tag "research"
- Generate semantic embeddings
- Extract author and citation information
```

### Custom Entity Types

Create custom entity types for your domain:

1. Go to **Settings** → **Entity Types**
2. Click **Add Custom Type**
3. Define:
   - **Name**: Entity type name
   - **Patterns**: Regex patterns to match
   - **Validation**: Rules for valid entities
   - **Properties**: Additional metadata fields

4. **Examples**:
   - Product codes: `[A-Z]{2}-\d{4}`
   - Project names: Custom list
   - Reference numbers: `REF-\d{6}`

### Plugins and Extensions

Extend AutoOrganize functionality:

#### Installing Plugins

1. Go to **Settings** → **Plugins**
2. Browse available plugins
3. Click **Install** on desired plugins
4. Configure plugin settings

#### Popular Plugins

- **Zotero Integration**: Import research references
- **Slack Connector**: Archive important messages
- **Email Import**: Process email attachments
- **Citation Generator**: Generate academic citations
- **Web Clipper**: Save web pages and articles

#### Creating Custom Plugins

Developers can create plugins using the AutoOrganize API:

```javascript
const plugin = {
  name: "Custom Processor",
  version: "1.0.0",
  
  onDocumentAdded: async (document) => {
    // Custom processing logic
    const customData = await processDocument(document);
    return { metadata: customData };
  },
  
  onSearch: async (query, results) => {
    // Modify search results
    return enhancedResults;
  }
};

autoorganize.registerPlugin(plugin);
```

### API Integration

Integrate with external services:

#### Webhook Configuration

1. Go to **Settings** → **Integrations** → **Webhooks**
2. Add webhook URL
3. Select events to trigger:
   - Document added
   - Document updated
   - Entity extracted
   - Search performed

4. Configure authentication and headers

#### REST API Usage

Access your data programmatically:

```bash
# Search documents
curl -X GET "http://localhost:3000/api/search?q=project" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Add document
curl -X POST "http://localhost:3000/api/documents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "title": "Meeting Notes",
    "content": "Discussion about project timeline...",
    "tags": ["meeting", "project"]
  }'
```

### Data Export and Migration

#### Export Options

Export your data in various formats:

1. Go to **File** → **Export**
2. Choose export type:
   - **Complete Backup**: Everything including settings
   - **Documents Only**: Just document content
   - **Graph Data**: Knowledge graph structure
   - **Search Index**: For migration

3. Select format:
   - **Native**: AutoOrganize format (best for backup)
   - **Standard**: JSON, CSV, XML
   - **Archive**: ZIP with files and metadata

#### Migration from Other Tools

Import from popular knowledge management tools:

**From Evernote:**
1. Export Evernote notes as ENEX
2. Go to **File** → **Import** → **Evernote**
3. Select ENEX files
4. Map note properties to AutoOrganize fields

**From Obsidian:**
1. Export Obsidian vault
2. Go to **File** → **Import** → **Markdown**
3. Import vault folder
4. AutoOrganize preserves links and structure

**From Notion:**
1. Export Notion workspace as ZIP
2. Go to **File** → **Import** → **Notion**
3. Select ZIP file
4. Configure page hierarchy mapping

## Tips and Best Practices

### Organizing Strategy

#### Tagging Best Practices

- **Use consistent naming**: "project-name" not "Project Name"
- **Create tag hierarchies**: "work/projects/client-name"
- **Limit tags per document**: 3-7 tags maximum
- **Use broad categories**: "reference", "actionable", "archive"

#### Collection Organization

- **Purpose-based**: Research, Projects, Reference
- **Time-based**: 2023, Q1, Monthly-reports
- **Source-based**: Emails, Scanned, Imported
- **Status-based**: Active, Completed, Archived

#### Document Naming

- **Be descriptive**: "Project Requirements v2.1" not "Requirements"
- **Include dates**: "Meeting Notes 2023-10-15"
- **Use consistent format**: "YYYY-MM-DD Project Name"
- **Avoid special characters**: Stick to letters, numbers, hyphens

### Search Optimization

#### Building Good Search Habits

- **Start broad, then narrow**: Begin with general terms, add filters
- **Use quotes for phrases**: "machine learning" not machine learning
- **Learn from suggestions**: AutoOrganize learns your search patterns
- **Save frequent searches**: Create shortcuts for common queries

#### Improving Search Results

- **Add document summaries**: Brief descriptions improve relevance
- **Use consistent terminology**: Same terms for same concepts
- **Tag key documents**: Important documents get priority in results
- **Regular maintenance**: Remove outdated or duplicate content

### Knowledge Graph Optimization

#### Building Rich Connections

- **Cross-reference documents**: Mention related documents by name
- **Use consistent entity names**: "John Smith" not "J. Smith" or "John"
- **Add context**: Explain relationships in your documents
- **Regular entity review**: Clean up and merge similar entities

#### Graph Maintenance

- **Monthly review**: Check for orphaned nodes
- **Merge duplicates**: Combine similar entities and topics
- **Validate relationships**: Remove incorrect connections
- **Update classifications**: Improve entity types and categories

### Performance Optimization

#### Keep AutoOrganize Fast

- **Regular maintenance**: Monthly cleanup of duplicates
- **Index optimization**: Rebuild search index quarterly
- **Storage management**: Archive old documents
- **Cache management**: Clear cache if experiencing slowdowns

#### Large Collections

For collections over 10,000 documents:

- **Use selective indexing**: Index only important documents fully
- **Implement archiving**: Move old documents to separate archive
- **Optimize searches**: Use specific filters to narrow results
- **Consider storage**: Use external storage for large files

## Troubleshooting

### Common Issues

#### Search Not Working

**Problem**: Search returns no results or incorrect results

**Solutions**:
1. **Rebuild search index**:
   - Go to **Settings** → **Search** → **Rebuild Index**
   - Wait for completion (may take several minutes)

2. **Check search syntax**:
   - Remove special characters
   - Try simpler search terms
   - Use different search mode

3. **Verify document processing**:
   - Check if documents were fully processed
   - Re-import problematic documents

#### Slow Performance

**Problem**: AutoOrganize responds slowly

**Solutions**:
1. **Clear cache**:
   - Go to **Settings** → **Storage** → **Clear Cache**

2. **Optimize database**:
   - Go to **Tools** → **Maintenance** → **Optimize Database**

3. **Check available space**:
   - Ensure sufficient disk space (>10% free)
   - Move large files to external storage

4. **Update software**:
   - Check for AutoOrganize updates
   - Update operating system

#### Sync Issues

**Problem**: Mobile app not syncing with desktop

**Solutions**:
1. **Check connection**:
   - Ensure both devices on same network
   - Verify internet connectivity

2. **Restart sync**:
   - Disconnect and reconnect mobile app
   - Restart both applications

3. **Check permissions**:
   - Allow AutoOrganize through firewall
   - Enable necessary network permissions

#### Document Processing Errors

**Problem**: Documents fail to import or process

**Solutions**:
1. **Check file format**:
   - Verify file is supported format
   - Try converting to different format

2. **File corruption**:
   - Open file in original application
   - Re-save if possible

3. **Encoding issues**:
   - Convert text files to UTF-8 encoding
   - Use different OCR settings for scanned documents

#### Graph Visualization Problems

**Problem**: Knowledge graph is slow or doesn't display correctly

**Solutions**:
1. **Reduce node count**:
   - Apply filters to show fewer nodes
   - Increase relationship strength threshold

2. **Update graphics drivers**:
   - Ensure latest graphics drivers installed
   - Try different rendering mode

3. **Browser issues** (web version):
   - Clear browser cache
   - Try different browser
   - Disable browser extensions

### Getting Help

#### Documentation and Resources

- **User Manual**: Complete feature documentation
- **Video Tutorials**: Step-by-step guides
- **FAQ**: Frequently asked questions
- **Community Forum**: User discussions and solutions
- **API Documentation**: For developers

#### Support Channels

1. **Built-in Help**:
   - Press F1 or click Help menu
   - Search help articles
   - Access tutorials

2. **Community Support**:
   - Community forum: [forum.autoorganize.com](https://forum.autoorganize.com)
   - Discord channel: Real-time chat support
   - Reddit community: r/AutoOrganize

3. **Direct Support**:
   - Email: support@autoorganize.com
   - Ticket system: For bug reports
   - Priority support: For premium users

#### Reporting Issues

When reporting bugs or issues:

1. **Include system information**:
   - AutoOrganize version
   - Operating system
   - Available memory and storage

2. **Describe the problem**:
   - What you were trying to do
   - What happened instead
   - Steps to reproduce

3. **Attach relevant files**:
   - Log files (Settings → Support → Export Logs)
   - Screenshots or screen recordings
   - Sample documents (if relevant)

4. **Export diagnostic information**:
   - Go to **Settings** → **Support** → **Export Diagnostics**
   - Include in support request

---

## Conclusion

AutoOrganize is designed to grow with your knowledge and adapt to your workflow. The key to getting the most value is consistent use and gradual refinement of your organization system.

Start simple with basic document import and search, then gradually explore advanced features like the knowledge graph, automation rules, and custom integrations.

Remember that building a comprehensive knowledge base is an iterative process. Your system will become more valuable as you add content and refine your organization strategy.

For the latest updates and new features, check the [AutoOrganize blog](https://blog.autoorganize.com) and follow us on social media.

Happy organizing! 🚀