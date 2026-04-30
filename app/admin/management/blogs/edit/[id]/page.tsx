import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import BlogForm from "@/components/admin/blog/BlogForm";

interface EditBlogPageProps {
  params: Promise<{
    id: string;
  }>;
}

interface BlogData {
  id: number;
  title: string;
  summary: string;
  content: string;
  date: Date;
  author: string;
  image: string;
  ads?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export default async function EditBlogPage({ params }: EditBlogPageProps) {
  const awaited = await params;
  const blog = (await prisma.blog.findUnique({
    where: { id: parseInt(awaited.id) },
  })) as unknown as BlogData | null;

  if (!blog) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F4F8F7] to-[#EEEFE0] p-4 sm:p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0E4B4B] to-[#086666] rounded-2xl shadow-lg p-6 border border-[#F4F8F7]/10">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-br from-[#F4F8F7]/20 to-[#EEEFE0]/20 p-3 rounded-xl border border-[#F4F8F7]/30">
              <svg
                className="w-6 h-6 text-[#F4F8F7]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#F4F8F7]">
                Edit Blog Post
              </h1>
              <p className="text-[#F4F8F7]/70 text-sm mt-1">
                Update your blog post content and details
              </p>
            </div>
          </div>

          {/* Breadcrumb */}
          <nav className="flex space-x-2 text-sm text-[#F4F8F7]/70 mt-4">
            <Link
              href="/admin"
              className="hover:text-[#F4F8F7] transition-colors duration-300"
            >
              Dashboard
            </Link>
            <span>/</span>
            <Link
              href="/admin/management/blogs"
              className="hover:text-[#F4F8F7] transition-colors duration-300"
            >
              Blogs
            </Link>
            <span>/</span>
            <span className="text-[#F4F8F7] font-medium">Edit</span>
          </nav>
        </div>

        {/* Blog Form */}
        <div className="bg-white/90 backdrop-blur-sm border border-[#D1D8BE] rounded-2xl shadow-lg p-6">
          <BlogForm blog={blog} />
        </div>
      </div>
    </div>
  );
}
