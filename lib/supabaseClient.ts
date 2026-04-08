import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use cookie-backed auth storage so middleware SSR can read session reliably.
export const supabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey);

