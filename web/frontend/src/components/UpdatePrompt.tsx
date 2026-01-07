import React from 'react';
import './UpdatePrompt.css';

interface UpdatePromptProps {
  onReload: () => void;
  onDismiss?: () => void;
}

const UpdatePrompt: React.FC<UpdatePromptProps> = ({ onReload, onDismiss }) => {
  return (
    <div className="update-prompt">
      <div className="update-prompt-content">
        <span className="update-prompt-icon">🔄</span>
        <span className="update-prompt-message">Update available. Reload to update.</span>
        <div className="update-prompt-actions">
          <button 
            className="update-prompt-button update-prompt-button-primary" 
            onClick={onReload}
          >
            Reload
          </button>
          {onDismiss && (
            <button 
              className="update-prompt-button update-prompt-button-secondary" 
              onClick={onDismiss}
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdatePrompt;

