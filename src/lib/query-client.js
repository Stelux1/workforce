import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { currentLang } from '@/api/errors';
import { SIGNED_URL_SECONDS } from '@/api/base44Client';
import { installGlobalErrorToasts, showError } from '@/lib/errorToasts';

installGlobalErrorToasts();

// Linkovi na fajlove su potpisani i važe SIGNED_URL_SECONDS (1 h). Podaci se zato osvežavaju pre isteka —
// otvorena stranica na 3/4 roka, a stranica kojoj se korisnik vrati posle pola roka odmah (QA 14.11.2026).
export const SIGNED_URL_REFRESH_MS = Math.floor(SIGNED_URL_SECONDS * 1000 * 0.75);
export const STALE_AFTER_MS = Math.floor(SIGNED_URL_SECONDS * 1000 * 0.5);

export const queryClientInstance = new QueryClient({
	// Svaka neuspela izmena i svako neuspelo učitavanje se prikazuje korisniku (stranice nemaju svoj onError).
	mutationCache: new MutationCache({
		onError: (error) => showError(error),
	}),
	queryCache: new QueryCache({
		onError: (error) => showError(error, currentLang() === 'rs' ? 'Podaci nisu učitani' : 'Data not loaded'),
	}),
	defaultOptions: {
		queries: {
			staleTime: STALE_AFTER_MS,
			refetchOnWindowFocus: true,
			refetchInterval: SIGNED_URL_REFRESH_MS,
			retry: 1,
		},
	},
});
