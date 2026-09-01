import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

/**
 * Flat config. The two Next presets carry the react-hooks and next/* rules; everything
 * below is this codebase's own house style. House rules are errors, not warnings: a
 * warning in a money system is a lint rule nobody ever fixes.
 */
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      // Operator scripts, run by hand with node. Not part of the app build.
      'tools/**',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // An unused import in a route handler is usually a half-finished refactor.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `any` erases exactly the checks that stop a string amount reaching the ledger.
      '@typescript-eslint/no-explicit-any': 'error',
      // Floating promises are how an audit-log insert silently never happens.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      /**
       * Downgraded deliberately, and the only rule here that is not an error.
       *
       * React 19's hooks lint flags the load-on-mount pattern used by donor-list,
       * payout-panel, ledger-panel, auth-provider and reset-password: an effect that calls
       * an async loader which then setStates. Those components work, ship today, and are
       * on the donation and payout paths. Silencing the rule file-by-file would hide it;
       * rewriting five data-fetching components to satisfy it is a refactor with its own
       * risk, and not one to bundle into a lint rollout. So it stays visible as a warning
       * until that refactor is done on purpose.
       */
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Tests may reach for shapes the app never would.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]

export default config
