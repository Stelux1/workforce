import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/api/supabase";

// Prijava preko Supabase-a (D1). Uloga (admin/operater) dolazi iz tabele `profiles`;
// ista pravila se sprovode i u bazi (RLS), ovo je samo za prikaz.
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const loadProfile = useCallback(async (sess) => {
    if (!sess) {
      setProfile(null);
      setAuthError(null);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, active")
      .eq("id", sess.user.id)
      .maybeSingle();
    if (error) {
      setProfile(null);
      setAuthError({ type: "unknown", message: error.message });
    } else if (!data || !data.active) {
      setProfile(null);
      setAuthError({ type: "user_not_registered", message: "Nalog nije aktivan" });
    } else {
      setProfile(data);
      setAuthError(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (alive) setIsLoadingAuth(false);
    });
    // Supabase preporuka: ne čekati druge Supabase pozive unutar ovog callback-a (deadlock).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setTimeout(() => loadProfile(sess), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error };
      setIsLoadingAuth(true);
      setSession(data.session);
      await loadProfile(data.session);
      setIsLoadingAuth(false);
      return { error: null };
    },
    [loadProfile]
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const user = profile ? { ...profile, email: profile.email || session?.user?.email } : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        role: profile?.role ?? null,
        isAdmin: profile?.role === "admin",
        isAuthenticated: Boolean(session && profile),
        isLoadingAuth,
        // zadržano zbog postojećih komponenti iz Base44 verzije
        isLoadingPublicSettings: false,
        authChecked: !isLoadingAuth,
        authError,
        signIn,
        logout,
        navigateToLogin: logout,
        checkUserAuth: () => loadProfile(session),
        checkAppState: () => loadProfile(session),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
