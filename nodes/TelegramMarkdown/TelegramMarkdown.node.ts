import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

interface Node {
	type: string;
	value?: string;
	children?: Node[];
	url?: string;
	alt?: string | null | undefined;
	lang?: string;
	ordered?: boolean;
	start?: number;
}

// --- Helper function for escaping HTML special characters ---
function escapeHtml(text: string): string {
	if (typeof text !== 'string') return '';
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Helper function to get the raw text content of a node ---
function getNodeText(node: Node): string {
	let text = '';
	if (node.value) {
		text += node.value;
	}
	if (node.children) {
		for (const child of node.children) {
			text += getNodeText(child);
		}
	}
	return text;
}

// --- Helper function to process spoiler syntax in text ---
function processSpoilers(text: string): string {
	// Replace ||spoiler|| with <tg-spoiler>spoiler</tg-spoiler>
	// But avoid replacing || in URLs
	return text.replace(/\|\|([^|]+?)\|\|/g, (match, content) => {
		// Don't process if it looks like it's part of a URL
		if (content.includes('http') || content.includes('tg:')) {
			return match;
		}
		return `<tg-spoiler>${escapeHtml(content)}</tg-spoiler>`;
	});
}

// --- Main function to convert AST nodes to Telegram HTML ---
function nodeToHtml(node: Node, context: { listDepth?: number; parent?: Node } = {}): string {
	switch (node.type) {
		case 'root':
			return node.children ? node.children.map((child) => nodeToHtml(child, context)).join('').trim() : '';

		case 'paragraph':
			return node.children ? node.children.map((child) => nodeToHtml(child, context)).join('') + '\n\n' : '\n\n';

		case 'heading': {
			const headingContent = node.children ? node.children.map((child) => nodeToHtml(child, context)).join('') : '';
			return `<b>${headingContent}</b>\n\n`;
		}

		case 'text': {
			const escapedText = escapeHtml(node.value || '');
			return processSpoilers(escapedText);
		}

		case 'emphasis':
			return `<i>${node.children ? node.children.map((child) => nodeToHtml(child, context)).join('') : ''}</i>`;

		case 'strong':
			return `<b>${node.children ? node.children.map((child) => nodeToHtml(child, context)).join('') : ''}</b>`;

		case 'delete':
			return `<s>${node.children ? node.children.map((child) => nodeToHtml(child, context)).join('') : ''}</s>`;

		case 'inlineCode':
			return `<code>${escapeHtml(node.value || '')}</code>`;

		case 'code': {
			const lang = node.lang ? ` class="language-${node.lang}"` : '';
			const code = escapeHtml(node.value || '');
			return `<pre><code${lang}>${code}</code></pre>\n`;
		}

		case 'link': {
			const url = escapeHtml(node.url || '');
			const linkText = node.children ? node.children.map((child) => nodeToHtml(child, context)).join('') : '';
			return `<a href="${url}">${linkText}</a>`;
		}

		case 'image': {
			// Handle Telegram custom emoji
			if (node.url && node.url.startsWith('tg://emoji')) {
				try {
					const urlObj = new URL(node.url);
					const emojiId = urlObj.searchParams.get('id');
					if (emojiId) {
						return `<tg-emoji emoji-id="${emojiId}">${escapeHtml(node.alt || '')}</tg-emoji>`;
					}
				} catch {
					// Fallback for invalid tg:// URL
				}
			}
			// Handle regular images as bold links with alt text
			const imageUrl = escapeHtml(node.url || '');
			const alt = escapeHtml(node.alt || 'image');
			return `<b><a href="${imageUrl}">${alt}</a></b>`;
		}

		case 'blockquote': {
			let isExpandable = false;
			const rawText = getNodeText(node);

			// Check if should be expandable
			const lineCount = (rawText.match(/\n/g) || []).length + 1;
			if (lineCount > 4 || rawText.length > 320) {
				isExpandable = true;
			}

			// Check for explicit || marker at the end
			if (rawText.trim().endsWith('||')) {
				isExpandable = true;
				// Remove the || marker from the last text node
				const removeMarker = (n: Node): boolean => {
					if (n.type === 'text' && n.value && n.value.endsWith('||')) {
						n.value = n.value.slice(0, -2);
						return true;
					}
					if (n.children) {
						for (let i = n.children.length - 1; i >= 0; i--) {
							if (removeMarker(n.children[i])) return true;
						}
					}
					return false;
				};
				removeMarker(node);
			}

			const content = node.children ? node.children.map((child) => nodeToHtml(child, context)).join('') : '';
			const tag = isExpandable ? 'blockquote expandable' : 'blockquote';
			return `<${tag}>${content}</${tag}>\n`;
		}

		case 'list': {
			const currentDepth = context.listDepth || 0;
			const newContext = { ...context, listDepth: currentDepth + 1, parent: node };
			const listItems = node.children ? node.children
				.map((child) => nodeToHtml(child, newContext))
				.join('') : '';
			// Only add double newline after top-level lists for spacing
			return currentDepth === 0 ? listItems.trimEnd() + '\n\n' : listItems;
		}

		case 'listItem': {
			const depth = context.listDepth || 1;
			const indentation = '&#160;&#160;&#160;&#160;'.repeat(depth - 1);

			let marker;
			if (context.parent?.ordered && context.parent.children) {
				const itemIndex = context.parent.children.indexOf(node);
				marker = `${(context.parent.start || 1) + itemIndex}. `;
			} else {
				marker = '• ';
			}

			// Process children
			let itemContent = '';
			if(node.children) {
			for (let i = 0; i < node.children.length; i++) {
				const child = node.children[i];
				if (child.type === 'paragraph') {
					// Just get the text content of paragraphs
					itemContent += child.children ? child.children.map((c) => nodeToHtml(c, context)).join('') : '';
				} else if (child.type === 'list') {
					// Nested list - process it with current depth so it increments properly
					// Pass current depth in context, the list handler will increment it
					const nestedContext = { listDepth: depth, parent: child };
					const nestedListContent = nodeToHtml(child, nestedContext);
					// Remove trailing newline from nested list to avoid double newlines
					itemContent += '\n' + nestedListContent.trimEnd();
				} else {
					itemContent += nodeToHtml(child, context);
				}
			}
			}

			return `${indentation}${marker}${itemContent}\n`;
		}

		case 'thematicBreak':
			return '------\n\n';

		case 'table':
			return `<i>[Table content is not supported and has been omitted]</i>\n`;

		case 'break':
			return '\n';

		default:
			// For unknown node types, try to process children if they exist
			if (node.children) {
				return node.children.map((child) => nodeToHtml(child, context)).join('');
			}
			return '';
	}
}

/**
 * Converts a Markdown string to Telegram's supported HTML format.
 *
 * @param {string} markdown - The Markdown input string.
 * @returns {string} The formatted HTML string for the Telegram API.
 */
export function markdownToTelegramHtml(markdown: string): string {
	if (!markdown || typeof markdown !== 'string') {
		return '';
	}

	// Parse markdown to AST
	const processor = unified().use(remarkParse);
	const tree = processor.parse(markdown) as unknown as Node;

	// Convert AST to Telegram HTML
	return nodeToHtml(tree);
}

// --- Helpers for truncating/splitting HTML without breaking sections ---
/**
 * Tokenize HTML into tags and text pieces.
 */
function tokenizeHtml(html: string): string[] {
	const tokens: string[] = [];
	const regex = /(<[^>]+>|[^<]+)/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(html)) !== null) {
		tokens.push(match[0]);
	}
	return tokens;
}

/**
 * Determine if a token is a block-level tag boundary where it's safe to split after.
 */
function isSafeBoundary(token: string): boolean {
	if (!token) return false;
	// closing tags for common block-level elements or self-contained tags
	const safeClosing = ["</pre>", "</blockquote>", "</table>", "</ul>", "</ol>", "</div>", "</p>", "</b>", "</i>", "</code>"];
	const lower = token.toLowerCase();
	for (const s of safeClosing) {
		if (lower.endsWith(s)) return true;
	}
	// Also if token is a standalone tag like <hr> or thematic '------' not captured as tag
	if (/^<hr\b|^<br\b|^<thematicbreak\b/.test(lower)) return true;
	// Also safe if token is entirely whitespace/newline
	if (/^\s+$/.test(token)) return true;
	return false;
}

/**
 * Safely truncate HTML to maxLength and append [...] if truncated.
 */
function safeTruncateHtml(html: string, maxLength: number): string {
	if (html.length <= maxLength) return html;
	const tokens = tokenizeHtml(html);
	let acc = '';
	let lastSafeIndex = -1;
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (acc.length + t.length > maxLength) break;
		acc += t;
		if (isSafeBoundary(t)) lastSafeIndex = acc.length;
	}
	// If we didn't find a safe spot, fallback to hard cut
	let result = acc;
	if (lastSafeIndex > 0 && lastSafeIndex < result.length) {
		result = result.slice(0, lastSafeIndex);
	}
	// Ensure we don't cut in the middle of a tag: if result ends with '<' or inside tag, remove trailing fragment
	const lastLt = result.lastIndexOf('<');
	const lastGt = result.lastIndexOf('>');
	if (lastLt > lastGt) {
		result = result.slice(0, lastLt);
	}
	// Trim and append ellipsis marker
	result = result.trimEnd();
	if (!result.endsWith('[...]')) result += ' [...]';
	return result;
}

/**
 * Split HTML into multiple chunks of at most maxLength, trying to split on safe boundaries.
 */
function splitHtmlIntoChunks(html: string, maxLength: number): string[] {
	const tokens = tokenizeHtml(html);
	const parts: string[] = [];
	let acc = '';
	let lastSafePos = -1; // position in acc string
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		// If adding token exceeds limit
		if (acc.length + t.length > maxLength) {
			// If we have a safe split point, cut there
			if (lastSafePos > 0) {
				parts.push(acc.slice(0, lastSafePos).trim());
				// start new accumulator with remainder after lastSafePos
				acc = acc.slice(lastSafePos) + t;
				lastSafePos = -1;
			} else {
				// No safe point found: hard cut at maxLength
				parts.push(acc.slice(0, maxLength).trim());
				acc = acc.slice(maxLength) + t;
			}
		} else {
			acc += t;
		}

		if (isSafeBoundary(t)) {
			lastSafePos = acc.length;
		}
	}
	if (acc.trim().length > 0) parts.push(acc.trim());
	return parts;
}

export class TelegramMarkdown implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Telegram Markdown',
		name: 'telegramMarkdown',
		icon: { light: 'file:telegram-markdown.png', dark: 'file:telegram-markdown.png' },
		group: ['transform'],
		version: 1,
		description: 'Convert Markdown to Telegram-compatible HTML',
		defaults: {
			name: 'Telegram Markdown',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Markdown Text',
				name: 'markdownText',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				default: '',
				placeholder: '# Hello World\n\nThis is **bold** and this is *italic*.',
				description:
					'The markdown text to convert to Telegram HTML. Supports standard markdown plus Telegram features like spoilers (||text||) and user mentions.',
			},
			{
				displayName: 'Output Field',
				name: 'outputField',
				type: 'string',
				default: 'telegramHtml',
				description: 'The name of the field where the converted HTML will be stored',
			},
			{
				displayName: 'Message Limit Strategy',
				name: 'messageLimitStrategy',
				type: 'options',
				options: [
					{
						description: 'Truncate the message to 4096 characters and append [...].',
						name: 'Truncate message',
						value: 'truncate',
					},
					{
						description: 'Split the message into multiple messages of <=4096 characters without cutting HTML sections.',
						name: 'Split message',
						value: 'split',
					},
				],
				default: 'truncate',
				description: 'What to do when the generated HTML exceeds Telegram\'s 4096 character limit.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const markdownText = this.getNodeParameter('markdownText', itemIndex, '') as string;
				const outputField = this.getNodeParameter('outputField', itemIndex, 'telegramHtml') as string;
				const messageLimitStrategy = this.getNodeParameter('messageLimitStrategy', itemIndex, 'truncate') as string;

				const telegramHtml = markdownToTelegramHtml(markdownText);

				// If message is under Telegram limit, just return as single item
				if (telegramHtml.length <= 4096) {
					const newItem: INodeExecutionData = {
						json: {
							...items[itemIndex].json,
							[outputField]: telegramHtml,
						},
						pairedItem: itemIndex,
					};
					returnData.push(newItem);
					continue;
				}

				if (messageLimitStrategy === 'truncate') {
					const truncated = safeTruncateHtml(telegramHtml, 4096);
					const newItem: INodeExecutionData = {
						json: {
							...items[itemIndex].json,
							[outputField]: truncated,
						},
						pairedItem: itemIndex,
					};
					returnData.push(newItem);
					continue;
				}

				if (messageLimitStrategy === 'split') {
					const parts = splitHtmlIntoChunks(telegramHtml, 4096);
					// For split, create multiple output items, each with the same original data
					for (const part of parts) {
						const newItem: INodeExecutionData = {
							json: {
								...items[itemIndex].json,
								[outputField]: part,
							},
							pairedItem: itemIndex,
						};
						returnData.push(newItem);
					}
					continue;
				}

				const newItem: INodeExecutionData = {
					json: {
						...items[itemIndex].json,
						[outputField]: telegramHtml,
					},
					pairedItem: itemIndex,
				};

				returnData.push(newItem);
			} catch (error) {
				if (this.continueOnFail()) {
					const nodeError = new NodeOperationError(this.getNode(), error as Error, {
						itemIndex,
					});
					returnData.push({
						json: items[itemIndex].json,
						error: nodeError,
						pairedItem: itemIndex,
					});
				} else {
					if (error instanceof NodeOperationError && error.context) {
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error as Error, {
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}
}
