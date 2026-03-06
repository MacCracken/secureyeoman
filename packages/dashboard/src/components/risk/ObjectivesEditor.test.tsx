// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ObjectivesEditor } from './ObjectivesEditor';

const sampleObjectives = [
  { title: 'Reduce downtime', description: 'Aim for 99.9% uptime', priority: 'high' as const },
  { title: 'Improve security', priority: 'medium' as const },
  { title: 'Low priority task', priority: 'low' as const },
];

describe('ObjectivesEditor', () => {
  it('should render objectives list', () => {
    render(<ObjectivesEditor objectives={sampleObjectives} onChange={vi.fn()} />);
    expect(screen.getByText('Reduce downtime')).toBeInTheDocument();
    expect(screen.getByText('Improve security')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });

  it('should show empty state when no objectives', () => {
    render(<ObjectivesEditor objectives={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/No objectives defined/)).toBeInTheDocument();
    expect(screen.getByText('(0)')).toBeInTheDocument();
  });

  it('should render priority badges', () => {
    render(<ObjectivesEditor objectives={sampleObjectives} onChange={vi.fn()} />);
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByText('low')).toBeInTheDocument();
  });

  it('should show description when present', () => {
    render(<ObjectivesEditor objectives={sampleObjectives} onChange={vi.fn()} />);
    expect(screen.getByText('Aim for 99.9% uptime')).toBeInTheDocument();
  });

  it('should call onChange when adding an objective', () => {
    const onChange = vi.fn();
    render(<ObjectivesEditor objectives={sampleObjectives} onChange={onChange} />);

    fireEvent.click(screen.getByText('Add'));
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        ...sampleObjectives,
        expect.objectContaining({ title: '', priority: 'medium' }),
      ])
    );
  });

  it('should enter editing mode when clicking an objective', () => {
    render(<ObjectivesEditor objectives={sampleObjectives} onChange={vi.fn()} />);

    fireEvent.click(screen.getByText('Reduce downtime'));
    // Should now show input fields
    expect(screen.getByPlaceholderText('Objective title')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('should call onChange when updating title', () => {
    const onChange = vi.fn();
    render(<ObjectivesEditor objectives={sampleObjectives} onChange={onChange} />);

    // Enter edit mode
    fireEvent.click(screen.getByText('Reduce downtime'));

    const input = screen.getByPlaceholderText('Objective title');
    fireEvent.change(input, { target: { value: 'New title' } });

    expect(onChange).toHaveBeenCalled();
  });

  it('should call onChange when changing priority', () => {
    const onChange = vi.fn();
    render(<ObjectivesEditor objectives={sampleObjectives} onChange={onChange} />);

    // Enter edit mode
    fireEvent.click(screen.getByText('Reduce downtime'));

    const select = screen.getByDisplayValue('High');
    fireEvent.change(select, { target: { value: 'low' } });

    expect(onChange).toHaveBeenCalled();
  });

  it('should call onChange when deleting an objective', () => {
    const onChange = vi.fn();
    render(<ObjectivesEditor objectives={sampleObjectives} onChange={onChange} />);

    // Click delete button (in view mode via stopPropagation)
    const deleteButtons = screen.getAllByTitle('Delete objective');
    fireEvent.click(deleteButtons[0]);

    expect(onChange).toHaveBeenCalledWith(
      expect.not.arrayContaining([expect.objectContaining({ title: 'Reduce downtime' })])
    );
  });

  it('should exit editing mode when clicking Done', () => {
    render(<ObjectivesEditor objectives={sampleObjectives} onChange={vi.fn()} />);

    // Enter edit mode
    fireEvent.click(screen.getByText('Reduce downtime'));
    expect(screen.getByText('Done')).toBeInTheDocument();

    // Click Done
    fireEvent.click(screen.getByText('Done'));
    expect(screen.queryByText('Done')).not.toBeInTheDocument();
  });

  it('should show (untitled) for objectives without title', () => {
    const objs = [{ title: '', priority: 'medium' as const }];
    render(<ObjectivesEditor objectives={objs} onChange={vi.fn()} />);
    expect(screen.getByText('(untitled)')).toBeInTheDocument();
  });

  it('should update description in edit mode', () => {
    const onChange = vi.fn();
    render(<ObjectivesEditor objectives={sampleObjectives} onChange={onChange} />);

    fireEvent.click(screen.getByText('Reduce downtime'));

    const textarea = screen.getByPlaceholderText('Description (optional)');
    fireEvent.change(textarea, { target: { value: 'Updated desc' } });

    expect(onChange).toHaveBeenCalled();
  });

  it('should handle delete while editing', () => {
    const onChange = vi.fn();
    render(<ObjectivesEditor objectives={sampleObjectives} onChange={onChange} />);

    // Enter edit mode on first item
    fireEvent.click(screen.getByText('Reduce downtime'));

    // Delete the item being edited
    const deleteButtons = screen.getAllByTitle('Delete objective');
    fireEvent.click(deleteButtons[0]);

    expect(onChange).toHaveBeenCalled();
  });
});
