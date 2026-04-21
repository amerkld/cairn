/**
 * Metadata bar shown above the editor: title, tags, deadline (actions only).
 * The bar is the *only* place frontmatter known-fields are edited from the
 * UI. Unknown keys are preserved automatically because we send the existing
 * frontmatter back through to Rust with the typed fields patched.
 */
import { useState, type KeyboardEvent } from "react";
import { X, Plus, Calendar } from "lucide-react";
import { Input } from "@/ds/Input";
import { Badge } from "@/ds/Badge";
import { cn } from "@/lib/cn";
import type { Frontmatter } from "@/lib/invoke";

interface FrontmatterBarProps {
  frontmatter: Frontmatter;
  onChange: (next: Frontmatter) => void;
  showDeadline: boolean;
}

export function FrontmatterBar({
  frontmatter,
  onChange,
  showDeadline,
}: FrontmatterBarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-border-subtle bg-bg-surface/60 px-10 py-4">
      <TitleField
        value={frontmatter.title ?? ""}
        onChange={(title) => onChange({ ...frontmatter, title: title || null })}
      />
      <div className="flex flex-wrap items-center gap-3">
        <TagsField
          tags={frontmatter.tags ?? []}
          onChange={(tags) =>
            onChange({ ...frontmatter, tags: tags.length > 0 ? tags : [] })
          }
        />
        {showDeadline ? (
          <DeadlineField
            value={frontmatter.deadline ?? null}
            onChange={(deadline) =>
              onChange({ ...frontmatter, deadline: deadline || null })
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function TitleField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      aria-label="Note title"
      placeholder="Untitled"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full bg-transparent text-2xl font-semibold tracking-tight text-fg-primary",
        "outline-none placeholder:text-fg-muted",
      )}
    />
  );
}

function TagsField({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const cleaned = draft.trim().replace(/^#/, "");
    if (!cleaned) {
      setDraft("");
      return;
    }
    if (tags.includes(cleaned)) {
      setDraft("");
      return;
    }
    onChange([...tags, cleaned]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Badge key={tag} tone="accent" className="gap-1">
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="rounded-sm text-accent opacity-70 hover:opacity-100"
          >
            <X className="h-3 w-3" strokeWidth={2} />
          </button>
        </Badge>
      ))}
      <div className="flex items-center gap-1 text-fg-muted">
        <Plus className="h-3 w-3" strokeWidth={2} />
        <input
          aria-label="Add tag"
          placeholder="tag"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          className={cn(
            "w-24 bg-transparent text-xs text-fg-secondary",
            "outline-none placeholder:text-fg-muted",
          )}
        />
      </div>
    </div>
  );
}

function DeadlineField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-fg-secondary">
      <Calendar className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
      <span className="text-2xs uppercase tracking-wider text-fg-muted">Deadline</span>
      <Input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Deadline"
        className="h-7 w-40 text-xs"
      />
    </label>
  );
}
