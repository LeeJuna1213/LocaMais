import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve, sep } from 'node:path';

const EXTENSOES_PERMITIDAS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MIME_POR_EXTENSAO: Record<string, string[]> = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
};
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

@Injectable()
export class CarroFotoStorage {
  private readonly logger = new Logger(CarroFotoStorage.name);
  private readonly moduleDir = dirname(fileURLToPath(import.meta.url));
  private readonly apiRoot = resolve(this.moduleDir, '..', '..');
  private readonly uploadsDir = resolve(this.apiRoot, 'uploads');
  private readonly diretorio = resolve(this.uploadsDir, 'carros');

  validar(arquivo: Express.Multer.File): string {
    const extensao = extname(arquivo.originalname).toLowerCase();
    if (
      arquivo.size > TAMANHO_MAXIMO ||
      !EXTENSOES_PERMITIDAS.has(extensao) ||
      !MIME_POR_EXTENSAO[extensao]?.includes(arquivo.mimetype) ||
      !this.assinaturaValida(extensao, arquivo.buffer)
    ) {
      throw new BadRequestException('Envie uma imagem JPG, JPEG, PNG ou WebP de até 5 MB.');
    }
    return extensao;
  }

  private assinaturaValida(extensao: string, buffer: Buffer): boolean {
    if (extensao === '.jpg' || extensao === '.jpeg') {
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (extensao === '.png') {
      return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }

  async salvar(arquivo: Express.Multer.File): Promise<string> {
    const extensao = this.validar(arquivo);
    await mkdir(this.diretorio, { recursive: true });
    const nome = `${randomUUID()}${extensao}`;
    const destino = resolve(this.diretorio, nome);
    const handle = await open(destino, 'wx', 0o644);
    try {
      await handle.writeFile(arquivo.buffer);
    } catch (error) {
      await handle.close();
      await unlink(destino).catch(() => undefined);
      throw error;
    }
    await handle.close();
    return `/uploads/carros/${nome}`;
  }

  async remover(caminho: string | null): Promise<void> {
    if (!caminho) return;
    const prefixo = '/uploads/carros/';
    const nome = caminho.startsWith(prefixo) ? caminho.slice(prefixo.length) : '';
    if (!/^[\w-]+\.(?:jpg|jpeg|png|webp)$/i.test(nome)) {
      this.logger.warn('Caminho de foto fora do formato esperado; arquivo preservado.');
      return;
    }
    const destino = resolve(this.diretorio, nome);
    const relative = destino.slice(this.uploadsDir.length + 1);
    if (!relative.startsWith(`carros${sep}`) || resolve(destino) !== destino) {
      this.logger.warn('Caminho de foto fora da pasta permitida; arquivo preservado.');
      return;
    }
    try {
      await unlink(destino);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('Não foi possível remover o arquivo de foto antigo.');
        throw error;
      }
    }
  }
}

export function validarTipoFoto(
  _req: unknown,
  arquivo: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  try {
    const extensao = extname(arquivo.originalname).toLowerCase();
    if (!EXTENSOES_PERMITIDAS.has(extensao) || !MIME_POR_EXTENSAO[extensao]?.includes(arquivo.mimetype)) {
      callback(new BadRequestException('Formato de imagem não permitido.'), false);
      return;
    }
    callback(null, true);
  } catch (error) {
    callback(error as Error, false);
  }
}
