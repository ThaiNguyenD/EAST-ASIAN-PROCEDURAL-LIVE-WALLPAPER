using System;
using System.Runtime.InteropServices;

namespace EastAsianWallpaper;

public static class NpuAccelerator
{
    private static bool? _isDirectMlSupported;

    [Flags]
    public enum DML_CREATE_DEVICE_FLAGS : uint
    {
        DML_CREATE_DEVICE_FLAG_NONE = 0x00000000,
        DML_CREATE_DEVICE_FLAG_DEBUG = 0x00000001
    }

    public enum D3D_FEATURE_LEVEL : uint
    {
        D3D_FEATURE_LEVEL_11_0 = 0xb000,
        D3D_FEATURE_LEVEL_12_0 = 0xc000
    }

    [DllImport("d3d12.dll", SetLastError = true)]
    private static extern int D3D12CreateDevice(
        IntPtr pAdapter,
        D3D_FEATURE_LEVEL minimumFeatureLevel,
        [In] ref Guid riid,
        out IntPtr ppDevice
    );

    [DllImport("DirectML.dll", SetLastError = true)]
    private static extern int DmlCreateDevice(
        IntPtr d3d12Device,
        DML_CREATE_DEVICE_FLAGS flags,
        [In] ref Guid riid,
        out IntPtr ppvDevice
    );

    private static readonly Guid IID_ID3D12Device = new Guid("189819f1-1db6-4b57-be54-1821339b85f7");
    private static readonly Guid IID_IDMLDevice = new Guid("29742098-67f7-4a4a-97d5-d069e20a0614");

    /// <summary>
    /// Kiểm tra tính khả dụng của DirectML / NPU trên phần cứng Windows 10/11 qua thư viện DirectML.dll gốc của hệ điều hành.
    /// </summary>
    public static bool IsDirectMlSupported()
    {
        if (_isDirectMlSupported.HasValue)
        {
            return _isDirectMlSupported.Value;
        }

        IntPtr d3d12Device = IntPtr.Zero;
        IntPtr dmlDevice = IntPtr.Zero;

        try
        {
            Guid d3dGuid = IID_ID3D12Device;
            int hrD3D = D3D12CreateDevice(IntPtr.Zero, D3D_FEATURE_LEVEL.D3D_FEATURE_LEVEL_11_0, ref d3dGuid, out d3d12Device);

            if (hrD3D == 0 && d3d12Device != IntPtr.Zero)
            {
                Guid dmlGuid = IID_IDMLDevice;
                int hrDML = DmlCreateDevice(d3d12Device, DML_CREATE_DEVICE_FLAGS.DML_CREATE_DEVICE_FLAG_NONE, ref dmlGuid, out dmlDevice);

                if (hrDML == 0 && dmlDevice != IntPtr.Zero)
                {
                    _isDirectMlSupported = true;
                    Console.WriteLine("[NpuAccelerator] Đã phát hiện phần cứng NPU / DirectML tăng tốc.");
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[NpuAccelerator] DirectML driver check: {ex.Message}");
        }
        finally
        {
            if (dmlDevice != IntPtr.Zero) Marshal.Release(dmlDevice);
            if (d3d12Device != IntPtr.Zero) Marshal.Release(d3d12Device);
        }

        // Tự động fallback về CPU nếu phần cứng không hỗ trợ DirectML
        _isDirectMlSupported = false;
        return false;
    }
}
