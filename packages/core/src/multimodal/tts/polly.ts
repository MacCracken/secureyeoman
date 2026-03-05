/**
 * AWS Polly TTS Provider
 *
 * Calls Amazon Polly's SynthesizeSpeech endpoint for text-to-speech.
 * Supports 60+ languages, Neural Text-To-Speech (NTTS) voices, and
 * SSML for prosody control. Per-personality voice ID stored in personality settings.
 *
 * Required env vars:
 *   - POLLY_REGION (e.g. us-east-1)
 *   - AWS_ACCESS_KEY_ID
 *   - AWS_SECRET_ACCESS_KEY
 *   - AWS_SESSION_TOKEN (optional, for temporary credentials)
 *
 * Optional env vars:
 *   - POLLY_VOICE_ID — default voice (e.g. Joanna, Matthew, Aria)
 *   - POLLY_ENGINE — 'neural' (default) or 'standard' or 'long-form' or 'generative'
 *   - POLLY_LEXICON_NAMES — comma-separated lexicon names to apply
 */

import { createHmac, createHash } from 'node:crypto';

const FETCH_TIMEOUT_MS = 30_000;

/** Well-known Polly voices by name → voice ID and language. */
export const POLLY_VOICES: Record<
  string,
  { voiceId: string; languageCode: string; gender: string; engines: string[] }
> = {
  // English (US)
  joanna: {
    voiceId: 'Joanna',
    languageCode: 'en-US',
    gender: 'Female',
    engines: ['neural', 'standard', 'long-form'],
  },
  matthew: {
    voiceId: 'Matthew',
    languageCode: 'en-US',
    gender: 'Male',
    engines: ['neural', 'standard', 'long-form'],
  },
  ruth: {
    voiceId: 'Ruth',
    languageCode: 'en-US',
    gender: 'Female',
    engines: ['neural', 'long-form', 'generative'],
  },
  stephen: {
    voiceId: 'Stephen',
    languageCode: 'en-US',
    gender: 'Male',
    engines: ['neural', 'long-form', 'generative'],
  },
  ivy: { voiceId: 'Ivy', languageCode: 'en-US', gender: 'Female', engines: ['neural', 'standard'] },
  kendra: {
    voiceId: 'Kendra',
    languageCode: 'en-US',
    gender: 'Female',
    engines: ['neural', 'standard'],
  },
  kimberly: {
    voiceId: 'Kimberly',
    languageCode: 'en-US',
    gender: 'Female',
    engines: ['neural', 'standard'],
  },
  salli: {
    voiceId: 'Salli',
    languageCode: 'en-US',
    gender: 'Female',
    engines: ['neural', 'standard'],
  },
  joey: { voiceId: 'Joey', languageCode: 'en-US', gender: 'Male', engines: ['neural', 'standard'] },
  justin: {
    voiceId: 'Justin',
    languageCode: 'en-US',
    gender: 'Male',
    engines: ['neural', 'standard'],
  },
  kevin: {
    voiceId: 'Kevin',
    languageCode: 'en-US',
    gender: 'Male',
    engines: ['neural', 'standard'],
  },
  // English (UK)
  amy: {
    voiceId: 'Amy',
    languageCode: 'en-GB',
    gender: 'Female',
    engines: ['neural', 'standard', 'generative'],
  },
  emma: {
    voiceId: 'Emma',
    languageCode: 'en-GB',
    gender: 'Female',
    engines: ['neural', 'standard'],
  },
  brian: {
    voiceId: 'Brian',
    languageCode: 'en-GB',
    gender: 'Male',
    engines: ['neural', 'standard'],
  },
  arthur: { voiceId: 'Arthur', languageCode: 'en-GB', gender: 'Male', engines: ['neural'] },
  // English (AU)
  olivia: { voiceId: 'Olivia', languageCode: 'en-AU', gender: 'Female', engines: ['neural'] },
  // English (IN)
  kajal: { voiceId: 'Kajal', languageCode: 'en-IN', gender: 'Female', engines: ['neural'] },
  // Spanish
  lupe: {
    voiceId: 'Lupe',
    languageCode: 'es-US',
    gender: 'Female',
    engines: ['neural', 'standard'],
  },
  pedro: { voiceId: 'Pedro', languageCode: 'es-US', gender: 'Male', engines: ['neural'] },
  lucia: {
    voiceId: 'Lucia',
    languageCode: 'es-ES',
    gender: 'Female',
    engines: ['neural', 'standard'],
  },
  sergio: { voiceId: 'Sergio', languageCode: 'es-ES', gender: 'Male', engines: ['neural'] },
  mia: { voiceId: 'Mia', languageCode: 'es-MX', gender: 'Female', engines: ['neural', 'standard'] },
  andres: { voiceId: 'Andres', languageCode: 'es-MX', gender: 'Male', engines: ['neural'] },
  // French
  lea: { voiceId: 'Lea', languageCode: 'fr-FR', gender: 'Female', engines: ['neural', 'standard'] },
  remi: { voiceId: 'Remi', languageCode: 'fr-FR', gender: 'Male', engines: ['neural'] },
  // German
  vicki: {
    voiceId: 'Vicki',
    languageCode: 'de-DE',
    gender: 'Female',
    engines: ['neural', 'standard'],
  },
  daniel: { voiceId: 'Daniel', languageCode: 'de-DE', gender: 'Male', engines: ['neural'] },
  // Italian
  bianca: {
    voiceId: 'Bianca',
    languageCode: 'it-IT',
    gender: 'Female',
    engines: ['neural', 'standard'],
  },
  adriano: { voiceId: 'Adriano', languageCode: 'it-IT', gender: 'Male', engines: ['neural'] },
  // Portuguese (BR)
  camila: {
    voiceId: 'Camila',
    languageCode: 'pt-BR',
    gender: 'Female',
    engines: ['neural', 'standard'],
  },
  thiago: { voiceId: 'Thiago', languageCode: 'pt-BR', gender: 'Male', engines: ['neural'] },
  // Japanese
  kazuha: { voiceId: 'Kazuha', languageCode: 'ja-JP', gender: 'Female', engines: ['neural'] },
  tomoko: { voiceId: 'Tomoko', languageCode: 'ja-JP', gender: 'Female', engines: ['neural'] },
  takumi: {
    voiceId: 'Takumi',
    languageCode: 'ja-JP',
    gender: 'Male',
    engines: ['neural', 'standard'],
  },
  // Korean
  seoyeon: {
    voiceId: 'Seoyeon',
    languageCode: 'ko-KR',
    gender: 'Female',
    engines: ['neural', 'standard'],
  },
  // Chinese (Mandarin)
  zhiyu: {
    voiceId: 'Zhiyu',
    languageCode: 'cmn-CN',
    gender: 'Female',
    engines: ['neural', 'standard'],
  },
  // Arabic
  hala: { voiceId: 'Hala', languageCode: 'ar-AE', gender: 'Female', engines: ['neural'] },
  zayd: { voiceId: 'Zayd', languageCode: 'ar-AE', gender: 'Male', engines: ['neural'] },
  // Hindi
  aditi: { voiceId: 'Aditi', languageCode: 'hi-IN', gender: 'Female', engines: ['standard'] },
  // Dutch
  laura: { voiceId: 'Laura', languageCode: 'nl-NL', gender: 'Female', engines: ['neural'] },
  // Swedish
  elin: { voiceId: 'Elin', languageCode: 'sv-SE', gender: 'Female', engines: ['neural'] },
  // Norwegian
  ida: { voiceId: 'Ida', languageCode: 'nb-NO', gender: 'Female', engines: ['neural'] },
  // Polish
  ola: { voiceId: 'Ola', languageCode: 'pl-PL', gender: 'Female', engines: ['neural'] },
  // Turkish
  burcu: { voiceId: 'Burcu', languageCode: 'tr-TR', gender: 'Female', engines: ['neural'] },
  // Russian
  tatyana: { voiceId: 'Tatyana', languageCode: 'ru-RU', gender: 'Female', engines: ['standard'] },
  maxim: { voiceId: 'Maxim', languageCode: 'ru-RU', gender: 'Male', engines: ['standard'] },
};

export interface PollyRequest {
  text: string;
  voice?: string;
  engine?: string;
  outputFormat?: string;
  lexiconNames?: string[];
  ssml?: boolean;
}

function getAwsCredentials(): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
} {
  const region = process.env.POLLY_REGION;
  if (!region) throw new Error('POLLY_REGION environment variable is not set');

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables are required'
    );
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region,
  };
}

function signAwsRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string,
  credentials: ReturnType<typeof getAwsCredentials>,
  service: string
): Record<string, string> {
  const parsedUrl = new URL(url);
  const now = new Date();
  const dateStamp = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, '')
    .slice(0, 8);
  const amzDate =
    now
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, '')
      .slice(0, 15) + 'Z';

  const signedHeaders = { ...headers };
  signedHeaders['x-amz-date'] = amzDate;
  signedHeaders.host = parsedUrl.host;
  if (credentials.sessionToken) {
    signedHeaders['x-amz-security-token'] = credentials.sessionToken;
  }

  const sortedHeaderKeys = Object.keys(signedHeaders)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = sortedHeaderKeys
    .map(
      (k) =>
        `${k}:${signedHeaders[Object.keys(signedHeaders).find((h) => h.toLowerCase() === k)!]?.trim()}`
    )
    .join('\n');
  const signedHeadersStr = sortedHeaderKeys.join(';');

  const payloadHash = createHash('sha256').update(body).digest('hex');

  const canonicalRequest = [
    method,
    parsedUrl.pathname,
    parsedUrl.search.slice(1),
    canonicalHeaders + '\n',
    signedHeadersStr,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${credentials.region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const signingKey = getSignatureKey(
    credentials.secretAccessKey,
    dateStamp,
    credentials.region,
    service
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  signedHeaders.Authorization =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  return signedHeaders;
}

function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update(service).digest();
  return createHmac('sha256', kService).update('aws4_request').digest();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Resolve a voice name/ID to a Polly voice ID.
 * Accepts: voice name (case-insensitive), direct Polly voice ID, or OpenAI-style voice names.
 */
export function resolvePollyVoice(voiceName?: string): { voiceId: string; languageCode?: string } {
  const defaultVoice = process.env.POLLY_VOICE_ID ?? 'Joanna';

  if (!voiceName || voiceName === 'alloy') {
    // Map OpenAI default to Polly default
    return { voiceId: defaultVoice };
  }

  // Check our known voices map (case-insensitive)
  const known = POLLY_VOICES[voiceName.toLowerCase()];
  if (known) {
    return { voiceId: known.voiceId, languageCode: known.languageCode };
  }

  // Assume it's a direct Polly voice ID (e.g. "Joanna", "Matthew")
  return { voiceId: voiceName };
}

/**
 * Synthesize speech using AWS Polly's SynthesizeSpeech API.
 */
export async function synthesizeViaPolly(
  request: PollyRequest
): Promise<{ audioBase64: string; format: string }> {
  const creds = getAwsCredentials();
  const endpoint = `https://polly.${creds.region}.amazonaws.com/v1/speech`;

  const { voiceId, languageCode } = resolvePollyVoice(request.voice);
  const engine = request.engine ?? process.env.POLLY_ENGINE ?? 'neural';
  const outputFormat = request.outputFormat ?? 'mp3';

  // Determine text type and build the input
  let textType: 'ssml' | 'text' = 'text';
  let inputText = request.text;

  if (request.ssml || inputText.trim().startsWith('<speak>')) {
    textType = 'ssml';
  } else {
    // Wrap in SSML for better prosody control
    inputText = escapeXml(inputText);
  }

  const body: Record<string, unknown> = {
    Engine: engine,
    OutputFormat: outputFormat,
    Text: textType === 'ssml' ? inputText : inputText,
    TextType: textType,
    VoiceId: voiceId,
  };

  if (languageCode) {
    body.LanguageCode = languageCode;
  }

  // Apply lexicon names
  const lexiconNames =
    request.lexiconNames ??
    (process.env.POLLY_LEXICON_NAMES
      ? process.env.POLLY_LEXICON_NAMES.split(',').map((s) => s.trim())
      : undefined);
  if (lexiconNames?.length) {
    body.LexiconNames = lexiconNames;
  }

  const bodyStr = JSON.stringify(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const signedHeaders = signAwsRequest('POST', endpoint, headers, bodyStr, creds, 'polly');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: signedHeaders,
    body: bodyStr,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`AWS Polly error (${res.status}): ${errBody}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    audioBase64: Buffer.from(arrayBuffer).toString('base64'),
    format: outputFormat === 'ogg_vorbis' ? 'ogg' : outputFormat,
  };
}

// ── Lexicon Management ─────────────────────────────────────────────────────

/**
 * Upload a pronunciation lexicon to AWS Polly.
 * Lexicons use PLS (Pronunciation Lexicon Specification) XML format.
 */
export async function putLexicon(name: string, content: string): Promise<void> {
  const creds = getAwsCredentials();
  const endpoint = `https://polly.${creds.region}.amazonaws.com/v1/lexicons/${encodeURIComponent(name)}`;

  const body = JSON.stringify({ Content: content });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const signedHeaders = signAwsRequest('PUT', endpoint, headers, body, creds, 'polly');

  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: signedHeaders,
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`AWS Polly PutLexicon error (${res.status}): ${errBody}`);
  }
}

/**
 * List available Polly lexicons.
 */
export async function listLexicons(): Promise<
  { name: string; languageCode: string; lastModified: string }[]
> {
  const creds = getAwsCredentials();
  const endpoint = `https://polly.${creds.region}.amazonaws.com/v1/lexicons`;

  const headers: Record<string, string> = {};
  const signedHeaders = signAwsRequest('GET', endpoint, headers, '', creds, 'polly');

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: signedHeaders,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`AWS Polly ListLexicons error (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as {
    Lexicons: {
      Name: string;
      Attributes: { LanguageCode: string; LastModified: string };
    }[];
  };

  return (data.Lexicons ?? []).map((l) => ({
    name: l.Name,
    languageCode: l.Attributes.LanguageCode,
    lastModified: l.Attributes.LastModified,
  }));
}

/**
 * Describe available Polly voices, optionally filtered by language.
 */
export async function describeVoices(
  languageCode?: string
): Promise<
  { voiceId: string; name: string; gender: string; languageCode: string; engines: string[] }[]
> {
  const creds = getAwsCredentials();
  let endpoint = `https://polly.${creds.region}.amazonaws.com/v1/voices`;
  if (languageCode) {
    endpoint += `?LanguageCode=${encodeURIComponent(languageCode)}`;
  }

  const headers: Record<string, string> = {};
  const signedHeaders = signAwsRequest('GET', endpoint, headers, '', creds, 'polly');

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: signedHeaders,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`AWS Polly DescribeVoices error (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as {
    Voices: {
      Id: string;
      Name: string;
      Gender: string;
      LanguageCode: string;
      SupportedEngines: string[];
    }[];
  };

  return (data.Voices ?? []).map((v) => ({
    voiceId: v.Id,
    name: v.Name,
    gender: v.Gender,
    languageCode: v.LanguageCode,
    engines: v.SupportedEngines,
  }));
}
