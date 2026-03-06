// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopicCloudWidget } from './TopicCloudWidget';

const samplePhrases = [
  { id: '1', phrase: 'machine learning', frequency: 10, personalityId: 'p1', windowStart: '2026-03-01', windowEnd: '2026-03-06', updatedAt: '2026-03-06' },
  { id: '2', phrase: 'security', frequency: 8, personalityId: 'p1', windowStart: '2026-03-01', windowEnd: '2026-03-06', updatedAt: '2026-03-06' },
  { id: '3', phrase: 'deployment', frequency: 3, personalityId: 'p1', windowStart: '2026-03-01', windowEnd: '2026-03-06', updatedAt: '2026-03-06' },
];

describe('TopicCloudWidget', () => {
  it('should render phrases', () => {
    render(<TopicCloudWidget phrases={samplePhrases} isLoading={false} />);
    expect(screen.getByText('machine learning')).toBeInTheDocument();
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getByText('deployment')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(<TopicCloudWidget phrases={[]} isLoading={true} />);
    expect(screen.getByText(/Loading key phrases/)).toBeInTheDocument();
  });

  it('should show empty state', () => {
    render(<TopicCloudWidget phrases={[]} isLoading={false} />);
    expect(screen.getByText(/No key phrases extracted/)).toBeInTheDocument();
  });

  it('should render with title attributes showing frequency', () => {
    render(<TopicCloudWidget phrases={samplePhrases} isLoading={false} />);
    expect(screen.getByTitle('machine learning (10)')).toBeInTheDocument();
    expect(screen.getByTitle('security (8)')).toBeInTheDocument();
  });

  it('should render the topic cloud container', () => {
    render(<TopicCloudWidget phrases={samplePhrases} isLoading={false} />);
    expect(screen.getByTestId('topic-cloud')).toBeInTheDocument();
  });

  it('should handle single phrase', () => {
    render(<TopicCloudWidget phrases={[{ id: '1', phrase: 'test', frequency: 5, personalityId: 'p1', windowStart: '2026-03-01', windowEnd: '2026-03-06', updatedAt: '2026-03-06' }]} isLoading={false} />);
    expect(screen.getByText('test')).toBeInTheDocument();
  });
});
