'use client';

import { ReactNode, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PixelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function PixelDialog({ isOpen, onClose, title, children }: PixelDialogProps) {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setShowContent(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowContent(false);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-pixel-black/70 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="my-auto w-full max-w-lg border-4 border-pixel-black bg-pixel-white"
            style={{ boxShadow: '8px 8px 0px 0px #101010' }}
          >
            {title && (
              <div className="bg-pixel-green text-pixel-white font-pixel text-xl p-3 border-b-4 border-pixel-black flex justify-between items-center">
                <span>{title}</span>
                <button
                  onClick={onClose}
                  className="w-8 h-8 bg-pixel-red text-pixel-white border-2 border-pixel-black flex items-center justify-center hover:bg-pixel-orange"
                  style={{ boxShadow: '2px 2px 0px 0px #101010' }}
                >
                  X
                </button>
              </div>
            )}
            <div className="p-4 font-pixel text-pixel-black">
              {showContent && children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
