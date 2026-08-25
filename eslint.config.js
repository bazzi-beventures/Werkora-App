import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Flat-Config (ESLint 9+). Lint für die React/TS-PWA.
// TypeScript selbst prüft schon Typen (tsc --noEmit); ESLint ergänzt
// das um Bug-Muster, die der Compiler nicht sieht — v.a. fehlende
// useEffect-Dependencies (react-hooks) und tote Variablen.
export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
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
      // react-hooks v7 zwingt setState-in-Effect als Fehler — ist aber ein
      // legitimes Muster (State-Reset bei Prop-Wechsel, debounced Search).
      // Bewusst aus; die WERTVOLLE Regel exhaustive-deps bleibt an (Warnung).
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Einstieg bewusst mild: `any` und ungenutzte Vars als Warnung,
      // ungenutzte Args mit führendem _ erlaubt.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Seiteneffekt-Ternary/Kurzschluss (`cond ? a() : b()`, `x && f()`) erlauben,
      // aber echte tote Ausdrücke weiter melden.
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
    },
  },
)
