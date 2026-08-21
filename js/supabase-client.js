/* =============================================================
   SCA Opportunities — Supabase client
   Free tier (supabase.com): Postgres DB + Auth, 500MB DB, 50k MAU.
   Handles account creation/login and saved-opportunity sync.
   Job data itself still comes from Google Sheets (script.js).
   ============================================================= */

// Replace these two with your Supabase project's values
// (Project Settings → API). The anon key is safe to expose in
// client-side code — Row Level Security policies (see
// supabase/schema.sql) are what actually protect the data.
const SUPABASE_URL = "https://qawsxrusvacdcdumzgsv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XQuiqZEEEYMfmEZ18W8K2w_p_OP8nSB";

const sb =
  typeof window !== "undefined" &&
  window.supabase &&
  SUPABASE_URL.startsWith("http")
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const SCA = {
  ready: !!sb,

  async signUp({ email, password, fullName, region, country, yearOfStudy, university }) {
    if (!sb) throw new Error("Supabase is not configured yet.");
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          region,
          country,
          year_of_study: yearOfStudy,
          university: university || null,
        },
      },
    });
    if (error) throw error;
    return data;
  },

  async signIn({ email, password }) {
    if (!sb) throw new Error("Supabase is not configured yet.");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    if (!sb) return;
    await sb.auth.signOut();
  },

  async getSession() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  },

  onAuthChange(callback) {
    if (!sb) return { unsubscribe() {} };
    const { data } = sb.auth.onAuthStateChange((_event, session) => callback(session));
    return data.subscription;
  },

  async getProfile(userId) {
    if (!sb) return null;
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data;
  },

  async updateProfile(userId, updates) {
    if (!sb) throw new Error("Supabase is not configured yet.");
    const { error } = await sb.from("profiles").update(updates).eq("id", userId);
    if (error) throw error;
  },

  async uploadAvatar(userId, file) {
    if (!sb) throw new Error("Supabase is not configured yet.");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/avatar.${ext}`;
    const { error: uploadError } = await sb.storage
      .from("avatars")
      .upload(path, file, { upsert: true, cacheControl: "3600" });
    if (uploadError) throw uploadError;
    const { data } = sb.storage.from("avatars").getPublicUrl(path);
    // Cache-bust so the new photo shows immediately instead of a
    // previously-cached image at the same URL.
    return `${data.publicUrl}?t=${Date.now()}`;
  },

  async resetPassword(email) {
    if (!sb) throw new Error("Supabase is not configured yet.");
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/login.html",
    });
    if (error) throw error;
  },

  async listBookmarks(userId) {
    if (!sb) return [];
    const { data, error } = await sb
      .from("bookmarks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async addBookmark(userId, opportunity) {
    if (!sb) return;
    const { error } = await sb.from("bookmarks").upsert(
      {
        user_id: userId,
        opportunity_id: String(opportunity.id),
        opportunity_title: opportunity.title || null,
        opportunity_org: opportunity.organization || null,
        opportunity_apply_link: opportunity.apply_link || null,
      },
      { onConflict: "user_id,opportunity_id" }
    );
    if (error) throw error;
  },

  async removeBookmark(userId, opportunityId) {
    if (!sb) return;
    const { error } = await sb
      .from("bookmarks")
      .delete()
      .eq("user_id", userId)
      .eq("opportunity_id", String(opportunityId));
    if (error) throw error;
  },
};

if (typeof window !== "undefined") window.SCA = SCA;
