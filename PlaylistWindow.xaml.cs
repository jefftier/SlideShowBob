using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;

namespace SlideShowBob
{
    public partial class PlaylistWindow : Window
    {
        private readonly MainWindow _owner;
        private readonly List<string> _folders;
        private readonly List<string> _allFiles;

        private class FolderEntry
        {
            public string FolderPath { get; set; } = "";
            public string DisplayName { get; set; } = "";
            public int FileCount { get; set; }

            public string FileCountText => FileCount == 1 ? "(1 file)" : $"({FileCount} files)";
        }

        private class FileEntry
        {
            public string FullPath { get; set; } = "";
            public string Name => Path.GetFileName(FullPath);
        }

        // Dark title bar constants (same pattern as MainWindow)
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1 = 19;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(
            IntPtr hwnd,
            int dwAttribute,
            ref int pvAttribute,
            int cbAttribute);

        public PlaylistWindow(MainWindow owner, List<string> folders, List<string> allFiles)
        {
            InitializeComponent();

            _owner = owner;
            _folders = folders;
            _allFiles = allFiles;

            Loaded += PlaylistWindow_Loaded;
            RefreshFolderList();
        }

        private void PlaylistWindow_Loaded(object sender, RoutedEventArgs e)
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

        private void RefreshFolderList()
        {
            var entries = new List<FolderEntry>();

            foreach (var folder in _folders)
            {
                if (string.IsNullOrWhiteSpace(folder))
                    continue;

                var count = _allFiles.Count(f => IsUnderFolder(f, folder));

                var normalized = Path.GetFullPath(folder)
                                     .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string folderName = Path.GetFileName(normalized);
                if (string.IsNullOrEmpty(folderName))
                    folderName = normalized; // root, etc.

                entries.Add(new FolderEntry
                {
                    FolderPath = folder,
                    DisplayName = folderName,
                    FileCount = count
                });
            }

            FolderList.ItemsSource = entries
                .OrderBy(e => e.DisplayName, StringComparer.OrdinalIgnoreCase)
                .ToList();

            FileList.ItemsSource = null;
        }

        private static bool IsUnderFolder(string filePath, string folderPath)
        {
            if (string.IsNullOrEmpty(filePath) || string.IsNullOrEmpty(folderPath))
                return false;

            folderPath = Path.GetFullPath(folderPath)
                             .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                             + Path.DirectorySeparatorChar;
            filePath = Path.GetFullPath(filePath);

            return filePath.StartsWith(folderPath, StringComparison.OrdinalIgnoreCase);
        }

        private void FolderList_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (FolderList.SelectedItem is not FolderEntry entry)
            {
                FileList.ItemsSource = null;
                return;
            }

            var files = _allFiles
                .Where(f => IsUnderFolder(f, entry.FolderPath))
                .Select(f => new FileEntry { FullPath = f })
                .OrderBy(fe => fe.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            FileList.ItemsSource = files;
        }

        private async void AddFolderButton_Click(object sender, RoutedEventArgs e)
        {
            // Reuse main window logic for multi-folder selection
            await _owner.ChooseFoldersFromDialogAsync();
            RefreshFolderList();
        }

        private void RemoveFolderMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (FolderList.SelectedItem is not FolderEntry entry)
                return;

            _owner.RemoveFolderFromPlaylist(entry.FolderPath);
            RefreshFolderList();
        }

        private void RemoveFileMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (FileList.SelectedItem is not FileEntry selected)
                return;

            _owner.RemoveFileFromPlaylist(selected.FullPath);
            RefreshFolderList();
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }
    }
}
