/* jslint node: true */
/* jslint browser: true */
/* global BlobBuilder */
'use strict';

var PdfPrinter = require('../printer');
var FileSaver = require('../../libs/FileSaver.js/FileSaver');
var Bluebird = require('bluebird');
var saveAs = FileSaver.saveAs;

var defaultClientFonts = {
	Roboto: {
		normal: 'Roboto-Regular.ttf',
		bold: 'Roboto-Medium.ttf',
		italics: 'Roboto-Italic.ttf',
		bolditalics: 'Roboto-Italic.ttf'
	}
};

function Document(docDefinition, fonts, vfs) {
	this.docDefinition = docDefinition;
	this.fonts = fonts || defaultClientFonts;
	this.vfs = vfs;
}

function canCreatePdf() {
	// Ensure the browser provides the level of support needed
	if ( ! Object.keys ) {
		return false;
	}
	return true;
}

function isArray(obj){
	return !!obj && Array === obj.constructor;
}

function fork (async_calls, shared_callback) {
	var counter = async_calls.length;
	var all_results = [];
	function makeCallback (index) {
		return function () {
			counter --;
			var results = [];
			// we use the arguments object here because some callbacks 
			// in Node pass in multiple arguments as result.
			for (var i=0;i<arguments.length;i++) {
				results[i] = arguments[i];
			}
			all_results[index] = results;
			if (counter == 0) {
				shared_callback(all_results);
			}
		}
	}

	for (var i=0;i<async_calls.length;i++) {
		async_calls[i](makeCallback(i));
	}
}

Document.prototype._createDoc = function(options, callback) {
	var printer = new PdfPrinter(this.fonts);
	printer.fs.bindFS(this.vfs);

	var docs = [];
	var makePages = [];
	var chunks = [];
	var result;
	var docDefinition = this.docDefinition;
	if (!isArray(docDefinition)) docDefinition = [docDefinition];

	var asyncFunctions = [];
	var i = 0;

	function appendDoc(i) {
		return new Bluebird(function (resolve, reject) {
			docs[i] = printer.createPdfKitDocument(docDefinition[i], options);

			docs[i].on('data', function(chunk) {
				chunks.push(chunk);
			});
			docs[i].on('end', function() {
				makePages[i] = docs[i]._pdfMakePages;
			});
			return resolve(docs[i].end());
		});
	}

	for (i; i < docDefinition.length; i++) {
		asyncFunctions.push(appendDoc(i));
	}
	Bluebird.all(asyncFunctions)
	.then(function () {
		result = Buffer.concat(chunks);
		console.info(makePages[0]);
		callback(result, makePages[0]);
		// callback(result);
	});
};

Document.prototype._getPages = function(options, cb){
	if (!cb) throw 'getBuffer is an async method and needs a callback argument';
	this._createDoc(options, function(ignoreBuffer, pages){
		cb(pages);
	});
};

Document.prototype.open = function(message) {
	// we have to open the window immediately and store the reference
	// otherwise popup blockers will stop us
	var win = window.open('', '_blank');

	try {
		this.getBuffer(function (result) {
			var blob;
			try {
				blob = new Blob([result], { type: 'application/pdf' });
			} catch (e) {
				// Old browser which can't handle it without making it an byte array (ie10)
				if (e.name == "InvalidStateError") {
					var byteArray = new Uint8Array(result);
					blob = new Blob([byteArray.buffer], { type: 'application/pdf' });
				}
			}

			if (blob) {
				var urlCreator = window.URL || window.webkitURL;
				var pdfUrl = urlCreator.createObjectURL( blob );
				win.location.href = pdfUrl;
			} else {
				throw 'Could not generate blob';
			}
		},  { autoPrint: false });
	} catch(e) {
		win.close();
		throw e;
	}
};


Document.prototype.print = function() {
		// we have to open the window immediately and store the reference
	// otherwise popup blockers will stop us
	var win = window.open('', '_blank');

	try {
		this.getBuffer(function (result) {
			var blob;
			try {
				blob = new Blob([result], { type: 'application/pdf' });
			} catch (e) {
				// Old browser which can't handle it without making it an byte array (ie10)
				if (e.name == "InvalidStateError") {
					var byteArray = new Uint8Array(result);
					blob = new Blob([byteArray.buffer], { type: 'application/pdf' });
				}
			}

			if (blob) {
				var urlCreator = window.URL || window.webkitURL;
				var pdfUrl = urlCreator.createObjectURL( blob );
				win.location.href = pdfUrl;
			} else {
				throw 'Could not generate blob';
			}
		},  { autoPrint: true });
	} catch(e) {
		win.close();
		throw e;
	}
};

Document.prototype.download = function(defaultFileName, cb) {
	if(typeof defaultFileName === "function") {
		cb = defaultFileName;
		defaultFileName = null;
	}

	defaultFileName = defaultFileName || 'file.pdf';
	this.getBuffer(function (result) {
		var blob;
		try {
			blob = new Blob([result], { type: 'application/pdf' });
		}
		catch (e) {
			// Old browser which can't handle it without making it an byte array (ie10)
			if (e.name == "InvalidStateError") {
				var byteArray = new Uint8Array(result);
				blob = new Blob([byteArray.buffer], { type: 'application/pdf' });
			}
		}
		if (blob) {
			saveAs(blob, defaultFileName);
		}
		else {
			throw 'Could not generate blob';
		}
		if (typeof cb === "function") {
			cb();
		}
	});
};

Document.prototype.getBase64 = function(cb, options) {
	if (!cb) throw 'getBase64 is an async method and needs a callback argument';
	this._createDoc(options, function(buffer) {
		cb(buffer.toString('base64'));
	});
};

Document.prototype.getDataUrl = function(cb, options) {
	if (!cb) throw 'getDataUrl is an async method and needs a callback argument';
	this._createDoc(options, function(buffer) {
		cb('data:application/pdf;base64,' + buffer.toString('base64'));
	});
};

Document.prototype.getBuffer = function(cb, options) {
	if (!cb) throw 'getBuffer is an async method and needs a callback argument';
	this._createDoc(options, function(buffer){
	cb(buffer);
  });
};

module.exports = {
	createPdf: function(docDefinition) {
		if (canCreatePdf()) {
			return new Document(docDefinition, window.pdfMake.fonts, window.pdfMake.vfs);
		}
	}
};
