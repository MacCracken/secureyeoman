# Phase 7.3: Multimodal I/O — Implementation Plan

## Executive Summary

Expand FRIDAY beyond text to support rich media input (images, voice) and output (images, speech audio). Enable users to share screenshots, photos, voice messages, and receive AI-generated images and spoken responses.

**Complexity**: High | **Priority**: Medium | **Estimated Duration**: 5-6 weeks

---

## Goals

1. **Vision Processing**: Analyze images sent to FRIDAY (screenshots, photos, documents)
2. **Voice Input**: Transcribe voice messages for conversational input
3. **Voice Output**: Speak responses via TTS across integrations
4. **Image Generation**: Generate images via DALL-E/Stable Diffusion
5. **Document Understanding**: Extract text/structure from PDFs, documents

## Non-Goals

- Video input/output (future enhancement)
- Real-time video analysis
- Custom model fine-tuning
- Multi-modal conversation memory (separate effort)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     MultimodalManager                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │   Vision     │  │    Voice     │  │    ImageGen        │   │
│  │   Pipeline   │  │   Pipeline   │  │    Pipeline        │   │
│  └──────────────┘  └──────────────┘  └────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Integration Adapters                         │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │  │
│  │  │Telegram│ │Discord│ │ Slack │ │WhatsApp│ │ Web   │   │  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Vision Processing Pipeline

### Overview

Process images from any integration channel, extract visual context, and feed to the LLM for analysis.

### Supported Input Types

| Type | Description | Implementation |
|------|-------------|----------------|
| `image` | JPEG, PNG, GIF, WebP | Direct processing |
| `screenshot` | Screen captures | Priority processing |
| `document` | PDF (first page) | PDF → image conversion |
| `ocr` | Scanned documents | Tesseract preprocessing |

### Pipeline Stages

```typescript
interface VisionPipeline {
  stage1: 'receive'      // Receive from integration
  stage2: 'download'    // Download from URL/attachment
  stage3: 'validate'    // Check size, format, safety
  stage4: 'preprocess'  // Resize, optimize for model
  stage5: 'analyze'     // Call vision API
  stage6: 'extract'     // Parse and structure response
  stage7: 'context'     // Inject into conversation
}
```

### Vision Provider Abstraction

```typescript
interface VisionProvider {
  readonly name: string;
  readonly supportedModels: string[];
  
  analyze(image: VisionInput, options?: VisionOptions): Promise<VisionResult>;
}

interface VisionInput {
  type: 'url' | 'base64' | 'buffer';
  data: string | Buffer;
  mimeType: string;
}

interface VisionOptions {
  model?: string;
  maxTokens?: number;
  prompt?: string;      // Custom prompt override
  detail?: 'low' | 'high';
}

interface Vision' | 'autoResult {
  description: string;
  extractedText?: string;
  tags: string[];
  objects?: DetectedObject[];
  faces?: Face[];
  raw?: unknown;
}
```

### Supported Providers

| Provider | Models | Cost | Notes |
|----------|--------|------|-------|
| **Claude Vision** | claude-3-opus, claude-3-sonnet | Pay-per-token | Best overall |
| **GPT-4V** | gpt-4-turbo-vision, gpt-4o | Pay-per-token | Good for code |
| **Gemini Vision** | gemini-pro-vision | Pay-per-token | Fast, cheap |
| **Local** | Ollama vision models | Free | Limited capability |

### Configuration

```yaml
multimodal:
  vision:
    enabled: true
    defaultProvider: 'claude'  # claude, openai, gemini, ollama
    defaultModel: 'claude-3-sonnet-20240229'
    maxImageSize: 10485760     # 10MB
    maxImagesPerMessage: 5
    autoDescribe: true         # Always send description to LLM
    
    providers:
      claude:
        enabled: true
      openai:
        enabled: false
      gemini:
        enabled: false
      ollama:
        enabled: false
        endpoint: 'http://localhost:11434'
        model: 'llava'
```

### Tool Definition (MCP)

```typescript
const visionTools = [
  {
    name: 'analyze_image',
    description: 'Analyze an image to understand its contents, extract text, or identify objects',
    inputSchema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL or base64 of image' },
        prompt: { type: 'string', description: 'Specific question about the image' },
        detail_level: { type: 'string', enum: ['low', 'high', 'auto'], default: 'auto' }
      },
      required: ['image_url']
    }
  },
  {
    name: 'extract_text_from_image',
    description: 'Extract readable text from an image or screenshot using OCR',
    inputSchema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL or base64 of image' },
        language: { type: 'string', default: 'eng' }
      },
      required: ['image_url']
    }
  }
];
```

### Integration Handling

```typescript
interface ImageAttachment {
  url?: string;
  file_id?: string;     // Platform-specific file ID
  mimeType: string;
  width?: number;
  height?: number;
  thumbnail?: string;   // Base64 thumbnail
  
  // Extracted data
  description?: string;
  extractedText?: string;
}

// Modified UnifiedMessage
interface UnifiedMessage {
  // ... existing fields
  attachments?: MessageAttachment[];
  voiceData?: VoiceData;
}
```

---

## 2. Voice Input Pipeline

### Overview

Transcribe voice messages from integrations into text for conversational input.

### Supported Input Channels

| Platform | Voice Messages | Audio Files |
|----------|---------------|-------------|
| Telegram | ✅ Voice notes | ✅ Audio |
| Discord | ✅ Voice messages | ✅ Attachments |
| Slack | ✅ Audio files | ✅ |
| WhatsApp | ✅ Voice notes | ✅ Audio |
| Web | ✅ Browser recording | ✅ Upload |

### Pipeline Stages

```typescript
interface VoicePipeline {
  stage1: 'receive'       // Receive audio from integration
  stage2: 'download'      // Download/extract audio
  stage3: 'validate'      // Check format, duration
  stage4: 'preprocess'    // Convert to WAV if needed
  stage5: 'transcribe'   // Call STT API
  stage6: 'format'       // Clean up transcription
  stage7: 'inject'       // Add to conversation
}
```

### STT Provider Abstraction

```typescript
interface STTProvider {
  readonly name: string;
  readonly supportedLanguages: string[];
  readonly supportedFormats: string[];
  
  transcribe(audio: AudioInput, options?: STTOptions): Promise<STTResult>;
}

interface AudioInput {
  type: 'url' | 'buffer';
  data: string | Buffer;
  format: string;        // mp3, wav, ogg, m4a
  duration?: number;     // seconds
}

interface STTOptions {
  language?: string;     // auto-detect if not specified
  prompt?: string;       // Context for better transcription
  temperature?: number;
}

interface STTResult {
  text: string;
  confidence: number;
  language?: string;
  words?: WordTimestamp[];
  duration: number;
}
```

### Supported Providers

| Provider | Languages | Cost | Notes |
|----------|-----------|------|-------|
| **OpenAI Whisper** | 100+ | $0.006/min | Best accuracy |
| **Google STT** | 125+ | $0.024/min | Fast |
| **AssemblyAI** | 100+ | $0.025/min | Good features |
| **Local Whisper** | 100+ | Free | GPU required |

### Configuration

```yaml
multimodal:
  voice:
    enabled: true
    defaultProvider: 'openai'  # openai, google, assemblyai, local
    maxDuration: 300          # 5 minutes max
    autoTranscribe: true      # Always transcribe incoming voice
    
    providers:
      openai:
        enabled: true
        model: 'whisper-1'
        endpoint: 'https://api.openai.com/v1/audio/transcriptions'
      local:
        enabled: false
        model: 'medium'
        device: 'cuda'
```

### Tool Definition (MCP)

```typescript
const voiceTools = [
  {
    name: 'transcribe_audio',
    description: 'Convert speech in an audio file to text',
    inputSchema: {
      type: 'object',
      properties: {
        audio_url: { type: 'string', description: 'URL or base64 of audio file' },
        language: { type: 'string', description: 'Language code (auto-detect if not specified)' },
        prompt: { type: 'string', description: 'Context to improve transcription accuracy' }
      },
      required: ['audio_url']
    }
  }
];
```

---

## 3. Voice Output (TTS)

### Overview

Convert text responses to speech for delivery across integrations.

### Supported Output Channels

| Platform | TTS Support | Notes |
|----------|-----------|-------|
| Telegram | ✅ Voice messages | MP3 format |
| Discord | ✅ Voice channels | Streamed |
| Slack | ✅ Audio blocks | |
| WhatsApp | ✅ Voice notes | |
| Web | ✅ Browser TTS | |

### TTS Provider Abstraction

```typescript
interface TTSProvider {
  readonly name: string;
  readonly supportedVoices: Voice[];
  readonly supportedFormats: string[];
  
  speak(text: string, options?: TTSOptions): Promise<TTSResult>;
}

interface Voice {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  language: string;
}

interface TTSOptions {
  voice?: string;
  model?: string;           // For providers with multiple models
  speed?: number;           # 0.5 - 2.0
  pitch?: number;           # 0.5 - 2.0
  format?: 'mp3' | 'wav' | 'ogg';
}

interface TTSResult {
  audio: Buffer;
  format: string;
  duration: number;
  voice: Voice;
}
```

### Supported Providers

| Provider | Voices | Cost | Notes |
|----------|--------|------|-------|
| **OpenAI TTS** | 6 | $15/1M chars | High quality |
| **Google Cloud TTS** | 400+ | $4/1M chars | Many languages |
| **ElevenLabs** | Custom | $11/1M chars | Best expressiveness |
| **Browser TTS** | System | Free | No API needed |

### Voice Settings

```yaml
multimodal:
  tts:
    enabled: true
    defaultProvider: 'browser'  # openai, google, elevenlabs, browser
    defaultVoice: 'alloy'       # OpenAI voice
    
    providers:
      openai:
        enabled: false
        model: 'tts-1'
        voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
      elevenlabs:
        enabled: false
        api_key: '${ELEVENLABS_API_KEY}'
        voices: []  # Fetched from API
      browser:
        enabled: true
        rate: 1.0
        pitch: 1.0
        volume: 1.0
```

### Per-User Voice Preferences

```typescript
interface VoicePreference {
  userId: string;
  provider: string;
  voice: string;
  speed: number;
  language: string;
  autoSpeak: boolean;     # Auto-respond with TTS
  speakOnError: boolean;   # Speak error messages too
}
```

### Tool Definition (MCP)

```typescript
const ttsTools = [
  {
    name: 'text_to_speech',
    description: 'Convert text to spoken audio',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to convert to speech' },
        voice: { type: 'string', description: 'Voice to use' },
        speed: { type: 'number', description: 'Speech speed (0.5-2.0)', default: 1.0 },
        provider: { type: 'string', description: 'TTS provider to use' }
      },
      required: ['text']
    }
  }
];
```

---

## 4. Image Generation

### Overview

Generate images from text descriptions using DALL-E or Stable Diffusion.

### Supported Providers

| Provider | Models | Cost | Resolution |
|----------|--------|------|-------------|
| **DALL-E 3** | dall-e-3 | $0.04/image | 1024x1024 |
| **DALL-E 2** | dall-e-2 | $0.02/image | 1024x1024, 512x512 |
| **Stable Diffusion** | SDXL | $0.002/image | 1024x1024 |
| **Local** | SD WebUI API | Free | Configurable |

### Tool Definition (MCP)

```typescript
const imageGenTools = [
  {
    name: 'generate_image',
    description: 'Generate an image from a text description',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to generate' },
        model: { type: 'string', enum: ['dalle-3', 'dalle-2', 'stable-diffusion'], default: 'dalle-3' },
        size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'], default: '1024x1024' },
        quality: { type: 'string', enum: ['standard', 'hd'], default: 'standard' },
        style: { type: 'string', enum: ['natural', 'vivid', 'day', 'night'], default: 'vivid' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'edit_image',
    description: 'Edit an image by adding, removing, or changing elements',
    inputSchema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL of image to edit' },
        prompt: { type: 'string', description: 'Description of changes' },
        mask_url: { type: 'string', description: 'URL of mask image' }
      },
      required: ['image_url', 'prompt']
    }
  },
  {
    name: 'variate_image',
    description: 'Create variations of an existing image',
    inputSchema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL of image to vary' },
        size: { type: 'string', default: '1024x1024' }
      },
      required: ['image_url']
    }
  }
];
```

### Configuration

```yaml
multimodal:
  imageGeneration:
    enabled: true
    defaultProvider: 'openai'
    defaultModel: 'dalle-3'
    defaultSize: '1024x1024'
    maxPerDay: 50
    requireApproval: true
    
    providers:
      openai:
        enabled: true
        api_key: '${OPENAI_API_KEY}'
        organization: '${OPENAI_ORG}'
      stableDiffusion:
        enabled: false
        endpoint: 'http://localhost:7860'
```

### Delivery Integration

Generated images are sent as attachments across all platforms:

```typescript
interface ImageGenerationResult {
  url: string;           # Short-lived URL from provider
  revisedPrompt?: string; # DALL-E's refined prompt
  provider: string;
  model: string;
  generationId: string;
  width: number;
  height: number;
}
```

---

## 5. Document Understanding

### Overview

Extract structured information from PDF documents, scanned documents, and other file types.

### Supported Formats

| Format | Extraction | Notes |
|--------|-----------|-------|
| PDF | Text, images, tables | Multi-page supported |
| DOCX | Text, tables | Via mammoth |
| Excel | Tables, data | Via xlsx |
| Images | OCR, layout | Via vision pipeline |

### Tool Definition (MCP)

```typescript
const documentTools = [
  {
    name: 'extract_document_text',
    description: 'Extract readable text from a document (PDF, DOCX, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        document_url: { type: 'string', description: 'URL of document file' },
        pages: { type: 'string', description: 'Page range (e.g., "1-5")' }
      },
      required: ['document_url']
    }
  },
  {
    name: 'extract_document_structure',
    description: 'Extract structured data from documents (tables, forms)',
    inputSchema: {
      type: 'object',
      properties: {
        document_url: { type: 'string', description: 'URL of document' },
        schema: { type: 'string', description: 'JSON schema describing what to extract' }
      },
      required: ['document_url', 'schema']
    }
  }
];
```

---

## Integration Changes

### Telegram Adapter

```typescript
// Voice messages
async handleVoiceMessage(update: TelegramUpdate): Promise<UnifiedMessage> {
  const file = await this.bot.api.getFile(update.message.voice.file_id);
  const audioUrl = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`;
  const transcription = await this.multimodal.transcribe(audioUrl);
  
  return {
    type: 'voice',
    text: transcription.text,
    platform: 'telegram',
    userId: update.message.from.id.toString(),
    voiceData: {
      duration: update.message.voice.duration,
      transcription: transcription.text
    }
  };
}

// Photos
async handlePhoto(update: TelegramUpdate): Promise<UnifiedMessage> {
  const photo = update.message.photo[update.message.photo.length - 1];
  const file = await this.bot.api.getFile(photo.file_id);
  const imageUrl = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`;
  
  const visionResult = await this.multimodal.analyze(imageUrl);
  
  return {
    type: 'text',
    text: update.message.caption || visionResult.description,
    platform: 'telegram',
    attachments: [{
      type: 'image',
      url: imageUrl,
      mimeType: 'image/jpeg',
      description: visionResult.description,
      extractedText: visionResult.extractedText
    }]
  };
}
```

### Discord Adapter

```typescript
// Handle attachments (images, audio, documents)
async handleAttachment(message: DiscordMessage): Promise<UnifiedMessage> {
  for (const attachment of message.attachments) {
    if (attachment.contentType?.startsWith('image/')) {
      const visionResult = await this.multimodal.analyze(attachment.url);
      // Add to message with vision analysis
    }
    if (attachment.contentType?.startsWith('audio/')) {
      const sttResult = await this.multimodal.transcribe(attachment.url);
      // Add transcription to message
    }
  }
}
```

---

## Dashboard UI

### Multimodal Settings Page

**Vision Section**
- Enable/disable toggle
- Provider selector with test button
- Model selector per provider
- Image size limit slider
- Auto-describe toggle

**Voice Input Section**
- Enable/disable toggle
- Provider selector
- Max duration setting
- Language preference

**Voice Output Section**
- Enable/disable toggle
- Provider selector
- Voice selector with preview player
- Speed/pitch sliders
- Auto-speak toggle

**Image Generation Section**
- Enable/disable toggle
- Provider selector
- Model selector
- Daily limit setting
- Require approval toggle
- Cost display

### Visual Feedback

- Message bubbles show image thumbnails with description
- Voice messages show waveform + transcription
- TTS responses show speaker icon + audio player
- Generation progress with preview

---

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/multimodal/config` | Get multimodal config |
| `PATCH` | `/api/v1/multimodal/config` | Update config |
| `POST` | `/api/v1/multimodal/vision/analyze` | Analyze image |
| `POST` | `/api/v1/multimodal/voice/transcribe` | Transcribe audio |
| `POST` | `/api/v1/multimodal/tts/speak` | Generate speech |
| `POST` | `/api/v1/multimodal/image/generate` | Generate image |
| `GET` | `/api/v1/multimodal/voices` | List available TTS voices |

---

## Implementation Phases

### Phase 1: Infrastructure (Week 1)

- [ ] `MultimodalManager` class
- [ ] Provider abstractions (Vision, STT, TTS, ImageGen)
- [ ] Configuration schema
- [ ] SQLite storage for preferences

### Phase 2: Vision Pipeline (Week 2)

- [ ] Claude Vision integration
- [ ] GPT-4V integration
- [ ] Gemini Vision integration
- [ ] Integration adapters (Telegram, Discord, Slack, WhatsApp)
- [ ] MCP tools

### Phase 3: Voice Input (Week 2-3)

- [ ] Whisper integration
- [ ] Platform-specific audio handling
- [ ] Integration adapters
- [ ] MCP tools

### Phase 4: Voice Output (Week 3)

- [ ] OpenAI TTS integration
- [ ] Browser TTS for web dashboard
- [ ] Platform-specific audio delivery
- [ ] MCP tools

### Phase 5: Image Generation (Week 4)

- [ ] DALL-E integration
- [ ] Image delivery across platforms
- [ ] MCP tools

### Phase 6: Dashboard UI (Week 4-5)

- [ ] Multimodal settings page
- [ ] Voice preview players
- [ ] Image generation UI
- [ ] Cost tracking display

### Phase 7: Polish (Week 5-6)

- [ ] Document extraction
- [ ] Local provider options
- [ ] Error handling
- [ ] Tests and documentation

---

## Cost Tracking

```typescript
interface MultimodalMetrics {
  date: string;
  vision: {
    requests: number;
    tokens: number;
    cost: number;
  };
  voice: {
    minutes: number;
    cost: number;
  };
  tts: {
    characters: number;
    cost: number;
  };
  imageGen: {
    images: number;
    cost: number;
  };
}
```

Display in ResourceMonitor with daily/weekly/monthly totals.

---

## Hook Integration

```typescript
// New hook points
type MultimodalHook = 
  | 'vision_analyzed'
  | 'voice_transcribed'
  | 'tts_generated'
  | 'image_generated';

// Enhanced messages include multimodal context
interface MessageWithMultimodal {
  hasImages: boolean;
  imageAnalysis?: VisionResult[];
  hasVoice: boolean;
  transcription?: string;
}
```

---

## Configuration Example

```yaml
multimodal:
  enabled: true
  
  vision:
    enabled: true
    defaultProvider: 'claude'
    maxImageSize: 10485760
    maxImagesPerMessage: 5
    
  voice:
    enabled: true
    transcribeOnReceive: true
    maxDuration: 300
    
  tts:
    enabled: true
    autoSpeak: false
    defaultVoice: 'alloy'
    defaultSpeed: 1.0
    
  imageGen:
    enabled: true
    defaultProvider: 'openai'
    dailyLimit: 50
    requireApproval: true

# Integration-specific overrides
integrations:
  telegram:
    voice:
      enabled: true
    image:
      enabled: true
  discord:
    voice:
      enabled: true
    tts:
      enabled: true
      channelOverrides:
        voice: true
        text: false
```

---

## Dependencies

- **AI Providers**: Claude, OpenAI, Gemini for vision/TTS/imagegen
- **IntegrationManager**: For multi-channel delivery
- **Brain**: Store transcription history
- **Config**: New multimodal config section

---

## Future Enhancements

- Video analysis (extract frames, describe scenes)
- Real-time voice conversation (streaming STT/TTS)
- Custom voice cloning (ElevenLabs)
- Multi-image reasoning (compare screenshots)
- Drawing generation (SVG, canvas)
- Video generation (Sora, Runway)
