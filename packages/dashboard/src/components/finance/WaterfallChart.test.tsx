// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WaterfallChart, type WaterfallItem } from './WaterfallChart';

vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: ({ children }: { children?: React.ReactNode }) => <div data-testid="bar">{children}</div>,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: ({ formatter }: { formatter?: (value: number, name: string) => unknown[] }) => {
    if (formatter) {
      formatter(1000, 'delta');
      formatter(500, 'invisible');
    }
    return <div data-testid="tooltip" />;
  },
  ReferenceLine: () => <div data-testid="reference-line" />,
  Cell: ({ fill }: { fill: string }) => <div data-testid="waterfall-cell" data-fill={fill} />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
}));

const sampleItems: WaterfallItem[] = [
  { label: 'Revenue', value: 100000 },
  { label: 'COGS', value: -40000 },
  { label: 'Operating Expenses', value: -25000 },
  { label: 'Other Income', value: 5000 },
  { label: 'Net Income', value: 40000, isTotal: true },
];

describe('WaterfallChart', () => {
  it('should render chart with data', () => {
    render(<WaterfallChart items={sampleItems} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('should show "No data" when items is empty', () => {
    render(<WaterfallChart items={[]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('should render with custom height', () => {
    render(<WaterfallChart items={sampleItems} height={500} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should render cells for each item', () => {
    render(<WaterfallChart items={sampleItems} />);
    const cells = screen.getAllByTestId('waterfall-cell');
    expect(cells.length).toBe(sampleItems.length);
  });

  it('should use correct colors for positive, negative, and total items', () => {
    render(<WaterfallChart items={sampleItems} />);
    const cells = screen.getAllByTestId('waterfall-cell');
    // Revenue (positive) = green
    expect(cells[0].getAttribute('data-fill')).toBe('#22c55e');
    // COGS (negative) = red
    expect(cells[1].getAttribute('data-fill')).toBe('#ef4444');
    // Net Income (total) = indigo
    expect(cells[4].getAttribute('data-fill')).toBe('#6366f1');
  });

  it('should handle all positive items', () => {
    const items: WaterfallItem[] = [
      { label: 'Q1', value: 1000 },
      { label: 'Q2', value: 2000 },
      { label: 'Total', value: 3000, isTotal: true },
    ];
    render(<WaterfallChart items={items} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should handle all negative items', () => {
    const items: WaterfallItem[] = [
      { label: 'Loss 1', value: -500 },
      { label: 'Loss 2', value: -300 },
      { label: 'Total Loss', value: -800, isTotal: true },
    ];
    render(<WaterfallChart items={items} />);
    const cells = screen.getAllByTestId('waterfall-cell');
    expect(cells.length).toBe(3);
  });

  it('should handle single item', () => {
    render(<WaterfallChart items={[{ label: 'Revenue', value: 50000 }]} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });
});
