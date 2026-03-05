import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import { expect } from 'vitest';

expect.extend(axeMatchers);

afterEach(() => {
  cleanup();
});
