require('dotenv').config();
const connectDB = require('../config/database');
const User = require('../models/User.model');

const seed = async () => {
  await connectDB();

  const adminExists = await User.findOne({ email: 'admin@company.com' });
  if (!adminExists) {
    await User.create({
      name: 'System Admin',
      email: 'admin@company.com',
      password: 'Admin@123',
      role: 'Admin',
    });
    console.log('✅ Admin user created: admin@company.com / Admin@123');
  } else {
    console.log('ℹ️  Admin already exists.');
  }

  process.exit(0);
};

seed().catch(console.error);