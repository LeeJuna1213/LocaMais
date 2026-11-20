import { Client, Reservation, UserProfile, Vehicle } from './models';

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

export const addDays = (isoDate: string, amount: number): string =>
  new Date(+new Date(isoDate) + amount * 86_400_000).toISOString().slice(0, 10);

export const daysBetween = (start: string, end: string): number =>
  Math.max(1, Math.round((+new Date(end) - +new Date(start)) / 86_400_000));

export const seedVehicles = (): Vehicle[] => [
  {
    id: 0,
    name: 'VW T-Cross 2020',
    version: '1.0 200 TSI',
    pricePerDay: 150,
    status: 'Disponível',
    color: '#c0392b',
    category: 'SUV',
    transmission: 'Automático',
    favorite: false,
    revisions: [
      { date: '2026-09-15', km: '10.000 km', description: 'Revisão periódica' },
      { date: '2026-05-10', km: '5.000 km', description: 'Troca de óleo e filtros' },
      { date: '2026-01-12', km: '0 km', description: 'Revisão de entrega' },
    ],
  },
  {
    id: 1,
    name: 'Hyundai HB20 2021',
    version: '1.0 Comfort',
    pricePerDay: 120,
    status: 'Alugado',
    color: '#e8e8e8',
    category: 'Hatch',
    transmission: 'Manual',
    favorite: false,
    revisions: [{ date: '2026-08-02', km: '12.000 km', description: 'Revisão periódica' }],
  },
  {
    id: 2,
    name: 'Ford Ranger 2020',
    version: '3.2 Diesel',
    pricePerDay: 250,
    status: 'Em manutenção',
    color: '#b5b5b5',
    category: 'Picape',
    transmission: 'Manual',
    favorite: false,
    revisions: [{ date: '2026-10-20', km: '40.000 km', description: 'Troca de embreagem' }],
  },
  {
    id: 3,
    name: 'Fiat Argo 2019',
    version: '1.0',
    pricePerDay: 90,
    status: 'Disponível',
    color: '#7a4423',
    category: 'Hatch',
    transmission: 'Manual',
    favorite: false,
    revisions: [{ date: '2026-07-01', km: '25.000 km', description: 'Revisão periódica' }],
  },
];

export const seedClients = (): Client[] => [
  { id: 0, name: 'João Silva', type: 'PF', status: 'Ativo', document: '123.456.789-00', email: 'joao.silva@email.com', phone: '(21) 99999-0001' },
  { id: 1, name: 'Maria Oliveira', type: 'PF', status: 'Ativo', document: '987.654.321-00', email: 'maria.oliveira@email.com', phone: '(21) 99999-0002' },
  { id: 2, name: 'Auto Comércio Ltda', type: 'PJ', status: 'Ativo', document: '12.345.678/0001-90', email: 'contato@autocomercia.com.br', phone: '(21) 3333-0003' },
  { id: 3, name: 'Carlos Mendes', type: 'PF', status: 'Inativo', document: '456.123.789-00', email: 'carlos.mendes@email.com', phone: '(21) 99999-0004' },
  { id: 4, name: 'Fernanda Costa', type: 'PF', status: 'Ativo', document: '321.654.987-00', email: 'fernanda.costa@email.com', phone: '(21) 99999-0005' },
];

export const seedReservations = (): Reservation[] => [
  { id: 1026, clientName: 'Pedro Luís', mine: true, vehicleId: 0, start: '2026-11-10', end: '2026-11-13', status: 'Confirmada', total: 450, payment: 'Pago', paymentMethod: 'PIX' },
  { id: 1025, clientName: 'João Silva', mine: false, vehicleId: 0, start: '2026-10-10', end: '2026-10-13', status: 'Confirmada', total: 450, payment: 'Pago', paymentMethod: 'PIX' },
  { id: 1024, clientName: 'Maria Oliveira', mine: false, vehicleId: 1, start: '2026-10-05', end: '2026-10-07', status: 'Em andamento', total: 360, payment: 'Pago', paymentMethod: 'Cartão de crédito' },
  { id: 1023, clientName: 'Carlos Mendes', mine: false, vehicleId: 3, start: '2026-09-28', end: '2026-09-30', status: 'Concluída', total: 240, payment: 'Pendente', paymentMethod: 'PIX' },
  { id: 1022, clientName: 'Pedro Luís', mine: true, vehicleId: 3, start: '2026-08-20', end: '2026-08-22', status: 'Cancelada', total: 240, payment: 'Pago', paymentMethod: 'PIX' },
];

export const defaultProfile = (): UserProfile => ({
  name: '',
  email: '',
  phone: '',
  cnh: '',
  cnhValidity: '',
  street: '',
  city: 'Belford Roxo',
  notifyReservations: true,
  notifyPromos: false,
  foto: null,
});
