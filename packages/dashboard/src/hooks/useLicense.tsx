/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLicenseStatus, type LicenseStatus } from '../api/client';

const ALL_LICENSED_FEATURES = [
  // Pro
  'advanced_brain',
  'provider_management',
  'computer_use',
  'custom_integrations',
  'prompt_engineering',
  'batch_inference',
  // Enterprise
  'adaptive_learning',
  'sso_saml',
  'multi_tenancy',
  'cicd_integration',
  'advanced_observability',
  'a2a_federation',
  'swarm_orchestration',
  'confidential_computing',
  'audit_export',
  'dlp_security',
  'compliance_governance',
  'supply_chain',
] as const;

export type LicensedFeature = (typeof ALL_LICENSED_FEATURES)[number];

const PRO_FEATURES: readonly LicensedFeature[] = [
  'advanced_brain',
  'provider_management',
  'computer_use',
  'custom_integrations',
  'prompt_engineering',
  'batch_inference',
];

/** @deprecated Use LicensedFeature */
export type EnterpriseFeature = LicensedFeature;

export { ALL_LICENSED_FEATURES, PRO_FEATURES };
/** @deprecated Use ALL_LICENSED_FEATURES */
export const ALL_ENTERPRISE_FEATURES = ALL_LICENSED_FEATURES;

/** Returns true if the feature is a pro-tier feature (not enterprise). */
export function isProFeature(feature: LicensedFeature): boolean {
  return (PRO_FEATURES as readonly string[]).includes(feature);
}

interface LicenseContextValue {
  license: LicenseStatus | null;
  isLoading: boolean;
  isEnterprise: boolean;
  enforcementEnabled: boolean;
  hasFeature: (feature: string) => boolean;
  refresh: () => Promise<void>;
}

export const LicenseContext = createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: license = null, isLoading } = useQuery<LicenseStatus>({
    queryKey: ['license-status'],
    queryFn: fetchLicenseStatus,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const isEnterprise = (license?.tier === 'enterprise' || license?.tier === 'pro') && license.valid;
  const enforcementEnabled = license?.enforcementEnabled ?? false;

  const hasFeature = useCallback(
    (feature: string): boolean => {
      if (!enforcementEnabled) return true;
      if (!isEnterprise || !license) return false;
      return license.features.includes(feature);
    },
    [enforcementEnabled, isEnterprise, license]
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['license-status'] });
  }, [queryClient]);

  return (
    <LicenseContext.Provider
      value={{
        license,
        isLoading,
        isEnterprise,
        enforcementEnabled,
        hasFeature,
        refresh,
      }}
    >
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense(): LicenseContextValue {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
}
