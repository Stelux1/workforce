import { useState } from "react";
import { Users, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/translations";

export default function Login() {
  const { signIn } = useAuth();
  const T = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await signIn(email.trim(), password);
    if (err) setError(T("Wrong email or password"));
    setBusy(false);
  };

  return (
    <AuthLayout
      icon={Users}
      title={T("Sign in")}
      subtitle={T("Worker management")}
      footer={T("Accounts are created by the administrator.")}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{T("Email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{T("Password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {T("Sign in")}
        </Button>
      </form>
    </AuthLayout>
  );
}
