import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './AnimatedAvatar.css';

const MORPHS = ['jawOpen', 'mouthSmile', 'mouthPucker', 'mouthFunnel', 'blinkLeft', 'blinkRight'];
const SAPI_OPEN = { 0: 0, 1: .59, 2: .65, 3: .50, 4: .43, 5: .32, 6: .24, 7: .27, 8: .4, 9: .53, 10: .45, 11: .53, 12: .3, 13: .26, 14: .25, 15: .16, 16: .18, 17: .19, 18: .12, 19: .22, 20: .33, 21: 0 };
const POLLY = {
  sil: [0, 0, .04], p: [0, .015, .06], t: [.17, .015, .10],
  S: [.22, .09, .07], T: [.18, .015, .09], f: [.12, .015, .08],
  k: [.30, .015, .07], i: [.25, .015, .22], r: [.24, .16, .07],
  s: [.15, .015, .14], u: [.27, .42, .04], '@': [.43, .03, .07],
  a: [.62, .015, .07], e: [.36, .015, .21], E: [.47, .015, .18],
  o: [.40, .40, .05], O: [.50, .35, .05],
};

function speechShape(time, timeline, system, speaking) {
  if (!speaking) return { jaw: 0, round: 0, smile: .055 };
  let mark = null;
  for (const event of timeline || []) { if (Number(event.time) > time) break; mark = event; }
  if (!mark) return { jaw: 0, round: 0, smile: .055 };
  if (system === 'polly' || typeof mark.id === 'string' && !/^\d+$/.test(mark.id)) {
    const [jaw, round, smile] = POLLY[String(mark.id)] || [.22, .04, .07];
    return { jaw, round, smile };
  }
  const id = Number(mark.id);
  return { jaw: SAPI_OPEN[id] ?? .25, round: [3, 7, 8, 9, 10, 13].includes(id) ? .38 : .015, smile: [4, 6, 11].includes(id) ? .20 : .07 };
}

function disposeObject(object) {
  object.traverse(child => {
    child.geometry?.dispose();
    for (const material of Array.isArray(child.material) ? child.material : child.material ? [child.material] : []) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

export default function AnimatedAvatar({ audioRef, visemes = [], visemeSystem = 'polly', isSpeaking = false, phase = 'idle' }) {
  const hostRef = useRef(null), resetRef = useRef(null);
  const live = useRef({ audioRef, visemes, visemeSystem, isSpeaking });
  live.current = { audioRef, visemes, visemeSystem, isSpeaking };
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const host = hostRef.current;
    let renderer, controls, observer, scene, frameId, stopped = false, avatar, size;
    const morphMeshes = [], weights = Object.fromEntries(MORPHS.map(name => [name, 0]));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const clock = new THREE.Clock();
    let previous = 0, nextBlink = 3.7, blinkStart = -10;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.setClearColor(0x24272a, 0);
      renderer.domElement.setAttribute('aria-label', 'Interactive Lincoln avatar. Drag to rotate and scroll to zoom.');
      renderer.domElement.setAttribute('role', 'img');
      host.appendChild(renderer.domElement);
      scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(31, 1, .01, 300);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = .08;
      controls.enablePan = false; controls.rotateSpeed = .4;
      controls.minPolarAngle = .45; controls.maxPolarAngle = 2.35;
      scene.add(new THREE.HemisphereLight(0xffedda, 0x72818d, 1.1));
      scene.add(new THREE.AmbientLight(0xffffff, .12));
      /** @type {Array<[number, number, [number, number, number]]>} */
      const lighting = [[0xffe4c8, 3.0, [-5, 8, 9]], [0xc9e1f2, 1.0, [6, 3, 5]], [0xffe4bf, 2.1, [3, 6, -6]]];
      for (const [color, intensity, position] of lighting) {
        const light = new THREE.DirectionalLight(color, intensity); light.position.set(...position); scene.add(light);
      }
      function reset() {
        if (!size) return;
        const vfov = THREE.MathUtils.degToRad(camera.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
        const distance = Math.max(size.y / (2 * Math.tan(vfov / 2)), size.x / (2 * Math.tan(hfov / 2))) * 1.045 + size.z * .29;
        camera.position.set(.06, size.y * .03, distance); controls.target.set(0, 0, 0); controls.update();
      }
      resetRef.current = reset;
      function resize() {
        const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); reset();
      }
      observer = new ResizeObserver(resize); observer.observe(host); resize();
      new GLTFLoader().load('/assets/lincoln-talking.glb', gltf => {
        if (stopped) { disposeObject(gltf.scene); return; }
        const content = gltf.scene; content.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(content); size = bounds.getSize(new THREE.Vector3());
        content.position.sub(bounds.getCenter(new THREE.Vector3()));
        avatar = new THREE.Group(); avatar.add(content); scene.add(avatar);
        content.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.frustumCulled = false;
            if (object.morphTargetDictionary) morphMeshes.push(object);
          }
        });
        // Live audio owns facial weights; never autoplay the embedded clip.
        controls.minDistance = size.y * .72; controls.maxDistance = size.y * 3;
        reset(); setReady(true);
      }, undefined, () => { if (!stopped) setError('The 3D guide could not load. You can still continue the conversation.'); });
      function frame(now) {
        if (stopped) return;
        frameId = requestAnimationFrame(frame);
        if (document.hidden || now - previous < 30) return;
        const dt = Math.min(.1, (now - previous) / 1000 || .033); previous = now;
        const time = clock.getElapsedTime(), current = live.current;
        const shape = speechShape(current.audioRef?.current?.currentTime || 0, current.visemes, current.visemeSystem, current.isSpeaking);
        const blend = 1 - Math.exp(-dt * 22);
        weights.jawOpen += (Math.min(.65, shape.jaw) - weights.jawOpen) * blend;
        weights.mouthPucker += (shape.round - weights.mouthPucker) * blend;
        weights.mouthFunnel = weights.mouthPucker * .65;
        weights.mouthSmile += (shape.smile - weights.mouthSmile) * blend;
        if (time > nextBlink && !reducedMotion.matches) { blinkStart = time; nextBlink = time + 3.7 + Math.random() * 3.3; }
        const blinkTime = (time - blinkStart) / .2;
        const blink = !reducedMotion.matches && blinkTime >= 0 && blinkTime <= 1 ? .84 * Math.sin(blinkTime * Math.PI) ** 2 : 0;
        weights.blinkLeft = weights.blinkRight = blink;
        for (const mesh of morphMeshes) for (const name of MORPHS) {
          const index = mesh.morphTargetDictionary[name];
          if (index !== undefined) mesh.morphTargetInfluences[index] = weights[name];
        }
        if (avatar && !reducedMotion.matches) {
          avatar.rotation.y = Math.sin(time * .36) * .011;
          avatar.rotation.z = Math.sin(time * .53) * .003;
          avatar.rotation.x = current.isSpeaking ? Math.sin(time * 2.1) * .005 : 0;
        }
        controls.update(); renderer.render(scene, camera);
      }
      frameId = requestAnimationFrame(frame);
    } catch { setError('Your browser could not start the 3D view. You can still chat with Lincoln.'); }
    return () => {
      stopped = true; cancelAnimationFrame(frameId); observer?.disconnect(); controls?.dispose();
      if (scene) disposeObject(scene);
      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); resetRef.current = null;
    };
  }, []);
  const status = isSpeaking ? 'Speaking' : phase === 'listening' ? 'Listening' : ['thinking', 'transcribing', 'preparing-speech'].includes(phase) ? 'One moment…' : 'Ready to meet you';
  return <div className="live-lincoln" data-mode="3d" data-ready={ready}>
    <div className="live-lincoln__viewport" ref={hostRef} />
    {!ready && !error && <div className="live-lincoln__loading" role="status"><span />Preparing Lincoln…</div>}
    {error && <div className="live-lincoln__error" role="status">{error}</div>}
    <div className="live-lincoln__name"><span>LIFECAST GUIDE</span><strong>Lincoln</strong><small><i className={isSpeaking ? 'is-speaking' : ''} />{status}</small></div>
    {ready && <button className="live-lincoln__reset" onClick={() => resetRef.current?.()} aria-label="Reset avatar view">Reset view</button>}
    {ready && <span className="live-lincoln__hint">Drag to turn · Scroll to zoom</span>}
  </div>;
}
