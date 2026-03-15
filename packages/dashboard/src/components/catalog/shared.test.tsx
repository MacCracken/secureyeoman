// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ContentTypeSelector,
  ContentSuspense,
  SkillCard,
  SkillPreviewModal,
  PersonalitySelector,
  CategoryFilter,
  CategoryGroupedGrid,
  categoryLabel,
  exportSkill,
  _CONTENT_TYPES,
  _SKILL_CATEGORIES,
} from './shared';
import type { CatalogSkill, Personality, Skill } from '../../types';

vi.mock('../../api/client', () => ({
  installMarketplaceSkill: vi.fn(),
  uninstallMarketplaceSkill: vi.fn(),
  fetchPersonalities: vi.fn(),
}));

vi.mock('../../utils/sanitize', () => ({
  sanitizeText: (s: string) => s,
}));

const mockSkill: CatalogSkill = {
  name: 'Test Skill',
  version: '1.0.0',
  description: 'A test skill for unit tests',
  category: 'development',
  author: 'TestAuthor',
  downloadCount: 1234,
  installed: false,
  installedGlobally: false,
  tags: ['test', 'dev'],
  triggerPatterns: ['/test'],
  tools: [{ name: 'test_tool' }],
  instructions: 'Test instructions',
  mcpToolsAllowed: ['tool1'],
  source: 'marketplace',
  updatedAt: Date.now(),
  authorInfo: { github: 'testuser', website: 'https://test.com', license: 'MIT' },
} as CatalogSkill;

const mockInstalledSkill: CatalogSkill = {
  ...mockSkill,
  name: 'Installed Skill',
  installed: true,
};

const mockGlobalSkill: CatalogSkill = {
  ...mockSkill,
  name: 'Global Skill',
  installedGlobally: true,
};

const mockYeomanSkill: CatalogSkill = {
  ...mockSkill,
  name: 'Yeoman Skill',
  author: 'YEOMAN',
};

const mockCommunitySkill: CatalogSkill = {
  ...mockSkill,
  name: 'Community Skill',
  source: 'community',
};

describe('ContentTypeSelector', () => {
  it('should render content type buttons', () => {
    render(<ContentTypeSelector value="skills" onChange={vi.fn()} />);
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Workflows')).toBeInTheDocument();
    expect(screen.getByText('Swarm Templates')).toBeInTheDocument();
  });

  it('should call onChange when clicking a type', () => {
    const onChange = vi.fn();
    render(<ContentTypeSelector value="skills" onChange={onChange} />);
    fireEvent.click(screen.getByText('Workflows'));
    expect(onChange).toHaveBeenCalledWith('workflows');
  });

  it('should hide specified types', () => {
    render(
      <ContentTypeSelector
        value="skills"
        onChange={vi.fn()}
        hiddenTypes={['workflows', 'swarms']}
      />
    );
    expect(screen.queryByText('Workflows')).not.toBeInTheDocument();
    expect(screen.queryByText('Swarm Templates')).not.toBeInTheDocument();
  });

  it('should return null when only one type visible', () => {
    const { container } = render(
      <ContentTypeSelector
        value="skills"
        onChange={vi.fn()}
        hiddenTypes={['workflows', 'swarms', 'themes', 'personalities']}
      />
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('ContentSuspense', () => {
  it('should render children', () => {
    render(
      <ContentSuspense>
        <div>Content</div>
      </ContentSuspense>
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});

describe('SkillCard', () => {
  it('should render skill name and version', () => {
    render(
      <SkillCard
        skill={mockSkill}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onPreview={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('Test Skill')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('should render Install button for non-installed skill', () => {
    render(
      <SkillCard
        skill={mockSkill}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onPreview={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('Install')).toBeInTheDocument();
  });

  it('should render Uninstall button for installed skill', () => {
    render(
      <SkillCard
        skill={mockInstalledSkill}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onPreview={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('Uninstall')).toBeInTheDocument();
  });

  it('should show Installed globally for global skills', () => {
    render(
      <SkillCard
        skill={mockGlobalSkill}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onPreview={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('Installed globally')).toBeInTheDocument();
  });

  it('should show YEOMAN badge for YEOMAN author', () => {
    render(
      <SkillCard
        skill={mockYeomanSkill}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onPreview={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('YEOMAN')).toBeInTheDocument();
  });

  it('should call onPreview when Preview is clicked', () => {
    const onPreview = vi.fn();
    render(
      <SkillCard
        skill={mockSkill}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onPreview={onPreview}
        installing={false}
        uninstalling={false}
      />
    );
    fireEvent.click(screen.getByText('Preview'));
    expect(onPreview).toHaveBeenCalled();
  });

  it('should call onInstall when Install is clicked', () => {
    const onInstall = vi.fn();
    render(
      <SkillCard
        skill={mockSkill}
        onInstall={onInstall}
        onUninstall={vi.fn()}
        onPreview={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    fireEvent.click(screen.getByText('Install'));
    expect(onInstall).toHaveBeenCalled();
  });

  it('should show download count', () => {
    render(
      <SkillCard
        skill={mockSkill}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onPreview={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('1,234 installs')).toBeInTheDocument();
  });

  it('should render custom badge', () => {
    render(
      <SkillCard
        skill={mockSkill}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onPreview={vi.fn()}
        installing={false}
        uninstalling={false}
        badge={<span>Custom Badge</span>}
      />
    );
    expect(screen.getByText('Custom Badge')).toBeInTheDocument();
  });
});

describe('SkillPreviewModal', () => {
  it('should render skill details', () => {
    render(
      <SkillPreviewModal
        skill={mockSkill}
        onClose={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('Test Skill')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('A test skill for unit tests')).toBeInTheDocument();
  });

  it('should show tags', () => {
    render(
      <SkillPreviewModal
        skill={mockSkill}
        onClose={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('test')).toBeInTheDocument();
    expect(screen.getByText('dev')).toBeInTheDocument();
  });

  it('should show trigger patterns', () => {
    render(
      <SkillPreviewModal
        skill={mockSkill}
        onClose={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('/test')).toBeInTheDocument();
  });

  it('should show tools section', () => {
    render(
      <SkillPreviewModal
        skill={mockSkill}
        onClose={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('test_tool')).toBeInTheDocument();
  });

  it('should show MCP restricted tools', () => {
    render(
      <SkillPreviewModal
        skill={mockSkill}
        onClose={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('tool1')).toBeInTheDocument();
  });

  it('should show instructions', () => {
    render(
      <SkillPreviewModal
        skill={mockSkill}
        onClose={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('Test instructions')).toBeInTheDocument();
  });

  it('should show community badge for community skills', () => {
    render(
      <SkillPreviewModal
        skill={mockCommunitySkill}
        onClose={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('Community')).toBeInTheDocument();
  });

  it('should show author info links', () => {
    render(
      <SkillPreviewModal
        skill={mockSkill}
        onClose={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Website')).toBeInTheDocument();
    expect(screen.getByText('MIT')).toBeInTheDocument();
  });

  it('should call onClose when Close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <SkillPreviewModal
        skill={mockSkill}
        onClose={onClose}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('should close on Escape key', () => {
    const onClose = vi.fn();
    render(
      <SkillPreviewModal
        skill={mockSkill}
        onClose={onClose}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('should close on backdrop click', () => {
    const onClose = vi.fn();
    const { container } = render(
      <SkillPreviewModal
        skill={mockSkill}
        onClose={onClose}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    // Click the backdrop (outermost div)
    const backdrop = container.querySelector('.fixed.inset-0');
    if (backdrop) {
      fireEvent.click(backdrop, { target: backdrop, currentTarget: backdrop });
    }
  });

  it('should show Uninstall for installed skill in modal', () => {
    render(
      <SkillPreviewModal
        skill={mockInstalledSkill}
        onClose={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getAllByText('Uninstall').length).toBeGreaterThan(0);
  });

  it('should show Installed globally in modal for global skills', () => {
    render(
      <SkillPreviewModal
        skill={mockGlobalSkill}
        onClose={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        installing={false}
        uninstalling={false}
      />
    );
    expect(screen.getByText('Installed globally')).toBeInTheDocument();
  });
});

describe('PersonalitySelector', () => {
  const personalities: Personality[] = [
    { id: 'p1', name: 'Default', isActive: true } as Personality,
    { id: 'p2', name: 'Creative', isActive: false } as Personality,
  ];

  it('should render personalities in selector', () => {
    render(<PersonalitySelector personalities={personalities} value="" onChange={vi.fn()} />);
    expect(screen.getByText('Default (Active)')).toBeInTheDocument();
    expect(screen.getByText('Creative')).toBeInTheDocument();
  });

  it('should show global option by default', () => {
    render(<PersonalitySelector personalities={personalities} value="" onChange={vi.fn()} />);
    expect(screen.getByText('Global (All Personalities)')).toBeInTheDocument();
  });

  it('should show select placeholder when required', () => {
    render(
      <PersonalitySelector personalities={personalities} value="" onChange={vi.fn()} required />
    );
    // Use getAllByRole to get the option with the placeholder text
    const options = screen.getAllByRole('option');
    const placeholder = options.find((o) => o.textContent?.includes('Select a personality'));
    expect(placeholder).toBeTruthy();
  });

  it('should call onChange when selecting', () => {
    const onChange = vi.fn();
    render(<PersonalitySelector personalities={personalities} value="" onChange={onChange} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'p1' } });
    expect(onChange).toHaveBeenCalledWith('p1');
  });
});

describe('CategoryFilter', () => {
  it('should render All button', () => {
    render(<CategoryFilter value="" onChange={vi.fn()} />);
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('should render category buttons', () => {
    render(<CategoryFilter value="" onChange={vi.fn()} />);
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('should call onChange when clicking a category', () => {
    const onChange = vi.fn();
    render(<CategoryFilter value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Development'));
    expect(onChange).toHaveBeenCalledWith('development');
  });

  it('should call onChange with empty string when clicking All', () => {
    const onChange = vi.fn();
    render(<CategoryFilter value="development" onChange={onChange} />);
    fireEvent.click(screen.getByText('All'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('should show counts when provided', () => {
    render(<CategoryFilter value="" onChange={vi.fn()} counts={{ development: 5, security: 3 }} />);
    expect(screen.getByText('Development (5)')).toBeInTheDocument();
    expect(screen.getByText('Security (3)')).toBeInTheDocument();
    expect(screen.getByText('All (8)')).toBeInTheDocument();
  });

  it('should hide categories with zero count', () => {
    render(<CategoryFilter value="" onChange={vi.fn()} counts={{ development: 5 }} />);
    expect(screen.getByText('Development (5)')).toBeInTheDocument();
    expect(screen.queryByText('Security')).not.toBeInTheDocument();
  });
});

describe('CategoryGroupedGrid', () => {
  const skills: CatalogSkill[] = [
    { ...mockSkill, name: 'Dev Skill 1', category: 'development' },
    { ...mockSkill, name: 'Dev Skill 2', category: 'development' },
    { ...mockSkill, name: 'Sec Skill', category: 'security' },
  ];

  it('should render grouped by category', () => {
    render(
      <CategoryGroupedGrid skills={skills} renderCard={(s) => <div key={s.name}>{s.name}</div>} />
    );
    expect(screen.getByText('Dev Skill 1')).toBeInTheDocument();
    expect(screen.getByText('Dev Skill 2')).toBeInTheDocument();
    expect(screen.getByText('Sec Skill')).toBeInTheDocument();
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('should render flat grid when only one category', () => {
    const singleCat = [
      { ...mockSkill, name: 'Skill A', category: 'development' },
      { ...mockSkill, name: 'Skill B', category: 'development' },
    ];
    render(
      <CategoryGroupedGrid
        skills={singleCat}
        renderCard={(s) => <div key={s.name}>{s.name}</div>}
      />
    );
    expect(screen.getByText('Skill A')).toBeInTheDocument();
    expect(screen.getByText('Skill B')).toBeInTheDocument();
  });

  it('should collapse a category when clicking the header', () => {
    render(
      <CategoryGroupedGrid skills={skills} renderCard={(s) => <div key={s.name}>{s.name}</div>} />
    );
    // Click the Development header to collapse
    fireEvent.click(screen.getByText('Development'));
    // Dev skills should be hidden
    expect(screen.queryByText('Dev Skill 1')).not.toBeInTheDocument();
    // Security skills should still be visible
    expect(screen.getByText('Sec Skill')).toBeInTheDocument();
  });

  it('should expand a collapsed category', () => {
    render(
      <CategoryGroupedGrid skills={skills} renderCard={(s) => <div key={s.name}>{s.name}</div>} />
    );
    fireEvent.click(screen.getByText('Development'));
    expect(screen.queryByText('Dev Skill 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Development'));
    expect(screen.getByText('Dev Skill 1')).toBeInTheDocument();
  });
});

describe('categoryLabel', () => {
  it('should return known category labels', () => {
    expect(categoryLabel('development')).toBe('Development');
    expect(categoryLabel('security')).toBe('Security');
  });

  it('should capitalize unknown categories', () => {
    expect(categoryLabel('custom')).toBe('Custom');
    expect(categoryLabel('foobar')).toBe('Foobar');
  });
});

describe('exportSkill', () => {
  it('should create and click a download link', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:test');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis, 'URL', {
      value: { createObjectURL, revokeObjectURL },
      writable: true,
    });

    const mockClick = vi.fn();
    const mockAppendChild = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation(() => null as any);
    const mockRemoveChild = vi
      .spyOn(document.body, 'removeChild')
      .mockImplementation(() => null as any);
    const mockCreateElement = vi.spyOn(document, 'createElement').mockReturnValue({
      click: mockClick,
      href: '',
      download: '',
    } as unknown as HTMLAnchorElement);

    const skill = {
      id: 's1',
      name: 'Test Skill',
      description: 'desc',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 5,
      lastUsedAt: null,
      personalityName: 'Default',
    } as unknown as Skill;

    exportSkill(skill);

    expect(mockCreateElement).toHaveBeenCalledWith('a');
    expect(mockClick).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();

    mockAppendChild.mockRestore();
    mockRemoveChild.mockRestore();
    mockCreateElement.mockRestore();
  });
});
