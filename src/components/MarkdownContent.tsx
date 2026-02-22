import ReactMarkdown from "react-markdown";

interface MarkdownContentProps {
  content: string | null;
}

const MarkdownContent = ({ content }: MarkdownContentProps) => {
  if (!content) return null;

  return (
    <div className="text-foreground/80">
      <ReactMarkdown
        components={{
          a: ({ children, href, ...props }) => (
            <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc pl-6 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 mb-2">{children}</ol>,
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;
