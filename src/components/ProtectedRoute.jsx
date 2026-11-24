import { useEffect } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useL } from '@/lib/translations';
import { Button } from '@/components/ui/button';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
  </div>
);

// Jasno stanje „nemate pravo" (§15): stranica ili deo stranice za koji prijavljen korisnik nema pravo.
// Baza ionako ne vraća te podatke (RLS); ovo samo objašnjava zašto je prazno.
export function PermissionDenied({ compact = false }) {
  const L = useL();
  return (
    <div
      className={compact ? 'flex flex-col items-center justify-center py-10 px-4 text-center' : 'min-h-[60vh] flex flex-col items-center justify-center px-4 text-center'}
      data-testid="permission-denied"
      role="alert"
    >
      <div className="w-14 h-14 rounded-2xl bg-warning-soft flex items-center justify-center mb-4">
        <ShieldOff className="w-7 h-7 text-warning" />
      </div>
      <h2 className="text-lg font-semibold">{L("You don't have access", 'Nemate pristup', 'Nemáte prístup')}</h2>
      <p className="text-muted-foreground mt-1 max-w-md text-sm">
        {L(
          "Your role doesn't include the permission for this page. If you need it, ask an administrator to change your permissions in Settings → Users.",
          'Vaša uloga nema pravo za ovu stranicu. Ako vam treba, zamolite administratora da vam promeni prava u Podešavanja → Korisnici.',
          'Vaša rola nemá oprávnenie na túto stránku. Ak ho potrebujete, požiadajte administrátora o zmenu oprávnení v Nastavenia → Používatelia.'
        )}
      </p>
      {!compact && (
        <Button asChild variant="outline" className="mt-5">
          <Link to="/">{L('Back to Dashboard', 'Nazad na Dashboard', 'Späť na Dashboard')}</Link>
        </Button>
      )}
    </div>
  );
}

// `permission` (kod ili niz kodova, dovoljno je jedno) — opciono: bez prava se prikazuje PermissionDenied.
export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement, permission }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth, can } = useAuth();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  if (permission && !can(permission)) {
    return <PermissionDenied />;
  }

  return <Outlet />;
}
