import { useContext, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LicenseContext, type LicensedFeature, isProFeature } from '../hooks/useLicense';

/** @deprecated Use LicensedFeature */
export type { LicensedFeature as EnterpriseFeature } from '../hooks/useLicense';

const FEATURE_LABELS: Record<string, string> = {
  // Pro
  advanced_brain: 'Advanced Brain & Knowledge Base',
  provider_management: 'Provider Account Management',
  computer_use: 'Computer Use & Browser Automation',
  custom_integrations: 'Custom Integrations',
  prompt_engineering: 'Prompt Engineering & A/B Testing',
  batch_inference: 'Batch Inference',
  // Enterprise
  adaptive_learning: 'Adaptive Learning Pipeline',
  sso_saml: 'SSO / SAML',
  multi_tenancy: 'Multi-Tenancy',
  cicd_integration: 'CI/CD Integration',
  advanced_observability: 'Advanced Observability',
  a2a_federation: 'A2A Federation',
  swarm_orchestration: 'Swarm Orchestration',
  confidential_computing: 'Confidential Computing',
  audit_export: 'Audit Chain Export',
  dlp_security: 'Data Loss Prevention',
  compliance_governance: 'Compliance & Governance',
  supply_chain: 'Supply Chain Security',
};

interface FeatureLockProps {
  feature: LicensedFeature;
  children: ReactNode;
  className?: string;
}

export function FeatureLock({ feature, children, className = '' }: FeatureLockProps) {
  const ctx = useContext(LicenseContext);

  // No gate when outside LicenseProvider, enforcement is off, or feature is licensed
  if (!ctx || !ctx.enforcementEnabled || ctx.hasFeature(feature)) {
    return <>{children}</>;
  }

  const requiredTier = isProFeature(feature) ? 'Pro' : 'Enterprise';
  const tierLabel = ctx.license?.tier === 'enterprise' ? 'Enterprise' : requiredTier;

  return (
    <div className={`relative ${className}`}>
      <div className="opacity-40 pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px] rounded-lg">
        <div className="text-center space-y-2 px-4">
          <Lock className="w-6 h-6 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {FEATURE_LABELS[feature] ?? feature}
          </p>
          <p className="text-xs text-muted-foreground">
            This feature requires {tierLabel === 'Enterprise' ? 'an' : 'a'} {tierLabel} license
          </p>
          <Link
            to="/settings#license"
            className="inline-block text-xs text-primary hover:underline"
          >
            Upgrade to {tierLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
