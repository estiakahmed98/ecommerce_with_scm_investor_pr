import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { valid: false, error: "Email is required" },
        { status: 400 }
      );
    }

    // ---- MailboxLayer API ----
    const API_KEY = process.env.MAILBOX_API_KEY || "5ead9791b517f570406ad3f1c9911bdd";

    const url = `http://apilayer.net/api/check?access_key=${API_KEY}&email=${email}&smtp=1&format=1`;

    const res = await fetch(url);
    const data = await res.json();

    /*
      Important fields:
      data.format_valid → format OK
      data.mx_found → mail server found
      data.smtp_check → email exists (most important)
      data.disposable → temporary email?
    */

    const isValid =
      data.format_valid &&
      data.mx_found &&
      data.smtp_check &&
      !data.disposable;

    return NextResponse.json({
      valid: isValid,
      reason: data,
    });
  } catch (error) {
    console.error("Email check error:", error);
    return NextResponse.json(
      { valid: false, error: "Failed to validate" },
      { status: 500 }
    );
  }
}
