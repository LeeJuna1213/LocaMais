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
  category: VehicleCategory;
  transmission: Transmission | null;
  revisions: Revision[];
  favorite: boolean;
  plate?: string;
  mileage?: number;
  photo?: string | null;
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

export type ReservationStatus = 'Confirmada' | 'Em andamento' | 'Concluída' | 'Cancelada';
export type PaymentStatus = 'Pago' | 'Pendente';
export type PaymentMethod = 'PIX' | 'Cartão de crédito' | 'Cartão de débito';

export interface Reservation {
  id: number;
  clientName: string;
  mine: boolean;
  vehicleId: number;
  start: string;
  end: string;
  status: ReservationStatus;
  total: number;
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
}

export type UserRole = 'client' | 'admin';

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

export interface AutenticacaoApiResponse {
  access_token: string;
  expires_in: string;
  token_type: string;
  user: UsuarioApi;
}

export interface VehicleFilters {
  query: string;
  category: 'Todas' | VehicleCategory;
  price: 'Todos' | 'Até R$ 100' | 'R$ 100–200' | 'Acima de R$ 200';
  transmission: 'Todas' | Transmission;
}
