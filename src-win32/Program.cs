using System;
using System.Windows.Forms;

namespace EastAsianWallpaper;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        // Khởi tạo cửa sổ hình nền WebView2
        var wallpaperForm = new WallpaperForm();

        // Khởi tạo bộ quản lý năng lượng và System Tray
        using var powerManager = new PowerManager(wallpaperForm);

        // Chạy ứng dụng
        Application.Run(wallpaperForm);
    }
}
