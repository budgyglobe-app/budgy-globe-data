// Cloudflare Worker : reçoit les propositions "retraits sans frais" de l'app
// et crée une "issue" dans ton dépôt GitHub public (onglet Issues).
//
// Variable secrète à créer dans le Worker (Settings > Variables and Secrets) :
//   GH_TOKEN = jeton GitHub "fine-grained" limité au dépôt budgy-globe-data,
//              permission "Issues : Read and write" (rien d'autre)
//
// Protections côté serveur :
//   - limite par adresse IP (binding "LIMITER", voir wrangler.jsonc)
//   - taille maximale de la requête
//   - champs obligatoires et nettoyés
//   - champ piège anti-robots

const REPO = "budgyglobe-app/budgy-globe-data";
const MAX_BODY = 1000; // octets/caractères max pour la requête entière

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const clean = (x, n = 60) => String(x || "").replace(/[<>\n\r`]/g, " ").trim().slice(0, n);
const cc = (x) => (/^[A-Za-z]{2}$/.test(String(x)) ? String(x).toUpperCase() : "");
const reply = (text, status = 200) => new Response(text, { status, headers: CORS });

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return reply("ok");

    // 1) Limite par adresse IP (si le binding est configuré)
    if (env.LIMITER) {
      const ip = req.headers.get("cf-connecting-ip") || "inconnue";
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return reply("too many requests", 429);
    }

    // 2) Taille maximale
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > MAX_BODY) return reply("too large", 413);
    let raw;
    try { raw = await req.text(); } catch { return reply("bad request", 400); }
    if (raw.length > MAX_BODY) return reply("too large", 413);

    // 3) JSON valide, sous forme d'objet
    let d;
    try { d = JSON.parse(raw); } catch { return reply("bad request", 400); }
    if (!d || typeof d !== "object" || Array.isArray(d)) return reply("bad request", 400);

    // champ piège anti-robots : si rempli, on fait semblant que c'est OK
    if (d.website) return reply("ok");

    // 4) Champs obligatoires et nettoyés
    const p = { from: cc(d.from), to: cc(d.to), fromBank: clean(d.fromBank), bank: clean(d.bank), free: d.free === true };
    if (!p.from || !p.to || p.fromBank.length < 2 || p.bank.length < 2 || !p.free)
      return reply("invalid", 400);

    const body =
      `- Pays du retrait : **${p.to}**\n` +
      `- Distributeur / banque : **${p.bank}**\n` +
      `- Carte / banque utilisée : **${p.fromBank}** (${p.from})\n` +
      `- 0 frais confirmé par l'utilisateur : oui\n\n` +
      `_À vérifier à la main avant d'ajouter dans banques_gratuites.json_`;

    let r;
    try {
      r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "budgy-globe-proposals",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: `Proposition : ${p.bank} (${p.to}) avec ${p.fromBank}`, body }),
      });
    } catch {
      return reply("error", 502);
    }
    return reply(r.ok ? "ok" : "error", r.ok ? 200 : 502);
  },
};
