import { useMemo, useState } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useResetPassword } from "@app/api-client-react";
import { Button } from "@/components/ui/button";
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
import { KeyRound, AlertTriangle } from "lucide-react";

export function ResetPasswordPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const token = useMemo(() => new URLSearchParams(search).get("token") ?? "", [search]);

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = useResetPassword();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    reset.mutate(
      { data: { token, password } },
      {
        // Resetting revokes all existing sessions, so send them to sign in.
        onSuccess: () => setLocation("/account/login?reset=1"),
        onError: (err) =>
          setError(
            err instanceof Error && err.message
              ? err.message
              : "This link is invalid or has expired. Request a new one.",
          ),
      },
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <section className="section-deep border-b border-border py-14">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <Badge variant="verified" className="mb-5 px-3 py-1 text-xs font-mono tracking-widest uppercase">
            Account Access
          </Badge>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Set a new password
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Choose a password for your account. This also activates accounts migrated
            from the previous system.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-lg py-12 space-y-6">
        {!token ? (
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center border border-destructive/20">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <CardTitle className="font-display text-xl">Link is missing its token</CardTitle>
                  <CardDescription>
                    Open the reset link from your email, or request a new one.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full font-mono uppercase tracking-widest">
                <Link href="/account/forgot-password">Request a reset link</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <KeyRound className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="font-display text-xl">New password</CardTitle>
                  <CardDescription>At least 8 characters.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="password" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    New Password
                  </Label>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="mt-1.5"
                    minLength={8}
                    maxLength={200}
                    required
                  />
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
                  disabled={reset.isPending || !password}
                >
                  {reset.isPending ? "Saving…" : "Set password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/account/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
