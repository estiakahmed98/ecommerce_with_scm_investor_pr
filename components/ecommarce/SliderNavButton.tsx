"use client";

import { cn } from "@/lib/utils";

type SliderNavButtonProps = {
  direction: "left" | "right";
  onClick: () => void;
  className?: string;
};

export default function SliderNavButton({
  direction,
  onClick,
  className,
}: SliderNavButtonProps) {
  const isLeft = direction === "left";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isLeft ? "Scroll left" : "Scroll right"}
      className={cn(
        "absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center",
        "slider-nav-btn",
        "transition-all duration-300 ease-out",
        isLeft
          ? "-left-6 -translate-x-3 opacity-0 pointer-events-none group-hover/slider:translate-x-0"
          : "-right-6 translate-x-3 opacity-0 pointer-events-none group-hover/slider:translate-x-0",
        "group-hover/slider:opacity-100 group-hover/slider:pointer-events-auto",
        "active:scale-95 md:flex",
        className
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        {isLeft ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
      </svg>
    </button>
  );
}