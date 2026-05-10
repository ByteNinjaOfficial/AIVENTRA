import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#7A8F6B]/25 disabled:cursor-not-allowed disabled:opacity-50",
          variant === "primary" && "bg-[#7A8F6B] text-[#111315] hover:bg-[#8EA17F]",
          variant === "secondary" && "border border-[#31363D] bg-[#23272D] text-[#ECEFF1] hover:border-[#454B53] hover:bg-[#2B3037]",
          variant === "ghost" && "text-[#A8B0B8] hover:bg-[#23272D] hover:text-[#ECEFF1]",
          variant === "danger" && "bg-[#A35D5D] text-[#ECEFF1] hover:bg-[#B16A6A]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
