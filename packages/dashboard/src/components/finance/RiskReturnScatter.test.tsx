// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskReturnScatter, type RiskReturnPoint } from './RiskReturnScatter';

vi.mock('recharts', () => ({
  ScatterChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scatter-chart">{children}</div>
  ),
  Scatter: () => <div data-testid="scatter" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  ZAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: ({
    formatter,
    labelFormatter,
  }: {
    formatter?: (value: number, name: string) => unknown[];
    labelFormatter?: (label: unknown, payload: unknown[]) => string;
  }) => {
    // Exercise formatter and labelFormatter
    if (formatter) {
      formatter(5.5, 'x');
      formatter(10.2, 'y');
      formatter(50, 'z');
    }
    if (labelFormatter) {
      labelFormatter('', [{ payload: { name: 'AAPL' } }]);
      labelFormatter('', []);
    }
    return <div data-testid="tooltip" />;
  },
  ReferenceLine: () => <div data-testid="reference-line" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
}));

const sampleAssets: RiskReturnPoint[] = [
  { name: 'AAPL', risk: 15.2, return: 22.5, weight: 100 },
  { name: 'MSFT', risk: 12.8, return: 18.3, weight: 80 },
  { name: 'GOOGL', risk: 18.5, return: 25.1 },
  { name: 'TSLA', risk: 35.0, return: 45.2, weight: 60 },
];

describe('RiskReturnScatter', () => {
  it('should render chart with data', () => {
    render(<RiskReturnScatter assets={sampleAssets} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
    expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
  });

  it('should show "No data" when assets is empty', () => {
    render(<RiskReturnScatter assets={[]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('should render with custom height', () => {
    render(<RiskReturnScatter assets={sampleAssets} height={500} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should render risk-free rate reference line', () => {
    render(<RiskReturnScatter assets={sampleAssets} riskFreeRate={4.5} />);
    expect(screen.getByTestId('reference-line')).toBeInTheDocument();
  });

  it('should not render reference line without risk-free rate', () => {
    render(<RiskReturnScatter assets={sampleAssets} />);
    expect(screen.queryByTestId('reference-line')).not.toBeInTheDocument();
  });

  it('should handle single asset', () => {
    render(<RiskReturnScatter assets={[{ name: 'BTC', risk: 50, return: 100 }]} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should use default weight when not provided', () => {
    const assets: RiskReturnPoint[] = [{ name: 'ETH', risk: 45, return: 80 }];
    render(<RiskReturnScatter assets={assets} />);
    expect(screen.getByTestId('scatter')).toBeInTheDocument();
  });
});
