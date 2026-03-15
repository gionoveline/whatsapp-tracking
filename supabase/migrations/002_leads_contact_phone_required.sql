-- Garante que toda conversa (lead) tenha telefone atrelado.
-- Rode só se a tabela leads já existir com contact_phone nullable.
-- Se houver linhas com contact_phone NULL, atualize ou remova antes de rodar.
ALTER TABLE public.leads ALTER COLUMN contact_phone SET NOT NULL;
