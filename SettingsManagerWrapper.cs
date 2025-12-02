namespace SlideShowBob
{
    /// <summary>
    /// Wrapper around static SettingsManager to enable dependency injection.
    /// Implements IAppSettingsService for testability and flexibility.
    /// </summary>
    public class SettingsManagerWrapper : IAppSettingsService
    {
        public AppSettings Load() => SettingsManager.Load();
        public void Save(AppSettings settings) => SettingsManager.Save(settings);
    }
}


