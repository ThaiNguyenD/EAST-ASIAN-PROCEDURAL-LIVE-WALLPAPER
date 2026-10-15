/**
 * optimization.js - Module Cơ sở Tối ưu Bố cục "Lưu Bạch"
 * Quy hoạch lồi với Hàm chắn Logarit (Logarithmic Barrier) & Gradient quay lui Armijo
 * Sử dụng Float64Array (double precision), không làm tròn ở các phép tính trung gian.
 */

/**
 * Tính gradient và giá trị hàm chắn Logarit:
 * psi(x, alpha_k) = f(x) - alpha_k * sum(ln(-g_i(x)))
 * f(x) = 0.5 * (x - x_target)^T * H * (x - x_target)
 * 
 * @param {Float64Array} x - Tọa độ điểm thử [x1, x2]
 * @param {Float64Array} target - Tọa độ lý tưởng [x_target, y_target]
 * @param {Float64Array} H - Ma trận Hessian xác định dương 2x2 [H00, H01, H10, H11]
 * @param {Array<Object>} constraints - Danh sách ràng buộc g_i(x) <= 0
 * @param {number} alpha - Tham số phạt rào chắn alpha_k > 0
 * @returns {{ value: number, grad: Float64Array, feasible: boolean }}
 */
function evaluateBarrier(x, target, H, constraints, alpha) {
  const dx0 = x[0] - target[0];
  const dx1 = x[1] - target[1];

  // f(x) = 0.5 * [dx0, dx1] * [H00 H01; H10 H11] * [dx0; dx1]
  const hx0 = H[0] * dx0 + H[1] * dx1;
  const hx1 = H[2] * dx0 + H[3] * dx1;
  let fVal = 0.5 * (dx0 * hx0 + dx1 * hx1);

  // grad f(x) = H * (x - target)
  const grad = new Float64Array([hx0, hx1]);

  let barrierSum = 0.0;
  let feasible = true;

  for (let i = 0; i < constraints.length; i++) {
    const c = constraints[i];
    // Ràng buộc c: eval(x) => { g: number, gradG: [number, number] }
    const { g, gradG } = c(x);

    if (g >= -1e-12) {
      // Vi phạm miền chấp nhận được
      feasible = false;
      return { value: Infinity, grad, feasible: false };
    }

    barrierSum += Math.log(-g);

    // grad psi = grad f + alpha * sum( grad g_i / (-g_i) )
    const invNegG = 1.0 / (-g);
    grad[0] += alpha * (gradG[0] * invNegG);
    grad[1] += alpha * (gradG[1] * invNegG);
  }

  const psiVal = fVal - alpha * barrierSum;
  return { value: psiVal, grad, feasible: true };
}

/**
 * Bộ giải Gradient với Thủ tục Quay lui Armijo (Armijo Backtracking Line Search).
 * Tìm cực tiểu hàm chắn phi lồi/lồi trong miền chấp nhận được với giới hạn <= 10 bước lặp.
 * 
 * Điều kiện Armijo:
 * psi(x^k - t_k * nabla_psi) - psi(x^k) <= -m1 * t_k * ||nabla_psi||^2
 * 
 * @param {Float64Array} x0 - Điểm xuất phát khả thi bên trong miền (g_i(x0) < 0)
 * @param {Float64Array} target - Tọa độ mong muốn
 * @param {Float64Array} H - Ma trận Hessian xác định dương
 * @param {Array<Function>} constraints - Tập các hàm ràng buộc g_i(x) <= 0
 * @param {number} alpha - Tham số chắn Logarit
 * @param {number} maxIter - Số bước lặp tối đa (mặc định 10)
 * @param {number} tol - Sai số dừng gradient
 * @returns {Float64Array} Điểm tối ưu x
 */
export function gradientBacktracking(
  x0,
  target,
  H,
  constraints,
  alpha = 1.0,
  maxIter = 10,
  tol = 1e-4
) {
  const x = new Float64Array(x0);
  const m1 = 0.01;      // Hằng số kiểm tra Armijo
  const stepDec = 0.5;  // Hệ số giảm bước

  for (let iter = 0; iter < maxIter; iter++) {
    const current = evaluateBarrier(x, target, H, constraints, alpha);
    if (!current.feasible) break;

    const g0 = current.grad[0];
    const g1 = current.grad[1];
    const gradNormSq = g0 * g0 + g1 * g1;
    const gradNorm = Math.sqrt(gradNormSq);

    if (gradNorm < tol) {
      break; // Đã hội tụ đến điểm dừng
    }

    // Hướng giảm nhanh nhất d = -grad
    let t = 1.0;
    const xCandidate = new Float64Array(2);
    let stepAccepted = false;

    // Quay lui Armijo tối đa 10 lần co bước
    for (let bt = 0; bt < 10; bt++) {
      xCandidate[0] = x[0] - t * g0;
      xCandidate[1] = x[1] - t * g1;

      const cand = evaluateBarrier(xCandidate, target, H, constraints, alpha);
      if (cand.feasible) {
        const armijoLhs = cand.value - current.value;
        const armijoRhs = -m1 * t * gradNormSq;
        if (armijoLhs <= armijoRhs) {
          x[0] = xCandidate[0];
          x[1] = xCandidate[1];
          stepAccepted = true;
          break;
        }
      }
      t *= stepDec;
    }

    if (!stepAccepted) {
      break; // Không thể bước thêm nữa trong giới hạn chấp nhận
    }
  }

  return x;
}

/**
 * Bài toán Quy hoạch lồi với Hàm chắn Logarit (optimizePlacement).
 * Định vị tối ưu các cụm thực thể (nhà tranh, khóm tre, thuyền nan) sao cho:
 * 1. Tôn trọng triết lý "Lưu bạch" (để trống trung tâm / duy trì khoảng cách thẩm mỹ).
 * 2. Thỏa mãn các ràng buộc biên không gian: không đặt nhà trên vách đá dốc, thuyền nằm trong sông.
 * 
 * @param {Array<number>} initialPos - Tọa độ khởi tạo [x, y]
 * @param {Array<number>} idealPos - Tọa độ lý tưởng theo phân bố bố cục Á Đông [x, y]
 * @param {Object} bounds - Giới hạn hộp { minX, maxX, minY, maxY }
 * @param {Array<{ x: number, y: number, r: number }>} obstacles - Các vật cản / vùng núi cấm đè
 * @param {Object} options - Tùy chọn trọng số Hessian và tham số chắn
 * @returns {Float64Array} Tọa độ tối ưu [x, y]
 */
export function optimizePlacement(
  initialPos,
  idealPos,
  bounds,
  obstacles = [],
  options = {}
) {
  const wx = options.weightX || 1.0;
  const wy = options.weightY || 1.5;
  // Ma trận Hessian xác định dương đảm bảo tính lồi chặt
  const H = new Float64Array([wx, 0.0, 0.0, wy]);
  const target = new Float64Array([idealPos[0], idealPos[1]]);

  // Lập danh sách ràng buộc g_i(x) <= 0
  const constraints = [];

  // Ràng buộc biên hộp: x >= minX => minX - x <= 0
  constraints.push((p) => ({
    g: bounds.minX - p[0],
    gradG: [-1.0, 0.0]
  }));
  // x <= maxX => x - maxX <= 0
  constraints.push((p) => ({
    g: p[0] - bounds.maxX,
    gradG: [1.0, 0.0]
  }));
  // y >= minY => minY - y <= 0
  constraints.push((p) => ({
    g: bounds.minY - p[1],
    gradG: [0.0, -1.0]
  }));
  // y <= maxY => y - maxY <= 0
  constraints.push((p) => ({
    g: p[1] - bounds.maxY,
    gradG: [0.0, 1.0]
  }));

  // Ràng buộc khoảng cách với các vật cản: ||p - obs|| >= r => r^2 - ||p - obs||^2 <= 0
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const rSq = obs.r * obs.r;
    constraints.push((p) => {
      const dx = p[0] - obs.x;
      const dy = p[1] - obs.y;
      const distSq = dx * dx + dy * dy;
      return {
        g: rSq - distSq,
        gradG: [-2.0 * dx, -2.0 * dy]
      };
    });
  }

  // Khởi tạo điểm x0 khả thi nghiêm ngặt bên trong
  let startX = Math.max(bounds.minX + 5.0, Math.min(bounds.maxX - 5.0, initialPos[0]));
  let startY = Math.max(bounds.minY + 5.0, Math.min(bounds.maxY - 5.0, initialPos[1]));

  // Đảm bảo x0 không dính obstacle
  for (const obs of obstacles) {
    const dx = startX - obs.x;
    const dy = startY - obs.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= obs.r + 2.0) {
      const push = (obs.r + 5.0) / (dist || 1.0);
      startX = obs.x + dx * push;
      startY = obs.y + dy * push;
    }
  }

  const x0 = new Float64Array([startX, startY]);

  // Giảm dần tham số chắn logarit alpha_k+1 = mu * alpha_k với mu = 0.5
  let alpha = options.initialAlpha || 2.0;
  const mu = 0.5;
  const barrierStages = options.stages || 2;
  let currentX = x0;

  for (let s = 0; s < barrierStages; s++) {
    currentX = gradientBacktracking(
      currentX,
      target,
      H,
      constraints,
      alpha,
      10, // <= 10 vòng lặp bảo toàn 60/120 FPS
      1e-3
    );
    alpha *= mu;
  }

  return currentX;
}
