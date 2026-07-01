import { Card } from '@/components/ui/card';
import { cn, formatCurrency, formatPercent, getVariationColor } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: number;
  variation: number;
  icon: LucideIcon;
  isCurrency?: boolean;
  className?: string;
}

export function KpiCard({ title, value, variation, icon: Icon, isCurrency = false, className }: KpiCardProps) {
  return (
    <Card className={cn("p-4 overflow-hidden relative group", className)}>
      <div className="absolute -right-2 -top-2 opacity-5 group-hover:scale-110 transition-transform duration-500">
         <Icon className="h-24 w-24" />
      </div>
      
      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</p>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight break-words">
            {isCurrency ? formatCurrency(value, true) : value}
          </h3>
        </div>
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1 sm:gap-2 relative z-10 flex-wrap">
        <div className={cn(
          "flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0",
          variation >= 0 ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500" : "bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-500"
        )}>
          {variation >= 0 ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
          {formatPercent(variation)}
        </div>
        <span className="text-[11px] sm:text-xs text-muted-foreground">vs mois dernier</span>
      </div>
    </Card>
  );
}
