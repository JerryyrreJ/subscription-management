import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', '.netlify'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['netlify/functions/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/contexts/AuthContext.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  }
);
