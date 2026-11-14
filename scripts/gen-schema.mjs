// Generiše src/api/schema.generated.js (spisak kolona po tabeli) iz lokalne Supabase baze.
// Pokretanje: npm run gen:schema  (posle svake nove migracije)
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const env = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8" })
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    })
);
if (!env.API_URL || !env.SECRET_KEY) throw new Error("Lokalni Supabase ne radi (npx supabase start)");

const res = await fetch(`${env.API_URL}/rest/v1/`, { headers: { apikey: env.SECRET_KEY } });
if (!res.ok) throw new Error(`OpenAPI ${res.status}: ${await res.text()}`);
const spec = await res.json();
const tables = {};
for (const [name, def] of Object.entries(spec.definitions || {}).sort()) {
  tables[name] = Object.keys(def.properties || {});
}
writeFileSync(
  new URL("../src/api/schema.generated.js", import.meta.url),
  `// Generisano iz lokalne baze: npm run gen:schema. Ne menjati ručno.\nexport const TABLE_COLUMNS = ${JSON.stringify(tables, null, 2)};\n`
);
console.log(`schema.generated.js: ${Object.keys(tables).length} tabela`);
