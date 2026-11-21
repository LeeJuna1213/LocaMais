export type VehicleStatus = 'Disponível' | 'Alugado' | 'Em manutenção';
export type VehicleCategory = 'SUV' | 'Hatch' | 'Picape';
export type Transmission = 'Automático' | 'Manual';

export interface Revision {
  date: string;
  km: string;
  description: string;
}

export interface Vehicle {
  id: number;
  name: string;
  version: string;
  pricePerDay: number;
  status: VehicleStatus;
  color: string;
  category: string;
  transmission: Transmission | null;
  revisions: Revision[];
  favorite: boolean;
  plate?: string;
  mileage?: number;
  photo?: string | null;
  make?: string;
  model?: string;
  year?: number;
  lugares?: number | null;
  descricao?: string | null;
}

export type ClientType = 'PF' | 'PJ';
export type ClientStatus = 'Ativo' | 'Inativo';

export interface Client {
  id: number;
  name: string;
  type: ClientType;
  status: ClientStatus;
  document: string;
  email: string;
  phone: string;
}

export type ReservationStatus = 'Pendente' | 'Confirmada' | 'Em andamento' | 'Concluída' | 'Cancelada';
export type PaymentStatus = 'Pago' | 'Pendente';
export type PaymentMethod = 'PIX' | 'Cartão de crédito' | 'Cartão de débito';

export interface Reservation {
  id: string;
  publicCode?: string | null;
  clientName: string;
  mine: boolean;
  clientId?: number;
  vehicleId: number;
  vehicle?: Vehicle;
  start: string;
  end: string;
  status: ReservationStatus;
  total: number;
  subtotal?: number;
  serviceFee?: number;
  payment: PaymentStatus;
  paymentMethod: PaymentMethod;
}

export interface Account {
  email: string;
  name: string;
  type: ClientType;
  password: string;
  phone: string;
}

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  cnh: string;
  cnhValidity: string;
  street: string;
  city: string;
  notifyReservations: boolean;
  notifyPromos: boolean;
  foto: string | null;
  addressNumber: string;
  addressDistrict: string;
  addressComplement: string;
  addressState: string;
  addressZipCode: string;
  paymentPreference: string;
}

export type UserRole = 'client' | 'funcionario' | 'admin';

export type ApiUserType = 'admin' | 'funcionario' | 'cliente';
export interface UsuarioApi {
  id: number;
  name: string;
  email: string;
  foto?: string | null;
  active: boolean;
  type: ApiUserType;
  client: {
    id: number;
    tipo_pessoa: ClientType;
    cpf: string | null;
    cnpj: string | null;
    data_nascimento: string | null;
    razao_social: string | null;
    telefone: string | null;
    cnh_numero: string | null;
    cnh_validade: string | null;
    metodo_pagamento_preferido: string | null;
    address: {
      logradouro: string;
      numero: string;
      complemento: string | null;
      bairro: string;
      cidade: string;
      uf: string;
      cep: string;
      pais: string;
    } | null;
  } | null;
}

export interface CustomerPaymentApi {
  id: string;
  valor: number | string;
  metodo: string;
  status: 'pendente' | 'aprovado' | 'recusado' | 'cancelado';
  data: string;
  locacao_id: string;
  locacao?: {
    id: string;
    created_at: string;
    reservation?: { id: string; car?: { marca: string; modelo: string; placa: string; foto?: string | null } | null } | null;
  } | null;
}

export interface PaymentReceipt {
  empresa: string;
  reciboId: string;
  pagamentoId: string;
  locacaoId: string;
  cliente?: string;
  veiculo?: string;
  placa?: string;
  valorPago: number;
  metodoPagamento: string;
  dataConfirmacao: string;
  status: string;
  aviso: string;
}

export interface Usuario {
  id: number;
  name: string;
  email: string;
  type: ApiUserType;
  active: boolean;
  foto: string | null;
}

export interface RevisaoApi {
  id: string;
  data: string;
  descricao: string;
  km: number;
  valor: number;
  carro_id: number;
  carro?: { id: number; placa: string } | null;
  created_at: string;
  updated_at: string;
}

export interface RevisionCostByVehicleApi {
  carro_id: number;
  quantidade: number | string;
  total: number | string;
}

export interface CreateRevisaoInput {
  data: string;
  descricao: string;
  km: number;
  valor: number;
  carroId: number;
}

export interface UpdateRevisaoInput {
  descricao?: string;
  valor?: number;
  data?: string;
}

export interface AutenticacaoApiResponse {
  access_token: string;
  expires_in: string;
  token_type: string;
  user: UsuarioApi;
}

export interface VehicleFilters {
  query: string;
  category: 'Todas' | string;
  price: 'Todos' | 'Até R$ 100' | 'R$ 100–200' | 'Acima de R$ 200';
  transmission: 'Todas' | Transmission;
  make?: string;
  model?: string;
  status?: 'Todos' | VehicleStatus;
  priceMin?: number | null;
  priceMax?: number | null;
}
