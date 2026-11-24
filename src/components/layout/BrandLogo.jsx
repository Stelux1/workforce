import { cn } from "@/lib/utils";

// Teamora logo iz public/ (slika1): pun logo (znak + reč) ili samo znak.
export default function BrandLogo({ variant = "full", className }) {
  const mark = variant === "mark";
  return (
    <img
      src={mark ? "/teamora-mark.png" : "/teamora-logo.png"}
      alt="Teamora"
      draggable={false}
      className={cn(mark ? "h-8 w-auto" : "h-8 w-auto", className)}
    />
  );
}
