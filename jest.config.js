module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // supabase/functions/** roda em Deno, tem seus próprios *.test.ts que
  // usam Deno.test/jsr: — nunca deixar o Jest tentar pegar esses.
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/supabase/functions/'],
  // Fase 1 (lógica pura, .test.ts) + Fase 2 (componentes/telas com
  // @testing-library/react-native, .test.tsx).
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
};
