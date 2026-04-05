'use strict';

const nodemailer = require('nodemailer');
const { logger } = require('./logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return transporter;
}

const FROM_NAME = process.env.EMAIL_FROM_NAME || 'KAVOX';
const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || 'noreply@kavox.com';
const FROM = `"${FROM_NAME}" <${FROM_EMAIL}>`;

// ─── Email Templates ──────────────────────────────────────────
const BASE_STYLE = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #f8f7f4;
  margin: 0;
  padding: 0;
`;

const CARD_STYLE = `
  background: white;
  border-radius: 12px;
  padding: 40px;
  max-width: 520px;
  margin: 40px auto;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
`;

const BRAND_HEADER = `
  <div style="text-align:center; margin-bottom:32px;">
    <h1 style="font-size:28px; font-weight:800; color:#1a1a1a; letter-spacing:-0.5px; margin:0;">
      KAVOX
    </h1>
    <p style="color:#9b8b7e; font-size:13px; margin:4px 0 0;">Premium Fashion Platform</p>
    <div style="height:2px; background:linear-gradient(90deg,#c8956c,#d4a574); border-radius:2px; margin:16px auto; width:60px;"></div>
  </div>
`;

function getEmailFooter() {
  return `
    <div style="margin-top:40px; padding-top:24px; border-top:1px solid #f0ede8; text-align:center;">
      <p style="font-size:12px; color:#b0a090; margin:0 0 8px;">
        © ${new Date().getFullYear()} KAVOX. All rights reserved.
      </p>
      <p style="font-size:11px; color:#c8b8a8; margin:0;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;
}

// OTP Email Template
function getOTPEmailHTML(name, otp, purpose = 'verification') {
  const purposeText = {
    verification: 'verify your email address',
    'password-reset': 'reset your password',
    'login': 'complete your login',
  }[purpose] || 'verify your action';

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="${BASE_STYLE}">
      <div style="${CARD_STYLE}">
        ${BRAND_HEADER}
        <h2 style="font-size:22px; color:#1a1a1a; margin:0 0 12px; font-weight:700;">
          Hello, ${name}!
        </h2>
        <p style="color:#6b6b6b; font-size:15px; line-height:1.6; margin:0 0 28px;">
          Use the code below to ${purposeText}. This code expires in 
          <strong>${process.env.OTP_EXPIRE_MINUTES || 10} minutes</strong>.
        </p>
        <div style="background:#f8f5f0; border:2px dashed #c8956c; border-radius:8px; padding:24px; text-align:center; margin:0 0 28px;">
          <p style="font-size:11px; color:#9b8b7e; text-transform:uppercase; letter-spacing:2px; margin:0 0 8px;">Your OTP Code</p>
          <p style="font-size:42px; font-weight:800; color:#1a1a1a; letter-spacing:12px; margin:0; font-family:monospace;">
            ${otp}
          </p>
        </div>
        <div style="background:#fef8f4; border-left:3px solid #c8956c; padding:12px 16px; border-radius:0 6px 6px 0; margin:0 0 24px;">
          <p style="font-size:13px; color:#8b6f5e; margin:0;">
            ⚠️ Never share this code with anyone. KAVOX will never ask for it.
          </p>
        </div>
        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;
}

// Welcome Email Template
function getWelcomeEmailHTML(name, role = 'user') {
  const roleText = role === 'seller' ? 'Seller' : 'Member';
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="${BASE_STYLE}">
      <div style="${CARD_STYLE}">
        ${BRAND_HEADER}
        <h2 style="font-size:24px; color:#1a1a1a; margin:0 0 16px; font-weight:700;">
          Welcome to KAVOX, ${name}! 🎉
        </h2>
        <p style="color:#6b6b6b; font-size:15px; line-height:1.6; margin:0 0 24px;">
          Your ${roleText} account has been created successfully. 
          You're now part of the KAVOX premium fashion community.
        </p>
        <div style="text-align:center; margin:32px 0;">
          <a href="${process.env.FRONTEND_URL || '#'}/shop" 
             style="background:#1a1a1a; color:white; padding:14px 36px; border-radius:4px; 
                    font-size:14px; font-weight:600; text-decoration:none; display:inline-block;
                    letter-spacing:0.5px;">
            Start Shopping
          </a>
        </div>
        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;
}

// Password Reset Success Email
function getPasswordChangedEmailHTML(name) {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="${BASE_STYLE}">
      <div style="${CARD_STYLE}">
        ${BRAND_HEADER}
        <h2 style="font-size:22px; color:#1a1a1a; margin:0 0 16px;">Password Changed ✅</h2>
        <p style="color:#6b6b6b; font-size:15px; line-height:1.6;">
          Hi ${name}, your password has been changed successfully.
        </p>
        <p style="color:#6b6b6b; font-size:14px; line-height:1.6; margin-top:16px;">
          If you didn't make this change, please contact support immediately at 
          <a href="mailto:support@kavox.com" style="color:#c8956c;">support@kavox.com</a>
        </p>
        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;
}

// ─── Send helpers ─────────────────────────────────────────────
async function sendEmail({ to, subject, html, text }) {
  if (process.env.NODE_ENV === 'test') {
    logger.debug(`[TEST] Email would be sent to: ${to}, subject: ${subject}`);
    return true;
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('SMTP not configured. Email not sent.');
    return false;
  }

  try {
    const transport = getTransporter();
    const info = await transport.sendMail({
      from: FROM,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });

    logger.info(`Email sent: ${info.messageId} to ${to}`);
    return true;
  } catch (err) {
    logger.error(`Email send failed to ${to}:`, err.message);
    return false;
  }
}

async function sendOTPEmail(email, name, otp, purpose = 'verification') {
  const subjects = {
    verification: `${otp} - Verify your KAVOX account`,
    'password-reset': `${otp} - Reset your KAVOX password`,
    login: `${otp} - Your KAVOX login code`,
  };
  return sendEmail({
    to: email,
    subject: subjects[purpose] || `${otp} - Your KAVOX code`,
    html: getOTPEmailHTML(name, otp, purpose),
  });
}

async function sendWelcomeEmail(email, name, role) {
  return sendEmail({
    to: email,
    subject: `Welcome to KAVOX, ${name}! 🎉`,
    html: getWelcomeEmailHTML(name, role),
  });
}

async function sendPasswordChangedEmail(email, name) {
  return sendEmail({
    to: email,
    subject: 'KAVOX - Your password has been changed',
    html: getPasswordChangedEmailHTML(name),
  });
}

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
};
