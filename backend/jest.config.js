module.exports = {
  testEnvironment: 'node',
  testTimeout: 60000, // integration tests spin up an in-memory MongoDB
  testMatch: ['**/tests/**/*.test.js'],
};
