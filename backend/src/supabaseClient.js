// Supabase clients — shared connections used by all backend routes.
//
// Two clients are exported:
//   1. supabase       — SERVICE_ROLE_KEY: full admin access, bypasses RLS.
//                       Used for server-side CRUD (stats, student management).
//   2. supabaseAuth   — ANON_KEY: used for Supabase Auth operations (signup/login).
//                       Respects RLS and generates user JWTs.

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env — ' +
    'copy your credentials from the Supabase dashboard.'
  );
  process.exit(1);
}

if (!supabaseAnonKey) {
  console.error(
    'Missing SUPABASE_ANON_KEY in backend/.env — ' +
    'needed for Supabase Auth (signup/login).'
  );
  process.exit(1);
}

// Service role client — full access, for server-side operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Anon client — for auth operations (generates proper user JWTs)
const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);

module.exports = { supabase, supabaseAuth };
