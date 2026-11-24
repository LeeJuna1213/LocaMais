import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notificacao } from './entities/notificacao.entity.js';
import { NotificacaoController } from './notificacao.controller.js';
import { NotificacaoService } from './notificacao.service.js';

@Global()
@Module({ imports: [TypeOrmModule.forFeature([Notificacao])], controllers: [NotificacaoController], providers: [NotificacaoService], exports: [NotificacaoService] })
export class NotificacaoModule {}
