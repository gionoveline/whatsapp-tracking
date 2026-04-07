"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ImagePlus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { authFetch, getClientAuth } from "@/lib/client-auth";
import {
  PARTNER_MEMBER_ROLES,
  partnerMemberRoleLabel,
} from "@/lib/partner-membership-roles";
import { GLOBAL_ADMIN_EMAIL } from "@/lib/auth-constants";

type SessionResponse = {
  user?: { is_global_admin?: boolean };
  partners?: Array<{ id: string; name: string }>;
};

type Company = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  auto_link_by_domain: boolean;
  allowed_email_domain: string | null;
};

type UserItem = {
  id: string;
  email: string;
  full_name: string | null;
  is_global_admin: boolean;
  memberships: Array<{
    partner_id: string;
    partner_name: string;
    partner_slug: string;
    role: string;
  }>;
};

export default function UsuariosPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [editingCompanyId, setEditingCompanyId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDomain, setDraftDomain] = useState("");
  const [draftLogoDataUrl, setDraftLogoDataUrl] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [editingUserId, setEditingUserId] = useState("");
  const [draftUserFullName, setDraftUserFullName] = useState("");
  const [userEditStatus, setUserEditStatus] = useState("");
  const [userEditBusy, setUserEditBusy] = useState(false);
  const [addMembershipPartnerId, setAddMembershipPartnerId] = useState("");
  const [addMembershipRole, setAddMembershipRole] = useState<string>("member");
  const [sessionUserId, setSessionUserId] = useState("");
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);
  const [deleteUserConfirmEmail, setDeleteUserConfirmEmail] = useState("");
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  const editingCompany = useMemo(
    () => companies.find((company) => company.id === editingCompanyId) ?? null,
    [companies, editingCompanyId]
  );

  const editingUser = useMemo(
    () => users.find((u) => u.id === editingUserId) ?? null,
    [users, editingUserId]
  );

  const roleSelectOptions = useMemo(
    () =>
      PARTNER_MEMBER_ROLES.map((r) => ({
        value: r,
        label: partnerMemberRoleLabel(r),
      })),
    []
  );

  const addPartnerOptions = useMemo(() => {
    if (!editingUser) return [];
    const taken = new Set(editingUser.memberships.map((m) => m.partner_id));
    return companies
      .filter((c) => !taken.has(c.id))
      .map((c) => ({ value: c.id, label: `${c.name} (${c.slug})` }));
  }, [companies, editingUser]);

  const canDeleteUser = (u: UserItem) => {
    if (!sessionUserId) return false;
    if (u.id === sessionUserId) return false;
    if (u.email.trim().toLowerCase() === GLOBAL_ADMIN_EMAIL) return false;
    return true;
  };

  const load = async () => {
    setIsLoading(true);
    setError("");
    setStatus("");
    const auth = await getClientAuth();
    if (!auth) {
      window.location.href = "/login";
      return;
    }
    setSessionUserId(auth.userId);

    const sessionRes = await authFetch("/api/auth/session");
    if (!sessionRes.ok) {
      setError("Não foi possível validar sua sessão.");
      setIsLoading(false);
      return;
    }
    const sessionJson = (await sessionRes.json()) as SessionResponse;
    const globalAdmin = sessionJson?.user?.is_global_admin === true;
    setIsGlobalAdmin(globalAdmin);

    const partners = Array.isArray(sessionJson.partners) ? sessionJson.partners : [];
    const currentPartnerId = localStorage.getItem("active_partner_id") ?? "";
    const resolvedPartnerId =
      currentPartnerId && partners.some((p) => p.id === currentPartnerId)
        ? currentPartnerId
        : partners[0]?.id ?? "";
    if (resolvedPartnerId) {
      localStorage.setItem("active_partner_id", resolvedPartnerId);
    }
    setPartnerId(resolvedPartnerId);

    if (globalAdmin) {
      const [companiesRes, usersRes] = await Promise.all([
        authFetch("/api/admin/companies"),
        authFetch("/api/admin/users"),
      ]);
      const companiesJson = await companiesRes.json().catch(() => ({}));
      const usersJson = await usersRes.json().catch(() => ({}));
      if (!companiesRes.ok) {
        setError(companiesJson.error || "Erro ao carregar empresas.");
      } else {
        setCompanies(Array.isArray(companiesJson.companies) ? companiesJson.companies : []);
      }
      if (!usersRes.ok) {
        setError(usersJson.error || "Erro ao carregar usuários.");
      } else {
        setUsers(Array.isArray(usersJson.users) ? usersJson.users : []);
      }
    } else {
      const usersRes = await authFetch("/api/admin/users", { partnerId: resolvedPartnerId });
      const usersJson = await usersRes.json().catch(() => ({}));
      if (!usersRes.ok) {
        setError(usersJson.error || "Erro ao carregar usuários da empresa.");
      } else {
        setUsers(Array.isArray(usersJson.users) ? usersJson.users : []);
      }
    }

    setIsLoading(false);
  };

  const refreshUsers = async () => {
    if (!isGlobalAdmin) {
      if (!partnerId) return;
      const usersRes = await authFetch("/api/admin/users", { partnerId });
      const usersJson = await usersRes.json().catch(() => ({}));
      if (usersRes.ok && Array.isArray(usersJson.users)) {
        setUsers(usersJson.users);
      }
      return;
    }
    const usersRes = await authFetch("/api/admin/users");
    const usersJson = await usersRes.json().catch(() => ({}));
    if (usersRes.ok && Array.isArray(usersJson.users)) {
      setUsers(usersJson.users);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startEdit = (company: Company) => {
    setEditingCompanyId(company.id);
    setDraftName(company.name);
    setDraftDomain(company.allowed_email_domain ?? "");
    setDraftLogoDataUrl(company.logo_url ?? "");
    setStatus("");
    setError("");
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  };

  const cancelEdit = () => {
    setEditingCompanyId("");
    setDraftName("");
    setDraftDomain("");
    setDraftLogoDataUrl("");
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  };

  const saveCompany = async () => {
    if (!editingCompany) return;
    setStatus("Salvando empresa...");
    setError("");
    const res = await authFetch(`/api/admin/companies/${editingCompany.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draftName,
        logoDataUrl: draftLogoDataUrl || null,
        allowed_email_domain: draftDomain || null,
        auto_link_by_domain: draftDomain.trim().length > 0,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Erro ao salvar empresa.");
      setStatus("");
      return;
    }

    setCompanies((prev) =>
      prev.map((company) => (company.id === editingCompany.id ? (json.company as Company) : company))
    );
    cancelEdit();
    setStatus("Empresa atualizada com sucesso.");
  };

  const deleteCompany = async (company: Company) => {
    setIsDeleting(true);
    setStatus("Excluindo empresa...");
    setError("");
    const res = await authFetch(`/api/admin/companies/${company.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Erro ao excluir empresa.");
      setStatus("");
      setIsDeleting(false);
      return;
    }
    setCompanies((prev) => prev.filter((item) => item.id !== company.id));
    setStatus("Empresa excluída.");
    setIsDeleting(false);
    setCompanyToDelete(null);
  };

  const startEditUser = (u: UserItem) => {
    if (!isGlobalAdmin) return;
    setEditingUserId(u.id);
    setDraftUserFullName(u.full_name ?? "");
    setUserEditStatus("");
    setError("");
    setAddMembershipPartnerId("");
    setAddMembershipRole("member");
  };

  const cancelUserEdit = () => {
    setEditingUserId("");
    setDraftUserFullName("");
    setUserEditStatus("");
    setAddMembershipPartnerId("");
    setAddMembershipRole("member");
  };

  const saveUserProfile = async () => {
    if (!editingUser) return;
    setUserEditBusy(true);
    setUserEditStatus("");
    setError("");
    const res = await authFetch(`/api/admin/users/${editingUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: draftUserFullName }),
    });
    const json = await res.json().catch(() => ({}));
    setUserEditBusy(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Erro ao salvar usuário.");
      return;
    }
    const updated = json.user as { full_name?: string | null } | undefined;
    setUsers((prev) =>
      prev.map((u) => (u.id === editingUser.id ? { ...u, full_name: updated?.full_name ?? u.full_name } : u))
    );
    setUserEditStatus("Dados salvos.");
  };

  const setMembershipRole = async (partnerId: string, role: string) => {
    if (!editingUser) return;
    setUserEditBusy(true);
    setError("");
    const res = await authFetch(`/api/admin/users/${editingUser.id}/memberships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partner_id: partnerId, role }),
    });
    const json = await res.json().catch(() => ({}));
    setUserEditBusy(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Erro ao atualizar papel.");
      return;
    }
    await refreshUsers();
    setUserEditStatus("Permissão atualizada.");
  };

  const removeMembership = async (partnerId: string) => {
    if (!editingUser) return;
    if (!window.confirm("Remover este usuário desta empresa?")) return;
    setUserEditBusy(true);
    setError("");
    const res = await authFetch(
      `/api/admin/users/${editingUser.id}/memberships?partner_id=${encodeURIComponent(partnerId)}`,
      { method: "DELETE" }
    );
    const json = await res.json().catch(() => ({}));
    setUserEditBusy(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Erro ao remover vínculo.");
      return;
    }
    await refreshUsers();
    setUserEditStatus("Vínculo removido.");
  };

  const addMembership = async () => {
    if (!editingUser || !addMembershipPartnerId) return;
    setUserEditBusy(true);
    setError("");
    const res = await authFetch(`/api/admin/users/${editingUser.id}/memberships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partner_id: addMembershipPartnerId, role: addMembershipRole }),
    });
    const json = await res.json().catch(() => ({}));
    setUserEditBusy(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Erro ao adicionar vínculo.");
      return;
    }
    setAddMembershipPartnerId("");
    setAddMembershipRole("member");
    await refreshUsers();
    setUserEditStatus("Empresa vinculada.");
  };

  const executeDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    setError("");
    const res = await authFetch(`/api/admin/users/${userToDelete.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setIsDeletingUser(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Erro ao excluir usuário.");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
    if (editingUserId === userToDelete.id) {
      cancelUserEdit();
    }
    setUserToDelete(null);
    setDeleteUserConfirmEmail("");
    setStatus("Usuário excluído.");
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] bg-grain">
      <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
        <h1 className="font-display text-2xl font-semibold">Gestão de usuários</h1>

        {isLoading && <p className="text-sm text-[var(--muted-foreground)]">Carregando...</p>}
        {status && <p className="text-sm text-[var(--accent)]">{status}</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {(isGlobalAdmin || companies.length > 0) && (
          <Card className="rounded-2xl border-[var(--border)] shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-lg">Empresas</CardTitle>
              <CardDescription>
                {isGlobalAdmin
                  ? "Edite ou exclua empresas."
                  : "Você pode editar os dados da sua empresa (incluindo logo)."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Domínio auto-link</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell>{company.name}</TableCell>
                      <TableCell className="font-mono text-xs">{company.slug}</TableCell>
                      <TableCell>{company.allowed_email_domain ?? "-"}</TableCell>
                      <TableCell className="space-x-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => startEdit(company)}>
                          Editar
                        </Button>
                        {isGlobalAdmin && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setCompanyToDelete(company)}
                          >
                            Excluir
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {editingCompany && (
                <Card className="border-[var(--border)]">
                  <CardContent className="space-y-3 p-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Nome da empresa</Label>
                      <Input id="companyName" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyDomain">Domínio auto-link (opcional)</Label>
                      <Input
                        id="companyDomain"
                        value={draftDomain}
                        onChange={(e) => setDraftDomain(e.target.value.toLowerCase())}
                        placeholder="exemplo.com.br"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyLogo">Logo da empresa (opcional)</Label>
                      <input
                        ref={logoInputRef}
                        id="companyLogo"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) {
                            setDraftLogoDataUrl("");
                            return;
                          }
                          if (!file.type.startsWith("image/")) {
                            setError("Selecione um arquivo de imagem válido.");
                            return;
                          }
                          if (file.size > 1_000_000) {
                            setError("A logo deve ter no máximo 1MB.");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => {
                            const result = typeof reader.result === "string" ? reader.result : "";
                            setDraftLogoDataUrl(result);
                            setError("");
                          };
                          reader.onerror = () => setError("Não foi possível ler a imagem selecionada.");
                          reader.readAsDataURL(file);
                        }}
                      />
                      <Card className="border-dashed">
                        <CardContent className="flex items-center justify-between gap-3 p-3">
                          <div className="flex items-center gap-3">
                            {draftLogoDataUrl ? (
                              <img
                                src={draftLogoDataUrl}
                                alt="Prévia da logo da empresa"
                                className="h-14 w-14 rounded-md border border-[var(--border)] object-cover"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)]/50">
                                <ImagePlus className="h-5 w-5 text-[var(--muted-foreground)]" />
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-[var(--foreground)]">
                                {draftLogoDataUrl ? "Logo selecionada" : "Nenhuma logo selecionada"}
                              </p>
                              <p className="text-xs text-[var(--muted-foreground)]">PNG, JPG ou WEBP (máximo 1MB)</p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => logoInputRef.current?.click()}
                          >
                            {draftLogoDataUrl ? "Trocar" : "Escolher"}
                          </Button>
                          {draftLogoDataUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDraftLogoDataUrl("");
                                if (logoInputRef.current) {
                                  logoInputRef.current.value = "";
                                }
                              }}
                              aria-label="Remover logo selecionada"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={saveCompany}>
                        Salvar
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="rounded-2xl border-[var(--border)] shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg">Usuários</CardTitle>
            <CardDescription>
              {isGlobalAdmin
                ? "Visão global de usuários e permissões por empresa."
                : "Usuários vinculados à empresa ativa."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Empresas / papeis</TableHead>
                  {isGlobalAdmin && <TableHead className="min-w-[200px]">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.full_name || "-"}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.is_global_admin ? "Super Admin" : "Usuário"}</TableCell>
                    <TableCell>
                      {user.memberships.length > 0
                        ? user.memberships.map((m) => `${m.partner_name} (${m.role})`).join(", ")
                        : "-"}
                    </TableCell>
                    {isGlobalAdmin && (
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => startEditUser(user)}>
                            Editar
                          </Button>
                          {canDeleteUser(user) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                setUserToDelete(user);
                                setDeleteUserConfirmEmail("");
                              }}
                            >
                              Excluir
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {isGlobalAdmin && editingUser && (
              <Card className="mt-4 border-[var(--border)]">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-base">Editar usuário</CardTitle>
                  <CardDescription>{editingUser.email}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {userEditStatus && <p className="text-sm text-[var(--accent)]">{userEditStatus}</p>}
                  <div className="space-y-2">
                    <Label htmlFor="editUserFullName">Nome completo</Label>
                    <div className="flex flex-wrap items-end gap-2">
                      <Input
                        id="editUserFullName"
                        value={draftUserFullName}
                        onChange={(e) => setDraftUserFullName(e.target.value)}
                        className="max-w-md"
                        disabled={userEditBusy}
                      />
                      <Button type="button" size="sm" onClick={() => void saveUserProfile()} disabled={userEditBusy}>
                        Salvar nome
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-[var(--foreground)]">Empresas e papéis</p>
                    {editingUser.memberships.length === 0 ? (
                      <p className="text-sm text-[var(--muted-foreground)]">Nenhuma empresa vinculada ainda.</p>
                    ) : (
                      <div className="space-y-2">
                        {editingUser.memberships.map((m) => (
                          <div
                            key={m.partner_id}
                            className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <p className="text-sm font-medium text-[var(--foreground)]">{m.partner_name}</p>
                              <p className="font-mono text-xs text-[var(--muted-foreground)]">{m.partner_slug}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Select
                                id={`role-${m.partner_id}`}
                                value={m.role}
                                onValueChange={(value) => void setMembershipRole(m.partner_id, value)}
                                options={roleSelectOptions}
                                disabled={userEditBusy}
                                className="w-[200px]"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700"
                                disabled={userEditBusy}
                                onClick={() => void removeMembership(m.partner_id)}
                              >
                                Remover
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {addPartnerOptions.length > 0 ? (
                    <div className="space-y-2 rounded-lg border border-dashed border-[var(--border)] p-3">
                      <p className="text-sm font-medium text-[var(--foreground)]">Vincular a uma empresa</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                        <div className="space-y-1">
                          <Label className="text-xs">Empresa</Label>
                          <Select
                            id="addMembershipPartner"
                            value={addMembershipPartnerId}
                            onValueChange={setAddMembershipPartnerId}
                            options={[
                              { value: "", label: "Selecione..." },
                              ...addPartnerOptions,
                            ]}
                            disabled={userEditBusy}
                            className="min-w-[220px]"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Papel</Label>
                          <Select
                            id="addMembershipRole"
                            value={addMembershipRole}
                            onValueChange={setAddMembershipRole}
                            options={roleSelectOptions}
                            disabled={userEditBusy}
                            className="w-[200px]"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={userEditBusy || !addMembershipPartnerId}
                          onClick={() => void addMembership()}
                        >
                          Adicionar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    companies.length > 0 && (
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Este usuário já está vinculado a todas as empresas cadastradas.
                      </p>
                    )
                  )}

                  <Button type="button" size="sm" variant="outline" onClick={cancelUserEdit} disabled={userEditBusy}>
                    Fechar
                  </Button>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {!isGlobalAdmin && !partnerId && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Selecione uma empresa no topo para listar os usuários.
          </p>
        )}

        <p className="text-sm text-[var(--muted-foreground)]">
          <Link href="/" className="text-[var(--accent)] hover:underline underline-offset-2">
            ← Voltar ao início
          </Link>
        </p>
      </div>

      {companyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <Card className="w-full max-w-md border-[var(--border)] shadow-xl">
            <CardHeader>
              <CardTitle className="font-display text-lg">Confirmar exclusão</CardTitle>
              <CardDescription>
                Você está prestes a excluir a empresa <strong>{companyToDelete.name}</strong>.
                Esta ação remove os dados relacionados e não pode ser desfeita.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCompanyToDelete(null)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void deleteCompany(companyToDelete)}
                disabled={isDeleting}
                className="text-red-600 hover:text-red-700"
              >
                {isDeleting ? "Excluindo..." : "Excluir empresa"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <Card className="w-full max-w-md border-[var(--border)] shadow-xl">
            <CardHeader>
              <CardTitle className="font-display text-lg">Excluir usuário</CardTitle>
              <CardDescription>
                Esta ação remove o login em <strong>{userToDelete.email}</strong> e os vínculos com empresas. Não pode
                ser desfeita. Para confirmar, digite o e-mail abaixo exatamente como mostrado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="confirmDeleteUserEmail">Email</Label>
                <Input
                  id="confirmDeleteUserEmail"
                  type="email"
                  autoComplete="off"
                  autoCorrect="off"
                  placeholder={userToDelete.email}
                  value={deleteUserConfirmEmail}
                  onChange={(e) => setDeleteUserConfirmEmail(e.target.value)}
                  disabled={isDeletingUser}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setUserToDelete(null);
                    setDeleteUserConfirmEmail("");
                  }}
                  disabled={isDeletingUser}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  disabled={
                    isDeletingUser ||
                    deleteUserConfirmEmail.trim().toLowerCase() !== userToDelete.email.trim().toLowerCase()
                  }
                  onClick={() => void executeDeleteUser()}
                >
                  {isDeletingUser ? "Excluindo..." : "Excluir usuário"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
