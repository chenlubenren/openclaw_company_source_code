'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { useState, useMemo, useEffect } from 'react';

// Types
interface MessageRendererProps {
  content: string;
  className?: string;
}

// Extract image URLs from various formats
function extractImages(content: string): { url: string; alt?: string }[] {
  const images: { url: string; alt?: string }[] = [];
  
  // Match markdown images: ![alt](url)
  const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdRegex.exec(content)) !== null) {
    images.push({ url: match[2], alt: match[1] });
  }
  
  // Match HTML img tags: <img src="..." alt="...">
  const htmlRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlRegex.exec(content)) !== null) {
    const srcMatch = match[0].match(/src=["']([^"']+)["']/);
    const altMatch = match[0].match(/alt=["']([^"']*)["']/);
    if (srcMatch) {
      images.push({ url: srcMatch[1], alt: altMatch ? altMatch[1] : undefined });
    }
  }
  
  // Match direct URLs that look like images
  const urlRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg))/gi;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlRegex.exec(content)) !== null) {
    const matchedUrl = urlMatch[1];
    if (matchedUrl && !images.some(img => img.url === matchedUrl)) {
      images.push({ url: matchedUrl });
    }
  }
  
  return images;
}

// Check if content contains HTML tags
function containsHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

// Image Component with lazy loading
function ImageBlock({ src, alt }: { src: string; alt?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [showFull, setShowFull] = useState(false);
  
  // Validate URL
  const isValidUrl = useMemo(() => {
    try {
      new URL(src);
      return true;
    } catch {
      return false;
    }
  }, [src]);
  
  return (
    <figure className="my-4 max-w-full">
      <div 
        className="relative inline-block cursor-pointer"
        onClick={() => setShowFull(!showFull)}
      >
        {!loaded && !error && (
          <div className="bg-pixel-black/10 border-4 border-pixel-black animate-pulse flex items-center justify-center"
               style={{ minWidth: '200px', minHeight: '150px' }}>
            <span className="font-pixel text-pixel-black/50 text-sm">🖼️ 图片加载中...</span>
          </div>
        )}
        
        {error || !isValidUrl ? (
          <div className="bg-pixel-red/20 border-4 border-pixel-black p-4 inline-block">
            <div className="font-pixel text-pixel-red text-sm flex items-center gap-2">
              <span>❌</span>
              <span>图片加载失败</span>
            </div>
            {src && (
              <div className="font-mono text-xs text-pixel-black/50 mt-2 max-w-xs truncate">
                {src}
              </div>
            )}
          </div>
        ) : (
          <>
            <img
              src={src}
              alt={alt || '图片'}
              className={`max-w-full border-4 border-pixel-black transition-all duration-300 ${
                loaded ? 'opacity-100' : 'opacity-0 absolute'
              } ${showFull ? 'max-h-none' : 'max-h-96'}`}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
              style={{ boxShadow: '4px 4px 0px 0px #101010' }}
              loading="lazy"
            />
            {!loaded && (
              <div className="bg-pixel-black/10 border-4 border-pixel-black animate-pulse flex items-center justify-center"
                   style={{ minWidth: '200px', minHeight: '150px' }}>
                <span className="font-pixel text-pixel-black/50 text-sm">🖼️ 加载中...</span>
              </div>
            )}
          </>
        )}
        
        {/* Expand indicator */}
        {loaded && (
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-pixel-black/70 text-pixel-white font-pixel text-xs">
            {showFull ? '👆 点击缩小' : '🔍 点击放大'}
          </div>
        )}
      </div>
      
      {alt && (
        <figcaption className="mt-2 font-pixel text-xs text-pixel-black/60 text-center px-2 py-1 bg-pixel-black/5 border-2 border-pixel-black/20">
          📷 {alt}
        </figcaption>
      )}
    </figure>
  );
}

// Code Block with copy button
function CodeBlock({ code, language, filename }: { code: string; language: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };
  
  return (
    <div className="my-4 rounded-none overflow-hidden border-4 border-pixel-black">
      {/* Header */}
      <div className="bg-pixel-black px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {filename ? (
            <span className="font-pixel text-xs text-pixel-white/80 flex items-center gap-2">
              <span>📄</span>
              <span>{filename}</span>
            </span>
          ) : null}
          <span className="font-pixel text-xs text-pixel-white/60 uppercase px-2 py-0.5 bg-pixel-white/10">
            {language || 'code'}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="px-3 py-1 bg-pixel-white/20 border-2 border-pixel-white/30 font-pixel text-xs text-pixel-white hover:bg-pixel-white/30 transition-colors"
        >
          {copied ? '✅ 已复制' : '📋 复制'}
        </button>
      </div>
      {/* Code */}
      <pre className="bg-[#1e1e1e] text-pixel-white p-4 overflow-x-auto font-mono text-sm leading-relaxed">
        <code className={language ? `language-${language}` : ''}>{code}</code>
      </pre>
    </div>
  );
}

// File Preview Component
function FilePreviewBlock({ filename, content }: { filename: string; content?: string }) {
  const [expanded, setExpanded] = useState(false);
  const language = filename.split('.').pop() || '';
  const fileIcon = getFileIcon(filename);
  
  return (
    <div className="my-4 border-4 border-pixel-black bg-pixel-white">
      <div 
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-pixel-black/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{fileIcon}</span>
          <div>
            <div className="font-pixel text-sm text-pixel-black">{filename}</div>
            <div className="font-pixel text-xs text-pixel-black/50">{language.toUpperCase()}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-pixel text-xs text-pixel-black/50">
            {content ? `${content.split('\n').length} 行` : '无内容'}
          </span>
          <span className="font-pixel text-pixel-black/50">
            {expanded ? '▲ 收起' : '▼ 展开'}
          </span>
        </div>
      </div>
      
      {expanded && content && (
        <div className="border-t-4 border-pixel-black">
          <pre className="p-4 bg-[#1e1e1e] text-pixel-white font-mono text-xs overflow-x-auto max-h-80">
            <code>{content}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const icons: Record<string, string> = {
    ts: '📘', tsx: '⚛️', js: '📒', jsx: '⚛️', py: '🐍',
    json: '📋', md: '📝', css: '🎨', html: '🌐', scss: '🎨',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
    pdf: '📄', txt: '📄', yaml: '⚙️', yml: '⚙️',
  };
  return icons[ext || ''] || '📄';
}

// Main MessageRenderer Component
export function MessageRenderer({ content, className = '' }: MessageRendererProps) {
  // Extract standalone images that are at the start or alone on a line
  const hasStandaloneImage = /^!?\[.+\]\(.+\)$/m.test(content.trim());
  const hasOnlyImage = /^(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg))$/i.test(content.trim());
  
  // Render standalone image
  if (hasOnlyImage) {
    return <ImageBlock src={content.trim()} />;
  }
  
  return (
    <div className={`${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{
          // Code blocks
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !className;
            
            if (isInline) {
              return (
                <code 
                  className="px-1.5 py-0.5 bg-pixel-black/10 border border-pixel-black/30 font-mono text-sm text-pixel-red"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            
            return (
              <CodeBlock 
                code={String(children).replace(/\n$/, '')} 
                language={match ? match[1] : ''}
              />
            );
          },
          
          // Links - open in new tab
          a: ({ href, children, ...props }) => (
            <a 
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-pixel-blue underline hover:text-pixel-blue/70 transition-colors"
              {...props}
            >
              {children}
            </a>
          ),
          
          // Images - use custom renderer
          img: ({ src, alt, ...props }) => (
            <ImageBlock src={src || ''} alt={alt} />
          ),
          
          // Headings
          h1: ({ children }) => (
            <h1 className="font-pixel text-xl text-pixel-black mt-4 mb-2 border-b-4 border-pixel-black pb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-pixel text-lg text-pixel-black mt-3 mb-2 flex items-center gap-2">
              <span className="w-2 h-6 bg-pixel-yellow" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-pixel text-base text-pixel-black mt-2 mb-1">
              {children}
            </h3>
          ),
          
          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="font-pixel text-sm text-pixel-black flex items-start gap-2">
              <span className="text-pixel-yellow">▸</span>
              <span>{children}</span>
            </li>
          ),
          
          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-pixel-yellow bg-pixel-yellow/10 px-4 py-3 my-3">
              <div className="text-pixel-black/70">{children}</div>
            </blockquote>
          ),
          
          // Horizontal rule
          hr: () => (
            <hr className="border-t-4 border-pixel-black my-4" />
          ),
          
          // Paragraphs
          p: ({ children }) => (
            <p className="font-pixel text-sm text-pixel-black leading-relaxed my-2">
              {children}
            </p>
          ),
          
          // Tables
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-4 border-pixel-black">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-pixel-black text-pixel-white">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 font-pixel text-sm text-left border-b-4 border-pixel-black">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 font-pixel text-sm border-b-2 border-pixel-black/20">
              {children}
            </td>
          ),
          
          // Strong and emphasis
          strong: ({ children }) => (
            <strong className="font-bold text-pixel-black">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-pixel-black/80">{children}</em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Export individual components for advanced usage
export { ImageBlock, CodeBlock, FilePreviewBlock };
