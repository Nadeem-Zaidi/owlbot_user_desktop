import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // Project conventions (docs/frontend-architecture.md).
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/main.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['*.css'], message: 'Styles are imported once, from src/styles/index.css — add your stylesheet there.' },
          { group: ['../../*'], message: 'Use the "@/" alias for imports outside this folder (e.g. "@/shared/ui/ui").' },
        ],
      }],
    },
  },
])
