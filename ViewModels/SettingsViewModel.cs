using System;
using System.Collections.Generic;
using System.Windows.Media;
using SlideShowBob.Commands;

namespace SlideShowBob.ViewModels
{
    public class SettingsViewModel : BaseViewModel
    {
        private readonly SettingsManagerWrapper _settingsManager;
        private AppSettings _originalSettings;

        // Save flags
        private bool _saveSlideDelay;
        private bool _saveIncludeVideos;
        private bool _saveSortMode;
        private bool _saveIsMuted;
        private bool _saveFolderPaths;

        // Settings values
        private string _toolbarInactivityBehavior = "Dim";
        private bool _portraitBlurEffect;
        private bool _useFfmpegForPlayback;

        // Computed properties for FFMPEG status
        private string _ffmpegStatusText = "FFMPEG: Not Active";
        private Brush _ffmpegStatusForeground = new SolidColorBrush(Color.FromRgb(158, 158, 158)); // Gray

        public event EventHandler<bool>? RequestClose; // bool = DialogResult

        public SettingsViewModel(SettingsManagerWrapper settingsManager)
        {
            _settingsManager = settingsManager ?? throw new ArgumentNullException(nameof(settingsManager));
            
            SaveCommand = new RelayCommand(Save);
            CancelCommand = new RelayCommand(Cancel);

            // Load current settings
            LoadSettings();
        }

        #region Properties

        public bool SaveSlideDelay
        {
            get => _saveSlideDelay;
            set
            {
                if (SetProperty(ref _saveSlideDelay, value))
                {
                    // If disabling save, reset to default
                    if (!value && _originalSettings.SaveSlideDelay)
                    {
                        _originalSettings.SlideDelayMs = 2000; // default
                    }
                }
            }
        }

        public bool SaveIncludeVideos
        {
            get => _saveIncludeVideos;
            set
            {
                if (SetProperty(ref _saveIncludeVideos, value))
                {
                    // If disabling save, reset to default
                    if (!value && _originalSettings.SaveIncludeVideos)
                    {
                        _originalSettings.IncludeVideos = false; // default
                    }
                }
            }
        }

        public bool SaveSortMode
        {
            get => _saveSortMode;
            set
            {
                if (SetProperty(ref _saveSortMode, value))
                {
                    // If disabling save, reset to default
                    if (!value && _originalSettings.SaveSortMode)
                    {
                        _originalSettings.SortMode = "NameAZ"; // default
                    }
                }
            }
        }

        public bool SaveIsMuted
        {
            get => _saveIsMuted;
            set
            {
                if (SetProperty(ref _saveIsMuted, value))
                {
                    // If disabling save, reset to default
                    if (!value && _originalSettings.SaveIsMuted)
                    {
                        _originalSettings.IsMuted = true; // default
                    }
                }
            }
        }

        public bool SaveFolderPaths
        {
            get => _saveFolderPaths;
            set
            {
                if (SetProperty(ref _saveFolderPaths, value))
                {
                    // If disabling save, reset to default
                    if (!value && _originalSettings.SaveFolderPaths)
                    {
                        _originalSettings.FolderPaths = new List<string>(); // default (empty)
                    }
                }
            }
        }

        public string ToolbarInactivityBehavior
        {
            get => _toolbarInactivityBehavior;
            set => SetProperty(ref _toolbarInactivityBehavior, value);
        }

        public bool PortraitBlurEffect
        {
            get => _portraitBlurEffect;
            set => SetProperty(ref _portraitBlurEffect, value);
        }

        public bool UseFfmpegForPlayback
        {
            get => _useFfmpegForPlayback;
            set
            {
                if (SetProperty(ref _useFfmpegForPlayback, value))
                {
                    UpdateFfmpegStatus();
                }
            }
        }

        public string FfmpegStatusText
        {
            get => _ffmpegStatusText;
            private set => SetProperty(ref _ffmpegStatusText, value);
        }

        public Brush FfmpegStatusForeground
        {
            get => _ffmpegStatusForeground;
            private set => SetProperty(ref _ffmpegStatusForeground, value);
        }

        #endregion

        #region Commands

        public RelayCommand SaveCommand { get; }
        public RelayCommand CancelCommand { get; }

        #endregion

        #region Command Implementations

        private void Save()
        {
            // Update save flags in original settings
            _originalSettings.SaveSlideDelay = SaveSlideDelay;
            _originalSettings.SaveIncludeVideos = SaveIncludeVideos;
            _originalSettings.SaveSortMode = SaveSortMode;
            _originalSettings.SaveIsMuted = SaveIsMuted;
            _originalSettings.SaveFolderPaths = SaveFolderPaths;

            // Update toolbar behavior setting (always saves)
            _originalSettings.ToolbarInactivityBehavior = ToolbarInactivityBehavior;

            // Update portrait blur effect setting
            _originalSettings.PortraitBlurEffect = PortraitBlurEffect;

            // Update FFMPEG setting
            _originalSettings.UseFfmpegForPlayback = UseFfmpegForPlayback;

            // Save settings
            _settingsManager.Save(_originalSettings);

            // Request window to close with DialogResult = true
            RequestClose?.Invoke(this, true);
        }

        private void Cancel()
        {
            // Request window to close with DialogResult = false (or null)
            RequestClose?.Invoke(this, false);
        }

        #endregion

        #region Helper Methods

        private void LoadSettings()
        {
            _originalSettings = _settingsManager.Load();

            // Load save flags
            SaveSlideDelay = _originalSettings.SaveSlideDelay;
            SaveIncludeVideos = _originalSettings.SaveIncludeVideos;
            SaveSortMode = _originalSettings.SaveSortMode;
            SaveIsMuted = _originalSettings.SaveIsMuted;
            SaveFolderPaths = _originalSettings.SaveFolderPaths;

            // Load toolbar behavior setting
            ToolbarInactivityBehavior = _originalSettings.ToolbarInactivityBehavior ?? "Dim";

            // Load portrait blur effect setting
            PortraitBlurEffect = _originalSettings.PortraitBlurEffect;

            // Load FFMPEG setting
            UseFfmpegForPlayback = _originalSettings.UseFfmpegForPlayback;

            // Update FFMPEG status
            UpdateFfmpegStatus();
        }

        private void UpdateFfmpegStatus()
        {
            bool isEnabled = ThumbnailService.IsFfmpegEnabled(UseFfmpegForPlayback);

            if (isEnabled)
            {
                FfmpegStatusText = "FFMPEG: Active";
                // Use green color for active status
                FfmpegStatusForeground = new SolidColorBrush(Color.FromRgb(76, 175, 80)); // Green
            }
            else
            {
                FfmpegStatusText = "FFMPEG: Not Active";
                // Use muted/gray color for inactive status
                FfmpegStatusForeground = new SolidColorBrush(Color.FromRgb(158, 158, 158)); // Gray
            }
        }

        #endregion
    }
}

