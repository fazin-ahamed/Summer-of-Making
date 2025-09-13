export default async function globalTeardown() {
  console.log('🧹 Cleaning up integration test environment...');

  const services = (global as any).__INTEGRATION_SERVICES__;

  if (services) {
    if (services.redis) {
      await services.redis.quit();
      console.log('✅ Redis connection closed');
    }

    if (services.neo4j) {
      await services.neo4j.close();
      console.log('✅ Neo4j connection closed');
    }

    if (services.api) {
      services.api.kill();
      console.log('✅ API server stopped');
    }
  }

  console.log('✅ Integration test environment cleaned up');
}