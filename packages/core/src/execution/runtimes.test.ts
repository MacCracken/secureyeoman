import { describe, it, expect } from 'vitest';
import { NodeRuntime, PythonRuntime, ShellRuntime } from './runtimes.js';

// ── NodeRuntime.validateCode ─────────────────────────────────────────

describe('NodeRuntime.validateCode', () => {
  const runtime = new NodeRuntime();

  it('accepts safe code', () => {
    const result = runtime.validateCode('console.log("Hello, world!")');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('blocks require("child_process")', () => {
    const result = runtime.validateCode("const cp = require('child_process');");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('blocks process.exit', () => {
    const result = runtime.validateCode('process.exit(0);');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('dangerous');
  });

  it('blocks execSync', () => {
    const result = runtime.validateCode('execSync("ls")');
    expect(result.valid).toBe(false);
  });

  it('blocks spawnSync', () => {
    const result = runtime.validateCode('spawnSync("ls", [])');
    expect(result.valid).toBe(false);
  });

  it('blocks fs.rmSync', () => {
    const result = runtime.validateCode('fs.rmSync("/tmp/file")');
    expect(result.valid).toBe(false);
  });

  it('blocks fs.unlinkSync', () => {
    const result = runtime.validateCode('fs.unlinkSync("/tmp/file")');
    expect(result.valid).toBe(false);
  });

  it('accumulates multiple errors', () => {
    const code = "require('child_process'); process.exit(1);";
    const result = runtime.validateCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('has runtime name "node"', () => {
    expect(runtime.name).toBe('node');
  });
});

// ── PythonRuntime.validateCode ───────────────────────────────────────

describe('PythonRuntime.validateCode', () => {
  const runtime = new PythonRuntime();

  it('accepts safe code', () => {
    const result = runtime.validateCode('print("Hello, world!")');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('blocks os.system', () => {
    const result = runtime.validateCode('os.system("ls")');
    expect(result.valid).toBe(false);
  });

  it('blocks subprocess', () => {
    const result = runtime.validateCode('import subprocess; subprocess.run(["ls"])');
    expect(result.valid).toBe(false);
  });

  it('blocks __import__', () => {
    const result = runtime.validateCode('mod = __import__("os")');
    expect(result.valid).toBe(false);
  });

  it('blocks eval()', () => {
    const result = runtime.validateCode('eval("import os")');
    expect(result.valid).toBe(false);
  });

  it('blocks exec()', () => {
    const result = runtime.validateCode('exec("import os")');
    expect(result.valid).toBe(false);
  });

  it('blocks shutil.rmtree', () => {
    const result = runtime.validateCode('shutil.rmtree("/tmp/dir")');
    expect(result.valid).toBe(false);
  });

  it('has runtime name "python"', () => {
    expect(runtime.name).toBe('python');
  });
});

// ── ShellRuntime.validateCode ────────────────────────────────────────

describe('ShellRuntime.validateCode', () => {
  const runtime = new ShellRuntime();

  it('accepts safe code', () => {
    const result = runtime.validateCode('echo "Hello"');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('blocks rm -rf /', () => {
    const result = runtime.validateCode('rm -rf /');
    expect(result.valid).toBe(false);
  });

  it('blocks mkfs', () => {
    const result = runtime.validateCode('mkfs.ext4 /dev/sda1');
    expect(result.valid).toBe(false);
  });

  it('blocks dd if=', () => {
    const result = runtime.validateCode('dd if=/dev/zero of=/dev/sda');
    expect(result.valid).toBe(false);
  });

  it('blocks fork bomb', () => {
    const result = runtime.validateCode(':() { :|:& }; :');
    expect(result.valid).toBe(false);
  });

  it('blocks writing to /dev/sd*', () => {
    // Pattern requires word boundary before > (e.g., no space between word and >)
    const result = runtime.validateCode('cmd>/dev/sda');
    expect(result.valid).toBe(false);
  });

  it('has runtime name "shell"', () => {
    expect(runtime.name).toBe('shell');
  });
});

// ── cleanup (no-op) ──────────────────────────────────────────────────

describe('runtime cleanup', () => {
  it('NodeRuntime.cleanup resolves without error', async () => {
    const runtime = new NodeRuntime();
    await expect(runtime.cleanup({} as any)).resolves.toBeUndefined();
  });

  it('PythonRuntime.cleanup resolves without error', async () => {
    const runtime = new PythonRuntime();
    await expect(runtime.cleanup({} as any)).resolves.toBeUndefined();
  });

  it('ShellRuntime.cleanup resolves without error', async () => {
    const runtime = new ShellRuntime();
    await expect(runtime.cleanup({} as any)).resolves.toBeUndefined();
  });
});
