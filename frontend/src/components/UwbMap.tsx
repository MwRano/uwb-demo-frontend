import React, { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Circle as KonvaCircle, Rect as KonvaRect, Text as KonvaText, Group, Line as KonvaLine } from 'react-konva'

import { startUwbMock, stopUwbMock, subscribeToUwbMock } from '../services/uwbMock'
import type { Tag } from '../services/uwbMock'

import { fetchLatestLocation } from '../services/api'
import type { BackendCoord } from '../services/api'

type Anchor = {
  id: string
  x: number
  y: number
  label?: string
  color?: string
  theta_deg?: number
}

const UwbMap: React.FC = () => {
  const [tags, setTags] = useState<Tag[]>([])
  const [simTags, setSimTags] = useState<Tag[]>([])
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)

  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [showSettings, setShowSettings] = useState<boolean>(false)

  const [pixelsPerMeter, setPixelsPerMeter] = useState<number>(1)
  const [rotationDeg, setRotationDeg] = useState<number>(0)
  const [invertBackendY, setInvertBackendY] = useState<boolean>(true)
  const [mapWidthMStr, setMapWidthMStr] = useState<string>('')
  const [mapHeightMStr, setMapHeightMStr] = useState<string>('')

  const [referencePoint, setReferencePoint] = useState<{ x: number; y: number }>({ x: 609, y: 678 })
  const [referenceXStr, setReferenceXStr] = useState<string>('0')
  const [referenceYStr, setReferenceYStr] = useState<string>('0')
  const [referencePickMode, setReferencePickMode] = useState<boolean>(false)

  const [showTrajectories, setShowTrajectories] = useState<boolean>(true)
  const [trajectories, setTrajectories] = useState<Record<string, { x: number; y: number }[]>>({})

  

  // inputs for simulate relative tag
  const [simAnchorId, setSimAnchorId] = useState<string>('A1')
  const [simDx, setSimDx] = useState('0')
  const [simDy, setSimDy] = useState('0')
  const [simLabel, setSimLabel] = useState('sim-1')

  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<any>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [stageTransform, setStageTransform] = useState({ scale: 1, x: 0, y: 0 })
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
  const MAP_PADDING = 24 // pixels of empty space around the image inside the stage

  // ▼▼▼ 追加するState: バックエンドから取得した生の実座標 ▼▼▼
  const [realBackendPos, setRealBackendPos] = useState<BackendCoord | null>(null)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImgSize({ width: img.naturalWidth, height: img.naturalHeight })
      setImgEl(img)
    }
    img.src = '/lab_map.png'
  }, [])

  useEffect(() => {
    const update = () => {
      const el = containerRef.current
      if (!el) return
      setStageSize({ width: el.clientWidth, height: el.clientHeight })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!imgSize) return
    const availW = Math.max(1, stageSize.width - MAP_PADDING * 2)
    const availH = Math.max(1, stageSize.height - MAP_PADDING * 2)
    const scale = Math.min(availW / imgSize.width, availH / imgSize.height)
    const x = (stageSize.width - imgSize.width * scale) / 2
    const y = (stageSize.height - imgSize.height * scale) / 2
    setStageTransform({ scale, x, y })
  }, [imgSize, stageSize])

  // initialize anchors after image size known
  useEffect(() => {
    if (!imgSize) return
    const stored = localStorage.getItem('uwb.anchors')
    let anchorsToUse: Anchor[] = []
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Anchor[]
        anchorsToUse = parsed.map((p) => ({ ...p, x: clamp(p.x, 0, imgSize.width), y: clamp(p.y, 0, imgSize.height) }))
      } catch (e) {
        console.error('failed to parse anchors', e)
        anchorsToUse = [
          { id: 'A1', x: 50, y: 50, color: '#FF5722' },
          { id: 'A2', x: imgSize.width - 50, y: 50, color: '#3F51B5' },
          { id: 'A3', x: imgSize.width - 50, y: imgSize.height - 50, color: '#4CAF50' },
          { id: 'A4', x: 50, y: imgSize.height - 50, color: '#FFC107' },
        ]
      }
    } else {
      anchorsToUse = [
        { id: 'A1', x: 50, y: 50, color: '#FF5722' },
        { id: 'A2', x: imgSize.width - 50, y: 50, color: '#3F51B5' },
        { id: 'A3', x: imgSize.width - 50, y: imgSize.height - 50, color: '#4CAF50' },
        { id: 'A4', x: 50, y: imgSize.height - 50, color: '#FFC107' },
      ]
    }
    setAnchors(anchorsToUse)
    const ppm = localStorage.getItem('uwb.pixelsPerMeter')
    if (ppm) setPixelsPerMeter(Number(ppm))
    const storedRef = localStorage.getItem('uwb.referencePoint')
    if (storedRef) {
      try {
        const parsed = JSON.parse(storedRef) as { x: number; y: number }
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          setReferencePoint({ x: parsed.x, y: parsed.y })
          setReferenceXStr(String(parsed.x))
          setReferenceYStr(String(parsed.y))
        }
      } catch (e) {
        console.error('failed to parse reference point', e)
      }
    }
    const mapW = localStorage.getItem('uwb.mapWidthM')
    const mapH = localStorage.getItem('uwb.mapHeightM')
    if (mapW) setMapWidthMStr(mapW)
    if (mapH) setMapHeightMStr(mapH)
    // if both map physical sizes available, compute pixelsPerMeter automatically
    if (mapW && mapH) {
      const wm = Number(mapW)
      const hm = Number(mapH)
      if (!isNaN(wm) && wm > 0 && !isNaN(hm) && hm > 0) {
        const ppmx = imgSize.width / wm
        const ppmy = imgSize.height / hm
        const s = (ppmx + ppmy) / 2
        setPixelsPerMeter(s)
      }
    }
  }, [imgSize])

  useEffect(() => {
    if (mapWidthMStr) localStorage.setItem('uwb.mapWidthM', mapWidthMStr)
  }, [mapWidthMStr])
  useEffect(() => {
    if (mapHeightMStr) localStorage.setItem('uwb.mapHeightM', mapHeightMStr)
  }, [mapHeightMStr])

  useEffect(() => {
    if (anchors.length) localStorage.setItem('uwb.anchors', JSON.stringify(anchors))
  }, [anchors])
  useEffect(() => localStorage.setItem('uwb.pixelsPerMeter', String(pixelsPerMeter)), [pixelsPerMeter])
  useEffect(() => localStorage.setItem('uwb.referencePoint', JSON.stringify(referencePoint)), [referencePoint])

  // useEffect(() => {
  //   if (!imgSize) return
  //   const unsub = subscribeToUwbMock((next) => setTags(next))
  //   startUwbMock({ width: imgSize.width, height: imgSize.height })
  //   return () => {
  //     unsub()
  //     stopUwbMock()
  //   }
  // }, [imgSize])

  // ▼▼▼ 修正後（リアルAPIのポーリング）▼▼▼
  useEffect(() => {
    if (!imgSize) return;

    const intervalId = setInterval(async () => {
      const pos = await fetchLatestLocation();
      if (pos) {
        setRealBackendPos(pos); // 最新の実座標(m)を保存
      }
    }, 500); // 0.5秒おきにフェッチ

    return () => clearInterval(intervalId);
  }, [imgSize]);

  // convert backend-relative dx/dy (meters) to pixel coordinates using an anchor
  function relativeToPixel(anchorId: string, dx: number, dy: number) {
    const a = anchors.find((z) => z.id === anchorId)
    if (!a) return null
    const s = pixelsPerMeter || 1
    const theta = ((a.theta_deg ?? rotationDeg) * Math.PI) / 180
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const dyEff = invertBackendY ? -dy : dy
    const px = a.x + s * (dx * cos - dyEff * sin)
    const py = a.y + s * (dx * sin + dyEff * cos)
    return { x: px, y: py }
  }

  // (placement via "Place" button removed; anchors are draggable directly)

  const tagsWithReference = tags.map((t) => ({ ...t, lng: t.lng + referencePoint.x, lat: t.lat + referencePoint.y }))
  const displayTags = [...tagsWithReference, ...simTags]
  const tagColors = new Map(tagsWithReference.map((t) => [t.id, t.color || '#1976d2']))

  useEffect(() => {
    if (!tagsWithReference.length) return
    const MAX_POINTS = 500
    setTrajectories((prev) => {
      const next: Record<string, { x: number; y: number }[]> = { ...prev }
      for (const t of tagsWithReference) {
        const current = next[t.id] ? [...next[t.id]] : []
        const last = current[current.length - 1]
        if (!last || last.x !== t.lng || last.y !== t.lat) {
          current.push({ x: t.lng, y: t.lat })
        }
        if (current.length > MAX_POINTS) current.splice(0, current.length - MAX_POINTS)
        next[t.id] = current
      }
      return next
    })
  }, [tags, referencePoint.x, referencePoint.y])

  if (!imgSize) return <div className="map-root">Loading map…</div>

  function addSimulatedRelativeTag() {
    const dx = Number(simDx)
    const dy = Number(simDy)
    const pos = relativeToPixel(simAnchorId, dx, dy)
    if (!pos) return alert('Anchor not found')
    const t: Tag = { id: simLabel, lat: pos.y, lng: pos.x, color: '#000' }
    setSimTags((s) => [...s, t])
  }
  
  // ▼▼▼ 修正: 新しい referencePoint (基準点) を使ってピクセル座標を計算 ▼▼▼
  let realTagPixelPos = null;
  if (realBackendPos) {
    const s = pixelsPerMeter || 1;
    const theta = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    
  // ★ココを修正！ バックエンドの X と Y を意図的に入れ替える
    const dx = realBackendPos.y; // ← バックエンドの y を画面の X軸方向（dx）に使う
    const dy = realBackendPos.x; // ← バックエンドの x を画面の Y軸方向（dy）に使う
    // Y軸の反転設定を適用
    const dyEff = invertBackendY ? -dy : dy;

    realTagPixelPos = {
      x: referencePoint.x + s * (dx * cos - dyEff * sin),
      y: referencePoint.y + s * (dx * sin + dyEff * cos)
    };
  }
  // ▲▲▲

  function applyReferencePointFromInputs() {
    const x = Number(referenceXStr)
    const y = Number(referenceYStr)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return alert('Enter valid numbers for reference X/Y')
    setReferencePoint({ x, y })
  }

  function handleStageMouseDown(e: any) {
    if (!referencePickMode || !imgSize) return
    if (e?.evt && e.evt.button !== 0) return
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const scale = stageTransform.scale || 1
    const x = clamp((pos.x - stageTransform.x) / scale, 0, imgSize.width)
    const y = clamp((pos.y - stageTransform.y) / scale, 0, imgSize.height)
    setReferencePoint({ x, y })
    setReferenceXStr(String(Math.round(x)))
    setReferenceYStr(String(Math.round(y)))
    setReferencePickMode(false)
  }

  return (
    <div className="map-root" ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <Stage
        width={stageSize.width}
        height={stageSize.height}
        ref={stageRef}
        x={stageTransform.x}
        y={stageTransform.y}
        scaleX={stageTransform.scale}
        scaleY={stageTransform.scale}
        onMouseDown={handleStageMouseDown}
      >
        <Layer>
          {imgEl && <KonvaImage image={imgEl} x={0} y={0} width={imgSize!.width} height={imgSize!.height} />}

          {showSettings && (
            <Group x={referencePoint.x} y={referencePoint.y}>
              <KonvaCircle radius={8} stroke="#E91E63" strokeWidth={2} />
              <KonvaText x={12} y={-7} text="REF" fontSize={12} fill="#E91E63" />
            </Group>
          )}

          {showTrajectories &&
            Object.entries(trajectories).map(([id, points]) => {
              if (points.length < 2) return null
              const flat = points.flatMap((p) => [p.x, p.y])
              return <KonvaLine key={id} points={flat} stroke={tagColors.get(id) || '#1976d2'} strokeWidth={4} lineCap="round" />
            })}

          {anchors.map((a) => (
            <Group
              key={a.id}
              x={a.x}
              y={a.y}
              draggable
              dragBoundFunc={(pos) => {
                if (!imgSize) return pos
                const x = Math.max(0, Math.min(imgSize.width, pos.x))
                const y = Math.max(0, Math.min(imgSize.height, pos.y))
                return { x, y }
              }}
              onDragEnd={(e: any) => {
                const node = e.target
                const newX = node.x()
                const newY = node.y()
                const clampedX = imgSize ? clamp(newX, 0, imgSize.width) : newX
                const clampedY = imgSize ? clamp(newY, 0, imgSize.height) : newY
                setAnchors((prev) => {
                  const next = prev.map((p) => (p.id === a.id ? { ...p, x: clampedX, y: clampedY } : p))
                  try {
                    localStorage.setItem('uwb.anchors', JSON.stringify(next))
                  } catch (err) {}
                  console.log('anchor moved', a.id, clampedX, clampedY)
                  return next
                })
              }}
            >
              <KonvaRect x={-18} y={-18} width={36} height={36} fill={a.color || '#000'} cornerRadius={4} />
              <KonvaText x={22} y={-10} text={a.id} fontSize={14} fill="#111" />
            </Group>
          ))}

          {displayTags.map((t) => (
            <Group key={t.id} x={t.lng} y={t.lat}>
              <KonvaCircle x={0} y={0} radius={16} fill={t.color || '#007bff'} />
              <KonvaText x={18} y={-10} text={t.id} fontSize={13} fill="#111" />
            </Group>
          ))}

          {/* ▼▼▼ 追加: リアルタイム測位タグの描画 ▼▼▼ */}
          {realTagPixelPos && (
            <Group x={realTagPixelPos.x} y={realTagPixelPos.y}>
              {/* 少し目立つように赤色で少し大きめの円にする */}
              <KonvaCircle x={0} y={0} radius={18} fill="#e50000" shadowBlur={8} shadowColor="rgba(0,0,0,0.5)" />
              <KonvaText x={22} y={-10} text="My Tag (Live)" fontSize={15} fill="#111" fontStyle="bold" />
            </Group>
          )}
        </Layer>
      </Stage>

      <div className="map-controls">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Anchors</h3>
          <button onClick={() => setShowSettings((s) => !s)}>{showSettings ? '設定を閉じる' : '設定'}</button>
        </div>
        <div>
          {anchors.map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <div style={{ width: 12, height: 12, background: a.color, borderRadius: 3 }} />
              <div style={{ flex: 1 }}>
                <strong>{a.id}</strong> {a.label ? `(${a.label})` : ''}
                <div style={{ fontSize: 12 }}>{Math.round(a.x)},{Math.round(a.y)}</div>
              </div>
            </div>
          ))}
        </div>
        {showSettings && (
          <>
            <hr />
            <h4>Scale / Rotation</h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" value={pixelsPerMeter} onChange={(e) => setPixelsPerMeter(Number(e.target.value))} style={{ width: 120 }} />
              <div>px/m</div>
            </div>
            
            <div style={{ marginTop: 6 }}>
              <label>Rotation(deg): <input type="number" value={rotationDeg} onChange={(e) => setRotationDeg(Number(e.target.value))} style={{ width: 80 }} /></label>
            </div>
            <div style={{ marginTop: 6 }}>
              <label><input type="checkbox" checked={invertBackendY} onChange={(e) => setInvertBackendY(e.target.checked)} /> Backend Y is Up (invert)</label>
            </div>

            <div style={{ marginTop: 10 }}>
              <h5>Map physical size (meters)</h5>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <div style={{ width: 80 }}>
                  <input placeholder="width (m)" value={mapWidthMStr} onChange={(e) => setMapWidthMStr(e.target.value)} style={{ width: '100%' }} />
                </div>
                <div style={{ width: 80 }}>
                  <input placeholder="height (m)" value={mapHeightMStr} onChange={(e) => setMapHeightMStr(e.target.value)} style={{ width: '100%' }} />
                </div>
                <button onClick={() => {
                  if (!imgSize) return alert('map not ready')
                  const w = Number(mapWidthMStr)
                  const h = Number(mapHeightMStr)
                  if (!w || !h || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return alert('Enter valid positive numbers for width and height')
                  const ppmx = imgSize.width / w
                  const ppmy = imgSize.height / h
                  const s = (ppmx + ppmy) / 2
                  setPixelsPerMeter(s)
                  localStorage.setItem('uwb.pixelsPerMeter', String(s))
                  alert(`pixels/m set to ${s.toFixed(3)}`)
                }}>Compute</button>
              </div>
            </div>

            <hr />
            <h4>Reference origin (pixels)</h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <input value={referenceXStr} onChange={(e) => setReferenceXStr(e.target.value)} style={{ width: 80 }} />
              <input value={referenceYStr} onChange={(e) => setReferenceYStr(e.target.value)} style={{ width: 80 }} />
              <button onClick={applyReferencePointFromInputs}>Apply</button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => setReferencePickMode((v) => !v)}
                style={referencePickMode ? { backgroundColor: '#E91E63', color: '#fff', border: 'none', padding: '6px 8px', borderRadius: 4 } : undefined}
              >
                {referencePickMode ? 'Click on map…' : 'Pick on map'}
              </button>
            </div>

            <hr />
            <h4>Trajectory</h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <label><input type="checkbox" checked={showTrajectories} onChange={(e) => setShowTrajectories(e.target.checked)} /> Show trajectory</label>
              <button onClick={() => setTrajectories({})}>Clear trajectory</button>
            </div>

            <hr />
            <h4>Simulate relative tag</h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <select value={simAnchorId} onChange={(e) => setSimAnchorId(e.target.value)}>
                {anchors.map((a) => <option key={a.id} value={a.id}>{a.id}</option>)}
              </select>
              <input value={simDx} onChange={(e) => setSimDx(e.target.value)} style={{ width: 60 }} /> m
              <input value={simDy} onChange={(e) => setSimDy(e.target.value)} style={{ width: 60 }} /> m
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={simLabel} onChange={(e) => setSimLabel(e.target.value)} />
              <button onClick={addSimulatedRelativeTag}>Add</button>
            </div>
          </>
        )}

        <div style={{ marginTop: 12 }}>
          <button onClick={() => { localStorage.setItem('uwb.anchors', JSON.stringify(anchors)); alert('Anchors saved') }}>Save anchors</button>
        </div>
      </div>
    </div>
  )
}

export default UwbMap
