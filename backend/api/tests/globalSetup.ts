export default async function globalSetup() {
  console.log('🧪 Setting up global test environment...');
  
  // Initialize test database
  process.env.DATABASE_PATH = ':memory:';
  
  // Mock external services
  process.env.MOCK_EXTERNAL_SERVICES = 'true';
  
  console.log('✅ Global test environment ready');
}