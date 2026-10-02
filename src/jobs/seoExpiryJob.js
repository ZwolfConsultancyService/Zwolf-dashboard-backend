import cron from "node-cron";

import {
  processSEORenewalReminders,
  processExpiredSEO,
} from "../services/seoExpiryService.js";


const runSEOExpiryJob = async () => {
  console.log(
    "Running SEO expiry job..."
  );

  await processSEORenewalReminders();

  await processExpiredSEO();

  console.log(
    "SEO expiry job completed."
  );
};


/*
=====================================================
EVERY DAY AT 9:00 AM
=====================================================
*/

cron.schedule(
  "0 9 * * *",
  async () => {
    await runSEOExpiryJob();
  },
  {
    timezone: "Asia/Kolkata",
  }
);


export default runSEOExpiryJob;