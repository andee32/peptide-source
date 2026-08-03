import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, LogIn, CheckCircle2 } from "lucide-react";

export function LoginPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const justReset = useMemo(() => new URLSearchParams(search).get("reset") === "1", [search]);
  const { customer, login, isLoggingIn } = useCustomerAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) setLocation("/account");
  }, [customer, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login({ email: email.trim(), password });
      setLocation("/account");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Invalid email or password.",
      );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <section className="section-deep border-b border-border py-14">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <Badge
            variant="verified"
            className="mb-5 px-3 py-1 text-xs font-mono tracking-widest uppercase"
          >
            Retail Account
          </Badge>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Sign in
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Access your order history and reorder past research materials.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-lg py-12 space-y-6">
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <LogIn className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="font-display text-xl">
                  Account sign in
                </CardTitle>
                <CardDescription>
                  One account for everything — retail, and wholesale once approved.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {justReset && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--brand-teal)_35%,transparent)] bg-[color-mix(in_srgb,var(--brand-teal)_10%,transparent)] p-3 text-sm">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>Password updated — sign in with your new password.</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label
                  htmlFor="email"
                  className="font-mono text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@lab.org"
                  className="mt-1.5 font-mono"
                  maxLength={320}
                  required
                />
              </div>
              <div>
                <Label
                  htmlFor="password"
                  className="font-mono text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Password
                </Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-1.5"
                  maxLength={200}
                  required
                />
                <div className="mt-1.5 text-right">
                  <Link href="/account/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full font-mono uppercase tracking-widest h-11"
                disabled={isLoggingIn || !email.trim() || !password}
              >
                {isLoggingIn ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          No account yet?{" "}
          <Link href="/account/register" className="text-primary hover:underline">
            Create one
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          You can also{" "}
          <Link href="/retail" className="text-primary hover:underline">
            check out as a guest
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
