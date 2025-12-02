using System;
using System.Windows.Input;

namespace SlideShowBob.Commands
{
    /// <summary>
    /// A command implementation that delegates execution and can-execute logic to methods.
    /// </summary>
    public class RelayCommand : ICommand
    {
        private readonly Action<object?> _execute;
        private readonly Predicate<object?>? _canExecute;

        /// <summary>
        /// Initializes a new instance of the RelayCommand class.
        /// </summary>
        /// <param name="execute">The execution logic.</param>
        /// <param name="canExecute">The execution status logic. If null, the command can always execute.</param>
        public RelayCommand(Action<object?> execute, Predicate<object?>? canExecute = null)
        {
            _execute = execute ?? throw new ArgumentNullException(nameof(execute));
            _canExecute = canExecute;
        }

        /// <summary>
        /// Initializes a new instance of the RelayCommand class with a parameterless execute action.
        /// </summary>
        /// <param name="execute">The execution logic.</param>
        /// <param name="canExecute">The execution status logic. If null, the command can always execute.</param>
        public RelayCommand(Action execute, Func<bool>? canExecute = null)
            : this(
                execute != null ? _ => execute() : throw new ArgumentNullException(nameof(execute)),
                canExecute != null ? _ => canExecute() : null)
        {
        }

        public event EventHandler? CanExecuteChanged
        {
            add { CommandManager.RequerySuggested += value; }
            remove { CommandManager.RequerySuggested -= value; }
        }

        public bool CanExecute(object? parameter)
        {
            return _canExecute == null || _canExecute(parameter);
        }

        public void Execute(object? parameter)
        {
            _execute(parameter);
        }
    }

    /// <summary>
    /// A generic command implementation that delegates execution and can-execute logic to methods.
    /// </summary>
    public class RelayCommand<T> : ICommand
    {
        private readonly Action<T?> _execute;
        private readonly Predicate<T?>? _canExecute;

        /// <summary>
        /// Initializes a new instance of the RelayCommand class.
        /// </summary>
        /// <param name="execute">The execution logic.</param>
        /// <param name="canExecute">The execution status logic. If null, the command can always execute.</param>
        public RelayCommand(Action<T?> execute, Predicate<T?>? canExecute = null)
        {
            _execute = execute ?? throw new ArgumentNullException(nameof(execute));
            _canExecute = canExecute;
        }

        public event EventHandler? CanExecuteChanged
        {
            add { CommandManager.RequerySuggested += value; }
            remove { CommandManager.RequerySuggested -= value; }
        }

        public bool CanExecute(object? parameter)
        {
            if (_canExecute == null)
                return true;

            if (parameter is T typedParam)
                return _canExecute(typedParam);

            return parameter == null && default(T) == null && _canExecute(default);
        }

        public void Execute(object? parameter)
        {
            if (parameter is T typedParam)
                _execute(typedParam);
            else
                _execute(default);
        }
    }
}

