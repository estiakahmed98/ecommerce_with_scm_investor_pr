// app/api/upload/route.ts
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadsRoot = path.join(process.cwd(), "public", "upload");

function guessContentType(ext: string) {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

export async function GET() {
  try {
    // This endpoint doesn't serve files directly, use /api/upload/[...slug] instead
    return NextResponse.json(
      { error: "Use /api/upload/[...slug] to retrieve files" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch file" },
      { status: 404 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Ensure the upload directory exists
    await fs.mkdir(uploadsRoot, { recursive: true });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // Generate a unique filename
    const ext = path.extname(file.name).toLowerCase();
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}${ext}`;
    const filePath = path.join(uploadsRoot, filename);

    // Convert the file to a buffer and save it
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await fs.writeFile(filePath, buffer);

    // Return the API URL of the uploaded file for consistent serving
    const fileUrl = `/upload/${filename}`;
    
    return NextResponse.json({
      success: true,
      fileUrl,
      message: "File uploaded successfully"
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
