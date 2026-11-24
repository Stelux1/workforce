import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/api/supabase";
import { can as canPerm } from "@/lib/permissions";

// Prijava preko Supabase-a (D1). Uloga (admin, project_manager, hr, finance) dolazi iz tabele `profiles`, a prava
// iz `my_permissions()` (uloga + izuzeci; admin = sva prava). Ista pravila sprovodi baza (RLS, RPC) — ovo je samo
// za prikaz (sakrivanje stranica i dugmadi).
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const loadProfile = useCallback(async (sess) => {
    if (!sess) {
      setProfile(null);
      setPermissions([]);
      setAuthError(null);
      return;
    }
    const [{ data, error }, perms] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name, role, active, project_scope").eq("id", sess.user.id).maybeSingle(),
      supabase.rpc("my_permissions"),
    ]);
    if (!error && data?.active && perms.error) {
      // Bez spiska prava aplikacija ne zna šta da prikaže — ista poruka kao i za grešku profila.
      setProfile(null);
      setPermissions([]);
      setAuthError({ type: "unknown", message: perms.error.message });
      return;
    }
    setPermissions(Array.isArray(perms.data) ? perms.data : []);
    if (error) {
      setProfile(null);
      setAuthError({ type: "unknown", message: error.message });
    } else if (!data || !data.active) {
      // Nov nalog je neaktivan dok ga admin ne aktivira (handle_new_user, migracija 20261114250000).
      setProfile(null);
      setAuthError({
        type: "user_not_registered",
        reason: data ? "inactive" : "missing",
        email: data?.email || sess.user.email || "",
        message: "Nalog nije aktivan",
      });
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
    setPermissions([]);
  }, []);

  const user = profile ? { ...profile, email: profile.email || session?.user?.email } : null;
  const can = useCallback((code) => canPerm(permissions, code), [permissions]);
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);

  return (
    <AuthContext.Provider
      value={{
        user,
        role: profile?.role ?? null,
        isAdmin: profile?.role === "admin",
        permissions: permissionSet,
        can,
        isAuthenticated: Boolean(session && profile),
        isLoadingAuth,
        // zadržano zbog postojećih komponenti iz prve verzije aplikacije
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
