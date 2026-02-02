import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, HTMLMotionProps } from "framer-motion";
import { LucideIcon } from "lucide-react";
import React from "react";

const statCardVariants = cva(
  "relative overflow-hidden rounded-xl p-5 transition-all duration-300 hover:shadow-lg",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground",
        accent: "bg-accent text-accent-foreground",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "bg-card text-card-foreground border border-border shadow-card",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  }
);

interface StatCardProps extends VariantProps<typeof statCardVariants> {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  variant,
  className,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(statCardVariants({ variant }), className)}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className={cn(
            "text-sm font-medium",
            variant === "outline" ? "text-muted-foreground" : "opacity-90"
          )}>
            {title}
          </p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {subtitle && (
            <p className={cn(
              "text-xs",
              variant === "outline" ? "text-muted-foreground" : "opacity-75"
            )}>
              {subtitle}
            </p>
          )}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium",
              trend.isPositive ? "text-success" : "text-destructive"
            )}>
              <span>{trend.isPositive ? "+" : ""}{trend.value}%</span>
              <span className="opacity-70">vs último mês</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "rounded-lg p-2.5",
            variant === "outline" 
              ? "bg-secondary text-secondary-foreground" 
              : "bg-white/20"
          )}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      
      {/* Decorative gradient overlay */}
      {variant !== "outline" && (
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
      )}
    </motion.div>
  );
}
