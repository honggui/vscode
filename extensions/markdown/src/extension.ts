/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import TelemetryReporter from 'vscode-extension-telemetry';

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

var telemetryReporter: TelemetryReporter | null;

export function activate(context: vscode.ExtensionContext) {

	let packageInfo = getPackageInfo(context);
	telemetryReporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);

	let provider = new MDDocumentContentProvider(context);
	let registration = vscode.workspace.registerTextDocumentContentProvider('markdown', provider);

	let d1 = vscode.commands.registerCommand('markdown.showPreview', showPreview);
	let d2 = vscode.commands.registerCommand('markdown.showPreviewToSide', uri => showPreview(uri, true));
	let d3 = vscode.commands.registerCommand('markdown.showSource', showSource);

	context.subscriptions.push(d1, d2, d3, registration);

	vscode.workspace.onDidSaveTextDocument(document => {
		if (isMarkdownFile(document)) {
			const uri = getMarkdownUri(document.uri);
			provider.update(uri);
		}
	});

	vscode.workspace.onDidChangeTextDocument(event => {
		if (isMarkdownFile(event.document)) {
			const uri = getMarkdownUri(event.document.uri);
			provider.update(uri);

		}
	});

	vscode.workspace.onDidChangeConfiguration(() => {
		vscode.workspace.textDocuments.forEach(document => {
			if (document.uri.scheme === 'markdown') {
				// update all generated md documents
				provider.update(document.uri);
			}
		});
	});
}

function isMarkdownFile(document: vscode.TextDocument) {
	return document.languageId === 'markdown'
		&& document.uri.scheme !== 'markdown'; // prevent processing of own documents
}

function getMarkdownUri(uri: vscode.Uri) {
	return uri.with({ scheme: 'markdown', path: uri.path + '.rendered', query: uri.toString() });
}

function showPreview(uri?: vscode.Uri, sideBySide: boolean = false) {

	let resource = uri;
	if (!(resource instanceof vscode.Uri)) {
		if (vscode.window.activeTextEditor) {
			// we are relaxed and don't check for markdown files
			resource = vscode.window.activeTextEditor.document.uri;
		}
	}

	if (!(resource instanceof vscode.Uri)) {
		if (!vscode.window.activeTextEditor) {
			// this is most likely toggling the preview
			return vscode.commands.executeCommand('markdown.showSource');
		}
		// nothing found that could be shown or toggled
		return;
	}

	let thenable = vscode.commands.executeCommand('vscode.previewHtml',
		getMarkdownUri(resource),
		getViewColumn(sideBySide),
		`Preview '${path.basename(resource.fsPath)}'`);

	if (telemetryReporter) {
		telemetryReporter.sendTelemetryEvent('openPreview', {
			where: sideBySide ? 'sideBySide' : 'inPlace',
			how: (uri instanceof vscode.Uri) ? 'action' : 'pallete'
		});
	}

	return thenable;
}

function getViewColumn(sideBySide: boolean): vscode.ViewColumn | undefined {
	const active = vscode.window.activeTextEditor;
	if (!active) {
		return vscode.ViewColumn.One;
	}

	if (!sideBySide) {
		return active.viewColumn;
	}

	switch (active.viewColumn) {
		case vscode.ViewColumn.One:
			return vscode.ViewColumn.Two;
		case vscode.ViewColumn.Two:
			return vscode.ViewColumn.Three;
	}

	return active.viewColumn;
}

function showSource(mdUri: vscode.Uri) {
	if (!mdUri) {
		return vscode.commands.executeCommand('workbench.action.navigateBack');
	}

	const docUri = vscode.Uri.parse(mdUri.query);

	for (let editor of vscode.window.visibleTextEditors) {
		if (editor.document.uri.toString() === docUri.toString()) {
			return vscode.window.showTextDocument(editor.document, editor.viewColumn);
		}
	}

	return vscode.workspace.openTextDocument(docUri).then(doc => {
		return vscode.window.showTextDocument(doc);
	});
}

function getPackageInfo(context: vscode.ExtensionContext): IPackageInfo | null {
	let extensionPackage = require(context.asAbsolutePath('./package.json'));
	if (extensionPackage) {
		return {
			name: extensionPackage.name,
			version: extensionPackage.version,
			aiKey: extensionPackage.aiKey
		};
	}
	return null;
}


interface IRenderer {
	render(text: string): string;
}

class MDDocumentContentProvider implements vscode.TextDocumentContentProvider {
	private _context: vscode.ExtensionContext;
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	private _waiting: boolean;
	private _renderer: IRenderer;

	constructor(context: vscode.ExtensionContext) {
		this._context = context;
		this._waiting = false;
		this._renderer = this.createRenderer();
	}

	private createRenderer(): IRenderer {
		const hljs = require('highlight.js');
		const mdnh = require('markdown-it-named-headers');
		const md = require('markdown-it')({
			html: true,
			highlight: (str: string, lang: string) => {
				if (lang && hljs.getLanguage(lang)) {
					try {
						return `<pre class="hljs"><code><div>${hljs.highlight(lang, str, true).value}</div></code></pre>`;
					} catch (error) { }
				}
				return `<pre class="hljs"><code><div>${md.utils.escapeHtml(str)}</div></code></pre>`;
			}
		}).use(mdnh, {});

		function addLineNumberRenderer(tokens: any, idx: number, options: any, env: any, self: any) {
			const token = tokens[idx];
			if (token.level === 0 && token.map && token.map.length) {
				token.attrSet('data-line', token.map[0]);
			}
			return self.renderToken(tokens, idx, options, env, self);
		}

		md.renderer.rules.paragraph_open = addLineNumberRenderer;
		md.renderer.rules.heading_open = addLineNumberRenderer;

		return md;
	}

	private getMediaPath(mediaFile: string): string {
		return this._context.asAbsolutePath(path.join('media', mediaFile));
	}

	private isAbsolute(p: string): boolean {
		return path.normalize(p + '/') === path.normalize(path.resolve(p) + '/');
	}

	private fixHref(resource: vscode.Uri, href: string): string {
		if (href) {
			// Use href if it is already an URL
			if (vscode.Uri.parse(href).scheme) {
				return href;
			}

			// Use href as file URI if it is absolute
			if (this.isAbsolute(href)) {
				return vscode.Uri.file(href).toString();
			}

			// use a workspace relative path if there is a workspace
			let rootPath = vscode.workspace.rootPath;
			if (rootPath) {
				return vscode.Uri.file(path.join(rootPath, href)).toString();
			}

			// otherwise look relative to the markdown file
			return vscode.Uri.file(path.join(path.dirname(resource.fsPath), href)).toString();
		}
		return href;
	}

	private computeCustomStyleSheetIncludes(uri: vscode.Uri): string {
		const styles = vscode.workspace.getConfiguration('markdown')['styles'];
		if (styles && Array.isArray(styles) && styles.length > 0) {
			return styles.map((style) => {
				return `<link rel="stylesheet" href="${this.fixHref(uri, style)}" type="text/css" media="screen">`;
			}).join('\n');
		}
		return '';
	}

	private getSettingsOverrideStyles(): string {
		const previewSettings = vscode.workspace.getConfiguration('markdown')['preview'];
		if (!previewSettings) {
			return '';
		}
		const {fontFamily, fontSize, lineHeight} = previewSettings;
		return [
			'<style>',
			'body {',
			fontFamily ? `font-family: ${fontFamily};` : '',
			+fontSize > 0 ? `font-size: ${fontSize}px;` : '',
			+lineHeight > 0 ? `line-height: ${lineHeight};` : '',
			'}',
			'</style>'].join('\n');
	}

	public provideTextDocumentContent(uri: vscode.Uri): Thenable<string> {
		return vscode.workspace.openTextDocument(vscode.Uri.parse(uri.query)).then(document => {
			const scrollBeyondLastLine = vscode.workspace.getConfiguration('editor')['scrollBeyondLastLine'];
			const head = ([] as Array<string>).concat(
				'<!DOCTYPE html>',
				'<html>',
				'<head>',
				'<meta http-equiv="Content-type" content="text/html;charset=UTF-8">',
				`<link rel="stylesheet" type="text/css" href="${this.getMediaPath('markdown.css')}" >`,
				`<link rel="stylesheet" type="text/css" href="${this.getMediaPath('tomorrow.css')}" >`,
				this.getSettingsOverrideStyles(),
				this.computeCustomStyleSheetIncludes(uri),
				`<base href="${document.uri.toString(true)}">`,
				'</head>',
				`<body class="${scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''}">`
			).join('\n');
			const body = this._renderer.render(this.getDocumentContentForPreview(document));

			const tail = [
				'</body>',
				'</html>'
			].join('\n');

			return head + body + tail;
		});
	}

	get onDidChange(): vscode.Event<vscode.Uri> {
		return this._onDidChange.event;
	}

	public update(uri: vscode.Uri) {
		if (!this._waiting) {
			this._waiting = true;
			setTimeout(() => {
				this._waiting = false;
				this._onDidChange.fire(uri);
			}, 300);
		}
	}

	private getDocumentContentForPreview(document: vscode.TextDocument): string {
		const content = document.getText();
		const previewFrontMatter = vscode.workspace.getConfiguration('markdown')['previewFrontMatter'];
		if (previewFrontMatter === 'hide') {
			return content.replace(/^-{3}[ \t]*(\r\n|\n)(.|\r\n|\n)*?(\r\n|\n)-{3}[ \t]*(\r\n|\n)/, '');
		}
		return content;
	}
}