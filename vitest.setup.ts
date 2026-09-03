import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react's automatic cleanup only self-registers when it
// detects test-framework globals (afterEach on globalThis). This project
// keeps `test.globals` off and imports test utilities explicitly per file,
// so cleanup must be wired up here instead - otherwise DOM trees from every
// test in a file pile up and later assertions can match stale elements from
// a previous test.
afterEach(() => {
  cleanup();
});
