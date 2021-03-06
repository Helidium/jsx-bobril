/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
/*global exports:true*/
"use strict";

var Syntax = require('jstransform').Syntax;
var utils = require('jstransform/src/utils');

var FALLBACK_TAGS = require('./xjs').knownTags;
var renderXJSExpressionContainer =
	require('./xjs').renderXJSExpressionContainer;
var renderXJSLiteral = require('./xjs').renderXJSLiteral;
var quoteAttrName = require('./xjs').quoteAttrName;

var trimLeft = require('./xjs').trimLeft;

/**
 * Customized desugar processor for React JSX. Currently:
 *
 * <X> </X> => React.createElement(X, null)
 * <X prop="1" /> => React.createElement(X, {prop: '1'}, null)
 * <X prop="2"><Y /></X> => React.createElement(X, {prop:'2'},
 *   React.createElement(Y, null)
 * )
 * <div /> => React.createElement("div", null)
 */

/**
 * Removes all non-whitespace/parenthesis characters
 */
var reNonWhiteParen = /([^\s\(\)])/g;

function stripNonWhiteParen(value) {
	return value.replace(reNonWhiteParen, '');
}

var tagConvention = /^[a-z]|\-/;

function isTagName(name) {
	return tagConvention.test(name);
}

var mParts = {
	// We assume that the Mithril runtime is already in scope
	startTag: 'br(',
	endTag: ')',
	startAttrs: ', ',
	startChildren: ', ['
};

var precompileParts = {
	startTag: '{tag: ',
	endTag: '}',
	startAttrs: ', attrs: ',
	startChildren: ', children: ['
};

function visitReactTag(precompile, traverse, object, path, state) {
	var parts = precompile ? precompileParts : mParts;
	var openingElement = object.openingElement;
	var nameObject = openingElement.name;
	var attributesObject = openingElement.attributes;

	utils.catchup(openingElement.range[0], state, trimLeft);

	if (nameObject.type === Syntax.XJSNamespacedName && nameObject.namespace) {
		throw new Error('Namespace tags are not supported. JSX is not XML.');
	}

	// Identifiers with lower case or hyphens are fallback tags (strings).
	// XJSMemberExpressions are not.
	if (nameObject.type === Syntax.XJSIdentifier
	/* @msx Revisit when Mithril component support lands
	 && isTagName(nameObject.name)
	 */) {
		// This is a temporary error message to assist upgrades
		if (!FALLBACK_TAGS.hasOwnProperty(nameObject.name)) {
			/* @msx Revisit when Mithril component support lands
			 throw new Error(
			 'Lower case component names (' + nameObject.name + ') are no longer ' +
			 'supported in JSX: See http://fb.me/react-jsx-lower-case'
			 );
			 */
			parts = mParts
		}
	} else {
		// XXX Revisit when Mithril component support lands
		throw new Error(
			'Mithril does not currently support passing objects as tag selectors: ' +
			'See https://lhorie.github.io/mithril/mithril.html#usage'
		)
		/* @msx Revisit when Mithril component support lands
		 // Use utils.catchup in this case so we can easily handle
		 // XJSMemberExpressions which look like Foo.Bar.Baz. This also handles
		 // XJSIdentifiers that aren't fallback tags.
		 utils.move(nameObject.range[0], state);
		 utils.catchup(nameObject.range[1], state);
		 */
	}

	utils.append(parts.startTag, state);
	utils.append('"' + nameObject.name + '"', state);
	utils.move(nameObject.range[1], state);

	var movedAttrs = [];
	var lastAttr = null;
	if (attributesObject.length) lastAttr = attributesObject[attributesObject.length - 1];

	var builtAttributes = [];
	for (var a = 0; a < attributesObject.length; a++) {
		var attr = attributesObject[a];
		if (attr.name.name == 'style') {
			movedAttrs.push(attr);
		} else if (attr.name.name == 'class') {
			attr.name.name = 'className'
			movedAttrs.push(attr);
		} else if (attr.name.name == 'key') {
			movedAttrs.push(attr);
		} else if (attr.name.name == 'ref') {
			movedAttrs.push(attr);
		} else if (attr.name.name == 'data') {
			movedAttrs.push(attr);
		} else if (attr.name.name == 'cfg') {
			movedAttrs.push(attr);
		} else if (attr.name.name == 'component') {
			movedAttrs.push(attr)
		} else {
			builtAttributes.push(attr);
		}
	}

	attributesObject = builtAttributes;

	var hasAttributes = attributesObject.length;
	var hasMoved = movedAttrs.length;

	var hasAtLeastOneSpreadProperty = attributesObject.some(function (attr) {
		return attr.type === Syntax.XJSSpreadAttribute;
	});

	var hasAtLeastOneMovedSpreadProperty = movedAttrs.some(function (attr) {
		return attr.type === Syntax.XJSSpreadAttribute;
	});

	// Mithril expects an "attrs" property on pre-compiled templates
	if (hasAtLeastOneSpreadProperty || hasAttributes || parts === precompileParts) {
		utils.append(parts.startAttrs, state)
	}

	if (hasAtLeastOneSpreadProperty) {
		utils.append('Object.assign({', state);
	} else if (hasAttributes) {
		utils.append('{', state);
	} else if (parts === precompileParts) {
		utils.append('{}', state);
	}

	// keep track of if the previous attribute was a spread attribute
	var previousWasSpread = false;

	// write attributes
	attributesObject.forEach(function (attr, index) {
		if (attr.name.name == 'style') {
			//utils.catchup( attr.range[1] - 1, state, stripNonWhiteParen );
			return;
		}

		var isLast = index === attributesObject.length - 1;

		if (attr.type === Syntax.XJSSpreadAttribute) {
			// Close the previous object or initial object
			if (!previousWasSpread) {
				utils.append('}, ', state);
			}

			// Move to the expression start, ignoring everything except parenthesis
			// and whitespace.
			utils.catchup(attr.range[0], state, stripNonWhiteParen);
			// Plus 1 to skip `{`.
			utils.move(attr.range[0] + 1, state);
			//utils.catchup(attr.argument.range[0], state, stripNonWhiteParen);

			traverse(attr.argument, path, state);

			//utils.catchup(attr.argument.range[1], state);

			// Move to the end, ignoring parenthesis and the closing `}`
			//utils.catchup(attr.range[1] - 1, state, stripNonWhiteParen);

			if (!isLast) {
				utils.append(',', state);
			}

			utils.move(attr.range[1], state);

			previousWasSpread = true;

			return;
		}

		// If the next attribute is a spread, we're effective last in this object
		if (!isLast) {
			isLast = attributesObject[index + 1].type === Syntax.XJSSpreadAttribute;
		}

		if (attr.name.namespace) {
			throw new Error(
				'Namespace attributes are not supported. JSX is not XML.');
		}
		var name = attr.name.name;

		//utils.catchup(attr.range[0], state, trimLeft);

		if (previousWasSpread) {
			utils.append('{', state);
		}

		utils.append(quoteAttrName(name), state);
		utils.append(':', state);

		if (!attr.value) {
			state.g.buffer += 'true';
			state.g.position = attr.name.range[1];
			if (!isLast) {
				utils.append(',', state);
			}
		} else {
			utils.move(attr.name.range[1], state);
			// Use catchupNewlines to skip over the '=' in the attribute
			//utils.catchupNewlines(attr.value.range[0], state);
			if (attr.value.type === Syntax.Literal) {
				renderXJSLiteral(attr.value, isLast, state);
			} else {
				renderXJSExpressionContainer(traverse, attr.value, isLast, path, state);
			}
		}

		//utils.catchup(attr.range[1], state, trimLeft);

		previousWasSpread = false;

	});

	if (!openingElement.selfClosing) {
		//utils.catchup(openingElement.range[1] - 1, state, trimLeft);
		utils.move(openingElement.range[1], state);
	}

	if (hasAttributes && !previousWasSpread) {
		utils.append('}', state);
	}

	if (hasAtLeastOneSpreadProperty) {
		utils.append(')', state);
	}

	// write attributes
	if (movedAttrs.length)
		utils.append(', ', state);

	movedAttrs.forEach(function (attr, index) {
		var isLast = index === movedAttrs.length - 1;

		if (attr.type === Syntax.XJSSpreadAttribute) {
			// Close the previous object or initial object
			if (!previousWasSpread) {
				utils.append('}, ', state);
			}

			// Move to the expression start, ignoring everything except parenthesis
			// and whitespace.
			utils.catchup(attr.range[0], state, stripNonWhiteParen);
			// Plus 1 to skip `{`.
			utils.move(attr.range[0] + 1, state);
			//utils.catchup(attr.argument.range[0], state, stripNonWhiteParen);

			traverse(attr.argument, path, state);

			utils.catchup(attr.argument.range[1], state);

			// Move to the end, ignoring parenthesis and the closing `}`
			utils.catchup(attr.range[1] - 1, state, stripNonWhiteParen);

			if (!isLast) {
				utils.append(', ', state);
			}

			utils.move(attr.range[1], state);

			previousWasSpread = true;

			return;
		}

		var name = attr.name.name;

		utils.catchup(attr.range[0], state, trimLeft);

		if (previousWasSpread) {
			utils.append('{', state);
		}

		utils.append(quoteAttrName(name), state);
		utils.append(':', state);

		if (!attr.value) {
			state.g.buffer += 'true';
			state.g.position = attr.name.range[1];
			if (!isLast) {
				utils.append(',', state);
			}
		} else {
			utils.move(attr.name.range[1], state);
			// Use catchupNewlines to skip over the '=' in the attribute
			utils.catchupNewlines(attr.value.range[0], state);
			if (attr.value.type === Syntax.Literal) {
				renderXJSLiteral(attr.value, isLast, state);
			} else {
				renderXJSExpressionContainer(traverse, attr.value, isLast, path, state);
			}
		}

		//utils.catchup(attr.range[1], state, trimLeft);

		previousWasSpread = false;

	});

	if (!openingElement.selfClosing) {
		//utils.catchup(openingElement.range[1] - 1, state, trimLeft);
		utils.move(openingElement.range[1], state);
	}

	/*if( lastAttr )
	 utils.move(lastAttr.range[1] + 2, state);*/

	// filter out whitespace
	var childrenToRender = object.children.filter(function (child) {
		return !(child.type === Syntax.Literal
		&& typeof child.value === 'string'
		&& child.value.match(/^[ \t]*[\r\n][ \t\r\n]*$/));
	});

	var hasChildren = false;
	if (childrenToRender.length > 0) {
		var lastRenderableIndex;

		childrenToRender.forEach(function (child, index) {
			if (child.type !== Syntax.XJSExpressionContainer ||
				child.expression.type !== Syntax.XJSEmptyExpression) {
				lastRenderableIndex = index;
			}
		});

		if (lastRenderableIndex !== undefined) {
			utils.append(parts.startChildren, state);
			hasChildren = true;
		}

		childrenToRender.forEach(function (child, index) {
			utils.catchup(child.range[0], state, trimLeft);

			var isLast = index >= lastRenderableIndex;

			if (child.type === Syntax.Literal) {
				renderXJSLiteral(child, isLast, state);
			} else if (child.type === Syntax.XJSExpressionContainer) {
				renderXJSExpressionContainer(traverse, child, isLast, path, state);
			} else {
				traverse(child, path, state);
				if (!isLast) {
					utils.append(', ', state);
				}
			}

			utils.catchup(child.range[1], state, trimLeft);
		});
	}

	if (openingElement.selfClosing) {
		// everything up to />
		utils.catchup(openingElement.range[1] - 2, state, trimLeft);
		utils.move(openingElement.range[1], state);
	} else {
		// everything up to </ sdflksjfd>
		utils.catchup(object.closingElement.range[0], state, trimLeft);
		utils.move(object.closingElement.range[1], state);
	}

	if (hasChildren) {
		utils.append(']', state);
	}
	utils.append(parts.endTag, state);
	return false;
}

visitReactTag.test = function (object, path, state) {
	return object.type === Syntax.XJSElement;
};

exports.visitorList = [
	visitReactTag
];
