// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryFilter, CategoryGroupedGrid, categoryLabel, SKILL_CATEGORIES } from './shared';
import type { CatalogSkill } from '../../types';

function makeMockSkill(overrides: Partial<CatalogSkill> = {}): CatalogSkill {
  return {
    id: `skill-${Math.random().toString(36).slice(2)}`,
    name: 'Test Skill',
    description: 'A test skill',
    version: '1.0.0',
    author: 'Test Author',
    category: 'development',
    tags: [],
    downloadCount: 0,
    source: 'builtin',
    installed: false,
    installedGlobally: false,
    instructions: '',
    triggerPatterns: [],
    tools: [],
    mcpToolsAllowed: [],
    updatedAt: Date.now(),
    ...overrides,
  } as CatalogSkill;
}

describe('categoryLabel', () => {
  it('returns capitalized label for known categories', () => {
    expect(categoryLabel('development')).toBe('Development');
    expect(categoryLabel('healthcare')).toBe('Healthcare');
  });

  it('capitalizes first letter of unknown categories', () => {
    expect(categoryLabel('robotics')).toBe('Robotics');
  });
});

describe('SKILL_CATEGORIES', () => {
  it('contains 13 categories', () => {
    expect(SKILL_CATEGORIES).toHaveLength(13);
  });

  it('includes key categories', () => {
    expect(SKILL_CATEGORIES).toContain('development');
    expect(SKILL_CATEGORIES).toContain('security');
    expect(SKILL_CATEGORIES).toContain('finance');
    expect(SKILL_CATEGORIES).toContain('healthcare');
  });
});

describe('CategoryFilter', () => {
  it('renders All button and category pills', () => {
    const counts = { development: 3, security: 2 };
    render(<CategoryFilter value="" onChange={vi.fn()} counts={counts} />);
    expect(screen.getByRole('tab', { name: /All/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Development/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Security/ })).toBeInTheDocument();
  });

  it('shows counts in pills', () => {
    const counts = { development: 5, security: 2 };
    render(<CategoryFilter value="" onChange={vi.fn()} counts={counts} />);
    expect(screen.getByRole('tab', { name: 'All (7)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Development (5)' })).toBeInTheDocument();
  });

  it('hides categories with zero count', () => {
    const counts = { development: 3 };
    render(<CategoryFilter value="" onChange={vi.fn()} counts={counts} />);
    expect(screen.queryByRole('tab', { name: /Security/ })).not.toBeInTheDocument();
  });

  it('marks selected category as active', () => {
    const counts = { development: 3, security: 2 };
    render(<CategoryFilter value="development" onChange={vi.fn()} counts={counts} />);
    const devTab = screen.getByRole('tab', { name: /Development/ });
    expect(devTab).toHaveAttribute('aria-selected', 'true');
    const allTab = screen.getByRole('tab', { name: /All/ });
    expect(allTab).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange when clicking a category', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const counts = { development: 3, security: 2 };
    render(<CategoryFilter value="" onChange={onChange} counts={counts} />);
    await user.click(screen.getByRole('tab', { name: /Development/ }));
    expect(onChange).toHaveBeenCalledWith('development');
  });

  it('calls onChange with empty string when clicking All', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const counts = { development: 3 };
    render(<CategoryFilter value="development" onChange={onChange} counts={counts} />);
    await user.click(screen.getByRole('tab', { name: /All/ }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('CategoryGroupedGrid', () => {
  it('renders skills grouped by category with collapsible headers', () => {
    const skills = [
      makeMockSkill({ id: 's1', name: 'DevSkill', category: 'development' }),
      makeMockSkill({ id: 's2', name: 'SecSkill', category: 'security' }),
      makeMockSkill({ id: 's3', name: 'DevSkill2', category: 'development' }),
    ];
    render(
      <CategoryGroupedGrid
        skills={skills}
        renderCard={(s) => (
          <div key={s.id} data-testid={`card-${s.id}`}>
            {s.name}
          </div>
        )}
      />
    );
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument(); // development count
    expect(screen.getByText('(1)')).toBeInTheDocument(); // security count
    expect(screen.getByTestId('card-s1')).toBeInTheDocument();
    expect(screen.getByTestId('card-s2')).toBeInTheDocument();
    expect(screen.getByTestId('card-s3')).toBeInTheDocument();
  });

  it('renders flat grid when only one category exists', () => {
    const skills = [
      makeMockSkill({ id: 's1', name: 'Skill1', category: 'development' }),
      makeMockSkill({ id: 's2', name: 'Skill2', category: 'development' }),
    ];
    render(
      <CategoryGroupedGrid
        skills={skills}
        renderCard={(s) => (
          <div key={s.id} data-testid={`card-${s.id}`}>
            {s.name}
          </div>
        )}
      />
    );
    // No category headers when single category
    expect(screen.queryByText('Development')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-s1')).toBeInTheDocument();
    expect(screen.getByTestId('card-s2')).toBeInTheDocument();
  });

  it('collapses a category when clicking the header', async () => {
    const user = userEvent.setup();
    const skills = [
      makeMockSkill({ id: 's1', name: 'DevSkill', category: 'development' }),
      makeMockSkill({ id: 's2', name: 'SecSkill', category: 'security' }),
    ];
    render(
      <CategoryGroupedGrid
        skills={skills}
        renderCard={(s) => (
          <div key={s.id} data-testid={`card-${s.id}`}>
            {s.name}
          </div>
        )}
      />
    );
    // Both visible initially
    expect(screen.getByTestId('card-s1')).toBeInTheDocument();
    expect(screen.getByTestId('card-s2')).toBeInTheDocument();

    // Collapse development
    await user.click(screen.getByText('Development'));
    expect(screen.queryByTestId('card-s1')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-s2')).toBeInTheDocument();

    // Re-expand
    await user.click(screen.getByText('Development'));
    expect(screen.getByTestId('card-s1')).toBeInTheDocument();
  });

  it('sorts categories alphabetically', () => {
    const skills = [
      makeMockSkill({ id: 's1', category: 'utilities' }),
      makeMockSkill({ id: 's2', category: 'development' }),
      makeMockSkill({ id: 's3', category: 'finance' }),
    ];
    const { container } = render(
      <CategoryGroupedGrid skills={skills} renderCard={(s) => <div key={s.id}>{s.name}</div>} />
    );
    const headings = container.querySelectorAll('h3');
    const labels = Array.from(headings).map((h) => h.textContent);
    expect(labels).toEqual(['Development', 'Finance', 'Utilities']);
  });
});
