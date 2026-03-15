import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createPersonality,
  updatePersonality,
  deletePersonality,
  activatePersonality,
  enablePersonality,
  disablePersonality,
  setDefaultPersonality,
  clearDefaultPersonality,
} from '../../api/client';
import type { PersonalityCreate } from '../../types';

/**
 * Shared personality mutations used by both PersonalityEditor (inline editor)
 * and PersonalityView (list-only route). Eliminates duplication of 7+ mutations.
 */
export function usePersonalityMutations(opts?: {
  onCreateSuccess?: (result: { personality: { id: string } }) => void;
  onUpdateSuccess?: (result: unknown, variables: { id: string }) => void;
  onDeleteSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (data: PersonalityCreate) => createPersonality(data),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      opts?.onCreateSuccess?.(result);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PersonalityCreate> }) =>
      updatePersonality(id, data),
    onSuccess: (result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      opts?.onUpdateSuccess?.(result, variables);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePersonality(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      opts?.onDeleteSuccess?.();
    },
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => {
      setActivatingId(id);
      setActivateError(null);
      return activatePersonality(id);
    },
    onSuccess: () => {
      setActivatingId(null);
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
    onError: (err: Error) => {
      setActivatingId(null);
      setActivateError(err.message || 'Failed to activate personality');
    },
  });

  const enableMut = useMutation({
    mutationFn: (id: string) => enablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const disableMut = useMutation({
    mutationFn: (id: string) => disablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const setDefaultMut = useMutation({
    mutationFn: (id: string) => setDefaultPersonality(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
  });

  const clearDefaultMut = useMutation({
    mutationFn: () => clearDefaultPersonality(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
  });

  return {
    createMut,
    updateMut,
    deleteMut,
    activateMut,
    enableMut,
    disableMut,
    setDefaultMut,
    clearDefaultMut,
    activatingId,
    activateError,
    setActivateError,
  };
}
