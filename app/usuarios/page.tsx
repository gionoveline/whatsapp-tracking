"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { authFetch, getClientAuth } from "@/lib/client-auth";

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

  const editingCompany = useMemo(
    () => companies.find((company) => company.id === editingCompanyId) ?? null,
    [companies, editingCompanyId]
  );

  const load = async () => {
    setIsLoading(true);
    setError("");
    setStatus("");
    const auth = await getClientAuth();
    if (!auth) {
      window.location.href = "/login";
      return;
    }

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
  };

  const cancelEdit = () => {
    setEditingCompanyId("");
    setDraftName("");
    setDraftDomain("");
    setDraftLogoDataUrl("");
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
                      <Input
                        id="companyLogo"
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
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
                      {draftLogoDataUrl && (
                        <div className="flex items-center gap-3">
                          <img
                            src={draftLogoDataUrl}
                            alt="Prévia da logo"
                            className="h-12 w-12 rounded-md border border-[var(--border)] object-cover"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setDraftLogoDataUrl("")}
                          >
                            Remover logo
                          </Button>
                        </div>
                      )}
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    </main>
  );
}
