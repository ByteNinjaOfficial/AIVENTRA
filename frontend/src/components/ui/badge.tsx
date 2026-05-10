import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "cyan",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "cyan" | "red" | "yellow" | "green" | "violet" | "slate" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.16em]",
        tone === "cyan" && "border-[#7A8F6B]/40 bg-[#7A8F6B]/10 text-[#C9D4C0]",
        tone === "red" && "border-[#A35D5D]/40 bg-[#A35D5D]/10 text-[#E0B9B9]",
        tone === "yellow" && "border-[#B08D57]/40 bg-[#B08D57]/10 text-[#E2C99C]",
        tone === "green" && "border-[#6E8B74]/40 bg-[#6E8B74]/10 text-[#C3D2C7]",
        tone === "violet" && "border-[#B08D57]/30 bg-[#B08D57]/10 text-[#D8BE8D]",
        tone === "slate" && "border-[#A8B0B8]/20 bg-[#A8B0B8]/10 text-[#C9CED3]",
        className
      )}
      {...props}
    />
  );
}
