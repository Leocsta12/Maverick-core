module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
  // Fase 1 (lógica pura, .test.ts) + Fase 2 (componentes/telas com
  // @testing-library/react-native, .test.tsx).
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
};
