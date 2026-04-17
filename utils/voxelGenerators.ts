
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { VoxelData } from '../types';
import { COLORS, CONFIG } from './voxelConstants';

// Helper to prevent overlapping voxels
function setBlock(map: Map<string, VoxelData>, x: number, y: number, z: number, color: number) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const key = `${rx},${ry},${rz}`;
    map.set(key, { x: rx, y: ry, z: rz, color });
}

function generateSphere(map: Map<string, VoxelData>, cx: number, cy: number, cz: number, r: number, col: number, sy = 1) {
    const r2 = r * r;
    const xMin = Math.floor(cx - r);
    const xMax = Math.ceil(cx + r);
    const yMin = Math.floor(cy - r * sy);
    const yMax = Math.ceil(cy + r * sy);
    const zMin = Math.floor(cz - r);
    const zMax = Math.ceil(cz + r);

    for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
            for (let z = zMin; z <= zMax; z++) {
                const dx = x - cx;
                const dy = (y - cy) / sy;
                const dz = z - cz;
                if (dx * dx + dy * dy + dz * dz <= r2) {
                    setBlock(map, x, y, z, col);
                }
            }
        }
    }
}

function generateCylinder(map: Map<string, VoxelData>, cx: number, cz: number, yStart: number, height: number, radius: number, col: number) {
    const r2 = radius * radius;
    for (let y = yStart; y < yStart + height; y++) {
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
            for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) {
                if ((x - cx) ** 2 + (z - cz) ** 2 <= r2) {
                    setBlock(map, x, y, z, col);
                }
            }
        }
    }
}

// Sub-generator logic separated for re-use in GrandMosque
const SubGenerators = {
    KaabaOnly: (map: Map<string, VoxelData>, offsetX: number, offsetZ: number) => {
        const FLOOR = CONFIG.FLOOR_Y + 2;
        // Mataf (White Marble Floor)
        generateSphere(map, offsetX, FLOOR - 1, offsetZ, 14, COLORS.MARBLE_WHITE, 0.1);

        // The Cube (Kaaba)
        const size = 6;
        const height = 7;
        for(let x = -size; x <= size; x++) {
            for(let z = -size; z <= size; z++) {
                for(let y = 0; y < height; y++) {
                    let col = COLORS.KAABA_BLACK;
                    // Gold Band (Kiswah)
                    if (y === height - 2) col = COLORS.GOLD;
                    
                    // Door Logic:
                    // Maqam is at x=8. So Door should be on x=6 face.
                    // "Left corner facing Maqam": If we stand at x=8 looking at x=0, 
                    // Left is z negative? Right is z positive?
                    // Let's place it at x=6, but shifted in Z to be the corner.
                    // The door is typically between Black Stone (corner) and Maqam.
                    // Let's put it at x=6, z=2 to z=4. 
                    if (x === size && z >= 1 && z <= 3 && y < 5 && y > 0) {
                         col = COLORS.GOLD; 
                    }
                    
                    setBlock(map, offsetX + x, FLOOR + y, offsetZ + z, col);
                }
            }
        }

        // Maqam Ibrahim (Small gold structure nearby at X=8)
        setBlock(map, offsetX + 9, FLOOR, offsetZ + 2, COLORS.GOLD);
        setBlock(map, offsetX + 9, FLOOR + 1, offsetZ + 2, COLORS.GOLD);
        setBlock(map, offsetX + 9, FLOOR + 2, offsetZ + 2, COLORS.GOLD);
    },

    ClockTowerOnly: (map: Map<string, VoxelData>, offsetX: number, offsetZ: number) => {
        const FLOOR = CONFIG.FLOOR_Y;
        // Base
        for(let y = 0; y < 15; y++) {
            const w = 7 - (y * 0.2);
            for(let x = -w; x <= w; x+=1) {
                for(let z = -w; z <= w; z+=1) {
                    setBlock(map, offsetX + x, FLOOR + y, offsetZ + z, COLORS.STONE_GRAY);
                }
            }
        }
        // Clock
        const clockY = FLOOR + 15;
        for(let y = 0; y < 6; y++) {
            for(let x = -3; x <= 3; x++) {
                for(let z = -3; z <= 3; z++) {
                     if (Math.abs(x) >= 2 || Math.abs(z) >= 2) {
                        let col = COLORS.STONE_GRAY;
                        if ((Math.abs(x) <= 1 && (z === 3 || z === -3)) || (Math.abs(z) <= 1 && (x === 3 || x === -3))) {
                             col = COLORS.CLOCK_FACE;
                             if (y === 3 && x === 0 && z === 3) col = COLORS.GOLD; 
                        }
                        setBlock(map, offsetX + x, clockY + y, offsetZ + z, col);
                     }
                }
            }
        }
        generateCylinder(map, offsetX, offsetZ, clockY + 6, 8, 1, COLORS.GOLD);
        setBlock(map, offsetX, clockY + 14, offsetZ, COLORS.GOLD);
    },

    SafaMarwaOnly: (map: Map<string, VoxelData>, offsetX: number, offsetZ: number) => {
         const FLOOR = CONFIG.FLOOR_Y + 2;
         for(let x = -15; x <= 15; x++) {
             for(let z = -2; z <= 2; z++) setBlock(map, offsetX + x, FLOOR, offsetZ + z, COLORS.MARBLE_WHITE);
         }
         // Hills
         for(let x = -18; x < -15; x++) for(let y = 0; y < 5; y++) for(let z = -4; z <= 4; z++) if (Math.random() > 0.3) setBlock(map, offsetX + x, FLOOR+y, offsetZ+z, COLORS.STONE_GRAY);
         for(let x = 15; x < 18; x++) for(let y = 0; y < 4; y++) for(let z = -4; z <= 4; z++) if (Math.random() > 0.3) setBlock(map, offsetX + x, FLOOR+y, offsetZ+z, COLORS.STONE_GRAY);
    }
};

export const Generators = {
    Kaaba: (): VoxelData[] => {
        const map = new Map<string, VoxelData>();
        SubGenerators.KaabaOnly(map, 0, 0);
        return Array.from(map.values());
    },

    GrandMosque: (): VoxelData[] => {
        const map = new Map<string, VoxelData>();
        const FLOOR = CONFIG.FLOOR_Y + 2;

        // 1. Kaaba in Center
        SubGenerators.KaabaOnly(map, 0, 0);

        // 2. Safa Marwa to the side (Shifted X=40)
        SubGenerators.SafaMarwaOnly(map, 35, 0);

        // 3. Clock Tower in background (Shifted Z=-50)
        SubGenerators.ClockTowerOnly(map, 0, -50);

        // 4. Surrounding Walls (Simplified)
        for(let x = -30; x <= 30; x++) {
            // Back Wall
            setBlock(map, x, FLOOR, 30, COLORS.MARBLE_WHITE);
            setBlock(map, x, FLOOR+1, 30, COLORS.MARBLE_WHITE);
            setBlock(map, x, FLOOR+2, 30, COLORS.MARBLE_WHITE);
        }
        for(let z = -30; z <= 30; z++) {
            // Side Walls
            setBlock(map, -30, FLOOR, z, COLORS.MARBLE_WHITE);
            setBlock(map, -30, FLOOR+1, z, COLORS.MARBLE_WHITE);
        }

        // Minarets at corners
        const corners = [[-30, 30], [30, 30]];
        corners.forEach(([cx, cz]) => {
            generateCylinder(map, cx, cz, FLOOR, 20, 2, COLORS.MARBLE_WHITE);
            setBlock(map, cx, FLOOR+21, cz, COLORS.GOLD);
        });

        return Array.from(map.values());
    },

    MaqamIbrahim: (): VoxelData[] => {
        const map = new Map<string, VoxelData>();
        const FLOOR = CONFIG.FLOOR_Y + 5;
        generateCylinder(map, 0, 0, FLOOR, 2, 3, COLORS.MARBLE_WHITE);
        generateCylinder(map, 0, 0, FLOOR + 2, 4, 2, COLORS.GOLD);
        generateSphere(map, 0, FLOOR + 6, 0, 2, COLORS.GOLD);
        return Array.from(map.values());
    },

    ClockTower: (): VoxelData[] => {
        const map = new Map<string, VoxelData>();
        SubGenerators.ClockTowerOnly(map, 0, 0);
        return Array.from(map.values());
    },

    Arafat: (): VoxelData[] => {
        const map = new Map<string, VoxelData>();
        const FLOOR = CONFIG.FLOOR_Y;
        for(let x = -10; x <= 10; x++) {
            for(let z = -10; z <= 10; z++) {
                const dist = Math.sqrt(x*x + z*z);
                const height = Math.max(0, 10 - dist);
                if (height > 0) {
                    for(let y = 0; y < height; y++) setBlock(map, x, FLOOR + y, z, COLORS.SAND);
                }
            }
        }
        const peakY = FLOOR + 10;
        generateCylinder(map, 0, 0, peakY, 6, 1, COLORS.MARBLE_WHITE);
        return Array.from(map.values());
    },

    Jamarat: (): VoxelData[] => {
        const map = new Map<string, VoxelData>();
        const FLOOR = CONFIG.FLOOR_Y + 2;
        for(let x = -10; x <= 10; x++) for(let z = -6; z <= 6; z++) setBlock(map, x, FLOOR, z, COLORS.MARBLE_WHITE);
        for(let y = 1; y < 12; y++) {
            for(let z = -4; z <= 4; z++) setBlock(map, 0, FLOOR + y, z, COLORS.STONE_GRAY);
        }
        for(let i=0; i<30; i++) setBlock(map, (Math.random()-0.5)*10, FLOOR+1, (Math.random()-0.5)*8, COLORS.STONE_GRAY);
        return Array.from(map.values());
    },

    SafaMarwa: (): VoxelData[] => {
        const map = new Map<string, VoxelData>();
        SubGenerators.SafaMarwaOnly(map, 0, 0);
        return Array.from(map.values());
    },

    MasjidNabawi: (): VoxelData[] => {
        const map = new Map<string, VoxelData>();
        const FLOOR = CONFIG.FLOOR_Y + 2;
        for(let x = -8; x <= 8; x++) {
            for(let z = -8; z <= 8; z++) {
                for(let y = 0; y < 6; y++) {
                    if (y === 0 || y === 5 || Math.abs(x) === 8 || Math.abs(z) === 8) {
                        setBlock(map, x, FLOOR + y, z, COLORS.MARBLE_WHITE);
                    }
                }
            }
        }
        generateSphere(map, 0, FLOOR + 6, 0, 4.5, COLORS.PROPHET_GREEN);
        setBlock(map, 0, FLOOR + 11, 0, COLORS.GOLD);
        const minaretLocs = [[-8, -8], [8, -8], [-8, 8], [8, 8]];
        minaretLocs.forEach(loc => {
            generateCylinder(map, loc[0], loc[1], FLOOR, 15, 1.2, COLORS.MARBLE_WHITE);
            generateSphere(map, loc[0], FLOOR + 15, loc[1], 1.5, COLORS.STONE_GRAY);
            setBlock(map, loc[0], FLOOR + 17, loc[1], COLORS.GOLD);
        });
        return Array.from(map.values());
    }
};
