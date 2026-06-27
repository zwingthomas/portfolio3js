import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Mark identifiers used only in JSX (e.g. `motion` in <motion.div>) as used,
      // so no-unused-vars stops false-flagging them. Without eslint-plugin-react's
      // jsx-uses-vars, core ESLint can't see JSX member usage.
      'react/jsx-uses-vars': 'error',
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Build/tool config files run in Node (CommonJS or ESM with __dirname), so
    // give them Node globals — otherwise `module` / `__dirname` read as no-undef.
    files: ['**/*.config.{js,cjs,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
]
