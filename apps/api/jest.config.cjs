module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@agentic-review/shared$': '<rootDir>/../../packages/shared/src',
    '^@agentic-review/agents$': '<rootDir>/../../packages/agents/src',
  },
};
