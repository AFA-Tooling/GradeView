// jest.config.cjs
module.exports = {
  testEnvironment: 'node', // Use Node.js environment for tests
  transform: {
    '^.+\\.js$': 'babel-jest', // Transpile JavaScript files using Babel
  },
  moduleFileExtensions: ['js', 'mjs'], // Support .js and .mjs files
};
