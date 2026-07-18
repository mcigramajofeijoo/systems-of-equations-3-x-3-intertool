# Sistemas de ecuaciones 3×3 — Visualizador geométrico interactivo

Herramienta web educativa para entender **visualmente** qué significa resolver un
sistema de ecuaciones lineales de 3 variables (3×3): cada ecuación es un plano en el
espacio, y la solución del sistema es el conjunto de puntos comunes a los tres planos.

**Demo en vivo:** https://mcigramajofeijoo.github.io/systems-of-equations-3-x-3-intertool/

## Qué permite hacer

- Definir hasta **3 planos**, cada uno por 3 puntos (con inputs numéricos o
  **arrastrando los puntos** directamente en la escena 3D con flechas de traslación).
- Ver en tiempo real la **ecuación cartesiana** de cada plano (`ax + by + cz = d`),
  su vector normal y el **determinante** de la matriz del sistema.
- **Diagnóstico automático del sistema** con explicación geométrica:
  - Solución única (punto rojo con coordenadas).
  - Infinitas soluciones: recta común (roja) o planos coincidentes.
  - Sin solución: paralelos, dos paralelos cortados por un tercero, o prisma
    triangular (con las rectas de corte por pares en gris punteado).
- **6 ejemplos precargados**, uno por cada tipo de sistema.
- Cámara orbital, vistas rápidas XY / XZ / YZ / isométrica, rotación automática,
  grilla y ejes con escala, control de opacidad de los planos.

## Estructura del repositorio

| Ruta | Contenido |
|---|---|
| `index.html` | **Sitio publicado.** Archivo único autocontenido (React + three.js + react-three-fiber + drei y todos los estilos inline). No requiere build ni red externa: GitHub Pages lo sirve tal cual. |
| `source/` | Código fuente (proyecto Vite + React). |

## Desarrollo (solo si querés modificar la herramienta)

```bash
cd source
npm install
npm run dev     # servidor local en http://localhost:5183
npm run build   # regenera ../index.html (archivo único autocontenido)
```

El build usa `vite-plugin-singlefile`, así que el resultado es siempre un único
`index.html` en la raíz del repo — no hay carpetas de assets ni rutas que puedan
romperse al servir el sitio desde un subpath como `usuario.github.io/repo/`.

## Publicación en GitHub Pages

Settings → Pages → **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`.
No hace falta ningún workflow ni paso de build.
