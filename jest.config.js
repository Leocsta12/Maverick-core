module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
  // Fase 1: só lógica pura em src/lib — sem testes de componente ainda
  // (esses exigiriam react-test-renderer / testing-library, próximo passo).
  testMatch: ['**/__tests__/**/*.test.ts'],
};
