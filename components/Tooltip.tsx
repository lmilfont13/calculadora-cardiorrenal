
import React, { useState } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-flex items-center group">
      <div 
        onMouseEnter={() => setShow(true)} 
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="cursor-help"
      >
        {children}
      </div>
      {show && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-64 p-3 bg-slate-900/95 backdrop-blur-md text-white text-[10px] leading-relaxed rounded-xl shadow-2xl z-[100] border border-white/10 animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
          <div className="font-medium">
            {content}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-900/95"></div>
        </div>
      )}
    </div>
  );
};

export default Tooltip;
