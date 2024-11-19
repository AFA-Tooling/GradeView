// jest.config.js (CommonJS format)
module.exports = {
  transform: {
    '^.+\\.js$': 'babel-jest', // Use babel-jest for JavaScript files
    '^.+\\.mjs$': 'babel-jest', // Apply babel-jest to .mjs files as well
  },
  transformIgnorePatterns: [
      '/node_modules/(?!.*).+\\.js$', // This will transpile all node_modules
    ],
  // testEnvironment: 'node',  // Use Node.js environment for tests
  // verbose: true, // Optional: make Jest output more detailed
};