import { useEffect, useState } from "react"
import { codeToHtml } from "shiki"

interface CodeBlockProps {
  code: string
  lang: "yaml" | "json" | "javascript" | "typescript" | "bash" | "dockerfile"
  maxHeight?: string
}

export function CodeBlock({ code, lang, maxHeight = "600px" }: CodeBlockProps) {
  const [html, setHtml] = useState("")

  useEffect(() => {
    let cancelled = false

    codeToHtml(code, {
      lang,
      theme: "vitesse-dark",
      colorReplacements: {
        "#121212": "transparent",
      },
    }).then((result) => {
      if (!cancelled) setHtml(result)
    })

    return () => {
      cancelled = true
    }
  }, [code, lang])

  if (!html) {
    return (
      <pre
        className="overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed text-foreground/70"
        style={{ maxHeight }}
      >
        <code>{code}</code>
      </pre>
    )
  }

  return (
    <div
      className="overflow-auto rounded-lg bg-muted [&_pre]:!bg-transparent [&_pre]:!p-4 [&_pre]:!m-0 [&_code]:!text-xs [&_code]:!leading-relaxed"
      style={{ maxHeight }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
