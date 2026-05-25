import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-neutral-900 text-neutral-50 dark:bg-neutral-50 dark:text-neutral-900",
        secondary: "border-transparent bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100",
        destructive: "border-transparent bg-red-500 text-neutral-50",
        outline: "text-neutral-950 dark:text-neutral-100 dark:border-neutral-600",
        critical: "border-transparent bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
        serious: "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
        moderate: "border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200",
        minor: "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
        success: "border-transparent bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
