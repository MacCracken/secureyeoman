/**
 * WebAuthn/FIDO2 Manager — passwordless and second-factor authentication.
 *
 * Supports hardware security keys and platform authenticators (Touch ID, Windows Hello).
 * Community tier — no license gate.
 *
 * Cryptographic verification uses node:crypto directly (no external dependency).
 */

import { randomBytes, createHash, createVerify } from 'node:crypto';
import { uuidv7 } from '../utils/crypto.js';
import type { WebAuthnStorage, WebAuthnCredentialRow } from './webauthn-storage.js';

// ── Configuration ────────────────────────────────────────────────────

export interface WebAuthnConfig {
  rpName: string;
  rpId: string;
  origin: string;
}

// ── Types ────────────────────────────────────────────────────────────

export interface RegistrationOptions {
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: 'public-key'; alg: number }[];
  timeout: number;
  excludeCredentials: { id: string; type: 'public-key' }[];
  authenticatorSelection: {
    residentKey: string;
    userVerification: string;
  };
  attestation: string;
}

export interface AuthenticationOptions {
  challenge: string;
  timeout: number;
  rpId: string;
  allowCredentials: { id: string; type: 'public-key'; transports?: string[] }[];
  userVerification: string;
}

export interface RegistrationResponse {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string; // base64url
    attestationObject: string; // base64url
  };
}

export interface AuthenticationResponse {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string; // base64url
    authenticatorData: string; // base64url
    signature: string; // base64url
  };
}

export interface VerifyRegistrationResult {
  verified: boolean;
  credential?: {
    credentialId: string;
    publicKey: string;
    counter: number;
  };
}

export interface VerifyAuthenticationResult {
  verified: boolean;
  credentialId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

/**
 * Parse CBOR-encoded attestation object.
 * Minimal parser for 'none' attestation — extracts authData from a CBOR map.
 * Does NOT handle all CBOR types; sufficient for WebAuthn 'none' attestation.
 */
function parseCborAttestationObject(buf: Buffer): { fmt: string; authData: Buffer } {
  // The attestation object is a CBOR map with keys: fmt, attStmt, authData.
  // For 'none' attestation the structure is predictable.
  // We use a minimal approach: find the authData by looking for the key in the CBOR stream.

  let offset = 0;

  // Expect a CBOR map (major type 5)
  const firstByte = buf[offset]!;
  const majorType = firstByte >> 5;
  if (majorType !== 5) {
    throw new Error(`Expected CBOR map, got major type ${majorType}`);
  }

  const mapLen = firstByte & 0x1f;
  offset += 1;

  let fmt = '';
  let authData: Buffer | null = null;

  for (let i = 0; i < mapLen; i++) {
    // Read text string key
    const keyByte = buf[offset]!;
    const keyMajor = keyByte >> 5;
    if (keyMajor !== 3) {
      throw new Error(`Expected CBOR text string key, got major type ${keyMajor}`);
    }
    const keyLen = keyByte & 0x1f;
    offset += 1;
    const key = buf.subarray(offset, offset + keyLen).toString('utf-8');
    offset += keyLen;

    if (key === 'fmt') {
      // Read text string value
      const valByte = buf[offset]!;
      const valLen = valByte & 0x1f;
      offset += 1;
      fmt = buf.subarray(offset, offset + valLen).toString('utf-8');
      offset += valLen;
    } else if (key === 'attStmt') {
      // For 'none' attestation, attStmt is an empty map: 0xa0
      const valByte = buf[offset]!;
      if (valByte === 0xa0) {
        offset += 1; // empty map
      } else {
        // Skip unknown value — for simplicity we bail
        throw new Error('Complex attStmt not supported; use none attestation');
      }
    } else if (key === 'authData') {
      // Read byte string (major type 2)
      const valByte = buf[offset]!;
      const valMajor = valByte >> 5;
      if (valMajor !== 2) {
        throw new Error(`Expected CBOR byte string for authData, got major type ${valMajor}`);
      }
      let dataLen = valByte & 0x1f;
      offset += 1;
      if (dataLen === 24) {
        dataLen = buf[offset]!;
        offset += 1;
      } else if (dataLen === 25) {
        dataLen = buf.readUInt16BE(offset);
        offset += 2;
      }
      authData = Buffer.from(buf.subarray(offset, offset + dataLen));
      offset += dataLen;
    } else {
      // Skip unknown key's value — simple skip not implemented for all types
      throw new Error(`Unexpected key in attestation object: ${key}`);
    }
  }

  if (!authData) {
    throw new Error('authData not found in attestation object');
  }

  return { fmt, authData };
}

/**
 * Parse authenticator data buffer.
 * Layout: rpIdHash (32) | flags (1) | counter (4) | [attestedCredData] | [extensions]
 */
function parseAuthenticatorData(authData: Buffer): {
  rpIdHash: Buffer;
  flags: number;
  counter: number;
  attestedCredentialData?: { credentialId: Buffer; publicKeyBytes: Buffer };
} {
  if (authData.length < 37) {
    throw new Error(`authenticatorData too short: ${authData.length} bytes`);
  }

  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32]!;
  const counter = authData.readUInt32BE(33);

  // Flag bit 6 (AT) = attested credential data present
  const hasAttestedCred = (flags & 0x40) !== 0;

  let attestedCredentialData: { credentialId: Buffer; publicKeyBytes: Buffer } | undefined;

  if (hasAttestedCred && authData.length > 37) {
    // aaguid (16) | credIdLen (2) | credentialId (credIdLen) | publicKey (CBOR, rest)
    const credIdLen = authData.readUInt16BE(53); // 32 + 1 + 4 + 16 = 53
    const credentialId = Buffer.from(authData.subarray(55, 55 + credIdLen));
    const publicKeyBytes = Buffer.from(authData.subarray(55 + credIdLen));
    attestedCredentialData = { credentialId, publicKeyBytes };
  }

  return { rpIdHash, flags, counter, attestedCredentialData };
}

/**
 * Extract a PEM public key from COSE-encoded public key bytes.
 * Supports EC2 (kty=2, alg=-7/ES256) and RSA (kty=3, alg=-257/RS256).
 * Returns a PEM string suitable for node:crypto createVerify.
 */
function coseToPublicKeyPem(coseBytes: Buffer): { pem: string; alg: number } {
  // Minimal CBOR map parser for COSE_Key
  let offset = 0;
  const firstByte = coseBytes[offset]!;
  const mapLen = firstByte & 0x1f;
  offset += 1;

  const entries = new Map<number, Buffer>();

  for (let i = 0; i < mapLen; i++) {
    // Read integer key (could be positive or negative)
    const keyByte = coseBytes[offset]!;
    const keyMajor = keyByte >> 5;
    let keyVal: number;

    if (keyMajor === 0) {
      // Positive integer
      keyVal = keyByte & 0x1f;
      offset += 1;
    } else if (keyMajor === 1) {
      // Negative integer: -1 - n
      keyVal = -1 - (keyByte & 0x1f);
      offset += 1;
    } else {
      throw new Error(`Unexpected CBOR major type ${keyMajor} for COSE key`);
    }

    // Read value — could be integer or byte string
    const valByte = coseBytes[offset]!;
    const valMajor = valByte >> 5;

    if (valMajor === 0) {
      // Positive integer
      const val = valByte & 0x1f;
      offset += 1;
      const buf = Buffer.alloc(1);
      buf[0] = val;
      entries.set(keyVal, buf);
    } else if (valMajor === 1) {
      // Negative integer
      const val = -1 - (valByte & 0x1f);
      offset += 1;
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(val);
      entries.set(keyVal, buf);
    } else if (valMajor === 2) {
      // Byte string
      let bLen = valByte & 0x1f;
      offset += 1;
      if (bLen === 24) {
        bLen = coseBytes[offset]!;
        offset += 1;
      } else if (bLen === 25) {
        bLen = coseBytes.readUInt16BE(offset);
        offset += 2;
      }
      const bData = Buffer.from(coseBytes.subarray(offset, offset + bLen));
      offset += bLen;
      entries.set(keyVal, bData);
    } else if (valMajor === 3) {
      // Text string — skip
      let tLen = valByte & 0x1f;
      offset += 1;
      if (tLen === 24) {
        tLen = coseBytes[offset]!;
        offset += 1;
      }
      offset += tLen;
      entries.set(keyVal, Buffer.alloc(0));
    } else {
      throw new Error(`Unsupported CBOR value type ${valMajor} in COSE key`);
    }
  }

  // COSE key type: 1 = kty, 3 = alg
  const ktyBuf = entries.get(1);
  const algBuf = entries.get(3);

  if (!ktyBuf || !algBuf) {
    throw new Error('Missing kty or alg in COSE key');
  }

  const kty = ktyBuf[0]!;
  const alg = algBuf.readInt32BE(0);

  if (kty === 2 && alg === -7) {
    // EC2 / ES256 (P-256)
    // -1 = crv (1 = P-256), -2 = x, -3 = y
    const x = entries.get(-2);
    const y = entries.get(-3);
    if (!x || !y) throw new Error('Missing x or y in EC2 COSE key');

    // Build uncompressed point: 0x04 || x || y
    const point = Buffer.concat([Buffer.from([0x04]), x, y]);

    // Wrap in SubjectPublicKeyInfo DER for P-256
    const ecOid = Buffer.from('301306072a8648ce3d020106082a8648ce3d030107', 'hex');
    const bitString = Buffer.concat([Buffer.from([0x00]), point]);
    const bitStringDer = Buffer.concat([Buffer.from([0x03, bitString.length]), bitString]);
    const spkiBody = Buffer.concat([ecOid, bitStringDer]);
    const spkiDer = Buffer.concat([Buffer.from([0x30, spkiBody.length]), spkiBody]);

    const pem =
      '-----BEGIN PUBLIC KEY-----\n' +
      spkiDer
        .toString('base64')
        .match(/.{1,64}/g)!
        .join('\n') +
      '\n-----END PUBLIC KEY-----';

    return { pem, alg };
  }

  if (kty === 3 && alg === -257) {
    // RSA / RS256
    // -1 = n (modulus), -2 = e (exponent)
    const n = entries.get(-1);
    const e = entries.get(-2);
    if (!n || !e) throw new Error('Missing n or e in RSA COSE key');

    // Build RSA SubjectPublicKeyInfo DER
    const encodeDerInt = (val: Buffer): Buffer => {
      // If high bit set, prepend 0x00
      const needsPad = val[0]! >= 0x80;
      const body = needsPad ? Buffer.concat([Buffer.from([0x00]), val]) : val;
      return Buffer.concat([Buffer.from([0x02]), derLength(body.length), body]);
    };

    const nDer = encodeDerInt(n);
    const eDer = encodeDerInt(e);
    const rsaPubKey = Buffer.concat([nDer, eDer]);
    const rsaSeq = Buffer.concat([Buffer.from([0x30]), derLength(rsaPubKey.length), rsaPubKey]);

    // Wrap in BIT STRING
    const bitStr = Buffer.concat([Buffer.from([0x00]), rsaSeq]);
    const bitStrDer = Buffer.concat([Buffer.from([0x03]), derLength(bitStr.length), bitStr]);

    // Algorithm identifier for RSA
    const rsaOid = Buffer.from('300d06092a864886f70d0101010500', 'hex');

    const spkiBody = Buffer.concat([rsaOid, bitStrDer]);
    const spkiDer = Buffer.concat([Buffer.from([0x30]), derLength(spkiBody.length), spkiBody]);

    const pem =
      '-----BEGIN PUBLIC KEY-----\n' +
      spkiDer
        .toString('base64')
        .match(/.{1,64}/g)!
        .join('\n') +
      '\n-----END PUBLIC KEY-----';

    return { pem, alg };
  }

  throw new Error(`Unsupported COSE key type: kty=${kty}, alg=${alg}`);
}

/** Encode a DER length field (supports lengths up to 65535). */
function derLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x100) return Buffer.from([0x81, len]);
  return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
}

// ── WebAuthn Manager ────────────────────────────────────────────────

export class WebAuthnManager {
  private storage: WebAuthnStorage;
  private rpName: string;
  private rpId: string;
  private origin: string;

  constructor(config: WebAuthnConfig & { storage: WebAuthnStorage }) {
    this.storage = config.storage;
    this.rpName = config.rpName;
    this.rpId = config.rpId;
    this.origin = config.origin;
  }

  // ── Registration ────────────────────────────────────────────────

  async generateRegistrationOptions(
    userId: string,
    userName: string,
    existingCredentialIds?: string[]
  ): Promise<RegistrationOptions> {
    const challenge = base64urlEncode(randomBytes(32));
    const id = uuidv7();

    await this.storage.storeChallenge(
      id,
      challenge,
      userId,
      'registration',
      Date.now() + CHALLENGE_TTL_MS
    );

    return {
      rp: { name: this.rpName, id: this.rpId },
      user: { id: userId, name: userName, displayName: userName },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      timeout: 60000,
      excludeCredentials: (existingCredentialIds ?? []).map((cid) => ({
        id: cid,
        type: 'public-key' as const,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      attestation: 'none',
    };
  }

  async verifyRegistration(
    challenge: string,
    response: RegistrationResponse
  ): Promise<VerifyRegistrationResult> {
    // 1. Look up and validate the challenge
    const stored = await this.storage.getChallenge(challenge);
    if (!stored) {
      return { verified: false };
    }

    if (stored.expires_at < Date.now()) {
      await this.storage.deleteChallenge(stored.id);
      return { verified: false };
    }

    // Clean up challenge (single-use)
    await this.storage.deleteChallenge(stored.id);

    // 2. Decode and validate clientDataJSON
    const clientDataJSON = base64urlDecode(response.response.clientDataJSON);
    const clientData = JSON.parse(clientDataJSON.toString('utf-8'));

    if (clientData.type !== 'webauthn.create') {
      return { verified: false };
    }

    if (clientData.challenge !== challenge) {
      return { verified: false };
    }

    if (clientData.origin !== this.origin) {
      return { verified: false };
    }

    // 3. Decode attestation object
    const attObjBuf = base64urlDecode(response.response.attestationObject);
    const { authData } = parseCborAttestationObject(attObjBuf);

    // 4. Parse authenticator data
    const parsed = parseAuthenticatorData(authData);

    // 5. Verify RP ID hash
    const expectedRpIdHash = createHash('sha256').update(this.rpId).digest();
    if (!parsed.rpIdHash.equals(expectedRpIdHash)) {
      return { verified: false };
    }

    // 6. Check user-present flag
    if ((parsed.flags & 0x01) === 0) {
      return { verified: false };
    }

    // 7. Extract credential data
    if (!parsed.attestedCredentialData) {
      return { verified: false };
    }

    const credentialId = base64urlEncode(parsed.attestedCredentialData.credentialId);
    const { pem } = coseToPublicKeyPem(parsed.attestedCredentialData.publicKeyBytes);

    // 8. Store the credential
    const credRow: WebAuthnCredentialRow = {
      id: uuidv7(),
      user_id: stored.user_id ?? '',
      credential_id: credentialId,
      public_key: pem,
      counter: parsed.counter,
      device_type: null,
      backed_up: (parsed.flags & 0x10) !== 0,
      transports: null,
      display_name: null,
      created_at: Date.now(),
      last_used_at: null,
    };

    await this.storage.storeCredential(credRow);

    return {
      verified: true,
      credential: {
        credentialId,
        publicKey: pem,
        counter: parsed.counter,
      },
    };
  }

  // ── Authentication ──────────────────────────────────────────────

  async generateAuthenticationOptions(userId?: string): Promise<AuthenticationOptions> {
    const challenge = base64urlEncode(randomBytes(32));
    const id = uuidv7();

    await this.storage.storeChallenge(
      id,
      challenge,
      userId ?? null,
      'authentication',
      Date.now() + CHALLENGE_TTL_MS
    );

    let allowCredentials: AuthenticationOptions['allowCredentials'] = [];

    if (userId) {
      const creds = await this.storage.getCredentialsByUser(userId);
      allowCredentials = creds.map((c) => ({
        id: c.credential_id,
        type: 'public-key' as const,
        transports: c.transports ?? undefined,
      }));
    }

    return {
      challenge,
      timeout: 60000,
      rpId: this.rpId,
      allowCredentials,
      userVerification: 'preferred',
    };
  }

  async verifyAuthentication(
    challenge: string,
    response: AuthenticationResponse
  ): Promise<VerifyAuthenticationResult> {
    // 1. Look up and validate the challenge
    const stored = await this.storage.getChallenge(challenge);
    if (!stored) {
      return { verified: false };
    }

    if (stored.expires_at < Date.now()) {
      await this.storage.deleteChallenge(stored.id);
      return { verified: false };
    }

    await this.storage.deleteChallenge(stored.id);

    // 2. Decode and validate clientDataJSON
    const clientDataJSON = base64urlDecode(response.response.clientDataJSON);
    const clientData = JSON.parse(clientDataJSON.toString('utf-8'));

    if (clientData.type !== 'webauthn.get') {
      return { verified: false };
    }

    if (clientData.challenge !== challenge) {
      return { verified: false };
    }

    if (clientData.origin !== this.origin) {
      return { verified: false };
    }

    // 3. Look up credential
    const credentialId = response.id;
    const credential = await this.storage.getCredential(credentialId);
    if (!credential) {
      return { verified: false };
    }

    // 4. Parse authenticator data
    const authDataBuf = base64urlDecode(response.response.authenticatorData);
    const parsed = parseAuthenticatorData(authDataBuf);

    // 5. Verify RP ID hash
    const expectedRpIdHash = createHash('sha256').update(this.rpId).digest();
    if (!parsed.rpIdHash.equals(expectedRpIdHash)) {
      return { verified: false };
    }

    // 6. Check user-present flag
    if ((parsed.flags & 0x01) === 0) {
      return { verified: false };
    }

    // 7. Counter validation (replay protection)
    if (parsed.counter > 0 || credential.counter > 0) {
      if (parsed.counter <= credential.counter) {
        return { verified: false };
      }
    }

    // 8. Verify signature
    // signatureBase = authenticatorData || SHA-256(clientDataJSON)
    const clientDataHash = createHash('sha256').update(clientDataJSON).digest();
    const signatureBase = Buffer.concat([authDataBuf, clientDataHash]);
    const signatureBuf = base64urlDecode(response.response.signature);

    // Determine algorithm from stored key
    const isEc =
      credential.public_key.includes('BEGIN PUBLIC KEY') && !credential.public_key.includes('RSA');
    const algorithm = isEc ? 'SHA256' : 'SHA256';
    const verifier = createVerify(algorithm);
    verifier.update(signatureBase);

    const signatureValid = verifier.verify(credential.public_key, signatureBuf);
    if (!signatureValid) {
      return { verified: false };
    }

    // 9. Update counter and last used
    await this.storage.updateCounter(credentialId, parsed.counter);
    await this.storage.updateLastUsed(credentialId);

    return { verified: true, credentialId };
  }

  // ── Credential management ───────────────────────────────────────

  async listCredentials(userId: string): Promise<WebAuthnCredentialRow[]> {
    return this.storage.getCredentialsByUser(userId);
  }

  async removeCredential(credentialId: string, userId?: string): Promise<number> {
    return this.storage.deleteCredential(credentialId, userId);
  }
}
