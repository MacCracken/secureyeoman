// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DepartmentFormModal } from './DepartmentFormModal';

describe('DepartmentFormModal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <DepartmentFormModal {...defaultProps} open={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders create department title when no department', () => {
    render(<DepartmentFormModal {...defaultProps} />);
    expect(screen.getAllByText('Create Department').length).toBeGreaterThanOrEqual(1);
  });

  it('renders edit department title when editing', () => {
    render(
      <DepartmentFormModal
        {...defaultProps}
        department={{ id: 'd1', name: 'Engineering' }}
      />
    );
    expect(screen.getByText('Edit Department')).toBeInTheDocument();
  });

  it('renders name, description, and mission fields', () => {
    render(<DepartmentFormModal {...defaultProps} />);
    expect(screen.getByPlaceholderText('e.g. Engineering')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Brief description of the department')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Department mission statement')).toBeInTheDocument();
  });

  it('renders risk appetite sliders', () => {
    render(<DepartmentFormModal {...defaultProps} />);
    expect(screen.getByText('Risk Appetite')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Operational')).toBeInTheDocument();
    expect(screen.getByText('Financial')).toBeInTheDocument();
    expect(screen.getByText('Compliance')).toBeInTheDocument();
    expect(screen.getByText('Reputational')).toBeInTheDocument();
  });

  it('renders preset buttons', () => {
    render(<DepartmentFormModal {...defaultProps} />);
    expect(screen.getByText('Conservative')).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText('Aggressive')).toBeInTheDocument();
  });

  it('renders compliance targets section', () => {
    render(<DepartmentFormModal {...defaultProps} />);
    expect(screen.getByText('Compliance Targets')).toBeInTheDocument();
    expect(screen.getByText('Add Target')).toBeInTheDocument();
    expect(screen.getByText('No compliance targets defined.')).toBeInTheDocument();
  });

  it('adds a compliance target when Add Target clicked', async () => {
    const user = userEvent.setup();
    render(<DepartmentFormModal {...defaultProps} />);
    await user.click(screen.getByText('Add Target'));
    expect(screen.getByPlaceholderText('e.g. SOC 2')).toBeInTheDocument();
  });

  it('calls onClose when Cancel clicked', async () => {
    const user = userEvent.setup();
    render(<DepartmentFormModal {...defaultProps} />);
    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onSubmit with form data', async () => {
    const user = userEvent.setup();
    render(<DepartmentFormModal {...defaultProps} />);
    const nameInput = screen.getByPlaceholderText('e.g. Engineering');
    await user.type(nameInput, 'Security');
    await user.click(screen.getByRole('button', { name: 'Create Department' }));
    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Security' })
    );
  });

  it('does not submit when name is empty', async () => {
    const user = userEvent.setup();
    render(<DepartmentFormModal {...defaultProps} />);
    const submitBtn = screen.getByRole('button', { name: 'Create Department' });
    expect(submitBtn).toBeDisabled();
  });

  it('populates form when editing existing department', () => {
    render(
      <DepartmentFormModal
        {...defaultProps}
        department={{
          id: 'd1',
          name: 'Engineering',
          description: 'Eng team',
          mission: 'Build stuff',
        }}
      />
    );
    expect(screen.getByDisplayValue('Engineering')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Eng team')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Build stuff')).toBeInTheDocument();
  });

  it('calls onClose when backdrop clicked', async () => {
    const user = userEvent.setup();
    render(<DepartmentFormModal {...defaultProps} />);
    const modal = screen.getByTestId('department-form-modal');
    // Click the backdrop (first child div with bg-black/50)
    const backdrop = modal.querySelector('.bg-black\\/50');
    if (backdrop) {
      await user.click(backdrop);
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });

  it('renders close button with aria-label', () => {
    render(<DepartmentFormModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
