import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
  {
    // Mock data may only be imported by the data loader. Everything else goes through '@/lib/data',
    // so swapping mocks for curated data is a one-file change (see README "Who owns what").
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/data/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/data/mock/**', '@data/mock/**', '**/data/curated/**', '@data/curated/**'],
              message: "Import data through '@/lib/data', not from data/ directly.",
            },
          ],
        },
      ],
    },
  },
]);
