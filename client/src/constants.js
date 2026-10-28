export const REQUIRED_DOCS = ['identity', 'licence', 'vehicle_registration', 'insurance', 'roadworthiness'];
export const DOC_LABELS = {
  identity: 'Identity document',
  licence: "Driver's licence",
  vehicle_registration: 'Vehicle registration',
  insurance: 'Insurance',
  roadworthiness: 'Roadworthiness'
};
export const MAX_DOC_BYTES = 8 * 1024 * 1024;
export const fmtBytes = n => !n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
