# NEXT_STEP: Scope Limiting Controls

**Status:** In Progress  
**Priority:** High  
**Assigned:** TBD  
**Depends On:** NEXT_STEP_01 (RBAC Permissions)  
**Blocks:** NEXT_STEP_04 (Audit Logging)

---

**Related ADR:** [ADR 014: Screen Capture Security Architecture](../../adr/014-screen-capture-security-architecture.md)

---

## Objective

Implement comprehensive scope limiting controls to restrict what can be captured, how long, and at what quality—enabling users to grant minimal necessary access.

---

## Background

OpenClaw requires the app to be foregrounded for screen capture. Friday needs more granular controls:
- Target specific windows/applications
- Limit capture duration
- Control quality (bandwidth/privacy tradeoff)
- Restrict to specific screen regions

---

## Tasks

### 1. Define Scope Schema

```typescript
// In /packages/core/src/body/scope.ts
export interface CaptureScope {
  // Resource type
  resource: 'screen' | 'camera' | 'microphone' | 'clipboard' | 'window';
  
  // Target specification
  target?: {
    type: 'display' | 'window' | 'application' | 'region';
    id?: string;           // Display ID, window ID, app bundle ID
    name?: string;         // Human-readable name
    region?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  
  // Duration limits
  duration: {
    maxSeconds: number;    // Maximum capture time
    warningAt?: number;    // Warn at N seconds remaining
  };
  
  // Quality settings
  quality: {
    resolution: 'native' | '1080p' | '720p' | '480p' | '360p';
    frameRate: number;     // FPS for video
    compression: 'lossless' | 'high' | 'medium' | 'low';
    format: 'png' | 'jpeg' | 'webp' | 'mp4' | 'webm';
  };
  
  // Content filtering
  filters?: {
    blurRegions?: Array<{ x: number; y: number; w: number; h: number }>;
    redactPatterns?: string[];  // Regex patterns to redact
    excludeWindows?: string[];  // Window titles to exclude
  };
  
  // Usage restrictions
  restrictions?: {
    singleUse: boolean;    // One capture then auto-revoke
    readOnly: boolean;     // No storage, view only
    noNetwork: boolean;    // Prevent network transmission
    watermark: boolean;    // Add identifying watermark
  };
}
```

### 2. Implement Scope Validator

```typescript
// /packages/core/src/body/scope-validator.ts
export class ScopeValidator {
  private config: ScopeValidationConfig;
  
  validate(scope: CaptureScope, userRole: string): ValidationResult {
    const errors: string[] = [];
    
    // Check against role limits
    const roleLimits = this.getRoleLimits(userRole);
    
    if (scope.duration.maxSeconds > roleLimits.maxDuration) {
      errors.push(`Duration ${scope.duration.maxSeconds}s exceeds role limit of ${roleLimits.maxDuration}s`);
    }
    
    if (!roleLimits.allowedResources.includes(scope.resource)) {
      errors.push(`Resource ${scope.resource} not allowed for role ${userRole}`);
    }
    
    if (scope.quality.resolution === 'native' && !roleLimits.allowNativeResolution) {
      errors.push('Native resolution not allowed for this role');
    }
    
    // Validate target exists
    if (scope.target && !this.validateTarget(scope.target)) {
      errors.push('Invalid or inaccessible target');
    }
    
    // Validate filters don't break functionality
    if (scope.filters?.redactPatterns) {
      for (const pattern of scope.filters.redactPatterns) {
        try {
          new RegExp(pattern);
        } catch {
          errors.push(`Invalid regex pattern: ${pattern}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      sanitizedScope: errors.length === 0 ? scope : this.sanitizeScope(scope, roleLimits)
    };
  }
  
  private sanitizeScope(scope: CaptureScope, limits: RoleLimits): CaptureScope {
    // Reduce scope to within limits
    return {
      ...scope,
      duration: {
        ...scope.duration,
        maxSeconds: Math.min(scope.duration.maxSeconds, limits.maxDuration)
      },
      quality: {
        ...scope.quality,
        resolution: limits.allowNativeResolution ? scope.quality.resolution : '1080p'
      }
    };
  }
}
```

### 3. Build Scope Configuration UI

```typescript
// Dashboard scope selector component
export function ScopeConfigurator({ onChange }: { onChange: (scope: CaptureScope) => void }) {
  const [scope, setScope] = useState<Partial<CaptureScope>>({
    resource: 'screen',
    duration: { maxSeconds: 60, warningAt: 10 },
    quality: { resolution: '720p', frameRate: 30, compression: 'medium', format: 'webp' }
  });
  
  const [availableTargets, setAvailableTargets] = useState<Target[]>([]);
  
  useEffect(() => {
    // Fetch available windows/displays
    fetchAvailableTargets().then(setAvailableTargets);
  }, []);
  
  return (
    <div className="scope-configurator">
      <h3>Capture Scope</h3>
      
      <label>Resource:</label>
      <select value={scope.resource} onChange={e => setScope({...scope, resource: e.target.value})}>
        <option value="screen">Full Screen</option>
        <option value="window">Specific Window</option>
        <option value="application">Application</option>
        <option value="region">Screen Region</option>
      </select>
      
      {scope.resource !== 'screen' && (
        <label>Target:</label>
        <select onChange={e => setScope({...scope, target: { type: scope.resource, id: e.target.value }})}>
          {availableTargets.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}
      
      <label>Duration (seconds):</label>
      <input 
        type="range" 
        min="5" 
        max="300" 
        value={scope.duration?.maxSeconds} 
        onChange={e => setScope({...scope, duration: {...scope.duration, maxSeconds: parseInt(e.target.value)}})}
      />
      <span>{scope.duration?.maxSeconds}s</span>
      
      <label>Quality:</label>
      <select value={scope.quality?.resolution} onChange={e => setScope({...scope, quality: {...scope.quality, resolution: e.target.value}})}>
        <option value="360p">Low (360p)</option>
        <option value="720p">Medium (720p)</option>
        <option value="1080p">High (1080p)</option>
        <option value="native">Native (Max)</option>
      </select>
      
      <label>Privacy Options:</label>
      <div className="privacy-options">
        <label>
          <input type="checkbox" checked={scope.restrictions?.watermark} 
                 onChange={e => setScope({...scope, restrictions: {...scope.restrictions, watermark: e.target.checked}})} />
          Add watermark
        </label>
        <label>
          <input type="checkbox" checked={scope.restrictions?.singleUse}
                 onChange={e => setScope({...scope, restrictions: {...scope.restrictions, singleUse: e.target.checked}})} />
          Single use only
        </label>
      </div>
    </div>
  );
}
```

### 4. Implement Platform-Specific Target Discovery

```typescript
// /packages/core/src/body/target-discovery.ts
export interface TargetDiscovery {
  getAvailableWindows(): Promise<WindowInfo[]>;
  getAvailableDisplays(): Promise<DisplayInfo[]>;
  getRunningApplications(): Promise<ApplicationInfo[]>;
}

// macOS implementation
export class DarwinTargetDiscovery implements TargetDiscovery {
  async getAvailableWindows(): Promise<WindowInfo[]> {
    // Use CoreGraphics API via native addon
    const windows = await nativeModule.getWindowList();
    return windows.filter(w => w.isVisible && !w.isSystemWindow);
  }
}

// Linux implementation
export class LinuxTargetDiscovery implements TargetDiscovery {
  async getAvailableWindows(): Promise<WindowInfo[]> {
    // Use xdotool or wayland protocols
    const output = await exec('xdotool search --all --onlyvisible --class ".*" getwindowname %@');
    // Parse output...
  }
}
```

### 5. Create Scope Enforcement in Capture Engine

```typescript
// /packages/core/src/body/capture-engine.ts
export class CaptureEngine {
  async capture(scope: CaptureScope): Promise<CaptureResult> {
    // Validate scope is within limits
    const validation = this.scopeValidator.validate(scope, this.currentUserRole);
    if (!validation.valid) {
      throw new ScopeValidationError(validation.errors);
    }
    
    const sanitizedScope = validation.sanitizedScope;
    
    // Apply duration timer
    const timeoutId = setTimeout(() => {
      this.stopCapture('duration_exceeded');
    }, sanitizedScope.duration.maxSeconds * 1000);
    
    // Apply quality settings
    const captureOptions = this.buildCaptureOptions(sanitizedScope);
    
    // Perform capture
    const result = await this.performCapture(captureOptions);
    
    // Apply filters
    if (sanitizedScope.filters) {
      result.data = await this.applyFilters(result.data, sanitizedScope.filters);
    }
    
    // Add watermark if required
    if (sanitizedScope.restrictions?.watermark) {
      result.data = await this.addWatermark(result.data, this.userId);
    }
    
    clearTimeout(timeoutId);
    
    // If single-use, auto-revoke consent
    if (sanitizedScope.restrictions?.singleUse) {
      await this.consentManager.revokeConsent(this.currentConsentId);
    }
    
    return result;
  }
}
```

### 6. Add Region Selection UI

```typescript
// Interactive region selector
export function RegionSelector({ onSelect }: { onSelect: (region: Region) => void }) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<Region | null>(null);
  
  const startSelection = () => {
    setIsSelecting(true);
    // Overlay semi-transparent layer on screen
    // Track mouse drag to define region
  };
  
  return (
    <div className="region-selector">
      {!isSelecting ? (
        <button onClick={startSelection}>Select Region</button>
      ) : (
        <div className="selection-overlay" onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}>
          {/* Render selection rectangle */}
        </div>
      )}
      {selection && (
        <div className="selection-preview">
          Selected: {selection.width}x{selection.height} at ({selection.x}, {selection.y})
        </div>
      )}
    </div>
  );
}
```

---

## Deliverables

- [x] `/packages/core/src/body/types.ts` — Extended with detailed scope type definitions
- [x] `/packages/core/src/body/scope-validator.ts` — Scope validation logic with role limits
- [ ] `/packages/core/src/body/target-discovery.ts` — Target discovery interface (deferred to capture engine phase)
- [ ] `/packages/core/src/body/target-discovery-darwin.ts` — macOS implementation (deferred)
- [ ] `/packages/core/src/body/target-discovery-linux.ts` — Linux implementation (deferred)
- [ ] `/apps/dashboard/src/components/ScopeConfigurator.tsx` — Scope UI (deferred to UI phase)
- [ ] `/apps/dashboard/src/components/RegionSelector.tsx` — Region selection (deferred to UI phase)
- [x] Unit tests for validation logic (38 tests passing)
- [ ] Integration tests for platform discovery (deferred)

---

## Security Considerations

1. **Least privilege** — Default to smallest scope possible
2. **Role limits** — Enforce hard limits based on RBAC
3. **Sanitization** — Always sanitize user input
4. **Target validation** — Verify targets exist and are accessible
5. **Auto-expire** — Scope automatically expires after duration
6. **Redaction** — Support automatic PII redaction

---

## Success Criteria

- [ ] Scope validated against role limits
- [ ] Available targets discovered and displayed
- [ ] Duration timer enforced automatically
- [ ] Quality settings respected
- [ ] Filters applied to captured data
- [ ] Single-use scopes auto-revoke
- [ ] Region selection works on all platforms
- [ ] 100% test coverage of validation logic

