'use client';
/* oxlint-disable react/react-compiler -- This effect owns an external WebGL renderer and its lifecycle, without React Compiler. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- This labeled canvas container is a dynamic graphic, not an image URL. */
import { useEffect, useRef, useState } from 'react';
import { Box, RotateCcw, MousePointer2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { products, options, type Configuration } from '@/lib/domain';
export type ViewMode = 'complete' | 'structure' | 'exploded';
export function ModuleViewer({
  configuration,
  mode = 'complete',
  assetUrl,
  onSelect,
  compact = false,
}: {
  configuration: Configuration;
  mode?: ViewMode;
  assetUrl?: string;
  onSelect?: (part: string) => void;
  compact?: boolean;
}) {
  const mount = useRef<HTMLDivElement>(null),
    reset = useRef<() => void>(() => {}),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false,
      cleanup = () => {};
    setReady(false);
    setError('');
    async function init() {
      const THREE = await import('three');
      const { OrbitControls } =
        await import('three/addons/controls/OrbitControls.js');
      if (disposed || !mount.current) return;
      const host = mount.current,
        scene = new THREE.Scene();
      scene.background = new THREE.Color('#eef1e8');
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      host.appendChild(renderer.domElement);
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
      const controls = new OrbitControls(camera, renderer.domElement);
      // Release resources even if an asynchronous asset load fails or is cancelled.
      const disposeScene = () => {
        scene.traverse(o => {
          if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
            o.geometry.dispose();
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            materials.forEach(material => { for(const value of Object.values(material)) if(value instanceof THREE.Texture) value.dispose(); material.dispose(); });
          }
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
      cleanup = () => { controls.dispose(); disposeScene(); };
      controls.enableDamping = true;
      controls.dampingFactor = 0.09;
      controls.maxPolarAngle = Math.PI * 0.47;
      controls.minDistance = 4;
      controls.maxDistance = 140;
      scene.add(new THREE.HemisphereLight('#ffffff', '#82917d', 2.7));
      const sun = new THREE.DirectionalLight('#fff5df', 3.5);
      sun.position.set(12, 24, 10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, {
        left: -35,
        right: 35,
        top: 35,
        bottom: -35,
        near: 0.5,
        far: 90,
      });
      sun.shadow.bias = -0.0004;
      scene.add(sun);
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(180, 180),
        new THREE.MeshStandardMaterial({ color: '#e9eee2', roughness: 1 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.08;
      ground.receiveShadow = true;
      scene.add(ground);
      const grid = new THREE.GridHelper(120, 80, '#c3ceba', '#dce3d3');
      grid.position.y = -0.065;
      scene.add(grid);
      const assembly = new THREE.Group();
      scene.add(assembly);
      const pickable: import('three').Object3D[] = [];
      const palette = {
        structure: '#555f57',
        floor: '#c9bba3',
        walls:
          options.finish.find((o) => o.id === configuration.finish)?.color ||
          '#e6e4d9',
        roof: '#485448',
        glass: '#a8c4c0',
        frame: '#43524b',
      };
      function block(
        w: number,
        h: number,
        d: number,
        x: number,
        y: number,
        z: number,
        color: string,
        part: string,
        parent: import('three').Object3D,
        metal = false,
      ) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({
            color,
            roughness: metal ? 0.45 : 0.78,
            metalness: metal ? 0.35 : 0,
          }),
        );
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.part = part;
        parent.add(mesh);
        pickable.push(mesh);
        return mesh;
      }
      if (assetUrl) {
        const { GLTFLoader } =
          await import('three/addons/loaders/GLTFLoader.js');
        const gltf = await new GLTFLoader().loadAsync(assetUrl);
        if (disposed) {
          gltf.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.geometry.dispose();
              const mats = Array.isArray(o.material)
                ? o.material
                : [o.material];
              mats.forEach((m) => m.dispose());
            }
          });
          return;
        }
        const bounds = new THREE.Box3().setFromObject(gltf.scene),
          size = bounds.getSize(new THREE.Vector3()),
          center = bounds.getCenter(new THREE.Vector3());
        const scale = 12 / Math.max(size.x, size.y, size.z, 0.001);
        gltf.scene.scale.setScalar(scale);
        gltf.scene.position.set(
          -center.x * scale,
          -bounds.min.y * scale,
          -center.z * scale,
        );
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.userData.part = o.name || 'Elemento GLB';
            pickable.push(o);
          }
        });
        assembly.add(gltf.scene);
      } else {
        const product = products.find((p) => p.id === configuration.product)!;
        const length = product.length,
          count = configuration.quantity;
        for (let i = 0; i < count; i++) {
          const moduleGroup = new THREE.Group();
          const cols = Math.min(count, 4);
          const row = Math.floor(i / cols),
            col = i % cols;
          moduleGroup.position.set(
            (col - (Math.min(count, cols) - 1) / 2) * 3.16,
            0,
            (row - (Math.ceil(count / cols) - 1) / 2) * (length + 0.35),
          );
          if(configuration.layout === 'courtyard' && count >= 3) {
            const backCount = Math.max(1, Math.ceil(count / 4));
            if(i < backCount) {
              moduleGroup.rotation.y = Math.PI / 2;
              moduleGroup.position.set((i - (backCount - 1) / 2) * (length + .12), 0, 0);
            } else {
              const armIndex = i - backCount;
              const side = armIndex % 2 === 0 ? -1 : 1;
              moduleGroup.position.set(side * ((backCount * (length + .12)) / 2 + 1.57), 0, (length - 3) / 2 + Math.floor(armIndex / 2) * (length + .12));
            }
          }
          assembly.add(moduleGroup);
          const floorY = 0.3,
            roofY = mode === 'exploded' ? 5.1 : 3.14,
            wallLift = mode === 'exploded' ? 0.35 : 0;
          block(3, 0.22, length, 0, floorY, 0, palette.floor, 'Piso', moduleGroup);
          for (const x of [-1.44, 1.44])
            for (const z of [-length / 2 + 0.08, length / 2 - 0.08])
              block(
                0.11,
                2.85,
                0.11,
                x,
                1.72,
                z,
                palette.structure,
                'Estructura',
                moduleGroup,
                true,
              );
          for (const z of [-length / 2 + 0.07, length / 2 - 0.07]) {
            block(
              3,
              0.14,
              0.14,
              0,
              0.4,
              z,
              palette.structure,
              'Estructura',
              moduleGroup,
              true,
            );
            block(
              3,
              0.14,
              0.14,
              0,
              3.07,
              z,
              palette.structure,
              'Estructura',
              moduleGroup,
              true,
            );
          }
          for (const x of [-1.44, 1.44])
            block(
              0.11,
              0.15,
              length,
              x,
              3.07,
              0,
              palette.structure,
              'Estructura',
              moduleGroup,
              true,
            );
          if (mode !== 'structure') {
            block(
              3,
              2.66,
              0.11,
              0,
              1.76 + wallLift,
              -length / 2,
              palette.walls,
              'Envolvente',
              moduleGroup,
            );
            for (const x of [-1.5, 1.5]) {
              block(
                0.1,
                2.66,
                length,
                x,
                1.76 + wallLift,
                0,
                palette.walls,
                'Envolvente',
                moduleGroup,
              );
              for (let z = -length / 2 + 0.25; z < length / 2; z += 0.3)
                block(
                  0.018,
                  2.61,
                  0.014,
                  x + (x > 0 ? 0.058 : -0.058),
                  1.76 + wallLift,
                  z,
                  '#b7c0ad',
                  'Envolvente',
                  moduleGroup,
                );
            }
            block(
              3,
              0.14,
              length + 0.16,
              0,
              roofY,
              0,
              palette.roof,
              'Cubierta',
              moduleGroup,
              true,
            );
            for (let x = -1.4; x < 1.5; x += 0.22)
              block(
                0.025,
                0.024,
                length + 0.16,
                x,
                roofY + 0.08,
                0,
                '#657160',
                'Cubierta',
                moduleGroup,
              );
            const front = length / 2 + 0.03;
            block(
              3,
              0.35,
              0.13,
              0,
              2.94 + wallLift,
              front,
              palette.walls,
              'Envolvente',
              moduleGroup,
            );
            block(
              3,
              0.2,
              0.13,
              0,
              0.55 + wallLift,
              front,
              palette.walls,
              'Envolvente',
              moduleGroup,
            );
            for (const x of [-1.46, 0, 1.46])
              block(
                0.075,
                2.16,
                0.14,
                x,
                1.76 + wallLift,
                front,
                palette.frame,
                'Aberturas',
                moduleGroup,
                true,
              );
            for (const x of [-0.73, 0.73]) {
              const glass = block(
                1.36,
                2.16,
                0.045,
                x,
                1.76 + wallLift,
                front,
                palette.glass,
                'Aberturas',
                moduleGroup,
              );
              (
                glass.material as import('three').MeshStandardMaterial
              ).transparent = true;
              (glass.material as import('three').MeshStandardMaterial).opacity =
                configuration.glazing === 'dvh' ? 0.58 : 0.4;
              block(
                1.38,
                0.055,
                0.09,
                x,
                1.25 + wallLift,
                front + 0.025,
                palette.frame,
                'Aberturas',
                moduleGroup,
                true,
              );
            }
            // Fixed furnishings provide scale; they are illustrative and excluded from the quote.
            block(
              1.1,
              0.08,
              0.65,
              0,
              0.99,
              -0.65,
              '#ccb898',
              'Equipamiento ilustrativo',
              moduleGroup,
            );
            for (const x of [-0.45, 0.45])
              for (const z of [-0.91, -0.39])
                block(
                  0.045,
                  0.6,
                  0.045,
                  x,
                  0.67,
                  z,
                  palette.frame,
                  'Equipamiento ilustrativo',
                  moduleGroup,
                );
          }
        }
      }
      const bounds = new THREE.Box3().setFromObject(assembly),
        size = bounds.getSize(new THREE.Vector3()),
        center = bounds.getCenter(new THREE.Vector3());
      function fit() {
        const span = Math.max(size.x, size.z, size.y, 5);
        camera.position.set(
          center.x + span * 1.05,
          center.y + span * 0.9,
          center.z + span * 1.35,
        );
        controls.target.copy(center);
        controls.update();
      }
      reset.current = fit;
      fit();
      const resize = () => {
        const w = host.clientWidth,
          h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      let frame = 0;
      const render = () => {
        if (disposed) return;
        controls.update();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      render();
      let startX = 0,
        startY = 0;
      const down = (e: PointerEvent) => {
        startX = e.clientX;
        startY = e.clientY;
      };
      const up = (e: PointerEvent) => {
        if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 5)
          return;
        const rect = renderer.domElement.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(
          new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            (-(e.clientY - rect.top) / rect.height) * 2 + 1,
          ),
          camera,
        );
        const hit = ray.intersectObjects(pickable, false)[0];
        if (hit) onSelect?.(hit.object.userData.part || 'Elemento');
      };
      renderer.domElement.addEventListener('pointerdown', down);
      renderer.domElement.addEventListener('pointerup', up);
      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        renderer.domElement.removeEventListener('pointerdown', down);
        renderer.domElement.removeEventListener('pointerup', up);
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
            o.geometry.dispose();
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              for (const v of Object.values(m))
                if (v instanceof THREE.Texture) v.dispose();
              m.dispose();
            });
          }
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
      if (disposed) cleanup();
      else setReady(true);
    }
    init().catch(() => {
      if (!disposed) {
        setError(
          'No pudimos abrir esta vista 3D. Podés seguir trabajando con la ficha y los costos.',
        );
        setReady(false);
      }
      cleanup();
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [
    configuration.product,
    configuration.envelope,
    configuration.quantity,
    configuration.finish,
    configuration.glazing,
    configuration.layout,
    mode,
    assetUrl,
    onSelect,
  ]);
  return (
    <div className={`model-stage ${compact ? 'compact' : ''}`}>
      <div
        ref={mount}
        className="model-canvas"
        role="img"
        aria-label="Modelo 3D interactivo: arrastrá para orbitar y usá la rueda para acercar"
      />
      <div className="viewer-label">
        <Box size={13} />
        {assetUrl ? 'MODELO IMPORTADO' : 'MODELO CONCEPTUAL'}
        <span>3D</span>
      </div>
      {!ready && !error && (
        <div className="viewer-loading">
          <Box size={28} />
          <span>Preparando el modelo…</span>
        </div>
      )}
      {error && (
        <div className="viewer-loading error">
          <Box size={28} />
          <p>{error}</p>
        </div>
      )}
      <div className="viewer-bottom">
        <span>
          <MousePointer2 size={12} />
          Arrastrá para explorar · Clic para identificar
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Restablecer cámara"
          onClick={() => reset.current()}
        >
          <RotateCcw size={15} />
        </Button>
      </div>
    </div>
  );
}

