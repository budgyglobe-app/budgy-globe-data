// Cloudflare Worker : reçoit les propositions "retraits sans frais" de l'app
// et crée une "issue" dans ton dépôt GitHub public (onglet Issues).
//
// Variable secrète à créer dans le Worker (Settings > Variables and Secrets) :
//   GH_TOKEN = jeton GitHub "fine-grained" limité au dépôt budgy-globe-data,
//              permission "Issues : Read and write" (rien d'autre)

const REPO = "Jayjay7581/budgy-globe-data";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const clean = (x, n = 60) => String(x || "").replace(/[<>\n\r`]/g, " ").trim().slice(0, n);
const cc = (x) => (/^[A-Za-z]{2}$/.test(String(x)) ? String(x).toUpperCase() : "");

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return new Response("ok", { headers: CORS });

    let d;
    try { d = await req.json(); } catch { return new Response("bad request", { status: 400, headers: CORS }); }

    // champ piège anti-robots : si rempli, on fait semblant que c'est OK
    if (d.website) return new Response("ok", { headers: CORS });

    const p = { from: cc(d.from), to: cc(d.to), fromBank: clean(d.fromBank), bank: clean(d.bank), free: d.free === true };
    if (!p.from || !p.to || p.fromBank.length < 2 || p.bank.length < 2 || !p.free)
      return new Response("invalid", { status: 400, headers: CORS });

    const body =
      `- Pays du retrait : **${p.to}**\n` +
      `- Distributeur / banque : **${p.bank}**\n` +
      `- Carte / banque utilisée : **${p.fromBank}** (${p.from})\n` +
      `- 0 frais confirmé par l'utilisateur : oui\n\n` +
      `_À vérifier à la main avant d'ajouter dans banques_gratuites.json_`;

    const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
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
    return new Response(r.ok ? "ok" : "error", { status: r.ok ? 200 : 502, headers: CORS });
  },
};
