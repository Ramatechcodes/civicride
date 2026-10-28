import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: node scripts/promote-admin.js admin@example.com');
  process.exit(1);
}
try {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOneAndUpdate({ email }, { $set: { role: 'admin' } }, { new: true });
  if (!user) {
    console.error('No account found. Create and verify the account first, then rerun this command.');
    process.exitCode = 1;
  } else {
    console.log(`Admin role assigned to ${user.email}. Sign out and sign in again to refresh the role token.`);
  }
} finally {
  await mongoose.disconnect();
}
