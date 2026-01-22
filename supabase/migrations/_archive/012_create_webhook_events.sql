-- 012_create_webhook_events.sql
-- Tabla para registrar eventos de Webhooks (Audit Log y Replay)

CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Solo service_role (Edge Functions) puede escribir/leer aquí
CREATE POLICY "Service Role Full Access" ON public.webhook_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
