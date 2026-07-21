import { ExternalLink, FlaskConical } from "lucide-react";

interface JanoshikBadgeProps {
  taskId?: string | null;
  className?: string;
  variant?: "inline" | "footer";
}

export function JanoshikBadge({ taskId, className = "", variant = "footer" }: JanoshikBadgeProps) {
  const href = taskId
    ? `https://janoshik.com/order/${taskId}`
    : "https://janoshik.com";

  if (variant === "inline") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:text-primary/80 transition-colors ${className}`}
      >
        <FlaskConical className="h-3 w-3" />
        <span>Janoshik</span>
        {taskId && <span className="text-muted-foreground">#{taskId}</span>}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <div className={`flex justify-center ${className}`}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-xs font-mono text-primary hover:text-primary/80 transition-colors uppercase tracking-widest"
      >
        <FlaskConical className="h-3.5 w-3.5" />
        Verified by Janoshik Analytical
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
