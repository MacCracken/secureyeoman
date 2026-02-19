/**
 * Multimodal Command — Manage multimodal I/O operations.
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, apiCall, Spinner } from '../utils.js';

export const multimodalCommand: Command = {
  name: 'multimodal',
  aliases: ['mm'],
  description: 'Manage multimodal I/O operations (vision, audio, image generation)',
  usage: 'secureyeoman multimodal <config|jobs>',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(`
Usage: ${this.usage}

Commands:
  config            Show multimodal configuration (TTS, STT, vision, imagegen)
  jobs              List multimodal job history

Operations (require running server):
  vision-analyze <image_url>   Analyze image with vision API
  speak <text>                 Generate speech from text
  transcribe <audio_url>       Transcribe audio to text
  generate <prompt>            Generate image from text prompt

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --json            Output raw JSON
  -h, --help        Show this help
`);
      return 0;
    }
    argv = helpResult.rest;

    const urlResult = extractFlag(argv, 'url');
    argv = urlResult.rest;
    const jsonResult = extractBoolFlag(argv, 'json');
    argv = jsonResult.rest;

    const baseUrl = urlResult.value ?? 'http://127.0.0.1:3000';
    const json = jsonResult.value;
    const subcommand = argv[0];

    try {
      if (!subcommand || subcommand === 'config') {
        const result = await apiCall(baseUrl, '/api/v1/multimodal/config');
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch config: HTTP ${result.status}\n`);
          return 1;
        }
        const config = result.data as Record<string, unknown>;
        if (json) {
          ctx.stdout.write(JSON.stringify(config, null, 2) + '\n');
          return 0;
        }
        ctx.stdout.write('\nMultimodal Configuration:\n');
        ctx.stdout.write(JSON.stringify(config, null, 2) + '\n');
      } else if (subcommand === 'jobs') {
        const result = await apiCall(baseUrl, '/api/v1/multimodal/jobs');
        if (!result.ok) {
          ctx.stderr.write(`Failed to fetch jobs: HTTP ${result.status}\n`);
          return 1;
        }
        const jobs = result.data as Array<{
          id: string;
          type: string;
          status: string;
          created_at: string;
        }>;
        if (json) {
          ctx.stdout.write(JSON.stringify(jobs, null, 2) + '\n');
          return 0;
        }
        if (jobs.length === 0) {
          ctx.stdout.write('No multimodal jobs found.\n');
          return 0;
        }
        ctx.stdout.write('\nMultimodal Jobs:\n');
        for (const job of jobs.slice(0, 10)) {
          ctx.stdout.write(
            `  ${job.id} | ${job.type} | ${job.status} | ${new Date(job.created_at).toLocaleString()}\n`
          );
        }
      } else if (subcommand === 'vision-analyze' && argv[1]) {
        const imageUrl = argv[1];
        const spinner = new Spinner(ctx.stdout);
        spinner.start('Analyzing image');
        const result = await apiCall(baseUrl, '/api/v1/multimodal/vision/analyze', {
          method: 'POST',
          body: { url: imageUrl },
        });
        if (!result.ok) {
          spinner.stop('Vision analysis failed', false);
          ctx.stderr.write(`HTTP ${result.status}\n`);
          return 1;
        }
        spinner.stop('Analysis complete', true);
        if (json) {
          ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
          return 0;
        }
        ctx.stdout.write('\nVision Analysis Result:\n');
        ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
      } else if (subcommand === 'speak' && argv[1]) {
        const text = argv.slice(1).join(' ');
        const spinner = new Spinner(ctx.stdout);
        spinner.start('Generating speech');
        const result = await apiCall(baseUrl, '/api/v1/multimodal/audio/speak', {
          method: 'POST',
          body: { text },
        });
        if (!result.ok) {
          spinner.stop('Speech generation failed', false);
          ctx.stderr.write(`HTTP ${result.status}\n`);
          return 1;
        }
        spinner.stop('Speech generation job submitted', true);
        if (json) {
          ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
          return 0;
        }
        ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
      } else if (subcommand === 'transcribe' && argv[1]) {
        const audioUrl = argv[1];
        const spinner = new Spinner(ctx.stdout);
        spinner.start('Transcribing audio');
        const result = await apiCall(baseUrl, '/api/v1/multimodal/audio/transcribe', {
          method: 'POST',
          body: { url: audioUrl },
        });
        if (!result.ok) {
          spinner.stop('Transcription failed', false);
          ctx.stderr.write(`HTTP ${result.status}\n`);
          return 1;
        }
        spinner.stop('Transcription complete', true);
        if (json) {
          ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
          return 0;
        }
        ctx.stdout.write('\nTranscription Result:\n');
        ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
      } else if (subcommand === 'generate' && argv[1]) {
        const prompt = argv.slice(1).join(' ');
        const spinner = new Spinner(ctx.stdout);
        spinner.start('Generating image');
        const result = await apiCall(baseUrl, '/api/v1/multimodal/image/generate', {
          method: 'POST',
          body: { prompt },
        });
        if (!result.ok) {
          spinner.stop('Image generation failed', false);
          ctx.stderr.write(`HTTP ${result.status}\n`);
          return 1;
        }
        spinner.stop('Image generation job submitted', true);
        if (json) {
          ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
          return 0;
        }
        ctx.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
      } else {
        ctx.stderr.write(`Unknown subcommand: ${subcommand}\n`);
        ctx.stderr.write(`Run 'secureyeoman multimodal --help' for usage.\n`);
        return 1;
      }
      return 0;
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};
