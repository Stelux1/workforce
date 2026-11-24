import { NAV_LABELS } from "@/components/layout/navConfig";

/** Naslov stranice = naziv stavke u meniju (isti ključ i isti jezik), da se meni i naslov nikad ne razilaze. */
export function pageTitle(key, lang) {
  return (NAV_LABELS[lang] || NAV_LABELS.en)[key] ?? NAV_LABELS.en[key] ?? key;
}
