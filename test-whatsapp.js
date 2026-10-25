import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Models ko register karna zaroori hai
import './src/models/User.js';
import './src/models/Category.js';
import './src/models/CategoryLocation.js';

import Assignment from './src/models/Assignment.js';
import { sendPendingReminder } from './src/services/whatsappService.js';

dotenv.config();

const testWhatsApp = async () => {
  try {
    // 1. Database Connect
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Database Connected');

    // 2. Database se ek Pending Assignment uthao (sirf category/location ke liye)
    const pendingAssignment = await Assignment.findOne({ status: 'Pending' })
      .populate('category', 'name')
      .populate({
        path: 'location',
        select: 'name parent',
        populate: { path: 'parent', select: 'name' },
      });

    if (!pendingAssignment) {
      console.log('❌ Koi Pending assignment nahi mili. Pehle dashboard se koi assignment Pending karo.');
      process.exit(0);
    }

    // 🆕 Yahan humne direct tera testing number daal diya hai
    const TEST_PHONE_NUMBER = '6396283875';
    const TEST_NAME = 'Test User';

    console.log(`🔍 Found Pending: ${pendingAssignment.category?.name} -> ${pendingAssignment.location?.name}`);
    console.log(`📱 Bhej rahe hain is number par: ${TEST_PHONE_NUMBER}`);

    // 3. Message Bhejo (Twilio ke through)
    const result = await sendPendingReminder({
      assignment: pendingAssignment,
      salesPerson: { name: TEST_NAME, phone: TEST_PHONE_NUMBER }, // Dummy sales person
      category: pendingAssignment.category,
      location: pendingAssignment.location,
    });

    if (result.success) {
      console.log('✅ Test Successful! WhatsApp par message check kar.');
    } else {
      console.log('❌ Test Failed:', result);
    }

    // 4. Database Disconnect
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

testWhatsApp();