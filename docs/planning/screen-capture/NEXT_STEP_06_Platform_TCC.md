# NEXT_STEP: Platform-Specific Permission Integration

**Status:** Not Started  
**Priority:** High  
**Assigned:** TBD  
**Depends On:** NEXT_STEP_05 (Sandboxing)  
**Blocks:** None (Final Step)

---

**Related ADR:** [ADR 014: Screen Capture Security Architecture](../../adr/014-screen-capture-security-architecture.md)

---

## Objective

Integrate with platform-specific permission systems (macOS TCC, Windows UWP, Linux portals) to ensure Friday complies with OS-level security policies while maintaining a consistent user experience.

---

## Background

Modern operating systems require explicit user consent for screen capture:
- **macOS** — TCC (Transparency, Consent, Control) framework
- **Windows** — UWP permissions, foreground window requirements
- **Linux** — XDG Desktop Portals (Wayland/X11)

OpenClaw uses macOS TCC with `needsScreenRecording` flag and per-node pairing.

---

## Tasks

### 1. Create Platform Permission Abstraction

```typescript
// In /packages/core/src/body/platform-permissions.ts
export interface PlatformPermissionManager {
  checkPermission(type: CapturePermissionType): Promise<PermissionStatus>;
  requestPermission(type: CapturePermissionType): Promise<PermissionStatus>;
  onPermissionChange(callback: (status: PermissionStatus) => void): void;
  openSystemPreferences(type: CapturePermissionType): Promise<void>;
}

export type CapturePermissionType =
  | 'screen'           // Screen recording
  | 'camera'           // Camera access
  | 'microphone'       // Microphone access
  | 'accessibility';   // Accessibility/keyboard input

export interface PermissionStatus {
  granted: boolean;
  state: 'granted' | 'denied' | 'not-determined' | 'restricted';
  canRequest: boolean;  // Can we ask again?
  lastPrompted?: number;
}
```

### 2. Implement macOS TCC Integration

```typescript
// /packages/core/src/body/platform/darwin-permissions.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DarwinPermissionManager implements PlatformPermissionManager {
  private tccDatabase = '/Library/Application Support/com.apple.TCC/TCC.db';
  
  async checkPermission(type: CapturePermissionType): Promise<PermissionStatus> {
    switch (type) {
      case 'screen':
        return this.checkScreenRecordingPermission();
      case 'camera':
        return this.checkCameraPermission();
      case 'microphone':
        return this.checkMicrophonePermission();
      case 'accessibility':
        return this.checkAccessibilityPermission();
      default:
        throw new Error(`Unknown permission type: ${type}`);
    }
  }
  
  private async checkScreenRecordingPermission(): Promise<PermissionStatus> {
    // macOS 10.15+ uses CGPreflightScreenCaptureAccess
    // We can check by attempting a small capture
    try {
      const { stdout } = await execAsync(
        `osascript -e 'tell application "System Events" to return name of first application process'`
      );
      
      // If we can read process names, we likely have screen recording permission
      // But this isn't definitive - better to use CoreGraphics API
      
      // Use native module for definitive check
      const hasPermission = await nativeModule.checkScreenCaptureAccess();
      
      return {
        granted: hasPermission,
        state: hasPermission ? 'granted' : 'not-determined',
        canRequest: true
      };
    } catch (error) {
      return {
        granted: false,
        state: 'denied',
        canRequest: false
      };
    }
  }
  
  async requestPermission(type: CapturePermissionType): Promise<PermissionStatus> {
    if (type === 'screen') {
      // Trigger system prompt by attempting capture
      // macOS will show the permission dialog automatically
      await nativeModule.requestScreenCaptureAccess();
      
      // Wait and check status
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.checkScreenRecordingPermission();
    }
    
    // For other permissions, use AVCaptureDevice
    return this.requestAVPermission(type);
  }
  
  async openSystemPreferences(type: CapturePermissionType): Promise<void> {
    const urls: Record<CapturePermissionType, string> = {
      screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
      microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
      accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
    };
    
    await execAsync(`open "${urls[type]}"`);
  }
  
  onPermissionChange(callback: (status: PermissionStatus) => void): void {
    // macOS doesn't provide a native way to watch TCC changes
    // Poll periodically
    setInterval(async () => {
      const status = await this.checkScreenRecordingPermission();
      callback(status);
    }, 5000);
  }
}
```

### 3. Implement Windows Permission Integration

```typescript
// /packages/core/src/body/platform/windows-permissions.ts
export class WindowsPermissionManager implements PlatformPermissionManager {
  async checkPermission(type: CapturePermissionType): Promise<PermissionStatus> {
    switch (type) {
      case 'screen':
        return this.checkScreenRecordingPermission();
      case 'camera':
      case 'microphone':
        return this.checkMediaPermission(type);
      default:
        return { granted: false, state: 'restricted', canRequest: false };
    }
  }
  
  private async checkScreenRecordingPermission(): Promise<PermissionStatus> {
    // Windows 10/11: Check if Desktop Duplication API is available
    // and if user has granted permission via UWP settings
    
    try {
      // Try to create a Desktop Duplication session
      const canCapture = await nativeModule.testDesktopDuplication();
      
      return {
        granted: canCapture,
        state: canCapture ? 'granted' : 'not-determined',
        canRequest: true
      };
    } catch (error) {
      return {
        granted: false,
        state: 'denied',
        canRequest: false
      };
    }
  }
  
  async requestPermission(type: CapturePermissionType): Promise<PermissionStatus> {
    if (type === 'screen') {
      // Windows doesn't have a direct permission prompt for screen capture
      // We need to use GraphicsCapturePicker (UWP) or inform user
      
      // Show UI explaining how to grant permission
      await this.showPermissionInstructions(type);
      
      return this.checkPermission(type);
    }
    
    // For camera/mic, use Windows Runtime APIs
    return this.requestRuntimePermission(type);
  }
  
  async openSystemPreferences(type: CapturePermissionType): Promise<void> {
    // Open Windows Settings
    const commands: Record<CapturePermissionType, string> = {
      screen: 'ms-settings:privacy-screencapture',
      camera: 'ms-settings:privacy-webcam',
      microphone: 'ms-settings:privacy-microphone',
      accessibility: 'ms-settings:easeofaccess-eyecontrol'
    };
    
    await execAsync(`start ${commands[type]}`);
  }
}
```

### 4. Implement Linux Portal Integration

```typescript
// /packages/core/src/body/platform/linux-permissions.ts
export class LinuxPermissionManager implements PlatformPermissionManager {
  private usePortal: boolean;
  
  constructor() {
    // Detect if running under Wayland (requires portals)
    this.usePortal = process.env.WAYLAND_DISPLAY !== undefined;
  }
  
  async checkPermission(type: CapturePermissionType): Promise<PermissionStatus> {
    if (this.usePortal) {
      return this.checkPortalPermission(type);
    }
    
    // X11: No permission system, assume granted
    return {
      granted: type === 'screen',
      state: 'granted',
      canRequest: false
    };
  }
  
  private async checkPortalPermission(type: CapturePermissionType): Promise<PermissionStatus> {
    // Use xdg-desktop-portal via D-Bus
    const portal = await this.getScreenCastPortal();
    
    try {
      // Check if we can create a session
      await portal.createSession();
      
      return {
        granted: true,
        state: 'granted',
        canRequest: true
      };
    } catch (error) {
      return {
        granted: false,
        state: 'not-determined',
        canRequest: true
      };
    }
  }
  
  async requestPermission(type: CapturePermissionType): Promise<PermissionStatus> {
    if (!this.usePortal) {
      // X11: No permission to request
      return this.checkPermission(type);
    }
    
    // Use xdg-desktop-portal
    const portal = await this.getScreenCastPortal();
    
    // This will trigger the portal dialog
    const session = await portal.createSession({
      handleToken: `friday-${Date.now()}`,
      sessionHandleToken: `friday-session-${Date.now()}`
    });
    
    // Wait for user response
    const sources = await portal.selectSources(session, {
      types: ['monitor', 'window'],
      multiple: false
    });
    
    return {
      granted: sources.length > 0,
      state: sources.length > 0 ? 'granted' : 'denied',
      canRequest: true
    };
  }
  
  private async getScreenCastPortal(): Promise<ScreenCastPortal> {
    // Connect to D-Bus and get org.freedesktop.portal.ScreenCast
    const bus = dbus.systemBus();
    return bus.getProxyObject(
      'org.freedesktop.portal.Desktop',
      '/org/freedesktop/portal/desktop'
    );
  }
}
```

### 5. Create Permission Flow Orchestrator

```typescript
// /packages/core/src/body/permission-orchestrator.ts
export class PermissionOrchestrator {
  private platformManager: PlatformPermissionManager;
  
  constructor() {
    this.platformManager = this.createPlatformManager();
  }
  
  async ensurePermission(
    type: CapturePermissionType,
    context: CaptureContext
  ): Promise<PermissionResult> {
    // Step 1: Check RBAC permission
    const rbacResult = await this.checkRBACPermission(context.userId, type);
    if (!rbacResult.granted) {
      return { granted: false, reason: 'RBAC_DENIED', details: rbacResult };
    }
    
    // Step 2: Check platform permission
    const platformStatus = await this.platformManager.checkPermission(type);
    
    if (platformStatus.granted) {
      // Step 3: Request user consent
      return this.requestUserConsent(type, context);
    }
    
    if (platformStatus.canRequest) {
      // Request platform permission
      const newStatus = await this.platformManager.requestPermission(type);
      
      if (newStatus.granted) {
        return this.requestUserConsent(type, context);
      }
    }
    
    // Permission denied at platform level
    return {
      granted: false,
      reason: 'PLATFORM_DENIED',
      platformStatus
    };
  }
  
  private async requestUserConsent(
    type: CapturePermissionType,
    context: CaptureContext
  ): Promise<PermissionResult> {
    const consent = await consentManager.requestConsent(context.userId, {
      resource: type === 'screen' ? 'screen' : type,
      purpose: context.purpose,
      duration: context.duration,
      quality: context.quality
    });
    
    if (consent.status === 'granted') {
      return {
        granted: true,
        consentId: consent.id,
        platform: await this.platformManager.checkPermission(type)
      };
    }
    
    return {
      granted: false,
      reason: 'USER_DENIED',
      consent
    };
  }
}
```

### 6. Build Permission Status UI

```typescript
// Dashboard permission status component
export function PlatformPermissionStatus() {
  const [permissions, setPermissions] = useState<Record<CapturePermissionType, PermissionStatus>>({});
  
  useEffect(() => {
    // Check all permission types
    Promise.all([
      checkPermission('screen'),
      checkPermission('camera'),
      checkPermission('microphone')
    ]).then(([screen, camera, mic]) => {
      setPermissions({ screen, camera, microphone: mic });
    });
  }, []);
  
  return (
    <div className="permission-status">
      <h3>System Permissions</h3>
      
      {Object.entries(permissions).map(([type, status]) => (
        <div key={type} className={`permission-item ${status.state}`}>
          <span className="permission-name">{formatPermissionName(type)}</span>
          <span className="permission-state">{status.state}</span>
          
          {!status.granted && status.canRequest && (
            <button onClick={() => requestPermission(type as CapturePermissionType)}>
              Request Access
            </button>
          )}
          
          {!status.granted && !status.canRequest && (
            <button onClick={() => openSystemPreferences(type as CapturePermissionType)}>
              Open System Settings
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 7. Handle Permission Edge Cases

```typescript
// /packages/core/src/body/permission-edge-cases.ts
export class PermissionEdgeCaseHandler {
  // Handle permission being revoked mid-capture
  async handlePermissionRevoked(
    consentId: string,
    type: CapturePermissionType
  ): Promise<void> {
    // Stop active capture immediately
    await captureEngine.stopCapture(consentId);
    
    // Audit log
    await auditLogger.logCaptureEvent({
      eventType: 'capture.stopped',
      result: { success: true, reason: 'permission_revoked' },
      consentId
    });
    
    // Notify user
    notificationManager.send({
      title: 'Capture Stopped',
      message: `Screen capture stopped because ${type} permission was revoked`,
      severity: 'warning'
    });
  }
  
  // Handle upgrade scenarios (e.g., macOS upgrade changes TCC)
  async handleOSUpgrade(): Promise<void> {
    // Re-verify all permissions after OS upgrade
    const permissions = ['screen', 'camera', 'microphone'] as const;
    
    for (const type of permissions) {
      const status = await permissionManager.checkPermission(type);
      
      if (!status.granted) {
        // Permission may have been reset during upgrade
        await this.promptForReauthorization(type);
      }
    }
  }
  
  // Handle enterprise policy restrictions
  async checkEnterprisePolicy(type: CapturePermissionType): Promise<boolean> {
    // Check MDM policies
    // Check configuration profiles
    // Return true if enterprise allows
    
    return true; // Default allow
  }
}
```

---

## Deliverables

- [ ] `/packages/core/src/body/platform-permissions.ts` — Platform abstraction
- [ ] `/packages/core/src/body/platform/darwin-permissions.ts` — macOS TCC
- [ ] `/packages/core/src/body/platform/windows-permissions.ts` — Windows
- [ ] `/packages/core/src/body/platform/linux-permissions.ts` — Linux portals
- [ ] `/packages/core/src/body/permission-orchestrator.ts` — Flow orchestrator
- [ ] `/apps/dashboard/src/components/PlatformPermissionStatus.tsx` — UI
- [ ] `/packages/core/src/body/permission-edge-cases.ts` — Edge case handling
- [ ] Unit tests for each platform
- [ ] Integration tests for full permission flow

---

## Security Considerations

1. **Platform compliance** — Always respect OS permission decisions
2. **No bypass** — Never attempt to bypass platform security
3. **Clear messaging** — Explain why permissions are needed
4. **Graceful degradation** — Work without permissions if possible
5. **Re-verification** — Re-check permissions periodically
6. **Enterprise support** — Handle MDM/policy restrictions
7. **Upgrade handling** — Re-verify after OS updates

---

## Success Criteria

- [ ] macOS TCC integration working (screen, camera, mic)
- [ ] Windows permission handling
- [ ] Linux XDG Desktop Portal support
- [ ] Permission status visible in dashboard
- [ ] Users can request/grant permissions via UI
- [ ] Permission revocation stops capture immediately
- [ ] OS upgrades handled gracefully
- [ ] Enterprise policies respected
- [ ] 100% test coverage of permission logic

