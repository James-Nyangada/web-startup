import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders staff-written Markdown. Raw HTML is not rendered (react-markdown's default), so
 * content can never inject markup or scripts; links open normally and images need alt text.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h2 className="m-0 font-serif text-2xl sm:text-3xl font-normal text-ink">{children}</h2>,
          h2: ({ children }) => <h2 className="m-0 mt-4 font-serif text-2xl sm:text-3xl font-normal text-ink">{children}</h2>,
          h3: ({ children }) => <h3 className="m-0 mt-2 text-xl font-bold text-ink">{children}</h3>,
          h4: ({ children }) => <h4 className="m-0 text-base font-bold text-ink">{children}</h4>,
          p: ({ children }) => <p className="m-0 text-pretty">{children}</p>,
          ul: ({ children }) => <ul className="m-0 list-disc pl-6 flex flex-col gap-1">{children}</ul>,
          ol: ({ children }) => <ol className="m-0 list-decimal pl-6 flex flex-col gap-1">{children}</ol>,
          a: ({ href, children }) => (
            <a href={href} className="text-primary underline underline-offset-2 hover:text-primary-hover">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="m-0 border-l-4 border-line pl-4 text-muted italic">{children}</blockquote>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-xs leading-relaxed text-ink shadow-card">
              {children}
            </pre>
          ),
          code: ({ children, className }) =>
            className ? (
              <code className={className}>{children}</code>
            ) : (
              <code className="rounded bg-subtle px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
            ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-line bg-subtle px-3 py-2 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-line px-3 py-2">{children}</td>,
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt }) => <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="max-w-full rounded-xl" loading="lazy" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
