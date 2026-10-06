import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { LOGO_MAX_BYTES, logoToDataUrl } from './logo-image.util.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);

describe('logoToDataUrl', () => {
  it.each([
    ['png', PNG, 'image/png'],
    ['jpeg', JPEG, 'image/jpeg'],
    ['webp', WEBP, 'image/webp'],
  ])('detects %s from its magic bytes', (_name, buffer, mime) => {
    expect(logoToDataUrl(buffer)).toBe(`data:${mime};base64,${buffer.toString('base64')}`);
  });

  it('rejects an SVG (or any non-raster file), whatever it is named', () => {
    expect(() => logoToDataUrl(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toThrow(BadRequestException);
  });

  it('rejects a file over the size limit', () => {
    const big = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)]);
    expect(() => logoToDataUrl(big)).toThrow(BadRequestException);
  });

  it('rejects a missing/empty upload', () => {
    expect(() => logoToDataUrl(undefined)).toThrow(BadRequestException);
    expect(() => logoToDataUrl(Buffer.alloc(0))).toThrow(BadRequestException);
  });
});
