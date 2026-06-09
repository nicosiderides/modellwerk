export function formatUSD(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value, suffix = '') {
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}
