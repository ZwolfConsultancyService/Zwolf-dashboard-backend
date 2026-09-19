import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';

import User from '../models/User.js';

const run = async () => {
  try {
    await connectDB();
    console.log('🌱 Seeding database...');

    // Existing users delete karo
    await User.deleteMany({});

    // Manager database mein create karo
    const manager = await User.create({
      name: 'Zwolf',
      email: 'zwolfconsultancyservice@gmail.com',
      password: 'password123',
      role: 'manager',
      phone: '9000000001',
      department: 'Management',
      designation: 'General Manager',
    });

    console.log('✅ Manager created successfully!');
    console.log('\nManager credentials:');
    console.log('  Name:     Zwolf');
    console.log('  Email:    zwolfconsultancyservice@gmail.com');
    console.log('  Password: password123');
    console.log('  Role:     manager');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

run();