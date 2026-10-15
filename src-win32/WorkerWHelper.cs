using System;
using System.Runtime.InteropServices;

namespace EastAsianWallpaper;

public static class WorkerWHelper
{
    private const uint WM_SPAWN_WORKER = 0x052C;

    [Flags]
    public enum SendMessageTimeoutFlags : uint
    {
        SMTO_NORMAL = 0x0000,
        SMTO_BLOCK = 0x0001,
        SMTO_ABORTIFHUNG = 0x0002,
        SMTO_NOTIMEOUTIFNOTHUNG = 0x0008,
        SMTO_ERRORONEXIT = 0x0020
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindowEx(IntPtr parentHandle, IntPtr childAfter, string? className, string? windowTitle);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessageTimeout(
        IntPtr hWnd,
        uint msg,
        IntPtr wParam,
        IntPtr lParam,
        SendMessageTimeoutFlags fuFlags,
        uint uTimeout,
        out IntPtr lpdwResult
    );

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    private static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_SHOWWINDOW = 0x0040;

    /// <summary>
    /// Gắn cửa sổ hình nền Form vào lớp WorkerW nằm dưới icon Desktop (SHELLDLL_DefView).
    /// </summary>
    /// <param name="formHandle">Handle của Form chứa WebView2</param>
    /// <returns>True nếu gắn thành công vào WorkerW, False nếu dùng chế độ Fallback</returns>
    public static bool AttachToDesktopWorkerW(IntPtr formHandle)
    {
        try
        {
            // 1. Tìm cửa sổ Progman
            IntPtr progman = FindWindow("Progman", null);
            if (progman == IntPtr.Zero)
            {
                return false;
            }

            // 2. Gửi thông điệp 0x052C với wParam = 0xD, lParam = 0x1 yêu cầu Explorer tạo WorkerW
            IntPtr result;
            SendMessageTimeout(
                progman,
                WM_SPAWN_WORKER,
                new IntPtr(0xD),
                new IntPtr(0x1),
                SendMessageTimeoutFlags.SMTO_NORMAL,
                1000,
                out result
            );

            // 3. Duyệt EnumWindows tìm WorkerW nằm ngay sau SHELLDLL_DefView
            IntPtr workerW = IntPtr.Zero;

            EnumWindows((toplevel, param) =>
            {
                IntPtr shellView = FindWindowEx(toplevel, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (shellView != IntPtr.Zero)
                {
                    // WorkerW là cửa sổ anh em nằm ngay sau toplevel chứa SHELLDLL_DefView
                    workerW = FindWindowEx(IntPtr.Zero, toplevel, "WorkerW", null);
                }
                return true;
            }, IntPtr.Zero);

            if (workerW != IntPtr.Zero)
            {
                SetParent(formHandle, workerW);
                SetWindowPos(formHandle, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
                return true;
            }

            // Nếu không tìm thấy WorkerW anh em, thử tìm WorkerW bất kỳ
            IntPtr fallbackWorkerW = FindWindowEx(IntPtr.Zero, IntPtr.Zero, "WorkerW", null);
            if (fallbackWorkerW != IntPtr.Zero)
            {
                SetParent(formHandle, fallbackWorkerW);
                SetWindowPos(formHandle, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
                return true;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WorkerWHelper] Không thể gắn WorkerW: {ex.Message}");
        }

        return false;
    }
}
