import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM_EMAIL || SMTP_USER;

if (!SMTP_USER || !SMTP_PASS) {
  console.error("❌ Missing SMTP_USER or SMTP_PASS in .env");
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  );
}

const buildEmailHTML = (resetLink: string) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #0E4B4B 0%, #086666 100%); color: #fff; padding: 30px; border-radius: 12px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px;">পাসওয়ার্ড রিসেট</h1>
      <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">হিলফুল-ফুযুল বইয়ের দোকান</p>
    </div>

    <div style="background: #F4F8F7; padding: 30px; margin-top: 20px; border-radius: 12px; border: 1px solid #D1D8BE;">
      <h2 style="color: #0D1414; margin-top: 0;">পাসওয়ার্ড রিসেটের অনুরোধ</h2>
      
      <p style="color: #2D4A3C; line-height: 1.6; margin: 15px 0;">
        আপনার অ্যাকাউন্টের জন্য পাসওয়ার্ড রিসেট করার অনুরোধ পেয়েছি।
      </p>
      
      <p style="color: #2D4A3C; line-height: 1.6; margin: 15px 0;">
        নীচের বাটনে ক্লিক করে আপনার পাসওয়ার্ড রিসেট করুন:
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" 
           style="background: linear-gradient(135deg, #0E4B4B 0%, #086666 100%); color: #fff; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
          পাসওয়ার্ড রিসেট করুন
        </a>
      </div>
      
      <p style="color: #666; font-size: 12px; margin: 20px 0;">অথবা এই লিঙ্কটি কপি করে আপনার ব্রাউজারে পেস্ট করুন:</p>
      <p style="word-break: break-all; background: #fff; padding: 12px; border-radius: 6px; border: 1px solid #D1D8BE; color: #0E4B4B; font-size: 12px; font-family: monospace;">
        ${resetLink}
      </p>
      
      <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 6px; margin-top: 20px;">
        <p style="margin: 0; color: #856404; font-size: 13px;">
          <strong>⚠️ গুরুত্বপূর্ণ:</strong> এই লিঙ্কটি 15 মিনিটের মধ্যে ব্যবহার করতে হবে।
        </p>
      </div>
    </div>

    <div style="background: #0E4B4B; color: #fff; padding: 20px; margin-top: 20px; border-radius: 12px; text-align: center; font-size: 13px;">
      <p style="margin: 0 0 10px 0;">
        যদি আপনি এই অনুরোধ না করে থাকেন, তাহলে এই ইমেইলটি নিরাপদে উপেক্ষা করুন।
      </p>
      <p style="margin: 0; opacity: 0.8;">
        © হিলফুল-ফুযুল বইয়ের দোকান • সকল অধিকার সংরক্ষিত
      </p>
    </div>
  </div>
`;

export async function POST(req: Request) {
  try {
    // Validate SMTP config
    if (!SMTP_USER || !SMTP_PASS) {
      return NextResponse.json(
        { error: "SMTP not configured. Add SMTP_USER + SMTP_PASS in .env." },
        { status: 500 }
      );
    }

    const { email } = await req.json();

    // Validate email format
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Invalid email provided" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Check if user exists (security: don't reveal)
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Delete existing reset tokens for this email
    await prisma.passwordResetToken.deleteMany({
      where: { email },
    });

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store token in DB
    await prisma.passwordResetToken.create({
      data: {
        email,
        token,
        expiresAt,
      },
    });

    const resetLink = `${getBaseUrl()}/reset-password?token=${token}`;

    // Send email
    await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: "হিলফুল-ফুযুল - পাসওয়ার্ড রিসেট",
      html: buildEmailHTML(resetLink),
      text: `পাসওয়ার্ড রিসেট করতে এই লিঙ্কে যান: ${resetLink}`,
    });

    console.log(`✓ Password reset email sent to: ${email}`);

    return NextResponse.json({ 
      success: true,
      message: "If an account exists with this email, a reset link has been sent."
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unknown error";
    console.error("Forgot password SMTP Error:", message);
    return NextResponse.json(
      { error: "Failed to process request", details: message },
      { status: 500 }
    );
  }
}
