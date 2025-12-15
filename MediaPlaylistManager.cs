using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;

namespace SlideShowBob
{
    /// <summary>
    /// Manages the ordered playlist of media items and navigation (next/prev/random).
    /// Handles index management and ensures index stays within bounds.
    /// Thread-safe to prevent crashes during rapid folder changes.
    /// </summary>
    public class MediaPlaylistManager
    {
        private readonly List<MediaItem> _items = new();
        private int _currentIndex = -1;
        private readonly Random _random = new();
        private readonly object _lock = new object();

        public int Count
        {
            get
            {
                lock (_lock)
                {
                    return _items.Count;
                }
            }
        }

        public int CurrentIndex
        {
            get
            {
                lock (_lock)
                {
                    return _currentIndex;
                }
            }
        }

        public MediaItem? CurrentItem
        {
            get
            {
                lock (_lock)
                {
                    return IsValidIndex(_currentIndex) ? _items[_currentIndex] : null;
                }
            }
        }

        public bool HasItems
        {
            get
            {
                lock (_lock)
                {
                    return _items.Count > 0;
                }
            }
        }

        public event EventHandler? PlaylistChanged;

        /// <summary>
        /// Loads files from folders and builds the playlist.
        /// Thread-safe to prevent crashes during rapid folder changes.
        /// </summary>
        public void LoadFiles(IEnumerable<string> folders, bool includeVideos)
        {
            var newItems = new List<MediaItem>();

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
                        newItems.Add(new MediaItem(file));
                    }
                }
                catch
                {
                    // Skip folders we can't access
                }
            }

            // Atomic update to prevent race conditions
            lock (_lock)
            {
                _items.Clear();
                _items.AddRange(newItems);
                _currentIndex = -1;
            }

            PlaylistChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Sorts the playlist by the specified mode.
        /// Thread-safe to prevent crashes during rapid operations.
        /// </summary>
        public void Sort(SortMode mode)
        {
            List<MediaItem> sortedItems;
            int currentIdx;

            // Copy items and get current index under lock
            lock (_lock)
            {
                var temp = _items.ToList();
                currentIdx = _currentIndex;

                switch (mode)
                {
                    case SortMode.NameAZ:
                        sortedItems = temp.OrderBy(i => i.FileName).ToList();
                        break;
                    case SortMode.NameZA:
                        sortedItems = temp.OrderByDescending(i => i.FileName).ToList();
                        break;
                    case SortMode.DateOldest:
                        sortedItems = temp.OrderBy(i => File.GetLastWriteTime(i.FilePath)).ToList();
                        break;
                    case SortMode.DateNewest:
                        sortedItems = temp.OrderByDescending(i => File.GetLastWriteTime(i.FilePath)).ToList();
                        break;
                    case SortMode.Random:
                        sortedItems = temp.OrderBy(_ => _random.Next()).ToList();
                        break;
                    default:
                        sortedItems = temp;
                        break;
                }
            }

            // Atomic update
            lock (_lock)
            {
                _items.Clear();
                _items.AddRange(sortedItems);

                // Reset index but keep it valid
                if (currentIdx >= _items.Count)
                    _currentIndex = _items.Count > 0 ? _items.Count - 1 : -1;
                else
                    _currentIndex = currentIdx;
            }

            PlaylistChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Sets the current index, ensuring it's valid.
        /// Thread-safe.
        /// </summary>
        public void SetIndex(int index)
        {
            lock (_lock)
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
        }

        /// <summary>
        /// Moves to the next item (wraps around).
        /// Thread-safe.
        /// </summary>
        public bool MoveNext()
        {
            lock (_lock)
            {
                if (_items.Count == 0) return false;

                _currentIndex = (_currentIndex + 1) % _items.Count;
                return true;
            }
        }

        /// <summary>
        /// Moves to the previous item (wraps around).
        /// Thread-safe.
        /// </summary>
        public bool MovePrevious()
        {
            lock (_lock)
            {
                if (_items.Count == 0) return false;

                _currentIndex--;
                if (_currentIndex < 0)
                    _currentIndex = _items.Count - 1;
                return true;
            }
        }

        /// <summary>
        /// Gets the item at the specified index, or null if invalid.
        /// Thread-safe.
        /// </summary>
        public MediaItem? GetItem(int index)
        {
            lock (_lock)
            {
                return IsValidIndex(index) ? _items[index] : null;
            }
        }

        /// <summary>
        /// Gets all items as a read-only list.
        /// Thread-safe - returns a snapshot.
        /// </summary>
        public IReadOnlyList<MediaItem> GetAllItems()
        {
            lock (_lock)
            {
                return _items.ToList(); // Return a copy to prevent external modification
            }
        }

        /// <summary>
        /// Gets the next item without changing the current index.
        /// Thread-safe.
        /// </summary>
        public MediaItem? GetNextItem()
        {
            lock (_lock)
            {
                if (_items.Count == 0) return null;
                int next = (_currentIndex + 1) % _items.Count;
                return _items[next];
            }
        }

        /// <summary>
        /// Gets the previous item without changing the current index.
        /// Thread-safe.
        /// </summary>
        public MediaItem? GetPreviousItem()
        {
            lock (_lock)
            {
                if (_items.Count == 0) return null;
                int prev = (_currentIndex - 1 + _items.Count) % _items.Count;
                return _items[prev];
            }
        }

        /// <summary>
        /// Gets neighbor items (next and previous) for preloading.
        /// Thread-safe.
        /// </summary>
        public (MediaItem? next, MediaItem? previous) GetNeighborItems()
        {
            lock (_lock)
            {
                if (_items.Count == 0)
                    return (null, null);

                int next = (_currentIndex + 1) % _items.Count;
                int prev = (_currentIndex - 1 + _items.Count) % _items.Count;
                return (_items[next], _items[prev]);
            }
        }

        /// <summary>
        /// Sets the current file by path. If the file is not in the playlist, sets index to 0 or -1.
        /// Thread-safe.
        /// </summary>
        public void SetCurrentFile(string? filePath)
        {
            lock (_lock)
            {
                if (string.IsNullOrWhiteSpace(filePath))
                {
                    if (_items.Count > 0)
                        _currentIndex = 0;
                    else
                        _currentIndex = -1;
                    return;
                }

                string normalized = Path.GetFullPath(filePath);
                for (int i = 0; i < _items.Count; i++)
                {
                    string itemPath = Path.GetFullPath(_items[i].FilePath);
                    if (string.Equals(itemPath, normalized, StringComparison.OrdinalIgnoreCase))
                    {
                        _currentIndex = i;
                        return;
                    }
                }

                // File not found - set to first item if available
                if (_items.Count > 0)
                    _currentIndex = 0;
                else
                    _currentIndex = -1;
            }
        }

        /// <summary>
        /// Clears all items and resets the index.
        /// Thread-safe.
        /// </summary>
        public void Clear()
        {
            lock (_lock)
            {
                _items.Clear();
                _currentIndex = -1;
            }
            PlaylistChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Removes a file from the playlist by file path.
        /// Thread-safe.
        /// </summary>
        public bool RemoveFile(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return false;

            string normalized = Path.GetFullPath(filePath);
            
            lock (_lock)
            {
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
            }

            PlaylistChanged?.Invoke(this, EventArgs.Empty);
            return true;
        }

        private bool IsValidIndex(int index)
        {
            lock (_lock)
            {
                return index >= 0 && index < _items.Count;
            }
        }
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

