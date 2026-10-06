import { BadRequestException } from '@nestjs/common';

/** Max logo size. The image is stored inline (as a data URL) in company_settings.logo_url, so it is kept small. */
export const LOGO_MAX_BYTES = 512 * 1024;

const SIGNATURES: Array<{ mime: string; matches: (b: Buffer) => boolean }> = [
  { mime: 'image/png', matches: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', matches: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

/**
 * Turns an uploaded logo into a data URL. The type is decided from the
 * file's own leading bytes, never from the client-supplied name/MIME type —
 * so a renamed non-image (or an SVG, which can carry script) is rejected.
 */
export function logoToDataUrl(buffer: Buffer | undefined): string {
  if (!buffer || buffer.length === 0) throw new BadRequestException('Logo fayli tanlanmagan');
  if (buffer.length > LOGO_MAX_BYTES) throw new BadRequestException('Logo hajmi 512 KB dan oshmasligi kerak');
  const type = SIGNATURES.find((signature) => signature.matches(buffer));
  if (!type) throw new BadRequestException('Faqat PNG, JPG yoki WEBP rasm yuklash mumkin');
  return `data:${type.mime};base64,${buffer.toString('base64')}`;
}
