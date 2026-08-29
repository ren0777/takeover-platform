import { describe, expect, it } from 'vitest';
import { sanitizeAccentColor } from '../../src/lib/format/color.js';

describe('sanitizeAccentColor', () => {
  it('accepts and normalizes a six-digit hex', () => {
    expect(sanitizeAccentColor('#AABBCC')).toBe('#aabbcc');
  });

  it('expands a three-digit hex', () => {
    expect(sanitizeAccentColor('#ABC')).toBe('#aabbcc');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeAccentColor('  #abcdef  ')).toBe('#abcdef');
  });

  it('rejects named colors', () => {
    expect(sanitizeAccentColor('red')).toBeNull();
  });

  it('rejects functional notation', () => {
    expect(sanitizeAccentColor('rgb(255,0,0)')).toBeNull();
  });

  it('rejects a css injection attempt', () => {
    expect(sanitizeAccentColor('#fff;background:url(https://evil.test)')).toBeNull();
  });

  it('rejects a javascript url', () => {
    expect(sanitizeAccentColor('javascript:alert(1)')).toBeNull();
  });

  it('rejects an eight-digit hex so alpha cannot hide contrast failures', () => {
    expect(sanitizeAccentColor('#aabbccdd')).toBeNull();
  });

  it('rejects absent values', () => {
    expect(sanitizeAccentColor(null)).toBeNull();
    expect(sanitizeAccentColor(undefined)).toBeNull();
    expect(sanitizeAccentColor('')).toBeNull();
  });
});
