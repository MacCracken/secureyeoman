import '../src/index.css';
import type { Preview } from '@storybook/react';

// Storybook 9+ backgrounds API: `options` map + `initialGlobals` (the pre-9
// `values` array / `default` keys are ignored by the v10 runtime).
const preview: Preview = {
  parameters: {
    backgrounds: {
      options: {
        dark: { name: 'dark', value: '#0a0a0a' },
        light: { name: 'light', value: '#ffffff' },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'dark' },
  },
};

export default preview;
