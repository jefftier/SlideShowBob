namespace SlideShowBob
{
    /// <summary>
    /// Wrapper around static SettingsManager to enable dependency injection.
    /// </summary>
    public class SettingsManagerWrapper
    {
        public AppSettings Load() => SettingsManager.Load();
        public void Save(AppSettings settings) => SettingsManager.Save(settings);
    }
}

