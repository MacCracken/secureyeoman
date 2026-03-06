// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CandlestickChart, type OhlcvPoint } from './CandlestickChart';

// Mock recharts to avoid canvas issues in jsdom
vi.mock('recharts', () => ({
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="composed-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  Cell: () => <div />,
}));

const sampleData: OhlcvPoint[] = [
  { date: '2026-01-01', open: 100, high: 110, low: 95, close: 105, volume: 1000 },
  { date: '2026-01-02', open: 105, high: 115, low: 100, close: 98, volume: 1200 },
  { date: '2026-01-03', open: 98, high: 108, low: 92, close: 106, volume: 800 },
  { date: '2026-01-04', open: 106, high: 120, low: 104, close: 118, volume: 1500 },
  { date: '2026-01-05', open: 118, high: 125, low: 110, close: 112, volume: 900 },
];

describe('CandlestickChart', () => {
  it('should render chart with data', () => {
    render(<CandlestickChart data={sampleData} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
    expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
  });

  it('should show "No data" when data is empty', () => {
    render(<CandlestickChart data={[]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('should render with moving averages', () => {
    render(<CandlestickChart data={sampleData} movingAverages={[3, 5]} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should render with volume bars', () => {
    render(<CandlestickChart data={sampleData} showVolume />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should accept custom height', () => {
    render(<CandlestickChart data={sampleData} height={600} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should render with all options enabled', () => {
    render(<CandlestickChart data={sampleData} movingAverages={[3, 5]} showVolume height={500} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should handle single data point', () => {
    const singlePoint: OhlcvPoint[] = [
      { date: '2026-01-01', open: 100, high: 100, low: 100, close: 100 },
    ];
    render(<CandlestickChart data={singlePoint} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should handle equal open/close (doji)', () => {
    const dojiData: OhlcvPoint[] = [
      { date: '2026-01-01', open: 100, high: 110, low: 90, close: 100 },
    ];
    render(<CandlestickChart data={dojiData} />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });
});
