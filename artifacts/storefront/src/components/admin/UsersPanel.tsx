import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Check,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  UserCog,
  X,
} from "lucide-react";
import { format } from "date-fns";
import {
  useAdminListAdminUsers,
  useAdminCreateAdminUser,
  useAdminPatchAdminUser,
  useAdminSetAdminUserPassword,
  type AdminUser,
} from "@atlab/api-client-react";

function errText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function UserRow({
  user,
  adminKey,
  onChanged,
  onResetPassword,
}: {
  user: AdminUser;
  adminKey: string;
  onChanged: () => void;
  onResetPassword: (user: AdminUser) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user.name ?? "");
  const [error, setError] = useState("");

  const patch = useAdminPatchAdminUser({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        setError("");
        setEditingName(false);
        onChanged();
      },
      onError: (err) => setError(errText(err, "Update failed")),
    },
  });

  const saveName = () => {
    const trimmed = name.trim();
    patch.mutate({ id: user.id, data: { name: trimmed === "" ? null : trimmed } });
  };

  const cancelName = () => {
    setName(user.name ?? "");
    setEditingName(false);
    setError("");
  };

  const toggleActive = () => {
    patch.mutate({ id: user.id, data: { isActive: !user.isActive } });
  };

  return (
    <TableRow className={user.isActive ? undefined : "opacity-60"}>
      <TableCell className="font-mono text-xs break-all">{user.email}</TableCell>
      <TableCell>
        {editingName ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") cancelName();
              }}
              placeholder="Name"
              autoFocus
              className="h-8 w-40 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              disabled={patch.isPending}
              onClick={saveName}
              aria-label="Save name"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={cancelName}
              aria-label="Cancel rename"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="group flex items-center gap-1.5 text-sm text-left"
          >
            <span className={user.name ? "" : "text-muted-foreground font-mono text-xs"}>
              {user.name || "—"}
            </span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
        {error && (
          <p className="text-destructive text-[10px] font-mono mt-1">{error}</p>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant={user.isActive ? "verified" : "outline"}
          className="text-[10px] font-mono uppercase tracking-wider"
        >
          {user.isActive ? "Active" : "Disabled"}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
        {format(new Date(user.createdAt), "MMM d, yyyy")}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 font-mono text-xs gap-1.5"
            onClick={() => onResetPassword(user)}
            aria-label="Reset password"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Password</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 font-mono text-xs gap-1.5"
            disabled={patch.isPending}
            onClick={toggleActive}
            aria-label={user.isActive ? "Deactivate user" : "Reactivate user"}
          >
            {user.isActive ? (
              <>
                <ShieldOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Deactivate</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reactivate</span>
              </>
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  adminKey,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminKey: string;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const reset = () => {
    setEmail("");
    setName("");
    setPassword("");
    setError("");
  };

  const create = useAdminCreateAdminUser({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        reset();
        onOpenChange(false);
        onCreated();
      },
      onError: (err) => setError(errText(err, "Could not create admin user")),
    },
  });

  const trimmedName = name.trim();
  const canSubmit =
    email.trim().length > 0 && password.length >= 8 && !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    setError("");
    create.mutate({
      data: {
        email: email.trim(),
        password,
        ...(trimmedName ? { name: trimmedName } : {}),
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create admin user</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Back-office operator with full console access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-admin-email" className="text-xs font-mono">
              Email
            </Label>
            <Input
              id="new-admin-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@atlabsourcing.org"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-admin-name" className="text-xs font-mono">
              Name <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="new-admin-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-admin-password" className="text-xs font-mono">
              Password
            </Label>
            <Input
              id="new-admin-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground font-mono">
              Minimum 8 characters. Stored hashed (PBKDF2); never displayed again.
            </p>
          </div>

          {error && (
            <p className="text-destructive text-xs font-mono">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              className="font-mono"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button className="font-mono" disabled={!canSubmit} onClick={submit}>
              Create user
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  adminKey,
  onOpenChange,
}: {
  user: AdminUser | null;
  adminKey: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const setPasswordMutation = useAdminSetAdminUserPassword({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        setError("");
        setDone(true);
        setPassword("");
      },
      onError: (err) => setError(errText(err, "Could not set password")),
    },
  });

  const close = () => {
    setPassword("");
    setError("");
    setDone(false);
    onOpenChange(false);
  };

  const submit = () => {
    if (!user || password.length < 8 || setPasswordMutation.isPending) return;
    setError("");
    setPasswordMutation.mutate({ id: user.id, data: { password } });
  };

  return (
    <Dialog open={user !== null} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription className="font-mono text-xs break-all">
            {user?.email}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4">
            <p className="text-sm font-mono text-good">
              Password updated.
            </p>
            <div className="flex justify-end">
              <Button className="font-mono" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-admin-password" className="text-xs font-mono">
                New password
              </Label>
              <Input
                id="reset-admin-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground font-mono">
                Minimum 8 characters. Share it over a secure channel — it is not
                recoverable from the console.
              </p>
            </div>

            {error && (
              <p className="text-destructive text-xs font-mono">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" className="font-mono" onClick={close}>
                Cancel
              </Button>
              <Button
                className="font-mono"
                disabled={password.length < 8 || setPasswordMutation.isPending}
                onClick={submit}
              >
                Set password
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function UsersPanel({ adminKey }: { adminKey: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);

  const usersQuery = useAdminListAdminUsers({
    request: { headers: { "x-admin-key": adminKey } },
  });

  const users = usersQuery.data ?? [];
  const refetch = () => {
    void usersQuery.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            Back-office operators with admin console access
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="font-mono gap-2"
            onClick={refetch}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            className="font-mono gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" /> New admin user
          </Button>
        </div>
      </div>

      {usersQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : usersQuery.isError ? (
        <div className="text-center py-12">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-destructive text-sm font-mono">
            {errText(usersQuery.error, "Failed to load admin users")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 font-mono"
            onClick={refetch}
          >
            Retry
          </Button>
        </div>
      ) : users.length === 0 ? (
        <Card className="border-border/30">
          <CardContent className="py-12 text-center text-muted-foreground font-mono text-sm">
            <UserCog className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No admin users yet — the env credential is still the only way in.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/30">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                      Email
                    </TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                      Name
                    </TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                      Status
                    </TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                      Created
                    </TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      adminKey={adminKey}
                      onChanged={refetch}
                      onResetPassword={setResetTarget}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
        The last active admin cannot be deactivated. Password hashes are never
        returned by the API.
      </p>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        adminKey={adminKey}
        onCreated={refetch}
      />
      <ResetPasswordDialog
        user={resetTarget}
        adminKey={adminKey}
        onOpenChange={(next) => !next && setResetTarget(null)}
      />
    </div>
  );
}
