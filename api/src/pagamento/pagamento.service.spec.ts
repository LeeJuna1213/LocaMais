import { NotFoundException } from '@nestjs/common';

import { PagamentoService } from './pagamento.service.js';
import { LocacaoService } from '../locacao/locacao.service.js';
import { StatusPagamento } from './enums/status-pagamento.enum.js';
import { MetodoPagamento } from './enums/metodo-pagamento.enum.js';
import { GatewayPagamentoService } from './gateway-pagamento.service.js';

describe('PagamentoService', () => {
  let service: PagamentoService;
  let pagamentosRepository: any;
  let gatewaysRepository: any;
  let dataSource: any;
  let locacaoService: LocacaoService;
  let gatewayService: GatewayPagamentoService;

  const mockLocacao = {
    id: 'loc-123',
    reservation_id: 'res-456',
    valorTotal: 300,
    status: 'aguardando_retirada',
    reservation: {
      id: 'res-456',
      client: {
        id: 1,
        user: {
          id: 1,
          name: 'Cliente Teste',
          email: 'cliente@exemplo.com',
        },
      },
      car: {
        id: 1,
        marca: 'Fiat',
        modelo: 'Palio',
        placa: 'ABC-1234',
      },
    },
  };

  const mockPagamento = {
    id: 'pag-123',
    valor: 150,
    metodo: MetodoPagamento.PIX,
    status: StatusPagamento.PENDENTE,
    data: new Date('2026-11-10T10:00:00.000Z'),
    locacao_id: 'loc-123',
    gateway_id: 'gw-123',
    locacao: mockLocacao,
    gateway: {
      id: 'gw-123',
      tipo: 'simulado',
      credenciais: 'gateway-simulado-locamais-v1',
    },
    created_at: new Date(),
    updated_at: new Date(),
  };

  let processarTransacaoMock: any;

  beforeEach(() => {
    processarTransacaoMock = vi.fn().mockReturnValue({
      aprovado: true,
      mensagem: 'transacao aprovada (simulado)',
    });

    pagamentosRepository = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      create: vi.fn().mockImplementation((dto: any) => dto),
      save: vi.fn().mockImplementation((entity: any) => entity),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    gatewaysRepository = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      create: vi.fn().mockImplementation((dto: any) => dto),
      save: vi.fn().mockImplementation((entity: any) => entity),
    };

    dataSource = {
      transaction: vi.fn().mockImplementation(async (cb: any) => {
        const manager = { ...pagamentosRepository, ...gatewaysRepository };
        return cb(manager);
      }),
    };

    locacaoService = {
      findOnePublic: vi.fn().mockResolvedValue(mockLocacao),
    } as any;

    gatewayService = {
      processarTransacao: processarTransacaoMock,
      validarPagamento: vi.fn().mockReturnValue(true),
    } as any;

    service = new PagamentoService(
      pagamentosRepository,
      gatewaysRepository,
      dataSource,
      locacaoService,
      gatewayService,
    );
  });

  describe('create', () => {
    const dto = {
      locacaoId: 'loc-123',
      metodo: MetodoPagamento.PIX,
      valor: 150,
    };

    it('deve registrar um pagamento com status PENDENTE', async () => {
      locacaoService.findOnePublic = vi.fn().mockResolvedValue(mockLocacao);

      const resultado = await service.create(dto);

      expect(resultado.status).toBe(StatusPagamento.PENDENTE);
      expect(resultado.valor).toBe(dto.valor);
      expect(resultado.metodo).toBe(dto.metodo);
      expect(resultado.locacao_id).toBe(dto.locacaoId);
    });

    it('deve lançar NotFoundException quando a locacao nao existe', async () => {
      locacaoService.findOnePublic = vi.fn().mockRejectedValue(
        new NotFoundException('locacao de ID loc-999 nao encontrada'),
      );

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('deve impedir pagamento para locacao cancelada', async () => {
      const locacaoCancelada = { ...mockLocacao, status: 'cancelada' };
      locacaoService.findOnePublic = vi.fn().mockResolvedValue(locacaoCancelada);

      await expect(service.create(dto)).rejects.toThrow();
    });

    it('deve impedir pagamento com valor acima do saldo restante', async () => {
      locacaoService.findOnePublic = vi.fn().mockResolvedValue(mockLocacao);

      const dtoValorAlto = { ...dto, valor: 500 }; // saldo restante eh 300

      await expect(service.create(dtoValorAlto)).rejects.toThrow();
    });

    it('deve permitir pagamento parcial quando valor esta dentro do saldo', async () => {
      locacaoService.findOnePublic = vi.fn().mockResolvedValue(mockLocacao);

      const dtoParcial = { ...dto, valor: 100 }; // dentro do saldo de 300

      const resultado = await service.create(dtoParcial);

      expect(resultado.valor).toBe(100);
      expect(resultado.status).toBe(StatusPagamento.PENDENTE);
    });
  });

  describe('consultarSaldoRestante', () => {
    it('deve retornar o saldo restante correto', async () => {
      locacaoService.findOnePublic = vi.fn().mockResolvedValue(mockLocacao);
      pagamentosRepository.find = vi.fn().mockResolvedValue([
        { ...mockPagamento, valor: 100, status: StatusPagamento.APROVADO },
      ]);

      const resultado = await service.consultarSaldoRestante('loc-123');

      expect(resultado.valorTotal).toBe(300);
      expect(resultado.valorPago).toBe(100);
      expect(resultado.saldoRestante).toBe(200);
    });

    it('deve ignorar pagamentos nao aprovados no saldo', async () => {
      locacaoService.findOnePublic = vi.fn().mockResolvedValue(mockLocacao);
      // O where do TypeORM filtra apenas APROVADO, então o mock deve
      // retornar somente aprovados (simulando o comportamento do banco).
      pagamentosRepository.find = vi.fn().mockResolvedValue([]);

      const resultado = await service.consultarSaldoRestante('loc-123');

      expect(resultado.valorPago).toBe(0);
      expect(resultado.saldoRestante).toBe(300);
    });

    it('deve lançar NotFoundException quando a locacao nao existe', async () => {
      locacaoService.findOnePublic = vi.fn().mockRejectedValue(
        new NotFoundException('locacao de ID loc-999 nao encontrada'),
      );

      await expect(service.consultarSaldoRestante('loc-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirmar', () => {
    it('deve aprovar um pagamento pendente', async () => {
      pagamentosRepository.findOne = vi.fn().mockResolvedValue(mockPagamento);
      pagamentosRepository.save = vi.fn().mockResolvedValue({
        ...mockPagamento,
        status: StatusPagamento.APROVADO,
      });

      const resultado = await service.confirmar('pag-123');

      expect(resultado.status).toBe(StatusPagamento.APROVADO);
      expect(processarTransacaoMock).toHaveBeenCalled();
    });

    it('deve nao permitir confirmacao duplicada de pagamento ja aprovado', async () => {
      const pagamentoAprovado = { ...mockPagamento, status: StatusPagamento.APROVADO };
      pagamentosRepository.findOne = vi.fn().mockResolvedValue(pagamentoAprovado);

      const resultado = await service.confirmar('pag-123');

      expect(resultado.status).toBe(StatusPagamento.APROVADO);
      expect(processarTransacaoMock).not.toHaveBeenCalled();
    });

    it('deve impedir confirmacao de pagamento nao pendente', async () => {
      const pagamentoRecusado = { ...mockPagamento, status: StatusPagamento.RECUSADO };
      pagamentosRepository.findOne = vi.fn().mockResolvedValue(pagamentoRecusado);

      await expect(service.confirmar('pag-123')).rejects.toThrow();
    });

    it('deve lancar NotFoundException quando o pagamento nao existe', async () => {
      pagamentosRepository.findOne = vi.fn().mockResolvedValue(null);

      await expect(service.confirmar('pag-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('gerarComprovante', () => {
    it('deve gerar o recibo para pagamento aprovado', async () => {
      pagamentosRepository.findOne = vi.fn().mockResolvedValue(mockPagamento);

      // Sobrescreve para status aprovado
      const pagamentoAprovado = { ...mockPagamento, status: StatusPagamento.APROVADO };
      pagamentosRepository.findOne = vi.fn().mockResolvedValue(pagamentoAprovado);

      const comprovante = await service.gerarComprovante('pag-123');

      expect(comprovante.empresa).toBe('LocaMais');
      expect(comprovante.status).toBe(StatusPagamento.APROVADO);
      expect(comprovante.valorPago).toBe(150);
      expect(comprovante.metodoPagamento).toBe(MetodoPagamento.PIX);
      expect(comprovante.aviso).toContain('simulado');
      expect(comprovante.aviso).toContain('Nao representa uma transacao financeira real');
      expect(comprovante.cliente).toBe('Cliente Teste');
      expect(comprovante.veiculo).toContain('Fiat');
      expect(comprovante.veiculo).toContain('Palio');
    });

    it('deve impedir gerar comprovante para pagamento nao aprovado', async () => {
      const pagamentoPendente = {
        ...mockPagamento,
        status: StatusPagamento.PENDENTE,
      };
      pagamentosRepository.findOne = vi.fn().mockResolvedValue(pagamentoPendente);

      await expect(service.gerarComprovante('pag-123')).rejects.toThrow();
    });
  });

  describe('findByLocacao', () => {
    it('deve retornar os pagamentos de uma locacao', async () => {
      locacaoService.findOnePublic = vi.fn().mockResolvedValue(mockLocacao);
      pagamentosRepository.find = vi.fn().mockResolvedValue([mockPagamento]);

      const resultado = await service.findByLocacao('loc-123');

      expect(resultado).toHaveLength(1);
      expect(resultado[0].locacao_id).toBe('loc-123');
    });
  });
});
