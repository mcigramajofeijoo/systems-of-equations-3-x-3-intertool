# 3×3 Systems of Equations — Interactive 3D Visualizer

An educational web tool to **see** what solving a 3×3 system of linear equations means:
each equation in a, b and c is a plane in space, and the solution of the system is the
set of points shared by all three planes.

**Live demo:** https://mcigramajofeijoo.github.io/systems-of-equations-3-x-3-intertool/

## Features

- Define up to **3 planes**, each from a single equation — enter the four numbers of
  `k₁·a + k₂·b + k₃·c = d` and the plane appears instantly.
- **Live system diagnosis** with the answer in the same format math courses use:
  `point (3, 5, 2)`, `line (5 − b, b, 5)`, `plane (10 − b − c, b, c)`, or `no solutions`.
- Geometric explanation of every case: unique intersection point, common line
  (book-spine), coincident planes, triangular prism, parallel planes — with the
  intersection point / red solution line / pairwise dashed lines drawn in 3D.
- **6 example systems** (one per outcome), orbit camera, per-plane **View** button
  (face any plane head-on), edge-on views `a|b`, `b|c`, `a|c` to spot parallel planes,
  auto-rotate, grid, axes and plane-opacity controls.
- det(A) shown live, tying the algebra to the geometry.

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

## Publishing on GitHub Pages

Settings → Pages → **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`.
No workflow or manual build step required.

---

Made for learning · [say hi on LinkedIn](https://linkedin.com/in/mcigramajofeijoo)
