/**
 * terrain.js - Trình sinh địa hình Á Đông: Núi đá vôi Karst, ruộng bậc thang, mặt nước, sương mù
 * Sử dụng:
 * - decomposeElevation (Phân rã xu thế - nhiễu)
 * - spline bậc 3 tự nhiên
 * - TDA Vietoris-Rips kiểm soát hình thái đỉnh núi
 * - parabolicDiffusion1D tạo dải sương mù Parabolic
 * - pruneStrokesBIC cắt tỉa nét vân đá
 */

import { spline, parabolicDiffusion1D } from "../math/numerical.js";
import { validateTerrainTopology } from "../math/topology_pod.js";
import { decomposeElevation, pruneStrokesBIC } from "../math/statistics.js";

/**
 * Sinh một lớp núi (Karst hoặc đồi thoai thoải)
 * 
 * @param {Object} params
 * @param {number} params.startX - Tọa độ x bắt đầu chunk
 * @param {number} params.width - Chiều rộng chunk (1200px)
 * @param {number} params.baseY - Độ cao cơ sở (y)
 * @param {number} params.layer - Lớp chiều sâu (0: Tiền cảnh, 1: Trung cảnh, 2: Hậu cảnh)
 * @param {Function} params.prng - Hàm sinh số ngẫu nhiên có hạt giống
 * @param {number} params.canvasHeight - Chiều cao khung hình (1920)
 * @returns {Object} { svg: string, peakPoints: Array, elementCount: number, strokeCount: number }
 */
export function generateMountainLayer({ startX, width, baseY, layer, prng, canvasHeight = 1920 }) {
  // Hòa sắc Thủy Mặc Á Đông theo từng lớp khí quyển
  const layerColors = [
    { fill: "#2b2623", stroke: "#1f1b19", opacity: 0.88, name: "foreground" },
    { fill: "#3d352e", stroke: "#2e2722", opacity: 0.52, name: "midground" },
    { fill: "#5c5346", stroke: "#4a4237", opacity: 0.22, name: "background" }
  ];
  const color = layerColors[layer] || layerColors[1];

  // 1. Phân rã xu thế toàn cục và nhiễu địa chất
  const numAnchorPoints = layer === 2 ? 7 : (layer === 1 ? 9 : 11);
  const stepX = width / (numAnchorPoints - 1);
  const rawAnchors = [];

  const trendWave = (x) => {
    // Xu thế vĩ mô uốn lượn dạng sóng trường kỷ
    const freq1 = 0.0012;
    const freq2 = 0.0035;
    const amp = layer === 2 ? 220 : (layer === 1 ? 280 : 340);
    return baseY - amp * (0.6 * Math.sin(x * freq1) + 0.4 * Math.cos(x * freq2 + 1.2));
  };

  const peakNoiseSigma = layer === 2 ? 20.0 : (layer === 1 ? 35.0 : 50.0);

  for (let i = 0; i < numAnchorPoints; i++) {
    const ax = startX + i * stepX;
    const dec = decomposeElevation(ax, trendWave, prng, peakNoiseSigma);
    rawAnchors.push({ x: ax, y: Math.max(100, Math.min(canvasHeight - 150, dec.y)) });
  }

  // 2. Kiểm soát hình thái địa hình bằng TDA (Vietoris-Rips)
  const tdaResult = validateTerrainTopology(rawAnchors, 250.0, 3);
  let effectiveAnchors = rawAnchors;

  // Nếu núi bị vỡ vụn thành quá nhiều gò rời rạc, làm mịn bằng trung bình trượt
  if (!tdaResult.valid) {
    effectiveAnchors = [];
    effectiveAnchors.push(rawAnchors[0]);
    for (let i = 1; i < rawAnchors.length - 1; i++) {
      const smoothedY = 0.25 * rawAnchors[i - 1].y + 0.5 * rawAnchors[i].y + 0.25 * rawAnchors[i + 1].y;
      effectiveAnchors.push({ x: rawAnchors[i].x, y: smoothedY });
    }
    effectiveAnchors.push(rawAnchors[rawAnchors.length - 1]);
  }

  // 3. Nội suy Spline tự nhiên bậc 3
  const xArr = effectiveAnchors.map(p => p.x);
  const yArr = effectiveAnchors.map(p => p.y);
  const mountainSpline = spline(xArr, yArr);

  // Lấy mẫu đường bao đỉnh núi
  const sampleDensity = 60;
  const sampledTop = mountainSpline.sample(sampleDensity, startX, startX + width);

  // Tạo đường bao khép kín đáy
  let pathD = `M ${startX.toFixed(1)},${canvasHeight}`;
  pathD += ` L ${sampledTop[0].x.toFixed(1)},${sampledTop[0].y.toFixed(1)}`;

  for (let i = 1; i < sampledTop.length; i++) {
    pathD += ` L ${sampledTop[i].x.toFixed(1)},${sampledTop[i].y.toFixed(1)}`;
  }
  pathD += ` L ${(startX + width).toFixed(1)},${canvasHeight} Z`;

  // 4. Sinh các nét gân đá (Karst texture / đốm rạn mực)
  const candidateStrokes = [];
  const numTextureStrokes = layer === 0 ? 120 : (layer === 1 ? 80 : 45);

  for (let s = 0; s < numTextureStrokes; s++) {
    const rx = startX + prng() * width;
    const baseYAtX = mountainSpline.evaluate(rx);
    const strokeLen = 40 + prng() * 120;
    const strokeYStart = baseYAtX + 10 + prng() * 200;
    if (strokeYStart + strokeLen > canvasHeight - 50) continue;

    const strokePts = [];
    const segments = 5;
    let currX = rx;
    let currY = strokeYStart;

    for (let seg = 0; seg <= segments; seg++) {
      strokePts.push({ x: currX, y: currY });
      currX += (prng() - 0.5) * 12;
      currY += strokeLen / segments;
    }

    candidateStrokes.push({
      id: s,
      points: strokePts,
      weight: 1.0 - (layer * 0.3)
    });
  }

  // 5. Cắt tỉa nét vẽ bằng tiêu chí BIC để đảm bảo ngân sách DOM
  const prunedStrokes = pruneStrokesBIC(candidateStrokes, {
    minStrokes: layer === 0 ? 55 : (layer === 1 ? 38 : 25),
    maxStrokes: layer === 0 ? 95 : (layer === 1 ? 65 : 45)
  });

  // Xuất SVG
  let strokeSvg = "";
  for (const strk of prunedStrokes) {
    const pts = strk.points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    strokeSvg += `<polyline points="${pts}" fill="none" stroke="${color.stroke}" stroke-width="${layer === 0 ? '1.4' : '0.9'}" opacity="${(color.opacity * 0.7).toFixed(2)}" stroke-linecap="round" />`;
  }

  const mountainSvg = `
    <g class="mountain-layer layer-${layer}" data-x-max="${(startX + width).toFixed(0)}">
      <path d="${pathD}" fill="${color.fill}" opacity="${color.opacity.toFixed(2)}" stroke="${color.stroke}" stroke-width="1.2" />
      ${strokeSvg}
    </g>
  `;

  return {
    svg: mountainSvg,
    peakPoints: sampledTop,
    elementCount: 1 + prunedStrokes.length,
    spline: mountainSpline
  };
}

/**
 * Sinh dải sương mù khuếch tán giữa các lớp núi bằng FDM Parabolic (du/dt = gamma * d2u/dx2)
 * 
 * @param {number} startX - Tọa độ x bắt đầu
 * @param {number} width - Chiều rộng chunk
 * @param {number} y - Độ cao sương mù
 * @param {Function} prng - Hàm sinh ngẫu nhiên
 * @returns {string} SVG sương mù khuếch tán
 */
export function generateMistLayer(startX, width, y, prng) {
  const gridPoints = 25;
  const initialDensity = new Float64Array(gridPoints);

  // Đặt các cụm sương sơ khởi ngẫu nhiên
  for (let i = 0; i < gridPoints; i++) {
    initialDensity[i] = (prng() > 0.4 ? 0.7 + prng() * 0.3 : 0.1);
  }

  // Khuếch tán truyền nhiệt Parabolic với mu <= 0.5
  const diffused = parabolicDiffusion1D(initialDensity, 0.4, 0.01, 0.15, 12);

  const stepX = width / (gridPoints - 1);
  let pathD = `M ${startX.toFixed(1)},${y}`;

  for (let i = 0; i < gridPoints; i++) {
    const curX = startX + i * stepX;
    const mistHeight = 40.0 + diffused[i] * 90.0;
    const curY = y + (diffused[i] - 0.5) * 30.0;
    pathD += ` Q ${(curX - stepX * 0.5).toFixed(1)},${(curY - mistHeight).toFixed(1)} ${curX.toFixed(1)},${curY.toFixed(1)}`;
  }

  pathD += ` L ${(startX + width).toFixed(1)},${(y + 120).toFixed(1)} L ${startX.toFixed(1)},${(y + 120).toFixed(1)} Z`;

  return `
    <path class="mist-ribbon" d="${pathD}" fill="#f4ede2" opacity="0.65" filter="url(#paper-mist)" />
  `;
}

/**
 * Sinh mặt nước và gợn sóng lăn tăn (water ripples)
 * 
 * @param {number} startX - Tọa độ x
 * @param {number} width - Chiều rộng chunk
 * @param {number} waterY - Mặt nước bắt đầu
 * @param {Function} prng - Hàm ngẫu nhiên
 * @returns {string} SVG mặt nước
 */
export function generateWaterSurface(startX, width, waterY, prng) {
  let ripplesSvg = "";
  const numRipples = 18;

  for (let i = 0; i < numRipples; i++) {
    const rx = startX + prng() * (width - 150);
    const ry = waterY + 20 + prng() * 300;
    const rLen = 30 + prng() * 90;

    ripplesSvg += `<path d="M ${rx.toFixed(1)},${ry.toFixed(1)} Q ${(rx + rLen * 0.5).toFixed(1)},${(ry + 2.5).toFixed(1)} ${(rx + rLen).toFixed(1)},${ry.toFixed(1)}" fill="none" stroke="#3d352e" stroke-width="0.8" opacity="${(0.15 + prng() * 0.25).toFixed(2)}" />`;
  }

  return `
    <g class="water-surface" data-x-max="${(startX + width).toFixed(0)}">
      ${ripplesSvg}
    </g>
  `;
}
