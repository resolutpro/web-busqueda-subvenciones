import { cn } from "@/lib/utils";
import { CircularProgress } from "@/components/circular-progress"; 

interface MatchScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function MatchScoreBadge({ score, size = 'md', showLabel = true }: MatchScoreBadgeProps) {
  const getColor = (s: number) => {
    if (s >= 75) return "text-emerald-600 bg-emerald-50 border-emerald-200";
    if (s >= 50) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getRingColor = (s: number) => {
    if (s >= 75) return "#059669"; // emerald-600
    if (s >= 50) return "#D97706"; // amber-600
    return "#DC2626"; // red-600
  };

  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-12 w-12 text-sm",
    lg: "h-16 w-16 text-base",
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn(
        "relative flex items-center justify-center rounded-full font-bold shadow-sm border",
        getColor(score),
        sizeClasses[size]
      )}>
        {score}%
      </div>
      {showLabel && (
        <span className={cn(
          "text-xs font-medium uppercase tracking-wider",
          score >= 75 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600"
        )}>
          Match
        </span>
      )}
    </div>
  );
}
