import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_BY_EXTENSION));

@Injectable()
export class UsuarioFotoStorage {
  private readonly logger = new Logger(UsuarioFotoStorage.name);
  private readonly moduleDir = dirname(fileURLToPath(import.meta.url));
  private readonly apiRoot = resolve(this.moduleDir, '..', '..');
  private readonly uploadsDir = resolve(this.apiRoot, 'uploads');
  private readonly directory = resolve(this.uploadsDir, 'usuarios');

  validar(file: Express.Multer.File): string {
    const extension = extname(file.originalname).toLowerCase();
    if (
      !Number.isFinite(file.size) || file.size > MAX_FILE_SIZE ||
      !ALLOWED_EXTENSIONS.has(extension) || MIME_BY_EXTENSION[extension] !== file.mimetype ||
      !Buffer.isBuffer(file.buffer) || !this.hasValidSignature(extension, file.buffer)
    ) {
      throw new BadRequestException('Envie uma imagem JPG, JPEG, PNG ou WebP de até 5 MB.');
    }
    return extension;
  }

  async salvar(file: Express.Multer.File): Promise<string> {
    const extension = this.validar(file);
    await mkdir(this.directory, { recursive: true });
    const filename = `${randomUUID()}${extension}`;
    const destination = resolve(this.directory, filename);
    const handle = await open(destination, 'wx', 0o644);
    try {
      await handle.writeFile(file.buffer);
    } catch (error) {
      await handle.close();
      await unlink(destination).catch(() => undefined);
      throw error;
    }
    await handle.close();
    return `/uploads/usuarios/${filename}`;
  }

  async remover(path: string | null): Promise<void> {
    if (!path) return;
    const prefix = '/uploads/usuarios/';
    const filename = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    if (!/^[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp)$/i.test(filename)) {
      this.logger.warn('Caminho de foto de usuário fora do padrão; arquivo preservado.');
      return;
    }
    const destination = resolve(this.directory, filename);
    const relative = destination.slice(this.uploadsDir.length + 1);
    if (!relative.startsWith(`usuarios${sep}`) || resolve(destination) !== destination) {
      this.logger.warn('Caminho de foto de usuário fora da pasta permitida; arquivo preservado.');
      return;
    }
    try {
      await unlink(destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('Não foi possível remover o arquivo de foto de usuário antigo.');
        throw error;
      }
    }
  }

  private hasValidSignature(extension: string, buffer: Buffer): boolean {
    if (extension === '.jpg' || extension === '.jpeg') {
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (extension === '.png') {
      return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
}

export function validarTipoFotoUsuario(
  _request: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  const extension = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension) || MIME_BY_EXTENSION[extension] !== file.mimetype) {
    callback(new BadRequestException('Formato de imagem não permitido.'), false);
    return;
  }
  callback(null, true);
}
