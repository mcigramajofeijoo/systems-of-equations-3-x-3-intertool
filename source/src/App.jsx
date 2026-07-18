import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Html, TransformControls } from '@react-three/drei'
import * as THREE from 'three'

/* ================================================================== */
/*  Álgebra lineal (vectores como arrays [x, y, z])                    */
/* ================================================================== */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const norm = (a) => Math.hypot(a[0], a[1], a[2])

/** Plano por 3 puntos → { n, d, u, du, anchor } o null si son colineales. */
function planeFromPoints(pts) {
  const v1 = sub(pts[1], pts[0])
  const v2 = sub(pts[2], pts[0])
  const n = cross(v1, v2)
  const len = norm(n)
  const ref = norm(v1) * norm(v2)
  if (ref < 1e-12 || len < 1e-7 * Math.max(1, ref)) return null
  const d = dot(n, pts[0])
  const u = scl(n, 1 / len)
  const du = d / len
  return { n, d, u, du, anchor: scl(u, du) }
}

/** Relación entre 2 planos: recta de corte, paralelos o coincidentes. */
function pairRelation(p1, p2) {
  const c = cross(p1.u, p2.u)
  const L = norm(c)
  if (L < 1e-6) {
    const s = dot(p1.u, p2.u) > 0 ? 1 : -1
    const coincident = Math.abs(p2.du - s * p1.du) < 1e-6 * (1 + Math.abs(p1.du))
    return { type: coincident ? 'coincident' : 'parallel' }
  }
  const dir = scl(c, 1 / L)
  // punto de la recta: ((d1·n2 − d2·n1) × (n1×n2)) / |n1×n2|²
  let q = scl(cross(sub(scl(p2.u, p1.du), scl(p1.u, p2.du)), c), 1 / (L * L))
  q = sub(q, scl(dir, dot(q, dir))) // punto de la recta más cercano al origen
  return { type: 'line', line: { q, dir } }
}

/**
 * Clasifica el sistema formado por los planos activos.
 * items: [{ slot, plane }]
 */
function classify(items) {
  const m = items.length
  if (m === 0) return { kind: 'empty' }
  if (m === 1) return { kind: 'one', slots: [items[0].slot] }

  if (m === 2) {
    const rel = pairRelation(items[0].plane, items[1].plane)
    const slots = [items[0].slot, items[1].slot]
    if (rel.type === 'line') return { kind: 'two-line', line: rel.line, slots }
    if (rel.type === 'coincident') return { kind: 'two-coincident', slots }
    return { kind: 'two-parallel', slots }
  }

  const u = items.map((i) => i.plane.u)
  const du = items.map((i) => i.plane.du)
  const det = dot(u[0], cross(u[1], u[2]))
  const pairs = [[0, 1], [0, 2], [1, 2]].map(([i, j]) => ({
    i, j,
    rel: pairRelation(items[i].plane, items[j].plane),
  }))
  const lines = pairs.filter((p) => p.rel.type === 'line')
  const pairLines = lines.map((l) => ({
    slots: [items[l.i].slot, items[l.j].slot],
    line: l.rel.line,
  }))

  if (Math.abs(det) > 1e-7) {
    const point = scl(
      add(add(scl(cross(u[1], u[2]), du[0]), scl(cross(u[2], u[0]), du[1])), scl(cross(u[0], u[1]), du[2])),
      1 / det
    )
    return { kind: 'unique', point, pairLines }
  }

  if (lines.length === 0) {
    const coinc = pairs.filter((p) => p.rel.type === 'coincident').length
    if (coinc === 3) return { kind: 'plane' }
    if (coinc >= 1) return { kind: 'incompatible', subtype: 'coincident-parallel', pairLines: [] }
    return { kind: 'incompatible', subtype: 'all-parallel', pairLines: [] }
  }

  // rango 2: ¿la recta de un par pertenece también al tercer plano?
  const L0 = lines[0]
  const k = [0, 1, 2].find((x) => x !== L0.i && x !== L0.j)
  const contained = Math.abs(dot(u[k], L0.rel.line.q) - du[k]) < 1e-6 * (1 + Math.abs(du[k]))
  if (contained) {
    const hasCoincidentPair = pairs.some((p) => p.rel.type === 'coincident')
    return { kind: 'line', line: L0.rel.line, hasCoincidentPair }
  }
  const hasParallelPair = pairs.some((p) => p.rel.type === 'parallel')
  return {
    kind: 'incompatible',
    subtype: hasParallelPair ? 'two-parallel-cut' : 'prism',
    pairLines,
  }
}

/* ---------- formato de números y ecuaciones ---------- */

function fmt(v, dec = 2) {
  if (!Number.isFinite(v)) return '–'
  const r = Math.round(v * 10 ** dec) / 10 ** dec
  return String(Object.is(r, -0) ? 0 : r)
}

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b)
  while (b) { [a, b] = [b, a % b] }
  return a
}

/** Reduce (n, d) a la forma más legible posible (enteros chicos si se puede). */
function reduceEq(n, d) {
  let vals = [n[0], n[1], n[2], d]
  const ints = vals.map((v) => Math.round(v))
  const intish = vals.every((v, i) => Math.abs(v - ints[i]) < 1e-6 * Math.max(1, Math.abs(v)))
  if (intish) {
    const g = ints.reduce((acc, v) => gcd(acc, v), 0)
    vals = g > 1 ? ints.map((v) => v / g) : ints
  } else {
    const mx = Math.max(Math.abs(vals[0]), Math.abs(vals[1]), Math.abs(vals[2]))
    if (mx > 0) vals = vals.map((v) => v / mx)
  }
  const lead = [vals[0], vals[1], vals[2]].find((v) => Math.abs(v) > 1e-12)
  if (lead < 0) vals = vals.map((v) => -v)
  return { n: [vals[0], vals[1], vals[2]], d: vals[3] }
}

function eqString(n, d) {
  const vars = ['x', 'y', 'z']
  const terms = []
  n.forEach((c, i) => {
    if (Math.abs(c) < 1e-10) return
    const a = Math.abs(c)
    const coef = Math.abs(a - 1) < 1e-10 ? '' : fmt(a)
    terms.push({ neg: c < 0, text: coef + vars[i] })
  })
  if (!terms.length) return '0 = ' + fmt(d)
  let s = (terms[0].neg ? '−' : '') + terms[0].text
  for (let i = 1; i < terms.length; i++) s += (terms[i].neg ? ' − ' : ' + ') + terms[i].text
  return s + ' = ' + fmt(d)
}

const fmtVec = (v) => `(${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])})`

/** Dirección escalada para mostrar: componente máxima = 1 (o enteros chicos). */
function displayDir(dir) {
  const mx = Math.max(Math.abs(dir[0]), Math.abs(dir[1]), Math.abs(dir[2]))
  if (mx < 1e-12) return dir
  let v = scl(dir, 1 / mx)
  const r = v.map((x) => Math.round(x))
  if (v.every((x, i) => Math.abs(x - r[i]) < 1e-6)) v = r
  return v
}

/* ================================================================== */
/*  Constantes de la herramienta                                       */
/* ================================================================== */

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b']
const COLOR_NAMES = ['azul', 'verde', 'ámbar']
const PT_LABELS = ['A', 'B', 'C']
const PLANE_HALF = 13
const LINE_HALF = 22
const WORLD = 15

const VIEWS = {
  iso: { pos: [19.5, -19.5, 14.5], up: [0, 0, 1], label: '3D' },
  xy: { pos: [0, 0, 30], up: [0, 1, 0], label: 'XY' },
  xz: { pos: [0, -30, 0], up: [0, 0, 1], label: 'XZ' },
  yz: { pos: [30, 0, 0], up: [0, 0, 1], label: 'YZ' },
}

const PRESETS = [
  {
    id: 'unica', label: 'Solución única — se cortan en 1 punto',
    pts: [
      [[9, 0, 0], [0, 9, 0], [0, 0, 9]],
      [[0, 0, 0], [4, 4, 0], [0, 0, 4]],
      [[0, 0, 3], [4, 0, 3], [0, 4, 3]],
    ],
  },
  {
    id: 'recta', label: 'Infinitas soluciones — recta común (libro abierto)',
    pts: [
      [[0, 0, 3], [5, 0, 3], [0, 5, 3]],
      [[0, 0, 0], [5, 5, 0], [0, 0, 5]],
      [[3, 0, 0], [0, -3, 0], [0, 3, 6]],
    ],
  },
  {
    id: 'coinc', label: 'Infinitas soluciones — 3 planos coincidentes',
    pts: [
      [[6, 0, 0], [0, 6, 0], [0, 0, 6]],
      [[2, 2, 2], [4, 2, 0], [0, 4, 2]],
      [[1, 2, 3], [3, 2, 1], [2, 0, 4]],
    ],
  },
  {
    id: 'prisma', label: 'Sin solución — prisma triangular',
    pts: [
      [[2, 0, 0], [2, 6, 0], [2, 0, 6]],
      [[0, 2, 0], [6, 2, 0], [0, 2, 6]],
      [[8, 0, 0], [0, 8, 0], [8, 0, 6]],
    ],
  },
  {
    id: 'dospar', label: 'Sin solución — 2 paralelos + 1 transversal',
    pts: [
      [[0, 0, -3], [5, 0, -3], [0, 5, -3]],
      [[0, 0, 3], [5, 0, 3], [0, 5, 3]],
      [[2, 0, 0], [0, 0, 2], [2, 5, 0]],
    ],
  },
  {
    id: 'trespar', label: 'Sin solución — 3 planos paralelos',
    pts: [
      [[0, 0, -5], [5, 0, -5], [0, 5, -5]],
      [[0, 0, 0], [5, 0, 0], [0, 5, 0]],
      [[0, 0, 5], [5, 0, 5], [0, 5, 5]],
    ],
  },
]

const emptyPts = () => [['', '', ''], ['', '', ''], ['', '', '']]
const newPlane = (slot) => ({ slot, showPlane: true, showPoints: true, pts: emptyPts() })

function parseCoord(s) {
  const t = String(s).trim()
  if (t === '' || t === '-' || t === '+') return NaN
  return Number(t.replace(',', '.'))
}

/* ================================================================== */
/*  Componentes 3D                                                     */
/* ================================================================== */

const noRaycast = () => null

function AxesAndGrid({ showGrid, showAxes }) {
  const axes = [
    { dir: [1, 0, 0], color: '#f87171', label: 'X', labelPos: [WORLD + 1.6, 0, 0], coneRot: [0, 0, -Math.PI / 2] },
    { dir: [0, 1, 0], color: '#4ade80', label: 'Y', labelPos: [0, WORLD + 1.6, 0], coneRot: [0, 0, 0] },
    { dir: [0, 0, 1], color: '#60a5fa', label: 'Z', labelPos: [0, 0, WORLD + 1.6], coneRot: [Math.PI / 2, 0, 0] },
  ]
  const ticks = [-10, -5, 5, 10]
  return (
    <group>
      {showGrid && (
        <gridHelper
          args={[2 * WORLD, 2 * WORLD, '#31415e', '#1a2436']}
          rotation={[Math.PI / 2, 0, 0]}
          raycast={noRaycast}
        />
      )}
      {showAxes && axes.map((ax) => (
        <group key={ax.label}>
          <Line
            points={[scl(ax.dir, -WORLD - 1), scl(ax.dir, WORLD + 1)]}
            color={ax.color}
            lineWidth={1.6}
            transparent
            opacity={0.85}
            raycast={noRaycast}
          />
          <mesh position={scl(ax.dir, WORLD + 1)} rotation={ax.coneRot} raycast={noRaycast}>
            <coneGeometry args={[0.28, 0.9, 12]} />
            <meshBasicMaterial color={ax.color} />
          </mesh>
          <Html position={ax.labelPos} center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
            <div className="axisTag" style={{ color: ax.color }}>{ax.label}</div>
          </Html>
          {ticks.map((t) => (
            <Html
              key={t}
              position={scl(ax.dir, t)}
              center
              zIndexRange={[40, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div className="tickTag" style={{ transform: 'translateY(11px)' }}>{t}</div>
            </Html>
          ))}
        </group>
      ))}
    </group>
  )
}

function planeBasis(u) {
  const t = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const c = cross(u, t)
  const b1 = scl(c, 1 / norm(c))
  const b2 = cross(u, b1)
  return [b1, b2]
}

function PlaneSurface({ plane, color, opacity, label }) {
  const { quat, border, labelPos } = useMemo(() => {
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(plane.u[0], plane.u[1], plane.u[2])
    )
    const [b1, b2] = planeBasis(plane.u)
    const S = PLANE_HALF
    const cs = [
      add(plane.anchor, add(scl(b1, S), scl(b2, S))),
      add(plane.anchor, add(scl(b1, -S), scl(b2, S))),
      add(plane.anchor, add(scl(b1, -S), scl(b2, -S))),
      add(plane.anchor, add(scl(b1, S), scl(b2, -S))),
    ]
    return {
      quat: q,
      border: [...cs, cs[0]],
      labelPos: add(plane.anchor, add(scl(b1, S * 0.86), scl(b2, S * 0.86))),
    }
  }, [plane])
  return (
    <group>
      <mesh position={plane.anchor} quaternion={quat} raycast={noRaycast} renderOrder={1}>
        <planeGeometry args={[PLANE_HALF * 2, PLANE_HALF * 2]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Line points={border} color={color} lineWidth={1.1} transparent opacity={0.75} raycast={noRaycast} />
      <Html position={labelPos} center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
        <div className="tag3d" style={{ background: color }}>{label}</div>
      </Html>
    </group>
  )
}

function PlanePoints({ planeState, color, selected, onSelect, onMove }) {
  const pts = planeState.pts.map((r) => r.map(parseCoord))
  return (
    <group>
      {pts.map((p, i) => {
        if (!p.every(Number.isFinite)) return null
        const isSel = selected && selected.slot === planeState.slot && selected.idx === i
        const sphere = (
          <mesh
            position={isSel ? undefined : p}
            onClick={(e) => { e.stopPropagation(); onSelect({ slot: planeState.slot, idx: i }) }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
            onPointerOut={() => { document.body.style.cursor = 'auto' }}
          >
            <sphereGeometry args={[isSel ? 0.38 : 0.3, 24, 24]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={isSel ? 0.55 : 0.22}
            />
          </mesh>
        )
        return (
          <group key={i}>
            {isSel ? (
              <TransformControls
                position={p}
                mode="translate"
                translationSnap={0.5}
                size={0.72}
                onObjectChange={(e) => {
                  const o = e?.target?.object
                  if (o) onMove(planeState.slot, i, [o.position.x, o.position.y, o.position.z])
                }}
              >
                {sphere}
              </TransformControls>
            ) : (
              sphere
            )}
            <Html position={p} center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
              <div className="ptTag" style={{ borderColor: color }}>
                {PT_LABELS[i]}{isSel ? ` ${fmtVec(p)}` : ''}
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

function InterLine({ line, color, lineWidth = 2, dashed = false, label = null }) {
  const a = add(line.q, scl(line.dir, -LINE_HALF))
  const b = add(line.q, scl(line.dir, LINE_HALF))
  return (
    <group>
      <Line
        points={[a, b]}
        color={color}
        lineWidth={lineWidth}
        dashed={dashed}
        dashSize={0.55}
        gapSize={0.38}
        raycast={noRaycast}
      />
      {label && (
        <Html
          position={add(line.q, scl(line.dir, LINE_HALF * 0.55))}
          center
          zIndexRange={[40, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="lineTag">{label}</div>
        </Html>
      )}
    </group>
  )
}

function SolutionPoint({ point }) {
  return (
    <group>
      <mesh position={point} raycast={noRaycast}>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
      </mesh>
      <Html position={point} center zIndexRange={[45, 0]} style={{ pointerEvents: 'none' }}>
        <div className="coordTag">{fmtVec(point)}</div>
      </Html>
    </group>
  )
}

/** Anima la cámara hacia las vistas rápidas. Se cancela si el usuario orbita. */
function CameraRig({ viewReq }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const target = useRef(null)
  const zero = useMemo(() => new THREE.Vector3(0, 0, 0), [])

  useEffect(() => {
    if (!viewReq) return
    camera.up.set(...viewReq.up)
    target.current = new THREE.Vector3(...viewReq.pos)
  }, [viewReq, camera])

  useEffect(() => {
    if (!controls) return
    const stop = () => { target.current = null }
    controls.addEventListener('start', stop)
    return () => controls.removeEventListener('start', stop)
  }, [controls])

  useFrame((_, dt) => {
    if (!target.current || !controls) return
    const k = 1 - Math.pow(0.0004, Math.min(dt, 0.05))
    camera.position.lerp(target.current, k)
    controls.target.lerp(zero, k)
    controls.update()
    if (camera.position.distanceTo(target.current) < 0.03) target.current = null
  })
  return null
}

/* ================================================================== */
/*  Panel: diagnóstico                                                 */
/* ================================================================== */

function diagnosisContent(sys, activeEqs) {
  switch (sys.kind) {
    case 'empty':
      return {
        badge: null,
        msg: 'Sin planos activos',
        explain: 'Cargá los 3 puntos de un plano y tildá «Mostrar plano», o elegí un ejemplo arriba para empezar.',
      }
    case 'one':
      return {
        badge: ['info', 'Infinitas soluciones'],
        msg: 'Un solo plano activo',
        explain: 'Una ecuación con 3 incógnitas tiene infinitas soluciones: todos los puntos del plano la cumplen. Activá más planos para ver cómo se restringe el conjunto solución.',
      }
    case 'two-line':
      return {
        badge: ['info', 'Infinitas soluciones'],
        msg: 'Dos planos que se cortan en una recta',
        explain: 'Con 2 ecuaciones y 3 incógnitas el sistema es compatible indeterminado: las soluciones son todos los puntos de la recta de intersección (violeta). Un tercer plano puede dejar un punto, una recta, o nada.',
      }
    case 'two-parallel':
      return {
        badge: ['bad', 'Sin solución'],
        msg: 'Planos paralelos, sin intersección',
        explain: 'Los dos planos tienen la misma dirección (normales paralelas) pero distinta posición: no comparten ningún punto. El sistema es incompatible.',
      }
    case 'two-coincident':
      return {
        badge: ['info', 'Infinitas soluciones'],
        msg: 'Dos planos coincidentes',
        explain: 'Las dos ecuaciones son equivalentes (una es múltiplo de la otra): describen el mismo plano. Todo punto del plano es solución.',
      }
    case 'unique':
      return {
        badge: ['ok', 'Solución única'],
        msg: `Solución única en el punto ${fmtVec(sys.point)}`,
        explain: 'Los tres planos se cortan en un único punto: es el único (x, y, z) que cumple las tres ecuaciones a la vez. Sistema compatible determinado (det(A) ≠ 0).',
      }
    case 'line':
      return {
        badge: ['info', 'Infinitas soluciones'],
        msg: 'Sistema con infinitas soluciones (recta común)',
        explain: (sys.hasCoincidentPair
          ? 'Dos de los planos coinciden y el tercero los corta: '
          : 'Los tres planos comparten una misma recta, como las hojas de un libro comparten el lomo: ')
          + 'todos los puntos de la recta roja cumplen las tres ecuaciones. Sistema compatible indeterminado.',
      }
    case 'plane':
      return {
        badge: ['info', 'Infinitas soluciones'],
        msg: 'Los tres planos coinciden',
        explain: 'Las tres ecuaciones son equivalentes entre sí: es tres veces el mismo plano. Todo punto del plano es solución (sistema compatible indeterminado).',
      }
    case 'incompatible': {
      const sub = {
        'all-parallel': 'Los tres planos son paralelos y están a distintas alturas: nunca se tocan.',
        'coincident-parallel': 'Dos planos coinciden entre sí, pero el tercero es paralelo a ellos: nunca los toca.',
        'two-parallel-cut': 'Dos planos son paralelos entre sí y el tercero los atraviesa: se forman dos rectas de corte paralelas que nunca se encuentran.',
        'prism': 'Cada par de planos se corta en una recta, pero las tres rectas son paralelas entre sí (forman un prisma triangular): no existe ningún punto común a los tres.',
      }[sys.subtype]
      return {
        badge: ['bad', 'Sin solución'],
        msg: 'Sistema incompatible (sin solución)',
        explain: sub + ' Ningún (x, y, z) cumple las tres ecuaciones a la vez.',
      }
    }
    default:
      return { badge: null, msg: '', explain: '' }
  }
}

function DiagnosticCard({ sys, activeItems }) {
  const { badge, msg, explain } = diagnosisContent(sys, activeItems)
  const eqs = activeItems.map((it) => {
    const r = reduceEq(it.plane.n, it.plane.d)
    return { slot: it.slot, str: eqString(r.n, r.d), red: r }
  })

  let detInfo = null
  if (activeItems.length === 3) {
    const [a, b, c] = eqs.map((e) => e.red.n)
    const det = dot(a, cross(b, c))
    detInfo = { det, singular: Math.abs(det) < 1e-9 }
  }

  return (
    <div className="card">
      <h2>Diagnóstico del sistema</h2>
      {eqs.length > 0 && (
        <div className="eqList">
          {eqs.map((e) => (
            <div className="eqItem" key={e.slot}>
              <span className="dot" style={{ background: COLORS[e.slot] }} />
              <span>{e.str}</span>
            </div>
          ))}
        </div>
      )}
      {badge && <span className={`badge ${badge[0]}`}>{badge[1]}</span>}
      <p className="diagMsg">{msg}</p>
      <p className="diagExplain">{explain}</p>

      {sys.kind === 'unique' && (
        <div className="diagData">
          x = {fmt(sys.point[0])}&nbsp;&nbsp;y = {fmt(sys.point[1])}&nbsp;&nbsp;z = {fmt(sys.point[2])}
        </div>
      )}
      {(sys.kind === 'line' || sys.kind === 'two-line') && sys.line && (
        <div className="diagData">
          Recta: P = {fmtVec(sys.line.q)} + t·{fmtVec(displayDir(sys.line.dir))}
        </div>
      )}
      {detInfo && (
        <div className="detLine">
          det(A) = {fmt(detInfo.det)} {detInfo.singular
            ? '→ matriz singular: no hay solución única'
            : '→ ≠ 0: solución única garantizada'}
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  Panel: tarjeta de plano                                            */
/* ================================================================== */

function PlaneCard({ planeState, status, plane, onChange, onRemove }) {
  const color = COLORS[planeState.slot]
  const reduced = plane ? reduceEq(plane.n, plane.d) : null
  return (
    <div className="card" style={{ borderColor: color + '55' }}>
      <div className="cardHead">
        <span className="dot" style={{ background: color }} />
        <span className="planeName">Plano {planeState.slot + 1}</span>
        {reduced && <span className="eqInline">{eqString(reduced.n, reduced.d)}</span>}
        <button className="delBtn" title="Eliminar plano" onClick={onRemove}>✕</button>
      </div>

      <div className="axisHeads"><span>·</span><span>x</span><span>y</span><span>z</span></div>
      {planeState.pts.map((row, i) => (
        <div className="ptRow" key={i}>
          <span className="ptLabel" style={{ background: color }}>{PT_LABELS[i]}</span>
          {row.map((val, j) => (
            <input
              key={j}
              className="coordInput"
              type="number"
              step="0.5"
              placeholder="0"
              value={val}
              onChange={(e) => onChange(i, j, e.target.value)}
            />
          ))}
        </div>
      ))}

      {status === 'incomplete' && (
        <p className="hint">Ingresá las 9 coordenadas (3 puntos) para definir el plano.</p>
      )}
      {status === 'collinear' && (
        <p className="warn">
          ⚠ Los 3 puntos están alineados (colineales): infinitos planos pasan por ellos, ninguno queda
          definido. Mové alguno para que formen un triángulo.
        </p>
      )}
      {plane && (
        <p className="normalInfo">normal n = {fmtVec(reduced.n)}</p>
      )}

      <div className="checks">
        <label className="check">
          <input
            type="checkbox"
            style={{ accentColor: color }}
            checked={planeState.showPlane}
            onChange={(e) => onChange('showPlane', null, e.target.checked)}
          />
          Mostrar plano
        </label>
        <label className="check">
          <input
            type="checkbox"
            style={{ accentColor: color }}
            checked={planeState.showPoints}
            onChange={(e) => onChange('showPoints', null, e.target.checked)}
          />
          Mostrar puntos
        </label>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  App                                                                */
/* ================================================================== */

export default function App() {
  const [planes, setPlanes] = useState([newPlane(0)])
  const [selected, setSelected] = useState(null) // {slot, idx}

  const [showGrid, setShowGrid] = useState(true)
  const [showAxes, setShowAxes] = useState(true)
  const [autoRotate, setAutoRotate] = useState(false)
  const [opacity, setOpacity] = useState(0.42)

  const [showSolPoint, setShowSolPoint] = useState(true)
  const [showSolLine, setShowSolLine] = useState(true)
  const [showPairLines, setShowPairLines] = useState(true)
  const [showPairLinesUnique, setShowPairLinesUnique] = useState(false)

  const [viewReq, setViewReq] = useState(null)
  const [activeView, setActiveView] = useState('iso')

  /* derivados */
  const derived = useMemo(() => planes.map((p) => {
    const nums = p.pts.map((r) => r.map(parseCoord))
    const complete = nums.every((r) => r.every(Number.isFinite))
    const plane = complete ? planeFromPoints(nums) : null
    const status = !complete ? 'incomplete' : !plane ? 'collinear' : 'ok'
    return { state: p, nums, plane, status }
  }), [planes])

  const activeItems = useMemo(
    () => derived
      .filter((d) => d.status === 'ok' && d.state.showPlane)
      .map((d) => ({ slot: d.state.slot, plane: d.plane })),
    [derived]
  )

  const sys = useMemo(() => classify(activeItems), [activeItems])

  /* handlers */
  const updatePlane = (slot) => (i, j, value) => {
    setPlanes((ps) => ps.map((p) => {
      if (p.slot !== slot) return p
      if (i === 'showPlane') return { ...p, showPlane: value }
      if (i === 'showPoints') return { ...p, showPoints: value }
      const pts = p.pts.map((r) => [...r])
      pts[i][j] = value
      return { ...p, pts }
    }))
  }

  const movePoint = (slot, idx, xyz) => {
    setPlanes((ps) => ps.map((p) => {
      if (p.slot !== slot) return p
      const pts = p.pts.map((r) => [...r])
      pts[idx] = xyz.map((v) => fmt(v))
      return { ...p, pts }
    }))
  }

  const addPlane = () => {
    setPlanes((ps) => {
      if (ps.length >= 3) return ps
      const used = new Set(ps.map((p) => p.slot))
      const slot = [0, 1, 2].find((s) => !used.has(s))
      return [...ps, newPlane(slot)].sort((a, b) => a.slot - b.slot)
    })
  }

  const removePlane = (slot) => {
    setPlanes((ps) => ps.filter((p) => p.slot !== slot))
    setSelected((s) => (s && s.slot === slot ? null : s))
  }

  const loadPreset = (id) => {
    const preset = PRESETS.find((p) => p.id === id)
    if (!preset) return
    setSelected(null)
    setPlanes(preset.pts.map((pts, i) => ({
      slot: i,
      showPlane: true,
      showPoints: true,
      pts: pts.map((row) => row.map(String)),
    })))
  }

  const goView = (key) => {
    setActiveView(key)
    setViewReq({ ...VIEWS[key], t: Date.now() })
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* qué se dibuja según el caso */
  const drawSolPoint = sys.kind === 'unique' && showSolPoint
  const drawSolLine = sys.kind === 'line' && showSolLine && sys.line
  const drawTwoLine = sys.kind === 'two-line' && showPairLines && sys.line
  const drawPairLines =
    (sys.kind === 'incompatible' && showPairLines && sys.pairLines?.length > 0) ||
    (sys.kind === 'unique' && showPairLinesUnique)

  const status = diagnosisContent(sys, activeItems)
  const chipColor = { ok: '#22c55e', info: '#3b82f6', bad: '#ef4444' }[status.badge?.[0]] ?? '#64748b'

  return (
    <div className="app">
      {/* ------------ escena 3D ------------ */}
      <div className="viewport">
        <div className="statusChip">
          <span className="dotSm" style={{ background: chipColor }} />
          <span>{status.msg}</span>
        </div>

        {selected && (
          <div className="statusChip" style={{ top: 56 }}>
            <span className="dotSm" style={{ background: COLORS[selected.slot] }} />
            <span>
              Editando P{selected.slot + 1}·{PT_LABELS[selected.idx]} — arrastrá las flechas · Esc suelta
            </span>
          </div>
        )}
        <div className="overlayViews">
          {Object.entries(VIEWS).map(([key, v]) => (
            <button
              key={key}
              className={`viewBtn ${activeView === key ? 'active' : ''}`}
              onClick={() => goView(key)}
              title={key === 'iso' ? 'Vista isométrica libre' : `Mirar el plano ${v.label}`}
            >
              {v.label}
            </button>
          ))}
          <button
            className={`viewBtn ${autoRotate ? 'active' : ''}`}
            onClick={() => setAutoRotate((v) => !v)}
            title="Rotación automática"
          >
            ⟳
          </button>
        </div>

        <Canvas
          dpr={[1, 2]}
          camera={{ position: VIEWS.iso.pos, up: VIEWS.iso.up, fov: 45, near: 0.1, far: 500 }}
          onPointerMissed={() => setSelected(null)}
        >
          <color attach="background" args={['#0b1120']} />
          <ambientLight intensity={0.85} />
          <directionalLight position={[12, -14, 20]} intensity={0.9} />
          <directionalLight position={[-10, 12, -8]} intensity={0.35} />

          <AxesAndGrid showGrid={showGrid} showAxes={showAxes} />

          {derived.map((d) => (
            <group key={d.state.slot}>
              {d.status === 'ok' && d.state.showPlane && (
                <PlaneSurface
                  plane={d.plane}
                  color={COLORS[d.state.slot]}
                  opacity={opacity}
                  label={`P${d.state.slot + 1}`}
                />
              )}
              {d.state.showPoints && (
                <PlanePoints
                  planeState={d.state}
                  color={COLORS[d.state.slot]}
                  selected={selected}
                  onSelect={setSelected}
                  onMove={movePoint}
                />
              )}
            </group>
          ))}

          {drawTwoLine && (
            <InterLine line={sys.line} color="#a855f7" lineWidth={3}
              label={`P${sys.slots[0] + 1} ∩ P${sys.slots[1] + 1}`} />
          )}
          {drawSolLine && (
            <InterLine line={sys.line} color="#ef4444" lineWidth={4} label="recta solución" />
          )}
          {drawPairLines && sys.pairLines?.map((pl, i) => (
            <InterLine
              key={i}
              line={pl.line}
              color="#9ca3af"
              lineWidth={1.6}
              dashed
              label={`P${pl.slots[0] + 1} ∩ P${pl.slots[1] + 1}`}
            />
          ))}
          {drawSolPoint && <SolutionPoint point={sys.point} />}

          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            autoRotate={autoRotate}
            autoRotateSpeed={1.1}
            minDistance={4}
            maxDistance={100}
          />
          <CameraRig viewReq={viewReq} />
        </Canvas>
      </div>

      {/* ------------ panel lateral ------------ */}
      <div className="panel">
        <div className="panelHeader">
          <h1>Sistemas de ecuaciones 3×3</h1>
          <p>
            Cada ecuación lineal en x, y, z es un plano. Resolver el sistema es encontrar los
            puntos comunes a los tres planos.
          </p>
        </div>

        <div className="card">
          <h2>Ejemplos para explorar</h2>
          <select className="select" value="" onChange={(e) => loadPreset(e.target.value)}>
            <option value="" disabled>Cargar un ejemplo…</option>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        <DiagnosticCard sys={sys} activeItems={activeItems} />

        {planes.map((p) => {
          const d = derived.find((x) => x.state.slot === p.slot)
          return (
            <PlaneCard
              key={p.slot}
              planeState={p}
              status={d.status}
              plane={d.plane}
              onChange={updatePlane(p.slot)}
              onRemove={() => removePlane(p.slot)}
            />
          )
        })}

        <button className="addBtn" onClick={addPlane} disabled={planes.length >= 3}>
          + Agregar plano {planes.length < 3 ? `(${COLOR_NAMES[[0, 1, 2].find((s) => !planes.some((p) => p.slot === s))]})` : ''}
        </button>

        <div className="card">
          <h2>Visualización</h2>
          <div className="checks">
            {sys.kind === 'unique' && (
              <>
                <label className="check stack">
                  <input type="checkbox" checked={showSolPoint}
                    onChange={(e) => setShowSolPoint(e.target.checked)} style={{ accentColor: '#ef4444' }} />
                  Punto de solución (esfera roja)
                </label>
                <label className="check stack">
                  <input type="checkbox" checked={showPairLinesUnique}
                    onChange={(e) => setShowPairLinesUnique(e.target.checked)} style={{ accentColor: '#9ca3af' }} />
                  <span>Rectas de corte por pares&nbsp;<small>(las 3 pasan por la solución)</small></span>
                </label>
              </>
            )}
            {sys.kind === 'line' && (
              <label className="check stack">
                <input type="checkbox" checked={showSolLine}
                  onChange={(e) => setShowSolLine(e.target.checked)} style={{ accentColor: '#ef4444' }} />
                Recta de soluciones (roja)
              </label>
            )}
            {(sys.kind === 'incompatible' || sys.kind === 'two-line') && (
              <label className="check stack">
                <input type="checkbox" checked={showPairLines}
                  onChange={(e) => setShowPairLines(e.target.checked)} style={{ accentColor: '#9ca3af' }} />
                Rectas de intersección {sys.kind === 'two-line' ? '' : 'por pares'}
              </label>
            )}
            <label className="check stack">
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
              Grilla en el plano XY
            </label>
            <label className="check stack">
              <input type="checkbox" checked={showAxes} onChange={(e) => setShowAxes(e.target.checked)} />
              Ejes y escala numérica
            </label>
          </div>
          <div className="sliderRow">
            <span>Opacidad</span>
            <input
              type="range" min="0.12" max="0.8" step="0.02"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="card legend">
          <details>
            <summary>Cómo usar la herramienta</summary>
            <ul>
              <li><b>Rotar:</b> click y arrastrar · <b>Zoom:</b> rueda · <b>Pan:</b> click derecho.</li>
              <li>Hacé <b>click en un punto</b> (esfera) para agarrarlo y arrastrarlo con las flechas 3D; los planos se recalculan en vivo. <span className="kbd">Esc</span> lo suelta.</li>
              <li>Cada plano necesita 3 puntos <b>no alineados</b>: dos puntos definen una recta, el tercero “levanta” el plano.</li>
              <li>Probá mover un solo punto de un ejemplo y mirá cómo cambia el diagnóstico: es la mejor forma de entender cada caso.</li>
              <li>Las vistas <b>XY / XZ / YZ</b> sirven para verificar paralelismos: dos planos paralelos se ven como dos rectas paralelas de canto.</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  )
}
