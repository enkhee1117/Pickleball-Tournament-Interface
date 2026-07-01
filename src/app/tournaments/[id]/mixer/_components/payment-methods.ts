// Payment-method configuration normalizers. The event_config.payment_methods
// column is stored as free-form jsonb; these helpers coerce it into a strict
// shape for both the player Me tab and the admin Setup form.

export type PaymentMethod = {
  on: boolean;
  handle: string;
};

export type PaymentMethods = {
  zelle: PaymentMethod;
  venmo: PaymentMethod;
  cash: PaymentMethod;
};

export function normalizePaymentMethods(value: unknown): PaymentMethods {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    zelle: normalizePaymentMethod(record.zelle, true),
    venmo: normalizePaymentMethod(record.venmo, false),
    cash: normalizePaymentMethod(record.cash, true),
  };
}

export function normalizePaymentMethod(value: unknown, fallbackOn: boolean): PaymentMethod {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    on: typeof record.on === 'boolean' ? record.on : fallbackOn,
    handle: typeof record.handle === 'string' ? record.handle : '',
  };
}

export function paymentMethodRows(methods: PaymentMethods) {
  return [
    methods.zelle.on ? { key: 'zelle', label: 'Zelle', handle: methods.zelle.handle } : null,
    methods.venmo.on ? { key: 'venmo', label: 'Venmo', handle: methods.venmo.handle ? `@${methods.venmo.handle.replace(/^@/, '')}` : '' } : null,
    methods.cash.on ? { key: 'cash', label: 'Cash', handle: '' } : null,
  ].filter((row): row is { key: string; label: string; handle: string } => !!row);
}

export function firstEnabledPaymentMethod(methods: PaymentMethods) {
  if (methods.zelle.on) return 'zelle';
  if (methods.venmo.on) return 'venmo';
  return 'cash';
}
