import { TriangleAlert } from "lucide-react";

export const FormError = ({ message }: { message?: string }) => {
  if (!message) return null;

  return (
    <p className="mt-4 flex items-center gap-2 rounded-md bg-amber-500/10 px-4 py-3 text-sm tracking-wide text-amber-500">
      <TriangleAlert className="size-5 shrink-0 stroke-[1.5]" />
      <span>{message}</span>
    </p>
  );
};
