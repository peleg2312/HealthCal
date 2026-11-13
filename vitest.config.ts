import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Native modules cannot load under Node; logic tests get small stand-ins.
      'react-native': path.resolve(__dirname, './test/stubs/react-native.ts'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, './test/stubs/async-storage.ts'),
      'expo-crypto': path.resolve(__dirname, './test/stubs/expo-crypto.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/**/*.test.ts'],
  },
});
