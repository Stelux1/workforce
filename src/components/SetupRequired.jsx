// Prikazuje se kad .env.local nema Supabase ključeve — umesto praznog ekrana ili tihog rada bez baze.
export default function SetupRequired() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-lg w-full rounded-xl border bg-card p-6 space-y-4">
        <h1 className="text-xl font-semibold">Supabase nije podešen</h1>
        <p className="text-sm text-muted-foreground">
          Aplikacija nema adresu baze i ključ za pristup, pa ne može da radi.
        </p>
        <ol className="text-sm list-decimal pl-5 space-y-1">
          <li>
            Kopiraj <code>.env.local.example</code> u <code>.env.local</code>.
          </li>
          <li>
            Upiši <code>VITE_SUPABASE_URL</code> i <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (lokalno iz{" "}
            <code>npx supabase status</code>).
          </li>
          <li>Ponovo pokreni <code>npm run dev</code>.</li>
        </ol>
      </div>
    </div>
  );
}
