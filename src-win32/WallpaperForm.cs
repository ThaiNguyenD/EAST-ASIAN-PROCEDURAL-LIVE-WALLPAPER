using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace EastAsianWallpaper;

public partial class WallpaperForm : Form
{
    private readonly WebView2 _webView;
    private bool _isInitialized = false;

    public WebView2 WebViewControl => _webView;

    public WallpaperForm()
    {
        // 1. Cấu hình Form không viền, phủ kín màn hình
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Normal;
        StartPosition = FormStartPosition.Manual;
        Bounds = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 3072, 1920);
        ShowInTaskbar = false;
        BackColor = ColorTranslator.FromHtml("#f4ede2");

        // 2. Tạo control WebView2
        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = ColorTranslator.FromHtml("#f4ede2")
        };
        Controls.Add(_webView);
    }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            // WS_EX_TOOLWINDOW: Ẩn khỏi danh sách Alt+Tab
            cp.ExStyle |= 0x00000080;
            // WS_EX_NOACTIVATE: Không kích hoạt chiếm focus bàn phím khi người dùng click
            cp.ExStyle |= 0x08000000;
            return cp;
        }
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        await InitializeWallpaperAsync();
    }

    private async Task InitializeWallpaperAsync()
    {
        try
        {
            // Thiết lập thư mục dữ liệu cục bộ cho WebView2 trong AppData
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string userDataFolder = Path.Combine(localAppData, "EastAsianWallpaper", "WebView2Data");
            Directory.CreateDirectory(userDataFolder);

            var options = new CoreWebView2EnvironmentOptions("--disable-features=msWebOOUI,msPdfOOUI --enable-features=WebNN");
            var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder, options);

            await _webView.EnsureCoreWebView2Async(environment);

            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

            // Ánh xạ thư mục ảo https://wallpaper.local/ vào src-web
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string webPath = Path.Combine(baseDir, "src-web");

            if (!Directory.Exists(webPath) || !File.Exists(Path.Combine(webPath, "index.html")))
            {
                // Fallback 1: Thư mục gốc dự án khi chạy trong bin/Release/...
                string projectWebPath = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", "src-web"));
                if (Directory.Exists(projectWebPath) && File.Exists(Path.Combine(projectWebPath, "index.html")))
                {
                    webPath = projectWebPath;
                }
                else
                {
                    // Fallback 2: Thư mục cha
                    string parentWebPath = Path.GetFullPath(Path.Combine(baseDir, "..", "src-web"));
                    if (Directory.Exists(parentWebPath) && File.Exists(Path.Combine(parentWebPath, "index.html")))
                    {
                        webPath = parentWebPath;
                    }
                    else
                    {
                        // Fallback 3: Tự động trích xuất tài nguyên nhúng ra AppData
                        string embeddedWebFolder = Path.Combine(localAppData, "EastAsianWallpaper", "src-web");
                        ExtractEmbeddedWebResources(embeddedWebFolder);
                        if (Directory.Exists(embeddedWebFolder) && File.Exists(Path.Combine(embeddedWebFolder, "index.html")))
                        {
                            webPath = embeddedWebFolder;
                        }
                    }
                }
            }

            if (!Directory.Exists(webPath) || !File.Exists(Path.Combine(webPath, "index.html")))
            {
                MessageBox.Show(
                    "Không tìm thấy thư mục tài nguyên giao diện 'src-web' của hình nền.\n\n" +
                    "Cách khắc phục:\n" +
                    "1. Nếu bạn chạy từ file .zip, hãy nhấp chuột phải chọn 'Extract All...' (Giải nén tất cả) ra một thư mục trước khi mở file .exe.\n" +
                    "2. Đảm bảo thư mục 'src-web' nằm cùng vị trí với EastAsianWallpaper.exe.",
                    "East Asian Wallpaper",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return;
            }

            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "wallpaper.local",
                webPath,
                CoreWebView2HostResourceAccessKind.Allow
            );

            _webView.CoreWebView2.Navigate("https://wallpaper.local/index.html");

            _webView.NavigationCompleted += (s, ev) =>
            {
                if (ev.IsSuccess)
                {
                    _isInitialized = true;
                    // Gắn cửa sổ hình nền Form vào dưới icon Desktop WorkerW
                    WorkerWHelper.AttachToDesktopWorkerW(Handle);
                }
            };
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Lỗi khởi tạo WebView2: {ex.Message}", "East Asian Wallpaper", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void ExtractEmbeddedWebResources(string targetFolder)
    {
        try
        {
            var assembly = System.Reflection.Assembly.GetExecutingAssembly();
            string prefix = "src-web/";
            foreach (string resourceName in assembly.GetManifestResourceNames())
            {
                string normalized = resourceName.Replace('\\', '/');
                if (normalized.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    string relativePath = normalized.Substring(prefix.Length).Replace('/', Path.DirectorySeparatorChar);
                    string targetFilePath = Path.Combine(targetFolder, relativePath);
                    string? targetDir = Path.GetDirectoryName(targetFilePath);
                    if (!string.IsNullOrEmpty(targetDir))
                    {
                        Directory.CreateDirectory(targetDir);
                    }

                    using var stream = assembly.GetManifestResourceStream(resourceName);
                    if (stream != null)
                    {
                        using var fileStream = new FileStream(targetFilePath, FileMode.Create, FileAccess.Write, FileShare.Read);
                        stream.CopyTo(fileStream);
                    }
                }
            }
        }
        catch
        {
            // Bỏ qua nếu có lỗi quyền ghi
        }
    }

    public async Task SetPausedAsync(bool paused)
    {
        if (_isInitialized && _webView.CoreWebView2 != null)
        {
            await _webView.ExecuteScriptAsync($"window.setPaused({(paused ? "true" : "false")});");
        }
    }

    public async Task SetScrollSpeedAsync(double speed)
    {
        if (_isInitialized && _webView.CoreWebView2 != null)
        {
            await _webView.ExecuteScriptAsync($"window.setScrollSpeed({speed.ToString(System.Globalization.CultureInfo.InvariantCulture)});");
        }
    }

    public async Task SetSeedAsync(int seed)
    {
        if (_isInitialized && _webView.CoreWebView2 != null)
        {
            await _webView.ExecuteScriptAsync($"window.setSeed({seed});");
        }
    }

    public void ReattachWorkerW()
    {
        WorkerWHelper.AttachToDesktopWorkerW(Handle);
    }
}
