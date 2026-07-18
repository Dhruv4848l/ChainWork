"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/*
  The bronze chain-link sculpture (the design's "Bronze and Time" WebGL centerpiece),
  rebuilt as a self-contained React Three Fiber scene. Two interlocking metallic
  torus "links" slowly orbit, with a warm forge glow and rising spark particles.

  Deliberately uses only lights (no external HDR/environment fetch) so it works
  offline and under a strict CSP. Spark count is halved on small screens.
*/

function ChainLinks() {
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += delta * 0.28;
    // Gentle scroll-driven tilt (the "orbit" responds to page scroll).
    const scroll = typeof window !== "undefined" ? window.scrollY : 0;
    g.rotation.x = -0.35 + scroll * 0.0012;
  });

  return (
    <group ref={group}>
      <mesh castShadow>
        <torusGeometry args={[1.15, 0.36, 40, 100]} />
        <meshStandardMaterial color="#D9A066" metalness={1} roughness={0.26} />
      </mesh>
      <mesh position={[1.15, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.15, 0.36, 40, 100]} />
        <meshStandardMaterial color="#C4813F" metalness={1} roughness={0.32} />
      </mesh>
    </group>
  );
}

function Sparks({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
      speeds[i] = 0.4 + Math.random() * 0.9;
    }
    return { positions, speeds };
  }, [count]);

  useFrame((_, delta) => {
    const pts = ref.current;
    if (!pts) return;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += speeds[i] * delta;
      if (arr[i * 3 + 1] > 3.2) arr[i * 3 + 1] = -3.2; // wrap to bottom
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#FFC46B"
        size={0.05}
        sizeAttenuation
        transparent
        opacity={0.85}
      />
    </points>
  );
}

export default function HeroScene() {
  const isMobile =
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const sparkCount = isMobile ? 60 : 140;

  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      {/* Forge lighting — warm bronze + amber glow, no external HDR. */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 5, 5]} intensity={2.2} color="#FFE6C0" />
      <pointLight position={[-4, -2, 2]} intensity={40} color="#D9A066" />
      <pointLight position={[3, 3, -3]} intensity={25} color="#FFC46B" />
      <group position={[isMobile ? 0 : 1.4, 0, 0]} scale={isMobile ? 0.85 : 1.1}>
        <ChainLinks />
      </group>
      <Sparks count={sparkCount} />
    </Canvas>
  );
}
