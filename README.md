# AutoOrganize: Personal Knowledge Management System

A comprehensive personal knowledge management system that combines universal data ingestion, semantic graph construction, and proactive intelligence to help users organize and discover information across multiple platforms and data sources.

## Overview

AutoOrganize provides:
- **Universal Data Integration**: Seamlessly connect and organize data from local files, emails, cloud services, development tools, and communication platforms
- **Intelligent Organization**: Automatically extract entities, relationships, and context to build a semantic understanding of user data
- **Proactive Insights**: Surface relevant information and provide contextual suggestions based on user behavior and data patterns
- **Privacy-First Architecture**: Local-first approach with optional self-hosted synchronization and end-to-end encryption

## Architecture

### Project Structure

```
├── apps/                     # Application layers
│   ├── desktop/             # Electron desktop application
│   ├── mobile/              # React Native mobile app
│   └── web/                 # React web application
├── backend/                 # Backend services
│   ├── api/                 # Node.js API with tRPC
│   └── database/            # Database schemas and migrations
├── rust-core/               # Rust core libraries
│   ├── autoorganize-core/   # Main core library with FFI
│   ├── file-watcher/        # File system monitoring
│   ├── encryption/          # Encryption engine
│   ├── ingestion/           # Document ingestion
│   └── search/              # Search and indexing
├── shared/                  # Shared TypeScript code
│   ├── types/               # Type definitions
│   └── utils/               # Utility functions
├── docs/                    # Documentation
│   ├── api/                 # API documentation
│   └── user/                # User guides
├── scripts/                 # Build and deployment scripts
│   ├── build/               # Build scripts
│   └── deploy/              # Deployment scripts
└── infrastructure/          # Infrastructure configuration
    └── docker/              # Docker configurations
```

### Technology Stack

#### Backend Technologies
- **Runtime**: Node.js 18+ with TypeScript
- **API Framework**: tRPC for type-safe APIs
- **Database**: SQLite with FTS5, RocksDB, Neo4j Community
- **Core Agents**: Rust libraries with FFI bindings
- **NLP**: Sentence Transformers via ONNX Runtime (Rust)
- **Security**: libsodium for encryption (Rust)

#### Frontend Technologies
- **Desktop**: Electron with React 18+ and Recoil
- **Web**: React 18+ with static deployment
- **Mobile**: React Native with Expo (primary Android focus, iOS compatible)
- **Styling**: Tailwind CSS with component library

#### Rust Core Libraries
- **Language**: Rust 1.70+ with stable FFI
- **FFI Bindings**: uniffi-rs for automatic binding generation
- **File Watching**: notify crate for cross-platform file monitoring
- **Encryption**: sodiumoxide for libsodium bindings
- **Database**: rusqlite for SQLite integration

## Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.70+
- SQLite 3
- Neo4j Community Edition (optional)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Summer-of-Making
```

2. Install dependencies:
```bash
npm install
```

3. Build Rust core libraries:
```bash
npm run build:rust
```

4. Start the development environment:
```bash
npm run dev
```

## Development

### Building

- `npm run build` - Build all components
- `npm run build:rust` - Build Rust core libraries
- `npm run build:desktop` - Build desktop application
- `npm run build:mobile` - Build mobile application
- `npm run build:web` - Build web application

### Testing

- `npm test` - Run all tests
- `npm run test:rust` - Run Rust tests
- `npm run test:api` - Run API tests
- `npm run test:ui` - Run UI tests

## License

[License information to be added]

## Contributing

[Contributing guidelines to be added]