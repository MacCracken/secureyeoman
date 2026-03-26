/**
 * Native Module Loader — conditional import of Rust napi-rs addon.
 *
 * Auto-detects the compiled .node addon at startup.
 * Falls back gracefully when native module is unavailable.
 *
 * Disable native module: SECUREYEOMAN_NO_NATIVE=1
 */

import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export interface NativeModule {
  // Hashing
  sha256(data: Buffer): string;
  md5(data: Buffer): string;

  // HMAC
  hmacSha256(data: Buffer, key: Buffer): string;

  // Comparison
  secureCompare(a: Buffer, b: Buffer): boolean;

  // AES-256-GCM
  aes256GcmEncrypt(plaintext: Buffer, key: Buffer, iv: Buffer): Buffer;
  aes256GcmDecrypt(ciphertext: Buffer, key: Buffer, iv: Buffer): Buffer;

  // X25519
  x25519Keypair(): { privateKey: Buffer; publicKey: Buffer };
  x25519DiffieHellman(privateKey: Buffer, publicKey: Buffer): Buffer;

  // Ed25519
  ed25519Keypair(): { privateKey: Buffer; publicKey: Buffer };
  ed25519Sign(data: Buffer, privateKey: Buffer): Buffer;
  ed25519Verify(data: Buffer, signature: Buffer, publicKey: Buffer): boolean;

  // HKDF
  hkdfSha256(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer;

  // Random
  randomBytes(length: number): Buffer;

  // Hardware probing
  probeAccelerators(): string;
  probeAcceleratorsByFamily(family: string): string;

  // DLP classification
  classifyText(text: string): string;
  classifyTextBatch(texts: string[]): string;

  // Bhava personality engine
  bhavaCreateProfile(name: string, traitsJson: string): string;
  bhavaComposeTraitPrompt(traitsJson: string): string;
  bhavaProfileCompatibility(aJson: string, bJson: string): number;
  bhavaProfileToMarkdown(name: string, traitsJson: string): string;
  bhavaProfileFromMarkdown(markdown: string): string;
  bhavaListPresets(): string;
  bhavaGetPreset(id: string): string;
  bhavaComposePreamble(): string;
  bhavaComposeIdentityPrompt(identityJson: string): string;
  bhavaCreateEmotionalState(): string;
  bhavaCreateEmotionalStateWithBaseline(traitsJson: string): string;
  bhavaDeriveBaseline(traitsJson: string): string;
  bhavaStimulate(stateJson: string, emotion: string, intensity: number): string;
  bhavaApplyDecay(stateJson: string): string;
  bhavaClassifyMood(stateJson: string): string;
  bhavaMoodDeviation(stateJson: string): number;
  bhavaComposeMoodPrompt(stateJson: string): string;
  bhavaActionTendency(stateJson: string): string;
  bhavaCreateSpirit(): string;
  bhavaSpiritFromData(passionsJson: string, inspirationsJson: string, painsJson: string): string;
  bhavaComposeSpiritPrompt(spiritJson: string): string;
  bhavaApplySentimentFeedback(text: string, stateJson: string, scale: number): string;
  bhavaFeedbackFromOutcome(stateJson: string, outcome: string): string;
  bhavaSelectReasoningStrategy(traitsJson: string): string;
  bhavaComposeReasoningPrompt(traitsJson: string): string;
  bhavaDeriveEq(traitsJson: string): string;
  bhavaComposeEqPrompt(traitsJson: string): string;
  bhavaComposeSystemPrompt(
    traitsJson: string,
    identityJson: string,
    stateJson: string,
    spiritText: string
  ): string;
  bhavaBuildMetadata(name: string, traitsJson: string, stateJson: string): string;

  // Majra pub/sub
  majraMatchesPattern(pattern: string, topic: string): boolean;
  majraPublish(topic: string, payloadJson: string): number;
  majraSubscribe(pattern: string, callback: (message: string) => void): void;
  majraUnsubscribeAll(pattern: string): void;
  majraPatternCount(): number;
  majraMessagesPublished(): number;
  majraCleanupDead(): number;
  majraRatelimitRegister(ruleName: string, windowMs: number, maxRequests: number): void;
  majraRatelimitCheck(ruleName: string, key: string): string;
  majraRatelimitEvict(ruleName: string, maxIdleMs: number): number;
  majraRatelimitStats(ruleName: string): string | null;
  majraRatelimitRemove(ruleName: string): boolean;
  majraHeartbeatRegister(id: string, metadataJson: string): void;
  majraHeartbeat(id: string): boolean;
  majraHeartbeatDeregister(id: string): boolean;
  majraHeartbeatUpdate(): string;
  majraHeartbeatGet(id: string): string | null;
  majraHeartbeatList(status: string): string;
  majraHeartbeatCount(): number;
  majraBarrierCreate(name: string, participantsJson: string): void;
  majraBarrierArrive(name: string, participant: string): string;
  majraBarrierForce(name: string, deadParticipant: string): string;
  majraBarrierComplete(name: string): string | null;
  majraBarrierCount(): number;
  majraQueueEnqueue(priority: string, payloadJson: string): string;
  majraQueueDequeue(): string | null;
  majraQueueComplete(jobId: string): boolean;
  majraQueueFail(jobId: string): boolean;
  majraQueueCancel(jobId: string): boolean;
  majraQueueGet(jobId: string): string | null;
  majraQueueRunningCount(): number;
  majraQueueJobCount(): number;

  // AgnosAI orchestration engine
  agnosaiRunCrew(specJson: string): Promise<string>;
  agnosaiCancelCrew(crewId: string): Promise<void>;
  agnosaiValidateCrew(specJson: string): string;
  agnosaiScheduleTasks(tasksJson: string): string;
  agnosaiTopologicalSort(tasksJson: string): string;
  agnosaiRouteModel(taskType: string, complexity: string): string;
  agnosaiRankAgents(agentsJson: string, taskJson: string): string;
  agnosaiCreateAgentDef(profileJson: string): string;
  agnosaiListBuiltinTools(): string;
  agnosaiUcb1Select(armsJson: string): string;
}

let _native: NativeModule | null = null;
let _loaded = false;

function tryLoad(): NativeModule | null {
  if (_loaded) return _native;
  _loaded = true;

  // Environment override
  if (process.env.SECUREYEOMAN_NO_NATIVE === '1') {
    return null;
  }

  // Bun compiled binary — napi compatibility is limited
  if (typeof (globalThis as Record<string, unknown>).Bun !== 'undefined') {
    return null;
  }

  const require = createRequire(import.meta.url);

  // Candidate paths for the .node addon
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const candidates = [
    // napi-rs convention: <package>/native/sy-napi.<platform>.node
    join(__dirname, '..', '..', 'native', 'sy-napi.node'),
    // Fallback: direct .node in native/
    join(__dirname, '..', '..', 'native', 'libsy_napi.node'),
    // Development: cargo build output copied to native/
    join(__dirname, '..', '..', 'native', 'sy_napi.node'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const mod = require(candidate) as NativeModule;
        _native = mod;
        return _native;
      } catch {
        // Failed to load this candidate, try next
      }
    }
  }

  return null;
}

/**
 * The native Rust module, or null if unavailable.
 * Loaded lazily on first access.
 */
export const native: NativeModule | null = tryLoad();

/**
 * Whether the native module is loaded and active.
 */
export const nativeAvailable: boolean = native !== null;
