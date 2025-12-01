using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace SlideShowBob
{
    /// <summary>
    /// Manages the ordered playlist of media items and navigation (next/prev/random).
    /// Handles index management and ensures index stays within bounds.
    /// </summary>
    public class MediaPlaylistManager
    {
        private readonly List<MediaItem> _items = new();
        private int _currentIndex = -1;
        private readonly Random _random = new();

        public int Count => _items.Count;
        public int CurrentIndex => _currentIndex;
        public MediaItem? CurrentItem => IsValidIndex(_currentIndex) ? _items[_currentIndex] : null;
        public bool HasItems => _items.Count > 0;

        public event EventHandler? PlaylistChanged;

        /// <summary>
        /// Loads files from folders and builds the playlist.
        /// </summary>
        public void LoadFiles(IEnumerable<string> folders, bool includeVideos)
        {
            _items.Clear();
            _currentIndex = -1;

            string[] imageExts = { ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff" };
            string[] motionExts = includeVideos ? new[] { ".gif", ".mp4" } : new[] { ".gif" };

            var allExts = imageExts.Concat(motionExts).ToHashSet(StringComparer.OrdinalIgnoreCase);

            foreach (string folder in folders)
            {
                if (!Directory.Exists(folder)) continue;

                try
                {
                    var files = Directory.GetFiles(folder, "*.*", SearchOption.AllDirectories)
                        .Where(f => allExts.Contains(Path.GetExtension(f)))
                        .Where(File.Exists);

                    foreach (string file in files)
                    {
                        _items.Add(new MediaItem(file));
                    }
                }
                catch
                {
                    // Skip folders we can't access
                }
            }

            PlaylistChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Sorts the playlist by the specified mode.
        /// </summary>
        public void Sort(SortMode mode)
        {
            // Copy items before clearing
            var temp = _items.ToList();
            _items.Clear();

            switch (mode)
            {
                case SortMode.NameAZ:
                    _items.AddRange(temp.OrderBy(i => i.FileName));
                    break;
                case SortMode.NameZA:
                    _items.AddRange(temp.OrderByDescending(i => i.FileName));
                    break;
                case SortMode.DateOldest:
                    _items.AddRange(temp.OrderBy(i => File.GetLastWriteTime(i.FilePath)));
                    break;
                case SortMode.DateNewest:
                    _items.AddRange(temp.OrderByDescending(i => File.GetLastWriteTime(i.FilePath)));
                    break;
                case SortMode.Random:
                    _items.AddRange(temp.OrderBy(_ => _random.Next()));
                    break;
            }

            // Reset index but keep it valid
            if (_currentIndex >= _items.Count)
                _currentIndex = _items.Count > 0 ? _items.Count - 1 : -1;

            PlaylistChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Sets the current index, ensuring it's valid.
        /// </summary>
        public void SetIndex(int index)
        {
            if (_items.Count == 0)
            {
                _currentIndex = -1;
                return;
            }

            if (index < 0)
                _currentIndex = 0;
            else if (index >= _items.Count)
                _currentIndex = _items.Count - 1;
            else
                _currentIndex = index;
        }

        /// <summary>
        /// Moves to the next item (wraps around).
        /// </summary>
        public bool MoveNext()
        {
            if (_items.Count == 0) return false;

            _currentIndex = (_currentIndex + 1) % _items.Count;
            return true;
        }

        /// <summary>
        /// Moves to the previous item (wraps around).
        /// </summary>
        public bool MovePrevious()
        {
            if (_items.Count == 0) return false;

            _currentIndex--;
            if (_currentIndex < 0)
                _currentIndex = _items.Count - 1;
            return true;
        }

        /// <summary>
        /// Gets the item at the specified index, or null if invalid.
        /// </summary>
        public MediaItem? GetItem(int index)
        {
            return IsValidIndex(index) ? _items[index] : null;
        }

        /// <summary>
        /// Gets all items as a read-only list.
        /// </summary>
        public IReadOnlyList<MediaItem> GetAllItems() => _items;

        /// <summary>
        /// Removes a file from the playlist by file path.
        /// </summary>
        public bool RemoveFile(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return false;

            string normalized = Path.GetFullPath(filePath);
            
            // Find the index of the item to remove (if any)
            int indexToRemove = -1;
            for (int i = 0; i < _items.Count; i++)
            {
                string itemPath = Path.GetFullPath(_items[i].FilePath);
                if (string.Equals(itemPath, normalized, StringComparison.OrdinalIgnoreCase))
                {
                    indexToRemove = i;
                    break;
                }
            }

            if (indexToRemove == -1)
                return false;

            // Remove the item
            _items.RemoveAt(indexToRemove);

            // Adjust current index if needed
            if (_items.Count == 0)
            {
                _currentIndex = -1;
            }
            else if (indexToRemove <= _currentIndex)
            {
                // If we removed an item at or before current index, adjust
                if (indexToRemove < _currentIndex)
                    _currentIndex--; // Shift index back if item before current was removed
                else if (indexToRemove == _currentIndex)
                {
                    // If we removed the current item, stay at the same index (which now points to the next item)
                    // But if we were at the end, move back one
                    if (_currentIndex >= _items.Count)
                        _currentIndex = _items.Count - 1;
                }
            }

            PlaylistChanged?.Invoke(this, EventArgs.Empty);
            return true;
        }

        private bool IsValidIndex(int index) => index >= 0 && index < _items.Count;
    }

    public enum SortMode
    {
        NameAZ,
        NameZA,
        DateOldest,
        DateNewest,
        Random
    }
}

