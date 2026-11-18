export const deriveNameFromEmail = (email: string): string => {
  const prefix = email.split('@')[0] ?? '';
  const words = prefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(' ') || email;
};

export const formatMoney = (value: number): string => `R$ ${value.toFixed(2).replace('.', ',')}`;

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');
