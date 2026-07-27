import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
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
import { AlertTriangle, UserPlus } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

export function RegisterPage() {
  const [, setLocation] = useLocation();
  const { customer, register, isRegistering } = useCustomerAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) setLocation("/account");
  }, [customer, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    try {
      await register({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
      });
      setLocation("/account");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create your account. Try again.",
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
            Create an account
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Track your orders and reorder in one click. An account is optional —
            guest checkout stays open.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-lg py-12 space-y-6">
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <UserPlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="font-display text-xl">Sign up</CardTitle>
                <CardDescription>
                  Orders you already placed with this email will appear in your
                  history.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label
                  htmlFor="name"
                  className="font-mono text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Name <span className="normal-case tracking-normal">(optional)</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Jane Researcher"
                  className="mt-1.5"
                  maxLength={200}
                />
              </div>
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
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  className="mt-1.5"
                  minLength={MIN_PASSWORD_LENGTH}
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
                disabled={isRegistering || !email.trim() || !password}
              >
                {isRegistering ? "Creating…" : "Create Account"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/account/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Buying for a business?{" "}
          <Link href="/wholesale" className="text-primary hover:underline">
            Apply for wholesale
          </Link>
        </p>
      </div>
    </div>
  );
}
