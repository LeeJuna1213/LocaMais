import { describe, expect, it } from 'vitest';
import { ImageUrlService, imageServerOrigin } from './image-url.service';

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

  it('derives image origins from HTTP or HTTPS API bases without retaining /api', () => {
    expect(imageServerOrigin('https://192.0.2.10:3000/api')).toBe('https://192.0.2.10:3000');
    expect(imageServerOrigin('https://192.0.2.10:3000')).toBe('https://192.0.2.10:3000');
    expect(imageServerOrigin('http://localhost:3000/api')).toBe('http://localhost:3000');
  });
});
