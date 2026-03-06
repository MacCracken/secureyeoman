// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CitationDrawer } from './CitationDrawer';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, submitCitationFeedback: vi.fn() };
});

import * as api from '../../api/client';
const mockSubmitFeedback = vi.mocked(api.submitCitationFeedback);

const baseSrc = {
  index: 1,
  sourceId: 'src-1',
  sourceLabel: 'Wikipedia',
  type: 'web_search' as const,
  content: 'Some source content here',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmitFeedback.mockResolvedValue(undefined as any);
});

describe('CitationDrawer', () => {
  it('returns null when source is null', () => {
    const { container } = render(<CitationDrawer source={null} messageId="m1" onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders source label and index', () => {
    render(<CitationDrawer source={baseSrc as any} messageId="m1" onClose={vi.fn()} />);
    expect(screen.getByText('Source [1]')).toBeInTheDocument();
    expect(screen.getByText('Wikipedia')).toBeInTheDocument();
  });

  it('renders content', () => {
    render(<CitationDrawer source={baseSrc as any} messageId="m1" onClose={vi.fn()} />);
    expect(screen.getByText('Some source content here')).toBeInTheDocument();
  });

  it('renders type badge', () => {
    render(<CitationDrawer source={baseSrc as any} messageId="m1" onClose={vi.fn()} />);
    expect(screen.getByText('web search')).toBeInTheDocument();
  });

  it('renders document_chunk type', () => {
    render(
      <CitationDrawer
        source={{ ...baseSrc, type: 'document_chunk' } as any}
        messageId="m1"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('document chunk')).toBeInTheDocument();
  });

  it('renders memory type', () => {
    render(
      <CitationDrawer
        source={{ ...baseSrc, type: 'memory' } as any}
        messageId="m1"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('memory')).toBeInTheDocument();
  });

  it('shows document title when present', () => {
    render(
      <CitationDrawer
        source={{ ...baseSrc, documentTitle: 'My Doc' } as any}
        messageId="m1"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('My Doc')).toBeInTheDocument();
  });

  it('shows URL when present', () => {
    render(
      <CitationDrawer
        source={{ ...baseSrc, url: 'https://example.com' } as any}
        messageId="m1"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  it('shows confidence when present', () => {
    render(
      <CitationDrawer
        source={{ ...baseSrc, confidence: 0.95 } as any}
        messageId="m1"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('shows trust score when present', () => {
    render(
      <CitationDrawer
        source={{ ...baseSrc, trustScore: 0.8 } as any}
        messageId="m1"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<CitationDrawer source={baseSrc as any} messageId="m1" onClose={onClose} />);
    fireEvent.click(screen.getByText('\u00D7'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows feedback buttons', () => {
    render(<CitationDrawer source={baseSrc as any} messageId="m1" onClose={vi.fn()} />);
    expect(screen.getByText('Relevant')).toBeInTheDocument();
    expect(screen.getByText('Not Relevant')).toBeInTheDocument();
  });

  it('submits positive feedback and shows confirmation', async () => {
    render(<CitationDrawer source={baseSrc as any} messageId="m1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Relevant'));
    await waitFor(() => {
      expect(mockSubmitFeedback).toHaveBeenCalledWith('m1', {
        citationIndex: 1,
        sourceId: 'src-1',
        relevant: true,
      });
      expect(screen.getByText('Feedback recorded')).toBeInTheDocument();
    });
  });

  it('submits negative feedback', async () => {
    render(<CitationDrawer source={baseSrc as any} messageId="m1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Not Relevant'));
    await waitFor(() => {
      expect(mockSubmitFeedback).toHaveBeenCalledWith('m1', {
        citationIndex: 1,
        sourceId: 'src-1',
        relevant: false,
      });
    });
  });
});
