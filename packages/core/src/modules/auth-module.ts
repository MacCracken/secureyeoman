/**
 * AuthModule — owns authStorage and authService.
 *
 * Extracted from SecureYeoman Step 5.5.
 */

import { BaseModule } from './types.js';
import { AuthStorage } from '../security/auth-storage.js';
import { AuthService } from '../security/auth.js';
import { sha256 } from '../utils/crypto.js';
import { requireSecret } from '../config/loader.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { RBAC } from '../security/rbac.js';
import type { RateLimiterLike } from '../security/rate-limiter.js';

export interface AuthModuleDeps {
  auditChain: AuditChain;
  rbac: RBAC;
  rateLimiter: RateLimiterLike;
}

export class AuthModule extends BaseModule {
  private authStorage: AuthStorage | null = null;
  private authService: AuthService | null = null;

  constructor(private readonly deps: AuthModuleDeps) {
    super();
  }

  protected async doInit(): Promise<void> {
    this.authStorage = new AuthStorage();

    const tokenSecret = requireSecret(this.config.gateway.auth.tokenSecret);
    const adminPasswordRaw = requireSecret(this.config.gateway.auth.adminPasswordEnv);
    const adminPassword = sha256(adminPasswordRaw);

    this.authService = new AuthService(
      {
        tokenSecret,
        tokenExpirySeconds: this.config.gateway.auth.tokenExpirySeconds,
        refreshTokenExpirySeconds: this.config.gateway.auth.refreshTokenExpirySeconds,
        adminPassword,
      },
      {
        storage: this.authStorage,
        auditChain: this.deps.auditChain,
        rbac: this.deps.rbac,
        rateLimiter: this.deps.rateLimiter,
        logger: this.logger.child({ component: 'AuthService' }),
      }
    );
    this.logger.debug('Auth service initialized');
  }

  async cleanup(): Promise<void> {
    if (this.authStorage) {
      this.authStorage.close();
      this.authStorage = null;
      this.authService = null;
    }
  }

  getAuthStorage(): AuthStorage | null {
    return this.authStorage;
  }
  getAuthService(): AuthService | null {
    return this.authService;
  }
}
