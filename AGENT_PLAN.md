# PROJECT SPECIFICATION: EAST ASIAN PROCEDURAL LIVE WALLPAPER (.EXE)
**Base Repository:** `https://github.com/LingDong-/shan-shui-inf`
**Target Platform:** Windows 10/11 Native Live Wallpaper (`.exe` via C# .NET 8 + WebView2 + Win32 `WorkerW` + DirectML/WebNN NPU Offload)

---

## 0. ARCHITECTURAL GUARDRAILS (QUY TẮC BẤT DI BẤT DỊCH CHO AI AGENT)

1. **Kiến trúc 2 Tầng (Two-Tier Execution):**
   * **Tier 1 - Render Loop (Main Thread - 120 FPS):** Chỉ thực hiện tịnh tiến `viewBox` của thẻ `<svg>` và thu hồi bộ nhớ (xóa các node DOM đã trôi qua biên trái màn hình). Tuyệt đối KHÔNG chạy thuật toán sinh hình học hay giải phương trình tại đây.
   * **Tier 2 - Chunk Generator (Background Web Worker / C# Host):** Chỉ kích hoạt bất đồng bộ khi màn hình cuộn gần hết vùng đệm (mỗi `chunkWidth = 1200px`, khoảng 5–10 giây/lần).
2. **Độ chính xác Số học (Numerical Precision):**
   * Mọi thuật toán giải hệ phương trình và tối ưu hóa trên CPU phải dùng kiểu `Float64Array` (double precision).
   * Tuyệt đối tránh làm tròn ở các phép toán trung gian vì sau khi làm tròn sai số sẽ tăng lên và gây sai lệch nghiêm trọng ở các công thức truy hồi; chỉ làm tròn ở kết quả tọa độ hiển thị cuối cùng[cite: 48, 49]. Đối với các ngưỡng đánh giá sai số tuyệt đối giới hạn, luôn phải làm tròn lên[cite: 31, 48].
3. **Phân bổ Phần cứng Dị cấu trúc (Heterogeneous Routing):**
   * **CPU:** Chạy các thuật toán có tính truy hồi tuần tự hoặc rẽ nhánh điều kiện (`if/else`, `while`) gồm: giải hệ ba đường chéo Crout, nội suy Spline/Bézier, Runge-Kutta bậc 4, và tối ưu Gradient quay lui Armijo.
   * **NPU (qua WebNN / ONNX Runtime DirectML):** Chỉ chạy các phép toán thuần Tensor/Ma trận song song không rẽ nhánh gồm: nhân ma trận truyền nhiệt Parabolic, tái tạo tổ hợp tuyến tính POD, tính ma trận khoảng cách/kề TDA, và mạng CNN siêu nhẹ tạo hiệu ứng loang mực.

---

## 1. CẤU TRÚC THƯ MỤC DỰ ÁN (TARGET DIRECTORY STRUCTURE)

```text
EastAsianWallpaper/
├── AGENT_PLAN.md
├── src-web/                        # Frontend & Math Engine (JS ES6 Modules)
│   ├── index.html                  # Giao diện SVG & bộ lọc nền giấy
│   ├── main.js                     # Vòng lặp 60 FPS & quản lý Viewport/DOM
│   ├── worker.js                   # Web Worker chạy bất đồng bộ sinh Chunk mới
│   ├── math/
│   │   ├── numerical.js            # Spline bậc 3, Bézier, RK4, FDM Parabolic
│   │   ├── topology_pod.js         # TDA Vietoris-Rips (H0/H1) & Snapshot POD
│   │   ├── optimization.js         # Hàm chắn Logarit & Gradient quay lui Armijo
│   │   └── statistics.js           # Phân rã hệ thống/nhiễu, Poisson, Ridge/Lasso/BIC
│   └── generators/
│       ├── terrain.js              # Núi đá vôi Karst, ruộng bậc thang, mặt nước
│       ├── flora.js                # Tre trúc, tùng bách, đầm sen
│       └── cultural.js             # Thuyền độc mộc, nhà tranh, dấu triện
└── src-win32/                      # Native Windows Wrapper (.NET 8 C#)
    ├── EastAsianWallpaper.csproj
    ├── Program.cs                  # Điểm vào ứng dụng & System Tray Icon
    ├── WallpaperForm.cs            # Cửa sổ không viền chứa WebView2
    ├── WorkerWHelper.cs            # Win32 P/Invoke gắn cửa sổ dưới icon Desktop
    ├── PowerManager.cs             # Tự động Pause khi Fullscreen/Game & chống crash Explorer
    └── NpuAccelerator.cs           # ONNX Runtime DirectML bridge cho tác vụ Tensor
```

---

## 2. LỘ TRÌNH THỰC THI CHI TIẾT (PHASED IMPLEMENTATION)

### PHASE 1: TÁI CẤU TRÚC CORE ENGINE & HÒA SẮC Á ĐÔNG

**Mục tiêu:** Chuyển đổi mã nguồn `shan-shui-inf` sang cấu trúc module và thiết lập ngữ pháp thị giác Á Đông.

1. **Tách biệt hệ thống PRNG & Chunk Manager (`src-web/main.js`, `worker.js`):**
* Giữ lại hàm Perlin Noise và bộ sinh số giả ngẫu nhiên có hạt giống (seed) theo tọa độ $x$.
* Cài đặt bộ dọn rác DOM (Garbage Collector): Mọi nhóm phần tử `<g>` có tọa độ $x_{\max} < \text{viewBox.x} - 600$ phải bị gọi `.remove()` ngay lập tức để giữ số lượng node DOM ổn định.

2. **Hòa sắc "Thủy Mặc & Lụa Đông Dương" (`src-web/index.html`):**
* Thiết lập nền canvas màu giấy dó/xuyến chỉ cổ (`#f4ede2`).
* Phân lớp chiều sâu khí quyển bằng sắc độ mực:
* Tiền cảnh ($z = 0$): Mực đen ánh nâu chàm (`#2b2623`, `opacity: 0.90`).
* Trung cảnh ($z = 1$): Xám tiêu (`#3d352e`, `opacity: 0.55`).
* Hậu cảnh ($z = 2$): Khói sương nhạt (`#5c5346`, `opacity: 0.20`).
* Điểm xuyết duy nhất 1 gam màu đỏ son trầm (`#a8382c`, diện tích $< 1\%$ khung hình) cho con dấu triện ở góc hoặc chi tiết nhỏ trên thuyền.

---

### PHASE 2: CÀI ĐẶT 4 MODULE TOÁN HỌC TRÊN CPU WORKER

**Mục tiêu:** Lập trình chính xác các thuật toán toán học trong thư mục `src-web/math/`.

#### Task 2.1: Module Phương pháp số (`src-web/math/numerical.js`)

1. **Giải hệ phương trình ba đường chéo `tri_diag(A, B)`:**
* Áp dụng thuật toán phân rã Crout chuyên biệt cho ma trận ba đường chéo có độ phức tạp $O(n)$ để giải nhanh hệ phương trình tuyến tính mà không dùng phép khử Gauss tổng quát hay nghịch đảo ma trận.

2. **Nội suy Spline bậc ba tự nhiên `spline(x, y)` cho đường viền núi và mái đình:**
* Trên mỗi đoạn $[x_k, x_{k+1}]$ với $h_k = x_{k+1} - x_k$, xây dựng đa thức bậc ba $S_k(x) = a_k + b_k(x - x_k) + c_k(x - x_k)^2 + d_k(x - x_k)^3$ bảo toàn tính khả vi liên tục đến cấp hai.
* Thiết lập điều kiện biên tự nhiên $S''(a) = S''(b) = 0 \implies c_0 = c_n = 0$.
* Lập hệ phương trình ba đường chéo $AC = B$ theo công thức $h_{k-1}c_{k-1} + 2(h_{k-1} + h_k)c_k + h_k c_{k+1} = 3\frac{y_{k+1} - y_k}{h_k} - 3\frac{y_k - y_{k-1}}{h_{k-1}}$, gọi `tri_diag(A, B)` để tìm vector $c$, sau đó tính $a_k = y_k$, $b_k = \frac{y_{k+1} - y_k}{h_k} - \frac{h_k}{3}(c_{k+1} + 2c_k)$ và $d_k = \frac{c_{k+1} - c_k}{3h_k}$.

3. **Đường cong tham số Bézier `bezier(X, Y)` cho thân tre, lá trúc và thuyền nan:**
* Sử dụng đa thức nội suy Hermite bậc ba dạng tham số $x(t) = at^3 + bt^2 + ct + d$ và $y(t) = pt^3 + qt^2 + rt + s$ với $t \in [0, 1]$.
* Áp dụng điều kiện đường cong đi qua hai điểm nút ở $t=0, t=1$ và đi ngang qua trung điểm của hai điểm kiểm soát tại $t = \frac{1}{2}$ để giải tìm hệ số uốn mượt cành lá.

4. **Giải hệ phương trình vi phân cấp 1 bằng Runge-Kutta bậc 4 `rk4sys2`:**
* Dùng công thức RK4 với 4 hệ số trung gian $K_1, K_2, K_3, K_4$ để tính quỹ đạo trôi êm ả của chiếc thuyền độc mộc hoặc cánh chim theo trường vận tốc dòng chảy mà không bị trôi sai số như công thức Euler đơn giản.

#### Task 2.2: Module Giải tích Ma trận & Topo Tính toán (`src-web/math/topology_pod.js`)

1. **Kiểm soát hình thái địa hình bằng TDA Pipeline (`validateTerrainTopology`):**
* Bước 1: Từ đám mây điểm đỉnh núi sơ khởi $P = \{p_1, p_2, \dots, p_n\} \subset \mathbb{R}^2$, lập ma trận khoảng cách $d = (d(p_i, p_j))_{ij}$.
* Bước 2: Với ngưỡng bán kính kết nối $\epsilon > 0$, lập ma trận kề phức Vietoris-Rips $Adj_\epsilon = (\sigma_{ij})$ trong đó $\sigma_{ij} = 1$ nếu $d(p_i, p_j) \le \epsilon$ và $\sigma_{ij} = 0$ nếu $d(p_i, p_j) > \epsilon$.
* Bước 3 & 4: Tính số Betti $\beta_0$ (số thành phần liên thông/cụm núi) và sử dụng đẳng thức lý thuyết đồ thị $\text{rank}(\partial_1) = n_0 - \beta_0$ để tính nhanh $\beta_1 = n_1 - \text{rank}(\partial_1) - \text{rank}(\partial_2)$ mà không cần xây dựng ma trận biên $\partial_1$ cồng kềnh.
* Bước 5 (Ra quyết định): Nếu $\beta_0$ vượt ngưỡng cho phép (núi bị vỡ vụn thành quá nhiều gò nhỏ rời rạc), tự động tăng bước lọc làm mịn trước khi xuất SVG.

2. **Sinh biến thể cây cổ thụ bằng Snapshot POD (`generateTreePOD`):**
* Thu thập sẵn ma trận các mẫu cấu trúc cây chuẩn (snapshots), tính vector trung bình $\bar{x} = \frac{1}{n}\sum_{i=1}^n x_i$ và trừ trung bình để lập ma trận dữ liệu đã trung tâm hóa $\hat{X}$ với $\hat{x}_i = x_i - \bar{x}$.
* Lập ma trận tương quan $C = \hat{X}^T \hat{X}$, tìm các giá trị riêng $\lambda_k$ (sắp xếp giảm dần) và các vector riêng trực chuẩn để chuyển đổi sang các mode POD $\phi_k$.
* Chọn $r$ mode chính giữ lại ít nhất $95\%$ tổng năng lượng tích lũy của hệ thống. Khi cần vẽ cây mới trong chunk, chỉ cần sinh ngẫu nhiên hệ số POD $a_k$ và tái tạo tức thời qua công thức tổ hợp tuyến tính $\tilde{x} = \bar{x} + \sum_{k=1}^r a_k \phi_k$.

#### Task 2.3: Module Cơ sở Tối ưu Bố cục "Lưu Bạch" (`src-web/math/optimization.js`)

1. **Bài toán Quy hoạch lồi với Hàm chắn Logarit (`optimizePlacement`):**
* Để đặt vị trí $x = (x_1, x_2)^T$ của các cụm thực thể (nhà tranh, khóm tre, thuyền) sao cho tôn trọng triết lý "Lưu bạch" (khoảng trống) và thỏa mãn các ràng buộc biên không gian $g_i(x) \le 0$ (không đặt nhà đè lên vách đá dốc, thuyền phải nằm trong lòng sông):
* Thiết kế hàm mục tiêu phạt mật độ $f(x)$ dạng toàn phương có ma trận Hessian xác định dương để đảm bảo hàm lồi chặt và mọi điểm dừng đều là nghiệm cực tiểu toàn cục duy nhất.
* Thiết lập hàm phạt điểm trong dạng Logarit (Logarithmic Barrier): $\psi(x, \alpha_k) = f(x) - \alpha_k \sum_{i=1}^m \ln(-g_i(x))$ với tham số phạt $\alpha_k > 0$ giảm dần theo $\alpha_{k+1} = \mu \alpha_k, \mu \in (0, 1)$.

2. **Bộ giải Gradient với Thủ tục Quay lui Armijo (`gradientBacktracking`):**
* Khởi tạo từ điểm chấp nhận được $x^0$ nằm nghiêm ngặt bên trong miền ràng buộc ($g_i(x^0) < 0$), thiết lập hệ số giảm bước $\alpha = 0.5$ và hằng số kiểm tra Armijo $m_1 = 0.01$.
* Tại mỗi bước lặp $k$, chọn hướng giảm nhanh nhất $d^k = -\nabla \psi(x^k, \alpha_k)$, đặt bước thử $t_k = 1$ và lặp kiểm tra điều kiện Armijo:
$$\psi(x^k - t_k \nabla \psi(x^k)) - \psi(x^k) \le -m_1 t_k \|\nabla \psi(x^k)\|^2$$
Nếu chưa thỏa mãn thì cập nhật $t_k := \alpha t_k$; khi thỏa mãn thì cập nhật $x^{k+1} = x^k - t_k \nabla \psi(x^k)$ và dừng khi $\|\nabla \psi\| < \varepsilon$ (giới hạn tối đa 10 vòng lặp để bảo toàn tốc độ).

#### Task 2.4: Module Mô hình Thống kê & Cắt tỉa DOM (`src-web/math/statistics.js`)

1. **Phân rã Hệ thống - Ngẫu nhiên & Quá trình Poisson:**
* Thiết kế độ cao nền địa hình theo mô hình phân rã $Y = f(X) + \varpi$ với $E(\varpi | X) = 0, \text{Var}(\varpi | X) = \sigma^2$, tách biệt rõ đường cong xu thế toàn cục $f(X)$ và nhiễu địa chất cục bộ $\varpi$.
* Số lượng thực thể điểm xuyết (chim bay, thuyền nan) trong mỗi chunk được sinh từ phân phối $\text{Poisson}(\omega)$ với tham số trung bình $\omega \in [0.2, 0.5]$ để giữ nhịp điệu thưa thoáng.

2. **Ổn định nét vẽ bằng Ridge/Lasso & Cắt tỉa node SVG bằng BIC (`pruneStrokesBIC`):**
* Khi khớp đường nét vân đá từ đám mây điểm nhiễu, nếu ma trận thiết kế $X$ gần suy biến (đa cộng tuyến cao làm phóng đại phương sai hệ số), sử dụng ước lượng **Ridge** $\hat{\beta}_{\text{ridge}} = (X^T X + \lambda I)^{-1} X^T y$ để làm phép nghịch đảo ổn định hơn.
* Áp dụng điều kiện KKT của **Lasso** ($\hat{\beta}_j = 0 \iff |x_j^T (y - X\hat{\beta})| \le \lambda$) để tự động đưa các hệ số của những nét gạch vân đá dư thừa về đúng bằng 0.
* Giữa các tập con đường nét ứng viên có số tham số $k$ khác nhau trên $n$ điểm lấy mẫu, chấm điểm bằng tiêu chí **BIC**: $\text{BIC} = n \log(\text{RSS}/n) + k \log n$. Vì BIC phạt độ phức tạp mạnh hơn AIC khi $n > e^2 \approx 7.39$, bộ lọc sẽ tự động chọn mô hình gọn nhất, cắt bỏ tới 40% số thẻ `<polyline>` vụn vặt mà mắt thường không phân biệt được.

---

### PHASE 3: TĂNG TỐC PHẦN CỨNG NPU (HETEROGENEOUS TENSOR OFFLOAD)

**Mục tiêu:** Đẩy các phép toán ma trận thuần túy không rẽ nhánh xuống NPU qua **WebNN API** hoặc **C# ONNX Runtime (`DirectML`)**.

1. **Giải phương trình truyền nhiệt Parabolic tạo sương mù (`NpuAccelerator.cs` / `numerical.js`):**
* Mô hình hóa lớp sương mù khuếch tán giữa các rặng núi bằng phương trình đạo hàm riêng Parabolic $\frac{\partial u}{\partial t} = \gamma \frac{\partial^2 u}{\partial x^2}$.
* Thiết lập lưới sai phân hữu hạn theo **sơ đồ hiển** dạng ma trận:
$$u^{(j+1)} = A u^{(j)} + B^{(j)}$$
trong đó $A$ là ma trận đối xứng ba đường chéo có đường chéo chính bằng $1 - 2\mu$ và hai đường chéo phụ bằng $\mu = \frac{\gamma \Delta t}{\Delta x^2}$.
* **Ràng buộc ổn định bắt buộc:** Khóa chặt tham số bước thời gian và không gian sao cho $\mu \le 0.5$ ($\Delta t \le \frac{\Delta x^2}{2\gamma}$) để sơ đồ hiển luôn ổn định tuyệt đối. Biểu diễn phép lặp $u^{(j+1)} = A u^{(j)} + B^{(j)}$ thành phép tích chập 1D (1D Convolution kernel $[\mu, 1-2\mu, \mu]$) chạy trực tiếp trên NPU.

2. **Batching POD & TDA Distance Matrix trên NPU:**
* Đóng gói phép nhân ma trận tái tạo hàng loạt cây cổ thụ $\tilde{X}_{\text{batch}} = \bar{X} + \Phi A_{\text{coeff}}$ và phép tính ma trận khoảng cách Euclid phẳng $d(p_i, p_j)$ của TDA thành một graph ONNX tĩnh (`FP16`) chạy trên NPU mỗi khi sinh chunk mới.
* *Fallback an toàn:* Nếu máy người dùng không có NPU hỗ trợ DirectML/WebNN, tự động chuyển về chạy trên CPU Web Worker mà không làm gián đoạn ứng dụng.

---

### PHASE 4: ĐÓNG GÓI NATIVE WINDOWS WALLPAPER (`.EXE` WRAPPER)

**Mục tiêu:** Xây dựng ứng dụng C# `.exe` chạy ngầm dưới biểu tượng Desktop mà không cần phần mềm thứ ba.

1. **Cấu hình Cửa sổ & WebView2 (`WallpaperForm.cs`):**
* Khởi tạo WinForms không viền (`FormBorderStyle.None`), kích thước phủ kín màn hình (`Screen.PrimaryScreen.Bounds`), ẩn khỏi Alt+Tab bằng cờ `WS_EX_TOOLWINDOW` và `WS_EX_NOACTIVATE`.
* Nhúng `Microsoft.Web.WebView2`, map thư mục ảo `https://wallpaper.local/` trỏ vào thư mục `src-web/` để tránh lỗi CORS khi load ES6 Modules.

2. **Kỹ thuật Win32 `WorkerW` Injection (`WorkerWHelper.cs`):**
* Import từ `user32.dll`: `FindWindow`, `FindWindowEx`, `SendMessageTimeout`, `EnumWindows`, `SetParent`.
* Lấy handle của `Progman` và gửi message `0x052C` (`wParam = 0xD`, `lParam = 0x1`) để yêu cầu Windows Explorer khởi tạo lớp cửa sổ `WorkerW` nằm giữa hình nền tĩnh và lớp icon `SHELLDLL_DefView`.
* Duyệt `EnumWindows` tìm đúng handle `WorkerW` ẩn sau `SHELLDLL_DefView` và gọi `SetParent(this.Handle, workerWHandle)`.

3. **Quản lý Năng lượng & Tự phục hồi (`PowerManager.cs`):**
* Kiểm tra mỗi 1000ms bằng `GetForegroundWindow()` và `SHQueryUserNotificationState`: Nếu có ứng dụng đang chạy toàn màn hình (chơi game, xem video full-screen) hoặc màn hình tắt, gọi `webView.ExecuteScriptAsync("window.setPaused(true)")` để đưa mức sử dụng CPU/GPU về đúng `0.0%`.
* Đăng ký lắng nghe thông điệp `RegisterWindowMessage("TaskbarCreated")` và sự kiện `SystemEvents.DisplaySettingsChanged`: Nếu `explorer.exe` bị khởi động lại hoặc đổi độ phân giải màn hình, tự động dò lại `WorkerW` và gắn lại `SetParent`.
* Tạo menu ở System Tray cho phép: *Pause/Resume, Đổi Seed phong cảnh mới, Chỉnh tốc độ cuộn, Bật/Tắt NPU Offload, Thoát*.

---

## 3. TIÊU CHÍ NGHIỆM THU TỰ ĐỘNG (DEFINITION OF DONE)

AI Agent phải tự viết script kiểm thử và đảm bảo vượt qua 5 tiêu chuẩn sau trước khi hoàn tất:

* [ ] **Kiểm tra Sai số & Tính ổn định Toán học:** Chạy thử 1000 lần sinh chunk liên tiếp. Hệ phương trình Spline `tri_diag` không sinh ra `NaN`/`Infinity`; sơ đồ truyền nhiệt Parabolic giữ nghiêm ngặt $\mu \le 0.5$; thuật toán quay lui Armijo luôn hội tụ trong $\le 10$ bước lặp.
* [ ] **Kiểm tra Độ thưa DOM (BIC/Lasso Pruning):** Tổng số lượng phần tử `<path>` và `<polyline>` trong `<svg>` tại mọi thời điểm chỉ nằm trong ngưỡng `[600, 2200]` phần tử nhờ bộ lọc cắt tỉa BIC và Garbage Collector.
* [ ] **Kiểm tra Chuẩn Thẩm mỹ Á Đông:** Tỷ lệ "Lưu bạch" (diện tích nền giấy trống + sương mù) luôn chiếm $\ge 50\%$ diện tích khung hình (được kiểm chứng qua hàm mục tiêu tối ưu hóa bố cục).
* [ ] **Kiểm tra Hiệu năng Thực tế:** Khi chạy `.exe` ở độ phân giải 1080p/2K tốc độ cuộn mặc định: CPU trung bình $< 2.5\%$, RAM tiêu thụ $< 90\text{ MB}$, và giảm về `0% CPU` trong vòng 1.5 giây khi mở ứng dụng Fullscreen.
* [ ] **Đóng gói Độc lập:** Lệnh `dotnet publish -c Release -r win-x64 --self-contained false` biên dịch thành công ra file `.exe` chạy mượt ngay trên Windows 10/11.
