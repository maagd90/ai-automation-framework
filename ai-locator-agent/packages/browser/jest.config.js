module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@ai-locator/shared$': '<rootDir>/../shared/src/index.ts',
    '^@ai-locator/core$': '<rootDir>/../core/src/index.ts'
  }
};
