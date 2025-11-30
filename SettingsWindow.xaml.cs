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
            
            // Load current save settings
            SaveSlideDelayCheckBox.IsChecked = _settings.SaveSlideDelay;
            SaveIncludeVideosCheckBox.IsChecked = _settings.SaveIncludeVideos;
            SaveSortModeCheckBox.IsChecked = _settings.SaveSortMode;
            SaveIsMutedCheckBox.IsChecked = _settings.SaveIsMuted;
            SaveFolderPathsCheckBox.IsChecked = _settings.SaveFolderPaths;
            
            // Load portrait blur effect setting
            PortraitBlurEffectCheckBox.IsChecked = _settings.PortraitBlurEffect;
            
            // Load FFMPEG setting
            UseFfmpegForPlaybackCheckBox.IsChecked = _settings.UseFfmpegForPlayback;
            
            // Update FFMPEG status indicator
            UpdateFfmpegStatus();
            
            // Load current toolbar behavior setting (always saves)
            string behavior = _settings.ToolbarInactivityBehavior ?? "Dim";
            foreach (System.Windows.Controls.ComboBoxItem item in ToolbarInactivityBehaviorComboBox.Items)
            {
                if (item.Tag?.ToString() == behavior)
                {
                    ToolbarInactivityBehaviorComboBox.SelectedItem = item;
                    break;
                }
            }
            // Default to first item if nothing selected
            if (ToolbarInactivityBehaviorComboBox.SelectedItem == null && ToolbarInactivityBehaviorComboBox.Items.Count > 0)
            {
                ToolbarInactivityBehaviorComboBox.SelectedIndex = 0;
            }
            
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
            // Update save flags
            bool saveSlideDelay = SaveSlideDelayCheckBox.IsChecked == true;
            bool saveIncludeVideos = SaveIncludeVideosCheckBox.IsChecked == true;
            bool saveSortMode = SaveSortModeCheckBox.IsChecked == true;
            bool saveIsMuted = SaveIsMutedCheckBox.IsChecked == true;
            bool saveFolderPaths = SaveFolderPathsCheckBox.IsChecked == true;
            
            // Update portrait blur effect setting
            bool portraitBlurEffect = PortraitBlurEffectCheckBox.IsChecked == true;
            
            // If saving is being disabled, reset the value to default
            if (!saveSlideDelay && _settings.SaveSlideDelay)
            {
                _settings.SlideDelayMs = 2000; // default
            }
            if (!saveIncludeVideos && _settings.SaveIncludeVideos)
            {
                _settings.IncludeVideos = false; // default
            }
            if (!saveSortMode && _settings.SaveSortMode)
            {
                _settings.SortMode = "NameAZ"; // default
            }
            if (!saveIsMuted && _settings.SaveIsMuted)
            {
                _settings.IsMuted = true; // default
            }
            if (!saveFolderPaths && _settings.SaveFolderPaths)
            {
                _settings.FolderPaths = new List<string>(); // default (empty)
            }
            
            // Update toolbar behavior setting (always saves)
            if (ToolbarInactivityBehaviorComboBox.SelectedItem is System.Windows.Controls.ComboBoxItem selectedItem)
            {
                string behavior = selectedItem.Tag?.ToString() ?? "Dim";
                _settings.ToolbarInactivityBehavior = behavior;
            }
            
            // Update save flags
            _settings.SaveSlideDelay = saveSlideDelay;
            _settings.SaveIncludeVideos = saveIncludeVideos;
            _settings.SaveSortMode = saveSortMode;
            _settings.SaveIsMuted = saveIsMuted;
            _settings.SaveFolderPaths = saveFolderPaths;
            
            // Update portrait blur effect setting
            _settings.PortraitBlurEffect = portraitBlurEffect;
            
            // Update FFMPEG setting
            bool useFfmpegForPlayback = UseFfmpegForPlaybackCheckBox.IsChecked == true;
            _settings.UseFfmpegForPlayback = useFfmpegForPlayback;
            
            // Save settings
            SettingsManager.Save(_settings);
            
            DialogResult = true;
            Close();
        }

        private void UseFfmpegForPlaybackCheckBox_Changed(object sender, RoutedEventArgs e)
        {
            // Update status indicator reactively when checkbox changes
            UpdateFfmpegStatus();
        }

        private void UpdateFfmpegStatus()
        {
            bool useFfmpegSetting = UseFfmpegForPlaybackCheckBox.IsChecked == true;
            bool isEnabled = ThumbnailService.IsFfmpegEnabled(useFfmpegSetting);
            
            if (isEnabled)
            {
                FfmpegStatusTextBlock.Text = "FFMPEG: Active";
                // Use green color for active status
                FfmpegStatusTextBlock.Foreground = new System.Windows.Media.SolidColorBrush(
                    System.Windows.Media.Color.FromRgb(76, 175, 80)); // Green
            }
            else
            {
                FfmpegStatusTextBlock.Text = "FFMPEG: Not Active";
                // Use muted/red color for inactive status
                FfmpegStatusTextBlock.Foreground = new System.Windows.Media.SolidColorBrush(
                    System.Windows.Media.Color.FromRgb(158, 158, 158)); // Gray
            }
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }
    }
}

