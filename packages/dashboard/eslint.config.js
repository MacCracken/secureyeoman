import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { react: reactPlugin },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    plugins: { 'jsx-a11y': jsxA11y },
    rules: Object.fromEntries(
      Object.keys(jsxA11y.rules).map((r) => [`jsx-a11y/${r}`, 'warn'])
    ),
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'storybook-static/**'],
  }
);
