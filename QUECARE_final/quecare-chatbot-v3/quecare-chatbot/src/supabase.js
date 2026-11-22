// supabase.js - PLACEHOLDER for the Supabase link (not used yet).
// Later steps will fill these in. Nothing else in the chatbot calls this file yet.
//
// Setup needed in .env later:
//   SUPABASE_URL=https://your-project.supabase.co
//   SUPABASE_SERVICE_KEY=your-service-role-key   (keep private, server-side only)

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

// TODO: fetch the patient's latest token/status from Supabase.
export async function getTokenStatusFromDb(phone) {
  throw new Error('Supabase not connected yet');
}

// TODO: insert a new token request into Supabase.
export async function createTokenInDb(request) {
  throw new Error('Supabase not connected yet');
}

// TODO: fetch the list of doctors from Supabase.
export async function getDoctorsFromDb() {
  throw new Error('Supabase not connected yet');
}
