const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User.model');
const connectDB = require('../config/database');

const seedAdmin = async () => {
  try {
    await connectDB();

    const [superAdminExists, adminExists] = await Promise.all([
      User.findOne({ email: 'superadmin@attendanceiq.com' }),
      User.findOne({ email: 'admin@company.com' }),
    ]);

    if (!superAdminExists) {
      await User.create({
        name: 'Super Admin',
        email: 'superadmin@attendanceiq.com',
        password: 'Super@123',
        role: 'SuperAdmin',
        isActive: true,
      });
      console.log('✅ SuperAdmin created: superadmin@attendanceiq.com / Super@123');
    } else {
      console.log('✅ SuperAdmin already exists');
    }

    if (!adminExists) {
      const admin = await User.create({
        name: 'Admin User',
        email: 'admin@company.com',
        password: 'Admin@123',
        role: 'Admin',
        isActive: true,
      });
      admin.adminOwner = admin._id;
      await admin.save();
      console.log('✅ Admin created: admin@company.com / Admin@123');
    } else {
      console.log('✅ Admin already exists');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error seeding admin:', err.message);
    process.exit(1);
  }
};

seedAdmin();
