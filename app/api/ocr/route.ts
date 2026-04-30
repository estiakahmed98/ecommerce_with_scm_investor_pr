import { NextRequest, NextResponse } from "next/server";
import { createWorker } from "tesseract.js";
import { parseDocumentText } from "@/lib/document-parser";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const worker = await createWorker("eng");
    const result = await worker.recognize(bytes);
    await worker.terminate();

    const text = result.data.text || "";
    const parsed = parseDocumentText(text);

    return NextResponse.json({ success: true, text, parsed });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "OCR failed" },
      { status: 500 }
    );
  }
}
