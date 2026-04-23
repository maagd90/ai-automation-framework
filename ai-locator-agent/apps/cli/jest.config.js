module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@ai-locator/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@ai-locator/core$': '<rootDir>/../../packages/core/src/index.ts',
    '^@ai-locator/browser$': '<rootDir>/../../packages/browser/src/index.ts',
    '^@ai-locator/storage$': '<rootDir>/../../packages/storage/src/index.ts',
    '^@ai-locator/generation$': '<rootDir>/../../packages/generation/src/index.ts',
    '^@ai-locator/benchmark$': '<rootDir>/../../packages/benchmark/src/index.ts'
  }
};
