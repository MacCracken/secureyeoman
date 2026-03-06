// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersonalityWizard } from './PersonalityWizard';

vi.mock('../../api/client', () => ({
  createPersonality: vi.fn(),
}));

import * as api from '../../api/client';

function renderWizard(onComplete = vi.fn(), onCancel = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onComplete,
    onCancel,
    ...render(
      <QueryClientProvider client={qc}>
        <PersonalityWizard onComplete={onComplete} onCancel={onCancel} />
      </QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PersonalityWizard', () => {
  it('renders first step (Mission) with name input and progress', () => {
    renderWizard();
    expect(screen.getByText('Personality Creation Wizard')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/FRIDAY, SecurityBot/)).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('validates name is required before advancing past step 1', () => {
    renderWizard();
    const nextBtn = screen.getByRole('button', { name: /Next/ });
    expect(nextBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/FRIDAY, SecurityBot/), {
      target: { value: 'TestBot' },
    });
    expect(nextBtn).toBeEnabled();
  });

  it('navigates forward and backward through steps', () => {
    renderWizard();

    // Fill name to enable Next
    fireEvent.change(screen.getByPlaceholderText(/FRIDAY, SecurityBot/), {
      target: { value: 'TestBot' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    // Step 2: Topics
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/topics should this personality focus/)).toBeInTheDocument();

    // Go back to step 1
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
  });

  it('shows Skip button on optional steps but not on mission or review', () => {
    renderWizard();

    // Step 1 (mission): no Skip button
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();

    // Fill name, advance to step 2 (topics)
    fireEvent.change(screen.getByPlaceholderText(/FRIDAY, SecurityBot/), {
      target: { value: 'TestBot' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();

    // Skip to step 3 (tone)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText('Step 3 of 6')).toBeInTheDocument();
    expect(screen.getByText('Formality')).toBeInTheDocument();
  });

  it('navigates all the way to review step and shows summary', () => {
    renderWizard();

    // Step 1: fill name
    fireEvent.change(screen.getByPlaceholderText(/FRIDAY, SecurityBot/), {
      target: { value: 'MyBot' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    // Step 2–5: use Skip button (the standalone one) to advance quickly
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    }

    // Step 6: review
    expect(screen.getByText('Step 6 of 6')).toBeInTheDocument();
    expect(screen.getByText('Review your personality')).toBeInTheDocument();
    expect(screen.getByTestId('personality-wizard')).toHaveTextContent('MyBot');
    expect(screen.getByRole('button', { name: /Create Personality/ })).toBeInTheDocument();
  });

  it('calls createPersonality mutation on final step', async () => {
    vi.mocked(api.createPersonality).mockResolvedValue({
      id: '1',
      name: 'TestBot',
    } as any);

    const { onComplete } = renderWizard();

    // Step 1: fill name
    fireEvent.change(screen.getByPlaceholderText(/FRIDAY, SecurityBot/), {
      target: { value: 'TestBot' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    // Skip through to review
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    }

    // Click Create
    fireEvent.click(screen.getByRole('button', { name: /Create Personality/ }));

    await waitFor(() => {
      expect(api.createPersonality).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TestBot',
          traits: expect.objectContaining({ formality: 'balanced', humor: 'dry' }),
        })
      );
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('calls onCancel when Cancel button clicked on first step', () => {
    const onCancel = vi.fn();
    renderWizard(vi.fn(), onCancel);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
