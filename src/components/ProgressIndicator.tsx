import React from 'react';
import './ProgressIndicator.css';

interface ProgressIndicatorProps {
  message: string;
  current?: number;
  total?: number;
  percentage?: number;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ 
  message, 
  current, 
  total, 
  percentage 
}) => {
  const calculatedPercentage = percentage !== undefined 
    ? percentage 
    : (current !== undefined && total !== undefined && total > 0)
      ? (current / total) * 100
      : undefined;

  return (
    <div className="progress-indicator">
      <div className="progress-message">{message}</div>
      {(current !== undefined && total !== undefined) && (
        <div className="progress-count">
          {current.toLocaleString()} / {total.toLocaleString()} files
        </div>
      )}
      {calculatedPercentage !== undefined && (
        <div className="progress-bar-container">
          <div 
            className="progress-bar" 
            style={{ width: `${Math.min(100, Math.max(0, calculatedPercentage))}%` }}
          ></div>
        </div>
      )}
      {calculatedPercentage === undefined && (
        <div className="progress-spinner"></div>
      )}
    </div>
  );
};

export default ProgressIndicator;

