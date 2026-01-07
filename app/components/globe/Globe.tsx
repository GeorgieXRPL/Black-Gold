'use client';

/**
 * @fileoverview 3D Interactive Globe component using Three.js
 * Displays mine locations with real-time statistics
 */

import { useRef, useMemo, useState, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { MINES, Mine, MineStats, RESOURCE_COLORS, ResourceType } from '../../lib/mines';

interface GlobeProps {
  mineStats: Map<string, MineStats>;
  selectedMine: string | null;
  onMineSelect: (mineId: string) => void;
  userHomeMine: string | null;
}

interface MinePinProps {
  mine: Mine;
  stats: MineStats | undefined;
  isSelected: boolean;
  isHome: boolean;
  onClick: () => void;
}

/** Convert lat/lng to 3D coordinates on sphere */
function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/** Resource color as THREE.Color */
function getResourceColor(resource: ResourceType): THREE.Color {
  const colors = RESOURCE_COLORS[resource];
  return new THREE.Color(colors.glow);
}

/** Single mine pin on the globe */
function MinePin({ mine, stats, isSelected, isHome, onClick }: MinePinProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  
  const position = useMemo(() => latLngToVector3(mine.lat, mine.lng, 2.02), [mine.lat, mine.lng]);
  const color = useMemo(() => getResourceColor(mine.resource), [mine.resource]);
  
  // Pulse animation
  useFrame((state) => {
    if (meshRef.current) {
      const scale = isSelected || hovered 
        ? 1.5 + Math.sin(state.clock.elapsedTime * 3) * 0.2
        : 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      meshRef.current.scale.setScalar(scale);
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(isSelected || hovered ? 2.5 : 1.8);
    }
  });

  const minerCount = stats?.minerCount || 0;
  const pinSize = 0.03 + Math.min(minerCount / 50, 1) * 0.04;

  return (
    <group position={position}>
      {/* Glow effect */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[pinSize * 2, 16, 16]} />
        <meshBasicMaterial 
          color={color} 
          transparent 
          opacity={0.3}
        />
      </mesh>
      
      {/* Main pin */}
      <mesh 
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[pinSize, 16, 16]} />
        <meshStandardMaterial 
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 1 : 0.5}
        />
      </mesh>

      {/* Home indicator */}
      {isHome && (
        <mesh position={[0, pinSize * 3, 0]}>
          <coneGeometry args={[pinSize * 0.5, pinSize * 1.5, 8]} />
          <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.5} />
        </mesh>
      )}

      {/* Label on hover/select */}
      {(hovered || isSelected) && (
        <Html
          position={[0, pinSize * 4, 0]}
          center
          style={{
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-lg px-3 py-2 text-center">
            <div className="text-sm font-bold text-white">{mine.name}</div>
            <div className="text-xs text-coal-400">{mine.countryName}</div>
            {stats && (
              <div className="text-xs text-ember-400 mt-1">
                {stats.minerCount} miners • {(stats.hashrate / 1000).toFixed(1)} KH/s
              </div>
            )}
            {(stats?.activeRaidCount ?? 0) > 0 && (
              <div className="text-xs text-red-400 animate-pulse">
                ⚔️ Under Attack!
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Earth sphere with texture */
function Earth() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Create gradient material for earth look
  const earthMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1a1a2e'),
      roughness: 0.8,
      metalness: 0.2,
    });
  }, []);

  // Slow rotation
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.0005;
    }
  });

  return (
    <mesh ref={meshRef} material={earthMaterial}>
      <sphereGeometry args={[2, 64, 64]} />
    </mesh>
  );
}

/** Atmosphere glow effect */
function Atmosphere() {
  return (
    <mesh>
      <sphereGeometry args={[2.1, 64, 64]} />
      <meshBasicMaterial 
        color="#4a69bd"
        transparent
        opacity={0.1}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

/** Grid lines on globe */
function GlobeGrid() {
  // Create latitude lines as point arrays
  const latLines = useMemo(() => {
    const lines: [number, number, number][][] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: [number, number, number][] = [];
      for (let lng = 0; lng <= 360; lng += 10) {
        const v = latLngToVector3(lat, lng, 2.01);
        points.push([v.x, v.y, v.z]);
      }
      lines.push(points);
    }
    return lines;
  }, []);

  // Create longitude lines as point arrays
  const lngLines = useMemo(() => {
    const lines: [number, number, number][][] = [];
    for (let lng = 0; lng < 360; lng += 30) {
      const points: [number, number, number][] = [];
      for (let lat = -90; lat <= 90; lat += 10) {
        const v = latLngToVector3(lat, lng, 2.01);
        points.push([v.x, v.y, v.z]);
      }
      lines.push(points);
    }
    return lines;
  }, []);

  return (
    <group>
      {latLines.map((points, i) => (
        <Line
          key={`lat-${i}`}
          points={points}
          color="#333333"
          lineWidth={0.5}
          transparent
          opacity={0.3}
        />
      ))}
      {lngLines.map((points, i) => (
        <Line
          key={`lng-${i}`}
          points={points}
          color="#333333"
          lineWidth={0.5}
          transparent
          opacity={0.3}
        />
      ))}
    </group>
  );
}

/** Main globe scene */
function GlobeScene({ mineStats, selectedMine, onMineSelect, userHomeMine }: GlobeProps) {
  const { camera } = useThree();

  const handleMineClick = useCallback((mineId: string) => {
    onMineSelect(mineId);
  }, [onMineSelect]);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ff6b35" />
      
      <Stars 
        radius={100} 
        depth={50} 
        count={2000} 
        factor={4} 
        saturation={0} 
        fade 
        speed={0.5}
      />
      
      <Earth />
      <Atmosphere />
      <GlobeGrid />
      
      {MINES.map((mine) => (
        <MinePin
          key={mine.id}
          mine={mine}
          stats={mineStats.get(mine.id)}
          isSelected={selectedMine === mine.id}
          isHome={userHomeMine === mine.id}
          onClick={() => handleMineClick(mine.id)}
        />
      ))}
      
      <OrbitControls 
        enablePan={false}
        minDistance={3}
        maxDistance={8}
        rotateSpeed={0.5}
        zoomSpeed={0.5}
      />
    </>
  );
}

/** Loading fallback */
function GlobeLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-coal-950">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-ember-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <div className="text-coal-400">Loading Globe...</div>
      </div>
    </div>
  );
}

/** Main Globe component */
export default function Globe({ mineStats, selectedMine, onMineSelect, userHomeMine }: GlobeProps) {
  return (
    <div className="relative w-full h-full min-h-[500px]">
      <Suspense fallback={<GlobeLoader />}>
        <Canvas
          camera={{ position: [0, 0, 5], fov: 45 }}
          style={{ background: 'transparent' }}
        >
          <GlobeScene 
            mineStats={mineStats}
            selectedMine={selectedMine}
            onMineSelect={onMineSelect}
            userHomeMine={userHomeMine}
          />
        </Canvas>
      </Suspense>
      
      {/* Resource legend */}
      <div className="absolute bottom-4 left-4 bg-coal-900/80 backdrop-blur-sm border border-coal-700 rounded-lg p-3">
        <div className="text-xs text-coal-400 mb-2 font-semibold">RESOURCES</div>
        <div className="space-y-1">
          {(['coal', 'gold', 'oil', 'silver'] as ResourceType[]).map((resource) => (
            <div key={resource} className="flex items-center gap-2 text-xs">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: RESOURCE_COLORS[resource].glow }}
              />
              <span className="capitalize text-coal-300">{resource}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 right-4 text-xs text-coal-500">
        Drag to rotate • Scroll to zoom • Click mine to select
      </div>
    </div>
  );
}
