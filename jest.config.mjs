//@type {import('ts-jest').JestConfigWithTsJest}
export default {
  preset: 'ts-jest/presets/default-esm', // Use ESM preset for ts-jest
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'], // Look for tests in the 'tests' directory
  moduleNameMapper: {
    // Specific rule for IdentityStorageManager.js relative import
    '^./IdentityStorageManager\.js$': '<rootDir>/backend/src/IdentityStorageManager.ts',
    // Map <rootDir>/backend/src/.../FileName.js to <rootDir>/backend/src/.../FileName.ts
    '^(<rootDir>/backend/src/.*)\\.js$': '$1.ts',
    // Map imports like '../backend/src/FileName.js' to '<rootDir>/backend/src/FileName.ts'
    '^../backend/src/(.*)\\.js$': '<rootDir>/backend/src/$1.ts',
    // Map imports like '../backend/src/FileName' (no extension) to '<rootDir>/backend/src/FileName.ts'
    '^../backend/src/([^.]+)$': '<rootDir>/backend/src/$1.ts',

    // Mock for markdown files
    '\\.(md)$': '<rootDir>/__mocks__/fileMock.js',

    // Explicitly map @bsv/sdk to its mock implementation
    '^@bsv/sdk$': '<rootDir>/__mocks__/@bsv/sdk.ts',

    // Commented out lines for forcing node_modules version (we want the mock)
    // '^@bsv/sdk$': '<rootDir>/node_modules/@bsv/sdk',
    // '^@bsv/sdk/(.*)$': '<rootDir>/node_modules/@bsv/sdk/$1',
    
    // Force mongodb and its subpaths to resolve to the root node_modules version
    '^mongodb$': '<rootDir>/node_modules/mongodb',
    '^mongodb/(.*)$': '<rootDir>/node_modules/mongodb/$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'mjs', 'json', 'node'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  // Indicates whether each individual test should be reported during the run
  verbose: true,
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, isolatedModules: true }], 
  },
  // If you need to transform files from node_modules (e.g., if they are not ESM compatible)
  transformIgnorePatterns: [
    // Allow @bsv/sdk, mongodb, and other @bsv scoped packages to be transformed
    '/node_modules/(?!(@bsv/sdk|@bsv/overlay|mongodb)/)'
  ],
};
