// import axios from 'axios';

// const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
// const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
// const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v18.0';
// const MOCK_MODE = process.env.WHATSAPP_MOCK === 'true'; // 👈 Yeh check karega

// export const sendWhatsAppText = async (to, message) => {
//   // 🧪 MOCK MODE (Jab asli WhatsApp nahi chalu hai)
//   if (MOCK_MODE) {
//     console.log('\n==================================================');
//     console.log(`🚀 [MOCK WHATSAPP MESSAGE SENT]`);
//     console.log(`📱 To: ${to}`);
//     console.log(`📝 Message:\n${message}`);
//     console.log('==================================================\n');
//     return { success: true, mock: true };
//   }

//   // Asli WhatsApp API Call (Jab Mock false hoga)
//   if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
//     return { success: false, reason: 'missing_credentials' };
//   }

//   const cleanPhone = String(to).replace(/\D/g, '');
//   const formatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

//   try {
//     const res = await axios.post(
//       `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
//       {
//         messaging_product: 'whatsapp',
//         to: formatted,
//         type: 'text',
//         text: { body: message },
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${ACCESS_TOKEN}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     );
//     return { success: true, data: res.data };
//   } catch (err) {
//     console.error('[WhatsApp] Error:', err.response?.data || err.message);
//     return { success: false, error: err.response?.data || err.message };
//   }
// };

// // 🔔 Yeh function tera exact message banayega
// export const sendPendingReminder = async ({ salesPerson, category, location }) => {
//   if (!salesPerson?.phone) {
//     console.warn(`[WhatsApp] ⚠️ Sales person ${salesPerson?.name} ka phone number database mein nahi hai!`);
//     return { success: false, reason: 'no_phone' };
//   }

//   const locationPath = location?.parent?.name
//     ? `${location.parent.name} → ${location.name}`
//     : location?.name || '';

//   // 🎯 TERA EXACT MESSAGE FORMAT
//   const message =
//     `🔔 Reminder: Pending Task\n\n` +
//     `Hi ${salesPerson.name || 'there'},\n\n` +
//     `Aapki yeh assignment abhi bhi PENDING hai:\n\n` +
//     `📂 Category: ${category?.name || '-'}\n` +
//     `📍 Location: ${locationPath}\n\n` +
//     `⏰ Please complete this task and mark it as Done in the dashboard.\n\n` +
//     `— Zwolf Dashboard`;

//   return sendWhatsAppText(salesPerson.phone, message);
// };



import twilio from 'twilio';

// Twilio setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER; // e.g., 'whatsapp:+14155238886'

let client;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
}

export const sendWhatsAppText = async (to, message) => {
  const MOCK_MODE = process.env.WHATSAPP_MOCK === 'true';
  
  // Agar mock mode true hai toh terminal pe print karega
  if (MOCK_MODE || !client) {
    console.log('\n==================================================');
    console.log(`🚀 [MOCK WHATSAPP MESSAGE SENT]`);
    console.log(`📱 To: ${to}`);
    console.log(`📝 Message:\n${message}`);
    console.log('==================================================\n');
    return { success: true, mock: true };
  }

  try {
    // Number format clean karo (bina +91 ke bhi kaam karega)
    const cleanPhone = String(to).replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 10 ? `+91${cleanPhone}` : `+${cleanPhone}`;

    // Twilio se message bhejo
    const twilioMessage = await client.messages.create({
      from: twilioNumber,
      to: `whatsapp:${formattedPhone}`,
      body: message,
    });

    console.log(`[WhatsApp] Sent via Twilio! SID: ${twilioMessage.sid}`);
    return { success: true, data: twilioMessage };
    
  } catch (err) {
    console.error('[WhatsApp Twilio Error]:', err.message);
    return { success: false, error: err.message };
  }
};

export const sendPendingReminder = async ({ salesPerson, category, location }) => {
  if (!salesPerson?.phone) {
    console.warn(`[WhatsApp] ⚠️ Sales person ${salesPerson?.name} ka phone number database mein nahi hai!`);
    return { success: false, reason: 'no_phone' };
  }

  const locationPath = location?.parent?.name
    ? `${location.parent.name} → ${location.name}`
    : location?.name || '';

  const message =
    `🔔 Reminder: Pending Task\n\n` +
    `Hi ${salesPerson.name || 'there'},\n\n` +
    `Aapki yeh assignment abhi bhi PENDING hai:\n\n` +
    `📂 Category: ${category?.name || '-'}\n` +
    `📍 Location: ${locationPath}\n\n` +
    `⏰ Please complete this task and mark it as Done in the dashboard.\n\n` +
    `— Zwolf Dashboard`;

  return sendWhatsAppText(salesPerson.phone, message);
};