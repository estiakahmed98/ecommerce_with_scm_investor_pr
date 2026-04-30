//Estiak

"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="grid h-screen place-items-center p-4">
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-medium">Something went wrong!</h2>
        <Button
          onClick={
            // Attempt to recover by trying to re-render the segment
            () => reset()
          }
          variant="outline"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
