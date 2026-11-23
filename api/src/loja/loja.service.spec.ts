import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LojaService } from './loja.service.js';

describe('LojaService status persistence and active options', () => {
  let repository: any;
  let service: LojaService;
  let savedShop: any;

  beforeEach(() => {
    savedShop = { id: 4, codigo: 'RJ01', nome: 'Loja Centro', uf: 'RJ', ativa: true };
    repository = {
      find: vi.fn().mockResolvedValue([savedShop]),
      findOne: vi.fn(async () => savedShop),
      exists: vi.fn().mockResolvedValue(false),
      create: vi.fn((input) => ({ ...input })),
      save: vi.fn(async (shop) => { savedShop = { ...shop, id: shop.id ?? 4 }; return savedShop; }),
    };
    service = new LojaService(repository);
  });

  it('cadastra loja ativa e inativa com o boolean enviado', async () => {
    const active = await service.create({ codigo: 'RJ01', nome: 'Loja ativa', uf: 'RJ', ativa: true } as any);
    expect(active.ativa).toBe(true);
    const inactive = await service.create({ codigo: 'RJ02', nome: 'Loja inativa', uf: 'SP', ativa: false } as any);
    expect(inactive.ativa).toBe(false);
  });

  it('usa true somente como padrão quando ativa não foi enviada', async () => {
    await service.create({ codigo: 'RJ01', nome: 'Loja padrão', uf: 'RJ' } as any);
    expect(repository.save).toHaveBeenLastCalledWith(expect.objectContaining({ ativa: true }));
  });

  it('persiste ativa=false e ativa=true na edição', async () => {
    await service.update(4, { ativa: false } as any);
    expect(savedShop.ativa).toBe(false);
    await service.update(4, { ativa: true } as any);
    expect(savedShop.ativa).toBe(true);
  });

  it('filtra opções de retirada por ativa=true e mantém findAll sem filtro para o admin', async () => {
    await service.findActive();
    expect(repository.find).toHaveBeenCalledWith({ where: { ativa: true }, order: { nome: 'ASC' } });
    await service.findAll();
    expect(repository.find).toHaveBeenLastCalledWith({ order: { nome: 'ASC' } });
  });
});
