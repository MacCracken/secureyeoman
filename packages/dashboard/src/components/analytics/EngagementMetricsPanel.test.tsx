// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EngagementMetricsPanel } from './EngagementMetricsPanel';

const mockData = {
  personalityId: null as string | null,
  periodDays: 30,
  avgConversationLength: 4.5,
  totalConversations: 120,
  followUpRate: 0.75,
  abandonmentRate: 0.12,
  toolCallSuccessRate: 0.92,
};

describe('EngagementMetricsPanel', () => {
  it('should render KPI cards with data', () => {
    render(<EngagementMetricsPanel data={mockData} isLoading={false} />);

    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
    expect(screen.getByText('12.0%')).toBeInTheDocument();
    expect(screen.getByText('92.0%')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(<EngagementMetricsPanel data={undefined} isLoading={true} />);
    expect(screen.getByTestId('engagement-metrics-panel')).toBeInTheDocument();
    // Should show 4 skeleton cards
    expect(screen.getByTestId('engagement-metrics-panel').children.length).toBe(4);
  });

  it('should show loading when data is undefined', () => {
    render(<EngagementMetricsPanel data={undefined} isLoading={false} />);
    expect(screen.getByTestId('engagement-metrics-panel')).toBeInTheDocument();
  });

  it('should display stat labels', () => {
    render(<EngagementMetricsPanel data={mockData} isLoading={false} />);
    expect(screen.getByText('Avg Conversation Length')).toBeInTheDocument();
    expect(screen.getByText('Follow-up Rate')).toBeInTheDocument();
    expect(screen.getByText('Abandonment Rate')).toBeInTheDocument();
    expect(screen.getByText('Tool Call Success')).toBeInTheDocument();
  });

  it('should show total conversations in subtitle', () => {
    render(<EngagementMetricsPanel data={mockData} isLoading={false} />);
    expect(screen.getByText('120 total conversations')).toBeInTheDocument();
  });

  it('should handle zero values', () => {
    const zeroData = {
      personalityId: null as string | null,
      periodDays: 30,
      avgConversationLength: 0,
      totalConversations: 0,
      followUpRate: 0,
      abandonmentRate: 0,
      toolCallSuccessRate: 0,
    };
    render(<EngagementMetricsPanel data={zeroData} isLoading={false} />);
    expect(screen.getByText('0.0')).toBeInTheDocument();
    expect(screen.getAllByText('0.0%').length).toBe(3);
  });
});
