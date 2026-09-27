# Games with Claude

Browser games built together with Claude.

| Game | Genre | Folder |
|---|---|---|
| **Riftline** | 3D arena roguelite shooter with twin-stick touch controls, installable as an offline PWA | [`riftline/`](riftline/) |
| **Riftdeck** | Roguelite deckbuilder with a 3D diorama battlefield, set in the Riftline universe | [`riftdeck/`](riftdeck/) |

Each game is self-contained in its folder with its own `package.json` and README.

## Playing online

Every push to `main` runs `.github/workflows/pages.yml`: it installs, tests and builds each game
and publishes it on GitHub Pages.

- Start page: <https://aaron40776.github.io/Games-with-Claude/>
- Riftline: <https://aaron40776.github.io/Games-with-Claude/riftline/>
- Riftdeck: <https://aaron40776.github.io/Games-with-Claude/riftdeck/>

One-time setup: *Settings → Pages → Build and deployment → Source: GitHub Actions*.
