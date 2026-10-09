// jest.config.cjs
module.exports = {
  testEnvironment: 'node', // Use Node.js environment for tests
  transform: {
    '^.+\\.m?js$': 'babel-jest', // Transpile .js and .mjs files using Babel
  },
  moduleFileExtensions: ['js', 'mjs'], // Support .js and .mjs files
};
