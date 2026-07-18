import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'
import * as THREE from 'three'

/* ================================================================== */
/*  Linear algebra (vectors as [a, b, c] arrays)                       */
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

/** Plane from equation k1·a + k2·b + k3·c = d → { n, d, u, du, anchor } or null. */
function planeFromCoeffs(k1, k2, k3, d) {
  const n = [k1, k2, k3]
  const len = norm(n)
  if (len < 1e-12) return null
  const u = scl(n, 1 / len)
  const du = d / len
  return { n, d, u, du, anchor: scl(u, du) }
}

/** Relationship between 2 planes: crossing line, parallel, or coincident. */
function pairRelation(p1, p2) {
  const c = cross(p1.u, p2.u)
  const L = norm(c)
  if (L < 1e-6) {
    const s = dot(p1.u, p2.u) > 0 ? 1 : -1
    const coincident = Math.abs(p2.du - s * p1.du) < 1e-6 * (1 + Math.abs(p1.du))
    return { type: coincident ? 'coincident' : 'parallel' }
  }
  const dir = scl(c, 1 / L)
  // point on the line: ((d1·n2 − d2·n1) × (n1×n2)) / |n1×n2|²
  let q = scl(cross(sub(scl(p2.u, p1.du), scl(p1.u, p2.du)), c), 1 / (L * L))
  q = sub(q, scl(dir, dot(q, dir))) // closest point of the line to the origin
  return { type: 'line', line: { q, dir } }
}

/** Classify the system formed by the active planes. items: [{slot, plane}] */
function classify(items) {
  const m = items.length
  if (m === 0) return { kind: 'empty' }
  if (m === 1) return { kind: 'one', plane: items[0].plane }

  if (m === 2) {
    const rel = pairRelation(items[0].plane, items[1].plane)
    const slots = [items[0].slot, items[1].slot]
    if (rel.type === 'line') return { kind: 'two-line', line: rel.line, slots }
    if (rel.type === 'coincident') return { kind: 'two-coincident', plane: items[0].plane, slots }
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
    if (coinc === 3) return { kind: 'plane', plane: items[0].plane }
    if (coinc >= 1) return { kind: 'incompatible', subtype: 'coincident-parallel', pairLines: [] }
    return { kind: 'incompatible', subtype: 'all-parallel', pairLines: [] }
  }

  // rank 2: does the line of one pair also lie on the third plane?
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

/* ---------- number, equation and parametric formatting ---------- */

const VARS = ['a', 'b', 'c']

function fmt(v, dec = 2) {
  if (!Number.isFinite(v)) return '–'
  const r = Math.round(v * 10 ** dec) / 10 ** dec
  return String(Object.is(r, -0) ? 0 : r)
}

function eqString(n, d) {
  const terms = []
  n.forEach((k, i) => {
    if (Math.abs(k) < 1e-10) return
    const mag = Math.abs(k)
    const coef = Math.abs(mag - 1) < 1e-10 ? '' : fmt(mag)
    terms.push({ neg: k < 0, text: coef + VARS[i] })
  })
  if (!terms.length) return '0 = ' + fmt(d)
  let s = (terms[0].neg ? '−' : '') + terms[0].text
  for (let i = 1; i < terms.length; i++) s += (terms[i].neg ? ' − ' : ' + ') + terms[i].text
  return s + ' = ' + fmt(d)
}

const fmtVec = (v) => `(${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])})`

/** Linear expression "c0 + k1·name1 + k2·name2" with tidy signs and 1s. */
function linExpr(c0, terms) {
  const parts = []
  if (Math.abs(c0) > 1e-9) parts.push(fmt(c0))
  terms.forEach(({ k, name }) => {
    if (Math.abs(k) < 1e-9) return
    const mag = Math.abs(Math.abs(k) - 1) < 1e-9 ? '' : fmt(Math.abs(k))
    if (!parts.length) parts.push((k < 0 ? '−' : '') + mag + name)
    else parts.push((k < 0 ? '− ' : '+ ') + mag + name)
  })
  if (!parts.length) return '0'
  return parts.join(' ')
}

/** Parametric description of a line, using a coordinate as the free variable. */
function paramLine(line) {
  const { q, dir } = line
  const mx = Math.max(...dir.map((v) => Math.abs(v)))
  let j = 0
  dir.forEach((v, i) => { if (Math.abs(v) >= 0.5 * mx) j = i }) // prefer the latest significant coordinate
  const exprs = [0, 1, 2].map((i) => {
    if (i === j) return VARS[j]
    const k = dir[i] / dir[j]
    return linExpr(q[i] - q[j] * k, [{ k, name: VARS[j] }])
  })
  return `(${exprs.join(', ')})`
}

/** Parametric description of a whole plane, solving for its first pivot variable. */
function paramPlane(plane) {
  const { n, d } = plane
  const i0 = [0, 1, 2].find((i) => Math.abs(n[i]) > 1e-9)
  if (i0 === undefined) return null
  const exprs = [0, 1, 2].map((i) => {
    if (i !== i0) return VARS[i]
    const terms = [0, 1, 2]
      .filter((k) => k !== i0)
      .map((k) => ({ k: -n[k] / n[i0], name: VARS[k] }))
    return linExpr(d / n[i0], terms)
  })
  return `(${exprs.join(', ')})`
}

/* ================================================================== */
/*  Tool constants                                                     */
/* ================================================================== */

const COLORS = ['#3b82f6', '#f97316', '#22c55e']
const COLOR_NAMES = ['blue', 'orange', 'green']
const PLANE_HALF = 13
const LINE_HALF = 22
const WORLD = 15

const VIEWS = {
  home: { pos: [19.5, -19.5, 14.5], up: [0, 0, 1], target: [0, 0, 0], label: 'Home' },
  ab: { pos: [0, 0, 30], up: [0, 1, 0], target: [0, 0, 0], label: 'a | b' },
  bc: { pos: [30, 0, 0], up: [0, 0, 1], target: [0, 0, 0], label: 'b | c' },
  ac: { pos: [0, -30, 0], up: [0, 0, 1], target: [0, 0, 0], label: 'a | c' },
}

const PRESETS = [
  {
    id: 's1', label: 'System 1 — unique solution (a point)',
    coefs: [[1, 1, 1, 10], [1, 2, 1, 15], [1, 1, 2, 12]],
  },
  {
    id: 's2', label: 'System 2 — infinite solutions (a line)',
    coefs: [[1, 1, 1, 10], [1, 1, 2, 15], [1, 1, 3, 20]],
  },
  {
    id: 's3', label: 'System 3 — no solutions (prism)',
    coefs: [[1, 1, 1, 10], [1, 1, 2, 17], [1, 1, 3, 18]],
  },
  {
    id: 's4', label: 'System 4 — infinite solutions (a plane)',
    coefs: [[1, 1, 1, 10], [2, 2, 2, 20], [3, 3, 3, 30]],
  },
  {
    id: 's5', label: 'System 5 — no solutions (three parallel planes)',
    coefs: [[0, 0, 1, -5], [0, 0, 1, 0], [0, 0, 1, 5]],
  },
  {
    id: 's6', label: 'System 6 — no solutions (two parallels, one crossing)',
    coefs: [[0, 0, 1, -3], [0, 0, 1, 3], [1, 0, 1, 2]],
  },
]

const planeFromPreset = (coefs, i) => ({
  slot: i,
  show: true,
  coef: coefs.map(String),
})
const newPlane = (slot) => ({ slot, show: true, coef: ['', '', '', ''] })

function parseToken(s) {
  const t = String(s).trim()
  if (t === '') return 0
  if (t === '-' || t === '+') return NaN
  return Number(t.replace(',', '.'))
}

/* ================================================================== */
/*  3D components                                                      */
/* ================================================================== */

const noRaycast = () => null

function AxesAndGrid({ showGrid, showAxes }) {
  const axes = [
    { dir: [1, 0, 0], label: 'a', labelPos: [WORLD + 1.8, 0, 0], coneRot: [0, 0, -Math.PI / 2] },
    { dir: [0, 1, 0], label: 'b', labelPos: [0, WORLD + 1.8, 0], coneRot: [0, 0, 0] },
    { dir: [0, 0, 1], label: 'c', labelPos: [0, 0, WORLD + 1.8], coneRot: [Math.PI / 2, 0, 0] },
  ]
  const axisColor = '#64748b'
  const ticks = [-10, -5, 5, 10]
  return (
    <group>
      {showGrid && (
        <gridHelper
          args={[2 * WORLD, 2 * WORLD, '#c3cedd', '#e4e9f2']}
          rotation={[Math.PI / 2, 0, 0]}
          raycast={noRaycast}
        />
      )}
      {showAxes && axes.map((ax) => (
        <group key={ax.label}>
          <Line
            points={[scl(ax.dir, -WORLD - 1), scl(ax.dir, WORLD + 1)]}
            color={axisColor}
            lineWidth={1.6}
            transparent
            opacity={0.75}
            raycast={noRaycast}
          />
          <mesh position={scl(ax.dir, WORLD + 1)} rotation={ax.coneRot} raycast={noRaycast}>
            <coneGeometry args={[0.28, 0.9, 12]} />
            <meshBasicMaterial color={axisColor} />
          </mesh>
          <Html position={ax.labelPos} center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
            <div className="axisChip">{ax.label}</div>
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
      <Line points={border} color={color} lineWidth={1.2} transparent opacity={0.55} raycast={noRaycast} />
      <Html position={labelPos} center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
        <div className="tag3d" style={{ background: color }}>{label}</div>
      </Html>
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
        <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.3} />
      </mesh>
      <Html position={point} center zIndexRange={[45, 0]} style={{ pointerEvents: 'none' }}>
        <div className="coordTag">{fmtVec(point)}</div>
      </Html>
    </group>
  )
}

/** Animates the camera toward requested views. Cancels if the user orbits. */
function CameraRig({ viewReq }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const target = useRef(null)

  useEffect(() => {
    if (!viewReq) return
    camera.up.set(...viewReq.up)
    target.current = {
      pos: new THREE.Vector3(...viewReq.pos),
      look: new THREE.Vector3(...viewReq.target),
    }
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
    camera.position.lerp(target.current.pos, k)
    controls.target.lerp(target.current.look, k)
    controls.update()
    if (camera.position.distanceTo(target.current.pos) < 0.03) target.current = null
  })
  return null
}

/* ================================================================== */
/*  Panel: diagnosis                                                   */
/* ================================================================== */

function diagnosisContent(sys) {
  switch (sys.kind) {
    case 'empty':
      return {
        badge: null,
        msg: 'No active planes',
        explain: 'Enter coefficients and check "Show plane", or pick a system above to get started.',
        solution: null,
      }
    case 'one':
      return {
        badge: ['info', 'Infinite solutions'],
        msg: 'One plane active',
        explain: 'A single equation in three unknowns has infinitely many solutions: every point on the plane satisfies it. Add more planes to constrain the solution set.',
        solution: { kind: 'plane', text: `plane ${paramPlane(sys.plane)}` },
      }
    case 'two-line':
      return {
        badge: ['info', 'Infinite solutions'],
        msg: 'Two planes meeting in a line',
        explain: 'With two equations and three unknowns the system is consistent but underdetermined: the solutions are all the points on the purple line. A third plane can reduce this to a single point, keep the whole line, or leave no solution at all.',
        solution: { kind: 'line', text: `line ${paramLine(sys.line)}` },
      }
    case 'two-parallel':
      return {
        badge: ['bad', 'No solution'],
        msg: 'Parallel planes — no intersection',
        explain: 'The two planes share the same normal direction but sit at different offsets, so they never meet. The system is inconsistent.',
        solution: { kind: 'none', text: 'no solutions' },
      }
    case 'two-coincident':
      return {
        badge: ['info', 'Infinite solutions'],
        msg: 'Two coincident planes',
        explain: 'The two equations are equivalent (one is a multiple of the other), so they describe the same plane. Every point of that plane is a solution.',
        solution: { kind: 'plane', text: `plane ${paramPlane(sys.plane)}` },
      }
    case 'unique':
      return {
        badge: ['ok', 'Unique solution'],
        msg: 'The three planes meet at one point',
        explain: 'There is exactly one (a, b, c) that satisfies all three equations at once — a consistent, independent system (det(A) ≠ 0).',
        solution: { kind: 'point', text: `point ${fmtVec(sys.point)}` },
      }
    case 'line':
      return {
        badge: ['info', 'Infinite solutions'],
        msg: 'The three planes share a common line',
        explain: (sys.hasCoincidentPair
          ? 'Two of the planes coincide and the third cuts through them: '
          : 'The three planes share one line, like pages of a book sharing the spine: ')
          + 'every point on the red line satisfies all three equations.',
        solution: { kind: 'line', text: `line ${paramLine(sys.line)}` },
      }
    case 'plane':
      return {
        badge: ['info', 'Infinite solutions'],
        msg: 'The three planes coincide',
        explain: 'All three equations are equivalent — it is the same plane three times, so the whole plane is the solution set.',
        solution: { kind: 'plane', text: `plane ${paramPlane(sys.plane)}` },
      }
    case 'incompatible': {
      const why = {
        'all-parallel': 'All three planes are parallel at different offsets — they never touch.',
        'coincident-parallel': 'Two planes coincide, but the third is parallel to them and never meets them.',
        'two-parallel-cut': 'Two planes are parallel and the third crosses both, producing two parallel intersection lines that never meet.',
        'prism': 'Each pair of planes meets in a line, but the three lines are parallel to each other — the planes form a triangular prism with no common point.',
      }[sys.subtype]
      return {
        badge: ['bad', 'No solution'],
        msg: 'Inconsistent system',
        explain: why + ' No single (a, b, c) satisfies all three equations.',
        solution: { kind: 'none', text: 'no solutions' },
      }
    }
    default:
      return { badge: null, msg: '', explain: '', solution: null }
  }
}

function DiagnosticCard({ sys, activeItems }) {
  const { badge, msg, explain, solution } = diagnosisContent(sys)

  let detInfo = null
  if (activeItems.length === 3) {
    const [a, b, c] = activeItems.map((it) => it.plane.n)
    const det = dot(a, cross(b, c))
    detInfo = { det, singular: Math.abs(det) < 1e-9 }
  }

  return (
    <div className="card">
      <h2>System diagnosis</h2>
      {activeItems.length > 0 && (
        <div className="eqSystem">
          <span className="brace">{'{'}</span>
          <div className="eqList">
            {activeItems.map((it) => (
              <div className="eqItem" key={it.slot} style={{ color: COLORS[it.slot] }}>
                {eqString(it.plane.n, it.plane.d)}
              </div>
            ))}
          </div>
        </div>
      )}
      {badge && <span className={`badge ${badge[0]}`}>{badge[1]}</span>}
      <p className="diagMsg">{msg}</p>
      {solution && (
        <div className="solutionRow">
          <span className="solLabel">Solution:</span>
          <span className={`solValue ${solution.kind === 'none' ? 'noSol' : ''}`}>
            {solution.text}
          </span>
        </div>
      )}
      <p className="diagExplain">{explain}</p>
      {detInfo && (
        <div className="detLine">
          det(A) = {fmt(detInfo.det)} — {detInfo.singular
            ? 'singular matrix: no unique solution'
            : 'nonzero, so a unique solution exists'}
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  Panel: plane card                                                  */
/* ================================================================== */

function PlaneCard({ planeState, status, plane, onChange, onToggle, onView, onRemove }) {
  const color = COLORS[planeState.slot]
  return (
    <div className="card planeCard" style={{ borderColor: color + '55' }}>
      <div className="cardHead">
        <span className="dot" style={{ background: color }} />
        <span className="planeName">Plane {planeState.slot + 1}</span>
        {plane && <span className="eqInline">{eqString(plane.n, plane.d)}</span>}
        <button className="delBtn" title="Remove this plane" onClick={onRemove}>✕</button>
      </div>

      <div className="eqRow">
        {[0, 1, 2].map((j) => (
          <React.Fragment key={j}>
            <input
              className="coefInput"
              type="number"
              step="1"
              placeholder="0"
              value={planeState.coef[j]}
              onChange={(e) => onChange(j, e.target.value)}
              aria-label={`coefficient of ${VARS[j]}`}
            />
            <span className="eqLit">{VARS[j]}&nbsp;{j < 2 ? '+' : '='}</span>
          </React.Fragment>
        ))}
        <input
          className="coefInput"
          type="number"
          step="1"
          placeholder="0"
          value={planeState.coef[3]}
          onChange={(e) => onChange(3, e.target.value)}
          aria-label="constant term"
        />
      </div>

      {status === 'blank' && (
        <p className="hint">Type the four numbers of the equation to create this plane.</p>
      )}
      {status === 'invalid' && (
        <p className="warn">Some values are not valid numbers — check the inputs above.</p>
      )}
      {status === 'degenerate' && (
        <p className="warn">
          The a, b and c coefficients are all 0, so this is not a plane. Set at least one of them.
        </p>
      )}
      {plane && (
        <p className="normalInfo">normal vector n = {fmtVec(plane.n)}</p>
      )}

      <div className="cardActions">
        <label className="check">
          <input
            type="checkbox"
            style={{ accentColor: color }}
            checked={planeState.show}
            onChange={(e) => onToggle(e.target.checked)}
          />
          Show plane
        </label>
        <button
          className="viewBtnSm"
          disabled={!plane}
          onClick={onView}
          title="Move the camera to look at this plane face-on"
        >
          View
        </button>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  App                                                                */
/* ================================================================== */

export default function App() {
  const [planes, setPlanes] = useState(() => PRESETS[0].coefs.map(planeFromPreset))

  const [showGrid, setShowGrid] = useState(true)
  const [showAxes, setShowAxes] = useState(true)
  const [autoRotate, setAutoRotate] = useState(false)
  const [opacity, setOpacity] = useState(0.45)

  const [showSolPoint, setShowSolPoint] = useState(true)
  const [showSolLine, setShowSolLine] = useState(true)
  const [showPairLines, setShowPairLines] = useState(true)
  const [showPairLinesUnique, setShowPairLinesUnique] = useState(false)

  const [viewReq, setViewReq] = useState(null)
  const [activeView, setActiveView] = useState('home')

  /* derived */
  const derived = useMemo(() => planes.map((p) => {
    const blank = p.coef.every((s) => String(s).trim() === '')
    const nums = p.coef.map(parseToken)
    const invalid = nums.some((v) => !Number.isFinite(v))
    const plane = blank || invalid ? null : planeFromCoeffs(nums[0], nums[1], nums[2], nums[3])
    const status = blank ? 'blank' : invalid ? 'invalid' : !plane ? 'degenerate' : 'ok'
    return { state: p, plane, status }
  }), [planes])

  const activeItems = useMemo(
    () => derived
      .filter((d) => d.status === 'ok' && d.state.show)
      .map((d) => ({ slot: d.state.slot, plane: d.plane })),
    [derived]
  )

  const sys = useMemo(() => classify(activeItems), [activeItems])

  /* handlers */
  const setCoef = (slot) => (j, value) => {
    setPlanes((ps) => ps.map((p) => {
      if (p.slot !== slot) return p
      const coef = [...p.coef]
      coef[j] = value
      return { ...p, coef }
    }))
  }

  const toggleShow = (slot) => (value) => {
    setPlanes((ps) => ps.map((p) => (p.slot === slot ? { ...p, show: value } : p)))
  }

  const addPlane = () => {
    setPlanes((ps) => {
      if (ps.length >= 3) return ps
      const used = new Set(ps.map((p) => p.slot))
      const slot = [0, 1, 2].find((s) => !used.has(s))
      return [...ps, newPlane(slot)].sort((a, b) => a.slot - b.slot)
    })
  }

  const removePlane = (slot) => setPlanes((ps) => ps.filter((p) => p.slot !== slot))

  const loadPreset = (id) => {
    const preset = PRESETS.find((p) => p.id === id)
    if (preset) setPlanes(preset.coefs.map(planeFromPreset))
  }

  const goView = (key) => {
    setActiveView(key)
    setViewReq({ ...VIEWS[key], t: Date.now() })
  }

  const goPlaneView = (plane) => {
    const [, b2] = planeBasis(plane.u)
    setActiveView(null)
    setViewReq({
      pos: add(plane.anchor, scl(plane.u, 30)),
      up: b2,
      target: plane.anchor,
      t: Date.now(),
    })
  }

  /* what gets drawn for the current case */
  const drawSolPoint = sys.kind === 'unique' && showSolPoint
  const drawSolLine = sys.kind === 'line' && showSolLine && sys.line
  const drawTwoLine = sys.kind === 'two-line' && showPairLines && sys.line
  const drawPairLines =
    (sys.kind === 'incompatible' && showPairLines && sys.pairLines?.length > 0) ||
    (sys.kind === 'unique' && showPairLinesUnique)

  const status = diagnosisContent(sys)
  const chipColor = { ok: '#16a34a', info: '#2563eb', bad: '#dc2626' }[status.badge?.[0]] ?? '#94a3b8'
  const nextSlot = [0, 1, 2].find((s) => !planes.some((p) => p.slot === s))

  return (
    <div className="app">
      {/* ------------ 3D scene ------------ */}
      <div className="viewport">
        <div className="statusChip">
          <span className="dotSm" style={{ background: chipColor }} />
          <span>{status.solution ? status.solution.text : status.msg}</span>
        </div>

        <div className="overlayViews">
          <button
            className={`viewBtn ${autoRotate ? 'active' : ''}`}
            onClick={() => setAutoRotate((v) => !v)}
            title="Auto-rotate the camera"
          >
            ⟳
          </button>
          <span className="vSep" />
          {['ab', 'bc', 'ac'].map((key) => (
            <button
              key={key}
              className={`viewBtn ${activeView === key ? 'active' : ''}`}
              onClick={() => goView(key)}
              title={`Look straight at the ${VIEWS[key].label.replace(' | ', '–')} plane`}
            >
              {VIEWS[key].label}
            </button>
          ))}
          <span className="vSep" />
          <button
            className={`viewBtn ${activeView === 'home' ? 'active' : ''}`}
            onClick={() => goView('home')}
            title="Back to the default 3D view"
          >
            ⌂ View
          </button>
        </div>

        <Canvas
          dpr={[1, 2]}
          camera={{ position: VIEWS.home.pos, up: VIEWS.home.up, fov: 45, near: 0.1, far: 500 }}
        >
          <color attach="background" args={['#ffffff']} />
          <ambientLight intensity={1.1} />
          <directionalLight position={[12, -14, 20]} intensity={0.5} />
          <directionalLight position={[-10, 12, -8]} intensity={0.22} />

          <AxesAndGrid showGrid={showGrid} showAxes={showAxes} />

          {derived.map((d) => (
            d.status === 'ok' && d.state.show ? (
              <PlaneSurface
                key={d.state.slot}
                plane={d.plane}
                color={COLORS[d.state.slot]}
                opacity={opacity}
                label={`P${d.state.slot + 1}`}
              />
            ) : null
          ))}

          {drawTwoLine && (
            <InterLine line={sys.line} color="#7c3aed" lineWidth={3}
              label={`P${sys.slots[0] + 1} ∩ P${sys.slots[1] + 1}`} />
          )}
          {drawSolLine && (
            <InterLine line={sys.line} color="#dc2626" lineWidth={4} label="solution line" />
          )}
          {drawPairLines && sys.pairLines?.map((pl, i) => (
            <InterLine
              key={i}
              line={pl.line}
              color="#64748b"
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

      {/* ------------ side panel ------------ */}
      <div className="panel">
        <div className="panelHeader">
          <h1>3×3 Systems of Equations</h1>
          <p>
            Each linear equation in a, b and c is a plane in space. Solving the system means
            finding the points that all planes share.
          </p>
        </div>

        <div className="card">
          <h2>Choose a system of equations</h2>
          <select className="select" value="" onChange={(e) => loadPreset(e.target.value)}>
            <option value="" disabled>Load an example…</option>
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
              onChange={setCoef(p.slot)}
              onToggle={toggleShow(p.slot)}
              onView={() => d.plane && goPlaneView(d.plane)}
              onRemove={() => removePlane(p.slot)}
            />
          )
        })}

        {planes.length < 3 && (
          <button className="addBtn" onClick={addPlane}>
            + Add plane ({COLOR_NAMES[nextSlot]})
          </button>
        )}

        <div className="card">
          <h2>Display options</h2>
          <div className="checks">
            {sys.kind === 'unique' && (
              <>
                <label className="check stack">
                  <input type="checkbox" checked={showSolPoint}
                    onChange={(e) => setShowSolPoint(e.target.checked)} style={{ accentColor: '#dc2626' }} />
                  Solution point (red)
                </label>
                <label className="check stack">
                  <input type="checkbox" checked={showPairLinesUnique}
                    onChange={(e) => setShowPairLinesUnique(e.target.checked)} style={{ accentColor: '#64748b' }} />
                  <span>Pairwise intersection lines&nbsp;<small>(all three pass through the solution)</small></span>
                </label>
              </>
            )}
            {sys.kind === 'line' && (
              <label className="check stack">
                <input type="checkbox" checked={showSolLine}
                  onChange={(e) => setShowSolLine(e.target.checked)} style={{ accentColor: '#dc2626' }} />
                Solution line (red)
              </label>
            )}
            {(sys.kind === 'incompatible' || sys.kind === 'two-line') && (
              <label className="check stack">
                <input type="checkbox" checked={showPairLines}
                  onChange={(e) => setShowPairLines(e.target.checked)} style={{ accentColor: '#64748b' }} />
                {sys.kind === 'two-line' ? 'Intersection line' : 'Pairwise intersection lines'}
              </label>
            )}
            <label className="check stack">
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
              Grid (a–b plane)
            </label>
            <label className="check stack">
              <input type="checkbox" checked={showAxes} onChange={(e) => setShowAxes(e.target.checked)} />
              Axes and scale
            </label>
          </div>
          <div className="sliderRow">
            <span>Plane opacity</span>
            <input
              type="range" min="0.15" max="0.8" step="0.02"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="card legend">
          <details>
            <summary>How to use</summary>
            <ul>
              <li><b>Rotate:</b> drag &nbsp;·&nbsp; <b>Zoom:</b> scroll &nbsp;·&nbsp; <b>Pan:</b> right-drag.</li>
              <li>Each equation (like <span className="mono">a + b + c = 10</span>) is one plane. Edit the four numbers and everything updates live.</li>
              <li>The three coefficients form the plane&rsquo;s <b>normal vector</b> — they set its tilt. The right-hand side slides the plane along that normal.</li>
              <li>Press <b>View</b> on a plane card to face that plane head-on, or use <b>a|b, b|c, a|c</b> to spot parallel planes: seen edge-on, they become parallel lines.</li>
              <li>Load the example systems to see every possible outcome of a 3×3 system.</li>
            </ul>
          </details>
        </div>

        <div className="footer">
          Made for learning ·{' '}
          <a href="https://linkedin.com/in/mcigramajofeijoo" target="_blank" rel="noreferrer">
            say hi on LinkedIn
          </a>
        </div>
      </div>
    </div>
  )
}
