// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KnowledgeBaseTab } from './KnowledgeBaseTab';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../api/client', () => ({
  fetchPersonalities: vi.fn().mockResolvedValue({ personalities: [{ id: 'p1', name: 'Alice' }] }),
  listDocuments: vi.fn().mockResolvedValue({
    documents: [
      {
        id: 'doc-1',
        title: 'Test Document',
        format: 'txt',
        status: 'ready',
        visibility: 'private',
        chunkCount: 3,
        personalityId: null,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
    total: 1,
  }),
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  uploadDocument: vi.fn().mockResolvedValue({ document: { id: 'doc-2', title: 'Uploaded', status: 'processing', format: 'md', chunkCount: 0, visibility: 'private' } }),
  ingestUrl: vi.fn().mockResolvedValue({ document: { id: 'doc-3', title: 'https://example.com', status: 'ready', format: 'url', chunkCount: 2, visibility: 'private' } }),
  ingestText: vi.fn().mockResolvedValue({ document: { id: 'doc-4', title: 'Paste Title', status: 'ready', format: 'txt', chunkCount: 1, visibility: 'private' } }),
  ingestGithubWiki: vi.fn().mockResolvedValue({ documents: [{ id: 'doc-5', title: 'wiki', status: 'ready', format: 'md', chunkCount: 1, visibility: 'shared' }] }),
  fetchKnowledgeHealth: vi.fn().mockResolvedValue({
    totalDocuments: 5,
    totalChunks: 20,
    byFormat: { txt: 3, md: 2 },
    recentQueryCount: 10,
    avgTopScore: 0.75,
    lowCoverageQueries: 2,
  }),
  getAccessToken: vi.fn().mockReturnValue(null),
}));

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <KnowledgeBaseTab />
    </QueryClientProvider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('KnowledgeBaseTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the 3 sub-tabs', () => {
    renderTab();
    expect(screen.getByRole('button', { name: /documents/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /connectors/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /health/i })).toBeDefined();
  });

  it('shows DocumentsPanel by default', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Test Document')).toBeDefined();
    });
  });

  it('DocumentsPanel shows document with ready status badge', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Test Document')).toBeDefined();
    });
    expect(screen.getByText('ready')).toBeDefined();
  });

  it('DocumentsPanel shows chunk count', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/3 chunks?/)).toBeDefined();
    });
  });

  it('switches to ConnectorsPanel on click', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: /connectors/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/https:\/\/example\.com\/docs/)).toBeDefined();
    });
  });

  it('ConnectorsPanel: ingest URL on button click', async () => {
    const { ingestUrl } = await import('../../api/client');
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: /connectors/i }));

    await waitFor(() => screen.getByPlaceholderText(/https:\/\/example\.com\/docs/));

    await user.type(screen.getByPlaceholderText(/https:\/\/example\.com\/docs/), 'https://mysite.com');
    await user.click(screen.getByRole('button', { name: /ingest url/i }));

    await waitFor(() => {
      expect(ingestUrl).toHaveBeenCalled();
    });
  });

  it('ConnectorsPanel: ingest text on button click', async () => {
    const { ingestText } = await import('../../api/client');
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: /connectors/i }));

    await waitFor(() => screen.getByPlaceholderText(/Title \*/));

    await user.type(screen.getByPlaceholderText(/Title \*/), 'My Title');
    await user.type(screen.getByPlaceholderText(/Paste or type content/), 'Some content here');
    await user.click(screen.getByRole('button', { name: /add to knowledge base/i }));

    await waitFor(() => {
      expect(ingestText).toHaveBeenCalledWith('Some content here', 'My Title', expect.any(Object));
    });
  });

  it('switches to Health sub-tab and shows KPIs', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: /health/i }));
    await waitFor(() => {
      expect(screen.getByText('Total Documents')).toBeDefined();
      expect(screen.getByText('5')).toBeDefined();
      expect(screen.getByText('Total Chunks')).toBeDefined();
    });
  });

  it('KnowledgeHealthPanel shows low coverage warning', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: /health/i }));
    await waitFor(() => {
      expect(screen.getByText(/returned 0 results in the last 24h/i)).toBeDefined();
    });
  });

  it('DocumentsPanel delete button calls deleteDocument', async () => {
    const { deleteDocument } = await import('../../api/client');
    const user = userEvent.setup();
    renderTab();
    // Wait for the document list to render
    await waitFor(() => screen.getByText('Test Document'));

    // The delete button uses title="Delete document"
    const deleteBtn = await waitFor(() => screen.getByTitle('Delete document'));
    await user.click(deleteBtn);

    // After mutation fires, deleteDocument should be called (TQ v5 passes context as 2nd arg)
    expect(deleteDocument).toHaveBeenCalledWith('doc-1', expect.any(Object));
  });

  it('DocumentsPanel shows empty state when no documents', async () => {
    const { listDocuments } = await import('../../api/client');
    vi.mocked(listDocuments).mockResolvedValueOnce({ documents: [], total: 0 });
    renderTab();

    await waitFor(() => {
      expect(screen.getByText(/No documents ingested yet/)).toBeDefined();
    });
  });

  it('ConnectorsPanel: Sync Wiki button triggers ingestGithubWiki', async () => {
    const { ingestGithubWiki } = await import('../../api/client');
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: /connectors/i }));

    await waitFor(() => screen.getByPlaceholderText('owner'));

    await user.type(screen.getByPlaceholderText('owner'), 'myorg');
    await user.type(screen.getByPlaceholderText('repository'), 'myrepo');
    await user.click(screen.getByRole('button', { name: /sync wiki/i }));

    await waitFor(() => {
      expect(ingestGithubWiki).toHaveBeenCalledWith('myorg', 'myrepo', undefined);
    });
  });
});
