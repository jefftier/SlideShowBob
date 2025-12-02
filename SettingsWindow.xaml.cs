using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using SlideShowBob.ViewModels;

namespace SlideShowBob
{
    public partial class SettingsWindow : Window
    {
        private readonly SettingsViewModel _viewModel;

        // Dark title bar constants (same pattern as MainWindow)
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1 = 19;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(
            IntPtr hwnd,
            int dwAttribute,
            ref int pvAttribute,
            int cbAttribute);

        public SettingsWindow(SettingsViewModel viewModel)
        {
            InitializeComponent();
            _viewModel = viewModel ?? throw new ArgumentNullException(nameof(viewModel));
            DataContext = _viewModel;

            // Subscribe to ViewModel's RequestClose event
            _viewModel.RequestClose += ViewModel_RequestClose;

            // Subscribe to ViewModel property changes for ComboBox synchronization
            _viewModel.PropertyChanged += (s, e) =>
            {
                if (e.PropertyName == nameof(SettingsViewModel.ToolbarInactivityBehavior))
                {
                    SyncComboBoxToViewModel();
                }
            };

            // Subscribe to ComboBox selection changes
            ToolbarInactivityBehaviorComboBox.SelectionChanged += ToolbarInactivityBehaviorComboBox_SelectionChanged;

            Loaded += SettingsWindow_Loaded;
        }

        private void SettingsWindow_Loaded(object sender, RoutedEventArgs e)
        {
            EnableDarkTitleBar();
            // Sync ComboBox to ViewModel on load
            SyncComboBoxToViewModel();
        }

        private void ToolbarInactivityBehaviorComboBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            if (ToolbarInactivityBehaviorComboBox.SelectedItem is System.Windows.Controls.ComboBoxItem selectedItem)
            {
                string? behavior = selectedItem.Tag?.ToString();
                if (behavior != null && behavior != _viewModel.ToolbarInactivityBehavior)
                {
                    _viewModel.ToolbarInactivityBehavior = behavior;
                }
            }
        }

        private void SyncComboBoxToViewModel()
        {
            string behavior = _viewModel.ToolbarInactivityBehavior;
            foreach (System.Windows.Controls.ComboBoxItem item in ToolbarInactivityBehaviorComboBox.Items)
            {
                if (item.Tag?.ToString() == behavior)
                {
                    if (ToolbarInactivityBehaviorComboBox.SelectedItem != item)
                    {
                        ToolbarInactivityBehaviorComboBox.SelectedItem = item;
                    }
                    return;
                }
            }
            // Default to first item if nothing matches
            if (ToolbarInactivityBehaviorComboBox.Items.Count > 0 && ToolbarInactivityBehaviorComboBox.SelectedItem == null)
            {
                ToolbarInactivityBehaviorComboBox.SelectedIndex = 0;
            }
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

        private void ViewModel_RequestClose(object? sender, bool dialogResult)
        {
            DialogResult = dialogResult;
            Close();
        }

        protected override void OnClosed(EventArgs e)
        {
            // Unsubscribe from ViewModel events
            if (_viewModel != null)
            {
                _viewModel.RequestClose -= ViewModel_RequestClose;
            }

            // Unsubscribe from ComboBox events
            ToolbarInactivityBehaviorComboBox.SelectionChanged -= ToolbarInactivityBehaviorComboBox_SelectionChanged;

            base.OnClosed(e);
        }
    }
}

