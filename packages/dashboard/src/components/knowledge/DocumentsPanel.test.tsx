// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentsPanel } from './DocumentsPanel';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    uploadDocument: vi.fn(),
    listDocuments: vi.fn(),
    deleteDocument: vi.fn(),
    fetchPersonalities: vi.fn(),
  };
});

import * as api from '../../api/client';

const mockListDocuments = vi.mocked(api.listDocuments);
const mockDeleteDocument = vi.mocked(api.deleteDocument);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockUploadDocument = vi.mocked(api.uploadDocument);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderPanel() {
  return render(
    <QueryClientProvider client={createQC()}>
      <DocumentsPanel />
    </QueryClientProvider>
  );
}

const DOC_READY = {
  id: 'doc-1',
  personalityId: null,
  title: 'Test Document',
  format: 'pdf' as const,
  visibility: 'private' as const,
  status: 'ready' as const,
  chunkCount: 12,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const DOC_ERROR = {
  id: 'doc-2',
  personalityId: null,
  title: 'Bad Document',
  format: 'txt' as const,
  visibility: 'shared' as const,
  status: 'error' as const,
  chunkCount: 0,
  errorMessage: 'Parse failed',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const DOC_PROCESSING = {
  id: 'doc-3',
  personalityId: null,
  title: 'Processing Doc',
  format: 'md' as const,
  visibility: 'private' as const,
  status: 'processing' as const,
  chunkCount: 0,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const DOC_PENDING = {
  id: 'doc-4',
  personalityId: null,
  title: 'Pending Doc',
  format: 'html' as const,
  visibility: 'private' as const,
  status: 'pending' as const,
  chunkCount: 0,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchPersonalities.mockResolvedValue({
    personalities: [{ id: 'p1', name: 'FRIDAY' } as any],
  });
  mockListDocuments.mockResolvedValue({ documents: [DOC_READY], total: 1 });
});

describe('DocumentsPanel', () => {
  it('renders documents header', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Documents')).toBeInTheDocument();
    });
  });

  it('shows document titles from the list', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Test Document')).toBeInTheDocument();
    });
  });

  it('shows chunk count for ready documents', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('12 chunks')).toBeInTheDocument();
    });
  });

  it('shows format badge', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('pdf')).toBeInTheDocument();
    });
  });

  it('shows status badge for ready documents', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument();
    });
  });

  it('shows error document with error message', async () => {
    mockListDocuments.mockResolvedValue({ documents: [DOC_ERROR], total: 1 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Parse failed')).toBeInTheDocument();
      expect(screen.getByText('error')).toBeInTheDocument();
    });
  });

  it('shows shared badge for shared documents', async () => {
    mockListDocuments.mockResolvedValue({ documents: [DOC_ERROR], total: 1 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('shared')).toBeInTheDocument();
    });
  });

  it('shows processing status', async () => {
    mockListDocuments.mockResolvedValue({ documents: [DOC_PROCESSING], total: 1 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('processing')).toBeInTheDocument();
    });
  });

  it('shows pending status', async () => {
    mockListDocuments.mockResolvedValue({ documents: [DOC_PENDING], total: 1 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('pending')).toBeInTheDocument();
    });
  });

  it('shows empty state when no documents', async () => {
    mockListDocuments.mockResolvedValue({ documents: [], total: 0 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('No documents ingested yet.')).toBeInTheDocument();
    });
  });

  it('renders personality filter select', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Personality:')).toBeInTheDocument();
    });
  });

  it('renders upload section', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Upload Document')).toBeInTheDocument();
      expect(screen.getByText('Drop file or click to upload')).toBeInTheDocument();
    });
  });

  it('renders the visibility select', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Visibility')).toBeInTheDocument();
    });
  });

  it('renders the title input', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Auto-detected from filename')).toBeInTheDocument();
    });
  });

  it('shows delete button for each document', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTitle('Delete document')).toBeInTheDocument();
    });
  });

  it('calls deleteDocument when delete button clicked', async () => {
    const user = userEvent.setup();
    mockDeleteDocument.mockResolvedValue(undefined);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTitle('Delete document')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Delete document'));
    await waitFor(() => {
      // TanStack Query v5 mutationFn receives (vars, context) — deleteDocument is called with doc id
      expect(mockDeleteDocument).toHaveBeenCalled();
      expect(mockDeleteDocument.mock.calls[0][0]).toBe('doc-1');
    });
  });

  it('shows singular "chunk" for single chunk count', async () => {
    mockListDocuments.mockResolvedValue({
      documents: [{ ...DOC_READY, chunkCount: 1 }],
      total: 1,
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('1 chunk')).toBeInTheDocument();
    });
  });

  it('populates personality options in filter', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getAllByText('FRIDAY').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders accepted file types info', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('PDF, HTML, MD, TXT (max 20 MB)')).toBeInTheDocument();
    });
  });

  it('shows multiple documents', async () => {
    mockListDocuments.mockResolvedValue({
      documents: [DOC_READY, DOC_ERROR, DOC_PROCESSING, DOC_PENDING],
      total: 4,
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Test Document')).toBeInTheDocument();
      expect(screen.getByText('Bad Document')).toBeInTheDocument();
      expect(screen.getByText('Processing Doc')).toBeInTheDocument();
      expect(screen.getByText('Pending Doc')).toBeInTheDocument();
    });
  });

  it('shows all format badges', async () => {
    mockListDocuments.mockResolvedValue({
      documents: [DOC_READY, DOC_ERROR, DOC_PROCESSING, DOC_PENDING],
      total: 4,
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('pdf')).toBeInTheDocument();
      expect(screen.getByText('txt')).toBeInTheDocument();
      expect(screen.getByText('md')).toBeInTheDocument();
      expect(screen.getByText('html')).toBeInTheDocument();
    });
  });

  it('filters documents by personality', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getAllByText('FRIDAY').length).toBeGreaterThanOrEqual(1);
    });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'p1' } });
    await waitFor(() => {
      expect(mockListDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ personalityId: 'p1' })
      );
    });
  });

  it('shows upload personality selector', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Global (All Personalities)')).toBeInTheDocument();
    });
  });

  it('shows upload visibility options', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Visibility')).toBeInTheDocument();
      expect(screen.getByText('Private')).toBeInTheDocument();
    });
  });

  it('shows url format badge', async () => {
    mockListDocuments.mockResolvedValue({
      documents: [
        {
          ...DOC_READY,
          id: 'doc-url',
          title: 'Web Page',
          format: 'url' as const,
        },
      ],
      total: 1,
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('url')).toBeInTheDocument();
    });
  });
});
