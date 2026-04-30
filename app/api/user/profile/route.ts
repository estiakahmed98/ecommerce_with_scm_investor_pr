import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      image: true,
      note: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;

  const body = await request.json();
  const { name, phone, image, note } = body;

  let finalImageUrl = undefined;

  // ✅ যদি image থাকে → এটাকে /api/upload/${folder}/${filename} format-এ convert করি
  if (image) {
    try {
      const url = new URL(image);
      const pathname = url.pathname; // /folder/filename.ext

      const parts = pathname.split("/").filter(Boolean); 
      const folder = parts[0];       // userProfilePic
      const filename = parts[1];     // abc.jpg

      finalImageUrl = `/api/upload/${folder}/${filename}`; 
    } catch {
      // যদি image already a correct path হয় → সেভাবেই রাখো
      finalImageUrl = image;
    }
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      name: name ?? undefined,
      phone: phone ?? undefined,
      image: finalImageUrl ?? undefined,
      note: note ?? undefined,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      image: true,
      note: true,
    },
  });

  return NextResponse.json(updated);
}

