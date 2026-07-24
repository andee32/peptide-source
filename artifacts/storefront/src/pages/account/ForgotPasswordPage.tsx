import { useState } from "react";
import { Link } from "wouter";
import { useForgotPassword } from "@atlab/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KeyRound, CheckCircle2 } from "lucide-react";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const forgot = useForgotPassword();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    // Endpoint always returns 200 and never reveals whether the email exists.
    forgot.mutate({ data: { email: email.trim() } });
  };

  return (
    <div className="min-h-screen bg-background">
      <section className="section-deep border-b border-border py-14">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <Badge variant="verified" className="mb-5 px-3 py-1 text-xs font-mono tracking-widest uppercase">
            Account Access
          </Badge>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Reset your password
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Enter your email and we&apos;ll send a link to set a new password.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-lg py-12 space-y-6">
        {forgot.isSuccess ? (
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[color-mix(in_srgb,var(--atl-teal)_12%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--atl-teal)_35%,transparent)]">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="font-display text-xl">Check your email</CardTitle>
                  <CardDescription>
                    If an account exists for that address, a reset link is on its way.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full font-mono uppercase tracking-widest">
                <Link href="/account/login">Back to sign in</Link>
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
                  <CardTitle className="font-display text-xl">Forgot password</CardTitle>
                  <CardDescription>We&apos;ll email you a secure reset link.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
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
                <Button
                  type="submit"
                  className="w-full font-mono uppercase tracking-widest h-11"
                  disabled={forgot.isPending || !email.trim()}
                >
                  {forgot.isPending ? "Sending…" : "Send reset link"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/account/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
