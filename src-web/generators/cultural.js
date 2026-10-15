/**
 * cultural.js - Trình sinh thực thể văn hóa Á Đông: Thuyền độc mộc, Nhà tranh/Mái đình, Dấu triện đỏ son, Cánh chim bay
 * Sử dụng:
 * - optimizePlacement (Quy hoạch lồi rào chắn Logarit & Armijo) để định vị
 * - bezier bậc 3 cho thân thuyền nan và cánh chim
 * - spline bậc 3 tự nhiên cho mái đình cong vút
 * - rk4sys2 tính vệt sóng trôi của thuyền
 * - samplePoisson sinh số lượng chim nhạn / thuyền
 */

import { bezier, spline, rk4sys2 } from "../math/numerical.js";
import { optimizePlacement } from "../math/optimization.js";
import { samplePoisson } from "../math/statistics.js";

/**
 * Sinh dấu triện đỏ son trầm (#a8382c) điểm xuyết (diện tích < 1% khung hình)
 * 
 * @param {number} x - Tọa độ góc x
 * @param {number} y - Tọa độ góc y
 * @param {string} text - Chữ triện ("山水" hoặc "清风")
 * @returns {string} SVG con dấu triện
 */
export function generateCinnabarSeal(x, y, text = "山水") {
  const size = 32.0; // Diện tích 32x32px rất nhỏ (< 0.02% diện tích khung 3072x1920)

  return `
    <g class="cinnabar-seal" data-x-max="${(x + size + 10).toFixed(0)}">
      <!-- Khung viền triện mộc phong trần -->
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size}" height="${size}" rx="2" fill="#a8382c" opacity="0.92" />
      <rect x="${(x + 2).toFixed(1)}" y="${(y + 2).toFixed(1)}" width="${size - 4}" height="${size - 4}" fill="none" stroke="#f4ede2" stroke-width="1.2" opacity="0.85" />
      <!-- Ký tự chữ triện Hán - Nôm cổ cách điệu -->
      <text x="${(x + size * 0.5).toFixed(1)}" y="${(y + size * 0.72).toFixed(1)}" font-family="'Noto Serif SC', 'Songti SC', serif" font-weight="900" font-size="16" fill="#f4ede2" text-anchor="middle" letter-spacing="1">
        ${text}
      </text>
    </g>
  `;
}

/**
 * Sinh thuyền độc mộc (Solitary Fishing Boat) với người câu cá
 * Định vị tối ưu trong lòng sông nhờ optimizePlacement & sóng RK4
 * 
 * @param {number} startX - Tọa độ x khởi đầu
 * @param {number} waterY - Mặt nước y
 * @param {Function} prng - Bộ sinh ngẫu nhiên
 * @param {Array<Object>} obstacles - Vật cản cấm đè
 * @returns {string} SVG chiếc thuyền độc mộc
 */
export function generateSolitaryBoat(startX, waterY, prng, obstacles = []) {
  // Tối ưu hóa vị trí thuyền trong lòng sông (minY = waterY + 40, maxY = waterY + 250)
  const idealX = startX + 200 + prng() * 400;
  const idealY = waterY + 60 + prng() * 120;
  const bounds = {
    minX: startX + 50,
    maxX: startX + 900,
    minY: waterY + 30,
    maxY: waterY + 280
  };

  const optPos = optimizePlacement([idealX, idealY], [idealX, idealY], bounds, obstacles, {
    weightX: 1.0,
    weightY: 2.0
  });

  const bx = optPos[0];
  const by = optPos[1];
  const boatLen = 58.0;

  // Thân thuyền nan dùng Bézier uốn cong 2 đầu
  const p0 = [bx - boatLen * 0.5, by - 4];
  const p1 = [bx - boatLen * 0.25, by + 6];
  const p2 = [bx + boatLen * 0.25, by + 6];
  const p3 = [bx + boatLen * 0.5, by - 6];

  const bzHull = bezier([p0[0], p1[0], p2[0], p3[0]], [p0[1], p1[1], p2[1], p3[1]]);
  const hullPts = bzHull.sample(10);

  let hullD = `M ${hullPts[0].x.toFixed(1)},${hullPts[0].y.toFixed(1)}`;
  for (let i = 1; i < hullPts.length; i++) {
    hullD += ` L ${hullPts[i].x.toFixed(1)},${hullPts[i].y.toFixed(1)}`;
  }
  hullD += ` Q ${bx.toFixed(1)},${(by - 2).toFixed(1)} ${hullPts[0].x.toFixed(1)},${hullPts[0].y.toFixed(1)} Z`;

  // Mui thuyền khum tròn (nan tre che mưa)
  const canopyX = bx - 6;
  const canopyY = by - 5;
  const canopyD = `M ${canopyX.toFixed(1)},${canopyY.toFixed(1)} Q ${(canopyX + 10).toFixed(1)},${(canopyY - 14).toFixed(1)} ${(canopyX + 20).toFixed(1)},${canopyY.toFixed(1)} Z`;

  // Người câu cá đơn độc (ngồi trầm tư tĩnh lặng)
  const fisherX = bx + 16;
  const fisherY = by - 5;
  const rodTipX = bx + 36;
  const rodTipY = by - 20;

  // Vệt sóng nước trôi êm theo dòng chảy tính bằng RK4
  const flowField = (x, y, t) => [8.0, 0.4 * Math.sin(x * 0.02)];
  const wake = rk4sys2(flowField, [bx - boatLen * 0.5, by + 4], 0, 0.2, 12);
  let wakeD = `M ${wake[0].x.toFixed(1)},${wake[0].y.toFixed(1)}`;
  for (let i = 1; i < wake.length; i++) {
    wakeD += ` L ${wake[i].x.toFixed(1)},${wake[i].y.toFixed(1)}`;
  }

  return `
    <g class="solitary-boat" data-x-max="${(bx + boatLen + 30).toFixed(0)}">
      <!-- Vệt sóng RK4 -->
      <path d="${wakeD}" fill="none" stroke="#3d352e" stroke-width="0.8" opacity="0.3" stroke-dasharray="3,3" />
      <!-- Thân thuyền -->
      <path d="${hullD}" fill="#2b2623" opacity="0.95" />
      <!-- Mui nan tre -->
      <path d="${canopyD}" fill="#3d352e" opacity="0.85" />
      <!-- Người câu cá (Áo tơi, nón lá) -->
      <path d="M ${(fisherX - 4).toFixed(1)},${fisherY.toFixed(1)} Q ${fisherX.toFixed(1)},${(fisherY - 10).toFixed(1)} ${(fisherX + 4).toFixed(1)},${fisherY.toFixed(1)} Z" fill="#2b2623" />
      <polygon points="${(fisherX - 5).toFixed(1)},${(fisherY - 8).toFixed(1)} ${(fisherX + 5).toFixed(1)},${(fisherY - 8).toFixed(1)} ${fisherX.toFixed(1)},${(fisherY - 14).toFixed(1)}" fill="#3d352e" />
      <!-- Cần câu cá vút cong -->
      <line x1="${fisherX.toFixed(1)}" y1="${(fisherY - 8).toFixed(1)}" x2="${rodTipX.toFixed(1)}" y2="${rodTipY.toFixed(1)}" stroke="#2b2623" stroke-width="0.8" />
      <line x1="${rodTipX.toFixed(1)}" y1="${rodTipY.toFixed(1)}" x2="${rodTipX.toFixed(1)}" y2="${(by + 10).toFixed(1)}" stroke="#5c5346" stroke-width="0.5" opacity="0.4" />
    </g>
  `;
}

/**
 * Sinh nhà tranh / Mái đình cong vút ven sườn núi
 * Mái đình uốn cong bằng spline tự nhiên bậc 3
 * 
 * @param {number} posX - Tọa độ x
 * @param {number} groundY - Tọa độ y mặt đất
 * @param {Function} prng - Bộ sinh ngẫu nhiên
 * @returns {string} SVG Mái đình / Nhà tranh
 */
export function generatePavilion(posX, groundY, prng) {
  const roofWidth = 80.0;
  const roofHeight = 24.0;
  const roofBaseY = groundY - 50.0;

  // Spline bậc 3 cho mái đình cong vút đầu đao
  const roofX = [
    posX - roofWidth * 0.5,
    posX - roofWidth * 0.25,
    posX,
    posX + roofWidth * 0.25,
    posX + roofWidth * 0.5
  ];
  // Đầu đao hếch cong lên ở 2 đầu
  const roofY = [
    roofBaseY - 12.0,
    roofBaseY + 2.0,
    roofBaseY - roofHeight,
    roofBaseY + 2.0,
    roofBaseY - 12.0
  ];

  const roofSpline = spline(roofX, roofY);
  const sampledRoof = roofSpline.sample(16, roofX[0], roofX[4]);

  let roofPath = `M ${sampledRoof[0].x.toFixed(1)},${sampledRoof[0].y.toFixed(1)}`;
  for (let i = 1; i < sampledRoof.length; i++) {
    roofPath += ` L ${sampledRoof[i].x.toFixed(1)},${sampledRoof[i].y.toFixed(1)}`;
  }
  roofPath += ` L ${(posX + roofWidth * 0.38).toFixed(1)},${(roofBaseY + 4).toFixed(1)} L ${(posX - roofWidth * 0.38).toFixed(1)},${(roofBaseY + 4).toFixed(1)} Z`;

  // Cột đình
  const colYBottom = groundY;
  const colYTop = roofBaseY + 3;
  const leftColX = posX - roofWidth * 0.28;
  const rightColX = posX + roofWidth * 0.28;

  return `
    <g class="pavilion" data-x-max="${(posX + roofWidth * 0.5 + 20).toFixed(0)}">
      <!-- Cột đình gỗ -->
      <line x1="${leftColX.toFixed(1)}" y1="${colYTop.toFixed(1)}" x2="${leftColX.toFixed(1)}" y2="${colYBottom.toFixed(1)}" stroke="#2b2623" stroke-width="2.5" />
      <line x1="${rightColX.toFixed(1)}" y1="${colYTop.toFixed(1)}" x2="${rightColX.toFixed(1)}" y2="${colYBottom.toFixed(1)}" stroke="#2b2623" stroke-width="2.5" />
      <!-- Lan can đình -->
      <line x1="${leftColX.toFixed(1)}" y1="${(colYBottom - 14).toFixed(1)}" x2="${rightColX.toFixed(1)}" y2="${(colYBottom - 14).toFixed(1)}" stroke="#2b2623" stroke-width="1.2" />
      <!-- Nền đình kê đá -->
      <rect x="${(leftColX - 6).toFixed(1)}" y="${(colYBottom - 3).toFixed(1)}" width="${(rightColX - leftColX + 12).toFixed(1)}" height="6" fill="#3d352e" opacity="0.9" />
      <!-- Mái đình cong vút -->
      <path d="${roofPath}" fill="#2b2623" opacity="0.95" />
    </g>
  `;
}

/**
 * Sinh đàn chim nhạn bay xa (Flock of birds)
 * Số lượng theo quá trình Poisson(omega in [0.2, 0.5])
 * 
 * @param {number} startX - Tọa độ x chunk
 * @param {number} width - Chiều rộng chunk
 * @param {Function} prng - Bộ sinh ngẫu nhiên
 * @returns {string} SVG đàn chim bay
 */
export function generateBirdFlock(startX, width, prng) {
  // Số lượng biến cố Poisson cho chim bay: trung bình 0.4
  const numEvents = samplePoisson(0.4, prng);
  if (numEvents === 0) return "";

  const flockSize = 3 + Math.floor(prng() * 4);
  const leadX = startX + 100 + prng() * (width - 300);
  const leadY = 120 + prng() * 250;

  let birdsSvg = "";

  for (let i = 0; i < flockSize; i++) {
    // Đội hình chữ V hoặc dải bay nghiêng
    const bx = leadX - i * (14 + prng() * 6);
    const by = leadY + (i % 2 === 0 ? 1 : -1) * i * (8 + prng() * 4);
    const wingSpan = 7.0 + prng() * 3.0;

    // Cánh chim nhạn cách điệu Bézier hai cánh
    const wingD = `M ${(bx - wingSpan).toFixed(1)},${(by - 2).toFixed(1)} Q ${(bx - wingSpan * 0.4).toFixed(1)},${(by - 5).toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} Q ${(bx + wingSpan * 0.4).toFixed(1)},${(by - 5).toFixed(1)} ${(bx + wingSpan).toFixed(1)},${(by - 2).toFixed(1)}`;

    birdsSvg += `<path d="${wingD}" fill="none" stroke="#3d352e" stroke-width="1.1" stroke-linecap="round" opacity="0.65" />`;
  }

  return `
    <g class="bird-flock" data-x-max="${(leadX + 50).toFixed(0)}">
      ${birdsSvg}
    </g>
  `;
}
