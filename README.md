# n8n-nodes-telegram-better-markdown

This is an n8n community node that converts Markdown text to Telegram-compatible HTML format for use with the Telegram Bot API.

The node allows you to take regular Markdown text (including output from LLMs) and convert it to properly formatted HTML that displays beautifully in Telegram messages. It supports standard Markdown syntax plus Telegram-specific features like spoilers, user mentions, custom emojis, and expandable blockquotes.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

- [Installation](#installation)
- [Features](#features)
- [Usage](#usage)
- [Supported Markdown Features](#supported-markdown-features)
- [Telegram-Specific Features](#telegram-specific-features)
- [Examples](#examples)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

Alternatively, install directly via npm:

```bash
npm install n8n-nodes-telegram-better-markdown
```

## Features

- ✅ Converts standard Markdown to Telegram HTML format
- ✅ Supports all Telegram formatting tags (bold, italic, strikethrough, code, links, etc.)
- ✅ Handles Telegram-specific features:
  - Spoilers (`||text||`)
  - User mentions (`[name](tg://user?id=123456789)`)
  - Custom emojis (`![👍](tg://emoji?id=5368324170671202286)`)
  - Expandable blockquotes (automatic or manual)
- ✅ Properly escapes HTML special characters
- ✅ Handles nested lists with proper indentation
- ✅ Code blocks with language syntax highlighting
- ✅ Perfect for processing LLM output for Telegram bots

## Usage

1. Add the **Telegram Markdown** node to your n8n workflow
2. Connect it to a node that provides text data (e.g., OpenAI, HTTP Request, or any data source)
3. Configure the node:
   - **Markdown Text**: The markdown content to convert (can use expressions to reference data from previous nodes)
   - **Output Field**: The name of the field where the converted HTML will be stored (default: `telegramHtml`)
4. Connect the output to a Telegram node or any other node that needs the formatted HTML

### Example Workflow

```
LLM Node → Telegram Markdown → Telegram Bot (sendMessage)
```

In the Telegram node, set:
- **Text**: `{{ $json.telegramHtml }}`
- **Parse Mode**: `HTML`

## Supported Markdown Features

| Markdown | Output | Telegram Tag |
|----------|--------|--------------|
| `**bold**` or `__bold__` | **bold** | `<b>` |
| `*italic*` or `_italic_` | *italic* | `<i>` |
| `~~strikethrough~~` | ~~strikethrough~~ | `<s>` |
| `` `code` `` | `code` | `<code>` |
| ` ```code block``` ` | code block | `<pre><code>` |
| `[link](url)` | [link](url) | `<a href="">` |
| `# Heading` | **Heading** | `<b>` |
| `> quote` | quote | `<blockquote>` |
| `- list item` | • list item | Formatted list |
| `1. item` | 1. item | Formatted list |
| `---` | ------ | Horizontal rule |

## Telegram-Specific Features

### Spoilers

Use double pipes to create spoiler text:

```markdown
This is ||hidden text|| that can be revealed
```

### User Mentions

Link to Telegram users using their user ID:

```markdown
Hello [John](tg://user?id=123456789)!
```

### Custom Emojis

Reference custom emojis by their emoji ID:

```markdown
Great work! ![👍](tg://emoji?id=5368324170671202286)
```

### Expandable Blockquotes

Blockquotes automatically become expandable if they:
- Are longer than 320 characters, OR
- Have more than 4 lines

You can also explicitly mark a blockquote as expandable by ending it with `||`:

```markdown
> This is a long quote that will be expandable.
> It contains important information.
> Users can tap to expand it.||
```

### Nested Lists

The node properly handles nested lists with automatic indentation:

```markdown
- Parent item
  - Nested item
    - Deeper nested item
- Another parent
```

## Examples

### Basic Formatting

**Input:**
```markdown
# Welcome to My Bot

This is **bold** and this is *italic*.

Check out this [link](https://example.com).
```

**Output:**
```html
<b>Welcome to My Bot</b>
This is <b>bold</b> and this is <i>italic</i>.
Check out this <a href="https://example.com">link</a>.
```

### Code Blocks

**Input:**
````markdown
Here's some code:

```javascript
function hello() {
  console.log("Hello, world!");
}
```
````

**Output:**
```html
Here's some code:
<pre><code class="language-javascript">function hello() {
  console.log(&quot;Hello, world!&quot;);
}</code></pre>
```

### LLM Integration Example

When using with an LLM like ChatGPT:

1. **OpenAI Node** → outputs markdown response
2. **Telegram Markdown Node** → converts to HTML
3. **Telegram Node** → sends formatted message

This allows your bot to display beautifully formatted messages with all the markdown features that LLMs naturally generate.

## Compatibility

- **Minimum n8n version:** 0.200.0
- **Tested on:** n8n 1.0.0+
- **Telegram Bot API:** Compatible with all current versions

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Telegram Bot API - Formatting options](https://core.telegram.org/bots/api#formatting-options)
- [Telegram Bot API - HTML style](https://core.telegram.org/bots/api#html-style)

## Version History

### 0.1.0 (Initial Release)
- Full Markdown to Telegram HTML conversion
- Support for all Telegram formatting tags
- Spoiler syntax support
- User mentions and custom emojis
- Expandable blockquotes (automatic and manual)
- Nested list handling with proper indentation
- Code blocks with syntax highlighting support
