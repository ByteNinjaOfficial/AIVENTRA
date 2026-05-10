import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-[#31363D] bg-[#1A1D21] px-3 text-sm text-[#ECEFF1] outline-none transition placeholder:text-[#7D8790] focus:border-[#7A8F6B]/70 focus:ring-2 focus:ring-[#7A8F6B]/20",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full rounded-xl border border-[#31363D] bg-[#1A1D21] px-3 py-3 text-sm text-[#ECEFF1] outline-none transition placeholder:text-[#7D8790] focus:border-[#7A8F6B]/70 focus:ring-2 focus:ring-[#7A8F6B]/20",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
