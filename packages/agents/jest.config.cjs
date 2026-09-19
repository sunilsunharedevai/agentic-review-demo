module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@agentic-review/shared$': '<rootDir>/../shared/src',
  },
};
