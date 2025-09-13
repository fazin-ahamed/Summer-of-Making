import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { WebSocketServer } from 'ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import dotenv from 'dotenv';
import winston from 'winston';
import cron from 'node-cron';

import { appRouter, createContext } from './trpc';
import { DatabaseManager } from '@autoorganize/database';
import { ErrorUtils } from '@autoorganize/utils';

// Load environment variables
dotenv.config();

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'autoorganize-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Configuration
const config = {
  port: parseInt(process.env.PORT || '3001'),
  wsPort: parseInt(process.env.WS_PORT || '3002'),
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  database: {
    sqlite: {
      path: process.env.SQLITE_PATH || './data/autoorganize.db',
      enableWAL: true,
    },
    neo4j: process.env.NEO4J_URI ? {
      uri: process.env.NEO4J_URI,
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE,
    } : undefined,
    rocksdb: {
      path: process.env.ROCKSDB_PATH || './data/graph.db',
    },
  },
  rust: {
    coreLibPath: process.env.RUST_CORE_LIB_PATH || './rust-core/target/release',
  },
};

class AutoOrganizeServer {
  private app: express.Application;
  private server?: any;
  private wss?: WebSocketServer;
  private dbManager: DatabaseManager;

  constructor() {
    this.app = express();
    this.dbManager = new DatabaseManager(config.database);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupCronJobs();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors(config.cors));

    // Compression
    this.app.use(compression());

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] || 
        Math.random().toString(36).substring(2, 15);
      next();
    });
  }

  private setupRoutes(): void {{
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.dbManager.healthCheck();
        const status = Object.values(health).every(h => h) ? 'healthy' : 'degraded';
        
        res.status(status === 'healthy' ? 200 : 503).json({
          status,
          timestamp: new Date().toISOString(),
          components: health,
          version: process.env.npm_package_version || '0.1.0',
        });
      } catch (error) {
        logger.error('Health check failed', error);
        res.status(503).json({
          status: 'unhealthy',
          error: ErrorUtils.formatErrorMessage(error),
        });
      }
    });

    // API info endpoint
    this.app.get('/api/info', (req, res) => {
      res.json({
        name: 'AutoOrganize API',
        version: process.env.npm_package_version || '0.1.0',
        description: 'Personal Knowledge Management System API',
        documentation: '/api/docs',
        endpoints: {
          trpc: '/api/trpc',
          websocket: `ws://localhost:${config.wsPort}`,
        },
      });
    });

    // tRPC middleware
    this.app.use(
      '/api/trpc',
      createExpressMiddleware({
        router: appRouter,
        createContext,
        onError: ({ error, type, path, input, ctx, req }) => {
          logger.error('tRPC Error', {
            error: error.message,
            code: error.code,
            type,
            path,
            input,
            userId: ctx?.user?.id,
            requestId: ctx?.requestId,
          });
        },
      })
    );

    // File upload endpoint
    this.app.post('/api/upload', async (req, res) => {
      try {
        // TODO: Implement file upload with multer
        res.json({ message: 'Upload endpoint not yet implemented' });
      } catch (error) {
        logger.error('Upload failed', error);
        res.status(500).json({
          error: ErrorUtils.formatErrorMessage(error),
        });
      }
    });

    // Static file serving for uploads
    this.app.use('/api/files', express.static('./data/uploads'));

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
      });
    });

    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error', error);
      res.status(500).json({
        error: 'Internal server error',
        requestId: req.headers['x-request-id'],
      });
    });
  }

  private setupWebSocket(): void {
    this.wss = new WebSocketServer({ port: config.wsPort });

    const handler = applyWSSHandler({
      wss: this.wss,
      router: appRouter,
      createContext: (opts) => {
        return {
          requestId: Math.random().toString(36),
          ip: 'websocket',
          user: undefined, // TODO: Implement WS authentication
        };
      },
    });

    this.wss.on('connection', (ws) => {
      logger.info('WebSocket connection established');
      
      ws.on('close', () => {
        logger.info('WebSocket connection closed');
      });
    });

    logger.info(`WebSocket server listening on port ${config.wsPort}`);
  }

  private setupCronJobs(): void {
    // Index maintenance job - runs every hour
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Running scheduled index maintenance');
        // TODO: Implement index maintenance
      } catch (error) {
        logger.error('Index maintenance failed', error);
      }
    });

    // Cleanup job - runs daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        logger.info('Running scheduled cleanup');
        // TODO: Implement cleanup tasks
        // - Remove old log files
        // - Clean up temporary files
        // - Optimize database
      } catch (error) {
        logger.error('Cleanup job failed', error);
      }
    });

    // Statistics update job - runs every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      try {
        logger.info('Updating system statistics');
        // TODO: Update cached statistics
      } catch (error) {
        logger.error('Statistics update failed', error);
      }
    });
  }

  async start(): Promise<void> {
    try {
      // Initialize database connections
      await this.dbManager.initialize();
      logger.info('Database connections initialized');

      // Start HTTP server
      this.server = this.app.listen(config.port, () => {
        logger.info(`HTTP server listening on port ${config.port}`);
      });

      // Start WebSocket server
      this.setupWebSocket();

      // Graceful shutdown handling
      this.setupGracefulShutdown();

      logger.info('AutoOrganize API server started successfully');
    } catch (error) {
      logger.error('Failed to start server', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);

      // Stop accepting new connections
      if (this.server) {
        this.server.close();
      }

      // Close WebSocket connections
      if (this.wss) {
        this.wss.close();
      }

      // Close database connections
      await this.dbManager.close();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
    }
    if (this.wss) {
      this.wss.close();
    }
    await this.dbManager.close();
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new AutoOrganizeServer();
  server.start().catch((error) => {
    logger.error('Failed to start server', error);
    process.exit(1);
  });
}

export default AutoOrganizeServer;