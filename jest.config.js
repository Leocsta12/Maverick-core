module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // supabase/functions/** roda em Deno, tem seus próprios *.test.ts que
  // usam Deno.test/jsr: — nunca deixar o Jest tentar pegar esses.
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/supabase/functions/'],
  // Fase 1 (lógica pura, .test.ts) + Fase 2 (componentes/telas com
  // @testing-library/react-native, .test.tsx).
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  // Pegadinha real: o primeiro teste com render+findByText de um arquivo
  // novo (mission.test.tsx, nutrition.test.tsx) passava sempre local, mas
  // estourava os 5000ms padrão do Jest num clone limpo no CI — máquina mais
  // fria, sem cache aquecido de transform do Babel/jest-expo. Reproduzido
  // clonando o repo do zero antes de confiar no fix (mesma disciplina do
  // resto do projeto — ver README > Testes e CI).
  testTimeout: 15000,
};
