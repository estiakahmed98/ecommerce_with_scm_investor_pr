import React from 'react';

interface GradientBorderProps {
  children: React.ReactNode;
  className?: string;
  borderRadius?: string;
  animated?: boolean;
}

function GradientBorder({ 
  children, 
  className = "", 
  borderRadius = "rounded-2xl",
  animated = true 
}: GradientBorderProps) {
  return (
    <div 
      className={`${borderRadius} ${className}`}
      style={{
        background: 'linear-gradient(#080b11, #080b11) padding-box, linear-gradient(45deg, #6366f1, #8b5cf6, #ec4899, #f59e0b, #6366f1) border-box',
        backgroundClip: 'padding-box, border-box',
        border: '2px solid transparent',
        backgroundSize: '100% 100%, 400% 400%',
        animation: animated ? 'gradient-rotate 4s linear infinite' : 'none'
      }}
    >
      {children}
      {animated && (
        <style dangerouslySetInnerHTML={{
          __html: `
            @keyframes gradient-rotate {
              0% { background-position: 0% 0%, 0% 0%; }
              50% { background-position: 0% 0%, 100% 0%; }
              100% { background-position: 0% 0%, 0% 100%; }
            }
          `
        }} />
      )}
    </div>
  );
}

export default GradientBorder;
