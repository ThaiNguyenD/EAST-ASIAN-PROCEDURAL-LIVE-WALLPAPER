/**
 * numerical.js - Module Phương pháp số (Numerical Methods)
 * Độ chính xác số học: Float64Array (double precision), không làm tròn ở các phép tính trung gian.
 */

/**
 * Thuật toán phân rã Crout / Thomas giải hệ phương trình ba đường chéo O(n).
 * Hệ phương trình: A * x = B
 * Trong đó A có đường chéo dưới a (n-1), đường chéo chính b (n), đường chéo trên c (n-1).
 * 
 * @param {Object|Array} A - Đối tượng { lower, diag, upper } hoặc mảng [lower, diag, upper] hoặc ma trận
 * @param {Float64Array|Array<number>} B - Vế phải kích thước n
 * @returns {Float64Array} Nghiệm x của hệ phương trình
 */
export function tri_diag(A, B) {
  let lower, diag, upper;

  if (A && A.diag && A.lower && A.upper) {
    lower = A.lower instanceof Float64Array ? A.lower : new Float64Array(A.lower);
    diag = A.diag instanceof Float64Array ? A.diag : new Float64Array(A.diag);
    upper = A.upper instanceof Float64Array ? A.upper : new Float64Array(A.upper);
  } else if (Array.isArray(A) && A.length === 3 && Array.isArray(A[0])) {
    lower = new Float64Array(A[0]);
    diag = new Float64Array(A[1]);
    upper = new Float64Array(A[2]);
  } else if (Array.isArray(A) && A.length > 0 && Array.isArray(A[0])) {
    const n = A.length;
    diag = new Float64Array(n);
    lower = new Float64Array(n - 1);
    upper = new Float64Array(n - 1);
    for (let i = 0; i < n; i++) {
      diag[i] = A[i][i];
      if (i > 0) lower[i - 1] = A[i][i - 1];
      if (i < n - 1) upper[i] = A[i][i + 1];
    }
  } else {
    throw new Error("Invalid tridiagonal matrix format");
  }

  const n = diag.length;
  const rhs = B instanceof Float64Array ? new Float64Array(B) : new Float64Array(B);
  if (rhs.length !== n) {
    throw new Error(`Dimension mismatch: diag length ${n} vs RHS length ${rhs.length}`);
  }

  if (n === 0) return new Float64Array(0);
  if (n === 1) return new Float64Array([rhs[0] / diag[0]]);

  // Crout / Thomas forward sweep
  // cPrime: n-1 elements, dPrime: n elements
  const cPrime = new Float64Array(n - 1);
  const dPrime = new Float64Array(n);

  cPrime[0] = upper[0] / diag[0];
  dPrime[0] = rhs[0] / diag[0];

  for (let i = 1; i < n; i++) {
    const m = diag[i] - lower[i - 1] * cPrime[i - 1];
    if (Math.abs(m) < 1e-15) {
      // Tránh chia cho 0 với đường chéo gần suy biến
      const safeM = m >= 0 ? 1e-15 : -1e-15;
      if (i < n - 1) cPrime[i] = upper[i] / safeM;
      dPrime[i] = (rhs[i] - lower[i - 1] * dPrime[i - 1]) / safeM;
    } else {
      if (i < n - 1) cPrime[i] = upper[i] / m;
      dPrime[i] = (rhs[i] - lower[i - 1] * dPrime[i - 1]) / m;
    }
  }

  // Back substitution
  const x = new Float64Array(n);
  x[n - 1] = dPrime[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    x[i] = dPrime[i] - cPrime[i] * x[i + 1];
  }

  return x;
}

/**
 * Nội suy Spline bậc ba tự nhiên (Natural Cubic Spline) cho đường viền núi và mái đình.
 * S_k(x) = a_k + b_k(x - x_k) + c_k(x - x_k)^2 + d_k(x - x_k)^3
 * Điều kiện biên tự nhiên: S''(x_0) = S''(x_n) = 0 => c_0 = c_n = 0.
 * 
 * @param {Array<number>|Float64Array} xIn - Tọa độ x các mốc (phải tăng dần)
 * @param {Array<number>|Float64Array} yIn - Tọa độ y tương ứng
 * @returns {Object} Bộ hàm nội suy Spline
 */
export function spline(xIn, yIn) {
  const n = xIn.length - 1;
  if (n < 1) throw new Error("Spline requires at least 2 points");

  const x = new Float64Array(xIn);
  const y = new Float64Array(yIn);

  if (n === 1) {
    // Trường hợp 2 điểm: suy biến thành đoạn thẳng
    const h = x[1] - x[0];
    const b = (y[1] - y[0]) / h;
    return {
      x, y,
      a: new Float64Array([y[0]]),
      b: new Float64Array([b]),
      c: new Float64Array([0]),
      d: new Float64Array([0]),
      evaluate(xVal) {
        return y[0] + b * (xVal - x[0]);
      },
      sample(numPoints) {
        const result = [];
        const step = (x[1] - x[0]) / (numPoints - 1);
        for (let i = 0; i < numPoints; i++) {
          const curX = x[0] + i * step;
          result.push({ x: curX, y: y[0] + b * (curX - x[0]) });
        }
        return result;
      }
    };
  }

  const h = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    h[k] = x[k + 1] - x[k];
    if (h[k] <= 0) throw new Error("x coordinates must be strictly increasing");
  }

  // Lập hệ phương trình ba đường chéo cho c_1 ... c_{n-1}
  // c_0 = 0, c_n = 0
  const m = n - 1; // số ẩn
  const lower = new Float64Array(m - 1);
  const diag = new Float64Array(m);
  const upper = new Float64Array(m - 1);
  const rhs = new Float64Array(m);

  for (let k = 1; k < n; k++) {
    const idx = k - 1;
    diag[idx] = 2.0 * (h[k - 1] + h[k]);
    if (idx > 0) lower[idx - 1] = h[k - 1];
    if (idx < m - 1) upper[idx] = h[k];

    rhs[idx] = 3.0 * ((y[k + 1] - y[k]) / h[k] - (y[k] - y[k - 1]) / h[k - 1]);
  }

  const cInner = tri_diag({ lower, diag, upper }, rhs);

  const a = new Float64Array(n);
  const b = new Float64Array(n);
  const c = new Float64Array(n + 1);
  const d = new Float64Array(n);

  c[0] = 0.0;
  for (let k = 1; k < n; k++) {
    c[k] = cInner[k - 1];
  }
  c[n] = 0.0;

  for (let k = 0; k < n; k++) {
    a[k] = y[k];
    b[k] = (y[k + 1] - y[k]) / h[k] - (h[k] / 3.0) * (c[k + 1] + 2.0 * c[k]);
    d[k] = (c[k + 1] - c[k]) / (3.0 * h[k]);
  }

  function findInterval(xVal) {
    if (xVal <= x[0]) return 0;
    if (xVal >= x[n]) return n - 1;
    let low = 0, high = n - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (xVal < x[mid]) high = mid - 1;
      else if (xVal > x[mid + 1]) low = mid + 1;
      else return mid;
    }
    return Math.min(low, n - 1);
  }

  function evaluate(xVal) {
    const k = findInterval(xVal);
    const dx = xVal - x[k];
    return a[k] + b[k] * dx + c[k] * dx * dx + d[k] * dx * dx * dx;
  }

  function sample(numPoints, startX = x[0], endX = x[n]) {
    const pts = [];
    const step = (endX - startX) / (numPoints - 1);
    for (let i = 0; i < numPoints; i++) {
      const curX = startX + i * step;
      pts.push({ x: curX, y: evaluate(curX) });
    }
    return pts;
  }

  return { x, y, a, b, c, d, evaluate, sample };
}

/**
 * Đường cong tham số Bézier / Hermite bậc ba cho thân tre, lá trúc và thuyền nan.
 * x(t) = a*t^3 + b*t^2 + c*t + d
 * y(t) = p*t^3 + q*t^2 + r*t + s, với t in [0, 1].
 * 
 * @param {Array<number>} X - Tọa độ x của 4 điểm kiểm soát [P0, P1, P2, P3]
 * @param {Array<number>} Y - Tọa độ y của 4 điểm kiểm soát [P0, P1, P2, P3]
 * @returns {Object} Bộ hàm tham số Bézier
 */
export function bezier(X, Y) {
  const x0 = X[0], x1 = X[1], x2 = X[2], x3 = X[3];
  const y0 = Y[0], y1 = Y[1], y2 = Y[2], y3 = Y[3];

  // Hệ số đa thức theo dạng chuẩn t:
  // B(t) = (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t) t^2 P2 + t^3 P3
  // B(t) = P0 + 3(P1 - P0) t + 3(P2 - 2P1 + P0) t^2 + (P3 - 3P2 + 3P1 - P0) t^3
  const c_x = 3.0 * (x1 - x0);
  const b_x = 3.0 * (x2 - 2.0 * x1 + x0);
  const a_x = x3 - 3.0 * x2 + 3.0 * x1 - x0;
  const d_x = x0;

  const c_y = 3.0 * (y1 - y0);
  const b_y = 3.0 * (y2 - 2.0 * y1 + y0);
  const a_y = y3 - 3.0 * y2 + 3.0 * y1 - y0;
  const d_y = y0;

  function evaluate(t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: a_x * t3 + b_x * t2 + c_x * t + d_x,
      y: a_y * t3 + b_y * t2 + c_y * t + d_y
    };
  }

  function sample(steps = 20) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push(evaluate(t));
    }
    return pts;
  }

  return { a_x, b_x, c_x, d_x, a_y, b_y, c_y, d_y, evaluate, sample };
}

/**
 * Giải hệ phương trình vi phân cấp 1 bằng Runge-Kutta bậc 4 (RK4).
 * Tính quỹ đạo trôi êm ả của thuyền độc mộc hoặc cánh chim trong trường vector dòng chảy.
 * 
 * @param {Function} velocityField - Hàm (x, y, t) => [vx, vy] trả về trường vận tốc
 * @param {Array<number>} p0 - Tọa độ ban đầu [x0, y0]
 * @param {number} t0 - Thời điểm bắt đầu
 * @param {number} dt - Bước thời gian
 * @param {number} steps - Số bước lặp
 * @returns {Array<{x: number, y: number, t: number}>} Quỹ đạo điểm
 */
export function rk4sys2(velocityField, p0, t0 = 0, dt = 0.1, steps = 50) {
  const traj = [{ x: p0[0], y: p0[1], t: t0 }];
  let curX = p0[0];
  let curY = p0[1];
  let curT = t0;

  for (let step = 0; step < steps; step++) {
    // K1 = f(tn, yn)
    const [vx1, vy1] = velocityField(curX, curY, curT);

    // K2 = f(tn + dt/2, yn + dt/2 * K1)
    const [vx2, vy2] = velocityField(
      curX + 0.5 * dt * vx1,
      curY + 0.5 * dt * vy1,
      curT + 0.5 * dt
    );

    // K3 = f(tn + dt/2, yn + dt/2 * K2)
    const [vx3, vy3] = velocityField(
      curX + 0.5 * dt * vx2,
      curY + 0.5 * dt * vy2,
      curT + 0.5 * dt
    );

    // K4 = f(tn + dt, yn + dt * K3)
    const [vx4, vy4] = velocityField(
      curX + dt * vx3,
      curY + dt * vy3,
      curT + dt
    );

    curX += (dt / 6.0) * (vx1 + 2.0 * vx2 + 2.0 * vx3 + vx4);
    curY += (dt / 6.0) * (vy1 + 2.0 * vy2 + 2.0 * vy3 + vy4);
    curT += dt;

    traj.push({ x: curX, y: curY, t: curT });
  }

  return traj;
}

/**
 * Giải phương trình truyền nhiệt Parabolic tạo sương mù khuếch tán: du/dt = gamma * d2u/dx2
 * Áp dụng sơ đồ sai phân hữu hạn tường minh (Explicit FDM):
 * u^(j+1) = A * u^(j)
 * Ràng buộc ổn định bắt buộc: mu = gamma * dt / (dx^2) <= 0.5
 * 
 * @param {Float64Array|Array<number>} uInit - Mật độ sương mù ban đầu
 * @param {number} gamma - Hệ số khuếch tán nhiệt/sương
 * @param {number} dt - Bước thời gian
 * @param {number} dx - Bước không gian
 * @param {number} steps - Số bước lặp thời gian
 * @returns {Float64Array} Mật độ sương sau khuếch tán
 */
export function parabolicDiffusion1D(uInit, gamma = 0.5, dt = 0.01, dx = 0.2, steps = 10) {
  let mu = (gamma * dt) / (dx * dx);

  // Khóa chặt tham số để đảm bảo sơ đồ hiển luôn ổn định tuyệt đối
  if (mu > 0.5) {
    // Tự động điều chỉnh dt an toàn với ngưỡng làm tròn lên
    dt = 0.49 * (dx * dx) / gamma;
    mu = (gamma * dt) / (dx * dx);
  }

  const n = uInit.length;
  let u = new Float64Array(uInit);
  let nextU = new Float64Array(n);

  const diagWeight = 1.0 - 2.0 * mu;

  for (let s = 0; s < steps; s++) {
    // Điều kiện biên Neumann (dẫn xuất biên triệt tiêu, phản xạ sương)
    nextU[0] = diagWeight * u[0] + 2.0 * mu * u[1];
    nextU[n - 1] = diagWeight * u[n - 1] + 2.0 * mu * u[n - 2];

    for (let i = 1; i < n - 1; i++) {
      nextU[i] = mu * u[i - 1] + diagWeight * u[i] + mu * u[i + 1];
    }

    // Hoán đổi buffer
    const temp = u;
    u = nextU;
    nextU = temp;
  }

  return u;
}
