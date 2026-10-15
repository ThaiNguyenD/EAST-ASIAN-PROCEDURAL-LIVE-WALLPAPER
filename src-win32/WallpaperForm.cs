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

            if (!Directory.Exists(webPath))
            {
                // Fallback nếu chạy trong thư mục bin/Release/net8.0-windows/
                string projectWebPath = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", "src-web"));
                if (Directory.Exists(projectWebPath))
                {
                    webPath = projectWebPath;
                }
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
