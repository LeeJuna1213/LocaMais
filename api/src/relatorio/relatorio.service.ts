import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

interface Filter { de?: string; ate?: string; carroId?: number }

@Injectable()
export class RelatorioService {
  constructor(private readonly db: DataSource) {}

  async get(filter: Filter) {
    if (filter.de && !/^\d{4}-\d{2}-\d{2}$/.test(filter.de)) throw new BadRequestException('Data inicial inválida.');
    if (filter.ate && !/^\d{4}-\d{2}-\d{2}$/.test(filter.ate)) throw new BadRequestException('Data final inválida.');
    if (filter.de && filter.ate && filter.de > filter.ate) throw new BadRequestException('A data inicial não pode ser posterior à final.');
    if (filter.carroId !== undefined && (!Number.isInteger(filter.carroId) || filter.carroId < 1)) throw new BadRequestException('Veículo inválido.');
    const sqlite = String(this.db.options.type) === 'better-sqlite3' || String(this.db.options.type) === 'sqlite';
    const month = (column: string) => sqlite ? `strftime('%Y-%m',${column})` : `DATE_FORMAT(${column},'%Y-%m')`;
    const dateWhere = (alias: string) => ({
      sql: `${filter.de ? ` AND ${alias} >= ?` : ''}${filter.ate ? ` AND ${alias} < ${sqlite ? "datetime(?, '+1 day')" : 'DATE_ADD(?, INTERVAL 1 DAY)'}` : ''}`,
      args: [...(filter.de ? [filter.de] : []), ...(filter.ate ? [filter.ate] : [])],
    });
    const vehicleClause = filter.carroId ? ' AND r.car_id = ?' : '';
    const vehicleArgs = filter.carroId ? [filter.carroId] : [];
    const payDate = {
      sql: ` AND ((p.status='aprovado'${filter.de ? ' AND p.updated_at >= ?' : ''}${filter.ate ? ` AND p.updated_at < ${sqlite ? "datetime(?, '+1 day')" : 'DATE_ADD(?, INTERVAL 1 DAY)'}` : ''}) OR (p.status='pendente'${filter.de ? ' AND p.data >= ?' : ''}${filter.ate ? ` AND p.data < ${sqlite ? "datetime(?, '+1 day')" : 'DATE_ADD(?, INTERVAL 1 DAY)'}` : ''}))`,
      args: [...(filter.de ? [filter.de] : []), ...(filter.ate ? [filter.ate] : []), ...(filter.de ? [filter.de] : []), ...(filter.ate ? [filter.ate] : [])],
    };
    const reserveDate = dateWhere('r.dataRetirada');
    const revisionDate = dateWhere('rv.data');
    const inspectionDate = dateWhere('v.data');
    const [monthlyRevenue, reservationStatus, monthlyReservations, reservationsByVehicle, revisions, inspections, vehicleList] = await Promise.all([
      this.db.query(`SELECT CASE WHEN p.status='aprovado' THEN ${month('p.updated_at')} ELSE ${month('p.data')} END mes, SUM(CASE WHEN p.status='aprovado' THEN p.valor ELSE 0 END) recebido, SUM(CASE WHEN p.status='pendente' THEN p.valor ELSE 0 END) pendente, SUM(CASE WHEN p.status='aprovado' THEN 1 ELSE 0 END) pagamentosConfirmados, COUNT(DISTINCT CASE WHEN p.status='aprovado' THEN p.locacao_id END) locacoesPagas FROM pagamentos p JOIN locacoes l ON l.id=p.locacao_id JOIN reservas r ON r.id=l.reservation_id WHERE 1=1${payDate.sql}${filter.carroId ? ' AND r.car_id=?' : ''} GROUP BY mes ORDER BY mes`, [...payDate.args, ...vehicleArgs]),
      this.db.query(`SELECT r.status, COUNT(*) quantidade, SUM(l.id IS NOT NULL AND r.status <> 'cancelada') locacoes FROM reservas r LEFT JOIN locacoes l ON l.reservation_id=r.id WHERE 1=1${reserveDate.sql}${vehicleClause} GROUP BY r.status`, [...reserveDate.args, ...vehicleArgs]),
      this.db.query(`SELECT ${month('r.dataRetirada')} mes, SUM(CASE WHEN r.status <> 'cancelada' THEN 1 ELSE 0 END) efetivadas, SUM(CASE WHEN r.status='cancelada' THEN 1 ELSE 0 END) canceladas, SUM(CASE WHEN r.status='pendente' THEN 1 ELSE 0 END) pendentes, SUM(CASE WHEN r.status='confirmada' THEN 1 ELSE 0 END) confirmadas, SUM(CASE WHEN l.id IS NOT NULL AND r.status <> 'cancelada' THEN 1 ELSE 0 END) locacoes FROM reservas r LEFT JOIN locacoes l ON l.reservation_id=r.id WHERE 1=1${reserveDate.sql}${vehicleClause} GROUP BY mes ORDER BY mes`, [...reserveDate.args, ...vehicleArgs]),
      this.db.query(`SELECT ${month('r.dataRetirada')} mes,c.id carro_id,c.marca,c.modelo,c.placa,COUNT(r.id) quantidade FROM carros c JOIN reservas r ON r.car_id=c.id AND r.status <> 'cancelada'${reserveDate.sql} WHERE 1=1${filter.carroId ? ' AND c.id=?' : ''} GROUP BY mes,c.id,c.marca,c.modelo,c.placa ORDER BY mes,quantidade DESC`, [...reserveDate.args, ...vehicleArgs]),
      this.db.query(`SELECT rv.id,rv.data,rv.descricao,rv.valor,rv.km,c.id carro_id,c.marca,c.modelo,c.placa FROM revisoes rv JOIN carros c ON c.id=rv.carro_id WHERE 1=1${revisionDate.sql}${filter.carroId ? ' AND c.id=?' : ''} ORDER BY rv.data DESC`, [...revisionDate.args, ...vehicleArgs]),
      this.db.query(`SELECT v.id,v.data,v.observacoes descricao,v.km,v.valor,c.id carro_id,c.marca,c.modelo,c.placa,c.quilometragem quilometragemAtual FROM vistorias v JOIN carros c ON c.id=v.carro_id WHERE v.tipo='periodica' AND v.km IS NOT NULL AND v.valor IS NOT NULL${inspectionDate.sql}${filter.carroId ? ' AND c.id=?' : ''} ORDER BY v.data DESC`, [...inspectionDate.args, ...vehicleArgs]),
      this.db.query(`SELECT id carro_id,marca,modelo,placa,quilometragem quilometragemAtual FROM carros${filter.carroId ? ' WHERE id=?' : ''} ORDER BY marca,modelo`, vehicleArgs),
    ]);
    return { filtros: { de: filter.de ?? null, ate: filter.ate ?? null, carroId: filter.carroId ?? null }, mensalReceita: monthlyRevenue, statusReservas: reservationStatus, reservasMensais: monthlyReservations, reservasPorVeiculoMes: reservationsByVehicle, revisoes: revisions, vistorias: inspections, veiculos: vehicleList };
  }
}
