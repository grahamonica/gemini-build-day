"use client";

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line, PerspectiveCamera, Grid, Text } from '@react-three/drei';
import { X } from 'lucide-react';
import * as THREE from 'three';

interface Binomial3DProps {
    onClose: () => void;
    binomialData?: {
        expression?: string;
        coefficients?: number[];
        terms?: string[];
        degree?: number;
    };
}

// Component to visualize a binomial expansion in 3D
const BinomialVisualization = ({ binomialData }: { binomialData?: Binomial3DProps['binomialData'] }) => {
    const groupRef = useRef<THREE.Group>(null);

    // Default to (x + y)^3 if no data provided
    const coefficients = binomialData?.coefficients || [1, 3, 3, 1]; // (x+y)^3 = x^3 + 3x^2y + 3xy^2 + y^3
    const expression = binomialData?.expression || "(x + y)³";
    const degree = binomialData?.degree || 3;

    // Create a 3D surface representing the function z = 3/x
    const surfacePoints = useMemo(() => {
        const points: THREE.Vector3[] = [];
        const resolution = 50;
        const range = 6; // x and y range from -3 to 3
        
        for (let i = 0; i <= resolution; i++) {
            for (let j = 0; j <= resolution; j++) {
                const x = (i / resolution - 0.5) * range * 2;
                const y = (j / resolution - 0.5) * range * 2;
                
                // Avoid division by zero - skip points very close to x=0
                if (Math.abs(x) < 0.1) {
                    // For x near 0, set z to a large value or skip
                    continue;
                }
                
                // Calculate z = 3/x
                const z = 3 / x;
                
                // Clamp z to reasonable visualization range
                const clampedZ = Math.max(-10, Math.min(10, z));
                
                points.push(new THREE.Vector3(x, y, clampedZ));
            }
        }
        return points;
    }, []);

    // Create grid lines for the function
    const gridLines = useMemo(() => {
        const lines: THREE.Vector3[] = [];
        const step = 0.5;
        
        // Create lines along x-axis (varying y)
        for (let y = -3; y <= 3; y += step) {
            for (let x = -3; x <= 3; x += 0.1) {
                if (Math.abs(x) < 0.1) continue;
                const z = 3 / x;
                const clampedZ = Math.max(-10, Math.min(10, z));
                lines.push(new THREE.Vector3(x, y, clampedZ));
            }
        }
        
        return lines;
    }, []);

    return (
        <group ref={groupRef}>
            {/* Title */}
            <Html position={[0, 5, 0]} center>
                <div style={{ 
                    fontFamily: 'Arial', 
                    fontSize: '1.2em', 
                    fontWeight: 'bold',
                    background: 'rgba(255,255,255,0.9)', 
                    padding: '10px 20px', 
                    borderRadius: '8px',
                    border: '2px solid #333',
                    textAlign: 'center'
                }}>
                    3D Visualization: z = 3/x
                </div>
            </Html>

            {/* 3D Surface representing the function z = 3/x */}
            <primitive 
                object={useMemo(() => {
                    const geometry = new THREE.BufferGeometry();
                    const positions = new Float32Array(surfacePoints.flatMap(p => [p.x, p.y, p.z]));
                    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    geometry.computeVertexNormals();
                    return geometry;
                }, [surfacePoints])}
            >
                <meshStandardMaterial 
                    color="#4A90E2" 
                    wireframe={false}
                    side={THREE.DoubleSide}
                    opacity={0.8}
                    transparent
                />
            </primitive>

            {/* Wireframe overlay for better visibility */}
            <primitive 
                object={useMemo(() => {
                    const geometry = new THREE.BufferGeometry();
                    const positions = new Float32Array(surfacePoints.flatMap(p => [p.x, p.y, p.z]));
                    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    return geometry;
                }, [surfacePoints])}
            >
                <meshStandardMaterial 
                    color="#FF6B6B" 
                    wireframe={true}
                    opacity={0.3}
                    transparent
                />
            </primitive>

            {/* Grid lines for the function */}
            <Line points={gridLines} color="#888" lineWidth={1} />

            {/* Grid for reference */}
            <Grid args={[10, 10]} cellColor="#ccc" sectionColor="#999" fadeDistance={15} />

            {/* Labels for axes */}
            <Html position={[6, 0, 0]} center>
                <div style={{ fontFamily: 'Arial', fontSize: '1em', fontWeight: 'bold', background: 'rgba(255,255,255,0.9)', padding: '5px 10px', borderRadius: '4px' }}>x</div>
            </Html>
            <Html position={[0, 6, 0]} center>
                <div style={{ fontFamily: 'Arial', fontSize: '1em', fontWeight: 'bold', background: 'rgba(255,255,255,0.9)', padding: '5px 10px', borderRadius: '4px' }}>y</div>
            </Html>
            <Html position={[0, 0, 5]} center>
                <div style={{ fontFamily: 'Arial', fontSize: '1em', fontWeight: 'bold', background: 'rgba(255,255,255,0.9)', padding: '5px 10px', borderRadius: '4px' }}>z</div>
            </Html>

            {/* Function label */}
            <Html position={[0, -4, 0]} center>
                <div style={{ 
                    fontFamily: 'Arial', 
                    fontSize: '1.1em',
                    fontWeight: 'bold',
                    background: 'rgba(255,255,255,0.95)', 
                    padding: '10px 20px', 
                    borderRadius: '8px',
                    border: '2px solid #333',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}>
                    z = 3/x
                </div>
            </Html>

            {/* Asymptote indicator at x=0 */}
            <Line 
                points={[
                    new THREE.Vector3(0, -3, -10),
                    new THREE.Vector3(0, -3, 10),
                    new THREE.Vector3(0, 3, 10),
                    new THREE.Vector3(0, 3, -10)
                ]} 
                color="#FF0000" 
                lineWidth={2} 
                dashed={true}
                dashScale={2}
                dashSize={0.5}
                gapSize={0.5}
            />
            <Html position={[0.3, 0, 0]} center>
                <div style={{ 
                    fontFamily: 'Arial', 
                    fontSize: '0.8em',
                    background: 'rgba(255,0,0,0.8)', 
                    color: 'white',
                    padding: '3px 8px', 
                    borderRadius: '4px'
                }}>
                    x = 0 (asymptote)
                </div>
            </Html>
        </group>
    );
};

export function Binomial3D({ onClose, binomialData }: Binomial3DProps) {
    return (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl w-full h-full flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-bold">3D Binomial Visualization</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 3D Canvas */}
                <div className="flex-1 relative" style={{ height: 'calc(100vh - 120px)' }}>
                    <Canvas>
                        <PerspectiveCamera makeDefault position={[10, 8, 15]} fov={50} />
                        
                        <color attach="background" args={['#f0f0f0']} />
                        
                        {/* Lighting */}
                        <ambientLight intensity={0.6} />
                        <directionalLight position={[10, 10, 5]} intensity={1} />
                        <pointLight position={[-10, -10, -5]} intensity={0.5} />

                        {/* Controls */}
                        <OrbitControls 
                            target={[0, 0, 0]} 
                            maxPolarAngle={Math.PI / 1.5} 
                            minPolarAngle={Math.PI / 3}
                            enableZoom={true}
                            enablePan={true}
                        />

                        {/* Grid for spatial reference */}
                        <Grid args={[20, 20]} cellColor="#ddd" sectionColor="#bbb" fadeDistance={25} />

                        {/* Binomial Visualization */}
                        <BinomialVisualization binomialData={binomialData} />
                    </Canvas>
                </div>
            </div>
        </div>
    );
}

