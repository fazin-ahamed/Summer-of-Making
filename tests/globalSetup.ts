import { spawn, ChildProcess } from 'child_process';
import { createClient } from 'redis';
import neo4j from 'neo4j-driver';
import path from 'path';

let services: {
  redis?: any;
  neo4j?: any;
  api?: ChildProcess;
} = {};

export default async function globalSetup() {
  console.log('🚀 Setting up integration test environment...');

  try {
    // Start Redis if not running
    console.log('📦 Connecting to Redis...');
    services.redis = createClient({ url: 'redis://localhost:6379' });
    await services.redis.connect();
    await services.redis.flushAll();
    console.log('✅ Redis connected and cleared');

    // Setup Neo4j
    console.log('🗄️ Connecting to Neo4j...');
    services.neo4j = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'password'));
    const session = services.neo4j.session();
    await session.run('MATCH (n) DETACH DELETE n');
    await session.close();
    console.log('✅ Neo4j connected and cleared');

    // Store service references globally for cleanup
    (global as any).__INTEGRATION_SERVICES__ = services;

    console.log('✅ Integration test environment ready');
  } catch (error) {
    console.error('❌ Failed to setup integration test environment:', error);
    throw error;
  }
}