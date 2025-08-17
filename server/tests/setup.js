// Configure test environment
process.env.NODE_ENV = 'test';
process.env.MONGO_URI_TEST = 'mongodb://localhost:27017/ciphergate-test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRES_IN = '1h';

// Mock any global services or modules
jest.mock('../services/email.service');

// Set longer timeout for tests
jest.setTimeout(30000);

// Global test hooks
beforeAll(async () => {
  // Connect to test database
  await mongoose.connect(process.env.MONGO_URI_TEST, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true
  });
});

// Clean up database after each test
afterEach(async () => {
  const { cleanupTestData } = require('./test-utils');
  await cleanupTestData();
});

// Close database connection after all tests
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});
