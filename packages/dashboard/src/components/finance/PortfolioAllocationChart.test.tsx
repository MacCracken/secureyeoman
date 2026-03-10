// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PortfolioAllocationChart, type AllocationSlice } from './PortfolioAllocationChart';

vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({
    children,
    label,
  }: {
    children: React.ReactNode;
    label: (p: { name: string; percent: number }) => string;
  }) => {
    // Exercise the label formatter
    if (label) label({ name: 'Test', percent: 0.5 });
    return <div data-testid="pie">{children}</div>;
  },
  Cell: () => <div data-testid="cell" />,
  Tooltip: ({ formatter }: { formatter?: (value: number) => unknown[] }) => {
    // Exercise the formatter
    if (formatter) formatter(1000);
    return <div data-testid="tooltip" />;
  },
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
}));

const sampleAllocations: AllocationSlice[] = [
  { name: 'US Equity', value: 45000 },
  { name: "Int'l Equity", value: 20000 },
  { name: 'Bonds', value: 25000 },
  { name: 'Real Estate', value: 7000 },
  { name: 'Cash', value: 3000 },
];

describe('PortfolioAllocationChart', () => {
  it('should render chart with data', () => {
    render(<PortfolioAllocationChart allocations={sampleAllocations} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('should show "No data" when allocations is empty', () => {
    render(<PortfolioAllocationChart allocations={[]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('should render with custom height', () => {
    render(<PortfolioAllocationChart allocations={sampleAllocations} height={500} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should render as non-donut when donut=false', () => {
    render(<PortfolioAllocationChart allocations={sampleAllocations} donut={false} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should render with custom colors', () => {
    const allocations: AllocationSlice[] = [
      { name: 'Stocks', value: 60000, color: '#ff0000' },
      { name: 'Bonds', value: 40000, color: '#0000ff' },
    ];
    render(<PortfolioAllocationChart allocations={allocations} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should render cells for each allocation', () => {
    render(<PortfolioAllocationChart allocations={sampleAllocations} />);
    const cells = screen.getAllByTestId('cell');
    expect(cells.length).toBe(sampleAllocations.length);
  });

  it('should render with single allocation', () => {
    render(<PortfolioAllocationChart allocations={[{ name: 'Cash', value: 100000 }]} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });
});
