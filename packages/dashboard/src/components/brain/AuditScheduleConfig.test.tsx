// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuditScheduleConfig from './AuditScheduleConfig';

vi.mock('../../api/client', () => ({
  fetchAuditSchedules: vi.fn(),
  updateAuditSchedule: vi.fn(),
}));

import * as api from '../../api/client';

const mockFetchAuditSchedules = vi.mocked(api.fetchAuditSchedules);
const mockUpdateAuditSchedule = vi.mocked(api.updateAuditSchedule);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <AuditScheduleConfig />
    </QueryClientProvider>
  );
}

const MOCK_SCHEDULES = {
  schedules: {
    daily: '30 3 * * *',
    weekly: '0 4 * * 0',
    monthly: '0 5 1 * *',
  },
};

describe('AuditScheduleConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchAuditSchedules.mockResolvedValue(MOCK_SCHEDULES);
    mockUpdateAuditSchedule.mockResolvedValue(MOCK_SCHEDULES);
  });

  it('renders the Audit Schedules heading', async () => {
    renderComponent();
    expect(await screen.findByText('Audit Schedules')).toBeInTheDocument();
  });

  it('renders three schedule sections (daily, weekly, monthly)', async () => {
    renderComponent();
    expect(await screen.findByText('daily')).toBeInTheDocument();
    expect(screen.getByText('weekly')).toBeInTheDocument();
    expect(screen.getByText('monthly')).toBeInTheDocument();
  });

  it('renders daily preset buttons', async () => {
    renderComponent();
    expect(await screen.findByText('Every night at 3:30 AM')).toBeInTheDocument();
    expect(screen.getByText('Every morning at 6 AM')).toBeInTheDocument();
    expect(screen.getByText('Every 12 hours')).toBeInTheDocument();
  });

  it('renders weekly preset buttons', async () => {
    renderComponent();
    expect(await screen.findByText('Sunday 4 AM')).toBeInTheDocument();
    expect(screen.getByText('Saturday midnight')).toBeInTheDocument();
    expect(screen.getByText('Wednesday 3 AM')).toBeInTheDocument();
  });

  it('renders monthly preset buttons', async () => {
    renderComponent();
    expect(await screen.findByText('1st of month 5 AM')).toBeInTheDocument();
    expect(screen.getByText('15th of month 4 AM')).toBeInTheDocument();
    expect(screen.getByText('Last day midnight')).toBeInTheDocument();
  });

  it('clicking a daily preset updates the daily input value', async () => {
    const user = userEvent.setup();
    renderComponent();
    const morningBtn = await screen.findByText('Every morning at 6 AM');
    await user.click(morningBtn);
    const inputs = screen.getAllByPlaceholderText('Cron expression');
    // First input corresponds to daily section
    expect(inputs[0]).toHaveValue('0 6 * * *');
  });

  it('clicking a weekly preset updates the weekly input value', async () => {
    const user = userEvent.setup();
    renderComponent();
    const satBtn = await screen.findByText('Saturday midnight');
    await user.click(satBtn);
    const inputs = screen.getAllByPlaceholderText('Cron expression');
    // Second input corresponds to weekly section
    expect(inputs[1]).toHaveValue('0 0 * * 6');
  });

  it('clicking a monthly preset updates the monthly input value', async () => {
    const user = userEvent.setup();
    renderComponent();
    const fifteenthBtn = await screen.findByText('15th of month 4 AM');
    await user.click(fifteenthBtn);
    const inputs = screen.getAllByPlaceholderText('Cron expression');
    // Third input corresponds to monthly section
    expect(inputs[2]).toHaveValue('0 4 15 * *');
  });

  it('custom cron input works for daily section', async () => {
    const user = userEvent.setup();
    renderComponent();
    const inputs = await screen.findAllByPlaceholderText('Cron expression');
    // Triple-click to select all text, then type replacement
    await user.tripleClick(inputs[0]);
    await user.keyboard('0 2 * * *');
    expect(inputs[0]).toHaveValue('0 2 * * *');
  });

  it('renders three Save buttons', async () => {
    renderComponent();
    await screen.findByText('Audit Schedules');
    const saveButtons = screen.getAllByText('Save');
    expect(saveButtons).toHaveLength(3);
  });

  it('clicking daily Save calls updateAuditSchedule with daily scope and schedule', async () => {
    const user = userEvent.setup();
    renderComponent();
    const saveButtons = await screen.findAllByText('Save');
    // First Save button is for the daily section
    await user.click(saveButtons[0]);
    await waitFor(() => {
      expect(mockUpdateAuditSchedule).toHaveBeenCalledWith('daily', '30 3 * * *');
    });
  });

  it('clicking weekly Save calls updateAuditSchedule with weekly scope', async () => {
    const user = userEvent.setup();
    renderComponent();
    const saveButtons = await screen.findAllByText('Save');
    await user.click(saveButtons[1]);
    await waitFor(() => {
      expect(mockUpdateAuditSchedule).toHaveBeenCalledWith('weekly', '0 4 * * 0');
    });
  });

  it('clicking monthly Save calls updateAuditSchedule with monthly scope', async () => {
    const user = userEvent.setup();
    renderComponent();
    const saveButtons = await screen.findAllByText('Save');
    await user.click(saveButtons[2]);
    await waitFor(() => {
      expect(mockUpdateAuditSchedule).toHaveBeenCalledWith('monthly', '0 5 1 * *');
    });
  });

  it('loads initial values from fetchAuditSchedules', async () => {
    mockFetchAuditSchedules.mockResolvedValue({
      schedules: {
        daily: '0 6 * * *',
        weekly: '0 0 * * 6',
        monthly: '0 4 15 * *',
      },
    });
    renderComponent();
    const inputs = await screen.findAllByPlaceholderText('Cron expression');
    await waitFor(() => {
      expect(inputs[0]).toHaveValue('0 6 * * *');
      expect(inputs[1]).toHaveValue('0 0 * * 6');
      expect(inputs[2]).toHaveValue('0 4 15 * *');
    });
  });

  it('highlights the active preset button with primary styling', async () => {
    renderComponent();
    // The default daily schedule is '30 3 * * *' which matches "Every night at 3:30 AM"
    const activeBtn = await screen.findByText('Every night at 3:30 AM');
    expect(activeBtn.className).toContain('border-primary');
    expect(activeBtn.className).toContain('bg-primary/10');
  });
});
