/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IEventEmitter } from 'vs/base/common/eventEmitter';
import { IModelDecoration, EndOfLinePreference, IPosition } from 'vs/editor/common/editorCommon';
import { ViewLineTokens } from 'vs/editor/common/core/viewLineToken';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';

export interface IDecorationsViewportData {
	decorations: ViewModelDecoration[];
	/**
	 * inline decorations grouped by each line in the viewport
	 */
	inlineDecorations: InlineDecoration[][];
}

export interface IViewModel extends IEventEmitter {

	getTabSize(): number;

	getLineCount(): number;
	mightContainRTL(): boolean;
	getLineContent(lineNumber: number): string;
	getLineIndentGuide(lineNumber: number): number;
	getLineMinColumn(lineNumber: number): number;
	getLineMaxColumn(lineNumber: number): number;
	getLineFirstNonWhitespaceColumn(lineNumber: number): number;
	getLineLastNonWhitespaceColumn(lineNumber: number): number;
	getLineTokens(lineNumber: number): ViewLineTokens;
	getDecorationsViewportData(startLineNumber: number, endLineNumber: number): IDecorationsViewportData;
	getLineRenderLineNumber(lineNumber: number): string;
	/**
	 * Get the maximum line number that will appear next to a line
	 */
	getMaxLineNumber(): number;
	getAllOverviewRulerDecorations(): ViewModelDecoration[];
	getEOL(): string;
	getValueInRange(range: Range, eol: EndOfLinePreference): string;

	getSelections(): Selection[];

	convertViewPositionToModelPosition(viewLineNumber: number, viewColumn: number): Position;
	convertViewRangeToModelRange(viewRange: Range): Range;

	getModelLineContent(lineNumber: number): string;
	getModelLineMaxColumn(modelLineNumber: number): number;
	validateModelPosition(position: IPosition): Position;
	convertModelPositionToViewPosition(modelLineNumber: number, modelColumn: number): Position;
	convertModelSelectionToViewSelection(modelSelection: Selection): Selection;
	modelPositionIsVisible(position: Position): boolean;
}

export class InlineDecoration {
	_inlineDecorationBrand: void;

	range: Range;
	inlineClassName: string;

	constructor(range: Range, inlineClassName: string) {
		this.range = range;
		this.inlineClassName = inlineClassName;
	}
}

export class ViewModelDecoration {
	_viewModelDecorationBrand: void;

	public range: Range;
	public readonly source: IModelDecoration;

	constructor(source: IModelDecoration) {
		this.range = null;
		this.source = source;
	}
}
