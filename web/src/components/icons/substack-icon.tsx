import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
}

export function SubstackIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("h-4 w-4", className)}
      aria-hidden="true"
    >
      <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24l9.56-5.39L20.58 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z" />
    </svg>
  );
}
