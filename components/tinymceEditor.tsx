// components/tinymceEditor.tsx

import React from "react";
import { Editor } from "@tinymce/tinymce-react";

interface TinymceEditorProps {
  value: string;
  onChange: (content: string) => void;
  height?: number;
}

const TinymceEditor: React.FC<TinymceEditorProps> = ({
  value,
  onChange,
  height = 400,
}) => {
  return (
    <Editor
      apiKey="didaagwh80y1vdeim49h9hsorsljm8n5mmr713t1r6n5m4zr"
      init={{
        height: height,
        menubar: true,
        plugins: [
          "advlist",
          "autolink",
          "lists",
          "link",
          "image",
          "charmap",
          "preview",
          "anchor",
          "searchreplace",
          "visualblocks",
          "code",
          "fullscreen",
          "insertdatetime",
          "media",
          "table",
          "code",
          "help",
          "wordcount",
        ],
        toolbar:
          "undo redo | blocks | " +
          "bold italic forecolor | alignleft aligncenter " +
          "alignright alignjustify | bullist numlist outdent indent | " +
          "removeformat | help",
        content_style: `
          body { 
            font-family: Helvetica, Arial, sans-serif; 
            font-size: 14px;
            background-color: hsl(var(--background));
            color: hsl(var(--foreground));
          }
          h1, h2, h3, h4, h5, h6 {
            color: hsl(var(--primary));
          }
          a {
            color: hsl(var(--primary));
          }
          code {
            background-color: hsl(var(--muted));
            color: hsl(var(--muted-foreground));
            padding: 0.2rem 0.4rem;
            border-radius: 0.25rem;
          }
          blockquote {
            border-left: 4px solid hsl(var(--border));
            padding-left: 1rem;
            color: hsl(var(--muted-foreground));
          }
          table {
            border: 1px solid hsl(var(--border));
          }
          th, td {
            border: 1px solid hsl(var(--border));
            padding: 0.5rem;
          }
          th {
            background-color: hsl(var(--muted));
          }
        `,
      }}
      value={value}
      onEditorChange={onChange}
    />
  );
};

export default TinymceEditor;