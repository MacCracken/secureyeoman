import { useContext, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LicenseContext, type LicensedFeature } from '../hooks/useLicense';

/** @deprecated Use LicensedFeature */
export type { LicensedFeature as EnterpriseFeature } from '../hooks/useLicense';

const FEATURE_LABELS: Record<string, string> = {
  adaptive_learning: 'Adaptive Learning Pipeline',
  sso_saml: 'SSO / SAML',
  multi_tenancy: 'Multi-Tenancy',
  cicd_integration: 'CI/CD Integration',
  advanced_observability: 'Advanced Observability',
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

  const tierLabel = ctx.license?.tier === 'community' ? 'Pro' : 'Enterprise';

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
            This feature requires a {tierLabel} license
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
