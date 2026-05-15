const SR_SUPABASE_URL  = 'YOUR_SUPABASE_URL';
const SR_SUPABASE_KEY  = 'YOUR_SUPABASE_ANON_KEY';
const sr_sb = supabase.createClient(SR_SUPABASE_URL, SR_SUPABASE_KEY);

async function sr_createSession(siteUrl) {
  const { data, error } = await sr_sb
    .from('sr_sessions').insert({ site_url: siteUrl }).select().single();
  if (error) throw error;
  return data;
}

async function sr_getSession(id) {
  const { data } = await sr_sb
    .from('sr_sessions').select('*').eq('id', id).single();
  return data;
}

async function sr_getComments(sessionId) {
  const { data } = await sr_sb
    .from('sr_comments').select('*')
    .eq('session_id', sessionId).is('parent_id', null)
    .order('created_at');
  return data || [];
}

async function sr_getReplies(commentId) {
  const { data } = await sr_sb
    .from('sr_comments').select('*')
    .eq('parent_id', commentId).order('created_at');
  return data || [];
}

async function sr_addComment({ session_id, x_percent, y_percent, text, author, status = 'open', parent_id = null }) {
  const { data, error } = await sr_sb
    .from('sr_comments')
    .insert({ session_id, x_percent, y_percent, text, author, status, parent_id })
    .select().single();
  if (error) return null;
  return data;
}

async function sr_updateStatus(commentId, status) {
  await sr_sb.from('sr_comments').update({ status }).eq('id', commentId);
}

async function sr_deleteComment(commentId) {
  await sr_sb.from('sr_comments').delete().eq('id', commentId);
}
