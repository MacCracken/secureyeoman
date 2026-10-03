// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersonalitiesTab } from './PersonalitiesTab';

vi.mock('../../api/client', () => ({
  fetchCommunityPersonalities: vi.fn(),
  installCommunityPersonality: vi.fn(),
  fetchPersonalities: vi.fn(),
  deletePersonality: vi.fn(),
  getAccessToken: vi.fn(() => 'secret-access-token'),
}));

import * as api from '../../api/client';

const base = {
  description: 'd',
  category: 'professional',
  author: 'a',
  version: '1',
  traits: {},
  systemPrompt: 'p',
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <PersonalitiesTab />
    </QueryClientProvider>
  );
}

describe('PersonalitiesTab avatars', () => {
  beforeEach(() => {
    vi.mocked(api.fetchPersonalities).mockResolvedValue({ personalities: [] });
    vi.mocked(api.fetchCommunityPersonalities).mockResolvedValue({
      personalities: [
        { ...base, name: 'Ada', filename: 'ada.md', avatarFile: 'ada.png' },
        { ...base, name: 'Bob', filename: 'bob.md' },
      ],
    } as any);
  });

  it('never puts the access token in an avatar URL', async () => {
    const { container } = renderTab();
    await screen.findByText('Ada');
    const sources = Array.from(container.querySelectorAll('img')).map((img) =>
      img.getAttribute('src')
    );
    expect(sources[0]).toBe('/api/v1/marketplace/community/personalities/avatar/ada.png');
    expect(sources.join(' ')).not.toContain('token');
    expect(sources[1]).toMatch(/^data:image\/svg\+xml,/);
  });

  it('falls back to the letter avatar when the avatar cannot be served', async () => {
    const { container } = renderTab();
    await screen.findByText('Ada');
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
  });
});
