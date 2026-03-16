/**
 * Shared security-policy mutation hooks.
 *
 * Extracted from SecuritySettings.tsx (behavior-preserving refactor).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateSecurityPolicy, updateAgentConfig } from '../../api/client';

export function useSecurityPolicyMutations() {
  const queryClient = useQueryClient();

  const policyMutation = useMutation({
    mutationFn: updateSecurityPolicy,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['security-policy'] });
      void queryClient.invalidateQueries({ queryKey: ['agentConfig'] });
    },
  });

  const agentConfigMutation = useMutation({
    mutationFn: updateAgentConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agentConfig'] });
    },
  });

  return { policyMutation, agentConfigMutation };
}
