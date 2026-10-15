using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace EastAsianWallpaper;

public class PowerManager : IDisposable
{
    public enum QUERY_USER_NOTIFICATION_STATE
    {
        QUNS_NOT_PRESENT = 1,
        QUNS_BUSY = 2,
        QUNS_RUNNING_D3D_FULL_SCREEN = 3,
        QUNS_PRESENTATION_MODE = 4,
        QUNS_ACCEPTS_NOTIFICATIONS = 5,
        QUNS_QUIET_TIME = 6,
        QUNS_APP = 7
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("shell32.dll")]
    private static extern int SHQueryUserNotificationState(out QUERY_USER_NOTIFICATION_STATE pquns);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern uint RegisterWindowMessage(string lpString);

    private readonly WallpaperForm _form;
    private readonly System.Windows.Forms.Timer _pollTimer;
    private readonly NotifyIcon _trayIcon;
    private bool _isCurrentlyPaused = false;
    private bool _manualPause = false;
    private bool _npuOffloadEnabled = true;

    public PowerManager(WallpaperForm form)
    {
        _form = form;

        // 1. Khởi tạo System Tray Icon
        _trayIcon = new NotifyIcon
        {
            Text = "Sơn Thủy Vô Tận · Live Wallpaper",
            Icon = SystemIcons.Application,
            Visible = true
        };
        BuildTrayMenu();

        // 2. Timer kiểm tra ứng dụng toàn màn hình mỗi 1000ms
        _pollTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        _pollTimer.Tick += async (s, e) => await CheckFullscreenStatusAsync();
        _pollTimer.Start();

        // 3. Đăng ký sự kiện thay đổi độ phân giải màn hình
        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
    }

    private void BuildTrayMenu()
    {
        var menu = new ContextMenuStrip();

        var pauseItem = new ToolStripMenuItem("Tạm dừng / Tiếp tục", null, async (s, e) =>
        {
            _manualPause = !_manualPause;
            await _form.SetPausedAsync(_manualPause);
        });

        var speedMenu = new ToolStripMenuItem("Tốc độ cuộn tranh");
        speedMenu.DropDownItems.Add("Chậm (0.3 px)", null, async (s, e) => await _form.SetScrollSpeedAsync(0.3));
        speedMenu.DropDownItems.Add("Mặc định (0.6 px)", null, async (s, e) => await _form.SetScrollSpeedAsync(0.6));
        speedMenu.DropDownItems.Add("Nhanh (1.2 px)", null, async (s, e) => await _form.SetScrollSpeedAsync(1.2));

        var seedItem = new ToolStripMenuItem("Đổi cảnh mới (Random Seed)", null, async (s, e) =>
        {
            int newSeed = new Random().Next(1000, 999999);
            await _form.SetSeedAsync(newSeed);
        });

        var npuItem = new ToolStripMenuItem("NPU Tensor Offload: Bật", null, (s, e) =>
        {
            _npuOffloadEnabled = !_npuOffloadEnabled;
            if (s is ToolStripMenuItem item)
            {
                item.Text = _npuOffloadEnabled ? "NPU Tensor Offload: Bật" : "NPU Tensor Offload: Tắt";
            }
        });

        var exitItem = new ToolStripMenuItem("Thoát", null, (s, e) =>
        {
            _trayIcon.Visible = false;
            Application.Exit();
        });

        menu.Items.Add(pauseItem);
        menu.Items.Add(speedMenu);
        menu.Items.Add(seedItem);
        menu.Items.Add(npuItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(exitItem);

        _trayIcon.ContextMenuStrip = menu;
    }

    private async Task CheckFullscreenStatusAsync()
    {
        if (_manualPause) return;

        bool isFullScreen = false;

        try
        {
            // Kiểm tra trạng thái người dùng (Game DirectX toàn màn hình hoặc Presentation)
            if (SHQueryUserNotificationState(out QUERY_USER_NOTIFICATION_STATE state) == 0)
            {
                if (state == QUERY_USER_NOTIFICATION_STATE.QUNS_RUNNING_D3D_FULL_SCREEN ||
                    state == QUERY_USER_NOTIFICATION_STATE.QUNS_PRESENTATION_MODE ||
                    state == QUERY_USER_NOTIFICATION_STATE.QUNS_BUSY)
                {
                    isFullScreen = true;
                }
            }

            // Kiểm tra cửa sổ Foreground có chiếm trọn màn hình không
            if (!isFullScreen)
            {
                IntPtr fgHwnd = GetForegroundWindow();
                if (fgHwnd != IntPtr.Zero && fgHwnd != _form.Handle)
                {
                    if (GetWindowRect(fgHwnd, out RECT rect))
                    {
                        Rectangle screenBounds = Screen.PrimaryScreen?.Bounds ?? Rectangle.Empty;
                        if (rect.Left <= screenBounds.Left &&
                            rect.Top <= screenBounds.Top &&
                            rect.Right >= screenBounds.Right &&
                            rect.Bottom >= screenBounds.Bottom)
                        {
                            isFullScreen = true;
                        }
                    }
                }
            }
        }
        catch
        {
            // Bỏ qua lỗi truy vấn Win32
        }

        // Tự động tạm dừng để đưa CPU/GPU về 0.0% khi có game hoặc ứng dụng toàn màn hình
        if (isFullScreen && !_isCurrentlyPaused)
        {
            _isCurrentlyPaused = true;
            await _form.SetPausedAsync(true);
        }
        else if (!isFullScreen && _isCurrentlyPaused)
        {
            _isCurrentlyPaused = false;
            await _form.SetPausedAsync(false);
        }
    }

    private void OnDisplaySettingsChanged(object? sender, EventArgs e)
    {
        // Khi độ phân giải thay đổi hoặc Explorer khởi động lại, gắn lại WorkerW
        _form.Bounds = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 3072, 1920);
        _form.ReattachWorkerW();
    }

    public void Dispose()
    {
        SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
        _pollTimer.Stop();
        _pollTimer.Dispose();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
    }
}
