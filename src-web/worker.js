/**
 * worker.js - Tier 2 Background Chunk Generator
 * Chạy bất đồng bộ trong Web Worker, sinh hình học từng chunk (1200px) độc lập với Main Thread.
 * Tuyệt đối không gây nghẽn vòng lặp Render 120 FPS.
 */

import { generateMountainLayer, generateMistLayer, generateWaterSurface } from "./generators/terrain.js";
import { generatePineTree, generateBambooGrove } from "./generators/flora.js";
import { generateSolitaryBoat, generatePavilion, generateCinnabarSeal, generateBirdFlock } from "./generators/cultural.js";
import { initNpuDevice } from "./math/npu_accelerator.js";

// Khởi tạo bộ gia tốc NPU nếu có
initNpuDevice().catch(() => {});

/**
 * Bộ sinh số giả ngẫu nhiên có hạt giống deterministic (Mulberry32)
 */
function createPrng(seedVal) {
  let s = (seedVal >>> 0) || 123456789;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sinh nội dung SVG cho một chunk địa hình hoàn chỉnh
 * 
 * @param {Object} data
 * @param {number} data.chunkIndex - Chỉ số chunk (0, 1, 2...)
 * @param {number} data.chunkX - Tọa độ x bắt đầu chunk
 * @param {number} data.chunkWidth - Chiều rộng chunk (mặc định 1200px)
 * @param {number} data.canvasHeight - Chiều cao màn hình (mặc định 1920px)
 * @param {number} data.baseSeed - Hạt giống phong cảnh
 * @returns {Object} { chunkIndex, chunkX, chunkWidth, svgContent, elementCount, stats }
 */
function generateChunkGeometry(data) {
  const { chunkIndex, chunkX, chunkWidth = 1200, canvasHeight = 1920, baseSeed = 42 } = data;

  // Hạt giống riêng biệt cho chunk kết hợp tọa độ x
  const chunkSeed = (baseSeed * 73856093) ^ ((chunkX / 100) * 19349663);
  const prng = createPrng(chunkSeed);

  let totalElements = 0;
  let chunkSvg = `<g id="chunk-${chunkIndex}" class="landscape-chunk" data-x-start="${chunkX}" data-x-max="${chunkX + chunkWidth}">`;

  // 1. Đàn chim nhạn bay xa (Hậu cảnh mờ ảo)
  const birdsSvg = generateBirdFlock(chunkX, chunkWidth, prng);
  if (birdsSvg) {
    chunkSvg += birdsSvg;
    totalElements += 5;
  }

  // 2. Hậu cảnh: Rặng núi sương mờ (z = 2, opacity 0.22)
  const bgMountain = generateMountainLayer({
    startX: chunkX,
    width: chunkWidth,
    baseY: canvasHeight * 0.58,
    layer: 2,
    prng,
    canvasHeight
  });
  chunkSvg += bgMountain.svg;
  totalElements += bgMountain.elementCount;

  // Dải sương mù Parabolic FDM tầng cao
  const highMist = generateMistLayer(chunkX, chunkWidth, canvasHeight * 0.52, prng);
  chunkSvg += highMist;
  totalElements += 1;

  // 3. Trung cảnh: Núi đá vôi Karst (z = 1, opacity 0.52)
  const midMountain = generateMountainLayer({
    startX: chunkX,
    width: chunkWidth,
    baseY: canvasHeight * 0.72,
    layer: 1,
    prng,
    canvasHeight
  });
  chunkSvg += midMountain.svg;
  totalElements += midMountain.elementCount;

  // Cây Tùng cổ thụ ven vách núi (Snapshot POD)
  const numPines = 1 + (prng() > 0.4 ? 1 : 0);
  for (let p = 0; p < numPines; p++) {
    const pineX = chunkX + 150 + prng() * (chunkWidth - 300);
    const pineGroundY = midMountain.spline.evaluate(pineX);
    const pineSvg = generatePineTree(pineX, pineGroundY, prng, 0.9 + prng() * 0.3);
    chunkSvg += pineSvg;
    totalElements += 18;
  }

  // Mái đình / Nhà tranh ven núi (Spline bậc 3)
  const hasPavilion = prng() > 0.65;
  if (hasPavilion) {
    const pavX = chunkX + 250 + prng() * (chunkWidth - 500);
    const pavGroundY = midMountain.spline.evaluate(pavX);
    const pavSvg = generatePavilion(pavX, pavGroundY, prng);
    chunkSvg += pavSvg;
    totalElements += 6;
  }

  // Dải sương mù Parabolic tầng thấp lượn quanh chân núi
  const lowMist = generateMistLayer(chunkX, chunkWidth, canvasHeight * 0.75, prng);
  chunkSvg += lowMist;
  totalElements += 1;

  // 4. Tiền cảnh: Đồi thoai thoải & Bờ nước (z = 0, opacity 0.88)
  const fgMountain = generateMountainLayer({
    startX: chunkX,
    width: chunkWidth,
    baseY: canvasHeight * 0.88,
    layer: 0,
    prng,
    canvasHeight
  });
  chunkSvg += fgMountain.svg;
  totalElements += fgMountain.elementCount;

  // Khóm trúc ven sông (Bézier tham số)
  const numBamboo = 1 + (prng() > 0.5 ? 1 : 0);
  for (let b = 0; b < numBamboo; b++) {
    const bamX = chunkX + 80 + prng() * (chunkWidth - 200);
    const bamGroundY = fgMountain.spline.evaluate(bamX);
    const bamSvg = generateBambooGrove(bamX, bamGroundY, prng);
    chunkSvg += bamSvg;
    totalElements += 12;
  }

  // Mặt nước và gợn sóng lăn tăn
  const waterY = canvasHeight * 0.80;
  const waterSvg = generateWaterSurface(chunkX, chunkWidth, waterY, prng);
  chunkSvg += waterSvg;
  totalElements += 18;

  // Thuyền độc mộc (Tối ưu hóa vị trí Armijo & sóng RK4)
  const hasBoat = prng() > 0.55;
  if (hasBoat) {
    const boatSvg = generateSolitaryBoat(chunkX, waterY, prng);
    chunkSvg += boatSvg;
    totalElements += 8;
  }

  // Dấu triện đỏ son điểm xuyết (Mỗi 2-3 chunk xuất hiện 1 lần ở góc tao nhã)
  if (chunkIndex % 3 === 0) {
    const sealX = chunkX + 60;
    const sealY = canvasHeight * 0.12;
    const sealSvg = generateCinnabarSeal(sealX, sealY, chunkIndex % 6 === 0 ? "山水" : "清风");
    chunkSvg += sealSvg;
    totalElements += 3;
  }

  chunkSvg += `</g>`;

  return {
    chunkIndex,
    chunkX,
    chunkWidth,
    svgContent: chunkSvg,
    elementCount: totalElements,
    stats: {
      hasPavilion,
      hasBoat,
      numPines,
      numBamboo
    }
  };
}

// Lắng nghe thông điệp từ Main Thread
self.onmessage = function(event) {
  const { type, payload } = event.data;

  if (type === "GENERATE_CHUNK") {
    try {
      const result = generateChunkGeometry(payload);
      self.postMessage({
        type: "CHUNK_READY",
        payload: result
      });
    } catch (err) {
      self.postMessage({
        type: "CHUNK_ERROR",
        error: err.message,
        chunkIndex: payload?.chunkIndex
      });
    }
  }
};
