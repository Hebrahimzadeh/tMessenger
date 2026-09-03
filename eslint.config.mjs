import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  // services/* and packages/* are plain Node/TypeScript workspaces (Fastify
  // API, shared Zod contracts) with no React/JSX - the Next-flavoured rules
  // below (react-hooks, jsx-a11y, etc.) don't apply and would just be noise.
  // They get their own workspace-scoped `typecheck`/`test`; linting them is
  // deferred to whichever task actually needs it.
  { ignores: ['playwright-report/**', 'test-results/**', 'services/**', 'packages/**'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
