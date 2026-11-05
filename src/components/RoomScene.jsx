import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows, Lightformer, Html, PivotControls } from '@react-three/drei'
import * as THREE from 'three'
import { scaleForRoom, itemDims, formatIDR, clampPosToRoom } from '../lib/roomLayout.js'
import { setSnapshotProvider } from '../lib/sceneSnapshot.js'
import { labelScale } from '../lib/labelScale.js'

// Two modes:
//  - showcase: no design yet → the hand-tuned Japandi diorama (visual-plan/PRD.md)
//  - design:   room shell sized to roomGraph.room.dimensions + data-driven furniture

// --- Procedural textures (no external assets), palette per visual-plan/PRD.md ---
function canvasTex(c, rx=1, ry=1){
  const tex=new THREE.CanvasTexture(c)
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(rx,ry)
  tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=4; tex.needsUpdate=true
  return tex
}
function rnd(seed){ let s=seed; return ()=>{ s=(s*16807)%2147483647; return (s-1)/2147483646 } }
function createOakTexture(base='#C49A67'){
  const c=document.createElement('canvas'); c.width=256; c.height=256
  const ctx=c.getContext('2d'); const R=rnd(7)
  ctx.fillStyle=base; ctx.fillRect(0,0,256,256)
  for(let i=0;i<26;i++){ // long grain along Y
    ctx.strokeStyle=`rgba(90,52,20,${0.10+R()*0.12})`; ctx.lineWidth=0.8+R()*1.4
    const x=(i/26)*256+R()*8
    ctx.beginPath(); ctx.moveTo(x,-4)
    ctx.bezierCurveTo(x+6,70, x-7,150, x+3,260); ctx.stroke()
  }
  for(let i=0;i<700;i++){ ctx.fillStyle=`rgba(70,40,15,${0.03+R()*0.05})`; ctx.fillRect(R()*256,R()*256,1,1+R()*5) }
  for(let i=0;i<4;i++){ // faint cathedral arcs
    ctx.strokeStyle='rgba(90,52,20,0.10)'; ctx.lineWidth=1
    ctx.beginPath(); ctx.ellipse(40+i*60,120+R()*60,10,44,0.2,0,Math.PI*2); ctx.stroke()
  }
  return canvasTex(c,1,1)
}
function createFloorTexture(){
  const c=document.createElement('canvas'); c.width=512; c.height=512
  const ctx=c.getContext('2d'); const R=rnd(21)
  ctx.fillStyle='#C8A173'; ctx.fillRect(0,0,512,512)
  const pw=512/7 // 7 planks across tile; plank direction along Y (toward camera)
  for(let p=0;p<7;p++){
    const tone=0.94+R()*0.12
    ctx.fillStyle=`rgb(${Math.round(200*tone)},${Math.round(161*tone)},${Math.round(115*tone)})`
    ctx.fillRect(p*pw,0,pw,512)
    for(let i=0;i<22;i++){ // grain streaks
      ctx.strokeStyle=`rgba(110,70,30,${0.08+R()*0.10})`; ctx.lineWidth=0.7+R()
      const x=p*pw+R()*pw
      ctx.beginPath(); ctx.moveTo(x,0); ctx.bezierCurveTo(x+4,150,x-4,340,x+2,512); ctx.stroke()
    }
    ctx.fillStyle='rgba(60,35,15,0.55)'; ctx.fillRect(p*pw,0,1.2,512) // seam
    let y=R()*200 // staggered butt joints
    for(let j=0;j<2;j++){ ctx.fillStyle='rgba(60,35,15,0.5)'; ctx.fillRect(p*pw,y,pw,1.4); y+=220+R()*160 }
  }
  return canvasTex(c,2.2,2.6)
}
function createLinenTexture(base='#D9CFBC'){
  const c=document.createElement('canvas'); c.width=256; c.height=256
  const ctx=c.getContext('2d'); const R=rnd(33)
  ctx.fillStyle=base; ctx.fillRect(0,0,256,256)
  for(let y=0;y<256;y+=3){
    ctx.strokeStyle=`rgba(60,45,25,${0.05+R()*0.05})`; ctx.lineWidth=1
    ctx.beginPath(); ctx.moveTo(0,y+R()*2); ctx.lineTo(256,y+R()*2); ctx.stroke()
  }
  for(let x=0;x<256;x+=3){
    ctx.strokeStyle=`rgba(255,255,255,${0.04+R()*0.05})`; ctx.lineWidth=1
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,256); ctx.stroke()
  }
  for(let i=0;i<160;i++){ // slubs
    ctx.fillStyle=`rgba(80,60,35,${0.05+R()*0.07})`
    ctx.fillRect(R()*256,R()*256,2+R()*5,1)
  }
  return canvasTex(c,3,3)
}
function createRugTexture(){
  const c=document.createElement('canvas'); c.width=256; c.height=256
  const ctx=c.getContext('2d'); const R=rnd(44)
  ctx.fillStyle='#D6CBB4'; ctx.fillRect(0,0,256,256)
  for(let y=0;y<256;y+=4){
    ctx.fillStyle=`rgba(120,100,70,${0.10+R()*0.12})`; ctx.fillRect(0,y,256,1.4)
    ctx.fillStyle=`rgba(255,252,240,${0.06+R()*0.08})`; ctx.fillRect(0,y+2,256,1)
  }
  for(let i=0;i<500;i++){ ctx.fillStyle=`rgba(90,75,55,${0.09+R()*0.10})`; ctx.fillRect(R()*256,R()*256,2,1) }
  return canvasTex(c,4,3)
}
function createLimewashTexture(){
  const c=document.createElement('canvas'); c.width=256; c.height=256
  const ctx=c.getContext('2d'); const R=rnd(55)
  ctx.fillStyle='#E7DDCB'; ctx.fillRect(0,0,256,256)
  for(let i=0;i<2600;i++){
    ctx.fillStyle=R()>0.5?`rgba(255,250,238,${0.015+R()*0.02})`:`rgba(150,130,105,${0.015+R()*0.02})`
    const r=1+R()*3
    ctx.beginPath(); ctx.arc(R()*256,R()*256,r,0,Math.PI*2); ctx.fill()
  }
  return canvasTex(c,3,2)
}
function createRattanTexture(){
  const c=document.createElement('canvas'); c.width=128; c.height=128
  const ctx=c.getContext('2d'); const R=rnd(66)
  ctx.fillStyle='#6B421A'; ctx.fillRect(0,0,128,128) // dark gaps glow through
  const s=16
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const horiz=(x+y)%2===0
    const g=ctx.createLinearGradient(horiz?x*s:x*s, horiz?y*s:y*s, horiz?x*s:(x+1)*s, horiz?y*s+(horiz?0:s):y*s)
    g.addColorStop(0,'#EAB26C'); g.addColorStop(0.5,'#CF9450'); g.addColorStop(1,'#96622C')
    ctx.fillStyle=g
    if(horiz) ctx.fillRect(x*s+1,y*s+3,s-2,s-6)
    else ctx.fillRect(x*s+3,y*s+1,s-6,s-2)
  }
  for(let i=0;i<200;i++){ ctx.fillStyle=`rgba(60,30,8,${0.08+R()*0.1})`; ctx.fillRect(R()*128,R()*128,1,1) }
  return canvasTex(c,6,3)
}
function createGardenTexture(){
  const c=document.createElement('canvas'); c.width=256; c.height=256
  const ctx=c.getContext('2d'); const R=rnd(77)
  const sky=ctx.createLinearGradient(0,0,0,256)
  sky.addColorStop(0,'#E2EAD0'); sky.addColorStop(0.45,'#CBD6B6'); sky.addColorStop(1,'#A3B489')
  ctx.fillStyle=sky; ctx.fillRect(0,0,256,256)
  const leafCols=['#7FA066', '#93B27F', '#6B9266']
  for(let i=0;i<90;i++){ // blown-out foliage bokeh
    const g=leafCols[i%3]
    ctx.fillStyle=g; ctx.globalAlpha=0.35+R()*0.45
    ctx.beginPath(); ctx.ellipse(R()*256,R()*256,6+R()*22,5+R()*16,R()*3,0,Math.PI*2); ctx.fill()
  }
  ctx.globalAlpha=1
  ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.fillRect(0,0,256,60) // bright sky blowout
  return canvasTex(c,1,1)
}
function createArtTexture(){
  const c=document.createElement('canvas'); c.width=256; c.height=340
  const ctx=c.getContext('2d')
  ctx.fillStyle='#F1EAE0'; ctx.fillRect(0,0,256,340)
  ctx.fillStyle='#D9CFBC' // beige wash blob
  ctx.beginPath(); ctx.ellipse(128,170,72,108,0.15,0,Math.PI*2); ctx.fill()
  ctx.strokeStyle='#3A3733'; ctx.lineWidth=3; ctx.lineCap='round' // single dark loop line
  ctx.beginPath(); ctx.moveTo(128,60)
  ctx.bezierCurveTo(170,120, 200,180, 150,240)
  ctx.bezierCurveTo(110,290, 60,260, 78,200)
  ctx.bezierCurveTo(92,150, 150,140, 138,100)
  ctx.bezierCurveTo(134,84, 128,72, 128,60); ctx.stroke()
  return canvasTex(c,1,1)
}
const _texCache={}
function tex(key, maker){ if(!_texCache[key]) _texCache[key]=maker(); return _texCache[key] }
const getWoodTex=()=>tex('oak',createOakTexture)
const getFloorTex=()=>tex('floor',createFloorTexture)
const getFabricTex=(col='#D9CFBC')=>tex('linen'+col,()=>createLinenTexture(col))
const getRugTex=()=>tex('rug',createRugTexture)
const getLimeTex=()=>tex('lime',createLimewashTexture)
const getRattanTex=()=>tex('rattan',createRattanTexture)
const getGardenTex=()=>tex('garden',createGardenTexture)
const getArtTex=()=>tex('art',createArtTexture)
function createPlasterTexture(){
  const c=document.createElement('canvas'); c.width=256; c.height=256
  const ctx=c.getContext('2d'); const R=rnd(88)
  ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,256,256)
  for(let i=0;i<2200;i++){
    ctx.fillStyle=R()>0.5?`rgba(255,255,255,${0.02+R()*0.03})`:`rgba(120,110,95,${0.012+R()*0.02})`
    ctx.beginPath(); ctx.arc(R()*256,R()*256,1+R()*3,0,Math.PI*2); ctx.fill()
  }
  return canvasTex(c,3,2)
}
const getPlasterTex=()=>tex('plaster',createPlasterTexture)

// Per-style materials for the design mode (texture maps are multiplied by these).
const STYLE_LOOK = {
  Japandi:      { wall:'#E7DDCB', floor:'#FFFFFF', fabric:'#D9CFBC', cushion:'#D5CAB4', wood:'#FFFFFF', rug:'#FFFFFF', furn:'#c9a87a' },
  Minimalist:   { wall:'#F3F2EF', floor:'#EDE7DF', fabric:'#E4E2DE', cushion:'#D6D4D0', wood:'#F2EEE8', rug:'#E8E8E6', furn:'#e8e8e8' },
  Scandinavian: { wall:'#F4F1EB', floor:'#FFF6EA', fabric:'#CDD5D0', cushion:'#E9E4DA', wood:'#FFF4E4', rug:'#E9EFE9', furn:'#d8c8a8' },
  Industrial:   { wall:'#BDB8B0', floor:'#8F8780', fabric:'#7A6656', cushion:'#5E5048', wood:'#8A7666', rug:'#9A948C', furn:'#6b5b4f' },
  Modern:       { wall:'#F1F1F2', floor:'#D8D2CA', fabric:'#4A4A52', cushion:'#C9C9CF', wood:'#5A5A5F', rug:'#8C8C94', furn:'#2a2a30' },
  Bohemian:     { wall:'#EBD3B5', floor:'#E8B88A', fabric:'#C98B5A', cushion:'#E9C9A3', wood:'#D9A06A', rug:'#E0A070', furn:'#c17a3d' },
}
const lookFor = (style) => STYLE_LOOK[style] || STYLE_LOOK.Japandi

function Floor(){
  const floorTex = useMemo(()=>getFloorTex(),[])
  return (
    <group>
      {/* oak plank floor 4.0 x 5.0, planks run toward camera (PRD 4.1) */}
      <mesh rotation={[-Math.PI/2,0,0]} receiveShadow position={[0,0,0]}>
        <planeGeometry args={[4.0, 5.0]} />
        <meshStandardMaterial map={floorTex} roughness={0.5} metalness={0.02} />
      </mesh>
      {/* warm sun patch spilling from the glass wall */}
      <mesh rotation={[-Math.PI/2,0,0]} position={[-1.05,0.004,-0.2]}>
        <planeGeometry args={[1.7, 4.2]} />
        <meshStandardMaterial color="#FFF3D9" transparent opacity={0.07} roughness={1} depthWrite={false} />
      </mesh>
    </group>
  )
}

// Room shell for design mode: sized to the model's room dimensions.
// Walls are single-sided planes facing inward, so orbiting behind a wall hides
// it (dollhouse view) instead of blocking the furniture.
function SizedRoomShell({ dims, style }){
  const { w, l, h } = dims
  const look = lookFor(style)
  const floorTex = useMemo(()=>{
    const t = getFloorTex().clone(); t.repeat.set(2.2*w/4, 2.6*l/5); t.needsUpdate = true; return t
  },[w,l])
  const wallTex = useMemo(()=>{
    const t = getPlasterTex().clone(); t.repeat.set(w/1.4, h/1.4); t.needsUpdate = true; return t
  },[w,h])
  const sideTex = useMemo(()=>{
    const t = getPlasterTex().clone(); t.repeat.set(l/1.4, h/1.4); t.needsUpdate = true; return t
  },[l,h])
  useEffect(()=>()=>{ floorTex.dispose(); wallTex.dispose(); sideTex.dispose() },[floorTex,wallTex,sideTex])
  const gardenTex = useMemo(()=>getGardenTex(),[])
  const winW = Math.min(1.6, w*0.42), winH = Math.min(1.1, h*0.4), winY = h*0.58
  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} receiveShadow>
        <planeGeometry args={[w, l]} />
        <meshStandardMaterial map={floorTex} color={look.floor} roughness={0.55} metalness={0.02} />
      </mesh>
      {/* back wall */}
      <mesh position={[0,h/2,-l/2]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={wallTex} color={look.wall} roughness={0.94} />
      </mesh>
      {/* left + right walls */}
      <mesh position={[-w/2,h/2,0]} rotation={[0,Math.PI/2,0]} receiveShadow>
        <planeGeometry args={[l, h]} />
        <meshStandardMaterial map={sideTex} color={look.wall} roughness={0.94} />
      </mesh>
      <mesh position={[w/2,h/2,0]} rotation={[0,-Math.PI/2,0]} receiveShadow>
        <planeGeometry args={[l, h]} />
        <meshStandardMaterial map={sideTex} color={look.wall} roughness={0.94} />
      </mesh>
      {/* baseboards */}
      <mesh position={[0,0.045,-l/2+0.015]}>
        <boxGeometry args={[w,0.09,0.03]} />
        <meshStandardMaterial color="#EFE7D8" roughness={0.9} />
      </mesh>
      {[-1,1].map(s=>(
        <mesh key={s} position={[s*(w/2-0.015),0.045,0]}>
          <boxGeometry args={[0.03,0.09,l]} />
          <meshStandardMaterial color="#EFE7D8" roughness={0.9} />
        </mesh>
      ))}
      {/* window on the back wall: bright garden behind glass + dark frame */}
      <group position={[0,winY,-l/2+0.012]}>
        <mesh>
          <planeGeometry args={[winW, winH]} />
          <meshStandardMaterial map={gardenTex} emissive="#FFFFFF" emissiveIntensity={0.25} roughness={1} />
        </mesh>
        {[[0,winH/2,winW+0.06,0.05],[0,-winH/2,winW+0.06,0.05],[0,0,0.035,winH]].map(([x,y,fw,fh],i)=>(
          <mesh key={i} position={[x,y,0.01]}>
            <boxGeometry args={[fw,fh,0.03]} />
            <meshStandardMaterial color="#23211E" roughness={0.6} />
          </mesh>
        ))}
        {[-1,1].map(s=>(
          <mesh key={s} position={[s*winW/2,0,0.01]}>
            <boxGeometry args={[0.05,winH+0.06,0.03]} />
            <meshStandardMaterial color="#23211E" roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
// Sheer curtain panel with gentle S-folds (PRD 4.1)
function SheerPanel({ position, width=0.9, height=2.65, seed=3 }){
  const geo = useMemo(()=>{
    const g=new THREE.PlaneGeometry(width, height, 24, 1)
    const pos=g.attributes.position
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i)
      pos.setZ(i, Math.sin((x/width)*Math.PI*3.2+seed)*0.16 + Math.sin((x/width)*Math.PI*7.1+seed*2)*0.04)
    }
    g.computeVertexNormals()
    return g
  },[width,height,seed])
  return (
    /* curtain plane faces +X into the room (glass wall runs along Z) */
    <mesh geometry={geo} position={position} rotation={[0,Math.PI/2,0]}>
      <meshStandardMaterial color="#F1E9D8" transparent opacity={0.72} roughness={1.0}
        emissive="#FFF6E0" emissiveIntensity={0.10} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

// Room shell: limewash back wall, left glass wall + garden + sheers, right wall + doorway (PRD 4.1)
function RoomShell(){
  const limeTex = useMemo(()=>getLimeTex(),[])
  const gardenTex = useMemo(()=>getGardenTex(),[])
  const H=2.8
  return (
    <group>
      {/* back wall 4.0 x 2.8 at z=-2.5 */}
      <mesh position={[0,H/2,-2.5]} receiveShadow>
        <planeGeometry args={[4.0, H]} />
        <meshStandardMaterial map={limeTex} roughness={0.94} />
      </mesh>
      {/* ceiling, warm white (emissive lift: it faces away from the key light) */}
      <mesh position={[0,H,0]} rotation={[Math.PI/2,0,0]}>
        <planeGeometry args={[4.0, 5.0]} />
        <meshStandardMaterial color="#F5F0E6" emissive="#FFF8EC" emissiveIntensity={0.45} roughness={0.96} />
      </mesh>
      {/* baseboards */}
      <mesh position={[0,0.045,-2.48]}>
        <boxGeometry args={[4.0,0.09,0.03]} />
        <meshStandardMaterial color="#EFE7D8" roughness={0.9} />
      </mesh>
      <mesh position={[1.98,0.045,0]} rotation={[0,Math.PI/2,0]}>
        <boxGeometry args={[5.0,0.09,0.03]} />
        <meshStandardMaterial color="#EFE7D8" roughness={0.9} />
      </mesh>
      {/* ---- left glass wall (x=-2 plane, 4.4 long x 2.6 high) ---- */}
      <group position={[-2.0,0,0]}>
        {/* garden backdrop, blown out bright */}
        <mesh position={[-0.9,1.3,0]} rotation={[0,Math.PI/2,0]}>
          <planeGeometry args={[4.6, 2.6]} />
          <meshStandardMaterial map={gardenTex} emissive="#FFFFFF" emissiveIntensity={0.15} roughness={1} />
        </mesh>
        {/* glass with faint cool tint */}
        <mesh position={[0,1.3,0]} rotation={[0,Math.PI/2,0]}>
          <planeGeometry args={[4.4, 2.6]} />
          <meshStandardMaterial color="#DCE8E4" transparent opacity={0.10} roughness={0.05} depthWrite={false} />
        </mesh>
        {/* dark frames: head, sill, 3 verticals (2 sliding panels + 1 fixed) */}
        {[-2.2,-0.73,0.73,2.2].map((z,i)=>(
          <mesh key={i} position={[0,1.3,z]}>
            <boxGeometry args={[0.06,2.6,0.06]} />
            <meshStandardMaterial color="#23211E" roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0,2.6,0]}>
          <boxGeometry args={[0.06,0.07,4.46]} />
          <meshStandardMaterial color="#23211E" roughness={0.6} />
        </mesh>
        <mesh position={[0,0.02,0]}>
          <boxGeometry args={[0.10,0.05,4.46]} />
          <meshStandardMaterial color="#23211E" roughness={0.6} />
        </mesh>
        <mesh position={[0,1.72,0]}>
          <boxGeometry args={[0.05,0.05,4.4]} />
          <meshStandardMaterial color="#23211E" roughness={0.6} />
        </mesh>
      </group>
      {/* sheer curtains + heavy drape */}
      <SheerPanel position={[-1.85,1.34,-1.6]} seed={1.2} />
      <SheerPanel position={[-1.85,1.34,0.6]} seed={4.1} />
      <group position={[-1.82,0,-2.1]}>
        <mesh position={[0,1.35,0]} castShadow>
          <boxGeometry args={[0.10,2.7,0.55]} />
          <meshStandardMaterial color="#EDE4D2" roughness={1.0} />
        </mesh>
        <mesh position={[0.06,0.03,0.1]} rotation={[0,0.4,0]}>
          <boxGeometry args={[0.22,0.06,0.5]} />
          <meshStandardMaterial color="#EDE4D2" roughness={1.0} />
        </mesh>
      </group>
      {/* curtain rod */}
      <mesh position={[-1.85,2.68,-0.2]} rotation={[Math.PI/2,0,0]}>
        <cylinderGeometry args={[0.015,0.015,4.3,10]} />
        <meshStandardMaterial color="#3A2D1F" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* ---- right wall (x=+2) with 0.9 doorway toward the back ---- */}
      <group>
        {/* wall segments leave a real 0.9 opening at z=-1.95..-1.05 */}
        <mesh position={[2.0,H/2,-2.225]} rotation={[0,-Math.PI/2,0]} receiveShadow>
          <planeGeometry args={[0.55, H]} />
          <meshStandardMaterial map={limeTex} color="#ECE3D2" roughness={0.93} />
        </mesh>
        <mesh position={[2.0,H/2,0.725]} rotation={[0,-Math.PI/2,0]} receiveShadow>
          <planeGeometry args={[3.55, H]} />
          <meshStandardMaterial map={limeTex} color="#ECE3D2" roughness={0.93} />
        </mesh>
        {/* header above the opening */}
        <mesh position={[2.0,2.5,-1.5]} rotation={[0,-Math.PI/2,0]}>
          <planeGeometry args={[0.9, 0.6]} />
          <meshStandardMaterial map={limeTex} color="#ECE3D2" roughness={0.93} />
        </mesh>
        {/* jamb liners */}
        {[-1.95,-1.05].map((z,i)=>(
          <mesh key={i} position={[2.0,1.1,z]}>
            <boxGeometry args={[0.12,2.2,0.05]} />
            <meshStandardMaterial color="#E4D9C6" roughness={0.9} />
          </mesh>
        ))}
        {/* bright interior beyond */}
        <mesh position={[2.18,1.1,-1.5]} rotation={[0,-Math.PI/2,0]}>
          <planeGeometry args={[0.9, 2.2]} />
          <meshStandardMaterial color="#F6F2EA" emissive="#FFFFFF" emissiveIntensity={0.5} roughness={1} />
        </mesh>
      </group>
    </group>
  )
}


const _labelPos = new THREE.Vector3(), _labelCam = new THREE.Vector3()

// Name/price tag above a piece. Full card with the product link when selected.
function ShoppableHotspot({ item, h, pos, full, locale }){
  const [x,z] = pos || [0,0]
  const name = (item.name||item.archetype||'').replace(/_/g,' ')
  const t = (en, id) => locale==='id' ? id : en
  const inner = useRef(null)
  // Runs every frame inside drei's <Html>: project the anchor, scale the label,
  // keep the selected card inside the viewer and hide tags whose item is off-screen.
  const calculatePosition = useCallback((el, camera, size) => {
    _labelPos.setFromMatrixPosition(el.matrixWorld)
    _labelCam.setFromMatrixPosition(camera.matrixWorld)
    const s = labelScale(_labelPos.distanceTo(_labelCam), size.height, camera.fov)
    _labelPos.project(camera)
    let px = ((_labelPos.x + 1) / 2) * size.width
    let py = ((1 - _labelPos.y) / 2) * size.height
    const div = inner.current
    if (div) {
      const w = div.offsetWidth * s, hgt = div.offsetHeight * s, m = 10
      const onScreen = px > -w / 2 && px < size.width + w / 2 && py > 0 && py < size.height + hgt
      if (full) {
        px = Math.min(size.width - w / 2 - m, Math.max(w / 2 + m, px))
        py = Math.min(size.height - m, Math.max(hgt + m, py))
      }
      div.style.transform = `translate(-50%, -100%) scale(${s.toFixed(3)})`
      div.style.visibility = full || onScreen ? 'visible' : 'hidden'
    }
    return [px, py]
  }, [full])
  return (
    <Html position={[x, h + 0.12, z]} calculatePosition={calculatePosition} zIndexRange={[20,0]} style={{pointerEvents: full ? 'auto' : 'none'}}>
      <div ref={inner} style={{width:'max-content', transformOrigin:'50% 100%', transform:'translate(-50%, -100%)', willChange:'transform', visibility:'hidden' /* shown once positioned */}}>
      {full ? (
        <div style={{background:'#fff',border:'1px solid #e6e1d8',borderRadius:12,padding:10,boxShadow:'0 10px 30px rgba(29,27,24,.18)',width:210,fontFamily:'Inter, system-ui, sans-serif',color:'#1d1b18'}}>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {item.image && <img src={item.image} alt="" referrerPolicy="no-referrer" style={{width:44,height:44,objectFit:'contain',border:'1px solid #eee',borderRadius:8,background:'#fff',flex:'none'}} />}
            <div style={{minWidth:0}}>
              <div style={{fontSize:12,fontWeight:650,lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{name}</div>
              <div style={{fontSize:12,fontWeight:700,marginTop:2}}>{formatIDR(item.priceIDR)}{item.priceSource!=='store' && <span style={{fontWeight:500,color:'#a2650f'}}> · {t('est.','estimasi')}</span>}</div>
            </div>
          </div>
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" onPointerDown={e=>e.stopPropagation()} style={{display:'block',marginTop:8,textAlign:'center',fontSize:11.5,fontWeight:650,background:'#1d1b18',color:'#fff',padding:'7px 8px',borderRadius:8}}>{item.store ? `${t('View at','Lihat di')} ${item.store.replace(' Indonesia','')}` : t('View product','Lihat produk')}</a>
          )}
        </div>
      ) : (
        <div style={{background:'rgba(255,255,255,.92)',border:'1px solid rgba(29,27,24,.1)',borderRadius:999,padding:'3px 9px',fontSize:11,fontWeight:650,color:'#1d1b18',whiteSpace:'nowrap',fontFamily:'Inter, system-ui, sans-serif'}}>
          {formatIDR(item.priceIDR)}
        </div>
      )}
      </div>
    </Html>
  )
}

// Simple procedural models, built around the item's own origin (floor center).
function Furniture({ item, roomType }){
  const { w, d, h } = scaleForRoom(item.archetype, roomType)
  const look = lookFor(item.style)
  const col = look.furn
  const woodTex = useMemo(()=>getWoodTex(),[])
  const fabricTex = useMemo(()=>getFabricTex(look.fabric),[look.fabric])
  const secondary = '#3a2d1f'
  const metalCol = '#8a7a6a'
  const a = item.archetype

  if(a==='rug'){
    return (
      <mesh position={[0,0.012,0]} rotation={[-Math.PI/2,0,0]} receiveShadow>
        <planeGeometry args={[w,d]} />
        <meshStandardMaterial map={fabricTex} color={look.rug} roughness={1} />
      </mesh>
    )
  }
  if(a==='lamp'){
    return (
      <group>
        <mesh position={[0,0.03,0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.16,0.18,0.06,20]} />
          <meshStandardMaterial color={metalCol} roughness={0.45} metalness={0.6} />
        </mesh>
        <mesh position={[0,0.8,0]} castShadow>
          <cylinderGeometry args={[0.018,0.022,1.55,12]} />
          <meshStandardMaterial color={metalCol} roughness={0.35} metalness={0.7} />
        </mesh>
        <mesh position={[0,1.62,0]} castShadow>
          <cylinderGeometry args={[0.13,0.2,0.26,24,1,true]} />
          <meshStandardMaterial color="#F4ECDC" emissive="#FFE2A8" emissiveIntensity={0.9} roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
        <pointLight position={[0,1.55,0]} intensity={1.2} distance={2.6} color="#ffe2a8" decay={2} />
      </group>
    )
  }
  if(a==='chair' || a==='stool'){
    const legH = a==='stool' ? h-0.05 : 0.45
    return (
      <group>
        <mesh position={[0,legH+0.03,0]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.06, d]} />
          <meshStandardMaterial map={fabricTex} color={look.fabric} roughness={0.85} />
        </mesh>
        {a==='chair' && (
          <mesh position={[0,legH+0.28,-d/2+0.04]} castShadow>
            <boxGeometry args={[w*0.92, 0.46, 0.06]} />
            <meshStandardMaterial map={fabricTex} color={look.fabric} roughness={0.85} />
          </mesh>
        )}
        {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sz],i)=>(
          <mesh key={i} position={[sx*(w/2-0.05), legH/2, sz*(d/2-0.05)]} castShadow>
            <cylinderGeometry args={[0.02,0.017,legH,10]} />
            <meshStandardMaterial color={secondary} roughness={0.6} />
          </mesh>
        ))}
      </group>
    )
  }
  if(a==='bed'){
    return (
      <group>
        <mesh position={[0,0.12,0]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.24, d]} />
          <meshStandardMaterial map={woodTex} color={look.wood} roughness={0.68} />
        </mesh>
        <mesh position={[0,0.34,0.02]} castShadow>
          <boxGeometry args={[w*0.96, 0.2, d*0.94]} />
          <meshStandardMaterial color="#f5f1e8" roughness={0.95} />
        </mesh>
        <mesh position={[0,0.42,d*0.2]} castShadow>
          <boxGeometry args={[w*0.98, 0.05, d*0.55]} />
          <meshStandardMaterial map={fabricTex} color={look.fabric} roughness={0.95} />
        </mesh>
        <mesh position={[0,0.55,-d/2+0.05]} castShadow>
          <boxGeometry args={[w, 1.0, 0.08]} />
          <meshStandardMaterial map={fabricTex} color={look.fabric} roughness={0.9} />
        </mesh>
        {[-1,1].map(s=>(
          <mesh key={s} position={[s*w*0.22,0.5,-d*0.33]} castShadow>
            <boxGeometry args={[w*0.4,0.12,0.32]} />
            <meshStandardMaterial color="#fff" roughness={0.95} />
          </mesh>
        ))}
      </group>
    )
  }
  if(a==='sofa'){
    return (
      <group>
        <mesh position={[0,0.26,0]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.34, d]} />
          <meshStandardMaterial map={fabricTex} color={look.fabric} roughness={0.92} />
        </mesh>
        <mesh position={[0,0.6,-d/2+0.09]} castShadow>
          <boxGeometry args={[w, 0.42, 0.14]} />
          <meshStandardMaterial map={fabricTex} color={look.fabric} roughness={0.92} />
        </mesh>
      </group>
    )
  }
  if(a==='bathtub' || a==='sink'){
    return (
      <group>
        {a==='sink' && (
          <mesh position={[0,h*0.4,0]} castShadow receiveShadow>
            <boxGeometry args={[w*0.96, h*0.8, d*0.9]} />
            <meshStandardMaterial map={woodTex} color={look.wood} roughness={0.6} />
          </mesh>
        )}
        <mesh position={[0,a==='sink'?h*0.9:h/2,0]} castShadow receiveShadow>
          <boxGeometry args={[w, a==='sink'?h*0.2:h, d]} />
          <meshStandardMaterial color="#ffffff" roughness={0.18} metalness={0.05} />
        </mesh>
        <mesh position={[0,a==='sink'?h+0.002:h*0.98,0]} rotation={[-Math.PI/2,0,0]}>
          <planeGeometry args={[w*0.82, d*0.72]} />
          <meshStandardMaterial color="#dfe8ee" roughness={0.15} />
        </mesh>
        {a==='sink' && (
          <mesh position={[0,1.45,-d/2+0.02]}>
            <boxGeometry args={[w*0.8,0.7,0.02]} />
            <meshStandardMaterial color="#cfdde4" roughness={0.05} metalness={0.6} />
          </mesh>
        )}
      </group>
    )
  }
  if(a==='toilet'){
    return (
      <group>
        <mesh position={[0,0.2,0.06]} castShadow receiveShadow>
          <cylinderGeometry args={[w*0.42, w*0.32, 0.4, 20]} />
          <meshStandardMaterial color="#ffffff" roughness={0.18} />
        </mesh>
        <mesh position={[0,0.41,0.06]}>
          <cylinderGeometry args={[w*0.46, w*0.46, 0.03, 24]} />
          <meshStandardMaterial color="#f4f4f4" roughness={0.25} />
        </mesh>
        <mesh position={[0,0.55,-d/2+0.1]} castShadow>
          <boxGeometry args={[w*0.95,0.4,0.18]} />
          <meshStandardMaterial color="#ffffff" roughness={0.18} />
        </mesh>
      </group>
    )
  }
  if(a==='wardrobe' || a==='shelf'){
    const open = a==='shelf'
    return (
      <group position={[0,h/2,0]}>
        {open ? (
          <>
            {[-1,1].map(s=>(
              <mesh key={s} position={[s*(w/2-0.02),0,0]} castShadow>
                <boxGeometry args={[0.04,h,d]} />
                <meshStandardMaterial map={woodTex} color={look.wood} roughness={0.65} />
              </mesh>
            ))}
            {[0,1,2,3,4].map(i=>(
              <mesh key={i} position={[0,-h/2+0.02+i*(h-0.04)/4,0]} castShadow receiveShadow>
                <boxGeometry args={[w,0.03,d]} />
                <meshStandardMaterial map={woodTex} color={look.wood} roughness={0.65} />
              </mesh>
            ))}
            {[0,1,2].map(i=>(
              <mesh key={'b'+i} position={[-w*0.25+i*0.12,-h/2+0.2+((i%2)*0.9),0]} castShadow>
                <boxGeometry args={[0.07,0.26,d*0.7]} />
                <meshStandardMaterial color={['#B9AC97','#6B5B45','#D9CDB4'][i]} roughness={0.9} />
              </mesh>
            ))}
          </>
        ) : (
          <>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial map={woodTex} color={look.wood} roughness={0.68} />
            </mesh>
            <mesh position={[0,0,d/2+0.003]}>
              <boxGeometry args={[0.008,h*0.96,0.004]} />
              <meshStandardMaterial color="#4A3320" roughness={0.8} />
            </mesh>
            {[-1,1].map(s=>(
              <mesh key={s} position={[s*0.06,0.05,d/2+0.02]}>
                <boxGeometry args={[0.02,0.22,0.02]} />
                <meshStandardMaterial color={metalCol} metalness={0.7} roughness={0.3} />
              </mesh>
            ))}
          </>
        )}
      </group>
    )
  }
  // tables: coffee_table, dining_table, desk, tv_console (fallback)
  const top = Math.min(h, 0.76)
  return (
    <group>
      <mesh position={[0, top-0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.05, d]} />
        <meshStandardMaterial map={woodTex} color={look.wood} roughness={0.55} />
      </mesh>
      {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sz],i)=>(
        <mesh key={i} position={[sx*(w/2-0.06), (top-0.05)/2, sz*(d/2-0.06)]} castShadow>
          <cylinderGeometry args={[0.026,0.022,top-0.05,12]} />
          <meshStandardMaterial color={secondary} roughness={0.65} />
        </mesh>
      ))}
      {a==='desk' && (
        <group position={[0,top,-d*0.25]}>
          <mesh position={[0,0.22,0]} castShadow>
            <boxGeometry args={[0.55,0.33,0.03]} />
            <meshStandardMaterial color="#141414" roughness={0.4} />
          </mesh>
          <mesh position={[0,0.04,0.02]}>
            <boxGeometry args={[0.18,0.08,0.12]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.5} />
          </mesh>
        </group>
      )}
    </group>
  )
}

// Archetype → model. Detailed PRD models for the living-room pieces, recoloured per style.
function FurnitureModel({ item, roomType }){
  const look = lookFor(item.style)
  switch(item.archetype){
    case 'sofa': return <Sofa position={[0,0,-0.04]} fabric={look.fabric} cushion={look.cushion} />
    case 'coffee_table': return <CoffeeTable position={[0,0,0]} wood={look.wood} />
    case 'rug': return <Rug position={[0,0,0]} tint={look.rug} />
    case 'tv_console': return <Console position={[0,0,0]} wood={look.wood} withTV />
    case 'lamp':
      return ['Japandi','Bohemian','Scandinavian'].includes(item.style)
        ? <RattanLamp position={[0,0,0]} wallGlow={false} />
        : <Furniture item={item} roomType={roomType} />
    default: return <Furniture item={item} roomType={roomType} />
  }
}
// Stadium-slab top for the coffee table (rounded ends r=0.30, PRD 4.3)
function useStadiumSlab(w, d, t){
  return useMemo(()=>{
    const r=d/2, hw=w/2-r
    const s=new THREE.Shape()
    s.moveTo(-hw,-r); s.lineTo(hw,-r); s.absarc(hw,0,r,-Math.PI/2,Math.PI/2,false)
    s.lineTo(-hw,r); s.absarc(-hw,0,r,Math.PI/2,Math.PI*1.5,false)
    const g=new THREE.ExtrudeGeometry(s,{depth:t,bevelEnabled:true,bevelThickness:0.008,bevelSize:0.008,bevelSegments:2,curveSegments:24})
    g.rotateX(-Math.PI/2); g.translate(0,t/2,0)
    return g
  },[w,d,t])
}

// Low modern sofa + chaise, linen, draped throw (PRD 4.2)
function Sofa({ position=[-0.25,0,-0.9], fabric='#D9CFBC', cushion='#D5CAB4' }){
  const linen = useMemo(()=>getFabricTex(fabric),[fabric])
  const linenLight = useMemo(()=>getFabricTex(cushion),[cushion])
  const throwTex = useMemo(()=>getFabricTex('#CFC2AA'),[])
  return (
    <group position={position}>
      {/* base + chaise seat, seat top 0.38 */}
      <mesh position={[0,0.23,0.12]} castShadow receiveShadow>
        <boxGeometry args={[2.30,0.30,1.21]} />
        <meshStandardMaterial map={linen} roughness={0.95} />
      </mesh>
      <mesh position={[0,0.395,0.12]} castShadow>
        <boxGeometry args={[2.26,0.05,1.17]} />
        <meshStandardMaterial map={linen} roughness={0.95} />
      </mesh>
      {/* backrest frame */}
      <mesh position={[0,0.50,-0.55]} castShadow>
        <boxGeometry args={[2.30,0.42,0.20]} />
        <meshStandardMaterial map={linen} roughness={0.95} />
      </mesh>
      {/* 2 back cushions, tilted back 10 deg, left overlaps right */}
      <mesh position={[-0.55,0.62,-0.42]} rotation={[-0.17,0,0.03]} castShadow>
        <boxGeometry args={[1.08,0.52,0.18]} />
        <meshStandardMaterial map={linenLight} roughness={0.95} />
      </mesh>
      <mesh position={[0.55,0.62,-0.42]} rotation={[-0.17,0,-0.02]} castShadow>
        <boxGeometry args={[1.02,0.52,0.18]} />
        <meshStandardMaterial map={linenLight} roughness={0.95} />
      </mesh>
      {/* arms */}
      {[-1.05,1.05].map((x,i)=>(
        <mesh key={i} position={[x,0.40,0.05]} castShadow receiveShadow>
          <boxGeometry args={[0.20,0.44,1.30]} />
          <meshStandardMaterial map={linen} roughness={0.95} />
        </mesh>
      ))}
      {/* 2 throw pillows leaning on back cushions, left half */}
      <mesh position={[-0.72,0.60,-0.30]} rotation={[-0.15,0.10,0.14]} castShadow>
        <boxGeometry args={[0.55,0.55,0.18]} />
        <meshStandardMaterial map={linen} roughness={0.95} />
      </mesh>
      <mesh position={[-0.18,0.58,-0.30]} rotation={[-0.18,-0.08,-0.08]} castShadow>
        <boxGeometry args={[0.55,0.55,0.18]} />
        <meshStandardMaterial map={linen} roughness={0.95} />
      </mesh>
      {/* throw blanket draped over left arm, hanging down the outer face */}
      <group position={[-1.05,0,-0.1]}>
        <mesh position={[0,0.63,0.1]} rotation={[0,0,0.02]} castShadow>
          <boxGeometry args={[0.26,0.05,0.85]} />
          <meshStandardMaterial map={throwTex} roughness={1.0} />
        </mesh>
        <mesh position={[-0.12,0.36,0.12]} rotation={[0,0,0.03]} castShadow>
          <boxGeometry args={[0.05,0.52,0.80]} />
          <meshStandardMaterial map={throwTex} roughness={1.0} />
        </mesh>
        <mesh position={[-0.11,0.10,0.30]} rotation={[0.06,0,0.02]} castShadow>
          <boxGeometry args={[0.07,0.10,0.45]} />
          <meshStandardMaterial map={throwTex} roughness={1.0} />
        </mesh>
      </group>
      {/* recessed dark legs, shadow gap */}
      {[[-1.03,-0.5],[1.03,-0.5],[-1.03,0.6],[1.03,0.6]].map(([x,z],i)=>(
        <mesh key={i} position={[x,0.035,z]}>
          <cylinderGeometry args={[0.025,0.02,0.07,10]} />
          <meshStandardMaterial color="#3A2D1F" roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

// Coffee table + styling: bowl with pampas, cup, book stack (PRD 4.3)
const _oakLongCache = {}
function CoffeeTable({ position=[-0.15,0,0.55], wood='#FFFFFF' }){
  const oak = useMemo(()=>getWoodTex(),[])
  // grain along the longest axis: rotate the oak texture for the extruded slab UVs
  const oakLong = useMemo(()=>{
    if(_oakLongCache.t) return _oakLongCache.t
    const t=getWoodTex().clone(); t.needsUpdate=true
    t.center.set(0.5,0.5); t.rotation=Math.PI/2; _oakLongCache.t=t; return t
  },[])
  const slab = useStadiumSlab(1.20, 0.60, 0.030)
  return (
    <group position={position}>
      <mesh geometry={slab} position={[0,0.33,0]} castShadow receiveShadow>
        <meshStandardMaterial map={oakLong} color={wood} roughness={0.55} />
      </mesh>
      {[[-0.52,-0.21],[0.52,-0.21],[-0.52,0.21],[0.52,0.21]].map(([x,z],i)=>(
        <mesh key={i} position={[x,0.165,z]} castShadow>
          <cylinderGeometry args={[0.023,0.023,0.33,12]} />
          <meshStandardMaterial map={oak} color={wood} roughness={0.55} />
        </mesh>
      ))}
      {/* ceramic bowl + 3 dried pampas stems, left third */}
      <group position={[-0.35,0.36,0]}>
        <mesh position={[0,0.055,0]} castShadow>
          <cylinderGeometry args={[0.11,0.07,0.11,20]} />
          <meshStandardMaterial color="#CFC6B8" roughness={0.85} />
        </mesh>
        {[[-0.04,0,0.02,0.30],[0.03,0.01,-0.02,0.36],[0,0.02,0.05,0.33],[-0.01,0.03,-0.04,0.27]].map(([x,y,z,hh],i)=>(
          <group key={i} position={[x,0.10+y,z]} rotation={[0.18*(i-1.5),0,0.20*(i-1.5)]}>
            <mesh position={[0,hh/2,0]}>
              <cylinderGeometry args={[0.0025,0.0025,hh,6]} />
              <meshStandardMaterial color="#B99B62" roughness={0.9} />
            </mesh>
            <mesh position={[0,hh+0.06,0]}>
              <coneGeometry args={[0.011,0.17,8]} />
              <meshStandardMaterial color="#D6BE96" roughness={1.0} />
            </mesh>
            {/* no shadow: keeps the tabletop clean like the reference */}
          </group>
        ))}
      </group>
      {/* cup, center */}
      <mesh position={[0.02,0.405,0.05]} castShadow>
        <cylinderGeometry args={[0.04,0.035,0.09,16]} />
        <meshStandardMaterial color="#B9AC97" roughness={0.8} />
      </mesh>
      {/* 2-book stack, right third, 4 deg rotation between books */}
      <group position={[0.36,0.36,-0.02]}>
        <mesh position={[0,0.018,0]} rotation={[0,0.05,0]} castShadow>
          <boxGeometry args={[0.28,0.035,0.20]} />
          <meshStandardMaterial color="#D9CDB4" roughness={0.9} />
        </mesh>
        <mesh position={[0,0.053,0]} rotation={[0,-0.02,0]} castShadow>
          <boxGeometry args={[0.26,0.035,0.19]} />
          <meshStandardMaterial color="#C0B190" roughness={0.9} />
        </mesh>
      </group>
    </group>
  )
}

// Flatweave jute rug with fringe on short ends (PRD 4.4)
function Rug({ position=[-0.15,0,0.30], tint='#FFFFFF' }){
  const rugTex = useMemo(()=>getRugTex(),[])
  const fringe = useMemo(()=>{
    const arr=[]
    for(let i=0;i<26;i++){ arr.push(-1.2+(i/25)*2.4) }
    return arr
  },[])
  return (
    <group position={position}>
      <mesh position={[0,0.008,0]} rotation={[-Math.PI/2,0,0]} receiveShadow>
        <planeGeometry args={[2.60,1.90]} />
        <meshStandardMaterial map={rugTex} color={tint} roughness={1.0} />
      </mesh>
      {fringe.map((x,i)=>(
        <group key={i} position={[x,0.006,0]}>
          <mesh position={[0,0,0.98]}>
            <boxGeometry args={[0.025,0.008,0.09]} />
            <meshStandardMaterial color="#C9BCA2" roughness={1.0} />
          </mesh>
          <mesh position={[0,0,-0.98]}>
            <boxGeometry args={[0.025,0.008,0.09]} />
            <meshStandardMaterial color="#C9BCA2" roughness={1.0} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// TV console + decor: vase with eucalyptus, dish, book stacks (PRD 4.5)
function Console({ position=[0.95,0,-2.26], wood='#FFFFFF', withTV=false }){
  const oak = useMemo(()=>getWoodTex(),[])
  return (
    <group position={position}>
      <mesh position={[0,0.33,0]} castShadow receiveShadow>
        <boxGeometry args={[1.80,0.42,0.42]} />
        <meshStandardMaterial map={oak} color={wood} roughness={0.55} />
      </mesh>
      {/* standing TV on a foot (design mode); the showcase uses a wall-mounted TV */}
      {withTV && (
        <group position={[0.3,0.54,-0.06]}>
          <mesh position={[0,0.015,0]}>
            <boxGeometry args={[0.36,0.03,0.2]} />
            <meshStandardMaterial color="#1E1E1E" roughness={0.5} />
          </mesh>
          <mesh position={[0,0.08,0]}>
            <boxGeometry args={[0.06,0.12,0.04]} />
            <meshStandardMaterial color="#1E1E1E" roughness={0.5} />
          </mesh>
          <mesh position={[0,0.5,0]} castShadow>
            <boxGeometry args={[1.25,0.72,0.04]} />
            <meshStandardMaterial color="#141414" roughness={0.4} />
          </mesh>
          <mesh position={[0,0.5,0.021]}>
            <planeGeometry args={[1.21,0.68]} />
            <meshStandardMaterial color="#0B0B0D" roughness={0.35} />
          </mesh>
        </group>
      )}
      {/* 2 door shadow gaps */}
      <mesh position={[0,0.33,0.212]}>
        <boxGeometry args={[0.008,0.36,0.005]} />
        <meshStandardMaterial color="#4A3320" roughness={0.8} />
      </mesh>
      <mesh position={[-0.60,0.33,0.213]}>
        <boxGeometry args={[0.55,0.005,0.005]} />
        <meshStandardMaterial color="#4A3320" roughness={0.8} />
      </mesh>
      <mesh position={[0.60,0.33,0.213]}>
        <boxGeometry args={[0.55,0.005,0.005]} />
        <meshStandardMaterial color="#4A3320" roughness={0.8} />
      </mesh>
      {/* 4 legs */}
      {[[-0.82,-0.15],[0.82,-0.15],[-0.82,0.15],[0.82,0.15]].map(([x,z],i)=>(
        <mesh key={i} position={[x,0.075,z]} castShadow>
          <cylinderGeometry args={[0.025,0.02,0.15,10]} />
          <meshStandardMaterial map={oak} roughness={0.55} />
        </mesh>
      ))}
      {/* vase + dried eucalyptus spray, left end */}
      <group position={[-0.60,0.54,0]}>
        <mesh position={[0,0.16,0]} castShadow>
          <cylinderGeometry args={[0.085,0.10,0.32,18]} />
          <meshStandardMaterial color="#B9AE99" roughness={0.85} />
        </mesh>
        {[-0.4,-0.15,0.1,0.35,0.55].map((a,i)=>(
          <group key={i} position={[0,0.32,0]} rotation={[0.35,0,a]}>
            <mesh position={[0,0.26,0]}>
              <cylinderGeometry args={[0.004,0.004,0.55,6]} />
              <meshStandardMaterial color="#6B5B45" roughness={0.9} />
            </mesh>
            {[0.16,0.30,0.44].map((t,j)=>(
              <mesh key={j} position={[(j%2?0.030:-0.030),t,0]} rotation={[0,0,(j%2?-0.6:0.6)]} scale={[1,1.8,0.5]}>
                <sphereGeometry args={[0.018,8,6]} />
                <meshStandardMaterial color={j%2?'#7C8870':'#6B7050'} roughness={0.9} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {/* stone dish, center (the standing TV takes its place) */}
      {!withTV && (
        <mesh position={[0.0,0.565,0]} castShadow>
          <cylinderGeometry args={[0.12,0.09,0.05,20]} />
          <meshStandardMaterial color="#A89A83" roughness={0.8} />
        </mesh>
      )}
      {/* 2 book stacks, right half */}
      {(withTV ? [] : [0.38,0.66]).map((x,i)=>(
        <group key={i} position={[x,0.54,0]}>
          <mesh position={[0,0.018,0]} rotation={[0,0.06*(i?1:-1),0]} castShadow>
            <boxGeometry args={[0.25,0.035,0.18]} />
            <meshStandardMaterial color="#D9CDB4" roughness={0.9} />
          </mesh>
          <mesh position={[0,0.053,0]} rotation={[0,-0.05*(i?1:-1),0]} castShadow>
            <boxGeometry args={[0.23,0.035,0.17]} />
            <meshStandardMaterial color="#CFC0A8" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// Wall-mounted TV, near-black screen with faint top sheen (PRD 4.5)
function TV(){
  return (
    <group position={[0.95,1.41,-2.47]}>
      <mesh castShadow>
        <boxGeometry args={[1.25,0.72,0.04]} />
        <meshStandardMaterial color="#141414" roughness={0.4} />
      </mesh>
      <mesh position={[0,0,0.021]}>
        <planeGeometry args={[1.21,0.68]} />
        {/* roughness 0.35 (vs 0.25 spec) kills the lamp specular hotspot so the screen reads off-black */}
        <meshStandardMaterial color="#0B0B0D" roughness={0.35} metalness={0} />
      </mesh>
      <mesh position={[0,0.30,0.022]} rotation={[-0.25,0,0]}>
        <planeGeometry args={[1.0,0.06]} />
        <meshStandardMaterial color="#FFFFFF" transparent opacity={0.05} roughness={0.2} depthWrite={false} />
      </mesh>
    </group>
  )
}

// Rattan tripod floor lamp with warm bulb (PRD 4.6)
function RattanLamp({ position=[1.85,0,-1.60], wallGlow=true }){
  const rattan = useMemo(()=>getRattanTex(),[])
  return (
    <group position={position}>
      {/* tripod legs + rung ring */}
      {[0,1,2].map((i)=>{
        const a=(i/3)*Math.PI*2+0.5
        return (
          <mesh key={i} position={[Math.cos(a)*0.11,0.675,Math.sin(a)*0.11]} rotation={[Math.sin(a)*0.19,0,-Math.cos(a)*0.19]} castShadow>
            <cylinderGeometry args={[0.018,0.022,1.35,10]} />
            <meshStandardMaterial color="#C49A67" roughness={0.6} />
          </mesh>
        )
      })}
      {/* hub under the shade: legs meet here, never crossing the shade */}
      <mesh position={[0,1.37,0]} castShadow>
        <cylinderGeometry args={[0.05,0.05,0.06,12]} />
        <meshStandardMaterial color="#8A6A45" roughness={0.6} />
      </mesh>
      <mesh position={[0,0.5,0]} rotation={[Math.PI/2,0,0]}>
        <torusGeometry args={[0.13,0.012,8,24]} />
        <meshStandardMaterial color="#C49A67" roughness={0.6} />
      </mesh>
      {/* woven dome shade, bulb glow shows through weave */}
      <mesh position={[0,1.62,0]} castShadow>
        <cylinderGeometry args={[0.20,0.30,0.45,24,1,true]} />
        <meshStandardMaterial map={rattan} color="#D29A5B" emissive="#FFC873" emissiveIntensity={2.0}
          roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0,1.845,0]} rotation={[-Math.PI/2,0,0]}>
        <circleGeometry args={[0.20,24]} />
        <meshStandardMaterial color="#6B4A26" roughness={0.9} />
      </mesh>
      <mesh position={[0,1.58,0]}>
        <sphereGeometry args={[0.035,12,10]} />
        <meshStandardMaterial color="#FFF2CC" emissive="#FFC873" emissiveIntensity={4} />
      </mesh>
      {/* intensity 2.5 (vs 8 spec): physical decay=2 already gives a hot wall pool; higher values blow out the TV screen */}
      <pointLight position={[0,1.55,0]} intensity={2.5} distance={1.6} decay={2} color="#FFB45E" />
      {/* warm pool on the wall behind (showcase only — depends on the wall position) */}
      {wallGlow && (
        <mesh position={[0.42,1.55,-0.35]} rotation={[0,-Math.PI/2,0]}>
          <planeGeometry args={[0.9,0.9]} />
          <meshStandardMaterial color="#FFD9A0" transparent opacity={0.18} roughness={1} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

// Framed line-art print above the sofa (PRD 4.7)
function WallArt({ position=[-0.9,1.75,-2.48] }){
  const artTex = useMemo(()=>getArtTex(),[])
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[0.60,0.80,0.025]} />
        <meshStandardMaterial color="#1E1C19" roughness={0.5} />
      </mesh>
      <mesh position={[0,0,0.014]}>
        <planeGeometry args={[0.55,0.75]} />
        <meshStandardMaterial color="#F1EAE0" roughness={0.9} />
      </mesh>
      <mesh position={[0,0,0.016]}>
        <planeGeometry args={[0.47,0.67]} />
        <meshStandardMaterial map={artTex} roughness={0.9} />
      </mesh>
      <mesh position={[0,0.1,0.018]} rotation={[-0.35,0.15,0]}>
        <planeGeometry args={[0.40,0.10]} />
        <meshStandardMaterial color="#FFFFFF" transparent opacity={0.07} roughness={0.1} depthWrite={false} />
      </mesh>
    </group>
  )
}

// Olive tree in concrete pot at the glass wall (PRD 4.8)
function OliveTree(){
  const leaves = useMemo(()=>{
    const R=rnd(99)
    const arr=[]
    for(let i=0;i<120;i++){
      const th=R()*Math.PI*2, ph=Math.acos(2*R()-1)
      const rx=0.42, ry=0.50, rz=0.42
      const x=rx*Math.sin(ph)*Math.cos(th), y=ry*Math.cos(ph), z=rz*Math.sin(ph)*Math.sin(th)
      const sun=Math.max(0,(-x/rx))*0.7+0.55 // sunlit rim on the left (window) edges
      arr.push({ pos:[x,1.35+y,z], rot:[R()*3,R()*3,R()*3], s:0.7+R()*0.7, sun })
    }
    return arr
  },[])
  return (
    <group position={[-1.5,0,0.5]}>
      <mesh position={[0,0.21,0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.19,0.16,0.42,20]} />
        <meshStandardMaterial color="#C4BBAE" roughness={0.9} />
      </mesh>
      <mesh position={[0,0.415,0]} rotation={[-Math.PI/2,0,0]}>
        <circleGeometry args={[0.17,20]} />
        <meshStandardMaterial color="#3B3129" roughness={1} />
      </mesh>
      <mesh position={[0,0.75,0]} rotation={[0,0,0.08]} castShadow>
        <cylinderGeometry args={[0.022,0.030,0.9,10]} />
        <meshStandardMaterial color="#5A4A3A" roughness={0.9} />
      </mesh>
      {leaves.map((lf,i)=>(
        <mesh key={i} position={lf.pos} rotation={lf.rot} scale={[lf.s,lf.s*1.6,lf.s*0.55]}>
          <sphereGeometry args={[0.026,8,6]} />
          <meshStandardMaterial color={new THREE.Color('#5C6B47').multiplyScalar(lf.sun)} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}


function SceneBackground({ blend }){
  const { scene, gl } = useThree()
  useEffect(()=>{
    if(blend){ scene.background = null; gl.setClearAlpha(0) }
    else { scene.background = new THREE.Color('#E7DDCB'); gl.setClearColor('#E7DDCB') }
  },[blend, scene, gl])
  return null
}

function ARShadowCatcher(){
  // invisible ground that only catches soft shadows so furniture sits in the real photo
  return (
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.01,0]} receiveShadow>
      <planeGeometry args={[7, 8]} />
      <shadowMaterial transparent opacity={0.32} />
    </mesh>
  )
}

// Frames the camera for the current mode / room size (and re-frames on change).
function CameraRig({ mode, dims, controlsRef }){
  const { camera } = useThree()
  useEffect(()=>{
    let pos, target
    if(mode==='showcase'){ pos=[0.1,1.35,4.05]; target=[0.1,0.85,-1.3] }
    else {
      const k = Math.max(dims.w/4, dims.l/5, 0.55)
      pos = [0.3*k, 2.5+0.6*k, dims.l/2+2.0*k]
      target = [0, 0.5, -dims.l*0.08]
    }
    camera.position.set(...pos)
    const c = controlsRef.current
    if(c){ c.target.set(...target); c.update() } else camera.lookAt(...target)
  },[mode, dims.w, dims.l, dims.h, camera, controlsRef])
  return null
}

function AdjustableItem({ item, roomType, selected, onSelect, onMove, onDragState, setControlsEnabled }){
  const ref = useRef(null)
  const [x, z] = item.pos || [0,0]
  const rot = item.rot || 0
  const s = item.scale || 1
  // Stretch the model to the real product's footprint (e.g. a 118×78 cm table).
  const base = scaleForRoom(item.archetype, roomType)
  const real = itemDims(item, roomType)
  const sx = s * real.w / base.w, sz = s * real.d / base.d
  const inner = <FurnitureModel item={item} roomType={roomType} />
  const handleClick = (e)=>{ e.stopPropagation(); onSelect(item.id) }
  // Body-drag: grab the furniture itself (touch-friendly) and slide it on the
  // floor plane. The camera is locked SYNCHRONOUSLY on pointerdown — React
  // state flushes too late and OrbitControls would otherwise rotate the whole
  // layout on the first pointermove.
  const grabRef = useRef(null)
  const [dragPos, setDragPos] = useState(null)
  const floorPlane = useMemo(()=> new THREE.Plane(new THREE.Vector3(0,1,0), 0), [])
  const hitPt = useMemo(()=> new THREE.Vector3(), [])
  const lockCamera = (enabled)=>{
    if(setControlsEnabled) setControlsEnabled(enabled)
    if(onDragState) onDragState(!enabled)
  }
  const beginBodyDrag = (e)=>{
    if(e.pointerType==='mouse' && e.nativeEvent.button!==undefined && e.nativeEvent.button!==0) return
    e.stopPropagation()
    onSelect(item.id)
    lockCamera(false)
    try{ e.target.setPointerCapture(e.pointerId) }catch{}
    if(e.ray.intersectPlane(floorPlane, hitPt)) grabRef.current = { gx: hitPt.x, gz: hitPt.z, bx: x, bz: z }
    else grabRef.current = { gx: x, gz: z, bx: x, bz: z, fixed:true }
  }
  const moveBodyDrag = (e)=>{
    const g = grabRef.current
    if(!g || g.fixed) return
    e.stopPropagation()
    if(e.ray.intersectPlane(floorPlane, hitPt)) setDragPos([g.bx + (hitPt.x - g.gx), g.bz + (hitPt.z - g.gz)])
  }
  const endBodyDrag = (e)=>{
    const g = grabRef.current
    if(!g) return
    e.stopPropagation()
    grabRef.current = null
    let nx = dragPos ? dragPos[0] : x
    let nz = dragPos ? dragPos[1] : z
    if(!g.fixed && e.ray.intersectPlane(floorPlane, hitPt)){
      nx = g.bx + (hitPt.x - g.gx)
      nz = g.bz + (hitPt.z - g.gz)
    }
    setDragPos(null)
    lockCamera(true)
    if(Math.abs(nx-x) > 0.001 || Math.abs(nz-z) > 0.001){
      onMove(item.id, { pos: [Number(nx.toFixed(2)), Number(nz.toFixed(2))] })
    }
  }
  const px = dragPos ? dragPos[0] : x
  const pz = dragPos ? dragPos[1] : z
  const body = (
    <group ref={ref} position={[px,0,pz]} rotation={[0,rot,0]} scale={[sx,s,sz]}
      onClick={handleClick}
      onPointerDown={beginBodyDrag}
      onPointerMove={moveBodyDrag}
      onPointerUp={endBodyDrag}
    >
      {inner}
    </group>
  )
  if(!selected) return body
  return (
    <PivotControls
      anchor={[0,0,0]}
      activeAxes={[true,false,true]}
      disableRotations
      disableSliders
      scale={0.85}
      lineWidth={2.5}
      onDragStart={()=> onDragState && onDragState(true)}
      onDragEnd={()=>{
        if(onDragState) onDragState(false)
        if(ref.current){
          const p = new THREE.Vector3()
          ref.current.getWorldPosition(p)
          onMove(item.id, { pos: [Number(p.x.toFixed(2)), Number(p.z.toFixed(2))] })
        }
      }}
    >
      {body}
    </PivotControls>
  )
}

function SceneContent({ mode, dims, items, roomType, style, blend, selectedId, onSelect, onMoveItem, showLabels, locale, controlsHandle }){
  const [dragging, setDragging] = useState(false)
  // Direct handle to OrbitControls for a SYNCHRONOUS camera lock during drags.
  const controlsRef = useRef(null)
  useEffect(()=>{ if(controlsHandle) controlsHandle.current = controlsRef.current })
  const setControlsEnabled = (v)=>{ if(controlsRef.current) controlsRef.current.enabled = v }
  const span = Math.max(dims.w, dims.l)
  return (
    <>
      <SceneBackground blend={blend} />
      {/* daylight key from the left, warm; hemisphere fill (PRD 5) */}
      <ambientLight intensity={0.20} color="#FFF4E2" />
      <hemisphereLight args={["#FFF8E6", "#6B5D4A", 0.6]} />
      <directionalLight position={[-2.8,3.6,2.2]} intensity={2.4} color="#FFF1DC" castShadow
        shadow-mapSize={[2048,2048]} shadow-bias={-0.0004} shadow-normalBias={0.03} target-position={[0.6,0,-1.2]}>
        <orthographicCamera attach="shadow-camera" args={[-5,5,5,-5,0.5,14]} />
      </directionalLight>
      <pointLight position={[1.95,1.6,-1.5]} intensity={0.5} color="#DCE8FF" distance={3.5} decay={2} />

      {mode==='showcase' ? (
        <>
          <Floor /><RoomShell />
          <Sofa /><Rug /><CoffeeTable /><Console /><TV /><RattanLamp /><WallArt /><OliveTree />
        </>
      ) : (
        <>
          {blend ? <ARShadowCatcher /> : <SizedRoomShell dims={dims} style={style} />}
          {items.map(it=>{
            const { h } = scaleForRoom(it.archetype, roomType)
            const selected = selectedId===it.id
            return (
              <group key={it.id}>
                <AdjustableItem item={it} roomType={roomType} selected={selected} onSelect={onSelect} onMove={onMoveItem} onDragState={setDragging} setControlsEnabled={setControlsEnabled} />
                {(selected || showLabels) && <ShoppableHotspot item={it} h={h*(it.scale||1)} pos={it.pos} full={selected} locale={locale} />}
              </group>
            )
          })}
        </>
      )}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={!dragging}
        enableRotate enableZoom={TOUCH} enablePan
        minDistance={1.2} maxDistance={Math.max(11, span*2.6)}
        maxPolarAngle={Math.PI/2.05}
        enableDamping dampingFactor={0.07}
      />
      <CameraRig mode={mode} dims={dims} controlsRef={controlsRef} />
      <ContactShadows position={[0,0.015,0]} opacity={0.45} scale={Math.max(9, span*2)} blur={2.4} far={4.0} resolution={512} color="#2A2018" />
      {/* procedural IBL only (no network fetch): bright window card left, soft top fill */}
      <Environment resolution={256} frames={1} background={false}>
        <Lightformer intensity={3.2} position={[-3,2.2,0.5]} rotation={[0,Math.PI/2,0]} scale={[5,3,1]} color="#FFF4E0" />
        <Lightformer intensity={0.7} position={[0,4,2]} rotation={[Math.PI/2,0,0]} scale={[6,3,1]} color="#FFF8EC" />
        <Lightformer intensity={0.5} position={[3,1.5,0]} rotation={[0,-Math.PI/2,0]} scale={[4,2,1]} color="#E8ECF2" />
      </Environment>
      {!blend && <fog attach="fog" args={["#E7DDCB", 11, 24]} />}
    </>
  )
}

// Touch screens have no Ctrl + scroll: pinch zooms there (two fingers), the page scrolls outside the viewer.
const TOUCH = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

const ICONS = {
  left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6', up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6',
  rotL: 'M4 5v5h5M5.5 15a7 7 0 1 0 1.2-7.8L4 10', rotR: 'M20 5v5h-5M18.5 15a7 7 0 1 1-1.2-7.8L20 10',
  minus: 'M5 12h14', plus: 'M12 5v14M5 12h14', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3', check: 'm5 12.5 4.5 4.5L19 7.5',
}
const Ico = ({ d }) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>

export default function RoomScene({ roomGraph, captureUrl, selectedId=null, onSelect, onMoveItem, onRemoveItem, locale='en' }){
  const t = (en, id) => locale==='id' ? id : en
  const mode = roomGraph ? 'design' : 'showcase'
  const dims = roomGraph?.room?.dimensions || {w:4,l:5,h:2.8}
  const roomType = roomGraph?.room?.type || 'living'
  const style = roomGraph?.style?.name || 'Japandi'
  const items = roomGraph?.layout?.placedItems || []
  const [showLabels, setShowLabels] = useState(false)
  const [blend, setBlend] = useState(false)
  // Plain scroll scrolls the page; Ctrl/⌘ + scroll (or trackpad pinch, which sends ctrlKey) zooms the 3D.
  const containerRef = useRef(null)
  const controlsHandle = useRef(null)
  const [zoomHint, setZoomHint] = useState(false)
  const hintTimer = useRef(null)
  useEffect(()=>{
    const el = containerRef.current
    if(!el) return
    const onWheel = (e)=>{
      const zoom = e.ctrlKey || e.metaKey
      if(controlsHandle.current) controlsHandle.current.enableZoom = zoom
      if(!zoom){ setZoomHint(true); clearTimeout(hintTimer.current); hintTimer.current = setTimeout(()=>setZoomHint(false), 1400) }
    }
    el.addEventListener('wheel', onWheel, { capture: true, passive: true })
    return ()=>{ el.removeEventListener('wheel', onWheel, { capture: true }); clearTimeout(hintTimer.current) }
  },[])
  const select = onSelect || (()=>{})
  const sel = items.find(it=>it.id===selectedId) || null
  useEffect(()=>{ if(!captureUrl) setBlend(false) },[captureUrl])
  // ?still=1 → fullscreen clean frame (no overlays) for screenshots
  const still = typeof window!=='undefined' && /[?&]still=/.test(window.location.search)

  const move = (patch)=>{ if(sel && onMoveItem) onMoveItem(sel.id, patch) }
  const nudge = (dx,dz)=>{
    if(!sel) return
    const [x,z] = sel.pos||[0,0]
    move({ pos: clampPosToRoom([Number((x+dx).toFixed(2)), Number((z+dz).toFixed(2))], dims) })
  }
  const rotateBy = (da)=> sel && move({ rot: Number(((sel.rot||0)+da).toFixed(3)) })
  const scaleBy = (ds)=> sel && move({ scale: Math.max(0.7, Math.min(1.5, Number(((sel.scale||1)+ds).toFixed(2)))) })

  // Screenshot provider for exports (photo composited under the 3D in "My photo" mode).
  const glRef = useRef(null)
  const stateRef = useRef({})
  stateRef.current = { blend, captureUrl }
  useEffect(()=>{
    setSnapshotProvider(async ()=>{
      const gl = glRef.current
      if(!gl) return null
      const src = gl.domElement
      const { blend: b, captureUrl: url } = stateRef.current
      if(!(b && url)) return src.toDataURL('image/png')
      const img = await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url })
      const out = document.createElement('canvas'); out.width = src.width; out.height = src.height
      const ctx = out.getContext('2d')
      const sc = Math.max(out.width/img.width, out.height/img.height)
      ctx.drawImage(img, (out.width-img.width*sc)/2, (out.height-img.height*sc)/2, img.width*sc, img.height*sc)
      ctx.drawImage(src, 0, 0)
      return out.toDataURL('image/png')
    })
    return ()=> setSnapshotProvider(null)
  },[])

  const blendBg = blend && captureUrl ? { backgroundImage: `url("${captureUrl}")`, backgroundSize:'cover', backgroundPosition:'center' } : {}

  return (
    <div ref={containerRef} className="canvas-3d" style={still
      ? {position:'fixed', inset:0, zIndex:9999, background:'#E7DDCB', overflow:'hidden', width:'100vw', height:'100vh'}
      : {position:'absolute', inset:0, background:'#E7DDCB', overflow:'hidden', ...blendBg}}>
      {!still && mode==='design' && (
        <div className="viewer-overlay glass" style={{left:12, top:12, padding:3}}>
          <button className={`vbtn ${!blend?'active':''}`} onClick={()=>setBlend(false)}>{t('3D room','Ruang 3D')}</button>
          {captureUrl && <button className={`vbtn ${blend?'active':''}`} title={t('Stage the furniture over your photo','Tampilkan furnitur di atas fotomu')} onClick={()=>setBlend(true)}>{t('On my photo','Di fotoku')}</button>}
          <button className={`vbtn ${showLabels?'active':''}`} onClick={()=>setShowLabels(v=>!v)}>{t('Prices','Harga')}</button>
        </div>
      )}
      <Canvas
        shadows
        dpr={[1,1.75]}
        onPointerMissed={()=>select(null)}
        gl={{ antialias:true, alpha:true, preserveDrawingBuffer:true, powerPreference:'high-performance', outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure:1.0 }}
        camera={{ position: [0.1,1.35,4.05], fov: 40, near:0.1, far:60 }}
        onCreated={({ gl })=>{
          glRef.current = gl
          gl.shadowMap.enabled=true; gl.shadowMap.type=THREE.PCFSoftShadowMap
          if(typeof window!=='undefined') window.__roomsceneReady = true
        }}
        style={{ width:'100%', height:'100%', touchAction:'none' }}
      >
        <SceneContent key={`${mode}-${blend?'blend':'room'}`} mode={mode} dims={dims} items={items} roomType={roomType} style={style}
          blend={blend} selectedId={selectedId} onSelect={select} onMoveItem={onMoveItem || (()=>{})} showLabels={showLabels} locale={locale} controlsHandle={controlsHandle} />
      </Canvas>
      {!still && zoomHint && (
        <div className="center-fill" style={{pointerEvents:'none', background:'rgba(29,27,24,.22)', zIndex:7}}>
          <div className="glass" style={{padding:'10px 14px', fontSize:13, fontWeight:600, color:'#1d1b18'}}>
            {t('Hold Ctrl (⌘ on Mac) and scroll to zoom · or pinch on the trackpad','Tahan Ctrl (⌘ di Mac) lalu scroll untuk zoom · atau cubit di trackpad')}
          </div>
        </div>
      )}
      {!still && mode==='design' && !sel && (
        <div className="viewer-overlay glass" style={{left:12, bottom:12}}>
          <span className="vhint">{TOUCH
            ? t('Drag furniture to move · swipe to orbit · pinch to zoom','Seret furnitur untuk memindah · geser untuk memutar · cubit untuk zoom')
            : t('Drag furniture to move · drag empty space to orbit · Ctrl + scroll to zoom','Seret furnitur untuk memindah · seret area kosong untuk memutar · Ctrl + scroll untuk zoom')}</span>
        </div>
      )}
      {!still && sel && (
        <div className="viewer-overlay glass" style={{left:'50%', bottom:12, transform:'translateX(-50%)', padding:4, alignItems:'center', flexWrap:'nowrap', maxWidth:'calc(100% - 24px)', overflowX:'auto'}}>
          <span className="vhint" style={{fontWeight:650,maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sel.name}</span>
          <button className="vtool" title={t('Move left','Geser kiri')} aria-label={t('Move left','Geser kiri')} onClick={()=>nudge(-0.1,0)}><Ico d={ICONS.left} /></button>
          <button className="vtool" title={t('Move right','Geser kanan')} aria-label={t('Move right','Geser kanan')} onClick={()=>nudge(0.1,0)}><Ico d={ICONS.right} /></button>
          <button className="vtool" title={t('Move back','Geser ke belakang')} aria-label={t('Move back','Geser ke belakang')} onClick={()=>nudge(0,-0.1)}><Ico d={ICONS.up} /></button>
          <button className="vtool" title={t('Move forward','Geser ke depan')} aria-label={t('Move forward','Geser ke depan')} onClick={()=>nudge(0,0.1)}><Ico d={ICONS.down} /></button>
          <button className="vtool" title={t('Rotate left','Putar kiri')} aria-label={t('Rotate left','Putar kiri')} onClick={()=>rotateBy(Math.PI/12)}><Ico d={ICONS.rotL} /></button>
          <button className="vtool" title={t('Rotate right','Putar kanan')} aria-label={t('Rotate right','Putar kanan')} onClick={()=>rotateBy(-Math.PI/12)}><Ico d={ICONS.rotR} /></button>
          <button className="vtool" title={t('Smaller','Kecilkan')} aria-label={t('Smaller','Kecilkan')} onClick={()=>scaleBy(-0.05)}><Ico d={ICONS.minus} /></button>
          <button className="vtool" title={t('Bigger','Besarkan')} aria-label={t('Bigger','Besarkan')} onClick={()=>scaleBy(0.05)}><Ico d={ICONS.plus} /></button>
          <button className="vtool" title={t('Remove','Hapus')} aria-label={t('Remove','Hapus')} onClick={()=>{ onRemoveItem && onRemoveItem(sel.id); select(null) }}><Ico d={ICONS.trash} /></button>
          <button className="vtool" style={{background:'#1d1b18',color:'#fff'}} title={t('Done','Selesai')} aria-label={t('Done','Selesai')} onClick={()=>select(null)}><Ico d={ICONS.check} /></button>
        </div>
      )}
    </div>
  )
}
