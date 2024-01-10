import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex border border-border items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary/5 text-primary",
        secondary: "border border-border bg-muted text-secondary-foreground hover:bg-secondary/50",
        success: "border-success bg-success/5 text-success",
        warning: "border-warning bg-warning/5 text-warning",
        destructive: "border-destructive bg-destructive/5 text-destructive hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
