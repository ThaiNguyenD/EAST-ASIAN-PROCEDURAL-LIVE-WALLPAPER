/**
 * flora.js - Trình sinh thảm thực vật Á Đông: Tre trúc (Bamboo), Tùng bách (Pine - POD), Đầm sen / Lau sậy
 * Sử dụng:
 * - bezier bậc 3 cho thân tre, lá trúc
 * - generateTreePOD & reconstructTreePOD cho cây cổ thụ tùng bách
 * - pruneStrokesBIC cắt tỉa nét lá kim
 */

import { bezier } from "../math/numerical.js";
import { generateTreePOD, reconstructTreePOD } from "../math/topology_pod.js";
import { pruneStrokesBIC } from "../math/statistics.js";

// Khởi tạo sẵn bộ Snapshots chuẩn của dáng cây Tùng cổ thụ Á Đông
// Các đặc trưng m = 8:
// [trunkHeight, trunkCurvature, branchAngle1, branchLen1, branchAngle2, branchLen2, branchAngle3, branchLen3]
const PINE_SNAPSHOTS = [
  [140, 15, -0.45, 65, 0.40, 55, -0.25, 45],
  [160, 25, -0.55, 75, 0.35, 60, -0.35, 50],
  [130, -10, -0.35, 50, 0.50, 65, 0.30, 40],
  [175, 30, -0.60, 80, 0.45, 70, -0.40, 60],
  [150, 18, -0.40, 60, 0.38, 58, -0.28, 48]
];

const pinePODModel = generateTreePOD(PINE_SNAPSHOTS, 0.95);

/**
 * Sinh cây Tùng cổ thụ bằng tái tạo Snapshot POD
 * 
 * @param {number} rootX - Tọa độ gốc cây x
 * @param {number} rootY - Tọa độ gốc cây y
 * @param {Function} prng - Bộ sinh ngẫu nhiên
 * @param {number} scale - Tỷ lệ thu phóng (mặc định 1.0)
 * @returns {string} SVG cây Tùng
 */
export function generatePineTree(rootX, rootY, prng, scale = 1.0) {
  // Sinh ngẫu nhiên hệ số POD a_k trong khoảng biên an toàn
  const coeffs = pinePODModel.modes.map((_, i) => {
    const rawVal = pinePODModel.eigenvalues[i];
    const lambda = Math.max(0.0, Number.isFinite(rawVal) ? rawVal : 0.0);
    return (prng() - 0.5) * 1.5 * Math.sqrt(lambda);
  });

  const feat = reconstructTreePOD(pinePODModel.mean, pinePODModel.modes, coeffs);
  const height = feat[0] * scale;
  const curvature = feat[1] * scale;
  const bAngle1 = feat[2];
  const bLen1 = feat[3] * scale;
  const bAngle2 = feat[4];
  const bLen2 = feat[5] * scale;
  const bAngle3 = feat[6];
  const bLen3 = feat[7] * scale;

  // Thân cây dùng đường cong Bézier
  const topX = rootX + curvature;
  const topY = rootY - height;
  const trunkBz = bezier(
    [rootX, rootX + curvature * 0.3, rootX + curvature * 0.7, topX],
    [rootY, rootY - height * 0.4, rootY - height * 0.7, topY]
  );
  const trunkPts = trunkBz.sample(10);
  const trunkD = `M ${trunkPts[0].x.toFixed(1)},${trunkPts[0].y.toFixed(1)} ` +
    trunkPts.slice(1).map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // Các nhánh chính
  const branches = [
    { startT: 0.55, angle: bAngle1, len: bLen1 },
    { startT: 0.75, angle: bAngle2, len: bLen2 },
    { startT: 0.90, angle: bAngle3, len: bLen3 }
  ];

  let branchesSvg = "";
  let foliageSvg = "";

  for (const br of branches) {
    const startPt = trunkBz.evaluate(br.startT);
    const endX = startPt.x + br.len * Math.cos(br.angle - Math.PI * 0.5);
    const endY = startPt.y + br.len * Math.sin(br.angle - Math.PI * 0.5);

    branchesSvg += `<path d="M ${startPt.x.toFixed(1)},${startPt.y.toFixed(1)} Q ${(startPt.x + endX) * 0.5},${(startPt.y + endY) * 0.5 - 6} ${endX.toFixed(1)},${endY.toFixed(1)}" fill="none" stroke="#2b2623" stroke-width="${(2.2 * scale).toFixed(1)}" stroke-linecap="round" />`;

    // Tán lá kim tùng (bó kim hình bán nguyệt Á Đông)
    const numNeedles = 7;
    for (let ni = 0; ni < numNeedles; ni++) {
      const theta = -Math.PI * 0.8 + (ni / (numNeedles - 1)) * Math.PI * 0.8;
      const nLen = 14 * scale;
      const nx = endX + nLen * Math.cos(theta);
      const ny = endY + nLen * Math.sin(theta);
      foliageSvg += `<line x1="${endX.toFixed(1)}" y1="${endY.toFixed(1)}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#2b2623" stroke-width="${(1.2 * scale).toFixed(1)}" opacity="0.85" />`;
    }
  }

  return `
    <g class="pine-tree" data-x-max="${(rootX + 100).toFixed(0)}">
      <path d="${trunkD}" fill="none" stroke="#2b2623" stroke-width="${(4.5 * scale).toFixed(1)}" stroke-linecap="round" />
      ${branchesSvg}
      ${foliageSvg}
    </g>
  `;
}

/**
 * Sinh khóm trúc Á Đông bằng đường cong Bézier tham số
 * 
 * @param {number} posX - Vị trí x gốc khóm trúc
 * @param {number} groundY - Độ cao mặt đất
 * @param {Function} prng - Bộ sinh ngẫu nhiên
 * @returns {string} SVG khóm trúc
 */
export function generateBambooGrove(posX, groundY, prng) {
  const numCulms = 3 + Math.floor(prng() * 3);
  let groveSvg = "";

  for (let c = 0; c < numCulms; c++) {
    const culmX = posX + (c - numCulms * 0.5) * 16.0 + prng() * 6.0;
    const culmHeight = 110.0 + prng() * 90.0;
    const lean = (prng() - 0.5) * 35.0;

    // Đốt trúc dùng Bézier uốn nhẹ
    const p0 = [culmX, groundY];
    const p1 = [culmX + lean * 0.3, groundY - culmHeight * 0.35];
    const p2 = [culmX + lean * 0.7, groundY - culmHeight * 0.7];
    const p3 = [culmX + lean, groundY - culmHeight];

    const bz = bezier([p0[0], p1[0], p2[0], p3[0]], [p0[1], p1[1], p2[1], p3[1]]);
    const culmPts = bz.sample(12);

    // Vẽ thân trúc theo từng đốt
    let culmPath = "";
    for (let i = 0; i < culmPts.length - 1; i++) {
      culmPath += `M ${culmPts[i].x.toFixed(1)},${culmPts[i].y.toFixed(1)} L ${culmPts[i + 1].x.toFixed(1)},${culmPts[i + 1].y.toFixed(1)} `;
    }

    groveSvg += `<path d="${culmPath}" fill="none" stroke="#2b2623" stroke-width="2.6" stroke-linecap="round" opacity="0.92" />`;

    // Lá trúc đặc trưng hình thoi thuôn dài (Bézier 2 cánh)
    const numLeaves = 4 + Math.floor(prng() * 4);
    for (let l = 0; l < numLeaves; l++) {
      const leafT = 0.4 + prng() * 0.55;
      const nodePt = bz.evaluate(leafT);
      const leafDir = (l % 2 === 0 ? 1 : -1);
      const leafLen = 22.0 + prng() * 14.0;
      const leafAngle = leafDir * (0.3 + prng() * 0.4) + Math.PI * 0.5;

      const tipX = nodePt.x + leafLen * Math.cos(leafAngle);
      const tipY = nodePt.y + leafLen * Math.sin(leafAngle);

      const leafD = `M ${nodePt.x.toFixed(1)},${nodePt.y.toFixed(1)} Q ${(nodePt.x + tipX) * 0.5 + leafDir * 5},${(nodePt.y + tipY) * 0.5 - 3} ${tipX.toFixed(1)},${tipY.toFixed(1)} Q ${(nodePt.x + tipX) * 0.5 - leafDir * 3},${(nodePt.y + tipY) * 0.5 + 4} ${nodePt.x.toFixed(1)},${nodePt.y.toFixed(1)} Z`;
      groveSvg += `<path d="${leafD}" fill="#2b2623" opacity="0.88" />`;
    }
  }

  return `
    <g class="bamboo-grove" data-x-max="${(posX + 80).toFixed(0)}">
      ${groveSvg}
    </g>
  `;
}
