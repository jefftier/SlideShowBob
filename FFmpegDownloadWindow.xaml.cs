using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using SlideShowBob.Services;

namespace SlideShowBob
{
    /// <summary>
    /// Dialog window for downloading and installing FFMPEG.
    /// </summary>
    public partial class FFmpegDownloadWindow : Window
    {
        private readonly FFmpegDownloadService _downloadService;
        private CancellationTokenSource? _cancellationTokenSource;
        private bool _isDownloading = false;

        public FFmpegDownloadWindow()
        {
            InitializeComponent();
            _downloadService = new FFmpegDownloadService();
        }

        public string? InstalledFFmpegPath { get; private set; }
        public bool WasCancelled { get; private set; }

        private async void DownloadButton_Click(object sender, RoutedEventArgs e)
        {
            if (_isDownloading)
                return;

            _isDownloading = true;
            DownloadButton.IsEnabled = false;
            CancelButton.Content = "Cancel";
            ProgressBar.Visibility = Visibility.Visible;
            ProgressTextBlock.Visibility = Visibility.Visible;
            StatusTextBlock.Text = "Downloading FFMPEG...";

            _cancellationTokenSource = new CancellationTokenSource();

            try
            {
                var appDir = AppDomain.CurrentDomain.BaseDirectory;
                
                // Create progress reporter
                var progress = new Progress<double>(percent =>
                {
                    Dispatcher.Invoke(() =>
                    {
                        ProgressBar.Value = percent * 100;
                        ProgressTextBlock.Text = $"{percent:P0}";
                    });
                });

                // Download and install
                InstalledFFmpegPath = await _downloadService.DownloadAndInstallAsync(
                    appDir, 
                    progress, 
                    _cancellationTokenSource.Token);

                if (InstalledFFmpegPath != null)
                {
                    StatusTextBlock.Text = "Installation complete!";
                    ProgressTextBlock.Text = "Complete";
                    ProgressBar.Value = 100;
                    
                    // Close dialog after a brief delay
                    await Task.Delay(500);
                    DialogResult = true;
                    Close();
                }
            }
            catch (OperationCanceledException)
            {
                StatusTextBlock.Text = "Download cancelled.";
                ProgressBar.Visibility = Visibility.Collapsed;
                ProgressTextBlock.Visibility = Visibility.Collapsed;
                DownloadButton.IsEnabled = true;
                CancelButton.Content = "Skip";
                WasCancelled = true;
            }
            catch (Exception ex)
            {
                StatusTextBlock.Text = $"Error: {ex.Message}";
                ProgressBar.Visibility = Visibility.Collapsed;
                ProgressTextBlock.Visibility = Visibility.Collapsed;
                DownloadButton.IsEnabled = true;
                CancelButton.Content = "Skip";
                
                MessageBox.Show(
                    $"Failed to download FFMPEG:\n\n{ex.Message}\n\nYou can install FFMPEG manually later.",
                    "Download Error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
            finally
            {
                _isDownloading = false;
            }
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            if (_isDownloading && _cancellationTokenSource != null)
            {
                _cancellationTokenSource.Cancel();
            }
            else
            {
                WasCancelled = true;
                DialogResult = false;
                Close();
            }
        }

        protected override void OnClosed(EventArgs e)
        {
            _cancellationTokenSource?.Cancel();
            _downloadService?.Dispose();
            base.OnClosed(e);
        }
    }
}

