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

// Captured before createClient() below touches the URL, so we still
// see it even though supabase-js strips the confirmation params from
// the address bar once it parses the session out of them.
const emailJustConfirmed =
  typeof window !== "undefined" &&
  (window.location.hash.includes("type=signup") ||
    new URLSearchParams(window.location.search).get("type") === "signup");

const sb =
  typeof window !== "undefined" &&
  window.supabase &&
  SUPABASE_URL.startsWith("http")
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const SCA = {
  ready: !!sb,
  justConfirmedEmail: emailJustConfirmed,

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

  // ---- Public profiles (name/photo/region only — see schema.sql) ----

  // Routed through SECURITY DEFINER functions (see schema.sql) rather
  // than querying the public_profiles view directly — a version-proof
  // way to guarantee every signed-in student can see every profile.
  async getPublicProfile(userId) {
    if (!sb) return null;
    const { data, error } = await sb.rpc("get_public_profile", { profile_id: userId });
    if (error) throw error;
    return data?.[0] || null;
  },

  async getPublicProfiles(userIds) {
    if (!sb || !userIds.length) return [];
    const { data, error } = await sb.rpc("get_public_profiles", { profile_ids: userIds });
    if (error) throw error;
    return data;
  },

  async listAllProfiles() {
    // Powers the Students directory — every student with a profile,
    // newest first. Capped at 500 since this is a client-rendered
    // grid; revisit with pagination if the platform grows past that.
    if (!sb) return [];
    const { data, error } = await sb.rpc("list_public_profiles");
    if (error) throw error;
    return data;
  },

  // ---- Companions (this platform's word for "follow") ----

  async listCompanions(userId) {
    // Students companioning `userId` — their "Companions".
    if (!sb) return [];
    const { data, error } = await sb
      .from("companions")
      .select("companion_id, created_at")
      .eq("companioned_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async listCompanioning(userId) {
    // Students `userId` companions — who they're "Companioning".
    if (!sb) return [];
    const { data, error } = await sb
      .from("companions")
      .select("companioned_id, created_at")
      .eq("companion_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async isCompanion(companionId, companionedId) {
    if (!sb) return false;
    const { data, error } = await sb
      .from("companions")
      .select("companion_id")
      .eq("companion_id", companionId)
      .eq("companioned_id", companionedId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  },

  async addCompanion(companionId, companionedId) {
    if (!sb) throw new Error("Supabase is not configured yet.");
    const { error } = await sb
      .from("companions")
      .insert({ companion_id: companionId, companioned_id: companionedId });
    if (error) throw error;
  },

  async removeCompanion(companionId, companionedId) {
    if (!sb) return;
    const { error } = await sb
      .from("companions")
      .delete()
      .eq("companion_id", companionId)
      .eq("companioned_id", companionedId);
    if (error) throw error;
  },

  // ---- The Common Room (discussion board) ----

  async listPosts() {
    if (!sb) return [];
    const { data, error } = await sb
      .from("discussion_posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async listPostsByUser(userId) {
    if (!sb) return [];
    const { data, error } = await sb
      .from("discussion_posts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getPost(postId) {
    if (!sb) return null;
    const { data, error } = await sb
      .from("discussion_posts")
      .select("*")
      .eq("id", postId)
      .single();
    if (error) throw error;
    return data;
  },

  async createPost(userId, { title, body }) {
    if (!sb) throw new Error("Supabase is not configured yet.");
    const { data, error } = await sb
      .from("discussion_posts")
      .insert({ user_id: userId, title, body })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deletePost(postId) {
    if (!sb) return;
    const { error } = await sb.from("discussion_posts").delete().eq("id", postId);
    if (error) throw error;
  },

  async listComments(postId) {
    if (!sb) return [];
    const { data, error } = await sb
      .from("discussion_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },

  async addComment(userId, postId, body) {
    if (!sb) throw new Error("Supabase is not configured yet.");
    const { data, error } = await sb
      .from("discussion_comments")
      .insert({ user_id: userId, post_id: postId, body })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteComment(commentId) {
    if (!sb) return;
    const { error } = await sb.from("discussion_comments").delete().eq("id", commentId);
    if (error) throw error;
  },

  // ---- Reactions (emoji reactions on posts/comments — see schema.sql) ----

  async listPostReactions(postIds) {
    if (!sb || !postIds.length) return [];
    const { data, error } = await sb
      .from("reactions")
      .select("id, post_id, user_id, emoji")
      .in("post_id", postIds);
    if (error) throw error;
    return data;
  },

  async listCommentReactions(commentIds) {
    if (!sb || !commentIds.length) return [];
    const { data, error } = await sb
      .from("reactions")
      .select("id, comment_id, user_id, emoji")
      .in("comment_id", commentIds);
    if (error) throw error;
    return data;
  },

  async addPostReaction(userId, postId, emoji) {
    if (!sb) throw new Error("Supabase is not configured yet.");
    const { error } = await sb.from("reactions").insert({ user_id: userId, post_id: postId, emoji });
    if (error) throw error;
  },

  async removePostReaction(userId, postId, emoji) {
    if (!sb) return;
    const { error } = await sb
      .from("reactions")
      .delete()
      .eq("user_id", userId)
      .eq("post_id", postId)
      .eq("emoji", emoji);
    if (error) throw error;
  },

  async addCommentReaction(userId, commentId, emoji) {
    if (!sb) throw new Error("Supabase is not configured yet.");
    const { error } = await sb.from("reactions").insert({ user_id: userId, comment_id: commentId, emoji });
    if (error) throw error;
  },

  async removeCommentReaction(userId, commentId, emoji) {
    if (!sb) return;
    const { error } = await sb
      .from("reactions")
      .delete()
      .eq("user_id", userId)
      .eq("comment_id", commentId)
      .eq("emoji", emoji);
    if (error) throw error;
  },

  // ---- Private messages (Companions only — see schema.sql) ----

  async listConversations(userId) {
    // One row per thread — everyone userId has exchanged a message
    // with, most recent message first. Grouped client-side since
    // this is a small, per-user result set (no need for a DB view).
    if (!sb) return [];
    const { data, error } = await sb
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const byPartner = new Map();
    for (const msg of data) {
      const partnerId = msg.sender_id === userId ? msg.recipient_id : msg.sender_id;
      if (!byPartner.has(partnerId)) {
        byPartner.set(partnerId, {
          partnerId,
          lastMessage: msg,
          unreadCount: 0,
        });
      }
      if (msg.recipient_id === userId && !msg.read_at) {
        byPartner.get(partnerId).unreadCount += 1;
      }
    }
    return Array.from(byPartner.values());
  },

  async listMessages(userId, partnerId) {
    if (!sb) return [];
    const { data, error } = await sb
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${userId})`
      )
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },

  async sendMessage(senderId, recipientId, body) {
    if (!sb) throw new Error("Supabase is not configured yet.");
    const { data, error } = await sb
      .from("messages")
      .insert({ sender_id: senderId, recipient_id: recipientId, body })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async markThreadRead(userId, partnerId) {
    if (!sb) return;
    const { error } = await sb
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .eq("sender_id", partnerId)
      .is("read_at", null);
    if (error) throw error;
  },

  async unreadMessageCount(userId) {
    if (!sb) return 0;
    const { count, error } = await sb
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) throw error;
    return count || 0;
  },

  // ---- Notifications (@mentions in the Common Room) ----

  async listNotifications(userId, limit = 20) {
    if (!sb) return [];
    const { data, error } = await sb
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  async unreadNotificationCount(userId) {
    if (!sb) return 0;
    const { count, error } = await sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) throw error;
    return count || 0;
  },

  async markNotificationRead(notificationId) {
    if (!sb) return;
    const { error } = await sb
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId);
    if (error) throw error;
  },

  async markAllNotificationsRead(userId) {
    if (!sb) return;
    const { error } = await sb
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) throw error;
  },

  async createNotifications(rows) {
    if (!sb || !rows.length) return;
    const { error } = await sb.from("notifications").insert(rows);
    if (error) throw error;
  },

  // Public even to signed-out visitors — see get_latest_post_teaser
  // in schema.sql for what it deliberately does and doesn't expose.
  async getLatestPostTeaser() {
    if (!sb) return null;
    const { data, error } = await sb.rpc("get_latest_post_teaser");
    if (error) throw error;
    return data?.[0] || null;
  },
};

if (typeof window !== "undefined") window.SCA = SCA;
