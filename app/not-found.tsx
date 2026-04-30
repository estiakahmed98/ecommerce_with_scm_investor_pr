"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
      {/* subtle grid bg */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
        }}
      />

      {/* glow vignette */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-25 bg-primary" />
      </div>


      {/* center content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-2xl text-center">
          {/* 404 pixel look */}
          <div className="mx-auto inline-flex flex-col items-center">
            <div
              className="
                select-none font-black leading-none
                text-[90px] sm:text-[120px] md:text-[150px]
                tracking-[0.08em]
              "
              style={{
                color: "hsl(var(--primary))",
                textShadow:
                  "0 0 12px rgba(0,0,0,0.35), 0 0 18px hsl(var(--primary) / 0.55)",
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              }}
            >
              404
            </div>

            <div className="mt-4 text-sm sm:text-base text-primary">
              Signal Lost... Searching for Home Base
            </div>

            <div className="mt-8">
              <Button
                asChild
                className="
                  btn-primary
                  h-11 px-10 rounded-md
                  shadow-sm hover:shadow-md
                  transition
                "
              >
                <Link href="/">Go to Home</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}