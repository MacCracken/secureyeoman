# NEXT_STEP: Sandboxing for Capture Processes

**Status:** Not Started  
**Priority:** Critical  
**Assigned:** TBD  
**Depends On:** NEXT_STEP_04 (Audit Logging)  
**Blocks:** NEXT_STEP_06 (Platform TCC)

---

**Related ADRs:**
- [ADR 014: Screen Capture Security Architecture](../../adr/014-screen-capture-security-architecture.md)
- [ADR 017: Sandboxed Execution](../../adr/017-sandboxed-capture-execution.md)

---

## Objective

Implement sandboxed execution for screen capture processes to isolate potentially vulnerable native code and limit blast radius of security compromises.

---

## Background

Friday has existing sandbox implementations:
- `/packages/core/src/sandbox/linux-sandbox.ts` — Linux namespaces, seccomp, Landlock
- `/packages/core/src/sandbox/darwin-sandbox.ts` — macOS seatbelt profiles
- `/packages/core/src/sandbox/manager.ts` — Sandbox manager

Screen capture requires elevated privileges (screen access) but should be tightly constrained.

---

## Tasks

### 1. Create Capture-Specific Sandbox Profile

```typescript
// In /packages/core/src/sandbox/capture-sandbox.ts
export interface CaptureSandboxConfig {
  // Resource limits
  maxMemory: number;           // MB
  maxCpuPercent: number;       // Percentage
  maxDuration: number;         // Seconds
  
  // File system restrictions
  allowedPaths: string[];      // Read-only paths
  writePaths: string[];        // Write paths (temp only)
  blockedPaths: string[];      // Explicitly blocked
  
  // Network restrictions
  allowNetwork: boolean;
  allowedHosts?: string[];     // If network allowed
  
  // System call filtering
  syscallPolicy: 'strict' | 'minimal' | 'capture-only';
  
  // Display/graphics access
  displayAccess: 'none' | 'capture-only' | 'full';
  
  // Process isolation
  isolateProcesses: boolean;
  maxProcesses: number;
}

export const DEFAULT_CAPTURE_SANDBOX: CaptureSandboxConfig = {
  maxMemory: 512,              // 512 MB
  maxCpuPercent: 50,           // 50% CPU
  maxDuration: 300,            // 5 minutes
  allowedPaths: [
    '/usr/lib',
    '/System/Library',          // macOS
    '/lib',                     // Linux
    '/lib64'
  ],
  writePaths: ['/tmp/capture-*'], // Temp files only
  blockedPaths: [
    '/etc/passwd',
    '/etc/shadow',
    '~/.ssh',
    '~/.gnupg'
  ],
  allowNetwork: false,         // No network in capture sandbox
  syscallPolicy: 'capture-only',
  displayAccess: 'capture-only',
  isolateProcesses: true,
  maxProcesses: 4
};
```

### 2. Implement Linux Capture Sandbox

```typescript
// /packages/core/src/sandbox/linux-capture-sandbox.ts
import { LinuxSandbox } from './linux-sandbox.js';

export class LinuxCaptureSandbox extends LinuxSandbox {
  private config: CaptureSandboxConfig;
  
  constructor(config: CaptureSandboxConfig = DEFAULT_CAPTURE_SANDBOX) {
    super();
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    // Create isolated namespace
    await this.createNamespace();
    
    // Apply seccomp filter for capture syscalls
    await this.applySeccompFilter();
    
    // Apply Landlock filesystem restrictions
    await this.applyLandlockRules();
    
    // Set resource limits
    await this.setResourceLimits();
    
    // Drop privileges (if running as root)
    await this.dropPrivileges();
  }
  
  private async applySeccompFilter(): Promise<void> {
    const allowedSyscalls = [
      'read', 'write', 'open', 'close',
      'mmap', 'munmap', 'mprotect',
      'ioctl', // For display access
      'gettimeofday', 'clock_gettime',
      'exit', 'exit_group',
      // Add capture-specific syscalls
      'shmget', 'shmat', 'shmctl', // Shared memory for frames
      'poll', 'epoll_wait', 'select' // Event handling
    ];
    
    const blockedSyscalls = [
      'socket', 'connect', 'accept', // Network
      'execve', 'fork', 'vfork',     // Process creation
      'ptrace',                      // Debugging
      'openat', 'unlink', 'rmdir'    // Dangerous filesystem
    ];
    
    await this.seccompLoadFilter({
      defaultAction: 'kill',  // Kill process on violation
      rules: [
        ...allowedSyscalls.map(sc => ({ syscall: sc, action: 'allow' })),
        ...blockedSyscalls.map(sc => ({ syscall: sc, action: 'kill' }))
      ]
    });
  }
  
  private async applyLandlockRules(): Promise<void> {
    // Read-only access to system libraries
    for (const path of this.config.allowedPaths) {
      await this.landlockAddRule({
        path,
        permissions: ['read', 'execute']
      });
    }
    
    // Write access only to temp capture directory
    for (const pattern of this.config.writePaths) {
      await this.landlockAddRule({
        pathPattern: pattern,
        permissions: ['read', 'write', 'create']
      });
    }
    
    // Explicitly block sensitive paths
    for (const path of this.config.blockedPaths) {
      await this.landlockAddRule({
        path,
        permissions: []  // No permissions = blocked
      });
    }
  }
  
  private async setResourceLimits(): Promise<void> {
    await this.setLimit('RLIMIT_AS', this.config.maxMemory * 1024 * 1024);
    await this.setLimit('RLIMIT_CPU', this.config.maxDuration);
    await this.setLimit('RLIMIT_NPROC', this.config.maxProcesses);
    await this.setLimit('RLIMIT_NOFILE', 64);  // Max 64 open files
  }
}
```

### 3. Implement macOS Capture Sandbox

```typescript
// /packages/core/src/sandbox/darwin-capture-sandbox.ts
import { DarwinSandbox } from './darwin-sandbox.js';

export class DarwinCaptureSandbox extends DarwinSandbox {
  private config: CaptureSandboxConfig;
  
  constructor(config: CaptureSandboxConfig = DEFAULT_CAPTURE_SANDBOX) {
    super();
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    // Generate seatbelt profile
    const profile = this.generateSeatbeltProfile();
    
    // Apply sandbox
    await this.applySeatbeltProfile(profile);
    
    // Set resource limits
    await this.setResourceLimits();
  }
  
  private generateSeatbeltProfile(): string {
    return `
      (version 1)
      
      ; Deny everything by default
      (deny default)
      
      ; Allow basic operations
      (allow process-exec (with no-sandbox))
      (allow process-fork)
      
      ; File system - read only system paths
      (allow file-read*
        (subpath "/usr")
        (subpath "/System")
        (subpath "/Library")
        (subpath "/private/var/db/dyld"))
      
      ; Temp directory access
      (allow file-read* file-write*
        (subpath "/tmp")
        (regex #"^/tmp/capture-.*$"))
      
      ; Block sensitive areas
      (deny file-read* file-write*
        (subpath "/etc")
        (subpath "/Users")
        (subpath "/private/var/root"))
      
      ; Network - deny all
      (deny network*)
      
      ; Display/Graphics access for capture
      (allow iokit-open-service
        (iokit-registry-entry-class "IOFramebuffer"))
      
      ; CoreGraphics for screen capture
      (allow user-preference-read
        (preference-domain "com.apple.coregraphics"))
      
      ; Mach IPC - restrict to known services
      (allow mach-lookup
        (global-name "com.apple.coregraphics"))
    `;
  }
}
```

### 4. Create Capture Process Wrapper

```typescript
// /packages/core/src/body/capture-process.ts
export class CaptureProcess {
  private sandbox: Sandbox;
  private child: ChildProcess | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  
  constructor(
    private scope: CaptureScope,
    private sandboxConfig: CaptureSandboxConfig
  ) {
    this.sandbox = this.createSandbox();
  }
  
  async start(): Promise<void> {
    // Initialize sandbox
    await this.sandbox.initialize();
    
    // Spawn capture process in sandbox
    this.child = spawn('capture-engine', [], {
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.getSanitizedEnv()
    });
    
    // Apply sandbox to child process
    await this.sandbox.applyToProcess(this.child.pid!);
    
    // Set timeout
    this.timeoutId = setTimeout(() => {
      this.terminate('timeout');
    }, this.sandboxConfig.maxDuration * 1000);
    
    // Monitor process
    this.monitorProcess();
  }
  
  async capture(): Promise<Buffer> {
    if (!this.child) {
      throw new Error('Capture process not started');
    }
    
    // Send capture command
    this.child.stdin!.write(JSON.stringify({
      action: 'capture',
      scope: this.scope
    }) + '\n');
    
    // Read result
    const result = await this.readResult();
    
    return result.data;
  }
  
  async terminate(reason: string): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    if (this.child) {
      // Try graceful shutdown first
      this.child.kill('SIGTERM');
      
      // Force kill after grace period
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill('SIGKILL');
        }
      }, 5000);
    }
    
    // Audit log termination
    await auditLogger.logCaptureEvent({
      eventType: 'capture.stopped',
      result: { success: true, reason },
      // ... other fields
    });
  }
  
  private monitorProcess(): void {
    if (!this.child) return;
    
    this.child.on('exit', (code, signal) => {
      if (code !== 0 && signal !== 'SIGTERM') {
        // Unexpected exit - security concern
        auditLogger.logCaptureEvent({
          eventType: 'capture.failed',
          result: { success: false, error: `Process exited with code ${code}, signal ${signal}` },
          // ... other fields
        });
      }
    });
    
    // Monitor resource usage
    setInterval(async () => {
      if (!this.child) return;
      
      const usage = await this.getResourceUsage(this.child.pid!);
      
      if (usage.memory > this.sandboxConfig.maxMemory * 1024 * 1024) {
        await this.terminate('memory_limit_exceeded');
      }
      
      if (usage.cpu > this.sandboxConfig.maxCpuPercent) {
        await this.terminate('cpu_limit_exceeded');
      }
    }, 1000);
  }
}
```

### 5. Implement Secure IPC

```typescript
// /packages/core/src/body/capture-ipc.ts
export class SecureIPC {
  private encryptionKey: CryptoKey;
  
  async initialize(): Promise<void> {
    // Generate ephemeral key for this session
    this.encryptionKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,  // Not extractable
      ['encrypt', 'decrypt']
    );
  }
  
  async send(message: IPCMessage): Promise<void> {
    const encrypted = await this.encrypt(message);
    this.channel.write(encrypted);
  }
  
  async receive(): Promise<IPCMessage> {
    const encrypted = await this.channel.read();
    return this.decrypt(encrypted);
  }
  
  private async encrypt(message: IPCMessage): Promise<Buffer> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(message));
    
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      encoded
    );
    
    return Buffer.concat([Buffer.from(iv), Buffer.from(ciphertext)]);
  }
}
```

### 6. Add Sandbox Escape Detection

```typescript
// Monitor for sandbox escape attempts
export class SandboxMonitor {
  async checkIntegrity(): Promise<IntegrityReport> {
    const checks = await Promise.all([
      this.checkNamespaceIsolation(),
      this.checkSeccompEnforcement(),
      this.checkFilesystemIsolation(),
      this.checkNetworkIsolation(),
      this.checkProcessIsolation()
    ]);
    
    return {
      allPassed: checks.every(c => c.passed),
      checks,
      timestamp: Date.now()
    };
  }
  
  private async checkNamespaceIsolation(): Promise<CheckResult> {
    // Verify process is in separate namespaces
    const pid = process.pid;
    const namespaces = await readFile(`/proc/${pid}/ns/*`);
    // Compare with parent namespaces...
    
    return { passed: true, name: 'namespace_isolation' };
  }
  
  private async checkSeccompEnforcement(): Promise<CheckResult> {
    // Try to execute a blocked syscall
    try {
      await this.tryBlockedSyscall();
      return { passed: false, name: 'seccomp_enforcement', error: 'Blocked syscall succeeded' };
    } catch {
      return { passed: true, name: 'seccomp_enforcement' };
    }
  }
}
```

---

## Deliverables

- [ ] `/packages/core/src/sandbox/capture-sandbox.ts` — Capture sandbox types
- [ ] `/packages/core/src/sandbox/linux-capture-sandbox.ts` — Linux implementation
- [ ] `/packages/core/src/sandbox/darwin-capture-sandbox.ts` — macOS implementation
- [ ] `/packages/core/src/body/capture-process.ts` — Capture process wrapper
- [ ] `/packages/core/src/body/capture-ipc.ts` — Secure IPC channel
- [ ] `/packages/core/src/sandbox/monitor.ts` — Sandbox escape detection
- [ ] Unit tests for sandbox profiles
- [ ] Integration tests for process isolation

---

## Security Considerations

1. **Minimal privileges** — Sandbox has only what's needed for capture
2. **No network** — Capture process cannot access network
3. **Time limits** — Auto-terminate after max duration
4. **Resource limits** — Prevent DoS via resource exhaustion
5. **Seccomp** — Block dangerous syscalls
6. **Filesystem isolation** — Read-only system, temp writes only
7. **IPC encryption** — All communication encrypted
8. **Escape detection** — Monitor for sandbox bypass attempts

---

## Success Criteria

- [ ] Capture process runs in isolated namespace
- [ ] Seccomp blocks unauthorized syscalls
- [ ] Filesystem access restricted to temp directory
- [ ] Network access denied
- [ ] Resource limits enforced (memory, CPU, time)
- [ ] IPC encrypted
- [ ] Sandbox escape attempts detected
- [ ] 100% test coverage of sandbox logic

