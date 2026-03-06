// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceToggle } from './VoiceToggle';

describe('VoiceToggle', () => {
  const defaultProps = {
    voiceEnabled: false,
    isListening: false,
    isSpeaking: false,
    supported: true,
    onToggle: vi.fn(),
  };

  it('should render disabled button when not supported', () => {
    render(<VoiceToggle {...defaultProps} supported={false} />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-label', 'Voice not supported');
  });

  it('should render speaking state', () => {
    render(<VoiceToggle {...defaultProps} voiceEnabled isSpeaking />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Voice active, speaking');
  });

  it('should render listening state', () => {
    render(<VoiceToggle {...defaultProps} voiceEnabled isListening />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Voice active, listening');
  });

  it('should render enabled idle state', () => {
    render(<VoiceToggle {...defaultProps} voiceEnabled />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Disable voice input');
  });

  it('should render disabled idle state', () => {
    render(<VoiceToggle {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Enable voice input');
  });

  it('should call onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<VoiceToggle {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('should call onToggle when speaking button clicked', () => {
    const onToggle = vi.fn();
    render(<VoiceToggle {...defaultProps} voiceEnabled isSpeaking onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('should call onToggle when listening button clicked', () => {
    const onToggle = vi.fn();
    render(<VoiceToggle {...defaultProps} voiceEnabled isListening onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
