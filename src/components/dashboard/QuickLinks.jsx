import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useL } from "@/lib/translations";

/** Quick Links (spec §3.3): `links` = [{ key, label, icon, to }] već filtrirane po pravima korisnika. */
export default function QuickLinks({ links }) {
  const L = useL();
  if (links.length === 0) return null;
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{L("Quick Links", "Brze veze", "Rýchle odkazy")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
          {links.map(({ key, label, icon: Icon, to }) => (
            <li key={key}>
              <Link to={to} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm font-medium hover:border-primary/40 hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="w-8 h-8 shrink-0 rounded-md bg-primary/10 flex items-center justify-center"><Icon className="w-4 h-4 text-primary" /></span>
                <span className="leading-tight">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
