// Copyright 2026 publik
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// astro-restart.exe: Astro's restart helper on Windows (background updates).
//
// Astro installs per user. The layout under %LOCALAPPDATA%\Astro:
//   Application\              the running app (chrome.exe, the version folder, ...)
//   Application.next\         a new version, staged by Astro-Update.exe while Astro runs;
//                             complete only when it holds astro-staged.txt
//   Updater\astro-restart-<version>.exe   this program (outside Application, so it
//                             can rename that folder)
//
// WinSparkle (Astro's fork, SilentAutoInstall=1) downloads the update and checks its
// Ed25519 signature; chrome.dll runs Astro-Update.exe hidden; the package stages the
// new version and starts this program. This program then:
//   --staged           shows "Restart now / Later". Restart now: closes Astro politely,
//                      switches Application.next in, starts Astro. Later (or when the
//                      person quits Astro): switches the folders once Astro is closed.
//   --apply-if-staged  (at logon, HKCU Run) switches a staged version in when Astro is
//                      not running; waits for Astro to close otherwise. No window.
//
// The folder switch holds the named mutex Local\AstroUpdateSwap, which the package
// also holds while it writes Application.next. A failed switch puts the old folder
// back. Log: %LOCALAPPDATA%\Astro\Updater\astro-restart.log.
//
// Built by astro-recut-win.ts with the .NET Framework 4 compiler (C# 5).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class AstroRestart
{
    static readonly string Root = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Astro");
    static readonly string AppDir = Path.Combine(Root, "Application");
    static readonly string NextDir = Path.Combine(Root, "Application.next");
    static readonly string UpdaterDir = Path.Combine(Root, "Updater");
    const string Marker = "astro-staged.txt";

    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);

    public static void Log(string line)
    {
        try
        {
            Directory.CreateDirectory(UpdaterDir);
            File.AppendAllText(Path.Combine(UpdaterDir, "astro-restart.log"),
                DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss") + "Z [" + Process.GetCurrentProcess().Id + "] " + line + "\r\n");
        }
        catch { }
    }

    public static string StagedVersion()
    {
        try
        {
            string m = Path.Combine(NextDir, Marker);
            if (!File.Exists(m) || !File.Exists(Path.Combine(NextDir, "chrome.exe"))) return null;
            string v = File.ReadAllText(m).Trim();
            return v.Length > 0 ? v : null;
        }
        catch { return null; }
    }

    class Proc { public int Id; public string Path; public string CommandLine; public string Name; }

    // Every process that runs from Application\ (the browser, its children, the local server).
    static List<Proc> AstroProcesses()
    {
        var list = new List<Proc>();
        string dir = AppDir.TrimEnd('\\') + "\\";
        try
        {
            using (var s = new ManagementObjectSearcher("SELECT ProcessId, Name, ExecutablePath, CommandLine FROM Win32_Process"))
            {
                foreach (ManagementObject o in s.Get())
                {
                    string p = o["ExecutablePath"] as string;
                    if (p == null || !p.StartsWith(dir, StringComparison.OrdinalIgnoreCase)) continue;
                    list.Add(new Proc { Id = Convert.ToInt32(o["ProcessId"]), Path = p, CommandLine = (o["CommandLine"] as string) ?? "", Name = (o["Name"] as string) ?? "" });
                }
            }
        }
        catch (Exception e) { Log("process list failed: " + e.Message); }
        return list;
    }

    // The browser process itself, or Chromium's relauncher (a restart from the
    // browser's own "Relaunch" button is in progress).
    static bool IsBrowser(Proc p)
    {
        if (!p.Name.Equals("chrome.exe", StringComparison.OrdinalIgnoreCase)) return false;
        return p.CommandLine.IndexOf("--type=", StringComparison.OrdinalIgnoreCase) < 0
            || p.CommandLine.IndexOf("--type=relauncher", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    public static bool BrowserRunning()
    {
        foreach (var p in AstroProcesses())
            if (IsBrowser(p)) return true;
        return false;
    }

    static bool WaitNoAstro(int seconds, bool browserOnly)
    {
        var until = DateTime.UtcNow.AddSeconds(seconds);
        while (DateTime.UtcNow < until)
        {
            if (browserOnly ? !BrowserRunning() : AstroProcesses().Count == 0) return true;
            Thread.Sleep(500);
        }
        return browserOnly ? !BrowserRunning() : AstroProcesses().Count == 0;
    }

    // "Restart now": politely first (WM_CLOSE, like a normal quit, so the
    // session comes back), then by force after 30 s.
    public static void CloseAstro()
    {
        foreach (var p in AstroProcesses())
            RunHidden("taskkill.exe", "/PID " + p.Id);
        if (WaitNoAstro(30, true)) return;
        Log("the browser is still running after 30 s; stopping it");
        foreach (var p in AstroProcesses())
            if (IsBrowser(p)) { try { Process.GetProcessById(p.Id).Kill(); } catch { } }
        WaitNoAstro(15, true);
    }

    // With the browser gone, its children and the local server can stay for a
    // moment; they are stopped. A browser is never stopped here: false.
    static bool StopLeftovers()
    {
        if (BrowserRunning()) return false;
        if (WaitNoAstro(10, false)) return true;
        foreach (var p in AstroProcesses())
            if (!IsBrowser(p)) { try { Process.GetProcessById(p.Id).Kill(); } catch { } }
        bool ok = WaitNoAstro(15, false);
        if (!ok) Log("Astro processes still running: " + AstroProcesses().Count);
        return ok;
    }

    static void RunHidden(string exe, string args)
    {
        try
        {
            var si = new ProcessStartInfo(exe, args) { CreateNoWindow = true, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden };
            using (var p = Process.Start(si)) { p.WaitForExit(10000); }
        }
        catch (Exception e) { Log(exe + " failed: " + e.Message); }
    }

    static bool MoveWithRetry(string from, string to)
    {
        for (int i = 0; i < 20; i++)
        {
            try { Directory.Move(from, to); return true; }
            catch (Exception e)
            {
                if (i == 19) { Log("move " + from + " -> " + to + " failed: " + e.Message); return false; }
                Thread.Sleep(1000);
            }
        }
        return false;
    }

    // Switches Application.next in. Astro must not run. Returns the new version or null.
    public static string Apply(bool start)
    {
        using (var swap = new Mutex(false, "Local\\AstroUpdateSwap"))
        {
            bool held = false;
            try
            {
                try { held = swap.WaitOne(TimeSpan.FromMinutes(10)); }
                catch (AbandonedMutexException) { held = true; }
                if (!held) { Log("the swap lock was busy for 10 minutes"); return null; }

                string version = StagedVersion();
                if (version == null) { Log("nothing staged"); return null; }
                if (!StopLeftovers()) { Log("Astro is still running; not switching"); return null; }

                string old = Path.Combine(Root, "Application.old-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss"));
                if (!MoveWithRetry(AppDir, old)) return null;
                if (!MoveWithRetry(NextDir, AppDir))
                {
                    Log("rolling back");
                    MoveWithRetry(old, AppDir);
                    return null;
                }
                try
                {
                    using (var k = Registry.CurrentUser.CreateSubKey("Software\\Astro"))
                    {
                        k.SetValue("Version", version);
                        k.SetValue("InstallDir", AppDir);
                    }
                    using (var k = Registry.CurrentUser.CreateSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Astro"))
                        k.SetValue("DisplayVersion", version);
                }
                catch (Exception e) { Log("version keys: " + e.Message); }
                Log("switched to " + version + " (old folder " + Path.GetFileName(old) + ")");

                if (start) StartAstro();
                try { Directory.Delete(old, true); } catch (Exception e) { Log("old folder left: " + e.Message); }
                Cleanup();
                return version;
            }
            finally
            {
                if (held) swap.ReleaseMutex();
            }
        }
    }

    static void StartAstro()
    {
        try
        {
            Process.Start(new ProcessStartInfo(Path.Combine(AppDir, "chrome.exe")) { UseShellExecute = false, WorkingDirectory = AppDir });
            Log("started Astro");
        }
        catch (Exception e) { Log("start failed: " + e.Message); }
    }

    // Old folders from earlier switches and older copies of this helper.
    static void Cleanup()
    {
        try
        {
            foreach (var d in Directory.GetDirectories(Root, "Application.old-*"))
                try { Directory.Delete(d, true); } catch { }
            string me = Process.GetCurrentProcess().MainModule.FileName;
            foreach (var f in Directory.GetFiles(UpdaterDir, "astro-restart-*.exe"))
                if (!f.Equals(me, StringComparison.OrdinalIgnoreCase))
                    try { File.Delete(f); } catch { }
        }
        catch { }
    }

    // ------------------------------------------------------------------ the question

    class Prompt : Form
    {
        readonly Label text = new Label();
        readonly Button restart = new Button();
        readonly Button later = new Button();
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        readonly EventWaitHandle showAgain;
        int closedTicks;
        int failedSwitches;
        public bool Waiting;   // "Later": hidden, apply when Astro is closed

        public Prompt(string version, EventWaitHandle showAgain)
        {
            this.showAgain = showAgain;
            Text = "Astro update";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            TopMost = true;
            ShowInTaskbar = true;
            Font = SystemFonts.MessageBoxFont;
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(380, 120);
            StartPosition = FormStartPosition.Manual;
            var wa = Screen.PrimaryScreen.WorkingArea;
            Location = new Point(wa.Right - Width - 16, wa.Bottom - Height - 16);

            text.SetBounds(16, 14, 350, 52);
            SetVersion(version);
            restart.Text = "Restart now";
            restart.SetBounds(160, 76, 100, 30);
            later.Text = "Later";
            later.SetBounds(268, 76, 96, 30);
            Controls.Add(text);
            Controls.Add(restart);
            Controls.Add(later);
            AcceptButton = restart;

            restart.Click += delegate { OnRestart(); };
            later.Click += delegate { OnLater(); };
            FormClosing += delegate(object s, FormClosingEventArgs e)
            {
                // The close box means "Later".
                if (e.CloseReason == CloseReason.UserClosing && !Waiting && Visible) { e.Cancel = true; OnLater(); }
            };
            timer.Interval = 2000;
            timer.Tick += delegate { OnTick(); };
            timer.Start();
        }

        void SetVersion(string version)
        {
            text.Text = "Astro " + version + " is downloaded and installed.\r\nRestart Astro to start using it.";
        }

        public void ShowNow()
        {
            Show();
            ShowWindow(Handle, 1 /* SW_SHOWNORMAL */);
            SetForegroundWindow(Handle);
        }

        void OnRestart()
        {
            timer.Stop();
            Hide();
            Log("Restart now");
            CloseAstro();
            string v = Apply(true);
            if (v == null && !BrowserRunning()) StartAstro();
            ExitThread();
        }

        void OnLater()
        {
            Log("Later");
            Waiting = true;
            Hide();
        }

        void OnTick()
        {
            if (showAgain.WaitOne(0))
            {
                string v = StagedVersion();
                if (v != null) { SetVersion(v); Waiting = false; ShowNow(); Log("asked again for " + v); }
            }
            if (StagedVersion() == null) { Log("nothing staged any more"); ExitThread(); return; }
            // Astro was closed (Later, or the person quit it with the question open):
            // switch now, so the next start is the new version.
            closedTicks = BrowserRunning() ? 0 : closedTicks + 1;
            if (closedTicks >= 2)
            {
                timer.Stop();
                Hide();
                Log("Astro is closed; switching");
                if (Apply(false) == null && StagedVersion() != null && ++failedSwitches < 3)
                {
                    // Astro started again in the meantime, or a file was busy: wait again.
                    closedTicks = 0;
                    if (!Waiting) ShowNow();
                    timer.Start();
                    return;
                }
                ExitThread();
            }
        }

        static void ExitThread() { Application.ExitThread(); }
    }

    [STAThread]
    static int Main(string[] args)
    {
        string mode = args.Length > 0 ? args[0] : "--staged";
        Log("start " + mode);
        bool first;
        using (var single = new Mutex(true, "Local\\AstroRestartHelper", out first))
        using (var showAgain = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\AstroRestartShow"))
        {
            if (!first)
            {
                // Another helper runs: it asks again (with the newest staged version).
                if (mode == "--staged") showAgain.Set();
                Log("another helper runs; done");
                return 0;
            }
            string version = StagedVersion();
            if (version == null) { Log("nothing staged"); return 0; }

            // At logon: a version staged earlier goes in before Astro starts. If
            // Astro already runs (started with Windows), ask as after a download.
            if (mode == "--apply-if-staged" && !BrowserRunning())
                return Apply(false) != null ? 0 : 1;

            Application.EnableVisualStyles();
            var prompt = new Prompt(version, showAgain);
            prompt.ShowNow();
            Application.Run();
            Log("done");
            return 0;
        }
    }
}
