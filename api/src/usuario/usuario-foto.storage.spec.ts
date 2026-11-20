import { BadRequestException } from '@nestjs/common';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { UsuarioFotoStorage } from './usuario-foto.storage.js';

const imagens = [
  { nome: 'foto.jpg', mime: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), caminho: '.jpg' },
  { nome: 'foto.png', mime: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), caminho: '.png' },
  { nome: 'foto.webp', mime: 'image/webp', bytes: Buffer.from('RIFF0000WEBP'), caminho: '.webp' },
];

describe('UsuarioFotoStorage', () => {
  let storage: UsuarioFotoStorage;

  beforeEach(() => { storage = new UsuarioFotoStorage(); });

  it.each(imagens)('aceita e salva $mime com UUID e caminho público relativo', async ({ nome, mime, bytes, caminho }) => {
    const arquivo = { originalname: nome, mimetype: mime, size: bytes.length, buffer: bytes } as Express.Multer.File;
    const foto = await storage.salvar(arquivo);
    try {
      expect(foto).toMatch(/^\/uploads\/usuarios\/[\w-]+\.(jpg|png|webp)$/);
      expect(foto.endsWith(caminho)).toBe(true);
      const filename = foto.split('/').at(-1)!;
      await expect(access(resolve(process.cwd(), 'uploads', 'usuarios', filename))).resolves.toBeUndefined();
    } finally {
      await storage.remover(foto);
    }
  });

  it('rejeita arquivo acima de 5 MB', () => {
    expect(() => storage.validar({
      originalname: 'foto.jpg', mimetype: 'image/jpeg', size: 5 * 1024 * 1024 + 1,
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
    } as Express.Multer.File)).toThrow(BadRequestException);
  });

  it.each([
    { originalname: 'foto.exe', mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff]) },
    { originalname: 'foto.jpg', mimetype: 'image/png', buffer: Buffer.from([0xff, 0xd8, 0xff]) },
    { originalname: 'foto.png', mimetype: 'image/png', buffer: Buffer.from('not a png') },
    { originalname: 'foto.webp', mimetype: 'image/webp', buffer: Buffer.from('RIFF0000JPEG') },
  ])('rejeita arquivo com extensão, MIME ou assinatura incompatível', (file) => {
    expect(() => storage.validar({ ...file, size: file.buffer.length } as Express.Multer.File))
      .toThrow(BadRequestException);
  });

  it('não apaga caminhos fora da pasta pública de usuários', async () => {
    await expect(storage.remover('/uploads/carros/foto.jpg')).resolves.toBeUndefined();
    await expect(storage.remover('../secreto.jpg')).resolves.toBeUndefined();
  });
});
