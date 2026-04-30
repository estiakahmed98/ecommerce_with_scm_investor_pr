import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string;
  variant?: "default" | "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function Skeleton({ 
  className, 
  variant = "default", 
  width, 
  height,
  lines = 1 
}: SkeletonProps) {
  const variantClasses = {
    default: "rounded-md",
    text: "rounded",
    circular: "rounded-full",
    rectangular: "rounded-none"
  }

  const style = {
    width: width || (variant === "text" ? "100%" : undefined),
    height: height || (variant === "text" ? "1rem" : undefined)
  }

  if (variant === "text" && lines > 1) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 animate-pulse rounded",
              variantClasses[variant]
            )}
            style={{
              width: i === lines - 1 ? "70%" : (width || "100%"),
              height: height || "1rem"
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 animate-pulse",
        variantClasses[variant],
        className
      )}
      style={style}
    />
  )
}

export function BookDetailSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F4F8F7]/30 to-white py-8 md:py-12 lg:py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb Skeleton */}
        <div className="flex items-center gap-4 mb-6">
          <Skeleton width={120} height={20} />
          <Skeleton variant="circular" width={8} height={32} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-12">
          {/* Book Image Skeleton */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border-0">
            <Skeleton 
              className="w-full h-[400px] lg:h-[500px] rounded-xl" 
              variant="rectangular" 
            />
            {/* Action Buttons Skeleton */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Skeleton height={48} className="rounded-xl" />
              <Skeleton height={48} className="rounded-xl" />
            </div>
          </div>

          {/* Book Details Skeleton */}
          <div className="bg-white rounded-2xl shadow-lg p-6 lg:p-8 border-0">
            {/* Category Skeleton */}
            <Skeleton width={100} height={20} className="mb-4" />
            
            {/* Title Skeleton */}
            <Skeleton width="90%" height={36} className="mb-4" />
            <Skeleton width="70%" height={36} className="mb-4" />

            {/* Rating Skeleton */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} width={20} height={20} variant="circular" />
                ))}
              </div>
              <Skeleton width={150} height={16} />
              <Skeleton variant="circular" width={4} height={4} />
              <Skeleton width={80} height={16} />
            </div>

            {/* Price Skeleton */}
            <div className="mb-6 p-4 bg-gradient-to-r from-[#F4F8F7] to-[#5FA3A3]/20 rounded-xl border border-[#5FA3A3]/30">
              <div className="flex items-baseline gap-3">
                <Skeleton width={80} height={36} />
                <Skeleton width={60} height={24} />
                <Skeleton width={80} height={32} className="rounded-full" />
              </div>
            </div>

            {/* Author & Publisher Skeleton */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 p-3 bg-[#F4F8F7] rounded-xl border border-[#5FA3A3]/30">
                <Skeleton width={20} height={20} variant="circular" />
                <Skeleton width={200} height={16} />
              </div>
              <div className="flex items-center gap-3 p-3 bg-[#F4F8F7] rounded-xl border border-[#5FA3A3]/30">
                <Skeleton width={20} height={20} variant="circular" />
                <Skeleton width={180} height={16} />
              </div>
            </div>

            {/* Description Skeleton */}
            <div className="mb-6">
              <Skeleton lines={3} className="mb-4" />
            </div>

            {/* Quantity & Actions Skeleton */}
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-[#F4F8F7] rounded-xl border border-[#5FA3A3]/30">
                <Skeleton width={60} height={16} />
                <Skeleton width={120} height={40} className="rounded-lg" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Skeleton height={48} className="rounded-xl" />
                <div className="flex gap-2">
                  <Skeleton width={48} height={48} className="rounded-xl" />
                  <Skeleton width={48} height={48} className="rounded-xl" />
                </div>
              </div>
            </div>

            {/* Trust Features Skeleton */}
            <div className="mt-6 pt-6 border-t border-[#5FA3A3]/30">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <Skeleton width={16} height={16} />
                  <Skeleton width={100} height={12} />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton width={16} height={16} />
                  <Skeleton width={100} height={12} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Skeleton */}
        <div className="bg-white rounded-2xl shadow-lg border-0 overflow-hidden">
          <div className="grid w-full grid-cols-3 bg-[#F4F8F7] p-2 border border-[#5FA3A3]/30">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={40} className="rounded-lg" />
            ))}
          </div>
          <div className="p-6 lg:p-8">
            <Skeleton lines={4} />
          </div>
        </div>
      </div>
    </div>
  )
}
