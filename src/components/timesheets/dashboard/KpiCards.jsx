import { Card, CardContent } from "@/components/ui/card";
import { Clock, Users, Building2, TrendingUp } from "lucide-react";

export default function KpiCards({ labels, totalHours, employeeCount, vendorCount, avgHours }) {
  const cards = [
    { label: labels.totalHours, value: `${totalHours.toFixed(1)} h`, icon: Clock, tone: "text-primary" },
    { label: labels.employees, value: String(employeeCount), icon: Users, tone: "text-foreground" },
    { label: labels.vendors, value: String(vendorCount), icon: Building2, tone: "text-foreground" },
    { label: labels.avgHours, value: `${avgHours.toFixed(1)} h`, icon: TrendingUp, tone: "text-emerald-600" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground leading-tight">{c.label}</p>
              <c.icon className="w-4 h-4 text-primary/70 shrink-0" />
            </div>
            <p className={`text-xl md:text-2xl font-bold mt-1 ${c.tone}`}>{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}