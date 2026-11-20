import { describe, expect, it } from 'vitest';
import { ImageUrlService } from './image-url.service';

describe('ImageUrlService', () => {
  const images = new ImageUrlService();

  it('returns no URL for a missing photo', () => {
    expect(images.resolve(null)).toBeNull();
  });

  it('resolves API-relative uploads outside the /api prefix', () => {
    expect(images.resolve('/uploads/usuarios/a.webp')).toContain('/uploads/usuarios/a.webp');
    expect(images.resolve('/uploads/usuarios/a.webp')).not.toContain('/api/uploads');
  });

  it('preserves an already absolute HTTP image URL', () => {
    expect(images.resolve('https://cdn.example.test/a.webp')).toBe('https://cdn.example.test/a.webp');
  });
});
