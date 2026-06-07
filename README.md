# BP Mods Registry

Index automatique des mods Broke Protocol compatibles avec **ModLoader**.

## Pour les joueurs

Ouvre le menu **MODS** dans le jeu → onglet **Disponibles**. Tout y est, rien à installer manuellement.

L'index est servi depuis GitHub Pages :

```
https://expected333.github.io/BP-Mods-Registry/index.json
```

## Pour les modders — publier un mod

Tu n'as **rien à modifier ici**. Il te suffit de :

1. **Créer un repo GitHub public** pour ton mod.
2. À la racine, mettre un fichier **`mod.json`** ([schéma](schema/mod.schema.json), [exemple](examples/example-mod.json)) :
   ```json
   {
     "name": "MonMod",
     "version": "1.0.0",
     "author": "TonPseudo",
     "description": "Description courte de ce que fait le mod.",
     "dll_asset_pattern": "MonMod.dll",
     "dependencies": [],
     "min_modloader_version": "1.0.0",
     "homepage": "https://github.com/TonPseudo/MonMod"
   }
   ```
3. **Tagger le repo avec le topic `brokeprotocol-mod`** (bouton ⚙ "About" sur la page du repo → Topics).
4. **Publier une GitHub Release** dont les assets contiennent ton `.dll` (le nom doit matcher `dll_asset_pattern`).

Et c'est tout. L'index est régénéré **toutes les heures**, ton mod apparaîtra dans le menu en jeu.

### Pour mettre à jour ton mod

Publie une nouvelle release. Le `version` de ton `mod.json` sera mis à jour, et le ModLoader proposera la mise à jour aux joueurs qui ont déjà la version précédente.

## Comment ça marche en interne

```
                ┌────────────────────────────────────────┐
                │  Repos taggés `brokeprotocol-mod`      │
                │  ── mod.json                           │
                │  ── GitHub Release ── *.dll            │
                └──────────────────┬─────────────────────┘
                                   │
                          (scan via GitHub API)
                                   │
                                   ▼
                ┌────────────────────────────────────────┐
                │  GitHub Action (cron horaire)          │
                │  scripts/build-index.js                │
                │  → calcule SHA256 de chaque DLL        │
                │  → génère index.json                   │
                └──────────────────┬─────────────────────┘
                                   │
                                   ▼
                ┌────────────────────────────────────────┐
                │  GitHub Pages : index.json (public)    │
                └──────────────────┬─────────────────────┘
                                   │
                                   ▼
                ┌────────────────────────────────────────┐
                │  ModLoader (en jeu)                    │
                │  fetch → onglet "Disponibles"          │
                └────────────────────────────────────────┘
```

## Modération

Si un mod publié est malveillant / spam / illégal, ouvre une [issue](../../issues/new) avec le tag `report`. Le mod sera ajouté à la **blocklist** dans `.github/blocklist.txt` (une ligne = un repo URL) et exclu de l'index au prochain build.

## License

MIT pour ce registry. Chaque mod a sa propre license, vérifie sur le repo du mod.
