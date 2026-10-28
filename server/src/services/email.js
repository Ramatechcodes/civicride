export async function sendOtpEmail(email, code) {
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
    throw Object.assign(new Error('Email OTP is not configured. Add Brevo settings to server/.env.'), { status: 503 });
  }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'CivicRide' },
      to: [{ email }],
      subject: 'Your CivicRide verification code',
      textContent: `Your CivicRide verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      htmlContent: `<p>Your CivicRide verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. Never share this code with anyone.</p>`
    })
  });
  if (!response.ok) throw Object.assign(new Error(`Brevo email send failed (${response.status})`), { status: 502 });
}
