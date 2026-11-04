// Monitor de sitios IPUL: revisa DNS, que la página cargue con el texto correcto y los días de SSL.
// Sin dependencias: requiere Node 18+. Uso: node check.mjs
import { readFile, appendFile } from "node:fs/promises";
import { Resolver } from "node:dns/promises";
import tls from "node:tls";

const config = JSON.parse(await readFile(new URL("./sites.json", import.meta.url), "utf8"));
const resolver = new Resolver({ timeout: 5000, tries: 2 });
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

const UA = "Mozilla/5.0 (compatible; IPUL-Monitor/1.0)";

async function checkDns(site) {
  if (!site.expectIp) return [];
  const problems = [];
  let a = [], aaaa = [];
  try { a = await resolver.resolve4(site.host); } catch (e) { problems.push(`DNS: sin registro A (${e.code})`); }
  try { aaaa = await resolver.resolve6(site.host); } catch { /* sin AAAA es lo esperado */ }
  const wrongA = a.filter((ip) => ip !== site.expectIp);
  if (a.length && !a.includes(site.expectIp)) problems.push(`DNS: apunta a ${a.join(", ")} en vez de ${site.expectIp}`);
  else if (wrongA.length) problems.push(`DNS: además del VPS apunta a ${wrongA.join(", ")}`);
  if (aaaa.length) problems.push(`DNS: tiene IPv6 (AAAA) ${aaaa.join(", ")} que no es del VPS`);
  return problems;
}

async function checkHttp(site) {
  const url = `https://${site.host}${site.path || "/"}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA } });
    const body = await res.text();
    const problems = [];
    if (res.status >= 400) problems.push(`HTTP ${res.status} en ${res.url}`);
    if (site.keyword && !body.includes(site.keyword)) problems.push(`Contenido: no aparece "${site.keyword}" en ${res.url} (¿versión vieja o página rota?)`);
    return problems;
  } catch (e) {
    const cause = e.cause?.code || e.cause?.message || e.name || e.message;
    return [`HTTP: no carga ${url} (${cause})`];
  } finally {
    clearTimeout(timer);
  }
}

function checkSsl(site) {
  return new Promise((resolve) => {
    const sock = tls.connect({ host: site.host, port: 443, servername: site.host, rejectUnauthorized: false, timeout: 15000 }, () => {
      const cert = sock.getPeerCertificate();
      const problems = [];
      if (!sock.authorized) problems.push(`SSL: certificado inválido (${sock.authorizationError})`);
      if (cert?.valid_to) {
        const days = Math.floor((new Date(cert.valid_to) - Date.now()) / 86400000);
        if (days < config.sslMinDays) problems.push(`SSL: vence en ${days} días (${cert.valid_to})`);
        site._sslDays = days;
      }
      sock.end();
      resolve(problems);
    });
    sock.on("timeout", () => { sock.destroy(); resolve(["SSL: tiempo de espera agotado"]); });
    sock.on("error", (e) => resolve([`SSL: error de conexión (${e.code || e.message})`]));
  });
}

const results = await Promise.all(config.sites.map(async (site) => {
  const problems = [...(await checkDns(site)), ...(await checkHttp(site)), ...(await checkSsl(site))];
  return { host: site.host, problems, sslDays: site._sslDays };
}));

const failed = results.filter((r) => r.problems.length);
const lines = results.map((r) =>
  r.problems.length
    ? `❌ ${r.host}\n   - ${r.problems.join("\n   - ")}`
    : `✅ ${r.host}  (SSL: ${r.sslDays ?? "?"} días)`
);
const report = lines.join("\n");
console.log(report);

// Resumen visible en la página de la ejecución en GitHub
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ["| Sitio | Estado |", "|---|---|", ...results.map((r) =>
    `| ${r.host} | ${r.problems.length ? "❌ " + r.problems.join("<br>") : `✅ OK (SSL ${r.sslDays ?? "?"} días)`} |`)];
  await appendFile(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
}

// Aviso opcional por Telegram (solo si existen los secretos)
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
if (failed.length && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
  const text = `⚠️ Problema en ${failed.length} sitio(s) IPUL\n\n` +
    failed.map((r) => `❌ ${r.host}\n- ${r.problems.join("\n- ")}`).join("\n\n");
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
  } catch (e) { console.log("No se pudo enviar el aviso a Telegram:", e.message); }
}

// Si algo falla, la ejecución termina en error y GitHub envía el correo de aviso.
process.exit(failed.length ? 1 : 0);
