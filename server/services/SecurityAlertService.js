import nodemailer from "nodemailer";

const buildTransporter = () => {
  if (!process.env.EMAIL || !process.env.EMAIL_PASSWORD) return null;

  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

export const sendSecurityAlert = async ({ to, subject, text }) => {
  if (!to || process.env.SECURITY_EMAIL_ALERTS_ENABLED === "false") return false;

  const transporter = buildTransporter();
  if (!transporter) return false;

  try {
    await transporter.sendMail({
      from: process.env.SECURITY_ALERT_FROM || process.env.EMAIL,
      to,
      subject,
      text,
    });
    return true;
  } catch (error) {
    console.error("Security alert email failed:", error.message);
    return false;
  }
};
