namespace SlideShowBob
{
    /// <summary>
    /// Service interface for loading and saving application settings.
    /// </summary>
    public interface IAppSettingsService
    {
        /// <summary>
        /// Loads application settings from persistent storage.
        /// Returns a new AppSettings instance with defaults if loading fails.
        /// </summary>
        AppSettings Load();

        /// <summary>
        /// Saves application settings to persistent storage.
        /// </summary>
        void Save(AppSettings settings);
    }
}





