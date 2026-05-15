const SR_SUPABASE_URL  = 'https://hiccejzetnmmvyopyykw.supabase.co';
const SR_SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpY2NlanpldG5tbXZ5b3B5eWt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MjkwMTYsImV4cCI6MjA5NDQwNTAxNn0.Oo_KrFflZhhWOlaN_hT9XZpBjhDFAgccK82CyrgC3qU';
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

async function sr_findSession(siteUrl) {
  const { data } = await sr_sb
    .from('sr_sessions').select('*')
    .eq('site_url', siteUrl)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
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
