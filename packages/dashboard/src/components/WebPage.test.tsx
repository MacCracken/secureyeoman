// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { WebPage } from './WebPage';

// Mock child components to avoid deep rendering
vi.mock('./BrowserAutomationPage', () => ({
  BrowserAutomationPage: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="browser-automation">BrowserAutomation{embedded ? ' embedded' : ''}</div>
  ),
}));

vi.mock('./WebScraperConfigPage', () => ({
  WebScraperConfigPage: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="scraper-config">ScraperConfig{embedded ? ' embedded' : ''}</div>
  ),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('WebPage', () => {
  it('should render with title', () => {
    renderWithProviders(<WebPage />);
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText(/Browser automation sessions/)).toBeInTheDocument();
  });

  it('should render embedded without title', () => {
    renderWithProviders(<WebPage embedded />);
    expect(screen.queryByText('Web')).not.toBeInTheDocument();
  });

  it('should show Browser Automation tab by default', () => {
    renderWithProviders(<WebPage />);
    expect(screen.getByTestId('browser-automation')).toBeInTheDocument();
  });

  it('should switch to Scraper Config tab', () => {
    renderWithProviders(<WebPage />);
    fireEvent.click(screen.getByText('Scraper Config'));
    expect(screen.getByTestId('scraper-config')).toBeInTheDocument();
  });

  it('should render both tab buttons', () => {
    renderWithProviders(<WebPage />);
    expect(screen.getByText('Browser Automation')).toBeInTheDocument();
    expect(screen.getByText('Scraper Config')).toBeInTheDocument();
  });
});
