// jest.config.cjs
module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'mjs'],
  transform: {
    '^.+\\.js$': 'babel-jest', // Use babel-jest to transpile JS files
  },
  // Optionally, you can specify test file patterns
  // testMatch: ['**/__tests__/**/*.js?(x)', '**/?(*.)+(spec|test).js?(x)'],
};
