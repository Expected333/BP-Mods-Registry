# BP Mods Registry

Auto-generated index of mods compatible with the **BrokeProtocol ModLoader**.

## For players

Open the **MODS** menu in-game → **Available** tab. Everything is there, no
manual install needed.

The index is served from GitHub Pages:

```
https://expected333.github.io/BP-Mods-Registry/index.json
```

## For modders — publishing a mod

You **don't need to modify anything in this repo**. Just:

1. **Create a public GitHub repo** for your mod.
2. At the repo root, add a **`mod.json`** ([schema](schema/mod.schema.json),
   [example](examples/example-mod.json)):
   ```json
   {
     "name": "MyMod",
     "version": "1.0.0",
     "author": "YourHandle",
     "description": "Short description of what the mod does.",
     "dll_asset_pattern": "MyMod.dll",
     "dependencies": [],
     "min_modloader_version": "1.0.0",
     "homepage": "https://github.com/YourHandle/MyMod"
   }
   ```
3. **Tag the repo with the topic `brokeprotocol-mod`** (⚙ "About" button on
   the repo page → Topics).
4. **Publish a GitHub Release** whose assets contain your `.dll` (its filename
   must match `dll_asset_pattern`).

That's it. The index is regenerated **hourly**, your mod will appear in the
in-game menu shortly after.

### Updating your mod

Publish a new Release. The `version` from your `mod.json` will be picked up,
and ModLoader will offer the update to players who already have the previous
version.

## How it works internally

```
                ┌────────────────────────────────────────┐
                │  Repos tagged `brokeprotocol-mod`      │
                │  ── mod.json                           │
                │  ── GitHub Release ── *.dll            │
                └──────────────────┬─────────────────────┘
                                   │
                          (scan via GitHub API)
                                   │
                                   ▼
                ┌────────────────────────────────────────┐
                │  GitHub Action (hourly cron)           │
                │  scripts/build-index.js                │
                │  → SHA256 each DLL                     │
                │  → generate index.json                 │
                └──────────────────┬─────────────────────┘
                                   │
                                   ▼
                ┌────────────────────────────────────────┐
                │  GitHub Pages: index.json (public)     │
                └──────────────────┬─────────────────────┘
                                   │
                                   ▼
                ┌────────────────────────────────────────┐
                │  ModLoader (in-game)                   │
                │  fetch → "Available" tab               │
                └────────────────────────────────────────┘
```

## Moderation

If a published mod is malicious / spam / illegal, open an
[issue](../../issues/new) tagged `report`. The mod will be added to the
**blocklist** in `.github/blocklist.txt` (one repo URL per line) and excluded
from the next index build.

## License

MIT for this registry. Each mod ships its own license — check the mod's repo.
