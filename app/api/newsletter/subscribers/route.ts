//api/newsletter/subscribers

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const subscribers = await prisma.newsletterSubscriber.findMany({
      where: {
        status: "subscribed",
      },
      orderBy: { 
        createdAt: "desc"
      },
      select: {
        email: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: subscribers,
      count: subscribers.length
    });
  } catch (err) {
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to load subscribers",
        message: err instanceof Error ? err.message : "Internal server error"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { 
          success: false,
          error: "Valid email address is required"
        },
        { status: 400 }
      );
    }

    // Check if subscriber already exists
    const existingSubscriber = await prisma.newsletterSubscriber.findUnique({
      where: { email }
    });

    if (existingSubscriber) {
      return NextResponse.json(
        { 
          success: false,
          error: "Subscriber already exists"
        },
        { status: 409 }
      );
    }

    // Create new subscriber
    const subscriber = await prisma.newsletterSubscriber.create({
      data: {
        email,
        status: "subscribed",
      },
      select: {
        email: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: subscriber,
      message: "Subscriber added successfully"
    });
  } catch (err) {
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to add subscriber",
        message: err instanceof Error ? err.message : "Internal server error"
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { 
          success: false,
          error: "Email parameter is required"
        },
        { status: 400 }
      );
    }

    // Delete subscriber
    const deletedSubscriber = await prisma.newsletterSubscriber.delete({
      where: { email },
      select: {
        email: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: deletedSubscriber,
      message: "Subscriber deleted successfully"
    });
  } catch (err) {
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to delete subscriber",
        message: err instanceof Error ? err.message : "Internal server error"
      },
      { status: 500 }
    );
  }
}