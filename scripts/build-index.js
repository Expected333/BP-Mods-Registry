#!/usr/bin/env node
/**
 * Build script du BP-Mods-Registry.
 *
 * Scanne tous les repos GitHub publics taggés avec le topic donné (TOPIC env),
 * récupère le mod.json à la racine de chaque repo et la dernière release,
 * calcule le SHA256 du DLL, agrège tout dans public/index.json.
 *
 * Dépendances : Node 20+ uniquement (fetch et crypto natifs).
 *
 * Env:
 *   GITHUB_TOKEN   token de l'Action (rate-limit 5000 req/h authentifié)
 *   TOPIC          topic GitHub à scanner (default: brokeprotocol-mod)
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TOPIC = process.env.TOPIC || "brokeprotocol-mod";
const TOKEN = process.env.GITHUB_TOKEN;
const OUT_DIR = path.join(__dirname, "..", "public");
const BLOCKLIST_PATH = path.join(__dirname, "..", ".github", "blocklist.txt");
const SCHEMA_VERSION = 1;

if (!TOKEN) {
  console.error("GITHUB_TOKEN manquant");
  process.exit(1);
}

function ghHeaders(extra = {}) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "BP-Mods-Registry-Builder",
    ...extra
  };
}

async function gh(url) {
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
  return res.json();
}

async function searchReposByTopic(topic) {
  const repos = [];
  let page = 1;
  // L'API search retourne max 1000 résultats. Largement assez pour ce cas.
  while (true) {
    const url = `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(topic)}+is:public+archived:false&per_page=100&page=${page}`;
    const data = await gh(url);
    repos.push(...data.items);
    if (data.items.length < 100) break;
    page++;
    if (page > 10) break;
  }
  return repos;
}

async function getModJson(repo) {
  // raw.githubusercontent.com sert le fichier sur la branche par défaut sans rate-limit API.
  const url = `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/mod.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function getLatestRelease(repo) {
  try {
    return await gh(`https://api.github.com/repos/${repo.full_name}/releases/latest`);
  } catch {
    return null;
  }
}

function pickDllAsset(release, pattern) {
  if (!release || !Array.isArray(release.assets)) return null;
  const lowerPattern = pattern.toLowerCase();
  return release.assets.find(a => a.name.toLowerCase() === lowerPattern)
      || release.assets.find(a => a.name.toLowerCase().endsWith(".dll") && a.name.toLowerCase().includes(lowerPattern.replace(".dll", "")))
      || release.assets.find(a => a.name.toLowerCase().endsWith(".dll"));
}

async function sha256OfUrl(url) {
  const res = await fetch(url, {
    headers: ghHeaders({ Accept: "application/octet-stream" }),
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`download ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    size: buf.length
  };
}

function loadBlocklist() {
  if (!fs.existsSync(BLOCKLIST_PATH)) return new Set();
  const lines = fs.readFileSync(BLOCKLIST_PATH, "utf8").split(/\r?\n/);
  return new Set(
    lines
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("#"))
      .map(l => l.toLowerCase().replace(/\/$/, ""))
  );
}

function isValidManifest(m) {
  if (!m || typeof m !== "object") return false;
  if (typeof m.name !== "string" || !/^[A-Za-z0-9_.-]+$/.test(m.name)) return false;
  if (typeof m.version !== "string" || !/^\d+\.\d+\.\d+(-[A-Za-z0-9.]+)?$/.test(m.version)) return false;
  if (typeof m.author !== "string" || m.author.length === 0) return false;
  if (typeof m.dll_asset_pattern !== "string" || !m.dll_asset_pattern.toLowerCase().endsWith(".dll")) return false;
  return true;
}

async function main() {
  console.log(`Scan des repos taggés "${TOPIC}"...`);
  const repos = await searchReposByTopic(TOPIC);
  console.log(`→ ${repos.length} repos trouvés`);

  const blocklist = loadBlocklist();
  console.log(`Blocklist : ${blocklist.size} entrée(s)`);

  const mods = [];
  const errors = [];

  for (const repo of repos) {
    const repoUrl = repo.html_url.toLowerCase().replace(/\/$/, "");
    if (blocklist.has(repoUrl)) {
      console.log(`  ⊘ ${repo.full_name} (blocklist)`);
      continue;
    }

    try {
      const manifest = await getModJson(repo);
      if (!isValidManifest(manifest)) {
        console.log(`  ✗ ${repo.full_name} : mod.json manquant ou invalide`);
        errors.push({ repo: repo.full_name, reason: "invalid_manifest" });
        continue;
      }

      const release = await getLatestRelease(repo);
      if (!release) {
        console.log(`  ✗ ${repo.full_name} : aucune release`);
        errors.push({ repo: repo.full_name, reason: "no_release" });
        continue;
      }

      const asset = pickDllAsset(release, manifest.dll_asset_pattern);
      if (!asset) {
        console.log(`  ✗ ${repo.full_name} : aucun asset DLL trouvé dans ${release.tag_name}`);
        errors.push({ repo: repo.full_name, reason: "no_dll_asset" });
        continue;
      }

      const { sha256, size } = await sha256OfUrl(asset.browser_download_url);

      mods.push({
        name: manifest.name,
        version: manifest.version,
        author: manifest.author,
        description: manifest.description || "",
        repo: repo.html_url,
        homepage: manifest.homepage || repo.html_url,
        download_url: asset.browser_download_url,
        sha256,
        size_bytes: size,
        published_at: release.published_at,
        stars: repo.stargazers_count,
        dependencies: Array.isArray(manifest.dependencies) ? manifest.dependencies : [],
        min_modloader_version: manifest.min_modloader_version || "1.0.0",
        tags: Array.isArray(manifest.tags) ? manifest.tags : []
      });

      console.log(`  ✓ ${repo.full_name} → ${manifest.name} v${manifest.version}`);
    } catch (err) {
      console.log(`  ✗ ${repo.full_name} : ${err.message}`);
      errors.push({ repo: repo.full_name, reason: err.message });
    }
  }

  // Détection de doublons sur le name (premier arrivé gagne, on log).
  const seen = new Map();
  const deduped = [];
  for (const m of mods) {
    if (seen.has(m.name)) {
      console.log(`  ⚠ doublon de name "${m.name}" entre ${seen.get(m.name)} et ${m.repo}, ignoré`);
      continue;
    }
    seen.set(m.name, m.repo);
    deduped.push(m);
  }

  deduped.sort((a, b) => (b.stars - a.stars) || a.name.localeCompare(b.name));

  const index = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    mods: deduped
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "errors.json"), JSON.stringify(errors, null, 2));

  // Petite page de landing pour vérifier que Pages est bien servi.
  const landing = `<!doctype html><html><head><meta charset="utf-8"><title>BP Mods Registry</title>
<style>body{font:14px/1.4 ui-sans-serif,system-ui;background:#0e0f12;color:#ddd;max-width:780px;margin:40px auto;padding:0 20px}a{color:#7ab8ff}code{background:#1a1c20;padding:2px 6px;border-radius:4px}</style></head><body>
<h1>BP Mods Registry</h1>
<p>Index agrégé des mods Broke Protocol — généré toutes les heures à partir des repos GitHub publics taggés <code>${TOPIC}</code>.</p>
<ul>
<li><a href="index.json">index.json</a> (${deduped.length} mod(s))</li>
<li><a href="errors.json">errors.json</a> (${errors.length} échec(s))</li>
<li>Dernière génération : ${index.generated_at}</li>
</ul>
<p>Voir le <a href="https://github.com/${process.env.GITHUB_REPOSITORY || ""}">repo source</a> pour les instructions de publication.</p>
</body></html>`;
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), landing);

  console.log(`\nIndex écrit : ${deduped.length} mod(s), ${errors.length} échec(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
