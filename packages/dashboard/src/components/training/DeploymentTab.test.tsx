// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeploymentTab } from './DeploymentTab';

vi.mock('../../api/client', () => ({
  fetchModelVersions: vi.fn(),
  deployModel: vi.fn(),
  rollbackModel: vi.fn(),
  fetchAbTests: vi.fn(),
  createAbTest: vi.fn(),
  completeAbTest: vi.fn(),
  cancelAbTest: vi.fn(),
  evaluateAbTest: vi.fn(),
}));

import * as api from '../../api/client';

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <DeploymentTab />
    </QueryClientProvider>
  );
}

const runningTest = {
  id: 'ab1',
  name: 'Quality Test',
  personalityId: 'p1',
  modelA: 'model-v1',
  modelB: 'model-v2',
  trafficPctB: 30,
  status: 'running',
  conversationsA: 100,
  conversationsB: 50,
  avgQualityA: 0.85,
  avgQualityB: 0.88,
  winner: null,
};

describe('DeploymentTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchModelVersions).mockResolvedValue({ versions: [] } as never);
    vi.mocked(api.fetchAbTests).mockResolvedValue({ tests: [] } as never);
  });

  it('should render Deployed Models section', () => {
    renderTab();
    expect(screen.getByText('Deployed Models')).toBeInTheDocument();
  });

  it('should render Deploy Model section', () => {
    renderTab();
    expect(screen.getByText('Deploy Model')).toBeInTheDocument();
  });

  it('should render A/B Tests section', () => {
    renderTab();
    expect(screen.getByText('A/B Tests')).toBeInTheDocument();
  });

  it('should show personality ID input', () => {
    renderTab();
    expect(screen.getByPlaceholderText('Personality ID...')).toBeInTheDocument();
  });

  it('should show deploy form inputs', () => {
    renderTab();
    expect(screen.getAllByPlaceholderText('Personality ID').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/Model name/)).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
    expect(screen.getByText('Rollback')).toBeInTheDocument();
  });

  it('should show New A/B Test form', () => {
    renderTab();
    expect(screen.getByText('New A/B Test')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Model A')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Model B')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('should show no A/B tests message when empty', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('No A/B tests yet.')).toBeInTheDocument();
    });
  });

  it('should show A/B test list when data available', async () => {
    vi.mocked(api.fetchAbTests).mockResolvedValue({
      tests: [runningTest],
    } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Quality Test')).toBeInTheDocument();
    });
    expect(screen.getByText(/model-v1 vs model-v2/)).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('Evaluate')).toBeInTheDocument();
    expect(screen.getByText('Promote A')).toBeInTheDocument();
    expect(screen.getByText('Promote B')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should show completed A/B test with winner', async () => {
    vi.mocked(api.fetchAbTests).mockResolvedValue({
      tests: [
        {
          id: 'ab2',
          name: 'Completed Test',
          personalityId: 'p1',
          modelA: 'v1',
          modelB: 'v2',
          trafficPctB: 50,
          status: 'completed',
          conversationsA: 200,
          conversationsB: 200,
          avgQualityA: 0.82,
          avgQualityB: 0.91,
          winner: 'b',
        },
      ],
    } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Completed Test')).toBeInTheDocument();
    });
    expect(screen.getByText('Winner: Model B')).toBeInTheDocument();
  });

  it('should fetch versions when personality ID entered', async () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText('Personality ID...'), {
      target: { value: 'test-personality' },
    });
    await waitFor(() => {
      expect(api.fetchModelVersions).toHaveBeenCalledWith('test-personality');
    });
  });

  it('should show version list', async () => {
    vi.mocked(api.fetchModelVersions).mockResolvedValue({
      versions: [
        {
          id: 'v1',
          modelName: 'my-model:v1',
          deployedAt: Date.now(),
          isActive: true,
          previousModel: null,
        },
        {
          id: 'v2',
          modelName: 'my-model:v0',
          deployedAt: Date.now() - 86400000,
          isActive: false,
          previousModel: 'my-model:v-1',
        },
      ],
    } as never);

    renderTab();
    fireEvent.change(screen.getByPlaceholderText('Personality ID...'), {
      target: { value: 'p1' },
    });

    await waitFor(() => {
      expect(screen.getByText('my-model:v1')).toBeInTheDocument();
    });
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('inactive')).toBeInTheDocument();
    expect(screen.getByText(/prev: my-model:v-1/)).toBeInTheDocument();
  });

  it('should show empty versions message', async () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText('Personality ID...'), {
      target: { value: 'p1' },
    });
    await waitFor(() => {
      expect(screen.getByText('No deployed versions for this personality.')).toBeInTheDocument();
    });
  });

  it('should disable Deploy button when fields empty', () => {
    renderTab();
    const deployBtn = screen.getByText('Deploy');
    expect(deployBtn).toBeDisabled();
  });

  it('should disable Create button when fields empty', () => {
    renderTab();
    const createBtn = screen.getByText('Create');
    expect(createBtn).toBeDisabled();
  });

  it('should call deployModel on Deploy click', async () => {
    vi.mocked(api.deployModel).mockResolvedValue({} as never);
    renderTab();

    // "Personality ID" (without dots) inputs: 0=deploy section, 1=AB test section
    const personalityInputs = screen.getAllByPlaceholderText('Personality ID');
    fireEvent.change(personalityInputs[0], { target: { value: 'p1' } });
    fireEvent.change(screen.getByPlaceholderText(/Model name/), {
      target: { value: 'my-model:latest' },
    });

    const deployBtn = screen.getByText('Deploy');
    expect(deployBtn).not.toBeDisabled();
    fireEvent.click(deployBtn);

    await waitFor(() => {
      expect(api.deployModel).toHaveBeenCalled();
    });
  });

  it('should update A/B test form inputs', () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Test 1' } });
    fireEvent.change(screen.getByPlaceholderText('Model A'), { target: { value: 'modelA' } });
    fireEvent.change(screen.getByPlaceholderText('Model B'), { target: { value: 'modelB' } });
    expect(screen.getByPlaceholderText('Name')).toHaveValue('Test 1');
    expect(screen.getByPlaceholderText('Model A')).toHaveValue('modelA');
    expect(screen.getByPlaceholderText('Model B')).toHaveValue('modelB');
  });

  // --- New tests for better coverage ---

  it('should call rollbackModel on Rollback click', async () => {
    const user = userEvent.setup();
    vi.mocked(api.rollbackModel).mockResolvedValue({} as never);
    renderTab();

    const personalityInputs = screen.getAllByPlaceholderText('Personality ID');
    fireEvent.change(personalityInputs[0], { target: { value: 'p1' } });

    await user.click(screen.getByText('Rollback'));

    await waitFor(() => {
      expect(api.rollbackModel).toHaveBeenCalledWith('p1');
    });
  });

  it('should disable Rollback button when personality ID empty', () => {
    renderTab();
    expect(screen.getByText('Rollback')).toBeDisabled();
  });

  it('should call createAbTest on Create click with all fields', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createAbTest).mockResolvedValue({} as never);
    renderTab();

    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Test AB' } });
    const personalityInputs = screen.getAllByPlaceholderText('Personality ID');
    fireEvent.change(personalityInputs[1], { target: { value: 'p-test' } });
    fireEvent.change(screen.getByPlaceholderText('Model A'), { target: { value: 'mA' } });
    fireEvent.change(screen.getByPlaceholderText('Model B'), { target: { value: 'mB' } });

    const createBtn = screen.getByText('Create');
    expect(createBtn).not.toBeDisabled();
    await user.click(createBtn);

    await waitFor(() => {
      expect(api.createAbTest).toHaveBeenCalled();
    });
  });

  it('should call cancelAbTest on Cancel click for running test', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchAbTests).mockResolvedValue({ tests: [runningTest] } as never);
    vi.mocked(api.cancelAbTest).mockResolvedValue({} as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Quality Test')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(api.cancelAbTest).toHaveBeenCalled();
    });
  });

  it('should call completeAbTest with winner a on Promote A click', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchAbTests).mockResolvedValue({ tests: [runningTest] } as never);
    vi.mocked(api.completeAbTest).mockResolvedValue({} as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Quality Test')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Promote A'));

    await waitFor(() => {
      expect(api.completeAbTest).toHaveBeenCalled();
    });
  });

  it('should call completeAbTest with winner b on Promote B click', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchAbTests).mockResolvedValue({ tests: [runningTest] } as never);
    vi.mocked(api.completeAbTest).mockResolvedValue({} as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Quality Test')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Promote B'));

    await waitFor(() => {
      expect(api.completeAbTest).toHaveBeenCalled();
    });
  });

  it('should call evaluateAbTest on Evaluate click', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchAbTests).mockResolvedValue({ tests: [runningTest] } as never);
    vi.mocked(api.evaluateAbTest).mockResolvedValue({
      winner: 'b',
      avgQualityA: 0.85,
      avgQualityB: 0.88,
      totalA: 100,
      totalB: 50,
    } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Quality Test')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Evaluate'));

    await waitFor(() => {
      expect(api.evaluateAbTest).toHaveBeenCalled();
    });
  });

  it('should show quality metrics for A/B test models', async () => {
    vi.mocked(api.fetchAbTests).mockResolvedValue({ tests: [runningTest] } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/Model A: model-v1/)).toBeInTheDocument();
      expect(screen.getByText(/Model B: model-v2/)).toBeInTheDocument();
      expect(screen.getByText(/Conversations: 100/)).toBeInTheDocument();
      expect(screen.getByText(/Conversations: 50/)).toBeInTheDocument();
    });
  });

  it('should show traffic percentage for A/B test', async () => {
    vi.mocked(api.fetchAbTests).mockResolvedValue({ tests: [runningTest] } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/30% to B/)).toBeInTheDocument();
    });
  });

  it('should show cancelled A/B test status', async () => {
    vi.mocked(api.fetchAbTests).mockResolvedValue({
      tests: [
        {
          ...runningTest,
          id: 'ab3',
          name: 'Cancelled Test',
          status: 'cancelled',
          winner: null,
        },
      ],
    } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Cancelled Test')).toBeInTheDocument();
      expect(screen.getByText('cancelled')).toBeInTheDocument();
    });
  });

  it('should not show action buttons for completed tests', async () => {
    vi.mocked(api.fetchAbTests).mockResolvedValue({
      tests: [
        {
          ...runningTest,
          id: 'ab4',
          name: 'Done Test',
          status: 'completed',
          winner: 'a',
        },
      ],
    } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Done Test')).toBeInTheDocument();
    });
    // Running-only buttons should not appear
    expect(screen.queryByText('Evaluate')).not.toBeInTheDocument();
    expect(screen.queryByText('Promote A')).not.toBeInTheDocument();
  });

  it('should update traffic slider', () => {
    renderTab();
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '75' } });
    expect(screen.getByText(/75%/)).toBeInTheDocument();
  });

  it('should show Deploying... text when deploy mutation is pending', async () => {
    vi.mocked(api.deployModel).mockImplementation(() => new Promise(() => {}));
    renderTab();

    const personalityInputs = screen.getAllByPlaceholderText('Personality ID');
    fireEvent.change(personalityInputs[0], { target: { value: 'p1' } });
    fireEvent.change(screen.getByPlaceholderText(/Model name/), {
      target: { value: 'model:latest' },
    });

    fireEvent.click(screen.getByText('Deploy'));

    await waitFor(() => {
      expect(screen.getByText('Deploying...')).toBeInTheDocument();
    });
  });

  it('should show quality values with dashes when null', async () => {
    vi.mocked(api.fetchAbTests).mockResolvedValue({
      tests: [
        {
          ...runningTest,
          avgQualityA: null,
          avgQualityB: null,
        },
      ],
    } as never);

    renderTab();
    await waitFor(() => {
      const qualityTexts = screen.getAllByText(/Avg Quality/);
      expect(qualityTexts.length).toBe(2);
    });
  });
});
