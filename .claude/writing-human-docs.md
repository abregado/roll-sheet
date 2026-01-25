# Writing Human Documentation

Guidelines for writing documentation in `docs/` intended for users.

## Location

- User-facing docs go in `docs/` (served by GitHub Pages)
- Currently: `docs/index.md`, `docs/user-guide.md`, `docs/hosting-guide.md`

## Tone

- Friendly and approachable
- Assume the reader is not technical
- Avoid jargon; explain terms when necessary
- Use "you" to address the reader directly

## Structure

- Start with what the feature does, not how it works
- Lead with the most common use case
- Use headings to break up content
- Keep paragraphs short (2-4 sentences)

## Formatting

- Use screenshots or diagrams for UI features
- Use numbered lists for step-by-step instructions
- Use bullet points for feature lists
- Use code blocks only for things users type

## Examples

Good:
> To roll dice, click the Roll button next to any roll template.

Avoid:
> The roll template component dispatches a WebSocket message to the server which executes the dice formula and broadcasts the result.

## What to Document

- How to use features (user guide)
- How to set up/host the app (hosting guide)
- Troubleshooting common issues

## What Not to Document

- Implementation details
- Code architecture
- Internal data structures
