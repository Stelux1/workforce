import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LanguageContext';

// Prijavljen nalog bez pristupa: nov nalog je neaktivan dok ga admin ne aktivira (handle_new_user), ili nema profil.
const TEXT = {
  en: {
    inactiveTitle: 'Account not activated yet',
    inactive: 'Your account has been created, but an administrator hasn\'t activated it yet. Ask the administrator to activate it.',
    missingTitle: 'Access Restricted',
    missing: 'You are not registered to use this application. Please contact the app administrator to request access.',
    hintTitle: 'If you believe this is an error, you can:',
    hints: ['Verify you are logged in with the correct account', 'Contact the app administrator for access', 'After activation, sign out and sign in again'],
    account: 'Account',
    logout: 'Sign out',
  },
  rs: {
    inactiveTitle: 'Nalog još nije aktiviran',
    inactive: 'Vaš nalog je napravljen, ali ga administrator još nije aktivirao. Javite se administratoru da ga aktivira.',
    missingTitle: 'Pristup nije dozvoljen',
    missing: 'Ovaj nalog nije registrovan za aplikaciju. Javite se administratoru da vam odobri pristup.',
    hintTitle: 'Ako mislite da je ovo greška:',
    hints: ['Proverite da li ste prijavljeni pravim nalogom', 'Javite se administratoru za pristup', 'Posle aktivacije se odjavite i ponovo prijavite'],
    account: 'Nalog',
    logout: 'Odjavi se',
  },
};

const UserNotRegisteredError = () => {
  const { authError, logout } = useAuth();
  const { lang } = useLang();
  const L = TEXT[lang] || TEXT.en;
  const inactive = authError?.reason === 'inactive';
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg border border-slate-100">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-orange-100">
            <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">{inactive ? L.inactiveTitle : L.missingTitle}</h1>
          <p className="text-slate-600 mb-4">{inactive ? L.inactive : L.missing}</p>
          {authError?.email && (
            <p className="text-sm text-slate-500 mb-8">{L.account}: <span className="font-medium text-slate-700">{authError.email}</span></p>
          )}
          <div className="p-4 bg-slate-50 rounded-md text-sm text-slate-600">
            <p>{L.hintTitle}</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {L.hints.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="mt-6 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {L.logout}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;
