# SLE – 3x3 · Systems of Linear Equations in 3D

An educational web tool to **see** what solving a 3×3 system of linear equations means:
each equation in a, b and c is a plane in space, and the solution of the system is the
set of points shared by all three planes.

**Live demo:** https://mcigramajofeijoo.github.io/sle-3x3-viz/

## Features

- Define up to **3 planes**, each from a single equation — enter the four numbers of
  `k₁·a + k₂·b + k₃·c = d` and the plane appears instantly.
- **Live system diagnosis** with the answer in the same format math courses use:
  `Point(3, 5, 2)`, `Line(5 - b, b, 5)`, `Plane(10 - b - c, b, c)`, or `No solutions` —
  shown in a color-coded verdict panel (green for unique, indigo for infinite, red for
  inconsistent) together with `det(A)`.
- Geometric explanation of every case: unique intersection point, common line
  (book-spine), coincident planes, triangular prism, parallel planes — with the
  intersection point / red solution line / pairwise dashed lines drawn in 3D.
- Axis **intercept points** marked on each plane — where it crosses each axis.
- **6 example systems** (one per outcome), orbit camera, per-plane **View** button
  (face any plane head-on), a **View menu** with the `a|b`, `b|c`, `a|c` and default
  camera angles, toggleable **reference grids on all three coordinate planes**,
  auto-rotate, axes and plane-opacity controls.
- Every 3D tag can be hidden — per plane, for the solution, or for the axes — so
  labels never block the geometry you are trying to see.
- Set in the Saans and Saans SemiMono typefaces.

## Repository layout

| Path | Contents |
|---|---|
| `index.html` | **The published site.** A single self-contained file (React + three.js + react-three-fiber + drei and all styles inlined). No build step and no external requests needed: GitHub Pages serves it as-is. |
| `source/` | Source code (Vite + React project). |

## Development (only if you want to modify the tool)

```bash
cd source
npm install
npm run dev     # local server at http://localhost:5183
npm run build   # regenerates ../index.html (single self-contained file)
```

The build uses `vite-plugin-singlefile`, so the output is always one `index.html` at
the repo root — there are no asset folders or paths that could break when the site is
served from a subpath like `username.github.io/repo/`.

Note on fonts: the Saans woff2 files under `source/src/fonts/` are licensed and are
**not** committed to the repo. To rebuild, drop the six files listed at the top of
`source/src/index.css` into that folder first.

## Publishing on GitHub Pages

Settings → Pages → **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`.
No workflow or manual build step required.

---

Made for learning · [say hi on LinkedIn](https://linkedin.com/in/mcigramajofeijoo)
