import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';
import ts from '@typescript-eslint/eslint-plugin';

export default [
  { ignores: ['node_modules/**', '.amplify-hosting/**', '.deployment/**', 'dist/**', 'public/**', 'local-voice/**', 'server/engine-reference/**'] },
  { ...js.configs.recommended, files: ['src/**/*.{js,jsx}', 'server/*.mjs', 'scripts/*.mjs', 'tests/*.mjs'] },
  { files: ['src/**/*.{js,jsx}'],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { react, 'react-hooks': hooks },
    rules: { ...hooks.configs.recommended.rules, 'react/jsx-uses-vars': 'error', 'react/jsx-uses-react': 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
  { files: ['server/*.mjs', 'scripts/*.mjs', 'tests/*.mjs'], languageOptions: { globals: globals.node }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] } },
  { files: ['src/planner/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': ts, react, 'react-hooks': hooks },
    rules: { ...hooks.configs.recommended.rules, 'react/jsx-uses-vars': 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
];
