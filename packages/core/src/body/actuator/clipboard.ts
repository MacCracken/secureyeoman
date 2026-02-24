/**
 * Clipboard Actuator Driver
 *
 * Read/write/clear clipboard content via clipboardy.
 * Gated by capture.clipboard RBAC resource and limb_movement capability.
 */

export async function readClipboard(): Promise<string> {
  const { default: clipboard } = await import('clipboardy');
  return clipboard.read();
}

export async function writeClipboard(text: string): Promise<void> {
  const { default: clipboard } = await import('clipboardy');
  await clipboard.write(text);
}

export async function clearClipboard(): Promise<void> {
  const { default: clipboard } = await import('clipboardy');
  await clipboard.write('');
}
