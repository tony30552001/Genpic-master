import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'lucide-react',
          message: 'Import Lucide icons from src/components/icons/lucide*.js so product code depends on semantic icon roles.',
        }],
      }],
    },
  },
  {
    files: ['src/components/icons/lucide*.js'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['api/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs'
    }
  },
  {
    files: ['api/**/__tests__/**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'module'
    }
  },
  {
    files: ['*.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      }
    }
  },
  {
    files: ['src/**/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      }
    }
  },
  {
    files: ['src/components/ui/**/*.jsx'],
    rules: {
      "react-refresh/only-export-components": "off",
    }
  }
])
