'use client';

/**
 * @fileoverview 3D Interactive Globe component using Three.js
 * Displays mine locations with real-time statistics and stylized continent outlines
 * Uses TopoJSON for accurate world geography with glowing ember-colored continent edges
 */

import { useRef, useMemo, useState, useCallback, Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import * as topojson from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { MINES, Mine, MineStats, RESOURCE_COLORS, ResourceType } from '../../lib/mines';

/** GeoJSON types for continent data (fallback) */
interface GeoJSONFeature {
  type: 'Feature';
  properties: { name: string };
  geometry: {
    type: 'LineString' | 'MultiLineString' | 'Polygon' | 'MultiPolygon';
    coordinates: number[][] | number[][][] | number[][][][];
  };
}

interface GeoJSONCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

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

/** Resource-specific colors for 3D rendering */
const RESOURCE_3D_STYLES = {
  coal: {
    primary: new THREE.Color('#1a1a1a'),      // Dark coal
    glow: new THREE.Color('#ff6b35'),          // Ember orange
    emissive: new THREE.Color('#ff4500'),      // Fire red-orange
    metalness: 0.1,
    roughness: 0.9,
  },
  gold: {
    primary: new THREE.Color('#ffd700'),       // Bright gold
    glow: new THREE.Color('#fff59d'),          // Light gold glow
    emissive: new THREE.Color('#b8860b'),      // Dark gold
    metalness: 1.0,
    roughness: 0.2,
  },
  oil: {
    primary: new THREE.Color('#1a1a2e'),       // Dark blue-black
    glow: new THREE.Color('#4a69bd'),          // Blue sheen
    emissive: new THREE.Color('#2d2d4a'),      // Deep blue
    metalness: 0.8,
    roughness: 0.1,
  },
  silver: {
    primary: new THREE.Color('#c0c0c0'),       // Silver
    glow: new THREE.Color('#f0f0f0'),          // Bright silver
    emissive: new THREE.Color('#a8a8a8'),      // Muted silver
    metalness: 1.0,
    roughness: 0.3,
  },
};

/** Single mine pin on the globe */
function MinePin({ mine, stats, isSelected, isHome, onClick }: MinePinProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const innerGlowRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  
  const position = useMemo(() => latLngToVector3(mine.lat, mine.lng, 2.02), [mine.lat, mine.lng]);
  const style = RESOURCE_3D_STYLES[mine.resource];
  
  // Resource-specific animations
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const isActive = isSelected || hovered;
    
    if (meshRef.current) {
      // Base scale with pulse
      const baseScale = isActive ? 1.5 : 1;
      const pulseAmount = mine.resource === 'coal' ? 0.15 : 0.1;
      const pulseSpeed = mine.resource === 'coal' ? 4 : 2;
      const scale = baseScale + Math.sin(time * pulseSpeed) * pulseAmount;
      meshRef.current.scale.setScalar(scale);
      
      // Coal: Flickering ember intensity
      if (mine.resource === 'coal') {
        const material = meshRef.current.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = 0.5 + Math.sin(time * 6) * 0.3 + Math.random() * 0.1;
      }
    }
    
    // Outer glow pulse
    if (glowRef.current) {
      const glowScale = isActive ? 2.8 : 2.0;
      const glowPulse = mine.resource === 'oil' ? Math.sin(time * 1.5) * 0.2 : Math.sin(time * 2) * 0.15;
      glowRef.current.scale.setScalar(glowScale + glowPulse);
    }
    
    // Inner glow for gold shimmer
    if (innerGlowRef.current && mine.resource === 'gold') {
      const material = innerGlowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.4 + Math.sin(time * 3) * 0.2;
    }
  });

  const minerCount = stats?.minerCount || 0;
  const pinSize = 0.03 + Math.min(minerCount / 50, 1) * 0.04;

  return (
    <group position={position}>
      {/* Outer glow effect */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[pinSize * 2, 16, 16]} />
        <meshBasicMaterial 
          color={style.glow} 
          transparent 
          opacity={mine.resource === 'coal' ? 0.4 : 0.25}
        />
      </mesh>
      
      {/* Inner glow for gold/silver metallic shine */}
      {(mine.resource === 'gold' || mine.resource === 'silver') && (
        <mesh ref={innerGlowRef}>
          <sphereGeometry args={[pinSize * 1.3, 16, 16]} />
          <meshBasicMaterial 
            color={style.glow} 
            transparent 
            opacity={0.5}
          />
        </mesh>
      )}
      
      {/* Main pin with resource-specific material */}
      <mesh 
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {/* Coal uses box geometry, oil uses sphere, gold/silver use icosahedron for faceted look */}
        {mine.resource === 'coal' ? (
          <boxGeometry args={[pinSize * 1.4, pinSize * 1.4, pinSize * 1.4]} />
        ) : mine.resource === 'oil' ? (
          <sphereGeometry args={[pinSize, 24, 24]} />
        ) : (
          <icosahedronGeometry args={[pinSize, 0]} />
        )}
        <meshStandardMaterial 
          color={style.primary}
          emissive={style.emissive}
          emissiveIntensity={isSelected ? 1.2 : 0.6}
          metalness={style.metalness}
          roughness={style.roughness}
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

/** Earth sphere with dark ocean (no individual rotation - parent group rotates) */
function Earth() {
  // Create gradient material for dark ocean
  const earthMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0a0a15'),
      roughness: 0.9,
      metalness: 0.1,
    });
  }, []);

  return (
    <mesh material={earthMaterial}>
      <sphereGeometry args={[2, 64, 64]} />
    </mesh>
  );
}

/** Glowing continent outlines using TopoJSON world data */
function ContinentOutlines() {
  const [continentLines, setContinentLines] = useState<[number, number, number][][]>([]);

  // Load TopoJSON world data and extract country borders
  useEffect(() => {
    const loadWorldData = async () => {
      try {
        // Try TopoJSON first (more accurate)
        const res = await fetch('/geo/world-110m.json');
        const worldData = await res.json() as Topology<{ countries: GeometryCollection }>;

        const radius = 2.005; // Slightly above the globe surface
        const lines: [number, number, number][][] = [];

        // Extract mesh of country borders using topojson-client
        if (worldData.objects && worldData.objects.countries) {
          const mesh = topojson.mesh(
            worldData,
            worldData.objects.countries as GeometryCollection,
            (a, b) => a !== b // Only include shared borders (coastlines + land borders)
          );

          // Process the mesh geometry
          if (mesh.type === 'MultiLineString') {
            mesh.coordinates.forEach((lineCoords: number[][]) => {
              if (lineCoords.length < 2) return;
              
              const points: [number, number, number][] = lineCoords.map(([lng, lat]) => {
                const v = latLngToVector3(lat, lng, radius);
                return [v.x, v.y, v.z];
              });
              lines.push(points);
            });
          } else if (mesh.type === 'LineString') {
            const coords = mesh.coordinates as unknown as [number, number][];
            const points: [number, number, number][] = coords.map(([lng, lat]) => {
              const v = latLngToVector3(lat, lng, radius);
              return [v.x, v.y, v.z];
            });
            lines.push(points);
          }

          // Also add coastlines (full country outlines for better visibility)
          const feature = topojson.feature(
            worldData,
            worldData.objects.countries as GeometryCollection
          );

          if (feature.type === 'FeatureCollection') {
            feature.features.forEach((f) => {
              const geom = f.geometry;
              if (geom.type === 'Polygon') {
                geom.coordinates.forEach((ring: number[][]) => {
                  if (ring.length < 2) return;
                  const points: [number, number, number][] = ring.map(([lng, lat]) => {
                    const v = latLngToVector3(lat, lng, radius);
                    return [v.x, v.y, v.z];
                  });
                  lines.push(points);
                });
              } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach((polygon: number[][][]) => {
                  polygon.forEach((ring: number[][]) => {
                    if (ring.length < 2) return;
                    const points: [number, number, number][] = ring.map(([lng, lat]) => {
                      const v = latLngToVector3(lat, lng, radius);
                      return [v.x, v.y, v.z];
                    });
                    lines.push(points);
                  });
                });
              }
            });
          }
        }

        setContinentLines(lines);
      } catch (err) {
        console.warn('Failed to load TopoJSON world data, trying fallback:', err);
        
        // Fallback to simple continents.json
        try {
          const res = await fetch('/geo/continents.json');
          const data = await res.json() as GeoJSONCollection;
          const radius = 2.005;
          const lines: [number, number, number][][] = [];

          data.features.forEach(feature => {
            const { geometry } = feature;

            const processCoords = (coords: number[][]) => {
              if (coords.length < 2) return;
              const points: [number, number, number][] = coords.map(([lng, lat]) => {
                const v = latLngToVector3(lat, lng, radius);
                return [v.x, v.y, v.z];
              });
              lines.push(points);
            };

            if (geometry.type === 'LineString') {
              processCoords(geometry.coordinates as number[][]);
            } else if (geometry.type === 'MultiLineString') {
              (geometry.coordinates as number[][][]).forEach(processCoords);
            }
          });

          setContinentLines(lines);
        } catch (fallbackErr) {
          console.warn('Failed to load fallback continent data:', fallbackErr);
        }
      }
    };

    loadWorldData();
  }, []);

  // No individual rotation - parent group rotates all elements together

  if (continentLines.length === 0) return null;

  return (
    <group>
      {/* Outer glow layer - softest, widest */}
      {continentLines.map((points, i) => (
        <Line
          key={`outer-glow-${i}`}
          points={points.map(([x, y, z]) => {
            const scale = 1.006;
            return [x * scale, y * scale, z * scale] as [number, number, number];
          })}
          color="#ff4500"
          lineWidth={4}
          transparent
          opacity={0.12}
        />
      ))}
      {/* Middle glow layer */}
      {continentLines.map((points, i) => (
        <Line
          key={`mid-glow-${i}`}
          points={points.map(([x, y, z]) => {
            const scale = 1.003;
            return [x * scale, y * scale, z * scale] as [number, number, number];
          })}
          color="#ff6b35"
          lineWidth={2.5}
          transparent
          opacity={0.25}
        />
      ))}
      {/* Core ember line - brightest */}
      {continentLines.map((points, i) => (
        <Line
          key={`continent-${i}`}
          points={points}
          color="#ff8c42"
          lineWidth={1.2}
          transparent
          opacity={0.85}
        />
      ))}
      {/* Inner hot core - brightest highlight */}
      {continentLines.map((points, i) => (
        <Line
          key={`hot-core-${i}`}
          points={points}
          color="#ffb366"
          lineWidth={0.6}
          transparent
          opacity={0.5}
        />
      ))}
    </group>
  );
}

/** Atmosphere glow effect - ember/gold tint */
function Atmosphere() {
  return (
    <>
      {/* Inner atmosphere - subtle ember glow */}
      <mesh>
        <sphereGeometry args={[2.05, 64, 64]} />
        <meshBasicMaterial 
          color="#ff6b35"
          transparent
          opacity={0.03}
          side={THREE.BackSide}
        />
      </mesh>
      {/* Outer atmosphere - larger glow */}
      <mesh>
        <sphereGeometry args={[2.15, 64, 64]} />
        <meshBasicMaterial 
          color="#ff9f43"
          transparent
          opacity={0.05}
          side={THREE.BackSide}
        />
      </mesh>
    </>
  );
}

/** Subtle grid lines on globe */
function GlobeGrid() {
  // Create latitude lines as point arrays
  const latLines = useMemo(() => {
    const lines: [number, number, number][][] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: [number, number, number][] = [];
      for (let lng = 0; lng <= 360; lng += 10) {
        const v = latLngToVector3(lat, lng, 2.003);
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
        const v = latLngToVector3(lat, lng, 2.003);
        points.push([v.x, v.y, v.z]);
      }
      lines.push(points);
    }
    return lines;
  }, []);

  // No individual rotation - parent group rotates all elements together

  return (
    <group>
      {latLines.map((points, i) => (
        <Line
          key={`lat-${i}`}
          points={points}
          color="#1a1a2e"
          lineWidth={0.5}
          transparent
          opacity={0.15}
        />
      ))}
      {lngLines.map((points, i) => (
        <Line
          key={`lng-${i}`}
          points={points}
          color="#1a1a2e"
          lineWidth={0.5}
          transparent
          opacity={0.15}
        />
      ))}
    </group>
  );
}

/** Rotating globe group - contains all elements that should rotate together */
function RotatingGlobe({ mineStats, selectedMine, onMineSelect, userHomeMine }: GlobeProps) {
  const groupRef = useRef<THREE.Group>(null);

  const handleMineClick = useCallback((mineId: string) => {
    onMineSelect(mineId);
  }, [onMineSelect]);

  // Single rotation for the entire globe (Earth + Outlines + Grid + Pins)
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.0003;
    }
  });

  return (
    <group ref={groupRef}>
      <Earth />
      <ContinentOutlines />
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
    </group>
  );
}

/** Main globe scene */
function GlobeScene({ mineStats, selectedMine, onMineSelect, userHomeMine }: GlobeProps) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ff6b35" />
      
      <Stars 
        radius={100} 
        depth={50} 
        count={3000} 
        factor={4} 
        saturation={0.1} 
        fade 
        speed={0.3}
      />
      
      <RotatingGlobe
        mineStats={mineStats}
        selectedMine={selectedMine}
        onMineSelect={onMineSelect}
        userHomeMine={userHomeMine}
      />
      
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
      
      {/* Resource legend - top left for mobile visibility */}
      <div className="absolute top-3 left-3 bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-lg p-2.5">
        <div className="text-[9px] text-coal-500 mb-1.5 font-semibold uppercase tracking-wider">Resources</div>
        <div className="flex flex-wrap gap-1.5">
          {/* Coal - ember glow effect */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gradient-to-r from-coal-950 to-coal-900 border border-coal-700">
            <div className="relative">
              <div className="w-3 h-3 rounded-sm bg-gradient-to-br from-coal-800 via-coal-950 to-coal-900 border border-coal-600" />
              <div className="absolute inset-0 w-3 h-3 rounded-sm animate-pulse opacity-60" 
                style={{ boxShadow: '0 0 6px 1px #ff6b35, inset 0 0 3px #ff4500' }} />
            </div>
            <span className="text-[10px] font-semibold text-coal-300">Coal</span>
          </div>
          
          {/* Gold - metallic shimmer */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-yellow-600/50"
            style={{ background: 'linear-gradient(135deg, #1a1500 0%, #2d2400 50%, #1a1500 100%)' }}>
            <div className="relative">
              <div className="w-3 h-3 rounded-sm"
                style={{ 
                  background: 'linear-gradient(135deg, #ffd700 0%, #ffec8b 25%, #ffd700 50%, #b8860b 75%, #ffd700 100%)',
                  boxShadow: '0 0 8px 2px rgba(255, 215, 0, 0.5)'
                }} />
            </div>
            <span className="text-[10px] font-semibold" style={{ color: '#ffd700' }}>Gold</span>
          </div>
          
          {/* Oil - iridescent black */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-blue-900/50"
            style={{ background: 'linear-gradient(135deg, #0a0a15 0%, #1a1a2e 50%, #0a0a15 100%)' }}>
            <div className="relative">
              <div className="w-3 h-3 rounded-full"
                style={{ 
                  background: 'linear-gradient(135deg, #1a1a2e 0%, #2d2d4a 30%, #1a1a2e 50%, #4a69bd 80%, #1a1a2e 100%)',
                  boxShadow: '0 0 6px 1px rgba(74, 105, 189, 0.4), inset 0 1px 2px rgba(255,255,255,0.1)'
                }} />
            </div>
            <span className="text-[10px] font-semibold text-blue-300">Oil</span>
          </div>
          
          {/* Silver - polished metallic */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-gray-500/50"
            style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)' }}>
            <div className="relative">
              <div className="w-3 h-3 rounded-sm"
                style={{ 
                  background: 'linear-gradient(135deg, #e8e8e8 0%, #c0c0c0 25%, #f0f0f0 50%, #a8a8a8 75%, #c0c0c0 100%)',
                  boxShadow: '0 0 6px 1px rgba(192, 192, 192, 0.4)'
                }} />
            </div>
            <span className="text-[10px] font-semibold text-gray-300">Silver</span>
          </div>
        </div>
      </div>

      {/* Controls hint - hidden on mobile */}
      <div className="absolute bottom-3 right-3 text-[10px] text-coal-500 hidden sm:block">
        Drag to rotate • Scroll to zoom • Click mine to select
      </div>
    </div>
  );
}
