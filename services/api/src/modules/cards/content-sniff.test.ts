import { describe, expect, it } from 'vitest';
import { sniffContentType, isContentTypeAllowedForKind, ALLOWLIST } from './content-sniff';

function bytes(...hex: number[]): Buffer {
  return Buffer.from(hex);
}

describe('sniffContentType', () => {
  it('detects JPEG from its magic bytes', () => {
    expect(sniffContentType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe('image/jpeg');
  });

  it('detects PNG', () => {
    expect(sniffContentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
  });

  it('detects GIF', () => {
    expect(sniffContentType(Buffer.from('GIF89a-rest'))).toBe('image/gif');
  });

  it('detects WEBP (RIFF ... WEBP)', () => {
    const b = Buffer.concat([Buffer.from('RIFF'), bytes(0, 0, 0, 0), Buffer.from('WEBP')]);
    expect(sniffContentType(b)).toBe('image/webp');
  });

  it('detects PDF', () => {
    expect(sniffContentType(Buffer.from('%PDF-1.7\n...'))).toBe('application/pdf');
  });

  it('detects MP3 via an ID3 tag', () => {
    expect(sniffContentType(Buffer.from('ID3\x03\x00'))).toBe('audio/mpeg');
  });

  it('detects MP3 via a raw frame sync', () => {
    expect(sniffContentType(bytes(0xff, 0xfb, 0x90, 0x00))).toBe('audio/mpeg');
  });

  it('detects WAV (RIFF ... WAVE)', () => {
    const b = Buffer.concat([Buffer.from('RIFF'), bytes(0, 0, 0, 0), Buffer.from('WAVE')]);
    expect(sniffContentType(b)).toBe('audio/wav');
  });

  it('detects OGG', () => {
    expect(sniffContentType(Buffer.from('OggS\x00\x02'))).toBe('audio/ogg');
  });

  it('detects MP4/MOV via the ftyp box at offset 4', () => {
    const b = Buffer.concat([bytes(0, 0, 0, 0x20), Buffer.from('ftypisom')]);
    expect(sniffContentType(b)).toBe('video/mp4');
  });

  it('detects WebM/Matroska', () => {
    expect(sniffContentType(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00))).toBe('video/webm');
  });

  it('returns null for unrecognized content (e.g. a bare executable or random bytes)', () => {
    expect(sniffContentType(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull(); // MZ - a Windows executable
    expect(sniffContentType(bytes(0x00, 0x01, 0x02, 0x03))).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(sniffContentType(Buffer.alloc(0))).toBeNull();
  });
});

describe('isContentTypeAllowedForKind', () => {
  it('accepts a real image content-type for kind IMAGE', () => {
    expect(isContentTypeAllowedForKind('IMAGE', 'image/png')).toBe(true);
    expect(isContentTypeAllowedForKind('IMAGE', 'image/jpeg')).toBe(true);
  });

  it('rejects an audio content-type declared as an IMAGE (kind must match the real bytes)', () => {
    expect(isContentTypeAllowedForKind('IMAGE', 'audio/mpeg')).toBe(false);
  });

  it('rejects a content-type not in the allowlist at all, for any kind', () => {
    expect(isContentTypeAllowedForKind('FILE', 'application/x-msdownload')).toBe(false);
    expect(isContentTypeAllowedForKind('FILE', 'application/zip')).toBe(false);
  });

  it('the FILE kind allows only document types (pdf), not arbitrary binaries', () => {
    expect(isContentTypeAllowedForKind('FILE', 'application/pdf')).toBe(true);
    expect(isContentTypeAllowedForKind('FILE', 'image/png')).toBe(false);
  });

  it('rejects a null content-type (unsniffable) for every kind', () => {
    expect(isContentTypeAllowedForKind('IMAGE', null)).toBe(false);
    expect(isContentTypeAllowedForKind('VIDEO', null)).toBe(false);
  });

  it('the allowlist covers image, audio, video and file kinds', () => {
    expect(Object.keys(ALLOWLIST).sort()).toEqual(['AUDIO', 'FILE', 'IMAGE', 'VIDEO']);
  });
});
