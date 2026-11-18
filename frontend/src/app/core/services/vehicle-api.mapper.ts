import { Vehicle, VehicleStatus } from '../models';

export interface CarroApi {
  id: number;
  placa: string;
  modelo: string;
  marca: string;
  categoria: string;
  ano: number;
  status: string;
  valorDiaria: number | string;
  quilometragem: number;
  foto: string | null;
  created_at: string;
  updated_at: string;
}

const statusMap: Record<string, VehicleStatus> = {
  disponivel: 'Disponível',
  alugado: 'Alugado',
  'em manutenção': 'Em manutenção',
};

export function mapCarroApi(carro: CarroApi): Vehicle {
  const status = statusMap[carro.status];
  if (!status) throw new Error('Status de veículo não suportado pela interface');
  const category = ['SUV', 'Hatch', 'Picape'].includes(carro.categoria)
    ? carro.categoria as Vehicle['category'] : 'Hatch';
  return {
    id: carro.id,
    name: `${carro.marca} ${carro.modelo} ${carro.ano}`,
    version: '',
    pricePerDay: Number(carro.valorDiaria),
    status,
    color: '#4a6fa5',
    category,
    transmission: null,
    revisions: [],
    favorite: false,
    plate: carro.placa,
    mileage: carro.quilometragem,
    photo: carro.foto,
  };
}
