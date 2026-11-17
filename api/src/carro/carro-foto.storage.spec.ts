import { BadRequestException } from '@nestjs/common';
import { CarroFotoStorage } from './carro-foto.storage.js';

describe('CarroFotoStorage', () => {
  let storage: CarroFotoStorage;
  beforeEach(() => {
    storage = new CarroFotoStorage();
  });

  it('aceita JPEG quando extensão, MIME e assinatura correspondem', () => {
    expect(storage.validar({
      originalname: 'original.jpeg', mimetype: 'image/jpeg', size: 3,
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
    } as Express.Multer.File)).toBe('.jpeg');
  });

  it('rejeita extensão ou MIME não permitido', () => {
    expect(() => storage.validar({
      originalname: 'script.exe', mimetype: 'application/octet-stream', size: 3,
      buffer: Buffer.from('bad'),
    } as Express.Multer.File)).toThrow(BadRequestException);
  });

  it('rejeita imagem acima de 5 MB', () => {
    expect(() => storage.validar({
      originalname: 'foto.jpg', mimetype: 'image/jpeg', size: 5 * 1024 * 1024 + 1,
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
    } as Express.Multer.File)).toThrow(BadRequestException);
  });
});
