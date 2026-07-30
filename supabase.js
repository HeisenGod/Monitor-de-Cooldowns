(() => {
  const SUPABASE_URL = "https://xexgmgznjcaktmhphjmt.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Le-tV1p_Pu8GeAvdvb4ESw_tc8oiR4w";

  if (!window.supabase?.createClient) {
    console.error("A biblioteca do Supabase não foi carregada.");
    return;
  }

  // A biblioteca do CDN já usa window.supabase. O cliente da aplicação precisa
  // ter outro nome para não redeclarar o identificador global "supabase".
  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
})();
