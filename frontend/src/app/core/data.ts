import { UserProfile } from './models';

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

export const addDays = (isoDate: string, amount: number): string =>
  new Date(+new Date(isoDate) + amount * 86_400_000).toISOString().slice(0, 10);

export const daysBetween = (start: string, end: string): number =>
  Math.max(1, Math.round((+new Date(end) - +new Date(start)) / 86_400_000));

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
  addressNumber: '',
  addressDistrict: '',
  addressComplement: '',
  addressState: '',
  addressZipCode: '',
});
