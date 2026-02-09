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
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  
  // Backend-specific rules (packages/core, packages/shared)
  {
    files: ['packages/core/**/*.ts', 'packages/shared/**/*.ts'],
    rules: {
      // Allow console for backend logging (we use pino)
      'no-console': 'warn',
      
      // Enforce explicit return types for public APIs
      '@typescript-eslint/explicit-function-return-type': ['error', {
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
      '@typescript-eslint/no-unused-vars': ['error', {
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
      '@typescript-eslint/restrict-template-expressions': ['error', {
        allowNumber: true,
        allowBoolean: true,
        allowNullish: false,
      }],
      
      // Allow control characters in regex for security validation
      'no-control-regex': 'off',
      
      // Allow unnecessary conditions for defensive coding
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      
      // Allow any in specific patterns (pino formatters)
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
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
      
      // Allow explicit any in component props for flexibility
      '@typescript-eslint/no-explicit-any': 'warn',
      
      // Allow unused vars with underscore
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      
      // Allow empty functions for event handlers
      '@typescript-eslint/no-empty-function': 'off',
      
      // Relaxed rules for dashboard (in development)
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-misused-promises': 'warn',
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
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      'no-console': 'off',
    },
  },
  
  // Disable prettier-conflicting rules
  prettier,
);
