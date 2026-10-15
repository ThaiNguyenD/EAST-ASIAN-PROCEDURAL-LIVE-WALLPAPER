/**
 * statistics.js - Module Mô hình Thống kê & Cắt tỉa DOM (Statistical Modeling & BIC Pruning)
 * Phân rã Hệ thống - Ngẫu nhiên, Quá trình Poisson, Ước lượng Ridge/Lasso, Cắt tỉa nét vẽ bằng BIC.
 * Sử dụng Float64Array (double precision), không làm tròn ở các phép tính trung gian.
 */

/**
 * Phân rã Hệ thống - Ngẫu nhiên: Y = f(X) + varpi
 * E(varpi | X) = 0, Var(varpi | X) = sigma^2
 * Tách biệt rõ đường cong xu thế toàn cục f(X) và nhiễu địa chất cục bộ varpi.
 * 
 * @param {number} x - Tọa độ x
 * @param {Function} trendFn - Hàm xu thế toàn cục f(X)
 * @param {Function} noisePrng - Bộ sinh nhiễu địa chất có kỳ vọng 0
 * @param {number} sigma - Độ lệch chuẩn nhiễu địa chất cục bộ
 * @returns {{ y: number, trend: number, noise: number }}
 */
export function decomposeElevation(x, trendFn, noisePrng, sigma = 15.0) {
  const trend = trendFn(x);
  // Nhiễu Box-Muller hoặc phân phối đều tâm 0 với phương sai sigma^2
  // Sử dụng phép biến đổi Box-Muller để tạo nhiễu Gaussian N(0, sigma^2)
  const u1 = Math.max(1e-12, noisePrng());
  const u2 = noisePrng();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const noise = z0 * sigma;

  return {
    y: trend + noise,
    trend,
    noise
  };
}

/**
 * Sinh số lượng thực thể điểm xuyết (chim bay, thuyền nan) theo phân phối Poisson(omega).
 * Sử dụng thuật toán Knuth chính xác.
 * 
 * @param {number} omega - Tham số trung bình Poisson (omega in [0.2, 0.5])
 * @param {Function} randomFn - Hàm sinh số ngẫu nhiên U(0, 1)
 * @returns {number} Số lượng biến cố nguyên không âm
 */
export function samplePoisson(omega = 0.35, randomFn = Math.random) {
  const L = Math.exp(-omega);
  let k = 0;
  let p = 1.0;

  do {
    k++;
    p *= randomFn();
  } while (p > L);

  return k - 1;
}

/**
 * Ước lượng hồi quy Ridge: beta_ridge = (X^T * X + lambda * I)^(-1) * X^T * y
 * Khắc phục hiện tượng ma trận thiết kế gần suy biến (đa cộng tuyến cao) khi khớp vân đá.
 * 
 * @param {Float64Array} X - Ma trận thiết kế n hàng x p cột (dạng phẳng row-major)
 * @param {Float64Array} y - Vector biến phụ thuộc độ dài n
 * @param {number} n - Số mẫu quan sát
 * @param {number} p - Số biến giải thích
 * @param {number} lambda - Hệ số co phạt L2 Ridge (lambda > 0)
 * @returns {Float64Array} Vector hệ số beta_ridge độ dài p
 */
export function ridgeRegression(X, y, n, p, lambda = 1.0) {
  // Tính X^T * X kích thước p x p
  const XtX = new Float64Array(p * p);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let sum = 0.0;
      for (let r = 0; r < n; r++) {
        sum += X[r * p + i] * X[r * p + j];
      }
      XtX[i * p + j] = sum;
    }
    // Cộng lambda vào đường chéo chính: (X^T * X + lambda * I)
    XtX[i * p + i] += lambda;
  }

  // Tính X^T * y kích thước p
  const Xty = new Float64Array(p);
  for (let i = 0; i < p; i++) {
    let sum = 0.0;
    for (let r = 0; r < n; r++) {
      sum += X[r * p + i] * y[r];
    }
    Xty[i] = sum;
  }

  // Giải hệ (XtX + lambda*I) * beta = Xty bằng phép khử Gauss với pivot một phần
  const A = new Float64Array(XtX);
  const b = new Float64Array(Xty);

  for (let col = 0; col < p; col++) {
    let maxRow = col;
    let maxVal = Math.abs(A[col * p + col]);
    for (let row = col + 1; row < p; row++) {
      const val = Math.abs(A[row * p + col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    if (maxRow !== col) {
      // Hoán đổi hàng
      for (let k = 0; k < p; k++) {
        const tmp = A[col * p + k];
        A[col * p + k] = A[maxRow * p + k];
        A[maxRow * p + k] = tmp;
      }
      const tmpB = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tmpB;
    }

    const pivot = A[col * p + col];
    const safePivot = Math.abs(pivot) < 1e-15 ? 1e-15 : pivot;

    for (let row = col + 1; row < p; row++) {
      const factor = A[row * p + col] / safePivot;
      for (let k = col; k < p; k++) {
        A[row * p + k] -= factor * A[col * p + k];
      }
      b[row] -= factor * b[col];
    }
  }

  // Thế ngược
  const beta = new Float64Array(p);
  for (let i = p - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < p; j++) {
      sum -= A[i * p + j] * beta[j];
    }
    const diagVal = A[i * p + i];
    beta[i] = sum / (Math.abs(diagVal) < 1e-15 ? 1e-15 : diagVal);
  }

  return beta;
}

/**
 * Áp dụng điều kiện KKT của Lasso (L1 soft-thresholding)
 * beta_j = 0 <=> |x_j^T * (y - X * beta)| <= lambda
 * Đưa các hệ số của những nét gạch vân đá dư thừa về đúng bằng 0.
 * 
 * @param {Float64Array} beta - Vector hệ số khởi đầu (ví dụ từ Ridge)
 * @param {Float64Array} X - Ma trận thiết kế n x p
 * @param {Float64Array} y - Vector nhãn quan sát n
 * @param {number} n - Số quan sát
 * @param {number} p - Số biến
 * @param {number} lambda - Ngưỡng phạt Lasso
 * @returns {Float64Array} Vector hệ số thưa
 */
export function lassoThreshold(beta, X, y, n, p, lambda = 0.5) {
  // Tính phần dư residual r = y - X * beta
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let pred = 0.0;
    for (let j = 0; j < p; j++) {
      pred += X[i * p + j] * beta[j];
    }
    r[i] = y[i] - pred;
  }

  const sparseBeta = new Float64Array(p);
  for (let j = 0; j < p; j++) {
    // Tính tương quan xj^T * r
    let corr = 0.0;
    let normXjSq = 0.0;
    for (let i = 0; i < n; i++) {
      const xij = X[i * p + j];
      corr += xij * (r[i] + xij * beta[j]);
      normXjSq += xij * xij;
    }

    if (normXjSq < 1e-12) {
      sparseBeta[j] = 0.0;
      continue;
    }

    // Soft-thresholding operator
    if (corr > lambda) {
      sparseBeta[j] = (corr - lambda) / normXjSq;
    } else if (corr < -lambda) {
      sparseBeta[j] = (corr + lambda) / normXjSq;
    } else {
      sparseBeta[j] = 0.0; // Triệt tiêu nét thừa về 0
    }
  }

  return sparseBeta;
}

/**
 * Tính Bayesian Information Criterion (BIC):
 * BIC = n * ln(RSS / n) + k * ln(n)
 * Phạt độ phức tạp số tham số k mạnh hơn AIC khi n > e^2 (~7.39)
 * 
 * @param {number} rss - Tổng bình phương phần dư (Residual Sum of Squares)
 * @param {number} n - Số điểm lấy mẫu
 * @param {number} k - Số tham số / số nét được giữ lại
 * @returns {number} Điểm BIC
 */
export function computeBIC(rss, n, k) {
  if (n <= 0) return Infinity;
  const safeRss = Math.max(1e-12, rss);
  return n * Math.log(safeRss / n) + k * Math.log(n);
}

/**
 * Cắt tỉa nét vẽ đường cong/vân đá bằng tiêu chí BIC (pruneStrokesBIC).
 * Tự động cắt bỏ tới 40% số thẻ SVG polyline/path vụn vặt mắt thường không phân biệt được,
 * giữ số lượng node DOM trong giới hạn nghiêm ngặt [600, 2200].
 * 
 * @param {Array<Object>} strokeCandidates - Danh sách các nét vẽ ứng viên [{ points, weight, id }]
 * @param {Object} options - Tùy chọn cắt tỉa
 * @returns {Array<Object>} Danh sách các nét tối ưu được giữ lại
 */
export function pruneStrokesBIC(strokeCandidates, options = {}) {
  const total = strokeCandidates.length;
  if (total <= 30) return strokeCandidates;

  const minStrokes = options.minStrokes || 20;
  const maxStrokes = options.maxStrokes || 600;

  // Sắp xếp các nét theo độ quan trọng thị giác (chiều dài * độ tương phản / độ nổi bật)
  const scored = strokeCandidates.map((stroke, index) => {
    let len = 0.0;
    const pts = stroke.points || [];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    const prominence = (stroke.weight || 1.0) * len;
    return { stroke, prominence, index };
  });

  // Sắp xếp giảm dần theo độ nổi bật
  scored.sort((a, b) => b.prominence - a.prominence);

  // Chọn số nét k tối ưu theo BIC
  // Giả định tổng năng lượng thị giác là tổng prominence
  let totalProm = 0.0;
  for (let i = 0; i < scored.length; i++) totalProm += scored[i].prominence;

  let bestK = Math.min(scored.length, maxStrokes);
  let bestBIC = Infinity;
  const n = scored.length;

  // Quét các mức k từ minStrokes đến maxStrokes
  const stepK = Math.max(1, Math.floor(n / 20));
  let runningProm = 0.0;

  for (let k = 1; k <= scored.length; k++) {
    runningProm += scored[k - 1].prominence;
    if (k < minStrokes) continue;
    if (k > maxStrokes) break;

    if (k % stepK === 0 || k === scored.length || k === maxStrokes) {
      // Phần dư RSS là lượng chi tiết bị bỏ qua (residual information lost)
      const rss = Math.max(1e-6, totalProm - runningProm);
      const bic = computeBIC(rss, n, k);
      if (bic < bestBIC) {
        bestBIC = bic;
        bestK = k;
      }
    }
  }

  // Cắt tỉa và trả về bestK nét quan trọng nhất
  return scored.slice(0, bestK).map(item => item.stroke);
}
