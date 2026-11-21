import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfiguracaoSistema } from './entities/configuracao-sistema.entity.js';
import { UpdateTaxaServicoDto } from './dto/update-taxa-servico.dto.js';

@Injectable()
export class ConfiguracaoService implements OnModuleInit {
  constructor(@InjectRepository(ConfiguracaoSistema) private readonly repository: Repository<ConfiguracaoSistema>) {}

  async onModuleInit(): Promise<void> {
    if (!(await this.repository.exists({ where: { chave: 'taxa_servico' } }))) {
      await this.repository.save(this.repository.create({ chave: 'taxa_servico', valor: 0 }));
    }
  }

  async getTaxaServico(): Promise<{ valor: number }> {
    const setting = await this.repository.findOneBy({ chave: 'taxa_servico' });
    return { valor: Number(setting?.valor ?? 0) };
  }

  async updateTaxaServico(dto: UpdateTaxaServicoDto): Promise<{ valor: number }> {
    await this.repository.save(this.repository.create({ chave: 'taxa_servico', valor: dto.valor }));
    return this.getTaxaServico();
  }
}
