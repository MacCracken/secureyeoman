import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Ignored paths
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
  },

  // Base config for all TypeScript files
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // TypeScript project configuration
  {
    languageOptions: {
      parserOptions: {
        project: [
          'tsconfig.lint.json',
          'packages/dashboard/tsconfig.json',
          'packages/dashboard/tsconfig.node.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Backend-specific rules (packages/core, packages/shared, packages/mcp)
  {
    files: ['packages/core/**/*.ts', 'packages/shared/**/*.ts', 'packages/mcp/**/*.ts'],
    rules: {
      // Allow console for backend logging (we use pino)
      'no-console': 'warn',

      // Enforce explicit return types for public APIs
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
      }],

      // Security: no eval or dynamic code execution
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // Prefer const
      'prefer-const': 'error',

      // No unused vars (allow underscore prefix)
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // Allow async functions that don't use await (for interface consistency)
      '@typescript-eslint/require-await': 'off',

      // Allow empty functions for stubs
      '@typescript-eslint/no-empty-function': 'off',

      // Allow non-null assertions after null checks (ensureInitialized pattern)
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Allow template literals with numbers (common pattern)
      '@typescript-eslint/restrict-template-expressions': ['warn', {
        allowNumber: true,
        allowBoolean: true,
        allowNullish: true,
      }],

      // Allow control characters in regex for security validation
      'no-control-regex': 'off',

      // Allow unnecessary conditions for defensive coding
      '@typescript-eslint/no-unnecessary-condition': 'warn',

      // Downgrade unsafe-* rules — common patterns with third-party libs
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      // Downgrade rules with high false-positive rates in this codebase
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/return-await': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-useless-constructor': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-dynamic-delete': 'warn',
      '@typescript-eslint/no-deprecated': 'warn',
    },
  },

  // Frontend-specific rules (packages/dashboard)
  {
    files: ['packages/dashboard/**/*.ts', 'packages/dashboard/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React hooks rules
      ...reactHooks.configs.recommended.rules,

      // React refresh for HMR
      'react-refresh/only-export-components': ['warn', {
        allowConstantExport: true,
      }],

      // No console in frontend (warn during development)
      'no-console': 'warn',

      // Allow non-null assertions in React (for refs, etc.)
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',

      // Allow explicit any in component props for flexibility
      '@typescript-eslint/no-explicit-any': 'warn',

      // Allow unused vars with underscore
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // Allow empty functions for event handlers
      '@typescript-eslint/no-empty-function': 'off',

      // Relaxed rules for dashboard
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/restrict-template-expressions': ['warn', {
        allowNumber: true,
        allowBoolean: true,
      }],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-misused-spread': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/return-await': 'off',
    },
  },

  // Test files and examples (more relaxed)
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/example.ts', '**/example*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/dot-notation': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-misused-spread': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-generic-constructors': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/prefer-function-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'require-yield': 'off',
      'no-console': 'off',
    },
  },

  // Disable prettier-conflicting rules
  prettier,
);
