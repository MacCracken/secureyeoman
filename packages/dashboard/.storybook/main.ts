import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  // Controls/actions/viewport/backgrounds are built into Storybook core since v9;
  // the old `@storybook/addon-essentials` package no longer exists for v10.
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};

export default config;
