using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace SlideShowBob
{
    /// <summary>
    /// Manages the ordered list of media files, current index, and navigation logic.
    /// Handles sorting, filtering, and index management to ensure correct media selection.
    /// </summary>
    public class PlaylistService
    {
        private readonly List<string> _allFiles = new();
        private readonly List<string> _orderedFiles = new();
        private int _currentIndex = -1;

        public enum SortMode
        {
            NameAZ,
            NameZA,
            DateOldest,
            DateNewest,
            Random
        }

        /// <summary>
        /// Gets the current file path, or null if no file is selected.
        /// </summary>
        public string? CurrentFile
        {
            get
            {
                if (_currentIndex >= 0 && _currentIndex < _orderedFiles.Count)
                    return _orderedFiles[_currentIndex];
                return null;
            }
        }

        /// <summary>
        /// Gets the current index (0-based), or -1 if no file is selected.
        /// </summary>
        public int CurrentIndex => _currentIndex;

        /// <summary>
        /// Gets the total count of files in the ordered list.
        /// </summary>
        public int Count => _orderedFiles.Count;

        /// <summary>
        /// Gets a read-only copy of all files.
        /// </summary>
        public IReadOnlyList<string> AllFiles => _allFiles.AsReadOnly();

        /// <summary>
        /// Gets a read-only copy of the ordered files.
        /// </summary>
        public IReadOnlyList<string> OrderedFiles => _orderedFiles.AsReadOnly();

        /// <summary>
        /// Sets the list of all files and applies the current sort mode.
        /// </summary>
        public void SetAllFiles(IEnumerable<string> files, SortMode sortMode)
        {
            _allFiles.Clear();
            _allFiles.AddRange(files);
            ApplySort(sortMode);
        }

        /// <summary>
        /// Applies sorting to the ordered files list.
        /// </summary>
        public void ApplySort(SortMode sortMode)
        {
            _orderedFiles.Clear();
            if (_allFiles.Count == 0) return;

            switch (sortMode)
            {
                case SortMode.NameAZ:
                    _orderedFiles.AddRange(_allFiles.OrderBy(f => Path.GetFileName(f)));
                    break;
                case SortMode.NameZA:
                    _orderedFiles.AddRange(_allFiles.OrderByDescending(f => Path.GetFileName(f)));
                    break;
                case SortMode.DateOldest:
                    _orderedFiles.AddRange(_allFiles.OrderBy(f => File.GetLastWriteTime(f)));
                    break;
                case SortMode.DateNewest:
                    _orderedFiles.AddRange(_allFiles.OrderByDescending(f => File.GetLastWriteTime(f)));
                    break;
                case SortMode.Random:
                    var rnd = new Random();
                    _orderedFiles.AddRange(_allFiles.OrderBy(_ => rnd.Next()));
                    break;
            }

            // Reset index if it's now out of bounds
            if (_currentIndex >= _orderedFiles.Count)
                _currentIndex = _orderedFiles.Count > 0 ? 0 : -1;
        }

        /// <summary>
        /// Moves to the next file in the playlist (wraps around).
        /// Returns true if successful, false if playlist is empty.
        /// </summary>
        public bool MoveNext()
        {
            if (_orderedFiles.Count == 0)
            {
                _currentIndex = -1;
                return false;
            }

            _currentIndex = (_currentIndex + 1) % _orderedFiles.Count;
            return true;
        }

        /// <summary>
        /// Moves to the previous file in the playlist (wraps around).
        /// Returns true if successful, false if playlist is empty.
        /// </summary>
        public bool MovePrevious()
        {
            if (_orderedFiles.Count == 0)
            {
                _currentIndex = -1;
                return false;
            }

            _currentIndex--;
            if (_currentIndex < 0)
                _currentIndex = _orderedFiles.Count - 1;
            return true;
        }

        /// <summary>
        /// Sets the current index to a specific value, clamping to valid range.
        /// </summary>
        public void SetIndex(int index)
        {
            if (_orderedFiles.Count == 0)
            {
                _currentIndex = -1;
                return;
            }

            if (index < 0)
                _currentIndex = 0;
            else if (index >= _orderedFiles.Count)
                _currentIndex = _orderedFiles.Count - 1;
            else
                _currentIndex = index;
        }

        /// <summary>
        /// Sets the current file by path. If the file is not in the playlist, sets index to 0.
        /// </summary>
        public void SetCurrentFile(string? filePath)
        {
            if (filePath != null && _orderedFiles.Contains(filePath))
            {
                _currentIndex = _orderedFiles.IndexOf(filePath);
            }
            else if (_orderedFiles.Count > 0)
            {
                _currentIndex = 0;
            }
            else
            {
                _currentIndex = -1;
            }
        }

        /// <summary>
        /// Gets the next file path without changing the current index.
        /// </summary>
        public string? GetNextFile()
        {
            if (_orderedFiles.Count == 0) return null;
            int next = (_currentIndex + 1) % _orderedFiles.Count;
            return _orderedFiles[next];
        }

        /// <summary>
        /// Gets the previous file path without changing the current index.
        /// </summary>
        public string? GetPreviousFile()
        {
            if (_orderedFiles.Count == 0) return null;
            int prev = (_currentIndex - 1 + _orderedFiles.Count) % _orderedFiles.Count;
            return _orderedFiles[prev];
        }

        /// <summary>
        /// Gets neighbor files (next and previous) for preloading.
        /// </summary>
        public (string? next, string? previous) GetNeighborFiles()
        {
            if (_orderedFiles.Count == 0)
                return (null, null);

            int next = (_currentIndex + 1) % _orderedFiles.Count;
            int prev = (_currentIndex - 1 + _orderedFiles.Count) % _orderedFiles.Count;
            return (_orderedFiles[next], _orderedFiles[prev]);
        }

        /// <summary>
        /// Clears all files and resets the index.
        /// </summary>
        public void Clear()
        {
            _allFiles.Clear();
            _orderedFiles.Clear();
            _currentIndex = -1;
        }

        /// <summary>
        /// Removes files that match a predicate.
        /// </summary>
        public void RemoveFiles(Predicate<string> predicate)
        {
            _allFiles.RemoveAll(predicate);
            _orderedFiles.RemoveAll(predicate);

            if (_orderedFiles.Count == 0)
            {
                _currentIndex = -1;
            }
            else if (_currentIndex >= _orderedFiles.Count)
            {
                _currentIndex = _orderedFiles.Count - 1;
            }
        }

        /// <summary>
        /// Ensures the current index is valid. If invalid, sets it to 0 or -1.
        /// </summary>
        public void ValidateIndex()
        {
            if (_orderedFiles.Count == 0)
            {
                _currentIndex = -1;
            }
            else if (_currentIndex < 0)
            {
                _currentIndex = 0;
            }
            else if (_currentIndex >= _orderedFiles.Count)
            {
                _currentIndex = 0;
            }
        }
    }
}



