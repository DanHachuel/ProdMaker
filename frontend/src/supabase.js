/* Cliente Supabase (lazy) — só é criado quando o servidor informa modo cloud. */
let client = null;

export const supabase = {
  configure(url, anonKey) {
    if (!client) {
      import("@supabase/supabase-js").then(({ createClient }) => {
        client = createClient(url, anonKey);
      });
    }
  },
  client() {
    return client;
  },
  async signOut() {
    if (client) await client.auth.signOut();
    localStorage.removeItem("prodmaker_token");
  },
};
