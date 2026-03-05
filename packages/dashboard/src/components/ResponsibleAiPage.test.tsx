// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ResponsibleAiPage from './ResponsibleAiPage';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <ResponsibleAiPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('ResponsibleAiPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('renders the page title', () => {
    renderComponent();
    expect(screen.getByText('Responsible AI')).toBeInTheDocument();
  });

  it('renders the Cohort Error Analysis section', () => {
    renderComponent();
    expect(screen.getByText('Cohort Error Analysis')).toBeInTheDocument();
  });

  it('renders the Fairness Metrics section', () => {
    renderComponent();
    expect(screen.getByText('Fairness Metrics')).toBeInTheDocument();
  });

  it('renders the SHAP Explainability section', () => {
    renderComponent();
    expect(screen.getByText('SHAP Explainability')).toBeInTheDocument();
  });

  it('renders the Data Provenance section', () => {
    renderComponent();
    expect(screen.getByText('Data Provenance')).toBeInTheDocument();
  });

  it('renders the Model Cards section', () => {
    renderComponent();
    expect(screen.getByText('Model Cards')).toBeInTheDocument();
  });

  it('renders all five sections simultaneously', () => {
    renderComponent();
    const headings = [
      'Cohort Error Analysis',
      'Fairness Metrics',
      'SHAP Explainability',
      'Data Provenance',
      'Model Cards',
    ];
    for (const heading of headings) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
  });
});
