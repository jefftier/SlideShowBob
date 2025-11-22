using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;

namespace SlideShowBob.Models
{
    /// <summary>
    /// Represents a folder node in a hierarchical folder tree structure.
    /// Supports MVVM binding with property change notifications.
    /// </summary>
    public class FolderNode : INotifyPropertyChanged
    {
        private bool _isExpanded;
        private bool _isSelected;

        /// <summary>
        /// Gets or sets the display name of the folder (without full path).
        /// </summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the full path to the folder.
        /// </summary>
        public string FullPath { get; set; } = string.Empty;

        /// <summary>
        /// Gets the collection of child folder nodes.
        /// </summary>
        public ObservableCollection<FolderNode> Children { get; } = new ObservableCollection<FolderNode>();

        /// <summary>
        /// Gets or sets whether this folder node is expanded in the tree view.
        /// </summary>
        public bool IsExpanded
        {
            get => _isExpanded;
            set
            {
                if (_isExpanded != value)
                {
                    _isExpanded = value;
                    OnPropertyChanged();
                }
            }
        }

        /// <summary>
        /// Gets or sets whether this folder node is currently selected.
        /// </summary>
        public bool IsSelected
        {
            get => _isSelected;
            set
            {
                if (_isSelected != value)
                {
                    _isSelected = value;
                    OnPropertyChanged();
                }
            }
        }

        /// <summary>
        /// Gets the parent folder node, if any.
        /// </summary>
        public FolderNode? Parent { get; set; }

        /// <summary>
        /// Gets a value indicating whether this node has child folders.
        /// </summary>
        public bool HasChildren => Children.Count > 0;

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        /// <summary>
        /// Creates a root folder node from a full path.
        /// </summary>
        public static FolderNode CreateRoot(string fullPath)
        {
            if (string.IsNullOrWhiteSpace(fullPath))
                throw new ArgumentException("Full path cannot be null or empty.", nameof(fullPath));

            string normalizedPath = Path.GetFullPath(fullPath);
            string name = Path.GetFileName(normalizedPath);
            if (string.IsNullOrEmpty(name))
                name = normalizedPath; // Root drive, etc.

            return new FolderNode
            {
                Name = name,
                FullPath = normalizedPath
            };
        }
    }
}

