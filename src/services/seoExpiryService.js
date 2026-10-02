import SEO from "../models/SEO.js";
import { sendEmail } from "../utils/sendEmail.js";

const formatDate = (date) => {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};


/*
=====================================================
RENEWAL REMINDER
7 DAYS BEFORE EXPIRY
=====================================================
*/

export const processSEORenewalReminders = async () => {
  try {
    const now = new Date();

    const reminderStart = new Date(now);
    reminderStart.setDate(
      reminderStart.getDate() + 7
    );

    const seoRecords = await SEO.find({
      status: "active",

      endDate: {
        $gte: now,
        $lte: reminderStart,
      },

      renewalReminderSent: false,
    }).populate(
      "client",
      "clientName companyName email phone"
    );

    for (const seo of seoRecords) {
      try {
        if (!seo.client?.email) {
          console.log(
            `SEO renewal reminder skipped: no email for client ${seo.client?._id}`
          );

          continue;
        }

        await sendEmail({
          to: seo.client.email,

          subject:
            "Your SEO Plan Is Expiring Soon - Zwolf Content Solutions",

          html: `
            <!DOCTYPE html>
            <html>
              <body style="font-family: Arial, sans-serif; background:#f5f7fb; padding:30px;">
                
                <div style="
                  max-width:600px;
                  margin:auto;
                  background:#ffffff;
                  padding:30px;
                  border-radius:10px;
                ">

                  <h2 style="margin-top:0;">
                    SEO Plan Renewal Reminder
                  </h2>

                  <p>
                    Dear <strong>${seo.client.clientName}</strong>,
                  </p>

                  <p>
                    Your SEO plan with
                    <strong>Zwolf Content Solutions</strong>
                    is approaching its expiry date.
                  </p>

                  <div style="
                    background:#f5f7fb;
                    padding:18px;
                    border-radius:8px;
                    margin:20px 0;
                  ">

                    <p>
                      <strong>SEO Plan:</strong>
                      ${seo.planName}
                    </p>

                    <p>
                      <strong>Expiry Date:</strong>
                      ${formatDate(seo.endDate)}
                    </p>

                    <p>
                      <strong>Plan Amount:</strong>
                      ₹${seo.amount.toLocaleString("en-IN")}
                    </p>

                  </div>

                  <p>
                    Please contact our team to renew your SEO plan
                    and continue your SEO activities without interruption.
                  </p>

                  <p>
                    Regards,<br/>
                    <strong>Zwolf Content Solutions</strong>
                  </p>

                </div>

              </body>
            </html>
          `,
        });

        seo.renewalReminderSent = true;
        seo.renewalReminderSentAt = new Date();

        await seo.save();

        console.log(
          `SEO renewal reminder sent to ${seo.client.email}`
        );
      } catch (emailError) {
        console.error(
          `Failed to send renewal email for SEO ${seo._id}:`,
          emailError.message
        );
      }
    }
  } catch (error) {
    console.error(
      "SEO renewal reminder service error:",
      error
    );
  }
};


/*
=====================================================
EXPIRY PROCESS
=====================================================
*/

export const processExpiredSEO = async () => {
  try {
    const now = new Date();

    const expiredSEO = await SEO.find({
      status: "active",

      endDate: {
        $lt: now,
      },
    }).populate(
      "client",
      "clientName companyName email phone"
    );

    for (const seo of expiredSEO) {
      try {
        /*
         * First expire the SEO
         */

        seo.status = "expired";

        /*
         * Send expiry email only once
         */

        if (
          !seo.expiryEmailSent &&
          seo.client?.email
        ) {
          await sendEmail({
            to: seo.client.email,

            subject:
              "Your SEO Plan Has Expired - Renewal Required",

            html: `
              <!DOCTYPE html>
              <html>
                <body style="
                  font-family: Arial, sans-serif;
                  background:#f5f7fb;
                  padding:30px;
                ">

                  <div style="
                    max-width:600px;
                    margin:auto;
                    background:#ffffff;
                    padding:30px;
                    border-radius:10px;
                  ">

                    <h2 style="margin-top:0;">
                      Your SEO Plan Has Expired
                    </h2>

                    <p>
                      Dear <strong>${seo.client.clientName}</strong>,
                    </p>

                    <p>
                      Your SEO plan with
                      <strong>Zwolf Content Solutions</strong>
                      has expired.
                    </p>

                    <div style="
                      background:#f5f7fb;
                      padding:18px;
                      border-radius:8px;
                      margin:20px 0;
                    ">

                      <p>
                        <strong>SEO Plan:</strong>
                        ${seo.planName}
                      </p>

                      <p>
                        <strong>Plan Start:</strong>
                        ${formatDate(seo.startDate)}
                      </p>

                      <p>
                        <strong>Plan Expiry:</strong>
                        ${formatDate(seo.endDate)}
                      </p>

                    </div>

                    <p>
                      To continue your SEO services and ongoing
                      optimization, please renew your SEO plan.
                    </p>

                    <p>
                      Please contact the
                      <strong>Zwolf Content Solutions</strong>
                      team for renewal.
                    </p>

                    <p>
                      Regards,<br/>
                      <strong>Zwolf Content Solutions</strong>
                    </p>

                  </div>

                </body>
              </html>
            `,
          });

          seo.expiryEmailSent = true;
          seo.expiryEmailSentAt = new Date();
        }

        await seo.save();

        console.log(
          `SEO expired: ${seo._id}`
        );
      } catch (error) {
        console.error(
          `Failed processing SEO ${seo._id}:`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error(
      "SEO expiry service error:",
      error
    );
  }
};