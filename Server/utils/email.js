import nodemailer from 'nodemailer';

const getTransporter = () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return null;
};

export const sendSecurityEmail = async ({ to, subject, text, html }) => {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      console.log(`[EMAIL NOTICE] No SMTP configured. To: ${to} | Subject: "${subject}" | Content: ${text}`);
      return;
    }
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html
    });
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error.message);
  }
};
