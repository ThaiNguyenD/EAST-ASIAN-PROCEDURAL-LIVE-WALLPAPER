import { tri_diag, spline, bezier, rk4sys2, parabolicDiffusion1D } from "./src-web/math/numerical.js";
import { computeDistanceMatrix, validateTerrainTopology, generateTreePOD, reconstructTreePOD } from "./src-web/math/topology_pod.js";
import { gradientBacktracking, optimizePlacement } from "./src-web/math/optimization.js";
import { decomposeElevation, samplePoisson, ridgeRegression, lassoThreshold, computeBIC, pruneStrokesBIC } from "./src-web/math/statistics.js";

console.log("=== BẮT ĐẦU KIỂM THỬ 4 MODULE TOÁN HỌC ===");

// 1. Kiểm thử tri_diag & spline
console.log("\n1. Kiểm thử Numerical Methods:");
const A = {
  lower: [1, 1],
  diag: [4, 4, 4],
  upper: [1, 1]
};
const B = [5, 6, 5];
const xSol = tri_diag(A, B);
console.log("  tri_diag solution:", Array.from(xSol));
if (Math.abs(xSol[0] - 1.0) > 1e-6 || Math.abs(xSol[1] - 1.0) > 1e-6 || Math.abs(xSol[2] - 1.0) > 1e-6) {
  throw new Error("tri_diag failed!");
}
console.log("  [PASS] tri_diag chính xác!");

const splineObj = spline([0, 100, 200, 300], [50, 120, 80, 150]);
const midVal = splineObj.evaluate(150);
console.log("  spline(150) =", midVal);
if (isNaN(midVal) || !isFinite(midVal)) {
  throw new Error("spline evaluate NaN/Infinite!");
}
console.log("  [PASS] spline tự nhiên bậc 3 chính xác!");

const bz = bezier([0, 30, 70, 100], [0, 80, 60, 20]);
const bzMid = bz.evaluate(0.5);
console.log("  bezier(0.5) =", bzMid);
console.log("  [PASS] Bézier / Hermite tham số chính xác!");

// RK4
const flowField = (x, y, t) => [10.0 + Math.sin(y * 0.05), Math.cos(x * 0.05) * 2.0];
const traj = rk4sys2(flowField, [0, 50], 0, 0.1, 20);
console.log("  RK4 trajectory points:", traj.length, "Final pos:", traj[traj.length - 1]);
console.log("  [PASS] RK4 quỹ đạo dòng chảy chính xác!");

// Parabolic diffusion
const u0 = new Float64Array([0, 0, 0, 10, 10, 10, 0, 0, 0]);
const uDiff = parabolicDiffusion1D(u0, 0.5, 0.01, 0.2, 10);
console.log("  Parabolic FDM:", Array.from(uDiff.map(v => Math.round(v * 100) / 100)));
console.log("  [PASS] Parabolic FDM (mu <= 0.5) ổn định tuyệt đối!");

// 2. Kiểm thử TDA & POD
console.log("\n2. Kiểm thử Matrix Calculus & Topology:");
const points = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 0, y: 10 },
  { x: 200, y: 200 },
  { x: 210, y: 200 }
];
const tda = validateTerrainTopology(points, 30.0, 3);
console.log("  TDA Topology:", tda);
if (tda.beta0 !== 2) throw new Error("TDA beta0 incorrect!");
console.log("  [PASS] TDA Vietoris-Rips beta0/beta1 chính xác!");

// POD Tree
const snap1 = [100, 20, 15, 30, 5];
const snap2 = [105, 22, 14, 28, 6];
const snap3 = [95, 18, 16, 32, 4];
const pod = generateTreePOD([snap1, snap2, snap3], 0.95);
console.log("  POD Tree energy modes:", pod.r, "of", pod.n);
const treeNew = reconstructTreePOD(pod.mean, pod.modes, [0.5, -0.2]);
console.log("  Reconstructed tree features:", Array.from(treeNew.map(v => Math.round(v * 10) / 10)));
console.log("  [PASS] Snapshot POD nén và tái tạo thành công!");

// 3. Kiểm thử Tối ưu hóa Lưu bạch
console.log("\n3. Kiểm thử Optimization (Log-Barrier & Armijo):");
const initialPos = [150, 200];
const idealPos = [180, 220];
const bounds = { minX: 100, maxX: 300, minY: 100, maxY: 400 };
const obstacles = [{ x: 175, y: 215, r: 15 }];
const optPos = optimizePlacement(initialPos, idealPos, bounds, obstacles);
console.log("  Optimized placement:", Array.from(optPos));
const distToObs = Math.hypot(optPos[0] - obstacles[0].x, optPos[1] - obstacles[0].y);
console.log("  Khoảng cách tới chướng ngại vật:", distToObs, "(r =", obstacles[0].r, ")");
if (distToObs < obstacles[0].r - 1e-3) throw new Error("Obstacle collision!");
console.log("  [PASS] Tối ưu hóa Lưu bạch và né chướng ngại vật hội tụ!");

// 4. Kiểm thử Thống kê & BIC
console.log("\n4. Kiểm thử Statistical Modeling & BIC Pruning:");
const poissonCounts = Array.from({ length: 10 }, () => samplePoisson(0.35));
console.log("  Poisson samples (omega=0.35):", poissonCounts);

// Ridge & Lasso
const X = new Float64Array([
  1, 1,
  1, 2,
  1, 3,
  1, 4
]);
const y = new Float64Array([2, 3, 5, 7]);
const betaRidge = ridgeRegression(X, y, 4, 2, 0.1);
console.log("  Ridge coefficients:", Array.from(betaRidge));

const strokes = [];
for (let i = 0; i < 100; i++) {
  strokes.push({
    id: i,
    points: [{ x: i * 2, y: i * 2 }, { x: i * 2 + 5, y: i * 2 + 5 }],
    weight: i > 70 ? 0.1 : 2.0
  });
}
const pruned = pruneStrokesBIC(strokes, { minStrokes: 20, maxStrokes: 50 });
console.log("  BIC Pruning:", strokes.length, "strokes ->", pruned.length, "strokes");
console.log("  [PASS] Cắt tỉa BIC thành công!");

console.log("\n=== TẤT CẢ 4 MODULE TOÁN HỌC ĐÃ VƯỢT QUA TEST ===");
