using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace SlideShowBob.Services
{
    /// <summary>
    /// Service for downloading and installing FFMPEG.
    /// Downloads from BtbN's FFmpeg Builds (official shared builds).
    /// </summary>
    public class FFmpegDownloadService
    {
        // FFMPEG 7.x download URLs
        // Note: Many sources still have 6.x, so we try multiple sources
        // Primary: Try to find a specific FFMPEG 7.0 build from BtbN
        // Format varies, so we try multiple possible URLs
        private const string FFmpegDownloadUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2024-01-28-12-50/ffmpeg-n7.0-latest-win64-lgpl-shared-7.0.zip";
        
        // Fallback 1: Alternative BtbN 7.0 build
        private const string FFmpegDownloadUrlFallback = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2024-02-20-12-50/ffmpeg-n7.0-latest-win64-lgpl-shared-7.0.zip";
        
        // Fallback 2: Gyan.dev essentials (usually has latest version)
        // Note: User may need to manually download if all URLs fail
        // https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials-shared.zip
        
        private readonly HttpClient _httpClient;

        public FFmpegDownloadService()
        {
            _httpClient = new HttpClient();
            _httpClient.Timeout = TimeSpan.FromMinutes(10); // Allow time for large download
            // Set user agent to avoid GitHub API rate limiting
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "SlideShowBob/1.0");
        }

        /// <summary>
        /// Downloads and installs FFMPEG to the specified directory.
        /// </summary>
        /// <param name="targetDirectory">Directory where FFMPEG should be installed (e.g., app directory)</param>
        /// <param name="progressCallback">Optional callback for download progress (0.0 to 1.0)</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Path to the installed FFMPEG directory, or null if failed</returns>
        public async Task<string?> DownloadAndInstallAsync(
            string targetDirectory, 
            IProgress<double>? progressCallback = null,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var ffmpegPath = Path.Combine(targetDirectory, "ffmpeg");
                
                // Create temp directory for download
                var tempDir = Path.Combine(Path.GetTempPath(), "SlideShowBob_FFmpeg_Download");
                Directory.CreateDirectory(tempDir);
                
                try
                {
                    var zipPath = Path.Combine(tempDir, "ffmpeg.zip");
                    
                    // Download the ZIP file
                    System.Diagnostics.Debug.WriteLine($"[FFmpegDownload] Starting download from: {FFmpegDownloadUrl}");
                    await DownloadFileAsync(FFmpegDownloadUrl, zipPath, progressCallback, cancellationToken);
                    
                    // Extract ZIP file - extract to temp location first
                    var tempExtractDir = Path.Combine(tempDir, "extracted");
                    System.Diagnostics.Debug.WriteLine($"[FFmpegDownload] Extracting ZIP to temp: {tempExtractDir}");
                    progressCallback?.Report(0.9); // 90% after download, 10% for extraction
                    
                    await ExtractZipAsync(zipPath, tempExtractDir, cancellationToken);
                    
                    // Find the bin folder in the extracted structure
                    // ZIP structure can be: ffmpeg-*/bin/* or just bin/* or directly in root
                    string? binSourcePath = null;
                    
                    // Check common structures
                    var possiblePaths = new[]
                    {
                        Path.Combine(tempExtractDir, "bin"), // Direct bin folder
                        Path.Combine(tempExtractDir, "ffmpeg-master-latest-win64-lgpl-shared", "bin"), // BtbN structure
                        Path.Combine(tempExtractDir, "ffmpeg-n7.0-latest-win64-lgpl-shared-7.0", "bin"), // BtbN 7.0 structure
                        tempExtractDir // Files directly in root
                    };
                    
                    // Also check for any subdirectory with a bin folder
                    foreach (var dir in Directory.GetDirectories(tempExtractDir))
                    {
                        var subBinPath = Path.Combine(dir, "bin");
                        if (Directory.Exists(subBinPath))
                        {
                            possiblePaths = possiblePaths.Concat(new[] { subBinPath }).ToArray();
                        }
                    }
                    
                    foreach (var path in possiblePaths)
                    {
                        if (Directory.Exists(path))
                        {
                            var testDlls = Directory.GetFiles(path, "avcodec-*.dll");
                            if (testDlls.Length > 0)
                            {
                                binSourcePath = path;
                                System.Diagnostics.Debug.WriteLine($"[FFmpegDownload] Found bin folder at: {path}");
                                break;
                            }
                        }
                    }
                    
                    if (binSourcePath == null)
                    {
                        throw new Exception("Could not find bin folder with DLLs in extracted ZIP");
                    }
                    
                    // Create target directory
                    Directory.CreateDirectory(ffmpegPath);
                    
                    // Copy only DLL files from bin folder to target
                    var sourceFiles = Directory.GetFiles(binSourcePath, "*.dll");
                    foreach (var sourceFile in sourceFiles)
                    {
                        var destFile = Path.Combine(ffmpegPath, Path.GetFileName(sourceFile));
                        File.Copy(sourceFile, destFile, overwrite: true);
                    }
                    
                    System.Diagnostics.Debug.WriteLine($"[FFmpegDownload] Copied {sourceFiles.Length} DLL files to: {ffmpegPath}");
                    
                    // Verify installation
                    var dllFiles = Directory.GetFiles(ffmpegPath, "avcodec-*.dll");
                    
                    if (dllFiles.Length == 0)
                    {
                        throw new Exception("FFMPEG installation verification failed: No DLLs found after extraction.");
                    }
                    
                    // Log FFMPEG version for debugging
                    var avcodecFile = dllFiles[0];
                    var fileName = Path.GetFileName(avcodecFile);
                    var versionMatch = System.Text.RegularExpressions.Regex.Match(fileName, @"avcodec-(\d+)\.dll");
                    if (versionMatch.Success && int.TryParse(versionMatch.Groups[1].Value, out int version))
                    {
                        System.Diagnostics.Debug.WriteLine($"[FFmpegDownload] Detected FFMPEG DLL version: {version} (from {fileName})");
                        // Note: Version 62 could be FFmpeg 6.2 or 8.0.1 - we'll test compatibility at runtime
                        // FFMediaToolkit 4.8.1 may work with newer versions even if docs say 7.x
                    }
                    
                    System.Diagnostics.Debug.WriteLine($"[FFmpegDownload] Successfully installed FFMPEG with {dllFiles.Length} DLLs to: {ffmpegPath}");
                    progressCallback?.Report(1.0);
                    
                    return ffmpegPath;
                }
                finally
                {
                    // Clean up temp directory
                    try
                    {
                        if (Directory.Exists(tempDir))
                        {
                            Directory.Delete(tempDir, recursive: true);
                        }
                    }
                    catch
                    {
                        // Ignore cleanup errors
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[FFmpegDownload] Error: {ex.Message}");
                throw;
            }
        }

        private async Task DownloadFileAsync(
            string url, 
            string destinationPath, 
            IProgress<double>? progressCallback,
            CancellationToken cancellationToken)
        {
            HttpResponseMessage? response = null;
            try
            {
                response = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                
                // If primary URL fails, try fallback
                if (!response.IsSuccessStatusCode && url == FFmpegDownloadUrl)
                {
                    System.Diagnostics.Debug.WriteLine($"[FFmpegDownload] Primary URL failed, trying fallback...");
                    response?.Dispose();
                    response = await _httpClient.GetAsync(FFmpegDownloadUrlFallback, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                }
                
                response.EnsureSuccessStatusCode();
                
                var totalBytes = response.Content.Headers.ContentLength ?? -1L;
                var canReportProgress = totalBytes > 0 && progressCallback != null;
                
                using (var fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None))
                using (var contentStream = await response.Content.ReadAsStreamAsync(cancellationToken))
                {
                    var totalBytesRead = 0L;
                    var buffer = new byte[8192];
                    var bytesRead = 0;
                    
                    while ((bytesRead = await contentStream.ReadAsync(buffer, 0, buffer.Length, cancellationToken)) > 0)
                    {
                        await fileStream.WriteAsync(buffer, 0, bytesRead, cancellationToken);
                        totalBytesRead += bytesRead;
                        
                        if (canReportProgress)
                        {
                            var progress = (double)totalBytesRead / totalBytes;
                            // Scale to 0-0.9 (90% for download, 10% for extraction)
                            progressCallback?.Report(progress * 0.9);
                        }
                    }
                }
            }
            finally
            {
                response?.Dispose();
            }
        }

        private async Task ExtractZipAsync(string zipPath, string extractPath, CancellationToken cancellationToken)
        {
            await Task.Run(() =>
            {
                Directory.CreateDirectory(extractPath);
                
                using (var archive = ZipFile.OpenRead(zipPath))
                {
                    foreach (var entry in archive.Entries)
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        
                        // Skip directories
                        if (string.IsNullOrEmpty(entry.Name))
                            continue;
                        
                        // Get the full path for the entry (preserve ZIP structure)
                        var entryPath = Path.Combine(extractPath, entry.FullName);
                        var entryDir = Path.GetDirectoryName(entryPath);
                        
                        if (entryDir != null && !Directory.Exists(entryDir))
                        {
                            Directory.CreateDirectory(entryDir);
                        }
                        
                        // Extract the file
                        entry.ExtractToFile(entryPath, overwrite: true);
                    }
                }
            }, cancellationToken);
        }

        /// <summary>
        /// Gets the size of the FFMPEG download in bytes.
        /// </summary>
        public async Task<long?> GetDownloadSizeAsync()
        {
            try
            {
                using (var response = await _httpClient.SendAsync(
                    new HttpRequestMessage(HttpMethod.Head, FFmpegDownloadUrl),
                    HttpCompletionOption.ResponseHeadersRead))
                {
                    return response.Content.Headers.ContentLength;
                }
            }
            catch
            {
                return null;
            }
        }

        public void Dispose()
        {
            _httpClient?.Dispose();
        }
    }
}

