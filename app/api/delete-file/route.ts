import { NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { join } from 'path';

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      );
    }

    // Security: Prevent directory traversal
    if (filePath.includes('..')) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      );
    }

    // Construct full path
    const fullPath = join(process.cwd(), 'public', filePath);
    
    // Delete the file
    await unlink(fullPath);
    
    return NextResponse.json({ 
      success: true,
      message: 'File deleted successfully' 
    });
    
  } catch (error: unknown) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File not found, but we'll still return success since the goal is to have the file deleted
      return NextResponse.json({ 
        success: true,
        message: 'File not found (already deleted?)' 
      });
    }
    
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to delete file',
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// Add this to prevent Next.js from caching the response
export const dynamic = 'force-dynamic';
