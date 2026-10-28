// Intentionally disabled by default. Add a real provider SDK/API here.
// Do not return success unless the provider confirms acceptance of the SMS.
// Free trials may exclude Nigerian destinations or require verified test numbers.
export async function sendSmsOtp(_phone, _code) {
  if (!process.env.SMS_PROVIDER || process.env.SMS_PROVIDER === 'disabled') {
    throw Object.assign(new Error('SMS OTP is not configured. Use email OTP or configure a supported SMS provider.'), { status: 503 });
  }
  throw Object.assign(new Error('SMS provider adapter is not implemented yet.'), { status: 501 });
}
