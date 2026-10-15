/**
 * topology_pod.js - Module Giải tích Ma trận & Topo Tính toán
 * TDA Vietoris-Rips (H0/H1 Betti numbers) & Snapshot Proper Orthogonal Decomposition (POD)
 */

/**
 * Tính ma trận khoảng cách Euclid giữa đám mây điểm 2D.
 * Sử dụng Float64Array.
 * 
 * @param {Array<{x: number, y: number}>|Array<[number, number]>} points 
 * @returns {Float64Array} Ma trận đối xứng dạng phẳng N x N
 */
export function computeDistanceMatrix(points) {
  const n = points.length;
  const dist = new Float64Array(n * n);

  for (let i = 0; i < n; i++) {
    const pi = points[i];
    const xi = Array.isArray(pi) ? pi[0] : pi.x;
    const yi = Array.isArray(pi) ? pi[1] : pi.y;

    for (let j = i + 1; j < n; j++) {
      const pj = points[j];
      const xj = Array.isArray(pj) ? pj[0] : pj.x;
      const yj = Array.isArray(pj) ? pj[1] : pj.y;

      const dx = xi - xj;
      const dy = yi - yj;
      const d = Math.sqrt(dx * dx + dy * dy);

      dist[i * n + j] = d;
      dist[j * n + i] = d;
    }
  }

  return dist;
}

/**
 * Kiểm soát hình thái địa hình bằng TDA Pipeline (Vietoris-Rips Complex).
 * Bước 1: Lập ma trận khoảng cách d.
 * Bước 2: Lập ma trận kề phức Vietoris-Rips Adj_epsilon với sigma_ij = 1 nếu d_ij <= epsilon.
 * Bước 3 & 4: Tính số Betti beta0 (số thành phần liên thông/cụm núi) và beta1 (chu trình 1 chiều).
 * Bước 5: Ra quyết định điều chỉnh mức độ làm mịn núi.
 * 
 * @param {Array<{x: number, y: number}>} points - Đám mây điểm đỉnh núi
 * @param {number} epsilon - Bán kính lân cận kết nối
 * @param {number} maxBeta0 - Ngưỡng tối đa cho phép các cụm núi rời rạc
 * @returns {Object} { valid: boolean, beta0: number, beta1: number, action: string, n0: number, n1: number }
 */
export function validateTerrainTopology(points, epsilon = 80.0, maxBeta0 = 4) {
  const n0 = points.length;
  if (n0 === 0) return { valid: true, beta0: 0, beta1: 0, action: "none", n0: 0, n1: 0 };
  if (n0 === 1) return { valid: true, beta0: 1, beta1: 0, action: "none", n0: 1, n1: 0 };

  const dist = computeDistanceMatrix(points);
  const adj = new Uint8Array(n0 * n0);
  let n1 = 0; // Số cạnh

  // Disjoint Set Union (DSU) để tính beta0
  const parent = new Int32Array(n0);
  for (let i = 0; i < n0; i++) parent[i] = i;

  function find(i) {
    let root = i;
    while (root !== parent[root]) root = parent[root];
    let curr = i;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  }

  function union(i, j) {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootI] = rootJ;
      return true;
    }
    return false;
  }

  for (let i = 0; i < n0; i++) {
    for (let j = i + 1; j < n0; j++) {
      if (dist[i * n0 + j] <= epsilon) {
        adj[i * n0 + j] = 1;
        adj[j * n0 + i] = 1;
        n1++;
        union(i, j);
      }
    }
  }

  // Đếm số thành phần liên thông beta0
  let beta0 = 0;
  for (let i = 0; i < n0; i++) {
    if (parent[i] === i) beta0++;
  }

  // Đẳng thức lý thuyết đồ thị: rank(partial_1) = n0 - beta0
  const rankPartial1 = n0 - beta0;

  // Đếm số tam giác (2-simplices) hình thành bởi 3 đỉnh có cạnh đôi một
  let n2 = 0;
  for (let i = 0; i < n0; i++) {
    for (let j = i + 1; j < n0; j++) {
      if (adj[i * n0 + j] === 1) {
        for (let k = j + 1; k < n0; k++) {
          if (adj[i * n0 + k] === 1 && adj[j * n0 + k] === 1) {
            n2++;
          }
        }
      }
    }
  }

  // rank(partial_2) xấp xỉ số tam giác độc lập (đảm bảo không âm)
  const rankPartial2 = Math.min(n2, Math.max(0, n1 - rankPartial1));
  const beta1 = Math.max(0, n1 - rankPartial1 - rankPartial2);

  const valid = beta0 <= maxBeta0;
  return {
    valid,
    beta0,
    beta1,
    action: valid ? "ok" : "smooth",
    n0,
    n1,
    n2
  };
}

/**
 * Thuật toán Jacobi tìm giá trị riêng và vector riêng của ma trận đối xứng thực.
 * Sử dụng Float64Array.
 * 
 * @param {Float64Array} A - Ma trận đối xứng n x n
 * @param {number} n - Kích thước ma trận
 * @returns {{ values: Float64Array, vectors: Float64Array }}
 */
function jacobiEigenvalues(A, n) {
  const a = new Float64Array(A);
  const v = new Float64Array(n * n);
  // Khởi tạo ma trận v là ma trận đơn vị
  for (let i = 0; i < n; i++) v[i * n + i] = 1.0;

  const maxIter = 100;
  for (let iter = 0; iter < maxIter; iter++) {
    // Tìm phần tử ngoài đường chéo lớn nhất
    let maxVal = 0.0;
    let p = 0, q = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const absVal = Math.abs(a[i * n + j]);
        if (absVal > maxVal) {
          maxVal = absVal;
          p = i;
          q = j;
        }
      }
    }

    if (maxVal < 1e-12) break; // Đã hội tụ

    const app = a[p * n + p];
    const aqq = a[q * n + q];
    const apq = a[p * n + q];

    const theta = (aqq - app) / (2.0 * apq);
    const t = (theta >= 0)
      ? 1.0 / (theta + Math.sqrt(theta * theta + 1.0))
      : -1.0 / (-theta + Math.sqrt(theta * theta + 1.0));
    const c = 1.0 / Math.sqrt(t * t + 1.0);
    const s = t * c;

    // Cập nhật ma trận A
    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const aip = a[i * n + p];
        const aiq = a[i * n + q];
        a[i * n + p] = aip * c - aiq * s;
        a[p * n + i] = a[i * n + p];
        a[i * n + q] = aip * s + aiq * c;
        a[q * n + i] = a[i * n + q];
      }
    }

    a[p * n + p] = app - t * apq;
    a[q * n + q] = aqq + t * apq;
    a[p * n + q] = 0.0;
    a[q * n + p] = 0.0;

    // Cập nhật ma trận vector riêng V
    for (let i = 0; i < n; i++) {
      const vip = v[i * n + p];
      const viq = v[i * n + q];
      v[i * n + p] = vip * c - viq * s;
      v[i * n + q] = vip * s + viq * c;
    }
  }

  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = a[i * n + i];

  return { values, vectors: v };
}

/**
 * Sinh biến thể cây cổ thụ bằng Snapshot Proper Orthogonal Decomposition (POD).
 * 
 * @param {Array<Array<number>>|Array<Float64Array>} snapshots - Danh sách n mẫu cấu trúc cây (mỗi mẫu m đặc trưng)
 * @param {number} energyThreshold - Tỷ lệ năng lượng cần giữ lại (mặc định 0.95 = 95%)
 * @returns {Object} { mean: Float64Array, modes: Array<Float64Array>, eigenvalues: Float64Array, r: number }
 */
export function generateTreePOD(snapshots, energyThreshold = 0.95) {
  const n = snapshots.length; // Số mẫu snapshot
  if (n === 0) throw new Error("Snapshots must not be empty");
  const m = snapshots[0].length; // Số chiều đặc trưng

  // Tính vector trung bình xBar = (1/n) * sum(x_i)
  const mean = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    const snap = snapshots[i];
    for (let j = 0; j < m; j++) {
      mean[j] += snap[j];
    }
  }
  for (let j = 0; j < m; j++) mean[j] /= n;

  // Lập ma trận dữ liệu đã trung tâm hóa XHat (m hàng x n cột)
  const XHat = new Float64Array(m * n);
  for (let col = 0; col < n; col++) {
    const snap = snapshots[col];
    for (let row = 0; row < m; row++) {
      XHat[row * n + col] = snap[row] - mean[row];
    }
  }

  // Phương pháp Snapshot: Lập ma trận tương quan kích thước n x n: C = (1/n) * XHat^T * XHat
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let sum = 0.0;
      for (let k = 0; k < m; k++) {
        sum += XHat[k * n + i] * XHat[k * n + j];
      }
      sum /= n;
      C[i * n + j] = sum;
      C[j * n + i] = sum;
    }
  }

  // Tìm giá trị riêng và vector riêng của C
  const { values, vectors } = jacobiEigenvalues(C, n);

  // Sắp xếp các mode theo giá trị riêng giảm dần
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => values[b] - values[a]);

  let totalEnergy = 0.0;
  for (let i = 0; i < n; i++) {
    if (values[i] > 0) totalEnergy += values[i];
  }

  let accumulatedEnergy = 0.0;
  let r = 0;
  const selectedIndices = [];

  for (let k = 0; k < n; k++) {
    const idx = order[k];
    const val = Math.max(0.0, values[idx]);
    accumulatedEnergy += val;
    selectedIndices.push(idx);
    r++;
    if (totalEnergy > 0 && accumulatedEnergy / totalEnergy >= energyThreshold) {
      break;
    }
  }

  // Chuyển đổi sang các mode POD trong không gian m chiều: phi_k = (1 / sqrt(n * lambda_k)) * XHat * v_k
  const modes = [];
  for (let k = 0; k < r; k++) {
    const idx = selectedIndices[k];
    const lambda = Math.max(1e-12, values[idx]);
    const norm = Math.sqrt(n * lambda);
    const phi = new Float64Array(m);

    for (let row = 0; row < m; row++) {
      let sum = 0.0;
      for (let col = 0; col < n; col++) {
        sum += XHat[row * n + col] * vectors[col * n + idx];
      }
      phi[row] = sum / norm;
    }
    modes.push(phi);
  }

  const sortedEigenvalues = new Float64Array(r);
  for (let k = 0; k < r; k++) {
    sortedEigenvalues[k] = Math.max(0.0, values[selectedIndices[k]]);
  }

  return {
    mean,
    modes,
    eigenvalues: sortedEigenvalues,
    r,
    m,
    n
  };
}

/**
 * Tái tạo cấu trúc cây mới qua tổ hợp tuyến tính POD: x_tilde = x_mean + sum(a_k * phi_k)
 * 
 * @param {Float64Array} mean - Vector cấu trúc cây trung bình
 * @param {Array<Float64Array>} modes - Các mode POD trực chuẩn chính
 * @param {Array<number>|Float64Array} coeffs - Hệ số POD a_k
 * @returns {Float64Array} Cấu trúc cây mới
 */
export function reconstructTreePOD(mean, modes, coeffs) {
  const m = mean.length;
  const result = new Float64Array(m);
  for (let i = 0; i < m; i++) result[i] = mean[i];

  const r = Math.min(modes.length, coeffs.length);
  for (let k = 0; k < r; k++) {
    const ak = coeffs[k];
    const phi = modes[k];
    for (let i = 0; i < m; i++) {
      result[i] += ak * phi[i];
    }
  }

  return result;
}
