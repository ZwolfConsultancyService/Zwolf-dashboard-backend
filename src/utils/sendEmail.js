import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),

  secure:
    String(process.env.SMTP_SECURE) === "true",

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendEmail = async ({
  to,
  subject,
  html,
}) => {
  if (!to) {
    throw new Error("Recipient email is required");
  }

  if (!process.env.SMTP_USER) {
    throw new Error("SMTP_USER is not configured");
  }

  const info = await transporter.sendMail({
    from:
      process.env.SMTP_FROM ||
      `"Zwolf Content Solutions" <${process.env.SMTP_USER}>`,

    to,

    subject,

    html,
  });

  return info;
};