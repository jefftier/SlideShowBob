using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace SlideShowBob
{
    public partial class SettingsWindow : Window
    {
        private AppSettings _settings;

        // Dark title bar constants (same pattern as MainWindow)
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1 = 19;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(
            IntPtr hwnd,
            int dwAttribute,
            ref int pvAttribute,
            int cbAttribute);

        public SettingsWindow(AppSettings settings)
        {
            InitializeComponent();
            _settings = settings;
            
            // Load current persistence settings
            PersistSlideDelayCheckBox.IsChecked = _settings.PersistSlideDelay;
            PersistIncludeVideosCheckBox.IsChecked = _settings.PersistIncludeVideos;
            PersistSortModeCheckBox.IsChecked = _settings.PersistSortMode;
            PersistIsMutedCheckBox.IsChecked = _settings.PersistIsMuted;
            PersistFolderPathsCheckBox.IsChecked = _settings.PersistFolderPaths;
            
            Loaded += SettingsWindow_Loaded;
        }

        private void SettingsWindow_Loaded(object sender, RoutedEventArgs e)
        {
            EnableDarkTitleBar();
        }

        private void EnableDarkTitleBar()
        {
            try
            {
                var helper = new WindowInteropHelper(this);
                IntPtr hWnd = helper.Handle;
                if (hWnd == IntPtr.Zero) return;

                int useDark = 1;

                // Newer Windows 10/11 attribute
                DwmSetWindowAttribute(hWnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref useDark, sizeof(int));
                // Older builds
                DwmSetWindowAttribute(hWnd, DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1, ref useDark, sizeof(int));
            }
            catch
            {
                // If the OS doesn't support it, just ignore
            }
        }

        private void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            // Update persistence flags
            bool persistSlideDelay = PersistSlideDelayCheckBox.IsChecked == true;
            bool persistIncludeVideos = PersistIncludeVideosCheckBox.IsChecked == true;
            bool persistSortMode = PersistSortModeCheckBox.IsChecked == true;
            bool persistIsMuted = PersistIsMutedCheckBox.IsChecked == true;
            bool persistFolderPaths = PersistFolderPathsCheckBox.IsChecked == true;
            
            // If persistence is being disabled, reset the value to default
            if (!persistSlideDelay && _settings.PersistSlideDelay)
            {
                _settings.SlideDelayMs = 2000; // default
            }
            if (!persistIncludeVideos && _settings.PersistIncludeVideos)
            {
                _settings.IncludeVideos = false; // default
            }
            if (!persistSortMode && _settings.PersistSortMode)
            {
                _settings.SortMode = "NameAZ"; // default
            }
            if (!persistIsMuted && _settings.PersistIsMuted)
            {
                _settings.IsMuted = true; // default
            }
            if (!persistFolderPaths && _settings.PersistFolderPaths)
            {
                _settings.FolderPaths = new List<string>(); // default (empty)
            }
            
            // Update persistence flags
            _settings.PersistSlideDelay = persistSlideDelay;
            _settings.PersistIncludeVideos = persistIncludeVideos;
            _settings.PersistSortMode = persistSortMode;
            _settings.PersistIsMuted = persistIsMuted;
            _settings.PersistFolderPaths = persistFolderPaths;
            
            // Save settings
            SettingsManager.Save(_settings);
            
            DialogResult = true;
            Close();
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }
    }
}

