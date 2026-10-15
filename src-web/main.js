/**
 * main.js - Tier 1 Render Loop & DOM Garbage Collector (Main Thread)
 * 
 * NGUYÊN TẮC BẤT DI BẤT DỊCH:
 * 1. Main Thread chạy ở 120 FPS: Chỉ tịnh tiến viewBox của <svg> và dọn rác DOM.
 * 2. Tuyệt đối KHÔNG chạy thuật toán sinh hình học hay giải phương trình tại đây.
 * 3. Mọi phép toán nặng được ủy thác hoàn toàn cho worker.js (Tier 2).
 */

const svg = document.getElementById("scene-svg");
const sceneDrawing = document.getElementById("scene-drawing");
const statFps = document.getElementById("stat-fps");
const statNodes = document.getElementById("stat-nodes");
const statScroll = document.getElementById("stat-scroll");

// Cấu hình không gian hiển thị (Độ phân giải chuẩn 3072x1920 hoặc kích thước màn hình thực)
const canvasWidth = 3072;
const canvasHeight = 1920;
const chunkWidth = 1200;
const bufferDistance = 1600; // Khoảng đệm kích hoạt sinh trước chunk mới

// Trạng thái vận hành
let viewBoxX = 0.0;
let scrollSpeed = 0.6; // Pixel trên mỗi frame (tương đương ~36-72 px/giây)
let isPaused = false;
let baseSeed = 1984;

let nextChunkIndex = 0;
let nextChunkX = 0.0;
let pendingWorkerRequest = false;

// Thiết lập kích thước viewBox ban đầu
svg.setAttribute("viewBox", `0 0 ${canvasWidth} ${canvasHeight}`);

// Khởi tạo Web Worker cho Tier 2
const worker = new Worker("worker.js", { type: "module" });

worker.onmessage = function(event) {
  const { type, payload, error } = event.data;

  if (type === "CHUNK_READY") {
    pendingWorkerRequest = false;

    // Chèn nội dung SVG chunk mới vào cây DOM
    const template = document.createElement("template");
    template.innerHTML = payload.svgContent.trim();
    const chunkElement = template.content.firstElementChild;

    if (chunkElement) {
      sceneDrawing.appendChild(chunkElement);
    }

    nextChunkIndex = payload.chunkIndex + 1;
    nextChunkX = payload.chunkX + payload.chunkWidth;
  } else if (type === "CHUNK_ERROR") {
    console.error("[Tier 2 Worker Error]:", error);
    pendingWorkerRequest = false;
  }
};

/**
 * Kiểm tra và kích hoạt Worker sinh chunk mới bất đồng bộ
 */
function checkAndRequestChunks() {
  if (pendingWorkerRequest) return;

  // Nếu mép phải khung nhìn + vùng đệm vượt qua điểm kết thúc của chunk hiện có
  if (viewBoxX + canvasWidth + bufferDistance > nextChunkX) {
    pendingWorkerRequest = true;
    worker.postMessage({
      type: "GENERATE_CHUNK",
      payload: {
        chunkIndex: nextChunkIndex,
        chunkX: nextChunkX,
        chunkWidth,
        canvasHeight,
        baseSeed
      }
    });
  }
}

/**
 * Bộ dọn rác DOM (DOM Garbage Collector)
 * Mọi node chunk có x_max < viewBoxX - 600 bị gọi .remove() ngay lập tức
 * để duy trì tổng số node DOM ổn định trong ngưỡng [600, 2200].
 */
function collectGarbageDOM() {
  const cutoffX = viewBoxX - 600.0;
  const chunkNodes = sceneDrawing.querySelectorAll(".landscape-chunk");

  for (let i = 0; i < chunkNodes.length; i++) {
    const node = chunkNodes[i];
    const xMax = parseFloat(node.getAttribute("data-x-max"));
    if (!isNaN(xMax) && xMax < cutoffX) {
      node.remove();
    }
  }
}

// Bộ đếm hiệu năng FPS
let frameCount = 0;
let lastFpsTime = performance.now();
let lastDomCountTime = 0;

/**
 * Tier 1 - Render Loop chính (60 - 120 FPS)
 * Chỉ tịnh tiến viewBox và xóa các node đã trôi qua lề trái.
 */
function renderLoop(currentTime) {
  if (!isPaused) {
    // 1. Tịnh tiến tọa độ cuộn
    viewBoxX += scrollSpeed;
    svg.setAttribute("viewBox", `${viewBoxX.toFixed(2)} 0 ${canvasWidth} ${canvasHeight}`);

    // 2. Kích hoạt sinh trước chunk nếu cần (chạy ngầm trong worker)
    checkAndRequestChunks();

    // 3. Dọn rác DOM
    collectGarbageDOM();
  }

  // Cập nhật thống kê FPS và số node DOM mỗi 500ms
  frameCount++;
  if (currentTime - lastFpsTime >= 500) {
    const currentFps = Math.round((frameCount * 1000) / (currentTime - lastFpsTime));
    statFps.textContent = `${currentFps} FPS`;
    frameCount = 0;
    lastFpsTime = currentTime;

    if (currentTime - lastDomCountTime >= 1000) {
      const activePathCount = sceneDrawing.querySelectorAll("path, polyline, line, rect").length;
      statNodes.textContent = `Nodes: ${activePathCount}`;
      statScroll.textContent = `${scrollSpeed.toFixed(1)} px/frame`;
      lastDomCountTime = currentTime;

      // Gửi tín hiệu nhịp tim sang ứng dụng C# Host nếu có WebView2
      if (window.chrome?.webview?.postMessage) {
        window.chrome.webview.postMessage({
          type: "HEARTBEAT",
          fps: currentFps,
          nodeCount: activePathCount,
          viewBoxX
        });
      }
    }
  }

  requestAnimationFrame(renderLoop);
}

// Bắt đầu sinh 3 chunk đầu tiên phủ kín màn hình
checkAndRequestChunks();

// Khởi chạy vòng lặp Render 120 FPS
requestAnimationFrame(renderLoop);

// Các hàm cầu nối IPC phục vụ Windows Desktop Wrapper
window.setPaused = function(paused) {
  isPaused = Boolean(paused);
  console.log(`[EastAsianWallpaper] Trạng thái tạm dừng: ${isPaused}`);
};

window.setScrollSpeed = function(speed) {
  scrollSpeed = Math.max(0.1, Math.min(5.0, Number(speed) || 0.6));
  console.log(`[EastAsianWallpaper] Tốc độ cuộn: ${scrollSpeed} px/frame`);
};

window.setSeed = function(newSeed) {
  baseSeed = Number(newSeed) || Math.floor(Math.random() * 100000);
  // Xóa cảnh hiện tại và nạp lại
  sceneDrawing.innerHTML = "";
  nextChunkIndex = 0;
  nextChunkX = viewBoxX;
  checkAndRequestChunks();
};

window.getStats = function() {
  const activePathCount = sceneDrawing.querySelectorAll("path, polyline, line, rect").length;
  return {
    viewBoxX,
    scrollSpeed,
    isPaused,
    baseSeed,
    activeElements: activePathCount
  };
};
