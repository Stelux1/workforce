import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, shortDatePattern } from "@/lib/dateFormat";
import { parseISO } from "date-fns";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { CHART_COLORS, formatEur } from "./format";

const SERIES = [
  { key: "revenue", label: "Revenue", color: CHART_COLORS.revenue },
  { key: "cost", label: "Payroll Cost", color: CHART_COLORS.cost },
  { key: "profit", label: "Profit", color: CHART_COLORS.profit },
];

/** Tačka samo na poslednjoj vrednosti linije (slika2). */
function lastDot(color, lastIndex) {
  return function LastDot({ cx, cy, index }) {
    if (index !== lastIndex || cx == null || cy == null) return <g key={index} />;
    return <circle key={index} cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />;
  };
}

export default function RevenueChart({ series, hasData }) {
  const t = useT();
  const { lang } = useLang();
  const label = (iso) => formatDate(parseISO(iso), shortDatePattern(lang), lang);
  const interval = Math.max(0, Math.ceil(series.length / 8) - 1);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {t("Revenue, Costs & Profit")}
            <span title={t("Cumulative amounts of approved timesheets, by day")} className="text-muted-foreground">
              <Info className="w-4 h-4" />
            </span>
          </CardTitle>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {SERIES.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                {t(s.label)}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
            {t("No approved hours in this period")}
          </div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  {SERIES.map((s) => (
                    <linearGradient key={s.key} id={`dash-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="#EDE9FE" />
                <XAxis dataKey="date" tickFormatter={label} interval={interval} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} />
                <YAxis tickFormatter={formatEur} tickLine={false} axisLine={false} width={64} tick={{ fontSize: 11, fill: "#6B7280" }} />
                <Tooltip
                  labelFormatter={label}
                  formatter={(v, name) => [formatEur(v), t(SERIES.find((s) => s.key === name)?.label || name)]}
                  contentStyle={{ borderRadius: 10, border: "1px solid #EDE9FE", fontSize: 12 }}
                />
                {SERIES.map((s) => (
                  <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} fill={`url(#dash-${s.key})`} dot={lastDot(s.color, series.length - 1)} activeDot={{ r: 4 }} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
