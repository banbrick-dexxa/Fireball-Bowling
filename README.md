# Fireball Bowling

Fireball Bowling is a mobile-first React + Vite bowling mini game built for one real four-person team night. It uses one lane, full 10-frame scoring, visible four-bowler scoreboards, a fixed angled 2.5D lane view, touch-friendly aiming controls, house-shot hook behavior, split detection, and generated SFX.

## Tech

- React + Vite + TypeScript
- Canvas lane renderer with React UI shell
- No backend
- No multiplayer
- No heavy game engine

## Editable Team Names

Update the four placeholder bowlers in:

- `src/config/bowlers.ts`

## Local Development

Use Node.js 20+.

```bash
npm install
npm run dev
```

## Production Build

```bash
npm install
npm run build
```

The GitHub Pages project-path base is already configured in `vite.config.ts`:

- `/Fireball-Bowling/`

## Manual GitHub Pages Deploy

Recommended manual deploy flow: publish the built app from a `docs/` folder on `main`.

1. Install dependencies:

```bash
npm install
```

2. Build the app:

```bash
npm run build
```

3. Replace `docs/` with the built output:

```bash
rm -rf docs
mkdir docs
cp -R dist/* docs/
```

4. Commit and push the updated `docs/` folder to GitHub.

5. In GitHub:

- Open the `Fireball-Bowling` repository.
- Go to `Settings` -> `Pages`.
- Set `Source` to `Deploy from a branch`.
- Select branch `main`.
- Select folder `/docs`.
- Save.

6. GitHub Pages will serve the app from:

- `https://<your-github-user>.github.io/Fireball-Bowling/`

## Notes

- Bowlers always stay visible on the scoreboard.
- Team totals are calculated from the live running totals.
- Audio is generated in-browser with Web Audio, so no separate audio assets are required.
- The game is designed for landscape phones first, but also works on desktop browsers.
