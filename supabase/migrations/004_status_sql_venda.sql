-- Nomenclatura agnóstica: opp → sql, ganho → venda
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
UPDATE public.leads SET status = 'sql' WHERE status = 'opp';
UPDATE public.leads SET status = 'venda' WHERE status = 'ganho';
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status IN ('lead', 'sql', 'venda'));
