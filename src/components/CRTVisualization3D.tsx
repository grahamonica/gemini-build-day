"use client";

import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line, PerspectiveCamera, Grid } from '@react-three/drei';
import { X } from 'lucide-react';
import * as THREE from 'three';

// --- Constants based on the Problem Solution ---
// We use a scale where 1 Three.js unit = 1 cm for manageable visualization.
const SCALE = 1; // 1 unit = 1 cm
const L_cm = 4.0; // Plate length
const d_cm = 1.5; // Plate separation
const D_cm = 30.0; // Distance to screen

// Calculated displacements from the physics problem solution:
// y1 (at exit of plates) = 0.192 cm
const Y1_cm = 0.192;
// yTotal (at screen) = 3.06 cm
const Y_TOTAL_cm = 3.06;

// Simulation speed parameter (arbitrary speed for visual animation)
const SIM_SPEED = 0.08;

// --- Components ---

// The Gun and accelerating region area
const ElectronGun = () => {
  return (
    <group position={[-3, 0, 0]}>
      {/* Gun Housing */}
      <mesh position={[-1, 0, 0]}>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#555" transparent opacity={0.5} />
      </mesh>
      {/* Anode/Exit hole representation */}
      <mesh position={[0.1, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <ringGeometry args={[0.1, 0.3, 32]} />
        <meshBasicMaterial color="black" side={THREE.DoubleSide} />
      </mesh>
       <Html position={[-1, -1.5, 0]} center>
        <div style={{ fontFamily: 'Arial', fontSize: '0.8em', textAlign: 'center', background: 'rgba(255,255,255,0.8)', padding: '5px', borderRadius:'4px', border:'1px solid black' }}>
          Electron Gun<br/>V<sub>acc</sub> = 2500 V
        </div>
      </Html>
    </group>
  );
};

// The parallel plates
const DeflectingPlates = () => {
  const plateGeo = new THREE.BoxGeometry(L_cm, 0.1, 3); // Length L, thin height, some depth
  const plateMat = new THREE.MeshStandardMaterial({ color: '#888' });

  const yOffset = d_cm / 2;

  return (
    <group position={[L_cm / 2, 0, 0]}>
      {/* Top Plate */}
      <mesh geometry={plateGeo} material={plateMat} position={[0, yOffset + 0.05, 0]} />
      {/* Bottom Plate */}
      <mesh geometry={plateGeo} material={plateMat} position={[0, -yOffset - 0.05, 0]} />
      
      {/* Dimensions Labels */}
      <Html position={[0, yOffset + 0.5, 0]} center>
         <div style={{ fontFamily: 'Arial', fontSize: '0.8em', background:'white' }}>L = {L_cm.toFixed(1)} cm</div>
      </Html>
      <Html position={[-L_cm/2 - 0.5, 0, 0]} center>
         <div style={{ fontFamily: 'Arial', fontSize: '0.8em', background:'white' }}>d = {d_cm.toFixed(1)} cm</div>
      </Html>

      {/* E-Field representation (downward arrows as per diagram) */}
      {[-1.5, -0.5, 0.5, 1.5].map((xPos, i) => (
         <group key={i} position={[xPos, 0, 0]}>
             <Arrow start={[0, yOffset-0.1, 0]} end={[0, -yOffset+0.1, 0]} color="black" headLength={0.3} headWidth={0.2} />
         </group>
      ))}
       <Html position={[0, 0, 1.6]} center>
         <div style={{ fontFamily: 'Arial', fontSize: '0.8em', background:'white', border:'1px solid #ccc', padding:'2px' }}>E = 1.2 × 10⁴ N/C</div>
      </Html>
    </group>
  );
};

// The detection screen
const Screen = () => {
  const screenXPos = L_cm + D_cm;
  return (
    <group position={[screenXPos, 0, 0]}>
      <mesh rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[15, 15]} />
        <meshStandardMaterial color="#ddd" side={THREE.DoubleSide} transparent opacity={0.8} />
      </mesh>
      <Html position={[0, 7, 0]} center>
        <div style={{ fontFamily: 'Arial', fontWeight: 'bold' }}>Screen</div>
      </Html>
       {/* Distance label D */}
      <Html position={[-D_cm / 2, -3, 0]} center>
        <div style={{ fontFamily: 'Arial', fontSize: '0.8em', borderBottom: '1px solid black', width: '100px', textAlign: 'center' }}>
            D = {D_cm} cm
        </div>
      </Html>
    </group>
  );
};

// Helper component to draw an arrow using Three.js ArrowHelper
const Arrow = ({ start, end, color = 'black', headLength = 0.5, headWidth = 0.3 }: { start: [number, number, number], end: [number, number, number], color?: string, headLength?: number, headWidth?: number }) => {
    const startVec = new THREE.Vector3(...start);
    const endVec = new THREE.Vector3(...end);
    const direction = new THREE.Vector3().subVectors(endVec, startVec);
    const length = direction.length();
    direction.normalize();
    
    return (
        <primitive 
            object={new THREE.ArrowHelper(direction, startVec, length, color, headLength, headWidth)} 
        />
    );
};


// The animated electron and its static trajectory line
const ElectronAndTrajectory = () => {
  const electronRef = useRef<THREE.Mesh>(null);
  const [currentX, setCurrentX] = useState(-2); // Start before the plates

  // --- Trajectory Math (Geometric representation of physics results) ---
  // Phase 1: Inside plates (0 <= x <= L). Parabolic path: y = kx^2
  // We know at x = L, y = Y1_cm. So, k = Y1_cm / L^2
  const k_parabola = Y1_cm / (L_cm * L_cm);

  // Phase 2: Outside plates (x > L). Straight line tangent to parabola at x=L.
  // Slope m = 2kx at x=L => m = 2 * (Y1/L^2) * L = 2*Y1/L
  const slope_line = (2 * Y1_cm) / L_cm;
  
  const calculateY = (x: number) => {
    if (x < 0) return 0; // Straight before plates
    if (x <= L_cm) {
      // Inside plates: Parabola
      return k_parabola * x * x;
    } else {
      // Outside plates: Straight line equation: y - y1 = m(x - L)
      return Y1_cm + slope_line * (x - L_cm);
    }
  };

  // Generate static points for the trajectory line visualization
  const trajectoryPoints = useMemo(() => {
    const points = [];
    // Before plates
    points.push(new THREE.Vector3(-2, 0, 0));
    points.push(new THREE.Vector3(0, 0, 0));
    // Inside plates (more points for curve)
    for (let i = 0; i <= 20; i++) {
        const x = (i / 20) * L_cm;
        points.push(new THREE.Vector3(x, calculateY(x), 0));
    }
    // To screen
    points.push(new THREE.Vector3(L_cm + D_cm, Y_TOTAL_cm, 0));
    return points;
  }, []);


  // Animation loop
  useFrame((state, delta) => {
    if (!electronRef.current) return;

    let newX = currentX + SIM_SPEED * delta * 60; // Normalize speed against framerate
    const screenX = L_cm + D_cm;

    if (newX > screenX) {
      newX = -2; // Reset loop
    }

    const newY = calculateY(newX);
    electronRef.current.position.set(newX, newY, 0);
    setCurrentX(newX);
  });

  return (
    <>
      {/* The animated electron sphere */}
      <mesh ref={electronRef} position={[-2, 0, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color="red" />
         {/* V0 Label near entry */}
         {currentX < 0 && currentX > -1 && (
            <Html position={[0, 0.4, 0]} center>
                <div style={{ fontFamily: 'Arial', fontWeight:'bold', color:'red' }}>v₀</div>
            </Html>
         )}
      </mesh>

      {/* The static trajectory line */}
      <Line points={trajectoryPoints} color="blue" lineWidth={2} dashed={false} />

      {/* Labels for calculated displacements */}
      {/* y1 label at exit of plates */}
      <group position={[L_cm, Y1_cm/2, 0]}>
        <Arrow start={[0.2, -Y1_cm/2, 0]} end={[0.2, Y1_cm/2, 0]} color="black" headLength={0.2} headWidth={0.15} />
        <Arrow start={[0.2, Y1_cm/2, 0]} end={[0.2, -Y1_cm/2, 0]} color="black" headLength={0.2} headWidth={0.15} />
        <Html position={[0.5, 0, 0]} center>
            <div style={{ fontFamily: 'Arial', fontSize: '0.8em' }}>y₁</div>
        </Html>
      </group>

       {/* y_total label at screen */}
       <group position={[L_cm + D_cm + 0.5, Y_TOTAL_cm/2, 0]}>
        {/* A curly brace style indicator */}
        <Arrow start={[0, -Y_TOTAL_cm/2, 0]} end={[0, Y_TOTAL_cm/2, 0]} color="black" headLength={0.3} headWidth={0.2}/>
        <Arrow start={[0, Y_TOTAL_cm/2, 0]} end={[0, -Y_TOTAL_cm/2, 0]} color="black" headLength={0.3} headWidth={0.2}/>
        
        <Html position={[1, 0, 0]} center>
            <div style={{ fontFamily: 'Arial', fontWeight: 'bold', background:'white', padding:'3px' }}>
                y<sub>total</sub> = {Y_TOTAL_cm.toFixed(2)} cm
            </div>
        </Html>
      </group>

      {/* Center line dotted reference */}
      <Line points={[new THREE.Vector3(-2,0,0), new THREE.Vector3(L_cm+D_cm,0,0)]} color="black" lineWidth={1} dashed={true} dashScale={5} dashSize={1} gapSize={1} />

    </>
  );
};


// --- Main Component ---
interface CRTVisualization3DProps {
  onClose: () => void;
}

export function CRTVisualization3D({ onClose }: CRTVisualization3DProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full h-full max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            3D Cathode Ray Tube Visualization
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3D Canvas */}
        <div className="flex-1 relative" style={{ height: 'calc(100vh - 120px)' }}>
          <Canvas>
            {/* Camera setup to match the diagram view initially */}
            <PerspectiveCamera makeDefault position={[15, 5, 30]} fov={50} />
            
            <color attach="background" args={['white']} />
            
            {/* Lighting to make meshes visible */}
            <ambientLight intensity={0.8} />
            <directionalLight position={[10, 10, 5]} intensity={1} />

            {/* Controls to rotate/zoom the 3D model */}
            <OrbitControls target={[L_cm + D_cm/2, 0, 0]} maxPolarAngle={Math.PI/1.8} minPolarAngle={Math.PI/3} />

            {/* A subtle grid for spatial reference */}
            <Grid position={[15,-5,0]} args={[50, 50]} cellColor="#eee" sectionColor="#ddd" fadeDistance={60} />

            {/* Scene Contents */}
            <ElectronGun />
            <DeflectingPlates />
            <Screen />
            <ElectronAndTrajectory />

            {/* General Task Annotation */}
            <Html position={[20, -6, 0]} center>
                 <div style={{ fontFamily: 'Arial', background: 'white', padding: '15px', border: '2px solid black', borderRadius: '10px', width: '250px' }}>
                     <strong>Problem Goal:</strong><br/>
                     Calculate and visualize the total vertical displacement (y<sub>total</sub>) on the screen.
                 </div>
            </Html>

          </Canvas>
        </div>
      </div>
    </div>
  );
}

