"use strict";
var ManifoldProject = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __export = (target, all) => {
    for (var name3 in all)
      __defProp(target, name3, { get: all[name3], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __accessCheck = (obj, member3, msg) => member3.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member3, getter) => (__accessCheck(obj, member3, "read from private field"), getter ? getter.call(obj) : member3.get(obj));
  var __privateAdd = (obj, member3, value) => member3.has(obj) ? __typeError("Cannot add the same private member more than once") : member3 instanceof WeakSet ? member3.add(obj) : member3.set(obj, value);
  var __privateSet = (obj, member3, value, setter) => (__accessCheck(obj, member3, "write to private field"), setter ? setter.call(obj, value) : member3.set(obj, value), value);
  var __privateMethod = (obj, member3, method) => (__accessCheck(obj, member3, "access private method"), method);
  var __privateWrapper = (obj, member3, setter, getter) => ({
    set _(value) {
      __privateSet(obj, member3, value, setter);
    },
    get _() {
      return __privateGet(obj, member3, getter);
    }
  });

  // packages/manifold-author/examples/live-oscillator-controller.mjs
  var live_oscillator_controller_exports = {};
  __export(live_oscillator_controller_exports, {
    createProject: () => createProject,
    restoreProject: () => restoreProject
  });

  // packages/manifold-author/node_modules/acorn/dist/acorn.mjs
  var astralIdentifierCodes = [509, 0, 227, 0, 150, 4, 294, 9, 1368, 2, 2, 1, 6, 3, 41, 2, 5, 0, 166, 1, 574, 3, 9, 9, 7, 9, 32, 4, 318, 1, 80, 3, 71, 10, 50, 3, 123, 2, 54, 14, 32, 10, 3, 1, 11, 3, 46, 10, 8, 0, 46, 9, 7, 2, 37, 13, 2, 9, 6, 1, 45, 0, 13, 2, 49, 13, 9, 3, 2, 11, 83, 11, 7, 0, 3, 0, 158, 11, 6, 9, 7, 3, 56, 1, 2, 6, 3, 1, 3, 2, 10, 0, 11, 1, 3, 6, 4, 4, 68, 8, 2, 0, 3, 0, 2, 3, 2, 4, 2, 0, 15, 1, 83, 17, 10, 9, 5, 0, 82, 19, 13, 9, 214, 6, 3, 8, 28, 1, 83, 16, 16, 9, 82, 12, 9, 9, 7, 19, 58, 14, 5, 9, 243, 14, 166, 9, 71, 5, 2, 1, 3, 3, 2, 0, 2, 1, 13, 9, 120, 6, 3, 6, 4, 0, 29, 9, 41, 6, 2, 3, 9, 0, 10, 10, 47, 15, 343, 9, 54, 7, 2, 7, 17, 9, 57, 21, 2, 13, 123, 5, 4, 0, 2, 1, 2, 6, 2, 0, 9, 9, 49, 4, 2, 1, 2, 4, 9, 9, 330, 3, 10, 1, 2, 0, 49, 6, 4, 4, 14, 10, 5350, 0, 7, 14, 11465, 27, 2343, 9, 87, 9, 39, 4, 60, 6, 26, 9, 535, 9, 470, 0, 2, 54, 8, 3, 82, 0, 12, 1, 19628, 1, 4178, 9, 519, 45, 3, 22, 543, 4, 4, 5, 9, 7, 3, 6, 31, 3, 149, 2, 1418, 49, 513, 54, 5, 49, 9, 0, 15, 0, 23, 4, 2, 14, 1361, 6, 2, 16, 3, 6, 2, 1, 2, 4, 101, 0, 161, 6, 10, 9, 357, 0, 62, 13, 499, 13, 245, 1, 2, 9, 726, 6, 110, 6, 6, 9, 4759, 9, 787719, 239];
  var astralIdentifierStartCodes = [0, 11, 2, 25, 2, 18, 2, 1, 2, 14, 3, 13, 35, 122, 70, 52, 268, 28, 4, 48, 48, 31, 14, 29, 6, 37, 11, 29, 3, 35, 5, 7, 2, 4, 43, 157, 19, 35, 5, 35, 5, 39, 9, 51, 13, 10, 2, 14, 2, 6, 2, 1, 2, 10, 2, 14, 2, 6, 2, 1, 4, 51, 13, 310, 10, 21, 11, 7, 25, 5, 2, 41, 2, 8, 70, 5, 3, 0, 2, 43, 2, 1, 4, 0, 3, 22, 11, 22, 10, 30, 66, 18, 2, 1, 11, 21, 11, 25, 71, 55, 7, 1, 65, 0, 16, 3, 2, 2, 2, 28, 43, 28, 4, 28, 36, 7, 2, 27, 28, 53, 11, 21, 11, 18, 14, 17, 111, 72, 56, 50, 14, 50, 14, 35, 39, 27, 10, 22, 251, 41, 7, 1, 17, 2, 60, 28, 11, 0, 9, 21, 43, 17, 47, 20, 28, 22, 13, 52, 58, 1, 3, 0, 14, 44, 33, 24, 27, 35, 30, 0, 3, 0, 9, 34, 4, 0, 13, 47, 15, 3, 22, 0, 2, 0, 36, 17, 2, 24, 20, 1, 64, 6, 2, 0, 2, 3, 2, 14, 2, 9, 8, 46, 39, 7, 3, 1, 3, 21, 2, 6, 2, 1, 2, 4, 4, 0, 19, 0, 13, 4, 31, 9, 2, 0, 3, 0, 2, 37, 2, 0, 26, 0, 2, 0, 45, 52, 19, 3, 21, 2, 31, 47, 21, 1, 2, 0, 185, 46, 42, 3, 37, 47, 21, 0, 60, 42, 14, 0, 72, 26, 38, 6, 186, 43, 117, 63, 32, 7, 3, 0, 3, 7, 2, 1, 2, 23, 16, 0, 2, 0, 95, 7, 3, 38, 17, 0, 2, 0, 29, 0, 11, 39, 8, 0, 22, 0, 12, 45, 20, 0, 19, 72, 200, 32, 32, 8, 2, 36, 18, 0, 50, 29, 113, 6, 2, 1, 2, 37, 22, 0, 26, 5, 2, 1, 2, 31, 15, 0, 328, 18, 16, 0, 2, 12, 2, 33, 125, 0, 80, 921, 103, 110, 18, 195, 2637, 96, 16, 1071, 18, 5, 26, 3994, 6, 582, 6842, 29, 1763, 568, 8, 30, 18, 78, 18, 29, 19, 47, 17, 3, 32, 20, 6, 18, 433, 44, 212, 63, 129, 74, 6, 0, 67, 12, 65, 1, 2, 0, 29, 6135, 9, 1237, 42, 9, 8936, 3, 2, 6, 2, 1, 2, 290, 16, 0, 30, 2, 3, 0, 15, 3, 9, 395, 2309, 106, 6, 12, 4, 8, 8, 9, 5991, 84, 2, 70, 2, 1, 3, 0, 3, 1, 3, 3, 2, 11, 2, 0, 2, 6, 2, 64, 2, 3, 3, 7, 2, 6, 2, 27, 2, 3, 2, 4, 2, 0, 4, 6, 2, 339, 3, 24, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 7, 1845, 30, 7, 5, 262, 61, 147, 44, 11, 6, 17, 0, 322, 29, 19, 43, 485, 27, 229, 29, 3, 0, 496, 6, 2, 3, 2, 1, 2, 14, 2, 196, 60, 67, 8, 0, 1205, 3, 2, 26, 2, 1, 2, 0, 3, 0, 2, 9, 2, 3, 2, 0, 2, 0, 7, 0, 5, 0, 2, 0, 2, 0, 2, 2, 2, 1, 2, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 1, 2, 0, 3, 3, 2, 6, 2, 3, 2, 3, 2, 0, 2, 9, 2, 16, 6, 2, 2, 4, 2, 16, 4421, 42719, 33, 4153, 7, 221, 3, 5761, 15, 7472, 16, 621, 2467, 541, 1507, 4938, 6, 4191];
  var nonASCIIidentifierChars = "\u200C\u200D\xB7\u0300-\u036F\u0387\u0483-\u0487\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u0669\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u06F0-\u06F9\u0711\u0730-\u074A\u07A6-\u07B0\u07C0-\u07C9\u07EB-\u07F3\u07FD\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u0897-\u089F\u08CA-\u08E1\u08E3-\u0903\u093A-\u093C\u093E-\u094F\u0951-\u0957\u0962\u0963\u0966-\u096F\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB-\u09CD\u09D7\u09E2\u09E3\u09E6-\u09EF\u09FE\u0A01-\u0A03\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A66-\u0A71\u0A75\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AE2\u0AE3\u0AE6-\u0AEF\u0AFA-\u0AFF\u0B01-\u0B03\u0B3C\u0B3E-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B55-\u0B57\u0B62\u0B63\u0B66-\u0B6F\u0B82\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD7\u0BE6-\u0BEF\u0C00-\u0C04\u0C3C\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0CBC\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CE2\u0CE3\u0CE6-\u0CEF\u0CF3\u0D00-\u0D03\u0D3B\u0D3C\u0D3E-\u0D44\u0D46-\u0D48\u0D4A-\u0D4D\u0D57\u0D62\u0D63\u0D66-\u0D6F\u0D81-\u0D83\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0E50-\u0E59\u0EB1\u0EB4-\u0EBC\u0EC8-\u0ECE\u0ED0-\u0ED9\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E\u0F3F\u0F71-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102B-\u103E\u1040-\u1049\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F-\u109D\u135D-\u135F\u1369-\u1371\u1712-\u1715\u1732-\u1734\u1752\u1753\u1772\u1773\u17B4-\u17D3\u17DD\u17E0-\u17E9\u180B-\u180D\u180F-\u1819\u18A9\u1920-\u192B\u1930-\u193B\u1946-\u194F\u19D0-\u19DA\u1A17-\u1A1B\u1A55-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AB0-\u1ABD\u1ABF-\u1ACE\u1B00-\u1B04\u1B34-\u1B44\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1B82\u1BA1-\u1BAD\u1BB0-\u1BB9\u1BE6-\u1BF3\u1C24-\u1C37\u1C40-\u1C49\u1C50-\u1C59\u1CD0-\u1CD2\u1CD4-\u1CE8\u1CED\u1CF4\u1CF7-\u1CF9\u1DC0-\u1DFF\u200C\u200D\u203F\u2040\u2054\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099\u309A\u30FB\uA620-\uA629\uA66F\uA674-\uA67D\uA69E\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA823-\uA827\uA82C\uA880\uA881\uA8B4-\uA8C5\uA8D0-\uA8D9\uA8E0-\uA8F1\uA8FF-\uA909\uA926-\uA92D\uA947-\uA953\uA980-\uA983\uA9B3-\uA9C0\uA9D0-\uA9D9\uA9E5\uA9F0-\uA9F9\uAA29-\uAA36\uAA43\uAA4C\uAA4D\uAA50-\uAA59\uAA7B-\uAA7D\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEB-\uAAEF\uAAF5\uAAF6\uABE3-\uABEA\uABEC\uABED\uABF0-\uABF9\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F\uFE33\uFE34\uFE4D-\uFE4F\uFF10-\uFF19\uFF3F\uFF65";
  var nonASCIIidentifierStartChars = "\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u0870-\u0887\u0889-\u088E\u08A0-\u08C9\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C5D\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D04-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u1711\u171F-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1878\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4C\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C8A\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309B-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u31A0-\u31BF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7CD\uA7D0\uA7D1\uA7D3\uA7D5-\uA7DC\uA7F2-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB69\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC";
  var reservedWords = {
    3: "abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",
    5: "class enum extends super const export import",
    6: "enum",
    strict: "implements interface let package private protected public static yield",
    strictBind: "eval arguments"
  };
  var ecma5AndLessKeywords = "break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this";
  var keywords$1 = {
    5: ecma5AndLessKeywords,
    "5module": ecma5AndLessKeywords + " export import",
    6: ecma5AndLessKeywords + " const class extends export import super"
  };
  var keywordRelationalOperator = /^in(stanceof)?$/;
  var nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
  var nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");
  function isInAstralSet(code, set) {
    var pos = 65536;
    for (var i2 = 0; i2 < set.length; i2 += 2) {
      pos += set[i2];
      if (pos > code) {
        return false;
      }
      pos += set[i2 + 1];
      if (pos >= code) {
        return true;
      }
    }
    return false;
  }
  function isIdentifierStart(code, astral) {
    if (code < 65) {
      return code === 36;
    }
    if (code < 91) {
      return true;
    }
    if (code < 97) {
      return code === 95;
    }
    if (code < 123) {
      return true;
    }
    if (code <= 65535) {
      return code >= 170 && nonASCIIidentifierStart.test(String.fromCharCode(code));
    }
    if (astral === false) {
      return false;
    }
    return isInAstralSet(code, astralIdentifierStartCodes);
  }
  function isIdentifierChar(code, astral) {
    if (code < 48) {
      return code === 36;
    }
    if (code < 58) {
      return true;
    }
    if (code < 65) {
      return false;
    }
    if (code < 91) {
      return true;
    }
    if (code < 97) {
      return code === 95;
    }
    if (code < 123) {
      return true;
    }
    if (code <= 65535) {
      return code >= 170 && nonASCIIidentifier.test(String.fromCharCode(code));
    }
    if (astral === false) {
      return false;
    }
    return isInAstralSet(code, astralIdentifierStartCodes) || isInAstralSet(code, astralIdentifierCodes);
  }
  var TokenType = function TokenType2(label2, conf) {
    if (conf === void 0) conf = {};
    this.label = label2;
    this.keyword = conf.keyword;
    this.beforeExpr = !!conf.beforeExpr;
    this.startsExpr = !!conf.startsExpr;
    this.isLoop = !!conf.isLoop;
    this.isAssign = !!conf.isAssign;
    this.prefix = !!conf.prefix;
    this.postfix = !!conf.postfix;
    this.binop = conf.binop || null;
    this.updateContext = null;
  };
  function binop(name3, prec) {
    return new TokenType(name3, { beforeExpr: true, binop: prec });
  }
  var beforeExpr = { beforeExpr: true };
  var startsExpr = { startsExpr: true };
  var keywords = {};
  function kw(name3, options) {
    if (options === void 0) options = {};
    options.keyword = name3;
    return keywords[name3] = new TokenType(name3, options);
  }
  var types$1 = {
    num: new TokenType("num", startsExpr),
    regexp: new TokenType("regexp", startsExpr),
    string: new TokenType("string", startsExpr),
    name: new TokenType("name", startsExpr),
    privateId: new TokenType("privateId", startsExpr),
    eof: new TokenType("eof"),
    // Punctuation token types.
    bracketL: new TokenType("[", { beforeExpr: true, startsExpr: true }),
    bracketR: new TokenType("]"),
    braceL: new TokenType("{", { beforeExpr: true, startsExpr: true }),
    braceR: new TokenType("}"),
    parenL: new TokenType("(", { beforeExpr: true, startsExpr: true }),
    parenR: new TokenType(")"),
    comma: new TokenType(",", beforeExpr),
    semi: new TokenType(";", beforeExpr),
    colon: new TokenType(":", beforeExpr),
    dot: new TokenType("."),
    question: new TokenType("?", beforeExpr),
    questionDot: new TokenType("?."),
    arrow: new TokenType("=>", beforeExpr),
    template: new TokenType("template"),
    invalidTemplate: new TokenType("invalidTemplate"),
    ellipsis: new TokenType("...", beforeExpr),
    backQuote: new TokenType("`", startsExpr),
    dollarBraceL: new TokenType("${", { beforeExpr: true, startsExpr: true }),
    // Operators. These carry several kinds of properties to help the
    // parser use them properly (the presence of these properties is
    // what categorizes them as operators).
    //
    // `binop`, when present, specifies that this operator is a binary
    // operator, and will refer to its precedence.
    //
    // `prefix` and `postfix` mark the operator as a prefix or postfix
    // unary operator.
    //
    // `isAssign` marks all of `=`, `+=`, `-=` etcetera, which act as
    // binary operators with a very low precedence, that should result
    // in AssignmentExpression nodes.
    eq: new TokenType("=", { beforeExpr: true, isAssign: true }),
    assign: new TokenType("_=", { beforeExpr: true, isAssign: true }),
    incDec: new TokenType("++/--", { prefix: true, postfix: true, startsExpr: true }),
    prefix: new TokenType("!/~", { beforeExpr: true, prefix: true, startsExpr: true }),
    logicalOR: binop("||", 1),
    logicalAND: binop("&&", 2),
    bitwiseOR: binop("|", 3),
    bitwiseXOR: binop("^", 4),
    bitwiseAND: binop("&", 5),
    equality: binop("==/!=/===/!==", 6),
    relational: binop("</>/<=/>=", 7),
    bitShift: binop("<</>>/>>>", 8),
    plusMin: new TokenType("+/-", { beforeExpr: true, binop: 9, prefix: true, startsExpr: true }),
    modulo: binop("%", 10),
    star: binop("*", 10),
    slash: binop("/", 10),
    starstar: new TokenType("**", { beforeExpr: true }),
    coalesce: binop("??", 1),
    // Keyword token types.
    _break: kw("break"),
    _case: kw("case", beforeExpr),
    _catch: kw("catch"),
    _continue: kw("continue"),
    _debugger: kw("debugger"),
    _default: kw("default", beforeExpr),
    _do: kw("do", { isLoop: true, beforeExpr: true }),
    _else: kw("else", beforeExpr),
    _finally: kw("finally"),
    _for: kw("for", { isLoop: true }),
    _function: kw("function", startsExpr),
    _if: kw("if"),
    _return: kw("return", beforeExpr),
    _switch: kw("switch"),
    _throw: kw("throw", beforeExpr),
    _try: kw("try"),
    _var: kw("var"),
    _const: kw("const"),
    _while: kw("while", { isLoop: true }),
    _with: kw("with"),
    _new: kw("new", { beforeExpr: true, startsExpr: true }),
    _this: kw("this", startsExpr),
    _super: kw("super", startsExpr),
    _class: kw("class", startsExpr),
    _extends: kw("extends", beforeExpr),
    _export: kw("export"),
    _import: kw("import", startsExpr),
    _null: kw("null", startsExpr),
    _true: kw("true", startsExpr),
    _false: kw("false", startsExpr),
    _in: kw("in", { beforeExpr: true, binop: 7 }),
    _instanceof: kw("instanceof", { beforeExpr: true, binop: 7 }),
    _typeof: kw("typeof", { beforeExpr: true, prefix: true, startsExpr: true }),
    _void: kw("void", { beforeExpr: true, prefix: true, startsExpr: true }),
    _delete: kw("delete", { beforeExpr: true, prefix: true, startsExpr: true })
  };
  var lineBreak = /\r\n?|\n|\u2028|\u2029/;
  var lineBreakG = new RegExp(lineBreak.source, "g");
  function isNewLine(code) {
    return code === 10 || code === 13 || code === 8232 || code === 8233;
  }
  function nextLineBreak(code, from, end) {
    if (end === void 0) end = code.length;
    for (var i2 = from; i2 < end; i2++) {
      var next = code.charCodeAt(i2);
      if (isNewLine(next)) {
        return i2 < end - 1 && next === 13 && code.charCodeAt(i2 + 1) === 10 ? i2 + 2 : i2 + 1;
      }
    }
    return -1;
  }
  var nonASCIIwhitespace = /[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/;
  var skipWhiteSpace = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;
  var ref = Object.prototype;
  var hasOwnProperty = ref.hasOwnProperty;
  var toString = ref.toString;
  var hasOwn = Object.hasOwn || (function(obj, propName) {
    return hasOwnProperty.call(obj, propName);
  });
  var isArray = Array.isArray || (function(obj) {
    return toString.call(obj) === "[object Array]";
  });
  var regexpCache = /* @__PURE__ */ Object.create(null);
  function wordsRegexp(words) {
    return regexpCache[words] || (regexpCache[words] = new RegExp("^(?:" + words.replace(/ /g, "|") + ")$"));
  }
  function codePointToString(code) {
    if (code <= 65535) {
      return String.fromCharCode(code);
    }
    code -= 65536;
    return String.fromCharCode((code >> 10) + 55296, (code & 1023) + 56320);
  }
  var loneSurrogate = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/;
  var Position = function Position2(line, col) {
    this.line = line;
    this.column = col;
  };
  Position.prototype.offset = function offset(n) {
    return new Position(this.line, this.column + n);
  };
  var SourceLocation = function SourceLocation2(p, start, end) {
    this.start = start;
    this.end = end;
    if (p.sourceFile !== null) {
      this.source = p.sourceFile;
    }
  };
  function getLineInfo(input, offset2) {
    for (var line = 1, cur = 0; ; ) {
      var nextBreak = nextLineBreak(input, cur, offset2);
      if (nextBreak < 0) {
        return new Position(line, offset2 - cur);
      }
      ++line;
      cur = nextBreak;
    }
  }
  var defaultOptions = {
    // `ecmaVersion` indicates the ECMAScript version to parse. Must be
    // either 3, 5, 6 (or 2015), 7 (2016), 8 (2017), 9 (2018), 10
    // (2019), 11 (2020), 12 (2021), 13 (2022), 14 (2023), or `"latest"`
    // (the latest version the library supports). This influences
    // support for strict mode, the set of reserved words, and support
    // for new syntax features.
    ecmaVersion: null,
    // `sourceType` indicates the mode the code should be parsed in.
    // Can be either `"script"` or `"module"`. This influences global
    // strict mode and parsing of `import` and `export` declarations.
    sourceType: "script",
    // `onInsertedSemicolon` can be a callback that will be called when
    // a semicolon is automatically inserted. It will be passed the
    // position of the inserted semicolon as an offset, and if
    // `locations` is enabled, it is given the location as a `{line,
    // column}` object as second argument.
    onInsertedSemicolon: null,
    // `onTrailingComma` is similar to `onInsertedSemicolon`, but for
    // trailing commas.
    onTrailingComma: null,
    // By default, reserved words are only enforced if ecmaVersion >= 5.
    // Set `allowReserved` to a boolean value to explicitly turn this on
    // an off. When this option has the value "never", reserved words
    // and keywords can also not be used as property names.
    allowReserved: null,
    // When enabled, a return at the top level is not considered an
    // error.
    allowReturnOutsideFunction: false,
    // When enabled, import/export statements are not constrained to
    // appearing at the top of the program, and an import.meta expression
    // in a script isn't considered an error.
    allowImportExportEverywhere: false,
    // By default, await identifiers are allowed to appear at the top-level scope only if ecmaVersion >= 2022.
    // When enabled, await identifiers are allowed to appear at the top-level scope,
    // but they are still not allowed in non-async functions.
    allowAwaitOutsideFunction: null,
    // When enabled, super identifiers are not constrained to
    // appearing in methods and do not raise an error when they appear elsewhere.
    allowSuperOutsideMethod: null,
    // When enabled, hashbang directive in the beginning of file is
    // allowed and treated as a line comment. Enabled by default when
    // `ecmaVersion` >= 2023.
    allowHashBang: false,
    // By default, the parser will verify that private properties are
    // only used in places where they are valid and have been declared.
    // Set this to false to turn such checks off.
    checkPrivateFields: true,
    // When `locations` is on, `loc` properties holding objects with
    // `start` and `end` properties in `{line, column}` form (with
    // line being 1-based and column 0-based) will be attached to the
    // nodes.
    locations: false,
    // A function can be passed as `onToken` option, which will
    // cause Acorn to call that function with object in the same
    // format as tokens returned from `tokenizer().getToken()`. Note
    // that you are not allowed to call the parser from the
    // callback—that will corrupt its internal state.
    onToken: null,
    // A function can be passed as `onComment` option, which will
    // cause Acorn to call that function with `(block, text, start,
    // end)` parameters whenever a comment is skipped. `block` is a
    // boolean indicating whether this is a block (`/* */`) comment,
    // `text` is the content of the comment, and `start` and `end` are
    // character offsets that denote the start and end of the comment.
    // When the `locations` option is on, two more parameters are
    // passed, the full `{line, column}` locations of the start and
    // end of the comments. Note that you are not allowed to call the
    // parser from the callback—that will corrupt its internal state.
    // When this option has an array as value, objects representing the
    // comments are pushed to it.
    onComment: null,
    // Nodes have their start and end characters offsets recorded in
    // `start` and `end` properties (directly on the node, rather than
    // the `loc` object, which holds line/column data. To also add a
    // [semi-standardized][range] `range` property holding a `[start,
    // end]` array with the same numbers, set the `ranges` option to
    // `true`.
    //
    // [range]: https://bugzilla.mozilla.org/show_bug.cgi?id=745678
    ranges: false,
    // It is possible to parse multiple files into a single AST by
    // passing the tree produced by parsing the first file as
    // `program` option in subsequent parses. This will add the
    // toplevel forms of the parsed file to the `Program` (top) node
    // of an existing parse tree.
    program: null,
    // When `locations` is on, you can pass this to record the source
    // file in every node's `loc` object.
    sourceFile: null,
    // This value, if given, is stored in every node, whether
    // `locations` is on or off.
    directSourceFile: null,
    // When enabled, parenthesized expressions are represented by
    // (non-standard) ParenthesizedExpression nodes
    preserveParens: false
  };
  var warnedAboutEcmaVersion = false;
  function getOptions(opts) {
    var options = {};
    for (var opt in defaultOptions) {
      options[opt] = opts && hasOwn(opts, opt) ? opts[opt] : defaultOptions[opt];
    }
    if (options.ecmaVersion === "latest") {
      options.ecmaVersion = 1e8;
    } else if (options.ecmaVersion == null) {
      if (!warnedAboutEcmaVersion && typeof console === "object" && console.warn) {
        warnedAboutEcmaVersion = true;
        console.warn("Since Acorn 8.0.0, options.ecmaVersion is required.\nDefaulting to 2020, but this will stop working in the future.");
      }
      options.ecmaVersion = 11;
    } else if (options.ecmaVersion >= 2015) {
      options.ecmaVersion -= 2009;
    }
    if (options.allowReserved == null) {
      options.allowReserved = options.ecmaVersion < 5;
    }
    if (!opts || opts.allowHashBang == null) {
      options.allowHashBang = options.ecmaVersion >= 14;
    }
    if (isArray(options.onToken)) {
      var tokens = options.onToken;
      options.onToken = function(token) {
        return tokens.push(token);
      };
    }
    if (isArray(options.onComment)) {
      options.onComment = pushComment(options, options.onComment);
    }
    return options;
  }
  function pushComment(options, array) {
    return function(block, text, start, end, startLoc, endLoc) {
      var comment = {
        type: block ? "Block" : "Line",
        value: text,
        start,
        end
      };
      if (options.locations) {
        comment.loc = new SourceLocation(this, startLoc, endLoc);
      }
      if (options.ranges) {
        comment.range = [start, end];
      }
      array.push(comment);
    };
  }
  var SCOPE_TOP = 1;
  var SCOPE_FUNCTION = 2;
  var SCOPE_ASYNC = 4;
  var SCOPE_GENERATOR = 8;
  var SCOPE_ARROW = 16;
  var SCOPE_SIMPLE_CATCH = 32;
  var SCOPE_SUPER = 64;
  var SCOPE_DIRECT_SUPER = 128;
  var SCOPE_CLASS_STATIC_BLOCK = 256;
  var SCOPE_CLASS_FIELD_INIT = 512;
  var SCOPE_VAR = SCOPE_TOP | SCOPE_FUNCTION | SCOPE_CLASS_STATIC_BLOCK;
  function functionFlags(async, generator) {
    return SCOPE_FUNCTION | (async ? SCOPE_ASYNC : 0) | (generator ? SCOPE_GENERATOR : 0);
  }
  var BIND_NONE = 0;
  var BIND_VAR = 1;
  var BIND_LEXICAL = 2;
  var BIND_FUNCTION = 3;
  var BIND_SIMPLE_CATCH = 4;
  var BIND_OUTSIDE = 5;
  var Parser = function Parser2(options, input, startPos) {
    this.options = options = getOptions(options);
    this.sourceFile = options.sourceFile;
    this.keywords = wordsRegexp(keywords$1[options.ecmaVersion >= 6 ? 6 : options.sourceType === "module" ? "5module" : 5]);
    var reserved = "";
    if (options.allowReserved !== true) {
      reserved = reservedWords[options.ecmaVersion >= 6 ? 6 : options.ecmaVersion === 5 ? 5 : 3];
      if (options.sourceType === "module") {
        reserved += " await";
      }
    }
    this.reservedWords = wordsRegexp(reserved);
    var reservedStrict = (reserved ? reserved + " " : "") + reservedWords.strict;
    this.reservedWordsStrict = wordsRegexp(reservedStrict);
    this.reservedWordsStrictBind = wordsRegexp(reservedStrict + " " + reservedWords.strictBind);
    this.input = String(input);
    this.containsEsc = false;
    if (startPos) {
      this.pos = startPos;
      this.lineStart = this.input.lastIndexOf("\n", startPos - 1) + 1;
      this.curLine = this.input.slice(0, this.lineStart).split(lineBreak).length;
    } else {
      this.pos = this.lineStart = 0;
      this.curLine = 1;
    }
    this.type = types$1.eof;
    this.value = null;
    this.start = this.end = this.pos;
    this.startLoc = this.endLoc = this.curPosition();
    this.lastTokEndLoc = this.lastTokStartLoc = null;
    this.lastTokStart = this.lastTokEnd = this.pos;
    this.context = this.initialContext();
    this.exprAllowed = true;
    this.inModule = options.sourceType === "module";
    this.strict = this.inModule || this.strictDirective(this.pos);
    this.potentialArrowAt = -1;
    this.potentialArrowInForAwait = false;
    this.yieldPos = this.awaitPos = this.awaitIdentPos = 0;
    this.labels = [];
    this.undefinedExports = /* @__PURE__ */ Object.create(null);
    if (this.pos === 0 && options.allowHashBang && this.input.slice(0, 2) === "#!") {
      this.skipLineComment(2);
    }
    this.scopeStack = [];
    this.enterScope(SCOPE_TOP);
    this.regexpState = null;
    this.privateNameStack = [];
  };
  var prototypeAccessors = { inFunction: { configurable: true }, inGenerator: { configurable: true }, inAsync: { configurable: true }, canAwait: { configurable: true }, allowSuper: { configurable: true }, allowDirectSuper: { configurable: true }, treatFunctionsAsVar: { configurable: true }, allowNewDotTarget: { configurable: true }, inClassStaticBlock: { configurable: true } };
  Parser.prototype.parse = function parse() {
    var node = this.options.program || this.startNode();
    this.nextToken();
    return this.parseTopLevel(node);
  };
  prototypeAccessors.inFunction.get = function() {
    return (this.currentVarScope().flags & SCOPE_FUNCTION) > 0;
  };
  prototypeAccessors.inGenerator.get = function() {
    return (this.currentVarScope().flags & SCOPE_GENERATOR) > 0;
  };
  prototypeAccessors.inAsync.get = function() {
    return (this.currentVarScope().flags & SCOPE_ASYNC) > 0;
  };
  prototypeAccessors.canAwait.get = function() {
    for (var i2 = this.scopeStack.length - 1; i2 >= 0; i2--) {
      var ref2 = this.scopeStack[i2];
      var flags = ref2.flags;
      if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT)) {
        return false;
      }
      if (flags & SCOPE_FUNCTION) {
        return (flags & SCOPE_ASYNC) > 0;
      }
    }
    return this.inModule && this.options.ecmaVersion >= 13 || this.options.allowAwaitOutsideFunction;
  };
  prototypeAccessors.allowSuper.get = function() {
    var ref2 = this.currentThisScope();
    var flags = ref2.flags;
    return (flags & SCOPE_SUPER) > 0 || this.options.allowSuperOutsideMethod;
  };
  prototypeAccessors.allowDirectSuper.get = function() {
    return (this.currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0;
  };
  prototypeAccessors.treatFunctionsAsVar.get = function() {
    return this.treatFunctionsAsVarInScope(this.currentScope());
  };
  prototypeAccessors.allowNewDotTarget.get = function() {
    for (var i2 = this.scopeStack.length - 1; i2 >= 0; i2--) {
      var ref2 = this.scopeStack[i2];
      var flags = ref2.flags;
      if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT) || flags & SCOPE_FUNCTION && !(flags & SCOPE_ARROW)) {
        return true;
      }
    }
    return false;
  };
  prototypeAccessors.inClassStaticBlock.get = function() {
    return (this.currentVarScope().flags & SCOPE_CLASS_STATIC_BLOCK) > 0;
  };
  Parser.extend = function extend() {
    var plugins = [], len = arguments.length;
    while (len--) plugins[len] = arguments[len];
    var cls = this;
    for (var i2 = 0; i2 < plugins.length; i2++) {
      cls = plugins[i2](cls);
    }
    return cls;
  };
  Parser.parse = function parse2(input, options) {
    return new this(options, input).parse();
  };
  Parser.parseExpressionAt = function parseExpressionAt(input, pos, options) {
    var parser = new this(options, input, pos);
    parser.nextToken();
    return parser.parseExpression();
  };
  Parser.tokenizer = function tokenizer(input, options) {
    return new this(options, input);
  };
  Object.defineProperties(Parser.prototype, prototypeAccessors);
  var pp$9 = Parser.prototype;
  var literal = /^(?:'((?:\\[^]|[^'\\])*?)'|"((?:\\[^]|[^"\\])*?)")/;
  pp$9.strictDirective = function(start) {
    if (this.options.ecmaVersion < 5) {
      return false;
    }
    for (; ; ) {
      skipWhiteSpace.lastIndex = start;
      start += skipWhiteSpace.exec(this.input)[0].length;
      var match = literal.exec(this.input.slice(start));
      if (!match) {
        return false;
      }
      if ((match[1] || match[2]) === "use strict") {
        skipWhiteSpace.lastIndex = start + match[0].length;
        var spaceAfter = skipWhiteSpace.exec(this.input), end = spaceAfter.index + spaceAfter[0].length;
        var next = this.input.charAt(end);
        return next === ";" || next === "}" || lineBreak.test(spaceAfter[0]) && !(/[(`.[+\-/*%<>=,?^&]/.test(next) || next === "!" && this.input.charAt(end + 1) === "=");
      }
      start += match[0].length;
      skipWhiteSpace.lastIndex = start;
      start += skipWhiteSpace.exec(this.input)[0].length;
      if (this.input[start] === ";") {
        start++;
      }
    }
  };
  pp$9.eat = function(type) {
    if (this.type === type) {
      this.next();
      return true;
    } else {
      return false;
    }
  };
  pp$9.isContextual = function(name3) {
    return this.type === types$1.name && this.value === name3 && !this.containsEsc;
  };
  pp$9.eatContextual = function(name3) {
    if (!this.isContextual(name3)) {
      return false;
    }
    this.next();
    return true;
  };
  pp$9.expectContextual = function(name3) {
    if (!this.eatContextual(name3)) {
      this.unexpected();
    }
  };
  pp$9.canInsertSemicolon = function() {
    return this.type === types$1.eof || this.type === types$1.braceR || lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
  };
  pp$9.insertSemicolon = function() {
    if (this.canInsertSemicolon()) {
      if (this.options.onInsertedSemicolon) {
        this.options.onInsertedSemicolon(this.lastTokEnd, this.lastTokEndLoc);
      }
      return true;
    }
  };
  pp$9.semicolon = function() {
    if (!this.eat(types$1.semi) && !this.insertSemicolon()) {
      this.unexpected();
    }
  };
  pp$9.afterTrailingComma = function(tokType, notNext) {
    if (this.type === tokType) {
      if (this.options.onTrailingComma) {
        this.options.onTrailingComma(this.lastTokStart, this.lastTokStartLoc);
      }
      if (!notNext) {
        this.next();
      }
      return true;
    }
  };
  pp$9.expect = function(type) {
    this.eat(type) || this.unexpected();
  };
  pp$9.unexpected = function(pos) {
    this.raise(pos != null ? pos : this.start, "Unexpected token");
  };
  var DestructuringErrors = function DestructuringErrors2() {
    this.shorthandAssign = this.trailingComma = this.parenthesizedAssign = this.parenthesizedBind = this.doubleProto = -1;
  };
  pp$9.checkPatternErrors = function(refDestructuringErrors, isAssign) {
    if (!refDestructuringErrors) {
      return;
    }
    if (refDestructuringErrors.trailingComma > -1) {
      this.raiseRecoverable(refDestructuringErrors.trailingComma, "Comma is not permitted after the rest element");
    }
    var parens = isAssign ? refDestructuringErrors.parenthesizedAssign : refDestructuringErrors.parenthesizedBind;
    if (parens > -1) {
      this.raiseRecoverable(parens, isAssign ? "Assigning to rvalue" : "Parenthesized pattern");
    }
  };
  pp$9.checkExpressionErrors = function(refDestructuringErrors, andThrow) {
    if (!refDestructuringErrors) {
      return false;
    }
    var shorthandAssign = refDestructuringErrors.shorthandAssign;
    var doubleProto = refDestructuringErrors.doubleProto;
    if (!andThrow) {
      return shorthandAssign >= 0 || doubleProto >= 0;
    }
    if (shorthandAssign >= 0) {
      this.raise(shorthandAssign, "Shorthand property assignments are valid only in destructuring patterns");
    }
    if (doubleProto >= 0) {
      this.raiseRecoverable(doubleProto, "Redefinition of __proto__ property");
    }
  };
  pp$9.checkYieldAwaitInDefaultParams = function() {
    if (this.yieldPos && (!this.awaitPos || this.yieldPos < this.awaitPos)) {
      this.raise(this.yieldPos, "Yield expression cannot be a default value");
    }
    if (this.awaitPos) {
      this.raise(this.awaitPos, "Await expression cannot be a default value");
    }
  };
  pp$9.isSimpleAssignTarget = function(expr) {
    if (expr.type === "ParenthesizedExpression") {
      return this.isSimpleAssignTarget(expr.expression);
    }
    return expr.type === "Identifier" || expr.type === "MemberExpression";
  };
  var pp$8 = Parser.prototype;
  pp$8.parseTopLevel = function(node) {
    var exports = /* @__PURE__ */ Object.create(null);
    if (!node.body) {
      node.body = [];
    }
    while (this.type !== types$1.eof) {
      var stmt = this.parseStatement(null, true, exports);
      node.body.push(stmt);
    }
    if (this.inModule) {
      for (var i2 = 0, list2 = Object.keys(this.undefinedExports); i2 < list2.length; i2 += 1) {
        var name3 = list2[i2];
        this.raiseRecoverable(this.undefinedExports[name3].start, "Export '" + name3 + "' is not defined");
      }
    }
    this.adaptDirectivePrologue(node.body);
    this.next();
    node.sourceType = this.options.sourceType;
    return this.finishNode(node, "Program");
  };
  var loopLabel = { kind: "loop" };
  var switchLabel = { kind: "switch" };
  pp$8.isLet = function(context) {
    if (this.options.ecmaVersion < 6 || !this.isContextual("let")) {
      return false;
    }
    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next = this.pos + skip[0].length, nextCh = this.input.charCodeAt(next);
    if (nextCh === 91 || nextCh === 92) {
      return true;
    }
    if (context) {
      return false;
    }
    if (nextCh === 123 || nextCh > 55295 && nextCh < 56320) {
      return true;
    }
    if (isIdentifierStart(nextCh, true)) {
      var pos = next + 1;
      while (isIdentifierChar(nextCh = this.input.charCodeAt(pos), true)) {
        ++pos;
      }
      if (nextCh === 92 || nextCh > 55295 && nextCh < 56320) {
        return true;
      }
      var ident = this.input.slice(next, pos);
      if (!keywordRelationalOperator.test(ident)) {
        return true;
      }
    }
    return false;
  };
  pp$8.isAsyncFunction = function() {
    if (this.options.ecmaVersion < 8 || !this.isContextual("async")) {
      return false;
    }
    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next = this.pos + skip[0].length, after;
    return !lineBreak.test(this.input.slice(this.pos, next)) && this.input.slice(next, next + 8) === "function" && (next + 8 === this.input.length || !(isIdentifierChar(after = this.input.charCodeAt(next + 8)) || after > 55295 && after < 56320));
  };
  pp$8.isUsingKeyword = function(isAwaitUsing, isFor) {
    if (this.options.ecmaVersion < 17 || !this.isContextual(isAwaitUsing ? "await" : "using")) {
      return false;
    }
    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next = this.pos + skip[0].length;
    if (lineBreak.test(this.input.slice(this.pos, next))) {
      return false;
    }
    if (isAwaitUsing) {
      var awaitEndPos = next + 5, after;
      if (this.input.slice(next, awaitEndPos) !== "using" || awaitEndPos === this.input.length || isIdentifierChar(after = this.input.charCodeAt(awaitEndPos)) || after > 55295 && after < 56320) {
        return false;
      }
      skipWhiteSpace.lastIndex = awaitEndPos;
      var skipAfterUsing = skipWhiteSpace.exec(this.input);
      if (skipAfterUsing && lineBreak.test(this.input.slice(awaitEndPos, awaitEndPos + skipAfterUsing[0].length))) {
        return false;
      }
    }
    if (isFor) {
      var ofEndPos = next + 2, after$1;
      if (this.input.slice(next, ofEndPos) === "of") {
        if (ofEndPos === this.input.length || !isIdentifierChar(after$1 = this.input.charCodeAt(ofEndPos)) && !(after$1 > 55295 && after$1 < 56320)) {
          return false;
        }
      }
    }
    var ch = this.input.charCodeAt(next);
    return isIdentifierStart(ch, true) || ch === 92;
  };
  pp$8.isAwaitUsing = function(isFor) {
    return this.isUsingKeyword(true, isFor);
  };
  pp$8.isUsing = function(isFor) {
    return this.isUsingKeyword(false, isFor);
  };
  pp$8.parseStatement = function(context, topLevel, exports) {
    var starttype = this.type, node = this.startNode(), kind;
    if (this.isLet(context)) {
      starttype = types$1._var;
      kind = "let";
    }
    switch (starttype) {
      case types$1._break:
      case types$1._continue:
        return this.parseBreakContinueStatement(node, starttype.keyword);
      case types$1._debugger:
        return this.parseDebuggerStatement(node);
      case types$1._do:
        return this.parseDoStatement(node);
      case types$1._for:
        return this.parseForStatement(node);
      case types$1._function:
        if (context && (this.strict || context !== "if" && context !== "label") && this.options.ecmaVersion >= 6) {
          this.unexpected();
        }
        return this.parseFunctionStatement(node, false, !context);
      case types$1._class:
        if (context) {
          this.unexpected();
        }
        return this.parseClass(node, true);
      case types$1._if:
        return this.parseIfStatement(node);
      case types$1._return:
        return this.parseReturnStatement(node);
      case types$1._switch:
        return this.parseSwitchStatement(node);
      case types$1._throw:
        return this.parseThrowStatement(node);
      case types$1._try:
        return this.parseTryStatement(node);
      case types$1._const:
      case types$1._var:
        kind = kind || this.value;
        if (context && kind !== "var") {
          this.unexpected();
        }
        return this.parseVarStatement(node, kind);
      case types$1._while:
        return this.parseWhileStatement(node);
      case types$1._with:
        return this.parseWithStatement(node);
      case types$1.braceL:
        return this.parseBlock(true, node);
      case types$1.semi:
        return this.parseEmptyStatement(node);
      case types$1._export:
      case types$1._import:
        if (this.options.ecmaVersion > 10 && starttype === types$1._import) {
          skipWhiteSpace.lastIndex = this.pos;
          var skip = skipWhiteSpace.exec(this.input);
          var next = this.pos + skip[0].length, nextCh = this.input.charCodeAt(next);
          if (nextCh === 40 || nextCh === 46) {
            return this.parseExpressionStatement(node, this.parseExpression());
          }
        }
        if (!this.options.allowImportExportEverywhere) {
          if (!topLevel) {
            this.raise(this.start, "'import' and 'export' may only appear at the top level");
          }
          if (!this.inModule) {
            this.raise(this.start, "'import' and 'export' may appear only with 'sourceType: module'");
          }
        }
        return starttype === types$1._import ? this.parseImport(node) : this.parseExport(node, exports);
      // If the statement does not start with a statement keyword or a
      // brace, it's an ExpressionStatement or LabeledStatement. We
      // simply start parsing an expression, and afterwards, if the
      // next token is a colon and the expression was a simple
      // Identifier node, we switch to interpreting it as a label.
      default:
        if (this.isAsyncFunction()) {
          if (context) {
            this.unexpected();
          }
          this.next();
          return this.parseFunctionStatement(node, true, !context);
        }
        var usingKind = this.isAwaitUsing(false) ? "await using" : this.isUsing(false) ? "using" : null;
        if (usingKind) {
          if (topLevel && this.options.sourceType === "script") {
            this.raise(this.start, "Using declaration cannot appear in the top level when source type is `script`");
          }
          if (usingKind === "await using") {
            if (!this.canAwait) {
              this.raise(this.start, "Await using cannot appear outside of async function");
            }
            this.next();
          }
          this.next();
          this.parseVar(node, false, usingKind);
          this.semicolon();
          return this.finishNode(node, "VariableDeclaration");
        }
        var maybeName = this.value, expr = this.parseExpression();
        if (starttype === types$1.name && expr.type === "Identifier" && this.eat(types$1.colon)) {
          return this.parseLabeledStatement(node, maybeName, expr, context);
        } else {
          return this.parseExpressionStatement(node, expr);
        }
    }
  };
  pp$8.parseBreakContinueStatement = function(node, keyword) {
    var isBreak = keyword === "break";
    this.next();
    if (this.eat(types$1.semi) || this.insertSemicolon()) {
      node.label = null;
    } else if (this.type !== types$1.name) {
      this.unexpected();
    } else {
      node.label = this.parseIdent();
      this.semicolon();
    }
    var i2 = 0;
    for (; i2 < this.labels.length; ++i2) {
      var lab = this.labels[i2];
      if (node.label == null || lab.name === node.label.name) {
        if (lab.kind != null && (isBreak || lab.kind === "loop")) {
          break;
        }
        if (node.label && isBreak) {
          break;
        }
      }
    }
    if (i2 === this.labels.length) {
      this.raise(node.start, "Unsyntactic " + keyword);
    }
    return this.finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");
  };
  pp$8.parseDebuggerStatement = function(node) {
    this.next();
    this.semicolon();
    return this.finishNode(node, "DebuggerStatement");
  };
  pp$8.parseDoStatement = function(node) {
    this.next();
    this.labels.push(loopLabel);
    node.body = this.parseStatement("do");
    this.labels.pop();
    this.expect(types$1._while);
    node.test = this.parseParenExpression();
    if (this.options.ecmaVersion >= 6) {
      this.eat(types$1.semi);
    } else {
      this.semicolon();
    }
    return this.finishNode(node, "DoWhileStatement");
  };
  pp$8.parseForStatement = function(node) {
    this.next();
    var awaitAt = this.options.ecmaVersion >= 9 && this.canAwait && this.eatContextual("await") ? this.lastTokStart : -1;
    this.labels.push(loopLabel);
    this.enterScope(0);
    this.expect(types$1.parenL);
    if (this.type === types$1.semi) {
      if (awaitAt > -1) {
        this.unexpected(awaitAt);
      }
      return this.parseFor(node, null);
    }
    var isLet = this.isLet();
    if (this.type === types$1._var || this.type === types$1._const || isLet) {
      var init$1 = this.startNode(), kind = isLet ? "let" : this.value;
      this.next();
      this.parseVar(init$1, true, kind);
      this.finishNode(init$1, "VariableDeclaration");
      return this.parseForAfterInit(node, init$1, awaitAt);
    }
    var startsWithLet = this.isContextual("let"), isForOf = false;
    var usingKind = this.isUsing(true) ? "using" : this.isAwaitUsing(true) ? "await using" : null;
    if (usingKind) {
      var init$2 = this.startNode();
      this.next();
      if (usingKind === "await using") {
        this.next();
      }
      this.parseVar(init$2, true, usingKind);
      this.finishNode(init$2, "VariableDeclaration");
      return this.parseForAfterInit(node, init$2, awaitAt);
    }
    var containsEsc = this.containsEsc;
    var refDestructuringErrors = new DestructuringErrors();
    var initPos = this.start;
    var init = awaitAt > -1 ? this.parseExprSubscripts(refDestructuringErrors, "await") : this.parseExpression(true, refDestructuringErrors);
    if (this.type === types$1._in || (isForOf = this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
      if (awaitAt > -1) {
        if (this.type === types$1._in) {
          this.unexpected(awaitAt);
        }
        node.await = true;
      } else if (isForOf && this.options.ecmaVersion >= 8) {
        if (init.start === initPos && !containsEsc && init.type === "Identifier" && init.name === "async") {
          this.unexpected();
        } else if (this.options.ecmaVersion >= 9) {
          node.await = false;
        }
      }
      if (startsWithLet && isForOf) {
        this.raise(init.start, "The left-hand side of a for-of loop may not start with 'let'.");
      }
      this.toAssignable(init, false, refDestructuringErrors);
      this.checkLValPattern(init);
      return this.parseForIn(node, init);
    } else {
      this.checkExpressionErrors(refDestructuringErrors, true);
    }
    if (awaitAt > -1) {
      this.unexpected(awaitAt);
    }
    return this.parseFor(node, init);
  };
  pp$8.parseForAfterInit = function(node, init, awaitAt) {
    if ((this.type === types$1._in || this.options.ecmaVersion >= 6 && this.isContextual("of")) && init.declarations.length === 1) {
      if (this.options.ecmaVersion >= 9) {
        if (this.type === types$1._in) {
          if (awaitAt > -1) {
            this.unexpected(awaitAt);
          }
        } else {
          node.await = awaitAt > -1;
        }
      }
      return this.parseForIn(node, init);
    }
    if (awaitAt > -1) {
      this.unexpected(awaitAt);
    }
    return this.parseFor(node, init);
  };
  pp$8.parseFunctionStatement = function(node, isAsync, declarationPosition) {
    this.next();
    return this.parseFunction(node, FUNC_STATEMENT | (declarationPosition ? 0 : FUNC_HANGING_STATEMENT), false, isAsync);
  };
  pp$8.parseIfStatement = function(node) {
    this.next();
    node.test = this.parseParenExpression();
    node.consequent = this.parseStatement("if");
    node.alternate = this.eat(types$1._else) ? this.parseStatement("if") : null;
    return this.finishNode(node, "IfStatement");
  };
  pp$8.parseReturnStatement = function(node) {
    if (!this.inFunction && !this.options.allowReturnOutsideFunction) {
      this.raise(this.start, "'return' outside of function");
    }
    this.next();
    if (this.eat(types$1.semi) || this.insertSemicolon()) {
      node.argument = null;
    } else {
      node.argument = this.parseExpression();
      this.semicolon();
    }
    return this.finishNode(node, "ReturnStatement");
  };
  pp$8.parseSwitchStatement = function(node) {
    this.next();
    node.discriminant = this.parseParenExpression();
    node.cases = [];
    this.expect(types$1.braceL);
    this.labels.push(switchLabel);
    this.enterScope(0);
    var cur;
    for (var sawDefault = false; this.type !== types$1.braceR; ) {
      if (this.type === types$1._case || this.type === types$1._default) {
        var isCase = this.type === types$1._case;
        if (cur) {
          this.finishNode(cur, "SwitchCase");
        }
        node.cases.push(cur = this.startNode());
        cur.consequent = [];
        this.next();
        if (isCase) {
          cur.test = this.parseExpression();
        } else {
          if (sawDefault) {
            this.raiseRecoverable(this.lastTokStart, "Multiple default clauses");
          }
          sawDefault = true;
          cur.test = null;
        }
        this.expect(types$1.colon);
      } else {
        if (!cur) {
          this.unexpected();
        }
        cur.consequent.push(this.parseStatement(null));
      }
    }
    this.exitScope();
    if (cur) {
      this.finishNode(cur, "SwitchCase");
    }
    this.next();
    this.labels.pop();
    return this.finishNode(node, "SwitchStatement");
  };
  pp$8.parseThrowStatement = function(node) {
    this.next();
    if (lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) {
      this.raise(this.lastTokEnd, "Illegal newline after throw");
    }
    node.argument = this.parseExpression();
    this.semicolon();
    return this.finishNode(node, "ThrowStatement");
  };
  var empty$1 = [];
  pp$8.parseCatchClauseParam = function() {
    var param = this.parseBindingAtom();
    var simple = param.type === "Identifier";
    this.enterScope(simple ? SCOPE_SIMPLE_CATCH : 0);
    this.checkLValPattern(param, simple ? BIND_SIMPLE_CATCH : BIND_LEXICAL);
    this.expect(types$1.parenR);
    return param;
  };
  pp$8.parseTryStatement = function(node) {
    this.next();
    node.block = this.parseBlock();
    node.handler = null;
    if (this.type === types$1._catch) {
      var clause = this.startNode();
      this.next();
      if (this.eat(types$1.parenL)) {
        clause.param = this.parseCatchClauseParam();
      } else {
        if (this.options.ecmaVersion < 10) {
          this.unexpected();
        }
        clause.param = null;
        this.enterScope(0);
      }
      clause.body = this.parseBlock(false);
      this.exitScope();
      node.handler = this.finishNode(clause, "CatchClause");
    }
    node.finalizer = this.eat(types$1._finally) ? this.parseBlock() : null;
    if (!node.handler && !node.finalizer) {
      this.raise(node.start, "Missing catch or finally clause");
    }
    return this.finishNode(node, "TryStatement");
  };
  pp$8.parseVarStatement = function(node, kind, allowMissingInitializer) {
    this.next();
    this.parseVar(node, false, kind, allowMissingInitializer);
    this.semicolon();
    return this.finishNode(node, "VariableDeclaration");
  };
  pp$8.parseWhileStatement = function(node) {
    this.next();
    node.test = this.parseParenExpression();
    this.labels.push(loopLabel);
    node.body = this.parseStatement("while");
    this.labels.pop();
    return this.finishNode(node, "WhileStatement");
  };
  pp$8.parseWithStatement = function(node) {
    if (this.strict) {
      this.raise(this.start, "'with' in strict mode");
    }
    this.next();
    node.object = this.parseParenExpression();
    node.body = this.parseStatement("with");
    return this.finishNode(node, "WithStatement");
  };
  pp$8.parseEmptyStatement = function(node) {
    this.next();
    return this.finishNode(node, "EmptyStatement");
  };
  pp$8.parseLabeledStatement = function(node, maybeName, expr, context) {
    for (var i$1 = 0, list2 = this.labels; i$1 < list2.length; i$1 += 1) {
      var label2 = list2[i$1];
      if (label2.name === maybeName) {
        this.raise(expr.start, "Label '" + maybeName + "' is already declared");
      }
    }
    var kind = this.type.isLoop ? "loop" : this.type === types$1._switch ? "switch" : null;
    for (var i2 = this.labels.length - 1; i2 >= 0; i2--) {
      var label$1 = this.labels[i2];
      if (label$1.statementStart === node.start) {
        label$1.statementStart = this.start;
        label$1.kind = kind;
      } else {
        break;
      }
    }
    this.labels.push({ name: maybeName, kind, statementStart: this.start });
    node.body = this.parseStatement(context ? context.indexOf("label") === -1 ? context + "label" : context : "label");
    this.labels.pop();
    node.label = expr;
    return this.finishNode(node, "LabeledStatement");
  };
  pp$8.parseExpressionStatement = function(node, expr) {
    node.expression = expr;
    this.semicolon();
    return this.finishNode(node, "ExpressionStatement");
  };
  pp$8.parseBlock = function(createNewLexicalScope, node, exitStrict) {
    if (createNewLexicalScope === void 0) createNewLexicalScope = true;
    if (node === void 0) node = this.startNode();
    node.body = [];
    this.expect(types$1.braceL);
    if (createNewLexicalScope) {
      this.enterScope(0);
    }
    while (this.type !== types$1.braceR) {
      var stmt = this.parseStatement(null);
      node.body.push(stmt);
    }
    if (exitStrict) {
      this.strict = false;
    }
    this.next();
    if (createNewLexicalScope) {
      this.exitScope();
    }
    return this.finishNode(node, "BlockStatement");
  };
  pp$8.parseFor = function(node, init) {
    node.init = init;
    this.expect(types$1.semi);
    node.test = this.type === types$1.semi ? null : this.parseExpression();
    this.expect(types$1.semi);
    node.update = this.type === types$1.parenR ? null : this.parseExpression();
    this.expect(types$1.parenR);
    node.body = this.parseStatement("for");
    this.exitScope();
    this.labels.pop();
    return this.finishNode(node, "ForStatement");
  };
  pp$8.parseForIn = function(node, init) {
    var isForIn = this.type === types$1._in;
    this.next();
    if (init.type === "VariableDeclaration" && init.declarations[0].init != null && (!isForIn || this.options.ecmaVersion < 8 || this.strict || init.kind !== "var" || init.declarations[0].id.type !== "Identifier")) {
      this.raise(
        init.start,
        (isForIn ? "for-in" : "for-of") + " loop variable declaration may not have an initializer"
      );
    }
    node.left = init;
    node.right = isForIn ? this.parseExpression() : this.parseMaybeAssign();
    this.expect(types$1.parenR);
    node.body = this.parseStatement("for");
    this.exitScope();
    this.labels.pop();
    return this.finishNode(node, isForIn ? "ForInStatement" : "ForOfStatement");
  };
  pp$8.parseVar = function(node, isFor, kind, allowMissingInitializer) {
    node.declarations = [];
    node.kind = kind;
    for (; ; ) {
      var decl = this.startNode();
      this.parseVarId(decl, kind);
      if (this.eat(types$1.eq)) {
        decl.init = this.parseMaybeAssign(isFor);
      } else if (!allowMissingInitializer && kind === "const" && !(this.type === types$1._in || this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
        this.unexpected();
      } else if (!allowMissingInitializer && (kind === "using" || kind === "await using") && this.options.ecmaVersion >= 17 && this.type !== types$1._in && !this.isContextual("of")) {
        this.raise(this.lastTokEnd, "Missing initializer in " + kind + " declaration");
      } else if (!allowMissingInitializer && decl.id.type !== "Identifier" && !(isFor && (this.type === types$1._in || this.isContextual("of")))) {
        this.raise(this.lastTokEnd, "Complex binding patterns require an initialization value");
      } else {
        decl.init = null;
      }
      node.declarations.push(this.finishNode(decl, "VariableDeclarator"));
      if (!this.eat(types$1.comma)) {
        break;
      }
    }
    return node;
  };
  pp$8.parseVarId = function(decl, kind) {
    decl.id = kind === "using" || kind === "await using" ? this.parseIdent() : this.parseBindingAtom();
    this.checkLValPattern(decl.id, kind === "var" ? BIND_VAR : BIND_LEXICAL, false);
  };
  var FUNC_STATEMENT = 1;
  var FUNC_HANGING_STATEMENT = 2;
  var FUNC_NULLABLE_ID = 4;
  pp$8.parseFunction = function(node, statement, allowExpressionBody, isAsync, forInit) {
    this.initFunction(node);
    if (this.options.ecmaVersion >= 9 || this.options.ecmaVersion >= 6 && !isAsync) {
      if (this.type === types$1.star && statement & FUNC_HANGING_STATEMENT) {
        this.unexpected();
      }
      node.generator = this.eat(types$1.star);
    }
    if (this.options.ecmaVersion >= 8) {
      node.async = !!isAsync;
    }
    if (statement & FUNC_STATEMENT) {
      node.id = statement & FUNC_NULLABLE_ID && this.type !== types$1.name ? null : this.parseIdent();
      if (node.id && !(statement & FUNC_HANGING_STATEMENT)) {
        this.checkLValSimple(node.id, this.strict || node.generator || node.async ? this.treatFunctionsAsVar ? BIND_VAR : BIND_LEXICAL : BIND_FUNCTION);
      }
    }
    var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    this.enterScope(functionFlags(node.async, node.generator));
    if (!(statement & FUNC_STATEMENT)) {
      node.id = this.type === types$1.name ? this.parseIdent() : null;
    }
    this.parseFunctionParams(node);
    this.parseFunctionBody(node, allowExpressionBody, false, forInit);
    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, statement & FUNC_STATEMENT ? "FunctionDeclaration" : "FunctionExpression");
  };
  pp$8.parseFunctionParams = function(node) {
    this.expect(types$1.parenL);
    node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
    this.checkYieldAwaitInDefaultParams();
  };
  pp$8.parseClass = function(node, isStatement) {
    this.next();
    var oldStrict = this.strict;
    this.strict = true;
    this.parseClassId(node, isStatement);
    this.parseClassSuper(node);
    var privateNameMap = this.enterClassBody();
    var classBody = this.startNode();
    var hadConstructor = false;
    classBody.body = [];
    this.expect(types$1.braceL);
    while (this.type !== types$1.braceR) {
      var element = this.parseClassElement(node.superClass !== null);
      if (element) {
        classBody.body.push(element);
        if (element.type === "MethodDefinition" && element.kind === "constructor") {
          if (hadConstructor) {
            this.raiseRecoverable(element.start, "Duplicate constructor in the same class");
          }
          hadConstructor = true;
        } else if (element.key && element.key.type === "PrivateIdentifier" && isPrivateNameConflicted(privateNameMap, element)) {
          this.raiseRecoverable(element.key.start, "Identifier '#" + element.key.name + "' has already been declared");
        }
      }
    }
    this.strict = oldStrict;
    this.next();
    node.body = this.finishNode(classBody, "ClassBody");
    this.exitClassBody();
    return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression");
  };
  pp$8.parseClassElement = function(constructorAllowsSuper) {
    if (this.eat(types$1.semi)) {
      return null;
    }
    var ecmaVersion2 = this.options.ecmaVersion;
    var node = this.startNode();
    var keyName = "";
    var isGenerator = false;
    var isAsync = false;
    var kind = "method";
    var isStatic = false;
    if (this.eatContextual("static")) {
      if (ecmaVersion2 >= 13 && this.eat(types$1.braceL)) {
        this.parseClassStaticBlock(node);
        return node;
      }
      if (this.isClassElementNameStart() || this.type === types$1.star) {
        isStatic = true;
      } else {
        keyName = "static";
      }
    }
    node.static = isStatic;
    if (!keyName && ecmaVersion2 >= 8 && this.eatContextual("async")) {
      if ((this.isClassElementNameStart() || this.type === types$1.star) && !this.canInsertSemicolon()) {
        isAsync = true;
      } else {
        keyName = "async";
      }
    }
    if (!keyName && (ecmaVersion2 >= 9 || !isAsync) && this.eat(types$1.star)) {
      isGenerator = true;
    }
    if (!keyName && !isAsync && !isGenerator) {
      var lastValue = this.value;
      if (this.eatContextual("get") || this.eatContextual("set")) {
        if (this.isClassElementNameStart()) {
          kind = lastValue;
        } else {
          keyName = lastValue;
        }
      }
    }
    if (keyName) {
      node.computed = false;
      node.key = this.startNodeAt(this.lastTokStart, this.lastTokStartLoc);
      node.key.name = keyName;
      this.finishNode(node.key, "Identifier");
    } else {
      this.parseClassElementName(node);
    }
    if (ecmaVersion2 < 13 || this.type === types$1.parenL || kind !== "method" || isGenerator || isAsync) {
      var isConstructor = !node.static && checkKeyName(node, "constructor");
      var allowsDirectSuper = isConstructor && constructorAllowsSuper;
      if (isConstructor && kind !== "method") {
        this.raise(node.key.start, "Constructor can't have get/set modifier");
      }
      node.kind = isConstructor ? "constructor" : kind;
      this.parseClassMethod(node, isGenerator, isAsync, allowsDirectSuper);
    } else {
      this.parseClassField(node);
    }
    return node;
  };
  pp$8.isClassElementNameStart = function() {
    return this.type === types$1.name || this.type === types$1.privateId || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword;
  };
  pp$8.parseClassElementName = function(element) {
    if (this.type === types$1.privateId) {
      if (this.value === "constructor") {
        this.raise(this.start, "Classes can't have an element named '#constructor'");
      }
      element.computed = false;
      element.key = this.parsePrivateIdent();
    } else {
      this.parsePropertyName(element);
    }
  };
  pp$8.parseClassMethod = function(method, isGenerator, isAsync, allowsDirectSuper) {
    var key = method.key;
    if (method.kind === "constructor") {
      if (isGenerator) {
        this.raise(key.start, "Constructor can't be a generator");
      }
      if (isAsync) {
        this.raise(key.start, "Constructor can't be an async method");
      }
    } else if (method.static && checkKeyName(method, "prototype")) {
      this.raise(key.start, "Classes may not have a static property named prototype");
    }
    var value = method.value = this.parseMethod(isGenerator, isAsync, allowsDirectSuper);
    if (method.kind === "get" && value.params.length !== 0) {
      this.raiseRecoverable(value.start, "getter should have no params");
    }
    if (method.kind === "set" && value.params.length !== 1) {
      this.raiseRecoverable(value.start, "setter should have exactly one param");
    }
    if (method.kind === "set" && value.params[0].type === "RestElement") {
      this.raiseRecoverable(value.params[0].start, "Setter cannot use rest params");
    }
    return this.finishNode(method, "MethodDefinition");
  };
  pp$8.parseClassField = function(field2) {
    if (checkKeyName(field2, "constructor")) {
      this.raise(field2.key.start, "Classes can't have a field named 'constructor'");
    } else if (field2.static && checkKeyName(field2, "prototype")) {
      this.raise(field2.key.start, "Classes can't have a static field named 'prototype'");
    }
    if (this.eat(types$1.eq)) {
      this.enterScope(SCOPE_CLASS_FIELD_INIT | SCOPE_SUPER);
      field2.value = this.parseMaybeAssign();
      this.exitScope();
    } else {
      field2.value = null;
    }
    this.semicolon();
    return this.finishNode(field2, "PropertyDefinition");
  };
  pp$8.parseClassStaticBlock = function(node) {
    node.body = [];
    var oldLabels = this.labels;
    this.labels = [];
    this.enterScope(SCOPE_CLASS_STATIC_BLOCK | SCOPE_SUPER);
    while (this.type !== types$1.braceR) {
      var stmt = this.parseStatement(null);
      node.body.push(stmt);
    }
    this.next();
    this.exitScope();
    this.labels = oldLabels;
    return this.finishNode(node, "StaticBlock");
  };
  pp$8.parseClassId = function(node, isStatement) {
    if (this.type === types$1.name) {
      node.id = this.parseIdent();
      if (isStatement) {
        this.checkLValSimple(node.id, BIND_LEXICAL, false);
      }
    } else {
      if (isStatement === true) {
        this.unexpected();
      }
      node.id = null;
    }
  };
  pp$8.parseClassSuper = function(node) {
    node.superClass = this.eat(types$1._extends) ? this.parseExprSubscripts(null, false) : null;
  };
  pp$8.enterClassBody = function() {
    var element = { declared: /* @__PURE__ */ Object.create(null), used: [] };
    this.privateNameStack.push(element);
    return element.declared;
  };
  pp$8.exitClassBody = function() {
    var ref2 = this.privateNameStack.pop();
    var declared = ref2.declared;
    var used = ref2.used;
    if (!this.options.checkPrivateFields) {
      return;
    }
    var len = this.privateNameStack.length;
    var parent = len === 0 ? null : this.privateNameStack[len - 1];
    for (var i2 = 0; i2 < used.length; ++i2) {
      var id = used[i2];
      if (!hasOwn(declared, id.name)) {
        if (parent) {
          parent.used.push(id);
        } else {
          this.raiseRecoverable(id.start, "Private field '#" + id.name + "' must be declared in an enclosing class");
        }
      }
    }
  };
  function isPrivateNameConflicted(privateNameMap, element) {
    var name3 = element.key.name;
    var curr = privateNameMap[name3];
    var next = "true";
    if (element.type === "MethodDefinition" && (element.kind === "get" || element.kind === "set")) {
      next = (element.static ? "s" : "i") + element.kind;
    }
    if (curr === "iget" && next === "iset" || curr === "iset" && next === "iget" || curr === "sget" && next === "sset" || curr === "sset" && next === "sget") {
      privateNameMap[name3] = "true";
      return false;
    } else if (!curr) {
      privateNameMap[name3] = next;
      return false;
    } else {
      return true;
    }
  }
  function checkKeyName(node, name3) {
    var computed = node.computed;
    var key = node.key;
    return !computed && (key.type === "Identifier" && key.name === name3 || key.type === "Literal" && key.value === name3);
  }
  pp$8.parseExportAllDeclaration = function(node, exports) {
    if (this.options.ecmaVersion >= 11) {
      if (this.eatContextual("as")) {
        node.exported = this.parseModuleExportName();
        this.checkExport(exports, node.exported, this.lastTokStart);
      } else {
        node.exported = null;
      }
    }
    this.expectContextual("from");
    if (this.type !== types$1.string) {
      this.unexpected();
    }
    node.source = this.parseExprAtom();
    if (this.options.ecmaVersion >= 16) {
      node.attributes = this.parseWithClause();
    }
    this.semicolon();
    return this.finishNode(node, "ExportAllDeclaration");
  };
  pp$8.parseExport = function(node, exports) {
    this.next();
    if (this.eat(types$1.star)) {
      return this.parseExportAllDeclaration(node, exports);
    }
    if (this.eat(types$1._default)) {
      this.checkExport(exports, "default", this.lastTokStart);
      node.declaration = this.parseExportDefaultDeclaration();
      return this.finishNode(node, "ExportDefaultDeclaration");
    }
    if (this.shouldParseExportStatement()) {
      node.declaration = this.parseExportDeclaration(node);
      if (node.declaration.type === "VariableDeclaration") {
        this.checkVariableExport(exports, node.declaration.declarations);
      } else {
        this.checkExport(exports, node.declaration.id, node.declaration.id.start);
      }
      node.specifiers = [];
      node.source = null;
      if (this.options.ecmaVersion >= 16) {
        node.attributes = [];
      }
    } else {
      node.declaration = null;
      node.specifiers = this.parseExportSpecifiers(exports);
      if (this.eatContextual("from")) {
        if (this.type !== types$1.string) {
          this.unexpected();
        }
        node.source = this.parseExprAtom();
        if (this.options.ecmaVersion >= 16) {
          node.attributes = this.parseWithClause();
        }
      } else {
        for (var i2 = 0, list2 = node.specifiers; i2 < list2.length; i2 += 1) {
          var spec = list2[i2];
          this.checkUnreserved(spec.local);
          this.checkLocalExport(spec.local);
          if (spec.local.type === "Literal") {
            this.raise(spec.local.start, "A string literal cannot be used as an exported binding without `from`.");
          }
        }
        node.source = null;
        if (this.options.ecmaVersion >= 16) {
          node.attributes = [];
        }
      }
      this.semicolon();
    }
    return this.finishNode(node, "ExportNamedDeclaration");
  };
  pp$8.parseExportDeclaration = function(node) {
    return this.parseStatement(null);
  };
  pp$8.parseExportDefaultDeclaration = function() {
    var isAsync;
    if (this.type === types$1._function || (isAsync = this.isAsyncFunction())) {
      var fNode = this.startNode();
      this.next();
      if (isAsync) {
        this.next();
      }
      return this.parseFunction(fNode, FUNC_STATEMENT | FUNC_NULLABLE_ID, false, isAsync);
    } else if (this.type === types$1._class) {
      var cNode = this.startNode();
      return this.parseClass(cNode, "nullableID");
    } else {
      var declaration = this.parseMaybeAssign();
      this.semicolon();
      return declaration;
    }
  };
  pp$8.checkExport = function(exports, name3, pos) {
    if (!exports) {
      return;
    }
    if (typeof name3 !== "string") {
      name3 = name3.type === "Identifier" ? name3.name : name3.value;
    }
    if (hasOwn(exports, name3)) {
      this.raiseRecoverable(pos, "Duplicate export '" + name3 + "'");
    }
    exports[name3] = true;
  };
  pp$8.checkPatternExport = function(exports, pat) {
    var type = pat.type;
    if (type === "Identifier") {
      this.checkExport(exports, pat, pat.start);
    } else if (type === "ObjectPattern") {
      for (var i2 = 0, list2 = pat.properties; i2 < list2.length; i2 += 1) {
        var prop = list2[i2];
        this.checkPatternExport(exports, prop);
      }
    } else if (type === "ArrayPattern") {
      for (var i$1 = 0, list$1 = pat.elements; i$1 < list$1.length; i$1 += 1) {
        var elt = list$1[i$1];
        if (elt) {
          this.checkPatternExport(exports, elt);
        }
      }
    } else if (type === "Property") {
      this.checkPatternExport(exports, pat.value);
    } else if (type === "AssignmentPattern") {
      this.checkPatternExport(exports, pat.left);
    } else if (type === "RestElement") {
      this.checkPatternExport(exports, pat.argument);
    }
  };
  pp$8.checkVariableExport = function(exports, decls) {
    if (!exports) {
      return;
    }
    for (var i2 = 0, list2 = decls; i2 < list2.length; i2 += 1) {
      var decl = list2[i2];
      this.checkPatternExport(exports, decl.id);
    }
  };
  pp$8.shouldParseExportStatement = function() {
    return this.type.keyword === "var" || this.type.keyword === "const" || this.type.keyword === "class" || this.type.keyword === "function" || this.isLet() || this.isAsyncFunction();
  };
  pp$8.parseExportSpecifier = function(exports) {
    var node = this.startNode();
    node.local = this.parseModuleExportName();
    node.exported = this.eatContextual("as") ? this.parseModuleExportName() : node.local;
    this.checkExport(
      exports,
      node.exported,
      node.exported.start
    );
    return this.finishNode(node, "ExportSpecifier");
  };
  pp$8.parseExportSpecifiers = function(exports) {
    var nodes = [], first = true;
    this.expect(types$1.braceL);
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.afterTrailingComma(types$1.braceR)) {
          break;
        }
      } else {
        first = false;
      }
      nodes.push(this.parseExportSpecifier(exports));
    }
    return nodes;
  };
  pp$8.parseImport = function(node) {
    this.next();
    if (this.type === types$1.string) {
      node.specifiers = empty$1;
      node.source = this.parseExprAtom();
    } else {
      node.specifiers = this.parseImportSpecifiers();
      this.expectContextual("from");
      node.source = this.type === types$1.string ? this.parseExprAtom() : this.unexpected();
    }
    if (this.options.ecmaVersion >= 16) {
      node.attributes = this.parseWithClause();
    }
    this.semicolon();
    return this.finishNode(node, "ImportDeclaration");
  };
  pp$8.parseImportSpecifier = function() {
    var node = this.startNode();
    node.imported = this.parseModuleExportName();
    if (this.eatContextual("as")) {
      node.local = this.parseIdent();
    } else {
      this.checkUnreserved(node.imported);
      node.local = node.imported;
    }
    this.checkLValSimple(node.local, BIND_LEXICAL);
    return this.finishNode(node, "ImportSpecifier");
  };
  pp$8.parseImportDefaultSpecifier = function() {
    var node = this.startNode();
    node.local = this.parseIdent();
    this.checkLValSimple(node.local, BIND_LEXICAL);
    return this.finishNode(node, "ImportDefaultSpecifier");
  };
  pp$8.parseImportNamespaceSpecifier = function() {
    var node = this.startNode();
    this.next();
    this.expectContextual("as");
    node.local = this.parseIdent();
    this.checkLValSimple(node.local, BIND_LEXICAL);
    return this.finishNode(node, "ImportNamespaceSpecifier");
  };
  pp$8.parseImportSpecifiers = function() {
    var nodes = [], first = true;
    if (this.type === types$1.name) {
      nodes.push(this.parseImportDefaultSpecifier());
      if (!this.eat(types$1.comma)) {
        return nodes;
      }
    }
    if (this.type === types$1.star) {
      nodes.push(this.parseImportNamespaceSpecifier());
      return nodes;
    }
    this.expect(types$1.braceL);
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.afterTrailingComma(types$1.braceR)) {
          break;
        }
      } else {
        first = false;
      }
      nodes.push(this.parseImportSpecifier());
    }
    return nodes;
  };
  pp$8.parseWithClause = function() {
    var nodes = [];
    if (!this.eat(types$1._with)) {
      return nodes;
    }
    this.expect(types$1.braceL);
    var attributeKeys = {};
    var first = true;
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.afterTrailingComma(types$1.braceR)) {
          break;
        }
      } else {
        first = false;
      }
      var attr = this.parseImportAttribute();
      var keyName = attr.key.type === "Identifier" ? attr.key.name : attr.key.value;
      if (hasOwn(attributeKeys, keyName)) {
        this.raiseRecoverable(attr.key.start, "Duplicate attribute key '" + keyName + "'");
      }
      attributeKeys[keyName] = true;
      nodes.push(attr);
    }
    return nodes;
  };
  pp$8.parseImportAttribute = function() {
    var node = this.startNode();
    node.key = this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
    this.expect(types$1.colon);
    if (this.type !== types$1.string) {
      this.unexpected();
    }
    node.value = this.parseExprAtom();
    return this.finishNode(node, "ImportAttribute");
  };
  pp$8.parseModuleExportName = function() {
    if (this.options.ecmaVersion >= 13 && this.type === types$1.string) {
      var stringLiteral = this.parseLiteral(this.value);
      if (loneSurrogate.test(stringLiteral.value)) {
        this.raise(stringLiteral.start, "An export name cannot include a lone surrogate.");
      }
      return stringLiteral;
    }
    return this.parseIdent(true);
  };
  pp$8.adaptDirectivePrologue = function(statements2) {
    for (var i2 = 0; i2 < statements2.length && this.isDirectiveCandidate(statements2[i2]); ++i2) {
      statements2[i2].directive = statements2[i2].expression.raw.slice(1, -1);
    }
  };
  pp$8.isDirectiveCandidate = function(statement) {
    return this.options.ecmaVersion >= 5 && statement.type === "ExpressionStatement" && statement.expression.type === "Literal" && typeof statement.expression.value === "string" && // Reject parenthesized strings.
    (this.input[statement.start] === '"' || this.input[statement.start] === "'");
  };
  var pp$7 = Parser.prototype;
  pp$7.toAssignable = function(node, isBinding, refDestructuringErrors) {
    if (this.options.ecmaVersion >= 6 && node) {
      switch (node.type) {
        case "Identifier":
          if (this.inAsync && node.name === "await") {
            this.raise(node.start, "Cannot use 'await' as identifier inside an async function");
          }
          break;
        case "ObjectPattern":
        case "ArrayPattern":
        case "AssignmentPattern":
        case "RestElement":
          break;
        case "ObjectExpression":
          node.type = "ObjectPattern";
          if (refDestructuringErrors) {
            this.checkPatternErrors(refDestructuringErrors, true);
          }
          for (var i2 = 0, list2 = node.properties; i2 < list2.length; i2 += 1) {
            var prop = list2[i2];
            this.toAssignable(prop, isBinding);
            if (prop.type === "RestElement" && (prop.argument.type === "ArrayPattern" || prop.argument.type === "ObjectPattern")) {
              this.raise(prop.argument.start, "Unexpected token");
            }
          }
          break;
        case "Property":
          if (node.kind !== "init") {
            this.raise(node.key.start, "Object pattern can't contain getter or setter");
          }
          this.toAssignable(node.value, isBinding);
          break;
        case "ArrayExpression":
          node.type = "ArrayPattern";
          if (refDestructuringErrors) {
            this.checkPatternErrors(refDestructuringErrors, true);
          }
          this.toAssignableList(node.elements, isBinding);
          break;
        case "SpreadElement":
          node.type = "RestElement";
          this.toAssignable(node.argument, isBinding);
          if (node.argument.type === "AssignmentPattern") {
            this.raise(node.argument.start, "Rest elements cannot have a default value");
          }
          break;
        case "AssignmentExpression":
          if (node.operator !== "=") {
            this.raise(node.left.end, "Only '=' operator can be used for specifying default value.");
          }
          node.type = "AssignmentPattern";
          delete node.operator;
          this.toAssignable(node.left, isBinding);
          break;
        case "ParenthesizedExpression":
          this.toAssignable(node.expression, isBinding, refDestructuringErrors);
          break;
        case "ChainExpression":
          this.raiseRecoverable(node.start, "Optional chaining cannot appear in left-hand side");
          break;
        case "MemberExpression":
          if (!isBinding) {
            break;
          }
        default:
          this.raise(node.start, "Assigning to rvalue");
      }
    } else if (refDestructuringErrors) {
      this.checkPatternErrors(refDestructuringErrors, true);
    }
    return node;
  };
  pp$7.toAssignableList = function(exprList, isBinding) {
    var end = exprList.length;
    for (var i2 = 0; i2 < end; i2++) {
      var elt = exprList[i2];
      if (elt) {
        this.toAssignable(elt, isBinding);
      }
    }
    if (end) {
      var last = exprList[end - 1];
      if (this.options.ecmaVersion === 6 && isBinding && last && last.type === "RestElement" && last.argument.type !== "Identifier") {
        this.unexpected(last.argument.start);
      }
    }
    return exprList;
  };
  pp$7.parseSpread = function(refDestructuringErrors) {
    var node = this.startNode();
    this.next();
    node.argument = this.parseMaybeAssign(false, refDestructuringErrors);
    return this.finishNode(node, "SpreadElement");
  };
  pp$7.parseRestBinding = function() {
    var node = this.startNode();
    this.next();
    if (this.options.ecmaVersion === 6 && this.type !== types$1.name) {
      this.unexpected();
    }
    node.argument = this.parseBindingAtom();
    return this.finishNode(node, "RestElement");
  };
  pp$7.parseBindingAtom = function() {
    if (this.options.ecmaVersion >= 6) {
      switch (this.type) {
        case types$1.bracketL:
          var node = this.startNode();
          this.next();
          node.elements = this.parseBindingList(types$1.bracketR, true, true);
          return this.finishNode(node, "ArrayPattern");
        case types$1.braceL:
          return this.parseObj(true);
      }
    }
    return this.parseIdent();
  };
  pp$7.parseBindingList = function(close, allowEmpty, allowTrailingComma, allowModifiers) {
    var elts = [], first = true;
    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect(types$1.comma);
      }
      if (allowEmpty && this.type === types$1.comma) {
        elts.push(null);
      } else if (allowTrailingComma && this.afterTrailingComma(close)) {
        break;
      } else if (this.type === types$1.ellipsis) {
        var rest = this.parseRestBinding();
        this.parseBindingListItem(rest);
        elts.push(rest);
        if (this.type === types$1.comma) {
          this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
        }
        this.expect(close);
        break;
      } else {
        elts.push(this.parseAssignableListItem(allowModifiers));
      }
    }
    return elts;
  };
  pp$7.parseAssignableListItem = function(allowModifiers) {
    var elem = this.parseMaybeDefault(this.start, this.startLoc);
    this.parseBindingListItem(elem);
    return elem;
  };
  pp$7.parseBindingListItem = function(param) {
    return param;
  };
  pp$7.parseMaybeDefault = function(startPos, startLoc, left) {
    left = left || this.parseBindingAtom();
    if (this.options.ecmaVersion < 6 || !this.eat(types$1.eq)) {
      return left;
    }
    var node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.right = this.parseMaybeAssign();
    return this.finishNode(node, "AssignmentPattern");
  };
  pp$7.checkLValSimple = function(expr, bindingType, checkClashes) {
    if (bindingType === void 0) bindingType = BIND_NONE;
    var isBind = bindingType !== BIND_NONE;
    switch (expr.type) {
      case "Identifier":
        if (this.strict && this.reservedWordsStrictBind.test(expr.name)) {
          this.raiseRecoverable(expr.start, (isBind ? "Binding " : "Assigning to ") + expr.name + " in strict mode");
        }
        if (isBind) {
          if (bindingType === BIND_LEXICAL && expr.name === "let") {
            this.raiseRecoverable(expr.start, "let is disallowed as a lexically bound name");
          }
          if (checkClashes) {
            if (hasOwn(checkClashes, expr.name)) {
              this.raiseRecoverable(expr.start, "Argument name clash");
            }
            checkClashes[expr.name] = true;
          }
          if (bindingType !== BIND_OUTSIDE) {
            this.declareName(expr.name, bindingType, expr.start);
          }
        }
        break;
      case "ChainExpression":
        this.raiseRecoverable(expr.start, "Optional chaining cannot appear in left-hand side");
        break;
      case "MemberExpression":
        if (isBind) {
          this.raiseRecoverable(expr.start, "Binding member expression");
        }
        break;
      case "ParenthesizedExpression":
        if (isBind) {
          this.raiseRecoverable(expr.start, "Binding parenthesized expression");
        }
        return this.checkLValSimple(expr.expression, bindingType, checkClashes);
      default:
        this.raise(expr.start, (isBind ? "Binding" : "Assigning to") + " rvalue");
    }
  };
  pp$7.checkLValPattern = function(expr, bindingType, checkClashes) {
    if (bindingType === void 0) bindingType = BIND_NONE;
    switch (expr.type) {
      case "ObjectPattern":
        for (var i2 = 0, list2 = expr.properties; i2 < list2.length; i2 += 1) {
          var prop = list2[i2];
          this.checkLValInnerPattern(prop, bindingType, checkClashes);
        }
        break;
      case "ArrayPattern":
        for (var i$1 = 0, list$1 = expr.elements; i$1 < list$1.length; i$1 += 1) {
          var elem = list$1[i$1];
          if (elem) {
            this.checkLValInnerPattern(elem, bindingType, checkClashes);
          }
        }
        break;
      default:
        this.checkLValSimple(expr, bindingType, checkClashes);
    }
  };
  pp$7.checkLValInnerPattern = function(expr, bindingType, checkClashes) {
    if (bindingType === void 0) bindingType = BIND_NONE;
    switch (expr.type) {
      case "Property":
        this.checkLValInnerPattern(expr.value, bindingType, checkClashes);
        break;
      case "AssignmentPattern":
        this.checkLValPattern(expr.left, bindingType, checkClashes);
        break;
      case "RestElement":
        this.checkLValPattern(expr.argument, bindingType, checkClashes);
        break;
      default:
        this.checkLValPattern(expr, bindingType, checkClashes);
    }
  };
  var TokContext = function TokContext2(token, isExpr, preserveSpace, override, generator) {
    this.token = token;
    this.isExpr = !!isExpr;
    this.preserveSpace = !!preserveSpace;
    this.override = override;
    this.generator = !!generator;
  };
  var types = {
    b_stat: new TokContext("{", false),
    b_expr: new TokContext("{", true),
    b_tmpl: new TokContext("${", false),
    p_stat: new TokContext("(", false),
    p_expr: new TokContext("(", true),
    q_tmpl: new TokContext("`", true, true, function(p) {
      return p.tryReadTemplateToken();
    }),
    f_stat: new TokContext("function", false),
    f_expr: new TokContext("function", true),
    f_expr_gen: new TokContext("function", true, false, null, true),
    f_gen: new TokContext("function", false, false, null, true)
  };
  var pp$6 = Parser.prototype;
  pp$6.initialContext = function() {
    return [types.b_stat];
  };
  pp$6.curContext = function() {
    return this.context[this.context.length - 1];
  };
  pp$6.braceIsBlock = function(prevType) {
    var parent = this.curContext();
    if (parent === types.f_expr || parent === types.f_stat) {
      return true;
    }
    if (prevType === types$1.colon && (parent === types.b_stat || parent === types.b_expr)) {
      return !parent.isExpr;
    }
    if (prevType === types$1._return || prevType === types$1.name && this.exprAllowed) {
      return lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
    }
    if (prevType === types$1._else || prevType === types$1.semi || prevType === types$1.eof || prevType === types$1.parenR || prevType === types$1.arrow) {
      return true;
    }
    if (prevType === types$1.braceL) {
      return parent === types.b_stat;
    }
    if (prevType === types$1._var || prevType === types$1._const || prevType === types$1.name) {
      return false;
    }
    return !this.exprAllowed;
  };
  pp$6.inGeneratorContext = function() {
    for (var i2 = this.context.length - 1; i2 >= 1; i2--) {
      var context = this.context[i2];
      if (context.token === "function") {
        return context.generator;
      }
    }
    return false;
  };
  pp$6.updateContext = function(prevType) {
    var update, type = this.type;
    if (type.keyword && prevType === types$1.dot) {
      this.exprAllowed = false;
    } else if (update = type.updateContext) {
      update.call(this, prevType);
    } else {
      this.exprAllowed = type.beforeExpr;
    }
  };
  pp$6.overrideContext = function(tokenCtx) {
    if (this.curContext() !== tokenCtx) {
      this.context[this.context.length - 1] = tokenCtx;
    }
  };
  types$1.parenR.updateContext = types$1.braceR.updateContext = function() {
    if (this.context.length === 1) {
      this.exprAllowed = true;
      return;
    }
    var out = this.context.pop();
    if (out === types.b_stat && this.curContext().token === "function") {
      out = this.context.pop();
    }
    this.exprAllowed = !out.isExpr;
  };
  types$1.braceL.updateContext = function(prevType) {
    this.context.push(this.braceIsBlock(prevType) ? types.b_stat : types.b_expr);
    this.exprAllowed = true;
  };
  types$1.dollarBraceL.updateContext = function() {
    this.context.push(types.b_tmpl);
    this.exprAllowed = true;
  };
  types$1.parenL.updateContext = function(prevType) {
    var statementParens = prevType === types$1._if || prevType === types$1._for || prevType === types$1._with || prevType === types$1._while;
    this.context.push(statementParens ? types.p_stat : types.p_expr);
    this.exprAllowed = true;
  };
  types$1.incDec.updateContext = function() {
  };
  types$1._function.updateContext = types$1._class.updateContext = function(prevType) {
    if (prevType.beforeExpr && prevType !== types$1._else && !(prevType === types$1.semi && this.curContext() !== types.p_stat) && !(prevType === types$1._return && lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) && !((prevType === types$1.colon || prevType === types$1.braceL) && this.curContext() === types.b_stat)) {
      this.context.push(types.f_expr);
    } else {
      this.context.push(types.f_stat);
    }
    this.exprAllowed = false;
  };
  types$1.colon.updateContext = function() {
    if (this.curContext().token === "function") {
      this.context.pop();
    }
    this.exprAllowed = true;
  };
  types$1.backQuote.updateContext = function() {
    if (this.curContext() === types.q_tmpl) {
      this.context.pop();
    } else {
      this.context.push(types.q_tmpl);
    }
    this.exprAllowed = false;
  };
  types$1.star.updateContext = function(prevType) {
    if (prevType === types$1._function) {
      var index = this.context.length - 1;
      if (this.context[index] === types.f_expr) {
        this.context[index] = types.f_expr_gen;
      } else {
        this.context[index] = types.f_gen;
      }
    }
    this.exprAllowed = true;
  };
  types$1.name.updateContext = function(prevType) {
    var allowed = false;
    if (this.options.ecmaVersion >= 6 && prevType !== types$1.dot) {
      if (this.value === "of" && !this.exprAllowed || this.value === "yield" && this.inGeneratorContext()) {
        allowed = true;
      }
    }
    this.exprAllowed = allowed;
  };
  var pp$5 = Parser.prototype;
  pp$5.checkPropClash = function(prop, propHash, refDestructuringErrors) {
    if (this.options.ecmaVersion >= 9 && prop.type === "SpreadElement") {
      return;
    }
    if (this.options.ecmaVersion >= 6 && (prop.computed || prop.method || prop.shorthand)) {
      return;
    }
    var key = prop.key;
    var name3;
    switch (key.type) {
      case "Identifier":
        name3 = key.name;
        break;
      case "Literal":
        name3 = String(key.value);
        break;
      default:
        return;
    }
    var kind = prop.kind;
    if (this.options.ecmaVersion >= 6) {
      if (name3 === "__proto__" && kind === "init") {
        if (propHash.proto) {
          if (refDestructuringErrors) {
            if (refDestructuringErrors.doubleProto < 0) {
              refDestructuringErrors.doubleProto = key.start;
            }
          } else {
            this.raiseRecoverable(key.start, "Redefinition of __proto__ property");
          }
        }
        propHash.proto = true;
      }
      return;
    }
    name3 = "$" + name3;
    var other = propHash[name3];
    if (other) {
      var redefinition;
      if (kind === "init") {
        redefinition = this.strict && other.init || other.get || other.set;
      } else {
        redefinition = other.init || other[kind];
      }
      if (redefinition) {
        this.raiseRecoverable(key.start, "Redefinition of property");
      }
    } else {
      other = propHash[name3] = {
        init: false,
        get: false,
        set: false
      };
    }
    other[kind] = true;
  };
  pp$5.parseExpression = function(forInit, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseMaybeAssign(forInit, refDestructuringErrors);
    if (this.type === types$1.comma) {
      var node = this.startNodeAt(startPos, startLoc);
      node.expressions = [expr];
      while (this.eat(types$1.comma)) {
        node.expressions.push(this.parseMaybeAssign(forInit, refDestructuringErrors));
      }
      return this.finishNode(node, "SequenceExpression");
    }
    return expr;
  };
  pp$5.parseMaybeAssign = function(forInit, refDestructuringErrors, afterLeftParse) {
    if (this.isContextual("yield")) {
      if (this.inGenerator) {
        return this.parseYield(forInit);
      } else {
        this.exprAllowed = false;
      }
    }
    var ownDestructuringErrors = false, oldParenAssign = -1, oldTrailingComma = -1, oldDoubleProto = -1;
    if (refDestructuringErrors) {
      oldParenAssign = refDestructuringErrors.parenthesizedAssign;
      oldTrailingComma = refDestructuringErrors.trailingComma;
      oldDoubleProto = refDestructuringErrors.doubleProto;
      refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = -1;
    } else {
      refDestructuringErrors = new DestructuringErrors();
      ownDestructuringErrors = true;
    }
    var startPos = this.start, startLoc = this.startLoc;
    if (this.type === types$1.parenL || this.type === types$1.name) {
      this.potentialArrowAt = this.start;
      this.potentialArrowInForAwait = forInit === "await";
    }
    var left = this.parseMaybeConditional(forInit, refDestructuringErrors);
    if (afterLeftParse) {
      left = afterLeftParse.call(this, left, startPos, startLoc);
    }
    if (this.type.isAssign) {
      var node = this.startNodeAt(startPos, startLoc);
      node.operator = this.value;
      if (this.type === types$1.eq) {
        left = this.toAssignable(left, false, refDestructuringErrors);
      }
      if (!ownDestructuringErrors) {
        refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = refDestructuringErrors.doubleProto = -1;
      }
      if (refDestructuringErrors.shorthandAssign >= left.start) {
        refDestructuringErrors.shorthandAssign = -1;
      }
      if (this.type === types$1.eq) {
        this.checkLValPattern(left);
      } else {
        this.checkLValSimple(left);
      }
      node.left = left;
      this.next();
      node.right = this.parseMaybeAssign(forInit);
      if (oldDoubleProto > -1) {
        refDestructuringErrors.doubleProto = oldDoubleProto;
      }
      return this.finishNode(node, "AssignmentExpression");
    } else {
      if (ownDestructuringErrors) {
        this.checkExpressionErrors(refDestructuringErrors, true);
      }
    }
    if (oldParenAssign > -1) {
      refDestructuringErrors.parenthesizedAssign = oldParenAssign;
    }
    if (oldTrailingComma > -1) {
      refDestructuringErrors.trailingComma = oldTrailingComma;
    }
    return left;
  };
  pp$5.parseMaybeConditional = function(forInit, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseExprOps(forInit, refDestructuringErrors);
    if (this.checkExpressionErrors(refDestructuringErrors)) {
      return expr;
    }
    if (this.eat(types$1.question)) {
      var node = this.startNodeAt(startPos, startLoc);
      node.test = expr;
      node.consequent = this.parseMaybeAssign();
      this.expect(types$1.colon);
      node.alternate = this.parseMaybeAssign(forInit);
      return this.finishNode(node, "ConditionalExpression");
    }
    return expr;
  };
  pp$5.parseExprOps = function(forInit, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseMaybeUnary(refDestructuringErrors, false, false, forInit);
    if (this.checkExpressionErrors(refDestructuringErrors)) {
      return expr;
    }
    return expr.start === startPos && expr.type === "ArrowFunctionExpression" ? expr : this.parseExprOp(expr, startPos, startLoc, -1, forInit);
  };
  pp$5.parseExprOp = function(left, leftStartPos, leftStartLoc, minPrec, forInit) {
    var prec = this.type.binop;
    if (prec != null && (!forInit || this.type !== types$1._in)) {
      if (prec > minPrec) {
        var logical = this.type === types$1.logicalOR || this.type === types$1.logicalAND;
        var coalesce = this.type === types$1.coalesce;
        if (coalesce) {
          prec = types$1.logicalAND.binop;
        }
        var op = this.value;
        this.next();
        var startPos = this.start, startLoc = this.startLoc;
        var right = this.parseExprOp(this.parseMaybeUnary(null, false, false, forInit), startPos, startLoc, prec, forInit);
        var node = this.buildBinary(leftStartPos, leftStartLoc, left, right, op, logical || coalesce);
        if (logical && this.type === types$1.coalesce || coalesce && (this.type === types$1.logicalOR || this.type === types$1.logicalAND)) {
          this.raiseRecoverable(this.start, "Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses");
        }
        return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, forInit);
      }
    }
    return left;
  };
  pp$5.buildBinary = function(startPos, startLoc, left, right, op, logical) {
    if (right.type === "PrivateIdentifier") {
      this.raise(right.start, "Private identifier can only be left side of binary expression");
    }
    var node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.operator = op;
    node.right = right;
    return this.finishNode(node, logical ? "LogicalExpression" : "BinaryExpression");
  };
  pp$5.parseMaybeUnary = function(refDestructuringErrors, sawUnary, incDec, forInit) {
    var startPos = this.start, startLoc = this.startLoc, expr;
    if (this.isContextual("await") && this.canAwait) {
      expr = this.parseAwait(forInit);
      sawUnary = true;
    } else if (this.type.prefix) {
      var node = this.startNode(), update = this.type === types$1.incDec;
      node.operator = this.value;
      node.prefix = true;
      this.next();
      node.argument = this.parseMaybeUnary(null, true, update, forInit);
      this.checkExpressionErrors(refDestructuringErrors, true);
      if (update) {
        this.checkLValSimple(node.argument);
      } else if (this.strict && node.operator === "delete" && isLocalVariableAccess(node.argument)) {
        this.raiseRecoverable(node.start, "Deleting local variable in strict mode");
      } else if (node.operator === "delete" && isPrivateFieldAccess(node.argument)) {
        this.raiseRecoverable(node.start, "Private fields can not be deleted");
      } else {
        sawUnary = true;
      }
      expr = this.finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
    } else if (!sawUnary && this.type === types$1.privateId) {
      if ((forInit || this.privateNameStack.length === 0) && this.options.checkPrivateFields) {
        this.unexpected();
      }
      expr = this.parsePrivateIdent();
      if (this.type !== types$1._in) {
        this.unexpected();
      }
    } else {
      expr = this.parseExprSubscripts(refDestructuringErrors, forInit);
      if (this.checkExpressionErrors(refDestructuringErrors)) {
        return expr;
      }
      while (this.type.postfix && !this.canInsertSemicolon()) {
        var node$1 = this.startNodeAt(startPos, startLoc);
        node$1.operator = this.value;
        node$1.prefix = false;
        node$1.argument = expr;
        this.checkLValSimple(expr);
        this.next();
        expr = this.finishNode(node$1, "UpdateExpression");
      }
    }
    if (!incDec && this.eat(types$1.starstar)) {
      if (sawUnary) {
        this.unexpected(this.lastTokStart);
      } else {
        return this.buildBinary(startPos, startLoc, expr, this.parseMaybeUnary(null, false, false, forInit), "**", false);
      }
    } else {
      return expr;
    }
  };
  function isLocalVariableAccess(node) {
    return node.type === "Identifier" || node.type === "ParenthesizedExpression" && isLocalVariableAccess(node.expression);
  }
  function isPrivateFieldAccess(node) {
    return node.type === "MemberExpression" && node.property.type === "PrivateIdentifier" || node.type === "ChainExpression" && isPrivateFieldAccess(node.expression) || node.type === "ParenthesizedExpression" && isPrivateFieldAccess(node.expression);
  }
  pp$5.parseExprSubscripts = function(refDestructuringErrors, forInit) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseExprAtom(refDestructuringErrors, forInit);
    if (expr.type === "ArrowFunctionExpression" && this.input.slice(this.lastTokStart, this.lastTokEnd) !== ")") {
      return expr;
    }
    var result = this.parseSubscripts(expr, startPos, startLoc, false, forInit);
    if (refDestructuringErrors && result.type === "MemberExpression") {
      if (refDestructuringErrors.parenthesizedAssign >= result.start) {
        refDestructuringErrors.parenthesizedAssign = -1;
      }
      if (refDestructuringErrors.parenthesizedBind >= result.start) {
        refDestructuringErrors.parenthesizedBind = -1;
      }
      if (refDestructuringErrors.trailingComma >= result.start) {
        refDestructuringErrors.trailingComma = -1;
      }
    }
    return result;
  };
  pp$5.parseSubscripts = function(base, startPos, startLoc, noCalls, forInit) {
    var maybeAsyncArrow = this.options.ecmaVersion >= 8 && base.type === "Identifier" && base.name === "async" && this.lastTokEnd === base.end && !this.canInsertSemicolon() && base.end - base.start === 5 && this.potentialArrowAt === base.start;
    var optionalChained = false;
    while (true) {
      var element = this.parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit);
      if (element.optional) {
        optionalChained = true;
      }
      if (element === base || element.type === "ArrowFunctionExpression") {
        if (optionalChained) {
          var chainNode = this.startNodeAt(startPos, startLoc);
          chainNode.expression = element;
          element = this.finishNode(chainNode, "ChainExpression");
        }
        return element;
      }
      base = element;
    }
  };
  pp$5.shouldParseAsyncArrow = function() {
    return !this.canInsertSemicolon() && this.eat(types$1.arrow);
  };
  pp$5.parseSubscriptAsyncArrow = function(startPos, startLoc, exprList, forInit) {
    return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, true, forInit);
  };
  pp$5.parseSubscript = function(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit) {
    var optionalSupported = this.options.ecmaVersion >= 11;
    var optional = optionalSupported && this.eat(types$1.questionDot);
    if (noCalls && optional) {
      this.raise(this.lastTokStart, "Optional chaining cannot appear in the callee of new expressions");
    }
    var computed = this.eat(types$1.bracketL);
    if (computed || optional && this.type !== types$1.parenL && this.type !== types$1.backQuote || this.eat(types$1.dot)) {
      var node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      if (computed) {
        node.property = this.parseExpression();
        this.expect(types$1.bracketR);
      } else if (this.type === types$1.privateId && base.type !== "Super") {
        node.property = this.parsePrivateIdent();
      } else {
        node.property = this.parseIdent(this.options.allowReserved !== "never");
      }
      node.computed = !!computed;
      if (optionalSupported) {
        node.optional = optional;
      }
      base = this.finishNode(node, "MemberExpression");
    } else if (!noCalls && this.eat(types$1.parenL)) {
      var refDestructuringErrors = new DestructuringErrors(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
      this.yieldPos = 0;
      this.awaitPos = 0;
      this.awaitIdentPos = 0;
      var exprList = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false, refDestructuringErrors);
      if (maybeAsyncArrow && !optional && this.shouldParseAsyncArrow()) {
        this.checkPatternErrors(refDestructuringErrors, false);
        this.checkYieldAwaitInDefaultParams();
        if (this.awaitIdentPos > 0) {
          this.raise(this.awaitIdentPos, "Cannot use 'await' as identifier inside an async function");
        }
        this.yieldPos = oldYieldPos;
        this.awaitPos = oldAwaitPos;
        this.awaitIdentPos = oldAwaitIdentPos;
        return this.parseSubscriptAsyncArrow(startPos, startLoc, exprList, forInit);
      }
      this.checkExpressionErrors(refDestructuringErrors, true);
      this.yieldPos = oldYieldPos || this.yieldPos;
      this.awaitPos = oldAwaitPos || this.awaitPos;
      this.awaitIdentPos = oldAwaitIdentPos || this.awaitIdentPos;
      var node$1 = this.startNodeAt(startPos, startLoc);
      node$1.callee = base;
      node$1.arguments = exprList;
      if (optionalSupported) {
        node$1.optional = optional;
      }
      base = this.finishNode(node$1, "CallExpression");
    } else if (this.type === types$1.backQuote) {
      if (optional || optionalChained) {
        this.raise(this.start, "Optional chaining cannot appear in the tag of tagged template expressions");
      }
      var node$2 = this.startNodeAt(startPos, startLoc);
      node$2.tag = base;
      node$2.quasi = this.parseTemplate({ isTagged: true });
      base = this.finishNode(node$2, "TaggedTemplateExpression");
    }
    return base;
  };
  pp$5.parseExprAtom = function(refDestructuringErrors, forInit, forNew) {
    if (this.type === types$1.slash) {
      this.readRegexp();
    }
    var node, canBeArrow = this.potentialArrowAt === this.start;
    switch (this.type) {
      case types$1._super:
        if (!this.allowSuper) {
          this.raise(this.start, "'super' keyword outside a method");
        }
        node = this.startNode();
        this.next();
        if (this.type === types$1.parenL && !this.allowDirectSuper) {
          this.raise(node.start, "super() call outside constructor of a subclass");
        }
        if (this.type !== types$1.dot && this.type !== types$1.bracketL && this.type !== types$1.parenL) {
          this.unexpected();
        }
        return this.finishNode(node, "Super");
      case types$1._this:
        node = this.startNode();
        this.next();
        return this.finishNode(node, "ThisExpression");
      case types$1.name:
        var startPos = this.start, startLoc = this.startLoc, containsEsc = this.containsEsc;
        var id = this.parseIdent(false);
        if (this.options.ecmaVersion >= 8 && !containsEsc && id.name === "async" && !this.canInsertSemicolon() && this.eat(types$1._function)) {
          this.overrideContext(types.f_expr);
          return this.parseFunction(this.startNodeAt(startPos, startLoc), 0, false, true, forInit);
        }
        if (canBeArrow && !this.canInsertSemicolon()) {
          if (this.eat(types$1.arrow)) {
            return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], false, forInit);
          }
          if (this.options.ecmaVersion >= 8 && id.name === "async" && this.type === types$1.name && !containsEsc && (!this.potentialArrowInForAwait || this.value !== "of" || this.containsEsc)) {
            id = this.parseIdent(false);
            if (this.canInsertSemicolon() || !this.eat(types$1.arrow)) {
              this.unexpected();
            }
            return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], true, forInit);
          }
        }
        return id;
      case types$1.regexp:
        var value = this.value;
        node = this.parseLiteral(value.value);
        node.regex = { pattern: value.pattern, flags: value.flags };
        return node;
      case types$1.num:
      case types$1.string:
        return this.parseLiteral(this.value);
      case types$1._null:
      case types$1._true:
      case types$1._false:
        node = this.startNode();
        node.value = this.type === types$1._null ? null : this.type === types$1._true;
        node.raw = this.type.keyword;
        this.next();
        return this.finishNode(node, "Literal");
      case types$1.parenL:
        var start = this.start, expr = this.parseParenAndDistinguishExpression(canBeArrow, forInit);
        if (refDestructuringErrors) {
          if (refDestructuringErrors.parenthesizedAssign < 0 && !this.isSimpleAssignTarget(expr)) {
            refDestructuringErrors.parenthesizedAssign = start;
          }
          if (refDestructuringErrors.parenthesizedBind < 0) {
            refDestructuringErrors.parenthesizedBind = start;
          }
        }
        return expr;
      case types$1.bracketL:
        node = this.startNode();
        this.next();
        node.elements = this.parseExprList(types$1.bracketR, true, true, refDestructuringErrors);
        return this.finishNode(node, "ArrayExpression");
      case types$1.braceL:
        this.overrideContext(types.b_expr);
        return this.parseObj(false, refDestructuringErrors);
      case types$1._function:
        node = this.startNode();
        this.next();
        return this.parseFunction(node, 0);
      case types$1._class:
        return this.parseClass(this.startNode(), false);
      case types$1._new:
        return this.parseNew();
      case types$1.backQuote:
        return this.parseTemplate();
      case types$1._import:
        if (this.options.ecmaVersion >= 11) {
          return this.parseExprImport(forNew);
        } else {
          return this.unexpected();
        }
      default:
        return this.parseExprAtomDefault();
    }
  };
  pp$5.parseExprAtomDefault = function() {
    this.unexpected();
  };
  pp$5.parseExprImport = function(forNew) {
    var node = this.startNode();
    if (this.containsEsc) {
      this.raiseRecoverable(this.start, "Escape sequence in keyword import");
    }
    this.next();
    if (this.type === types$1.parenL && !forNew) {
      return this.parseDynamicImport(node);
    } else if (this.type === types$1.dot) {
      var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
      meta.name = "import";
      node.meta = this.finishNode(meta, "Identifier");
      return this.parseImportMeta(node);
    } else {
      this.unexpected();
    }
  };
  pp$5.parseDynamicImport = function(node) {
    this.next();
    node.source = this.parseMaybeAssign();
    if (this.options.ecmaVersion >= 16) {
      if (!this.eat(types$1.parenR)) {
        this.expect(types$1.comma);
        if (!this.afterTrailingComma(types$1.parenR)) {
          node.options = this.parseMaybeAssign();
          if (!this.eat(types$1.parenR)) {
            this.expect(types$1.comma);
            if (!this.afterTrailingComma(types$1.parenR)) {
              this.unexpected();
            }
          }
        } else {
          node.options = null;
        }
      } else {
        node.options = null;
      }
    } else {
      if (!this.eat(types$1.parenR)) {
        var errorPos = this.start;
        if (this.eat(types$1.comma) && this.eat(types$1.parenR)) {
          this.raiseRecoverable(errorPos, "Trailing comma is not allowed in import()");
        } else {
          this.unexpected(errorPos);
        }
      }
    }
    return this.finishNode(node, "ImportExpression");
  };
  pp$5.parseImportMeta = function(node) {
    this.next();
    var containsEsc = this.containsEsc;
    node.property = this.parseIdent(true);
    if (node.property.name !== "meta") {
      this.raiseRecoverable(node.property.start, "The only valid meta property for import is 'import.meta'");
    }
    if (containsEsc) {
      this.raiseRecoverable(node.start, "'import.meta' must not contain escaped characters");
    }
    if (this.options.sourceType !== "module" && !this.options.allowImportExportEverywhere) {
      this.raiseRecoverable(node.start, "Cannot use 'import.meta' outside a module");
    }
    return this.finishNode(node, "MetaProperty");
  };
  pp$5.parseLiteral = function(value) {
    var node = this.startNode();
    node.value = value;
    node.raw = this.input.slice(this.start, this.end);
    if (node.raw.charCodeAt(node.raw.length - 1) === 110) {
      node.bigint = node.value != null ? node.value.toString() : node.raw.slice(0, -1).replace(/_/g, "");
    }
    this.next();
    return this.finishNode(node, "Literal");
  };
  pp$5.parseParenExpression = function() {
    this.expect(types$1.parenL);
    var val = this.parseExpression();
    this.expect(types$1.parenR);
    return val;
  };
  pp$5.shouldParseArrow = function(exprList) {
    return !this.canInsertSemicolon();
  };
  pp$5.parseParenAndDistinguishExpression = function(canBeArrow, forInit) {
    var startPos = this.start, startLoc = this.startLoc, val, allowTrailingComma = this.options.ecmaVersion >= 8;
    if (this.options.ecmaVersion >= 6) {
      this.next();
      var innerStartPos = this.start, innerStartLoc = this.startLoc;
      var exprList = [], first = true, lastIsComma = false;
      var refDestructuringErrors = new DestructuringErrors(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, spreadStart;
      this.yieldPos = 0;
      this.awaitPos = 0;
      while (this.type !== types$1.parenR) {
        first ? first = false : this.expect(types$1.comma);
        if (allowTrailingComma && this.afterTrailingComma(types$1.parenR, true)) {
          lastIsComma = true;
          break;
        } else if (this.type === types$1.ellipsis) {
          spreadStart = this.start;
          exprList.push(this.parseParenItem(this.parseRestBinding()));
          if (this.type === types$1.comma) {
            this.raiseRecoverable(
              this.start,
              "Comma is not permitted after the rest element"
            );
          }
          break;
        } else {
          exprList.push(this.parseMaybeAssign(false, refDestructuringErrors, this.parseParenItem));
        }
      }
      var innerEndPos = this.lastTokEnd, innerEndLoc = this.lastTokEndLoc;
      this.expect(types$1.parenR);
      if (canBeArrow && this.shouldParseArrow(exprList) && this.eat(types$1.arrow)) {
        this.checkPatternErrors(refDestructuringErrors, false);
        this.checkYieldAwaitInDefaultParams();
        this.yieldPos = oldYieldPos;
        this.awaitPos = oldAwaitPos;
        return this.parseParenArrowList(startPos, startLoc, exprList, forInit);
      }
      if (!exprList.length || lastIsComma) {
        this.unexpected(this.lastTokStart);
      }
      if (spreadStart) {
        this.unexpected(spreadStart);
      }
      this.checkExpressionErrors(refDestructuringErrors, true);
      this.yieldPos = oldYieldPos || this.yieldPos;
      this.awaitPos = oldAwaitPos || this.awaitPos;
      if (exprList.length > 1) {
        val = this.startNodeAt(innerStartPos, innerStartLoc);
        val.expressions = exprList;
        this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
      } else {
        val = exprList[0];
      }
    } else {
      val = this.parseParenExpression();
    }
    if (this.options.preserveParens) {
      var par = this.startNodeAt(startPos, startLoc);
      par.expression = val;
      return this.finishNode(par, "ParenthesizedExpression");
    } else {
      return val;
    }
  };
  pp$5.parseParenItem = function(item) {
    return item;
  };
  pp$5.parseParenArrowList = function(startPos, startLoc, exprList, forInit) {
    return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, false, forInit);
  };
  var empty = [];
  pp$5.parseNew = function() {
    if (this.containsEsc) {
      this.raiseRecoverable(this.start, "Escape sequence in keyword new");
    }
    var node = this.startNode();
    this.next();
    if (this.options.ecmaVersion >= 6 && this.type === types$1.dot) {
      var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
      meta.name = "new";
      node.meta = this.finishNode(meta, "Identifier");
      this.next();
      var containsEsc = this.containsEsc;
      node.property = this.parseIdent(true);
      if (node.property.name !== "target") {
        this.raiseRecoverable(node.property.start, "The only valid meta property for new is 'new.target'");
      }
      if (containsEsc) {
        this.raiseRecoverable(node.start, "'new.target' must not contain escaped characters");
      }
      if (!this.allowNewDotTarget) {
        this.raiseRecoverable(node.start, "'new.target' can only be used in functions and class static block");
      }
      return this.finishNode(node, "MetaProperty");
    }
    var startPos = this.start, startLoc = this.startLoc;
    node.callee = this.parseSubscripts(this.parseExprAtom(null, false, true), startPos, startLoc, true, false);
    if (this.eat(types$1.parenL)) {
      node.arguments = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false);
    } else {
      node.arguments = empty;
    }
    return this.finishNode(node, "NewExpression");
  };
  pp$5.parseTemplateElement = function(ref2) {
    var isTagged = ref2.isTagged;
    var elem = this.startNode();
    if (this.type === types$1.invalidTemplate) {
      if (!isTagged) {
        this.raiseRecoverable(this.start, "Bad escape sequence in untagged template literal");
      }
      elem.value = {
        raw: this.value.replace(/\r\n?/g, "\n"),
        cooked: null
      };
    } else {
      elem.value = {
        raw: this.input.slice(this.start, this.end).replace(/\r\n?/g, "\n"),
        cooked: this.value
      };
    }
    this.next();
    elem.tail = this.type === types$1.backQuote;
    return this.finishNode(elem, "TemplateElement");
  };
  pp$5.parseTemplate = function(ref2) {
    if (ref2 === void 0) ref2 = {};
    var isTagged = ref2.isTagged;
    if (isTagged === void 0) isTagged = false;
    var node = this.startNode();
    this.next();
    node.expressions = [];
    var curElt = this.parseTemplateElement({ isTagged });
    node.quasis = [curElt];
    while (!curElt.tail) {
      if (this.type === types$1.eof) {
        this.raise(this.pos, "Unterminated template literal");
      }
      this.expect(types$1.dollarBraceL);
      node.expressions.push(this.parseExpression());
      this.expect(types$1.braceR);
      node.quasis.push(curElt = this.parseTemplateElement({ isTagged }));
    }
    this.next();
    return this.finishNode(node, "TemplateLiteral");
  };
  pp$5.isAsyncProp = function(prop) {
    return !prop.computed && prop.key.type === "Identifier" && prop.key.name === "async" && (this.type === types$1.name || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword || this.options.ecmaVersion >= 9 && this.type === types$1.star) && !lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
  };
  pp$5.parseObj = function(isPattern, refDestructuringErrors) {
    var node = this.startNode(), first = true, propHash = {};
    node.properties = [];
    this.next();
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.options.ecmaVersion >= 5 && this.afterTrailingComma(types$1.braceR)) {
          break;
        }
      } else {
        first = false;
      }
      var prop = this.parseProperty(isPattern, refDestructuringErrors);
      if (!isPattern) {
        this.checkPropClash(prop, propHash, refDestructuringErrors);
      }
      node.properties.push(prop);
    }
    return this.finishNode(node, isPattern ? "ObjectPattern" : "ObjectExpression");
  };
  pp$5.parseProperty = function(isPattern, refDestructuringErrors) {
    var prop = this.startNode(), isGenerator, isAsync, startPos, startLoc;
    if (this.options.ecmaVersion >= 9 && this.eat(types$1.ellipsis)) {
      if (isPattern) {
        prop.argument = this.parseIdent(false);
        if (this.type === types$1.comma) {
          this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
        }
        return this.finishNode(prop, "RestElement");
      }
      prop.argument = this.parseMaybeAssign(false, refDestructuringErrors);
      if (this.type === types$1.comma && refDestructuringErrors && refDestructuringErrors.trailingComma < 0) {
        refDestructuringErrors.trailingComma = this.start;
      }
      return this.finishNode(prop, "SpreadElement");
    }
    if (this.options.ecmaVersion >= 6) {
      prop.method = false;
      prop.shorthand = false;
      if (isPattern || refDestructuringErrors) {
        startPos = this.start;
        startLoc = this.startLoc;
      }
      if (!isPattern) {
        isGenerator = this.eat(types$1.star);
      }
    }
    var containsEsc = this.containsEsc;
    this.parsePropertyName(prop);
    if (!isPattern && !containsEsc && this.options.ecmaVersion >= 8 && !isGenerator && this.isAsyncProp(prop)) {
      isAsync = true;
      isGenerator = this.options.ecmaVersion >= 9 && this.eat(types$1.star);
      this.parsePropertyName(prop);
    } else {
      isAsync = false;
    }
    this.parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc);
    return this.finishNode(prop, "Property");
  };
  pp$5.parseGetterSetter = function(prop) {
    var kind = prop.key.name;
    this.parsePropertyName(prop);
    prop.value = this.parseMethod(false);
    prop.kind = kind;
    var paramCount = prop.kind === "get" ? 0 : 1;
    if (prop.value.params.length !== paramCount) {
      var start = prop.value.start;
      if (prop.kind === "get") {
        this.raiseRecoverable(start, "getter should have no params");
      } else {
        this.raiseRecoverable(start, "setter should have exactly one param");
      }
    } else {
      if (prop.kind === "set" && prop.value.params[0].type === "RestElement") {
        this.raiseRecoverable(prop.value.params[0].start, "Setter cannot use rest params");
      }
    }
  };
  pp$5.parsePropertyValue = function(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc) {
    if ((isGenerator || isAsync) && this.type === types$1.colon) {
      this.unexpected();
    }
    if (this.eat(types$1.colon)) {
      prop.value = isPattern ? this.parseMaybeDefault(this.start, this.startLoc) : this.parseMaybeAssign(false, refDestructuringErrors);
      prop.kind = "init";
    } else if (this.options.ecmaVersion >= 6 && this.type === types$1.parenL) {
      if (isPattern) {
        this.unexpected();
      }
      prop.method = true;
      prop.value = this.parseMethod(isGenerator, isAsync);
      prop.kind = "init";
    } else if (!isPattern && !containsEsc && this.options.ecmaVersion >= 5 && !prop.computed && prop.key.type === "Identifier" && (prop.key.name === "get" || prop.key.name === "set") && (this.type !== types$1.comma && this.type !== types$1.braceR && this.type !== types$1.eq)) {
      if (isGenerator || isAsync) {
        this.unexpected();
      }
      this.parseGetterSetter(prop);
    } else if (this.options.ecmaVersion >= 6 && !prop.computed && prop.key.type === "Identifier") {
      if (isGenerator || isAsync) {
        this.unexpected();
      }
      this.checkUnreserved(prop.key);
      if (prop.key.name === "await" && !this.awaitIdentPos) {
        this.awaitIdentPos = startPos;
      }
      if (isPattern) {
        prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
      } else if (this.type === types$1.eq && refDestructuringErrors) {
        if (refDestructuringErrors.shorthandAssign < 0) {
          refDestructuringErrors.shorthandAssign = this.start;
        }
        prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
      } else {
        prop.value = this.copyNode(prop.key);
      }
      prop.kind = "init";
      prop.shorthand = true;
    } else {
      this.unexpected();
    }
  };
  pp$5.parsePropertyName = function(prop) {
    if (this.options.ecmaVersion >= 6) {
      if (this.eat(types$1.bracketL)) {
        prop.computed = true;
        prop.key = this.parseMaybeAssign();
        this.expect(types$1.bracketR);
        return prop.key;
      } else {
        prop.computed = false;
      }
    }
    return prop.key = this.type === types$1.num || this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
  };
  pp$5.initFunction = function(node) {
    node.id = null;
    if (this.options.ecmaVersion >= 6) {
      node.generator = node.expression = false;
    }
    if (this.options.ecmaVersion >= 8) {
      node.async = false;
    }
  };
  pp$5.parseMethod = function(isGenerator, isAsync, allowDirectSuper) {
    var node = this.startNode(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.initFunction(node);
    if (this.options.ecmaVersion >= 6) {
      node.generator = isGenerator;
    }
    if (this.options.ecmaVersion >= 8) {
      node.async = !!isAsync;
    }
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    this.enterScope(functionFlags(isAsync, node.generator) | SCOPE_SUPER | (allowDirectSuper ? SCOPE_DIRECT_SUPER : 0));
    this.expect(types$1.parenL);
    node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
    this.checkYieldAwaitInDefaultParams();
    this.parseFunctionBody(node, false, true, false);
    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, "FunctionExpression");
  };
  pp$5.parseArrowExpression = function(node, params, isAsync, forInit) {
    var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.enterScope(functionFlags(isAsync, false) | SCOPE_ARROW);
    this.initFunction(node);
    if (this.options.ecmaVersion >= 8) {
      node.async = !!isAsync;
    }
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    node.params = this.toAssignableList(params, true);
    this.parseFunctionBody(node, true, false, forInit);
    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, "ArrowFunctionExpression");
  };
  pp$5.parseFunctionBody = function(node, isArrowFunction, isMethod, forInit) {
    var isExpression = isArrowFunction && this.type !== types$1.braceL;
    var oldStrict = this.strict, useStrict = false;
    if (isExpression) {
      node.body = this.parseMaybeAssign(forInit);
      node.expression = true;
      this.checkParams(node, false);
    } else {
      var nonSimple = this.options.ecmaVersion >= 7 && !this.isSimpleParamList(node.params);
      if (!oldStrict || nonSimple) {
        useStrict = this.strictDirective(this.end);
        if (useStrict && nonSimple) {
          this.raiseRecoverable(node.start, "Illegal 'use strict' directive in function with non-simple parameter list");
        }
      }
      var oldLabels = this.labels;
      this.labels = [];
      if (useStrict) {
        this.strict = true;
      }
      this.checkParams(node, !oldStrict && !useStrict && !isArrowFunction && !isMethod && this.isSimpleParamList(node.params));
      if (this.strict && node.id) {
        this.checkLValSimple(node.id, BIND_OUTSIDE);
      }
      node.body = this.parseBlock(false, void 0, useStrict && !oldStrict);
      node.expression = false;
      this.adaptDirectivePrologue(node.body.body);
      this.labels = oldLabels;
    }
    this.exitScope();
  };
  pp$5.isSimpleParamList = function(params) {
    for (var i2 = 0, list2 = params; i2 < list2.length; i2 += 1) {
      var param = list2[i2];
      if (param.type !== "Identifier") {
        return false;
      }
    }
    return true;
  };
  pp$5.checkParams = function(node, allowDuplicates) {
    var nameHash = /* @__PURE__ */ Object.create(null);
    for (var i2 = 0, list2 = node.params; i2 < list2.length; i2 += 1) {
      var param = list2[i2];
      this.checkLValInnerPattern(param, BIND_VAR, allowDuplicates ? null : nameHash);
    }
  };
  pp$5.parseExprList = function(close, allowTrailingComma, allowEmpty, refDestructuringErrors) {
    var elts = [], first = true;
    while (!this.eat(close)) {
      if (!first) {
        this.expect(types$1.comma);
        if (allowTrailingComma && this.afterTrailingComma(close)) {
          break;
        }
      } else {
        first = false;
      }
      var elt = void 0;
      if (allowEmpty && this.type === types$1.comma) {
        elt = null;
      } else if (this.type === types$1.ellipsis) {
        elt = this.parseSpread(refDestructuringErrors);
        if (refDestructuringErrors && this.type === types$1.comma && refDestructuringErrors.trailingComma < 0) {
          refDestructuringErrors.trailingComma = this.start;
        }
      } else {
        elt = this.parseMaybeAssign(false, refDestructuringErrors);
      }
      elts.push(elt);
    }
    return elts;
  };
  pp$5.checkUnreserved = function(ref2) {
    var start = ref2.start;
    var end = ref2.end;
    var name3 = ref2.name;
    if (this.inGenerator && name3 === "yield") {
      this.raiseRecoverable(start, "Cannot use 'yield' as identifier inside a generator");
    }
    if (this.inAsync && name3 === "await") {
      this.raiseRecoverable(start, "Cannot use 'await' as identifier inside an async function");
    }
    if (!(this.currentThisScope().flags & SCOPE_VAR) && name3 === "arguments") {
      this.raiseRecoverable(start, "Cannot use 'arguments' in class field initializer");
    }
    if (this.inClassStaticBlock && (name3 === "arguments" || name3 === "await")) {
      this.raise(start, "Cannot use " + name3 + " in class static initialization block");
    }
    if (this.keywords.test(name3)) {
      this.raise(start, "Unexpected keyword '" + name3 + "'");
    }
    if (this.options.ecmaVersion < 6 && this.input.slice(start, end).indexOf("\\") !== -1) {
      return;
    }
    var re = this.strict ? this.reservedWordsStrict : this.reservedWords;
    if (re.test(name3)) {
      if (!this.inAsync && name3 === "await") {
        this.raiseRecoverable(start, "Cannot use keyword 'await' outside an async function");
      }
      this.raiseRecoverable(start, "The keyword '" + name3 + "' is reserved");
    }
  };
  pp$5.parseIdent = function(liberal) {
    var node = this.parseIdentNode();
    this.next(!!liberal);
    this.finishNode(node, "Identifier");
    if (!liberal) {
      this.checkUnreserved(node);
      if (node.name === "await" && !this.awaitIdentPos) {
        this.awaitIdentPos = node.start;
      }
    }
    return node;
  };
  pp$5.parseIdentNode = function() {
    var node = this.startNode();
    if (this.type === types$1.name) {
      node.name = this.value;
    } else if (this.type.keyword) {
      node.name = this.type.keyword;
      if ((node.name === "class" || node.name === "function") && (this.lastTokEnd !== this.lastTokStart + 1 || this.input.charCodeAt(this.lastTokStart) !== 46)) {
        this.context.pop();
      }
      this.type = types$1.name;
    } else {
      this.unexpected();
    }
    return node;
  };
  pp$5.parsePrivateIdent = function() {
    var node = this.startNode();
    if (this.type === types$1.privateId) {
      node.name = this.value;
    } else {
      this.unexpected();
    }
    this.next();
    this.finishNode(node, "PrivateIdentifier");
    if (this.options.checkPrivateFields) {
      if (this.privateNameStack.length === 0) {
        this.raise(node.start, "Private field '#" + node.name + "' must be declared in an enclosing class");
      } else {
        this.privateNameStack[this.privateNameStack.length - 1].used.push(node);
      }
    }
    return node;
  };
  pp$5.parseYield = function(forInit) {
    if (!this.yieldPos) {
      this.yieldPos = this.start;
    }
    var node = this.startNode();
    this.next();
    if (this.type === types$1.semi || this.canInsertSemicolon() || this.type !== types$1.star && !this.type.startsExpr) {
      node.delegate = false;
      node.argument = null;
    } else {
      node.delegate = this.eat(types$1.star);
      node.argument = this.parseMaybeAssign(forInit);
    }
    return this.finishNode(node, "YieldExpression");
  };
  pp$5.parseAwait = function(forInit) {
    if (!this.awaitPos) {
      this.awaitPos = this.start;
    }
    var node = this.startNode();
    this.next();
    node.argument = this.parseMaybeUnary(null, true, false, forInit);
    return this.finishNode(node, "AwaitExpression");
  };
  var pp$4 = Parser.prototype;
  pp$4.raise = function(pos, message) {
    var loc = getLineInfo(this.input, pos);
    message += " (" + loc.line + ":" + loc.column + ")";
    if (this.sourceFile) {
      message += " in " + this.sourceFile;
    }
    var err = new SyntaxError(message);
    err.pos = pos;
    err.loc = loc;
    err.raisedAt = this.pos;
    throw err;
  };
  pp$4.raiseRecoverable = pp$4.raise;
  pp$4.curPosition = function() {
    if (this.options.locations) {
      return new Position(this.curLine, this.pos - this.lineStart);
    }
  };
  var pp$3 = Parser.prototype;
  var Scope = function Scope2(flags) {
    this.flags = flags;
    this.var = [];
    this.lexical = [];
    this.functions = [];
  };
  pp$3.enterScope = function(flags) {
    this.scopeStack.push(new Scope(flags));
  };
  pp$3.exitScope = function() {
    this.scopeStack.pop();
  };
  pp$3.treatFunctionsAsVarInScope = function(scope) {
    return scope.flags & SCOPE_FUNCTION || !this.inModule && scope.flags & SCOPE_TOP;
  };
  pp$3.declareName = function(name3, bindingType, pos) {
    var redeclared = false;
    if (bindingType === BIND_LEXICAL) {
      var scope = this.currentScope();
      redeclared = scope.lexical.indexOf(name3) > -1 || scope.functions.indexOf(name3) > -1 || scope.var.indexOf(name3) > -1;
      scope.lexical.push(name3);
      if (this.inModule && scope.flags & SCOPE_TOP) {
        delete this.undefinedExports[name3];
      }
    } else if (bindingType === BIND_SIMPLE_CATCH) {
      var scope$1 = this.currentScope();
      scope$1.lexical.push(name3);
    } else if (bindingType === BIND_FUNCTION) {
      var scope$2 = this.currentScope();
      if (this.treatFunctionsAsVar) {
        redeclared = scope$2.lexical.indexOf(name3) > -1;
      } else {
        redeclared = scope$2.lexical.indexOf(name3) > -1 || scope$2.var.indexOf(name3) > -1;
      }
      scope$2.functions.push(name3);
    } else {
      for (var i2 = this.scopeStack.length - 1; i2 >= 0; --i2) {
        var scope$3 = this.scopeStack[i2];
        if (scope$3.lexical.indexOf(name3) > -1 && !(scope$3.flags & SCOPE_SIMPLE_CATCH && scope$3.lexical[0] === name3) || !this.treatFunctionsAsVarInScope(scope$3) && scope$3.functions.indexOf(name3) > -1) {
          redeclared = true;
          break;
        }
        scope$3.var.push(name3);
        if (this.inModule && scope$3.flags & SCOPE_TOP) {
          delete this.undefinedExports[name3];
        }
        if (scope$3.flags & SCOPE_VAR) {
          break;
        }
      }
    }
    if (redeclared) {
      this.raiseRecoverable(pos, "Identifier '" + name3 + "' has already been declared");
    }
  };
  pp$3.checkLocalExport = function(id) {
    if (this.scopeStack[0].lexical.indexOf(id.name) === -1 && this.scopeStack[0].var.indexOf(id.name) === -1) {
      this.undefinedExports[id.name] = id;
    }
  };
  pp$3.currentScope = function() {
    return this.scopeStack[this.scopeStack.length - 1];
  };
  pp$3.currentVarScope = function() {
    for (var i2 = this.scopeStack.length - 1; ; i2--) {
      var scope = this.scopeStack[i2];
      if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK)) {
        return scope;
      }
    }
  };
  pp$3.currentThisScope = function() {
    for (var i2 = this.scopeStack.length - 1; ; i2--) {
      var scope = this.scopeStack[i2];
      if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK) && !(scope.flags & SCOPE_ARROW)) {
        return scope;
      }
    }
  };
  var Node = function Node2(parser, pos, loc) {
    this.type = "";
    this.start = pos;
    this.end = 0;
    if (parser.options.locations) {
      this.loc = new SourceLocation(parser, loc);
    }
    if (parser.options.directSourceFile) {
      this.sourceFile = parser.options.directSourceFile;
    }
    if (parser.options.ranges) {
      this.range = [pos, 0];
    }
  };
  var pp$2 = Parser.prototype;
  pp$2.startNode = function() {
    return new Node(this, this.start, this.startLoc);
  };
  pp$2.startNodeAt = function(pos, loc) {
    return new Node(this, pos, loc);
  };
  function finishNodeAt(node, type, pos, loc) {
    node.type = type;
    node.end = pos;
    if (this.options.locations) {
      node.loc.end = loc;
    }
    if (this.options.ranges) {
      node.range[1] = pos;
    }
    return node;
  }
  pp$2.finishNode = function(node, type) {
    return finishNodeAt.call(this, node, type, this.lastTokEnd, this.lastTokEndLoc);
  };
  pp$2.finishNodeAt = function(node, type, pos, loc) {
    return finishNodeAt.call(this, node, type, pos, loc);
  };
  pp$2.copyNode = function(node) {
    var newNode = new Node(this, node.start, this.startLoc);
    for (var prop in node) {
      newNode[prop] = node[prop];
    }
    return newNode;
  };
  var scriptValuesAddedInUnicode = "Gara Garay Gukh Gurung_Khema Hrkt Katakana_Or_Hiragana Kawi Kirat_Rai Krai Nag_Mundari Nagm Ol_Onal Onao Sunu Sunuwar Todhri Todr Tulu_Tigalari Tutg Unknown Zzzz";
  var ecma9BinaryProperties = "ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS";
  var ecma10BinaryProperties = ecma9BinaryProperties + " Extended_Pictographic";
  var ecma11BinaryProperties = ecma10BinaryProperties;
  var ecma12BinaryProperties = ecma11BinaryProperties + " EBase EComp EMod EPres ExtPict";
  var ecma13BinaryProperties = ecma12BinaryProperties;
  var ecma14BinaryProperties = ecma13BinaryProperties;
  var unicodeBinaryProperties = {
    9: ecma9BinaryProperties,
    10: ecma10BinaryProperties,
    11: ecma11BinaryProperties,
    12: ecma12BinaryProperties,
    13: ecma13BinaryProperties,
    14: ecma14BinaryProperties
  };
  var ecma14BinaryPropertiesOfStrings = "Basic_Emoji Emoji_Keycap_Sequence RGI_Emoji_Modifier_Sequence RGI_Emoji_Flag_Sequence RGI_Emoji_Tag_Sequence RGI_Emoji_ZWJ_Sequence RGI_Emoji";
  var unicodeBinaryPropertiesOfStrings = {
    9: "",
    10: "",
    11: "",
    12: "",
    13: "",
    14: ecma14BinaryPropertiesOfStrings
  };
  var unicodeGeneralCategoryValues = "Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu";
  var ecma9ScriptValues = "Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb";
  var ecma10ScriptValues = ecma9ScriptValues + " Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd";
  var ecma11ScriptValues = ecma10ScriptValues + " Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho";
  var ecma12ScriptValues = ecma11ScriptValues + " Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi";
  var ecma13ScriptValues = ecma12ScriptValues + " Cypro_Minoan Cpmn Old_Uyghur Ougr Tangsa Tnsa Toto Vithkuqi Vith";
  var ecma14ScriptValues = ecma13ScriptValues + " " + scriptValuesAddedInUnicode;
  var unicodeScriptValues = {
    9: ecma9ScriptValues,
    10: ecma10ScriptValues,
    11: ecma11ScriptValues,
    12: ecma12ScriptValues,
    13: ecma13ScriptValues,
    14: ecma14ScriptValues
  };
  var data = {};
  function buildUnicodeData(ecmaVersion2) {
    var d = data[ecmaVersion2] = {
      binary: wordsRegexp(unicodeBinaryProperties[ecmaVersion2] + " " + unicodeGeneralCategoryValues),
      binaryOfStrings: wordsRegexp(unicodeBinaryPropertiesOfStrings[ecmaVersion2]),
      nonBinary: {
        General_Category: wordsRegexp(unicodeGeneralCategoryValues),
        Script: wordsRegexp(unicodeScriptValues[ecmaVersion2])
      }
    };
    d.nonBinary.Script_Extensions = d.nonBinary.Script;
    d.nonBinary.gc = d.nonBinary.General_Category;
    d.nonBinary.sc = d.nonBinary.Script;
    d.nonBinary.scx = d.nonBinary.Script_Extensions;
  }
  for (i = 0, list = [9, 10, 11, 12, 13, 14]; i < list.length; i += 1) {
    ecmaVersion = list[i];
    buildUnicodeData(ecmaVersion);
  }
  var ecmaVersion;
  var i;
  var list;
  var pp$1 = Parser.prototype;
  var BranchID = function BranchID2(parent, base) {
    this.parent = parent;
    this.base = base || this;
  };
  BranchID.prototype.separatedFrom = function separatedFrom(alt) {
    for (var self = this; self; self = self.parent) {
      for (var other = alt; other; other = other.parent) {
        if (self.base === other.base && self !== other) {
          return true;
        }
      }
    }
    return false;
  };
  BranchID.prototype.sibling = function sibling() {
    return new BranchID(this.parent, this.base);
  };
  var RegExpValidationState = function RegExpValidationState2(parser) {
    this.parser = parser;
    this.validFlags = "gim" + (parser.options.ecmaVersion >= 6 ? "uy" : "") + (parser.options.ecmaVersion >= 9 ? "s" : "") + (parser.options.ecmaVersion >= 13 ? "d" : "") + (parser.options.ecmaVersion >= 15 ? "v" : "");
    this.unicodeProperties = data[parser.options.ecmaVersion >= 14 ? 14 : parser.options.ecmaVersion];
    this.source = "";
    this.flags = "";
    this.start = 0;
    this.switchU = false;
    this.switchV = false;
    this.switchN = false;
    this.pos = 0;
    this.lastIntValue = 0;
    this.lastStringValue = "";
    this.lastAssertionIsQuantifiable = false;
    this.numCapturingParens = 0;
    this.maxBackReference = 0;
    this.groupNames = /* @__PURE__ */ Object.create(null);
    this.backReferenceNames = [];
    this.branchID = null;
  };
  RegExpValidationState.prototype.reset = function reset(start, pattern, flags) {
    var unicodeSets = flags.indexOf("v") !== -1;
    var unicode = flags.indexOf("u") !== -1;
    this.start = start | 0;
    this.source = pattern + "";
    this.flags = flags;
    if (unicodeSets && this.parser.options.ecmaVersion >= 15) {
      this.switchU = true;
      this.switchV = true;
      this.switchN = true;
    } else {
      this.switchU = unicode && this.parser.options.ecmaVersion >= 6;
      this.switchV = false;
      this.switchN = unicode && this.parser.options.ecmaVersion >= 9;
    }
  };
  RegExpValidationState.prototype.raise = function raise(message) {
    this.parser.raiseRecoverable(this.start, "Invalid regular expression: /" + this.source + "/: " + message);
  };
  RegExpValidationState.prototype.at = function at(i2, forceU) {
    if (forceU === void 0) forceU = false;
    var s = this.source;
    var l = s.length;
    if (i2 >= l) {
      return -1;
    }
    var c = s.charCodeAt(i2);
    if (!(forceU || this.switchU) || c <= 55295 || c >= 57344 || i2 + 1 >= l) {
      return c;
    }
    var next = s.charCodeAt(i2 + 1);
    return next >= 56320 && next <= 57343 ? (c << 10) + next - 56613888 : c;
  };
  RegExpValidationState.prototype.nextIndex = function nextIndex(i2, forceU) {
    if (forceU === void 0) forceU = false;
    var s = this.source;
    var l = s.length;
    if (i2 >= l) {
      return l;
    }
    var c = s.charCodeAt(i2), next;
    if (!(forceU || this.switchU) || c <= 55295 || c >= 57344 || i2 + 1 >= l || (next = s.charCodeAt(i2 + 1)) < 56320 || next > 57343) {
      return i2 + 1;
    }
    return i2 + 2;
  };
  RegExpValidationState.prototype.current = function current(forceU) {
    if (forceU === void 0) forceU = false;
    return this.at(this.pos, forceU);
  };
  RegExpValidationState.prototype.lookahead = function lookahead(forceU) {
    if (forceU === void 0) forceU = false;
    return this.at(this.nextIndex(this.pos, forceU), forceU);
  };
  RegExpValidationState.prototype.advance = function advance(forceU) {
    if (forceU === void 0) forceU = false;
    this.pos = this.nextIndex(this.pos, forceU);
  };
  RegExpValidationState.prototype.eat = function eat(ch, forceU) {
    if (forceU === void 0) forceU = false;
    if (this.current(forceU) === ch) {
      this.advance(forceU);
      return true;
    }
    return false;
  };
  RegExpValidationState.prototype.eatChars = function eatChars(chs, forceU) {
    if (forceU === void 0) forceU = false;
    var pos = this.pos;
    for (var i2 = 0, list2 = chs; i2 < list2.length; i2 += 1) {
      var ch = list2[i2];
      var current2 = this.at(pos, forceU);
      if (current2 === -1 || current2 !== ch) {
        return false;
      }
      pos = this.nextIndex(pos, forceU);
    }
    this.pos = pos;
    return true;
  };
  pp$1.validateRegExpFlags = function(state) {
    var validFlags = state.validFlags;
    var flags = state.flags;
    var u = false;
    var v = false;
    for (var i2 = 0; i2 < flags.length; i2++) {
      var flag = flags.charAt(i2);
      if (validFlags.indexOf(flag) === -1) {
        this.raise(state.start, "Invalid regular expression flag");
      }
      if (flags.indexOf(flag, i2 + 1) > -1) {
        this.raise(state.start, "Duplicate regular expression flag");
      }
      if (flag === "u") {
        u = true;
      }
      if (flag === "v") {
        v = true;
      }
    }
    if (this.options.ecmaVersion >= 15 && u && v) {
      this.raise(state.start, "Invalid regular expression flag");
    }
  };
  function hasProp(obj) {
    for (var _ in obj) {
      return true;
    }
    return false;
  }
  pp$1.validateRegExpPattern = function(state) {
    this.regexp_pattern(state);
    if (!state.switchN && this.options.ecmaVersion >= 9 && hasProp(state.groupNames)) {
      state.switchN = true;
      this.regexp_pattern(state);
    }
  };
  pp$1.regexp_pattern = function(state) {
    state.pos = 0;
    state.lastIntValue = 0;
    state.lastStringValue = "";
    state.lastAssertionIsQuantifiable = false;
    state.numCapturingParens = 0;
    state.maxBackReference = 0;
    state.groupNames = /* @__PURE__ */ Object.create(null);
    state.backReferenceNames.length = 0;
    state.branchID = null;
    this.regexp_disjunction(state);
    if (state.pos !== state.source.length) {
      if (state.eat(
        41
        /* ) */
      )) {
        state.raise("Unmatched ')'");
      }
      if (state.eat(
        93
        /* ] */
      ) || state.eat(
        125
        /* } */
      )) {
        state.raise("Lone quantifier brackets");
      }
    }
    if (state.maxBackReference > state.numCapturingParens) {
      state.raise("Invalid escape");
    }
    for (var i2 = 0, list2 = state.backReferenceNames; i2 < list2.length; i2 += 1) {
      var name3 = list2[i2];
      if (!state.groupNames[name3]) {
        state.raise("Invalid named capture referenced");
      }
    }
  };
  pp$1.regexp_disjunction = function(state) {
    var trackDisjunction = this.options.ecmaVersion >= 16;
    if (trackDisjunction) {
      state.branchID = new BranchID(state.branchID, null);
    }
    this.regexp_alternative(state);
    while (state.eat(
      124
      /* | */
    )) {
      if (trackDisjunction) {
        state.branchID = state.branchID.sibling();
      }
      this.regexp_alternative(state);
    }
    if (trackDisjunction) {
      state.branchID = state.branchID.parent;
    }
    if (this.regexp_eatQuantifier(state, true)) {
      state.raise("Nothing to repeat");
    }
    if (state.eat(
      123
      /* { */
    )) {
      state.raise("Lone quantifier brackets");
    }
  };
  pp$1.regexp_alternative = function(state) {
    while (state.pos < state.source.length && this.regexp_eatTerm(state)) {
    }
  };
  pp$1.regexp_eatTerm = function(state) {
    if (this.regexp_eatAssertion(state)) {
      if (state.lastAssertionIsQuantifiable && this.regexp_eatQuantifier(state)) {
        if (state.switchU) {
          state.raise("Invalid quantifier");
        }
      }
      return true;
    }
    if (state.switchU ? this.regexp_eatAtom(state) : this.regexp_eatExtendedAtom(state)) {
      this.regexp_eatQuantifier(state);
      return true;
    }
    return false;
  };
  pp$1.regexp_eatAssertion = function(state) {
    var start = state.pos;
    state.lastAssertionIsQuantifiable = false;
    if (state.eat(
      94
      /* ^ */
    ) || state.eat(
      36
      /* $ */
    )) {
      return true;
    }
    if (state.eat(
      92
      /* \ */
    )) {
      if (state.eat(
        66
        /* B */
      ) || state.eat(
        98
        /* b */
      )) {
        return true;
      }
      state.pos = start;
    }
    if (state.eat(
      40
      /* ( */
    ) && state.eat(
      63
      /* ? */
    )) {
      var lookbehind = false;
      if (this.options.ecmaVersion >= 9) {
        lookbehind = state.eat(
          60
          /* < */
        );
      }
      if (state.eat(
        61
        /* = */
      ) || state.eat(
        33
        /* ! */
      )) {
        this.regexp_disjunction(state);
        if (!state.eat(
          41
          /* ) */
        )) {
          state.raise("Unterminated group");
        }
        state.lastAssertionIsQuantifiable = !lookbehind;
        return true;
      }
    }
    state.pos = start;
    return false;
  };
  pp$1.regexp_eatQuantifier = function(state, noError) {
    if (noError === void 0) noError = false;
    if (this.regexp_eatQuantifierPrefix(state, noError)) {
      state.eat(
        63
        /* ? */
      );
      return true;
    }
    return false;
  };
  pp$1.regexp_eatQuantifierPrefix = function(state, noError) {
    return state.eat(
      42
      /* * */
    ) || state.eat(
      43
      /* + */
    ) || state.eat(
      63
      /* ? */
    ) || this.regexp_eatBracedQuantifier(state, noError);
  };
  pp$1.regexp_eatBracedQuantifier = function(state, noError) {
    var start = state.pos;
    if (state.eat(
      123
      /* { */
    )) {
      var min = 0, max = -1;
      if (this.regexp_eatDecimalDigits(state)) {
        min = state.lastIntValue;
        if (state.eat(
          44
          /* , */
        ) && this.regexp_eatDecimalDigits(state)) {
          max = state.lastIntValue;
        }
        if (state.eat(
          125
          /* } */
        )) {
          if (max !== -1 && max < min && !noError) {
            state.raise("numbers out of order in {} quantifier");
          }
          return true;
        }
      }
      if (state.switchU && !noError) {
        state.raise("Incomplete quantifier");
      }
      state.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatAtom = function(state) {
    return this.regexp_eatPatternCharacters(state) || state.eat(
      46
      /* . */
    ) || this.regexp_eatReverseSolidusAtomEscape(state) || this.regexp_eatCharacterClass(state) || this.regexp_eatUncapturingGroup(state) || this.regexp_eatCapturingGroup(state);
  };
  pp$1.regexp_eatReverseSolidusAtomEscape = function(state) {
    var start = state.pos;
    if (state.eat(
      92
      /* \ */
    )) {
      if (this.regexp_eatAtomEscape(state)) {
        return true;
      }
      state.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatUncapturingGroup = function(state) {
    var start = state.pos;
    if (state.eat(
      40
      /* ( */
    )) {
      if (state.eat(
        63
        /* ? */
      )) {
        if (this.options.ecmaVersion >= 16) {
          var addModifiers = this.regexp_eatModifiers(state);
          var hasHyphen = state.eat(
            45
            /* - */
          );
          if (addModifiers || hasHyphen) {
            for (var i2 = 0; i2 < addModifiers.length; i2++) {
              var modifier = addModifiers.charAt(i2);
              if (addModifiers.indexOf(modifier, i2 + 1) > -1) {
                state.raise("Duplicate regular expression modifiers");
              }
            }
            if (hasHyphen) {
              var removeModifiers = this.regexp_eatModifiers(state);
              if (!addModifiers && !removeModifiers && state.current() === 58) {
                state.raise("Invalid regular expression modifiers");
              }
              for (var i$1 = 0; i$1 < removeModifiers.length; i$1++) {
                var modifier$1 = removeModifiers.charAt(i$1);
                if (removeModifiers.indexOf(modifier$1, i$1 + 1) > -1 || addModifiers.indexOf(modifier$1) > -1) {
                  state.raise("Duplicate regular expression modifiers");
                }
              }
            }
          }
        }
        if (state.eat(
          58
          /* : */
        )) {
          this.regexp_disjunction(state);
          if (state.eat(
            41
            /* ) */
          )) {
            return true;
          }
          state.raise("Unterminated group");
        }
      }
      state.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatCapturingGroup = function(state) {
    if (state.eat(
      40
      /* ( */
    )) {
      if (this.options.ecmaVersion >= 9) {
        this.regexp_groupSpecifier(state);
      } else if (state.current() === 63) {
        state.raise("Invalid group");
      }
      this.regexp_disjunction(state);
      if (state.eat(
        41
        /* ) */
      )) {
        state.numCapturingParens += 1;
        return true;
      }
      state.raise("Unterminated group");
    }
    return false;
  };
  pp$1.regexp_eatModifiers = function(state) {
    var modifiers = "";
    var ch = 0;
    while ((ch = state.current()) !== -1 && isRegularExpressionModifier(ch)) {
      modifiers += codePointToString(ch);
      state.advance();
    }
    return modifiers;
  };
  function isRegularExpressionModifier(ch) {
    return ch === 105 || ch === 109 || ch === 115;
  }
  pp$1.regexp_eatExtendedAtom = function(state) {
    return state.eat(
      46
      /* . */
    ) || this.regexp_eatReverseSolidusAtomEscape(state) || this.regexp_eatCharacterClass(state) || this.regexp_eatUncapturingGroup(state) || this.regexp_eatCapturingGroup(state) || this.regexp_eatInvalidBracedQuantifier(state) || this.regexp_eatExtendedPatternCharacter(state);
  };
  pp$1.regexp_eatInvalidBracedQuantifier = function(state) {
    if (this.regexp_eatBracedQuantifier(state, true)) {
      state.raise("Nothing to repeat");
    }
    return false;
  };
  pp$1.regexp_eatSyntaxCharacter = function(state) {
    var ch = state.current();
    if (isSyntaxCharacter(ch)) {
      state.lastIntValue = ch;
      state.advance();
      return true;
    }
    return false;
  };
  function isSyntaxCharacter(ch) {
    return ch === 36 || ch >= 40 && ch <= 43 || ch === 46 || ch === 63 || ch >= 91 && ch <= 94 || ch >= 123 && ch <= 125;
  }
  pp$1.regexp_eatPatternCharacters = function(state) {
    var start = state.pos;
    var ch = 0;
    while ((ch = state.current()) !== -1 && !isSyntaxCharacter(ch)) {
      state.advance();
    }
    return state.pos !== start;
  };
  pp$1.regexp_eatExtendedPatternCharacter = function(state) {
    var ch = state.current();
    if (ch !== -1 && ch !== 36 && !(ch >= 40 && ch <= 43) && ch !== 46 && ch !== 63 && ch !== 91 && ch !== 94 && ch !== 124) {
      state.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_groupSpecifier = function(state) {
    if (state.eat(
      63
      /* ? */
    )) {
      if (!this.regexp_eatGroupName(state)) {
        state.raise("Invalid group");
      }
      var trackDisjunction = this.options.ecmaVersion >= 16;
      var known = state.groupNames[state.lastStringValue];
      if (known) {
        if (trackDisjunction) {
          for (var i2 = 0, list2 = known; i2 < list2.length; i2 += 1) {
            var altID = list2[i2];
            if (!altID.separatedFrom(state.branchID)) {
              state.raise("Duplicate capture group name");
            }
          }
        } else {
          state.raise("Duplicate capture group name");
        }
      }
      if (trackDisjunction) {
        (known || (state.groupNames[state.lastStringValue] = [])).push(state.branchID);
      } else {
        state.groupNames[state.lastStringValue] = true;
      }
    }
  };
  pp$1.regexp_eatGroupName = function(state) {
    state.lastStringValue = "";
    if (state.eat(
      60
      /* < */
    )) {
      if (this.regexp_eatRegExpIdentifierName(state) && state.eat(
        62
        /* > */
      )) {
        return true;
      }
      state.raise("Invalid capture group name");
    }
    return false;
  };
  pp$1.regexp_eatRegExpIdentifierName = function(state) {
    state.lastStringValue = "";
    if (this.regexp_eatRegExpIdentifierStart(state)) {
      state.lastStringValue += codePointToString(state.lastIntValue);
      while (this.regexp_eatRegExpIdentifierPart(state)) {
        state.lastStringValue += codePointToString(state.lastIntValue);
      }
      return true;
    }
    return false;
  };
  pp$1.regexp_eatRegExpIdentifierStart = function(state) {
    var start = state.pos;
    var forceU = this.options.ecmaVersion >= 11;
    var ch = state.current(forceU);
    state.advance(forceU);
    if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
      ch = state.lastIntValue;
    }
    if (isRegExpIdentifierStart(ch)) {
      state.lastIntValue = ch;
      return true;
    }
    state.pos = start;
    return false;
  };
  function isRegExpIdentifierStart(ch) {
    return isIdentifierStart(ch, true) || ch === 36 || ch === 95;
  }
  pp$1.regexp_eatRegExpIdentifierPart = function(state) {
    var start = state.pos;
    var forceU = this.options.ecmaVersion >= 11;
    var ch = state.current(forceU);
    state.advance(forceU);
    if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
      ch = state.lastIntValue;
    }
    if (isRegExpIdentifierPart(ch)) {
      state.lastIntValue = ch;
      return true;
    }
    state.pos = start;
    return false;
  };
  function isRegExpIdentifierPart(ch) {
    return isIdentifierChar(ch, true) || ch === 36 || ch === 95 || ch === 8204 || ch === 8205;
  }
  pp$1.regexp_eatAtomEscape = function(state) {
    if (this.regexp_eatBackReference(state) || this.regexp_eatCharacterClassEscape(state) || this.regexp_eatCharacterEscape(state) || state.switchN && this.regexp_eatKGroupName(state)) {
      return true;
    }
    if (state.switchU) {
      if (state.current() === 99) {
        state.raise("Invalid unicode escape");
      }
      state.raise("Invalid escape");
    }
    return false;
  };
  pp$1.regexp_eatBackReference = function(state) {
    var start = state.pos;
    if (this.regexp_eatDecimalEscape(state)) {
      var n = state.lastIntValue;
      if (state.switchU) {
        if (n > state.maxBackReference) {
          state.maxBackReference = n;
        }
        return true;
      }
      if (n <= state.numCapturingParens) {
        return true;
      }
      state.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatKGroupName = function(state) {
    if (state.eat(
      107
      /* k */
    )) {
      if (this.regexp_eatGroupName(state)) {
        state.backReferenceNames.push(state.lastStringValue);
        return true;
      }
      state.raise("Invalid named reference");
    }
    return false;
  };
  pp$1.regexp_eatCharacterEscape = function(state) {
    return this.regexp_eatControlEscape(state) || this.regexp_eatCControlLetter(state) || this.regexp_eatZero(state) || this.regexp_eatHexEscapeSequence(state) || this.regexp_eatRegExpUnicodeEscapeSequence(state, false) || !state.switchU && this.regexp_eatLegacyOctalEscapeSequence(state) || this.regexp_eatIdentityEscape(state);
  };
  pp$1.regexp_eatCControlLetter = function(state) {
    var start = state.pos;
    if (state.eat(
      99
      /* c */
    )) {
      if (this.regexp_eatControlLetter(state)) {
        return true;
      }
      state.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatZero = function(state) {
    if (state.current() === 48 && !isDecimalDigit(state.lookahead())) {
      state.lastIntValue = 0;
      state.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_eatControlEscape = function(state) {
    var ch = state.current();
    if (ch === 116) {
      state.lastIntValue = 9;
      state.advance();
      return true;
    }
    if (ch === 110) {
      state.lastIntValue = 10;
      state.advance();
      return true;
    }
    if (ch === 118) {
      state.lastIntValue = 11;
      state.advance();
      return true;
    }
    if (ch === 102) {
      state.lastIntValue = 12;
      state.advance();
      return true;
    }
    if (ch === 114) {
      state.lastIntValue = 13;
      state.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_eatControlLetter = function(state) {
    var ch = state.current();
    if (isControlLetter(ch)) {
      state.lastIntValue = ch % 32;
      state.advance();
      return true;
    }
    return false;
  };
  function isControlLetter(ch) {
    return ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122;
  }
  pp$1.regexp_eatRegExpUnicodeEscapeSequence = function(state, forceU) {
    if (forceU === void 0) forceU = false;
    var start = state.pos;
    var switchU = forceU || state.switchU;
    if (state.eat(
      117
      /* u */
    )) {
      if (this.regexp_eatFixedHexDigits(state, 4)) {
        var lead = state.lastIntValue;
        if (switchU && lead >= 55296 && lead <= 56319) {
          var leadSurrogateEnd = state.pos;
          if (state.eat(
            92
            /* \ */
          ) && state.eat(
            117
            /* u */
          ) && this.regexp_eatFixedHexDigits(state, 4)) {
            var trail = state.lastIntValue;
            if (trail >= 56320 && trail <= 57343) {
              state.lastIntValue = (lead - 55296) * 1024 + (trail - 56320) + 65536;
              return true;
            }
          }
          state.pos = leadSurrogateEnd;
          state.lastIntValue = lead;
        }
        return true;
      }
      if (switchU && state.eat(
        123
        /* { */
      ) && this.regexp_eatHexDigits(state) && state.eat(
        125
        /* } */
      ) && isValidUnicode(state.lastIntValue)) {
        return true;
      }
      if (switchU) {
        state.raise("Invalid unicode escape");
      }
      state.pos = start;
    }
    return false;
  };
  function isValidUnicode(ch) {
    return ch >= 0 && ch <= 1114111;
  }
  pp$1.regexp_eatIdentityEscape = function(state) {
    if (state.switchU) {
      if (this.regexp_eatSyntaxCharacter(state)) {
        return true;
      }
      if (state.eat(
        47
        /* / */
      )) {
        state.lastIntValue = 47;
        return true;
      }
      return false;
    }
    var ch = state.current();
    if (ch !== 99 && (!state.switchN || ch !== 107)) {
      state.lastIntValue = ch;
      state.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_eatDecimalEscape = function(state) {
    state.lastIntValue = 0;
    var ch = state.current();
    if (ch >= 49 && ch <= 57) {
      do {
        state.lastIntValue = 10 * state.lastIntValue + (ch - 48);
        state.advance();
      } while ((ch = state.current()) >= 48 && ch <= 57);
      return true;
    }
    return false;
  };
  var CharSetNone = 0;
  var CharSetOk = 1;
  var CharSetString = 2;
  pp$1.regexp_eatCharacterClassEscape = function(state) {
    var ch = state.current();
    if (isCharacterClassEscape(ch)) {
      state.lastIntValue = -1;
      state.advance();
      return CharSetOk;
    }
    var negate = false;
    if (state.switchU && this.options.ecmaVersion >= 9 && ((negate = ch === 80) || ch === 112)) {
      state.lastIntValue = -1;
      state.advance();
      var result;
      if (state.eat(
        123
        /* { */
      ) && (result = this.regexp_eatUnicodePropertyValueExpression(state)) && state.eat(
        125
        /* } */
      )) {
        if (negate && result === CharSetString) {
          state.raise("Invalid property name");
        }
        return result;
      }
      state.raise("Invalid property name");
    }
    return CharSetNone;
  };
  function isCharacterClassEscape(ch) {
    return ch === 100 || ch === 68 || ch === 115 || ch === 83 || ch === 119 || ch === 87;
  }
  pp$1.regexp_eatUnicodePropertyValueExpression = function(state) {
    var start = state.pos;
    if (this.regexp_eatUnicodePropertyName(state) && state.eat(
      61
      /* = */
    )) {
      var name3 = state.lastStringValue;
      if (this.regexp_eatUnicodePropertyValue(state)) {
        var value = state.lastStringValue;
        this.regexp_validateUnicodePropertyNameAndValue(state, name3, value);
        return CharSetOk;
      }
    }
    state.pos = start;
    if (this.regexp_eatLoneUnicodePropertyNameOrValue(state)) {
      var nameOrValue = state.lastStringValue;
      return this.regexp_validateUnicodePropertyNameOrValue(state, nameOrValue);
    }
    return CharSetNone;
  };
  pp$1.regexp_validateUnicodePropertyNameAndValue = function(state, name3, value) {
    if (!hasOwn(state.unicodeProperties.nonBinary, name3)) {
      state.raise("Invalid property name");
    }
    if (!state.unicodeProperties.nonBinary[name3].test(value)) {
      state.raise("Invalid property value");
    }
  };
  pp$1.regexp_validateUnicodePropertyNameOrValue = function(state, nameOrValue) {
    if (state.unicodeProperties.binary.test(nameOrValue)) {
      return CharSetOk;
    }
    if (state.switchV && state.unicodeProperties.binaryOfStrings.test(nameOrValue)) {
      return CharSetString;
    }
    state.raise("Invalid property name");
  };
  pp$1.regexp_eatUnicodePropertyName = function(state) {
    var ch = 0;
    state.lastStringValue = "";
    while (isUnicodePropertyNameCharacter(ch = state.current())) {
      state.lastStringValue += codePointToString(ch);
      state.advance();
    }
    return state.lastStringValue !== "";
  };
  function isUnicodePropertyNameCharacter(ch) {
    return isControlLetter(ch) || ch === 95;
  }
  pp$1.regexp_eatUnicodePropertyValue = function(state) {
    var ch = 0;
    state.lastStringValue = "";
    while (isUnicodePropertyValueCharacter(ch = state.current())) {
      state.lastStringValue += codePointToString(ch);
      state.advance();
    }
    return state.lastStringValue !== "";
  };
  function isUnicodePropertyValueCharacter(ch) {
    return isUnicodePropertyNameCharacter(ch) || isDecimalDigit(ch);
  }
  pp$1.regexp_eatLoneUnicodePropertyNameOrValue = function(state) {
    return this.regexp_eatUnicodePropertyValue(state);
  };
  pp$1.regexp_eatCharacterClass = function(state) {
    if (state.eat(
      91
      /* [ */
    )) {
      var negate = state.eat(
        94
        /* ^ */
      );
      var result = this.regexp_classContents(state);
      if (!state.eat(
        93
        /* ] */
      )) {
        state.raise("Unterminated character class");
      }
      if (negate && result === CharSetString) {
        state.raise("Negated character class may contain strings");
      }
      return true;
    }
    return false;
  };
  pp$1.regexp_classContents = function(state) {
    if (state.current() === 93) {
      return CharSetOk;
    }
    if (state.switchV) {
      return this.regexp_classSetExpression(state);
    }
    this.regexp_nonEmptyClassRanges(state);
    return CharSetOk;
  };
  pp$1.regexp_nonEmptyClassRanges = function(state) {
    while (this.regexp_eatClassAtom(state)) {
      var left = state.lastIntValue;
      if (state.eat(
        45
        /* - */
      ) && this.regexp_eatClassAtom(state)) {
        var right = state.lastIntValue;
        if (state.switchU && (left === -1 || right === -1)) {
          state.raise("Invalid character class");
        }
        if (left !== -1 && right !== -1 && left > right) {
          state.raise("Range out of order in character class");
        }
      }
    }
  };
  pp$1.regexp_eatClassAtom = function(state) {
    var start = state.pos;
    if (state.eat(
      92
      /* \ */
    )) {
      if (this.regexp_eatClassEscape(state)) {
        return true;
      }
      if (state.switchU) {
        var ch$1 = state.current();
        if (ch$1 === 99 || isOctalDigit(ch$1)) {
          state.raise("Invalid class escape");
        }
        state.raise("Invalid escape");
      }
      state.pos = start;
    }
    var ch = state.current();
    if (ch !== 93) {
      state.lastIntValue = ch;
      state.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_eatClassEscape = function(state) {
    var start = state.pos;
    if (state.eat(
      98
      /* b */
    )) {
      state.lastIntValue = 8;
      return true;
    }
    if (state.switchU && state.eat(
      45
      /* - */
    )) {
      state.lastIntValue = 45;
      return true;
    }
    if (!state.switchU && state.eat(
      99
      /* c */
    )) {
      if (this.regexp_eatClassControlLetter(state)) {
        return true;
      }
      state.pos = start;
    }
    return this.regexp_eatCharacterClassEscape(state) || this.regexp_eatCharacterEscape(state);
  };
  pp$1.regexp_classSetExpression = function(state) {
    var result = CharSetOk, subResult;
    if (this.regexp_eatClassSetRange(state)) ;
    else if (subResult = this.regexp_eatClassSetOperand(state)) {
      if (subResult === CharSetString) {
        result = CharSetString;
      }
      var start = state.pos;
      while (state.eatChars(
        [38, 38]
        /* && */
      )) {
        if (state.current() !== 38 && (subResult = this.regexp_eatClassSetOperand(state))) {
          if (subResult !== CharSetString) {
            result = CharSetOk;
          }
          continue;
        }
        state.raise("Invalid character in character class");
      }
      if (start !== state.pos) {
        return result;
      }
      while (state.eatChars(
        [45, 45]
        /* -- */
      )) {
        if (this.regexp_eatClassSetOperand(state)) {
          continue;
        }
        state.raise("Invalid character in character class");
      }
      if (start !== state.pos) {
        return result;
      }
    } else {
      state.raise("Invalid character in character class");
    }
    for (; ; ) {
      if (this.regexp_eatClassSetRange(state)) {
        continue;
      }
      subResult = this.regexp_eatClassSetOperand(state);
      if (!subResult) {
        return result;
      }
      if (subResult === CharSetString) {
        result = CharSetString;
      }
    }
  };
  pp$1.regexp_eatClassSetRange = function(state) {
    var start = state.pos;
    if (this.regexp_eatClassSetCharacter(state)) {
      var left = state.lastIntValue;
      if (state.eat(
        45
        /* - */
      ) && this.regexp_eatClassSetCharacter(state)) {
        var right = state.lastIntValue;
        if (left !== -1 && right !== -1 && left > right) {
          state.raise("Range out of order in character class");
        }
        return true;
      }
      state.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatClassSetOperand = function(state) {
    if (this.regexp_eatClassSetCharacter(state)) {
      return CharSetOk;
    }
    return this.regexp_eatClassStringDisjunction(state) || this.regexp_eatNestedClass(state);
  };
  pp$1.regexp_eatNestedClass = function(state) {
    var start = state.pos;
    if (state.eat(
      91
      /* [ */
    )) {
      var negate = state.eat(
        94
        /* ^ */
      );
      var result = this.regexp_classContents(state);
      if (state.eat(
        93
        /* ] */
      )) {
        if (negate && result === CharSetString) {
          state.raise("Negated character class may contain strings");
        }
        return result;
      }
      state.pos = start;
    }
    if (state.eat(
      92
      /* \ */
    )) {
      var result$1 = this.regexp_eatCharacterClassEscape(state);
      if (result$1) {
        return result$1;
      }
      state.pos = start;
    }
    return null;
  };
  pp$1.regexp_eatClassStringDisjunction = function(state) {
    var start = state.pos;
    if (state.eatChars(
      [92, 113]
      /* \q */
    )) {
      if (state.eat(
        123
        /* { */
      )) {
        var result = this.regexp_classStringDisjunctionContents(state);
        if (state.eat(
          125
          /* } */
        )) {
          return result;
        }
      } else {
        state.raise("Invalid escape");
      }
      state.pos = start;
    }
    return null;
  };
  pp$1.regexp_classStringDisjunctionContents = function(state) {
    var result = this.regexp_classString(state);
    while (state.eat(
      124
      /* | */
    )) {
      if (this.regexp_classString(state) === CharSetString) {
        result = CharSetString;
      }
    }
    return result;
  };
  pp$1.regexp_classString = function(state) {
    var count = 0;
    while (this.regexp_eatClassSetCharacter(state)) {
      count++;
    }
    return count === 1 ? CharSetOk : CharSetString;
  };
  pp$1.regexp_eatClassSetCharacter = function(state) {
    var start = state.pos;
    if (state.eat(
      92
      /* \ */
    )) {
      if (this.regexp_eatCharacterEscape(state) || this.regexp_eatClassSetReservedPunctuator(state)) {
        return true;
      }
      if (state.eat(
        98
        /* b */
      )) {
        state.lastIntValue = 8;
        return true;
      }
      state.pos = start;
      return false;
    }
    var ch = state.current();
    if (ch < 0 || ch === state.lookahead() && isClassSetReservedDoublePunctuatorCharacter(ch)) {
      return false;
    }
    if (isClassSetSyntaxCharacter(ch)) {
      return false;
    }
    state.advance();
    state.lastIntValue = ch;
    return true;
  };
  function isClassSetReservedDoublePunctuatorCharacter(ch) {
    return ch === 33 || ch >= 35 && ch <= 38 || ch >= 42 && ch <= 44 || ch === 46 || ch >= 58 && ch <= 64 || ch === 94 || ch === 96 || ch === 126;
  }
  function isClassSetSyntaxCharacter(ch) {
    return ch === 40 || ch === 41 || ch === 45 || ch === 47 || ch >= 91 && ch <= 93 || ch >= 123 && ch <= 125;
  }
  pp$1.regexp_eatClassSetReservedPunctuator = function(state) {
    var ch = state.current();
    if (isClassSetReservedPunctuator(ch)) {
      state.lastIntValue = ch;
      state.advance();
      return true;
    }
    return false;
  };
  function isClassSetReservedPunctuator(ch) {
    return ch === 33 || ch === 35 || ch === 37 || ch === 38 || ch === 44 || ch === 45 || ch >= 58 && ch <= 62 || ch === 64 || ch === 96 || ch === 126;
  }
  pp$1.regexp_eatClassControlLetter = function(state) {
    var ch = state.current();
    if (isDecimalDigit(ch) || ch === 95) {
      state.lastIntValue = ch % 32;
      state.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_eatHexEscapeSequence = function(state) {
    var start = state.pos;
    if (state.eat(
      120
      /* x */
    )) {
      if (this.regexp_eatFixedHexDigits(state, 2)) {
        return true;
      }
      if (state.switchU) {
        state.raise("Invalid escape");
      }
      state.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatDecimalDigits = function(state) {
    var start = state.pos;
    var ch = 0;
    state.lastIntValue = 0;
    while (isDecimalDigit(ch = state.current())) {
      state.lastIntValue = 10 * state.lastIntValue + (ch - 48);
      state.advance();
    }
    return state.pos !== start;
  };
  function isDecimalDigit(ch) {
    return ch >= 48 && ch <= 57;
  }
  pp$1.regexp_eatHexDigits = function(state) {
    var start = state.pos;
    var ch = 0;
    state.lastIntValue = 0;
    while (isHexDigit(ch = state.current())) {
      state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
      state.advance();
    }
    return state.pos !== start;
  };
  function isHexDigit(ch) {
    return ch >= 48 && ch <= 57 || ch >= 65 && ch <= 70 || ch >= 97 && ch <= 102;
  }
  function hexToInt(ch) {
    if (ch >= 65 && ch <= 70) {
      return 10 + (ch - 65);
    }
    if (ch >= 97 && ch <= 102) {
      return 10 + (ch - 97);
    }
    return ch - 48;
  }
  pp$1.regexp_eatLegacyOctalEscapeSequence = function(state) {
    if (this.regexp_eatOctalDigit(state)) {
      var n1 = state.lastIntValue;
      if (this.regexp_eatOctalDigit(state)) {
        var n2 = state.lastIntValue;
        if (n1 <= 3 && this.regexp_eatOctalDigit(state)) {
          state.lastIntValue = n1 * 64 + n2 * 8 + state.lastIntValue;
        } else {
          state.lastIntValue = n1 * 8 + n2;
        }
      } else {
        state.lastIntValue = n1;
      }
      return true;
    }
    return false;
  };
  pp$1.regexp_eatOctalDigit = function(state) {
    var ch = state.current();
    if (isOctalDigit(ch)) {
      state.lastIntValue = ch - 48;
      state.advance();
      return true;
    }
    state.lastIntValue = 0;
    return false;
  };
  function isOctalDigit(ch) {
    return ch >= 48 && ch <= 55;
  }
  pp$1.regexp_eatFixedHexDigits = function(state, length) {
    var start = state.pos;
    state.lastIntValue = 0;
    for (var i2 = 0; i2 < length; ++i2) {
      var ch = state.current();
      if (!isHexDigit(ch)) {
        state.pos = start;
        return false;
      }
      state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
      state.advance();
    }
    return true;
  };
  var Token = function Token2(p) {
    this.type = p.type;
    this.value = p.value;
    this.start = p.start;
    this.end = p.end;
    if (p.options.locations) {
      this.loc = new SourceLocation(p, p.startLoc, p.endLoc);
    }
    if (p.options.ranges) {
      this.range = [p.start, p.end];
    }
  };
  var pp = Parser.prototype;
  pp.next = function(ignoreEscapeSequenceInKeyword) {
    if (!ignoreEscapeSequenceInKeyword && this.type.keyword && this.containsEsc) {
      this.raiseRecoverable(this.start, "Escape sequence in keyword " + this.type.keyword);
    }
    if (this.options.onToken) {
      this.options.onToken(new Token(this));
    }
    this.lastTokEnd = this.end;
    this.lastTokStart = this.start;
    this.lastTokEndLoc = this.endLoc;
    this.lastTokStartLoc = this.startLoc;
    this.nextToken();
  };
  pp.getToken = function() {
    this.next();
    return new Token(this);
  };
  if (typeof Symbol !== "undefined") {
    pp[Symbol.iterator] = function() {
      var this$1$1 = this;
      return {
        next: function() {
          var token = this$1$1.getToken();
          return {
            done: token.type === types$1.eof,
            value: token
          };
        }
      };
    };
  }
  pp.nextToken = function() {
    var curContext = this.curContext();
    if (!curContext || !curContext.preserveSpace) {
      this.skipSpace();
    }
    this.start = this.pos;
    if (this.options.locations) {
      this.startLoc = this.curPosition();
    }
    if (this.pos >= this.input.length) {
      return this.finishToken(types$1.eof);
    }
    if (curContext.override) {
      return curContext.override(this);
    } else {
      this.readToken(this.fullCharCodeAtPos());
    }
  };
  pp.readToken = function(code) {
    if (isIdentifierStart(code, this.options.ecmaVersion >= 6) || code === 92) {
      return this.readWord();
    }
    return this.getTokenFromCode(code);
  };
  pp.fullCharCodeAtPos = function() {
    var code = this.input.charCodeAt(this.pos);
    if (code <= 55295 || code >= 56320) {
      return code;
    }
    var next = this.input.charCodeAt(this.pos + 1);
    return next <= 56319 || next >= 57344 ? code : (code << 10) + next - 56613888;
  };
  pp.skipBlockComment = function() {
    var startLoc = this.options.onComment && this.curPosition();
    var start = this.pos, end = this.input.indexOf("*/", this.pos += 2);
    if (end === -1) {
      this.raise(this.pos - 2, "Unterminated comment");
    }
    this.pos = end + 2;
    if (this.options.locations) {
      for (var nextBreak = void 0, pos = start; (nextBreak = nextLineBreak(this.input, pos, this.pos)) > -1; ) {
        ++this.curLine;
        pos = this.lineStart = nextBreak;
      }
    }
    if (this.options.onComment) {
      this.options.onComment(
        true,
        this.input.slice(start + 2, end),
        start,
        this.pos,
        startLoc,
        this.curPosition()
      );
    }
  };
  pp.skipLineComment = function(startSkip) {
    var start = this.pos;
    var startLoc = this.options.onComment && this.curPosition();
    var ch = this.input.charCodeAt(this.pos += startSkip);
    while (this.pos < this.input.length && !isNewLine(ch)) {
      ch = this.input.charCodeAt(++this.pos);
    }
    if (this.options.onComment) {
      this.options.onComment(
        false,
        this.input.slice(start + startSkip, this.pos),
        start,
        this.pos,
        startLoc,
        this.curPosition()
      );
    }
  };
  pp.skipSpace = function() {
    loop: while (this.pos < this.input.length) {
      var ch = this.input.charCodeAt(this.pos);
      switch (ch) {
        case 32:
        case 160:
          ++this.pos;
          break;
        case 13:
          if (this.input.charCodeAt(this.pos + 1) === 10) {
            ++this.pos;
          }
        case 10:
        case 8232:
        case 8233:
          ++this.pos;
          if (this.options.locations) {
            ++this.curLine;
            this.lineStart = this.pos;
          }
          break;
        case 47:
          switch (this.input.charCodeAt(this.pos + 1)) {
            case 42:
              this.skipBlockComment();
              break;
            case 47:
              this.skipLineComment(2);
              break;
            default:
              break loop;
          }
          break;
        default:
          if (ch > 8 && ch < 14 || ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch))) {
            ++this.pos;
          } else {
            break loop;
          }
      }
    }
  };
  pp.finishToken = function(type, val) {
    this.end = this.pos;
    if (this.options.locations) {
      this.endLoc = this.curPosition();
    }
    var prevType = this.type;
    this.type = type;
    this.value = val;
    this.updateContext(prevType);
  };
  pp.readToken_dot = function() {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next >= 48 && next <= 57) {
      return this.readNumber(true);
    }
    var next2 = this.input.charCodeAt(this.pos + 2);
    if (this.options.ecmaVersion >= 6 && next === 46 && next2 === 46) {
      this.pos += 3;
      return this.finishToken(types$1.ellipsis);
    } else {
      ++this.pos;
      return this.finishToken(types$1.dot);
    }
  };
  pp.readToken_slash = function() {
    var next = this.input.charCodeAt(this.pos + 1);
    if (this.exprAllowed) {
      ++this.pos;
      return this.readRegexp();
    }
    if (next === 61) {
      return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(types$1.slash, 1);
  };
  pp.readToken_mult_modulo_exp = function(code) {
    var next = this.input.charCodeAt(this.pos + 1);
    var size = 1;
    var tokentype = code === 42 ? types$1.star : types$1.modulo;
    if (this.options.ecmaVersion >= 7 && code === 42 && next === 42) {
      ++size;
      tokentype = types$1.starstar;
      next = this.input.charCodeAt(this.pos + 2);
    }
    if (next === 61) {
      return this.finishOp(types$1.assign, size + 1);
    }
    return this.finishOp(tokentype, size);
  };
  pp.readToken_pipe_amp = function(code) {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === code) {
      if (this.options.ecmaVersion >= 12) {
        var next2 = this.input.charCodeAt(this.pos + 2);
        if (next2 === 61) {
          return this.finishOp(types$1.assign, 3);
        }
      }
      return this.finishOp(code === 124 ? types$1.logicalOR : types$1.logicalAND, 2);
    }
    if (next === 61) {
      return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(code === 124 ? types$1.bitwiseOR : types$1.bitwiseAND, 1);
  };
  pp.readToken_caret = function() {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 61) {
      return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(types$1.bitwiseXOR, 1);
  };
  pp.readToken_plus_min = function(code) {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === code) {
      if (next === 45 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 62 && (this.lastTokEnd === 0 || lineBreak.test(this.input.slice(this.lastTokEnd, this.pos)))) {
        this.skipLineComment(3);
        this.skipSpace();
        return this.nextToken();
      }
      return this.finishOp(types$1.incDec, 2);
    }
    if (next === 61) {
      return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(types$1.plusMin, 1);
  };
  pp.readToken_lt_gt = function(code) {
    var next = this.input.charCodeAt(this.pos + 1);
    var size = 1;
    if (next === code) {
      size = code === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2;
      if (this.input.charCodeAt(this.pos + size) === 61) {
        return this.finishOp(types$1.assign, size + 1);
      }
      return this.finishOp(types$1.bitShift, size);
    }
    if (next === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 45 && this.input.charCodeAt(this.pos + 3) === 45) {
      this.skipLineComment(4);
      this.skipSpace();
      return this.nextToken();
    }
    if (next === 61) {
      size = 2;
    }
    return this.finishOp(types$1.relational, size);
  };
  pp.readToken_eq_excl = function(code) {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 61) {
      return this.finishOp(types$1.equality, this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2);
    }
    if (code === 61 && next === 62 && this.options.ecmaVersion >= 6) {
      this.pos += 2;
      return this.finishToken(types$1.arrow);
    }
    return this.finishOp(code === 61 ? types$1.eq : types$1.prefix, 1);
  };
  pp.readToken_question = function() {
    var ecmaVersion2 = this.options.ecmaVersion;
    if (ecmaVersion2 >= 11) {
      var next = this.input.charCodeAt(this.pos + 1);
      if (next === 46) {
        var next2 = this.input.charCodeAt(this.pos + 2);
        if (next2 < 48 || next2 > 57) {
          return this.finishOp(types$1.questionDot, 2);
        }
      }
      if (next === 63) {
        if (ecmaVersion2 >= 12) {
          var next2$1 = this.input.charCodeAt(this.pos + 2);
          if (next2$1 === 61) {
            return this.finishOp(types$1.assign, 3);
          }
        }
        return this.finishOp(types$1.coalesce, 2);
      }
    }
    return this.finishOp(types$1.question, 1);
  };
  pp.readToken_numberSign = function() {
    var ecmaVersion2 = this.options.ecmaVersion;
    var code = 35;
    if (ecmaVersion2 >= 13) {
      ++this.pos;
      code = this.fullCharCodeAtPos();
      if (isIdentifierStart(code, true) || code === 92) {
        return this.finishToken(types$1.privateId, this.readWord1());
      }
    }
    this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
  };
  pp.getTokenFromCode = function(code) {
    switch (code) {
      // The interpretation of a dot depends on whether it is followed
      // by a digit or another two dots.
      case 46:
        return this.readToken_dot();
      // Punctuation tokens.
      case 40:
        ++this.pos;
        return this.finishToken(types$1.parenL);
      case 41:
        ++this.pos;
        return this.finishToken(types$1.parenR);
      case 59:
        ++this.pos;
        return this.finishToken(types$1.semi);
      case 44:
        ++this.pos;
        return this.finishToken(types$1.comma);
      case 91:
        ++this.pos;
        return this.finishToken(types$1.bracketL);
      case 93:
        ++this.pos;
        return this.finishToken(types$1.bracketR);
      case 123:
        ++this.pos;
        return this.finishToken(types$1.braceL);
      case 125:
        ++this.pos;
        return this.finishToken(types$1.braceR);
      case 58:
        ++this.pos;
        return this.finishToken(types$1.colon);
      case 96:
        if (this.options.ecmaVersion < 6) {
          break;
        }
        ++this.pos;
        return this.finishToken(types$1.backQuote);
      case 48:
        var next = this.input.charCodeAt(this.pos + 1);
        if (next === 120 || next === 88) {
          return this.readRadixNumber(16);
        }
        if (this.options.ecmaVersion >= 6) {
          if (next === 111 || next === 79) {
            return this.readRadixNumber(8);
          }
          if (next === 98 || next === 66) {
            return this.readRadixNumber(2);
          }
        }
      // Anything else beginning with a digit is an integer, octal
      // number, or float.
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        return this.readNumber(false);
      // Quotes produce strings.
      case 34:
      case 39:
        return this.readString(code);
      // Operators are parsed inline in tiny state machines. '=' (61) is
      // often referred to. `finishOp` simply skips the amount of
      // characters it is given as second argument, and returns a token
      // of the type given by its first argument.
      case 47:
        return this.readToken_slash();
      case 37:
      case 42:
        return this.readToken_mult_modulo_exp(code);
      case 124:
      case 38:
        return this.readToken_pipe_amp(code);
      case 94:
        return this.readToken_caret();
      case 43:
      case 45:
        return this.readToken_plus_min(code);
      case 60:
      case 62:
        return this.readToken_lt_gt(code);
      case 61:
      case 33:
        return this.readToken_eq_excl(code);
      case 63:
        return this.readToken_question();
      case 126:
        return this.finishOp(types$1.prefix, 1);
      case 35:
        return this.readToken_numberSign();
    }
    this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
  };
  pp.finishOp = function(type, size) {
    var str = this.input.slice(this.pos, this.pos + size);
    this.pos += size;
    return this.finishToken(type, str);
  };
  pp.readRegexp = function() {
    var escaped, inClass, start = this.pos;
    for (; ; ) {
      if (this.pos >= this.input.length) {
        this.raise(start, "Unterminated regular expression");
      }
      var ch = this.input.charAt(this.pos);
      if (lineBreak.test(ch)) {
        this.raise(start, "Unterminated regular expression");
      }
      if (!escaped) {
        if (ch === "[") {
          inClass = true;
        } else if (ch === "]" && inClass) {
          inClass = false;
        } else if (ch === "/" && !inClass) {
          break;
        }
        escaped = ch === "\\";
      } else {
        escaped = false;
      }
      ++this.pos;
    }
    var pattern = this.input.slice(start, this.pos);
    ++this.pos;
    var flagsStart = this.pos;
    var flags = this.readWord1();
    if (this.containsEsc) {
      this.unexpected(flagsStart);
    }
    var state = this.regexpState || (this.regexpState = new RegExpValidationState(this));
    state.reset(start, pattern, flags);
    this.validateRegExpFlags(state);
    this.validateRegExpPattern(state);
    var value = null;
    try {
      value = new RegExp(pattern, flags);
    } catch (e) {
    }
    return this.finishToken(types$1.regexp, { pattern, flags, value });
  };
  pp.readInt = function(radix, len, maybeLegacyOctalNumericLiteral) {
    var allowSeparators = this.options.ecmaVersion >= 12 && len === void 0;
    var isLegacyOctalNumericLiteral = maybeLegacyOctalNumericLiteral && this.input.charCodeAt(this.pos) === 48;
    var start = this.pos, total = 0, lastCode = 0;
    for (var i2 = 0, e = len == null ? Infinity : len; i2 < e; ++i2, ++this.pos) {
      var code = this.input.charCodeAt(this.pos), val = void 0;
      if (allowSeparators && code === 95) {
        if (isLegacyOctalNumericLiteral) {
          this.raiseRecoverable(this.pos, "Numeric separator is not allowed in legacy octal numeric literals");
        }
        if (lastCode === 95) {
          this.raiseRecoverable(this.pos, "Numeric separator must be exactly one underscore");
        }
        if (i2 === 0) {
          this.raiseRecoverable(this.pos, "Numeric separator is not allowed at the first of digits");
        }
        lastCode = code;
        continue;
      }
      if (code >= 97) {
        val = code - 97 + 10;
      } else if (code >= 65) {
        val = code - 65 + 10;
      } else if (code >= 48 && code <= 57) {
        val = code - 48;
      } else {
        val = Infinity;
      }
      if (val >= radix) {
        break;
      }
      lastCode = code;
      total = total * radix + val;
    }
    if (allowSeparators && lastCode === 95) {
      this.raiseRecoverable(this.pos - 1, "Numeric separator is not allowed at the last of digits");
    }
    if (this.pos === start || len != null && this.pos - start !== len) {
      return null;
    }
    return total;
  };
  function stringToNumber(str, isLegacyOctalNumericLiteral) {
    if (isLegacyOctalNumericLiteral) {
      return parseInt(str, 8);
    }
    return parseFloat(str.replace(/_/g, ""));
  }
  function stringToBigInt(str) {
    if (typeof BigInt !== "function") {
      return null;
    }
    return BigInt(str.replace(/_/g, ""));
  }
  pp.readRadixNumber = function(radix) {
    var start = this.pos;
    this.pos += 2;
    var val = this.readInt(radix);
    if (val == null) {
      this.raise(this.start + 2, "Expected number in radix " + radix);
    }
    if (this.options.ecmaVersion >= 11 && this.input.charCodeAt(this.pos) === 110) {
      val = stringToBigInt(this.input.slice(start, this.pos));
      ++this.pos;
    } else if (isIdentifierStart(this.fullCharCodeAtPos())) {
      this.raise(this.pos, "Identifier directly after number");
    }
    return this.finishToken(types$1.num, val);
  };
  pp.readNumber = function(startsWithDot) {
    var start = this.pos;
    if (!startsWithDot && this.readInt(10, void 0, true) === null) {
      this.raise(start, "Invalid number");
    }
    var octal = this.pos - start >= 2 && this.input.charCodeAt(start) === 48;
    if (octal && this.strict) {
      this.raise(start, "Invalid number");
    }
    var next = this.input.charCodeAt(this.pos);
    if (!octal && !startsWithDot && this.options.ecmaVersion >= 11 && next === 110) {
      var val$1 = stringToBigInt(this.input.slice(start, this.pos));
      ++this.pos;
      if (isIdentifierStart(this.fullCharCodeAtPos())) {
        this.raise(this.pos, "Identifier directly after number");
      }
      return this.finishToken(types$1.num, val$1);
    }
    if (octal && /[89]/.test(this.input.slice(start, this.pos))) {
      octal = false;
    }
    if (next === 46 && !octal) {
      ++this.pos;
      this.readInt(10);
      next = this.input.charCodeAt(this.pos);
    }
    if ((next === 69 || next === 101) && !octal) {
      next = this.input.charCodeAt(++this.pos);
      if (next === 43 || next === 45) {
        ++this.pos;
      }
      if (this.readInt(10) === null) {
        this.raise(start, "Invalid number");
      }
    }
    if (isIdentifierStart(this.fullCharCodeAtPos())) {
      this.raise(this.pos, "Identifier directly after number");
    }
    var val = stringToNumber(this.input.slice(start, this.pos), octal);
    return this.finishToken(types$1.num, val);
  };
  pp.readCodePoint = function() {
    var ch = this.input.charCodeAt(this.pos), code;
    if (ch === 123) {
      if (this.options.ecmaVersion < 6) {
        this.unexpected();
      }
      var codePos = ++this.pos;
      code = this.readHexChar(this.input.indexOf("}", this.pos) - this.pos);
      ++this.pos;
      if (code > 1114111) {
        this.invalidStringToken(codePos, "Code point out of bounds");
      }
    } else {
      code = this.readHexChar(4);
    }
    return code;
  };
  pp.readString = function(quote2) {
    var out = "", chunkStart = ++this.pos;
    for (; ; ) {
      if (this.pos >= this.input.length) {
        this.raise(this.start, "Unterminated string constant");
      }
      var ch = this.input.charCodeAt(this.pos);
      if (ch === quote2) {
        break;
      }
      if (ch === 92) {
        out += this.input.slice(chunkStart, this.pos);
        out += this.readEscapedChar(false);
        chunkStart = this.pos;
      } else if (ch === 8232 || ch === 8233) {
        if (this.options.ecmaVersion < 10) {
          this.raise(this.start, "Unterminated string constant");
        }
        ++this.pos;
        if (this.options.locations) {
          this.curLine++;
          this.lineStart = this.pos;
        }
      } else {
        if (isNewLine(ch)) {
          this.raise(this.start, "Unterminated string constant");
        }
        ++this.pos;
      }
    }
    out += this.input.slice(chunkStart, this.pos++);
    return this.finishToken(types$1.string, out);
  };
  var INVALID_TEMPLATE_ESCAPE_ERROR = {};
  pp.tryReadTemplateToken = function() {
    this.inTemplateElement = true;
    try {
      this.readTmplToken();
    } catch (err) {
      if (err === INVALID_TEMPLATE_ESCAPE_ERROR) {
        this.readInvalidTemplateToken();
      } else {
        throw err;
      }
    }
    this.inTemplateElement = false;
  };
  pp.invalidStringToken = function(position, message) {
    if (this.inTemplateElement && this.options.ecmaVersion >= 9) {
      throw INVALID_TEMPLATE_ESCAPE_ERROR;
    } else {
      this.raise(position, message);
    }
  };
  pp.readTmplToken = function() {
    var out = "", chunkStart = this.pos;
    for (; ; ) {
      if (this.pos >= this.input.length) {
        this.raise(this.start, "Unterminated template");
      }
      var ch = this.input.charCodeAt(this.pos);
      if (ch === 96 || ch === 36 && this.input.charCodeAt(this.pos + 1) === 123) {
        if (this.pos === this.start && (this.type === types$1.template || this.type === types$1.invalidTemplate)) {
          if (ch === 36) {
            this.pos += 2;
            return this.finishToken(types$1.dollarBraceL);
          } else {
            ++this.pos;
            return this.finishToken(types$1.backQuote);
          }
        }
        out += this.input.slice(chunkStart, this.pos);
        return this.finishToken(types$1.template, out);
      }
      if (ch === 92) {
        out += this.input.slice(chunkStart, this.pos);
        out += this.readEscapedChar(true);
        chunkStart = this.pos;
      } else if (isNewLine(ch)) {
        out += this.input.slice(chunkStart, this.pos);
        ++this.pos;
        switch (ch) {
          case 13:
            if (this.input.charCodeAt(this.pos) === 10) {
              ++this.pos;
            }
          case 10:
            out += "\n";
            break;
          default:
            out += String.fromCharCode(ch);
            break;
        }
        if (this.options.locations) {
          ++this.curLine;
          this.lineStart = this.pos;
        }
        chunkStart = this.pos;
      } else {
        ++this.pos;
      }
    }
  };
  pp.readInvalidTemplateToken = function() {
    for (; this.pos < this.input.length; this.pos++) {
      switch (this.input[this.pos]) {
        case "\\":
          ++this.pos;
          break;
        case "$":
          if (this.input[this.pos + 1] !== "{") {
            break;
          }
        // fall through
        case "`":
          return this.finishToken(types$1.invalidTemplate, this.input.slice(this.start, this.pos));
        case "\r":
          if (this.input[this.pos + 1] === "\n") {
            ++this.pos;
          }
        // fall through
        case "\n":
        case "\u2028":
        case "\u2029":
          ++this.curLine;
          this.lineStart = this.pos + 1;
          break;
      }
    }
    this.raise(this.start, "Unterminated template");
  };
  pp.readEscapedChar = function(inTemplate) {
    var ch = this.input.charCodeAt(++this.pos);
    ++this.pos;
    switch (ch) {
      case 110:
        return "\n";
      // 'n' -> '\n'
      case 114:
        return "\r";
      // 'r' -> '\r'
      case 120:
        return String.fromCharCode(this.readHexChar(2));
      // 'x'
      case 117:
        return codePointToString(this.readCodePoint());
      // 'u'
      case 116:
        return "	";
      // 't' -> '\t'
      case 98:
        return "\b";
      // 'b' -> '\b'
      case 118:
        return "\v";
      // 'v' -> '\u000b'
      case 102:
        return "\f";
      // 'f' -> '\f'
      case 13:
        if (this.input.charCodeAt(this.pos) === 10) {
          ++this.pos;
        }
      // '\r\n'
      case 10:
        if (this.options.locations) {
          this.lineStart = this.pos;
          ++this.curLine;
        }
        return "";
      case 56:
      case 57:
        if (this.strict) {
          this.invalidStringToken(
            this.pos - 1,
            "Invalid escape sequence"
          );
        }
        if (inTemplate) {
          var codePos = this.pos - 1;
          this.invalidStringToken(
            codePos,
            "Invalid escape sequence in template string"
          );
        }
      default:
        if (ch >= 48 && ch <= 55) {
          var octalStr = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0];
          var octal = parseInt(octalStr, 8);
          if (octal > 255) {
            octalStr = octalStr.slice(0, -1);
            octal = parseInt(octalStr, 8);
          }
          this.pos += octalStr.length - 1;
          ch = this.input.charCodeAt(this.pos);
          if ((octalStr !== "0" || ch === 56 || ch === 57) && (this.strict || inTemplate)) {
            this.invalidStringToken(
              this.pos - 1 - octalStr.length,
              inTemplate ? "Octal literal in template string" : "Octal literal in strict mode"
            );
          }
          return String.fromCharCode(octal);
        }
        if (isNewLine(ch)) {
          if (this.options.locations) {
            this.lineStart = this.pos;
            ++this.curLine;
          }
          return "";
        }
        return String.fromCharCode(ch);
    }
  };
  pp.readHexChar = function(len) {
    var codePos = this.pos;
    var n = this.readInt(16, len);
    if (n === null) {
      this.invalidStringToken(codePos, "Bad character escape sequence");
    }
    return n;
  };
  pp.readWord1 = function() {
    this.containsEsc = false;
    var word = "", first = true, chunkStart = this.pos;
    var astral = this.options.ecmaVersion >= 6;
    while (this.pos < this.input.length) {
      var ch = this.fullCharCodeAtPos();
      if (isIdentifierChar(ch, astral)) {
        this.pos += ch <= 65535 ? 1 : 2;
      } else if (ch === 92) {
        this.containsEsc = true;
        word += this.input.slice(chunkStart, this.pos);
        var escStart = this.pos;
        if (this.input.charCodeAt(++this.pos) !== 117) {
          this.invalidStringToken(this.pos, "Expecting Unicode escape sequence \\uXXXX");
        }
        ++this.pos;
        var esc = this.readCodePoint();
        if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral)) {
          this.invalidStringToken(escStart, "Invalid Unicode escape");
        }
        word += codePointToString(esc);
        chunkStart = this.pos;
      } else {
        break;
      }
      first = false;
    }
    return word + this.input.slice(chunkStart, this.pos);
  };
  pp.readWord = function() {
    var word = this.readWord1();
    var type = types$1.name;
    if (this.keywords.test(word)) {
      type = keywords[word];
    }
    return this.finishToken(type, word);
  };
  var version = "8.15.0";
  Parser.acorn = {
    Parser,
    version,
    defaultOptions,
    Position,
    SourceLocation,
    getLineInfo,
    Node,
    TokenType,
    tokTypes: types$1,
    keywordTypes: keywords,
    TokContext,
    tokContexts: types,
    isIdentifierChar,
    isIdentifierStart,
    Token,
    isNewLine,
    lineBreak,
    lineBreakG,
    nonASCIIwhitespace
  };
  function parse3(input, options) {
    return Parser.parse(input, options);
  }

  // packages/manifold-author/web-view.js
  function validateWebView(value) {
    if (value == null) return null;
    if (value.version !== 1 || typeof value.source !== "string")
      throw new Error("Expected a version 1 web view with source under 128 KB");
    const dependencies = value.dependencies ?? {};
    if (typeof dependencies !== "object" || Array.isArray(dependencies) || dependencies === null)
      throw new Error("Web view dependencies must map module names to exact versions");
    for (const [name3, version2] of Object.entries(dependencies)) {
      if (!name3 || typeof version2 !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version2))
        throw new Error("Web view dependencies require exact versions");
    }
    const tree2 = parse3(value.source, { ecmaVersion: 2022, sourceType: "module" });
    if (!tree2.body.some((node) => node.type === "ExportDefaultDeclaration"))
      throw new Error("Web views export a default synchronous view factory");
    for (const node of tree2.body) {
      if (node.type === "ImportDeclaration" && !Object.hasOwn(dependencies, node.source.value))
        throw new Error(`Declare the web view dependency ${node.source.value}`);
    }
    const height = value.height ?? 300;
    if (!Number.isFinite(height) || height < 160 || height > 800)
      throw new Error("Web view height must be between 160 and 800 pixels");
    const role = value.role ?? "visual";
    if (!["visual", "instrument"].includes(role)) throw new Error("Unknown web view role");
    const layout = value.layout ?? [];
    if (!Array.isArray(layout)) throw new Error("Expected presentation controls");
    const paths = /* @__PURE__ */ new Set();
    const ids = /* @__PURE__ */ new Set();
    for (const item of layout) {
      if (typeof item.path !== "string" || !item.path.startsWith("/") || paths.has(item.path))
        throw new Error("Layout controls need unique parameter paths");
      paths.add(item.path);
      if (item.id !== void 0 && (typeof item.id !== "string" || !item.id))
        throw new Error("Presentation component IDs must be unique nonempty strings");
      const identity = item.id ?? item.path;
      if (ids.has(identity)) throw new Error("Presentation component IDs must be unique");
      ids.add(identity);
      if (item.label !== void 0 && typeof item.label !== "string")
        throw new Error("Presentation labels must be strings under 96 characters");
      if (item.accent !== void 0 && !/^#[0-9a-f]{6}$/i.test(item.accent))
        throw new Error("Presentation accents must be six-digit hex colors");
      for (const key of ["x", "y", "width"])
        if (!Number.isFinite(item[key])) throw new Error("Layout coordinates must be finite");
      if (item.x < 0 || item.y < 0 || item.y > 80 || item.width < 8 || item.x + item.width > 100)
        throw new Error("Layout control is outside the presentation panel");
      if (item.compact !== void 0) {
        const c = item.compact;
        if (!c || !["x", "y", "width"].every((key) => Number.isFinite(c[key])) || c.x < 0 || c.y < 0 || c.y > 80 || c.width < 8 || c.x + c.width > 100)
          throw new Error("Compact layout control is outside the presentation panel");
      }
    }
    return {
      version: 1,
      source: value.source,
      dependencies: { ...dependencies },
      height,
      ...value.role ? { role } : {},
      ...value.layout ? { layout: layout.map(({ path, x, y, width, id, label: label2, accent, compact }) => ({
        path,
        x,
        y,
        width,
        ...id ? { id } : {},
        ...label2 !== void 0 ? { label: label2 } : {},
        ...accent ? { accent } : {},
        ...compact ? { compact: { x: compact.x, y: compact.y, width: compact.width } } : {}
      })) } : {}
    };
  }
  function replaceWebViewSource(projectSource, viewSource) {
    const tree2 = parse3(projectSource, { ecmaVersion: 2022, sourceType: "module" });
    const declaration = tree2.body.flatMap((node) => node.declarations ?? []).find((node) => node.id.name === "webViewSource");
    if (!declaration?.init) throw new Error("This sketch has no editable webViewSource declaration");
    return projectSource.slice(0, declaration.init.start) + JSON.stringify(viewSource) + projectSource.slice(declaration.init.end);
  }
  function replacePresentationLayout(projectSource, layout) {
    const tree2 = parse3(projectSource, { ecmaVersion: 2022, sourceType: "module" });
    const declaration = tree2.body.flatMap((node) => node.declarations ?? []).find((node) => node.id.name === "presentationLayout");
    if (!declaration?.init) throw new Error("Declare presentationLayout to arrange controls visually");
    return projectSource.slice(0, declaration.init.start) + JSON.stringify(layout, null, 2) + projectSource.slice(declaration.init.end);
  }

  // packages/manifold-author/project-files.js
  var TYPES = {
    mjs: "text/javascript",
    js: "text/javascript",
    ts: "text/typescript",
    json: "application/json",
    css: "text/css",
    txt: "text/plain",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif"
  };
  var BINARY = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "webp", "gif"]);
  function utf8Bytes(value) {
    let bytes = 0;
    for (const character of value) {
      const code = character.codePointAt(0);
      bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    }
    return bytes;
  }
  function projectFilePath(path) {
    if (typeof path !== "string" || !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(path) || path.includes("/./") || path.includes("/../") || path.split("/").slice(1).some((segment) => segment.startsWith(".") || segment.endsWith(".")))
      throw new Error("Use an absolute project path without traversal");
    return path;
  }
  function validateProjectFiles(entries = []) {
    if (!Array.isArray(entries)) throw new Error("Expected project files");
    const seen = /* @__PURE__ */ new Set();
    return entries.map((entry) => {
      const path = projectFilePath(entry?.path);
      if (path === "/project.mjs" || path === "/presentation.mjs" || path === "/composition.json" || seen.has(path))
        throw new Error(`Reserved or duplicate project file: ${path}`);
      seen.add(path);
      const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
      const mediaType = TYPES[extension];
      if (!mediaType || entry.mediaType !== mediaType) throw new Error(`Unsupported project file type: ${path}`);
      const encoding = BINARY.has(extension) ? "base64" : "utf8";
      if (entry.encoding !== encoding || typeof entry.content !== "string") throw new Error(`Invalid file encoding: ${path}`);
      if (encoding === "base64" && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.content))
        throw new Error(`Invalid base64 asset: ${path}`);
      return { path, mediaType, encoding, content: entry.content };
    });
  }
  function projectFileManifest(files, source3, presentation) {
    const size = utf8Bytes;
    return [
      { path: "/project.mjs", mediaType: "text/javascript", bytes: size(source3), virtual: true },
      ...presentation ? [{ path: "/presentation.mjs", mediaType: "text/javascript", bytes: size(presentation), virtual: true }] : [],
      ...files.map(({ path, mediaType, encoding, content }) => ({ path, mediaType, bytes: encoding === "base64" ? content.length * 3 / 4 - (content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0) : size(content) }))
    ];
  }

  // packages/manifold-author/author.js
  var author_exports = {};
  __export(author_exports, {
    GraphContractError: () => GraphContractError,
    GraphWorkspace: () => GraphWorkspace,
    LiveGraphSession: () => LiveGraphSession,
    NodeHandle: () => NodeHandle,
    ParameterRef: () => ParameterRef,
    adsr: () => adsr,
    attenuverterBias: () => attenuverterBias,
    audioFm: () => audioFm,
    audioSync: () => audioSync,
    bitCrusher: () => bitCrusher,
    chooseMainVoice: () => chooseMainVoice,
    chorus: () => chorus,
    compressor: () => compressor,
    constant: () => constant,
    createGraphWorkspace: () => createGraphWorkspace,
    createLiveGraphSession: () => createLiveGraphSession,
    crossfader: () => crossfader,
    cvCompare: () => cvCompare,
    cvMix: () => cvMix,
    cvRange: () => cvRange,
    decodeSampleAsset: () => decodeSampleAsset,
    defineNetwork: () => defineNetwork,
    distortion: () => distortion,
    effectSlotLegacy: () => effectSlotLegacy,
    encodeSampleAsset: () => encodeSampleAsset,
    envelopeControl: () => envelopeControl,
    envelopeFollower: () => envelopeFollower,
    eq8: () => eq8,
    extendedOscillator: () => extendedOscillator,
    fftSpectrum: () => fftSpectrum,
    fixedGain: () => fixedGain,
    formantFilter: () => formantFilter,
    gain: () => gain,
    getPrimitive: () => getPrimitive,
    granulator: () => granulator,
    inputRaw: () => inputRaw,
    inputSidechain: () => inputSidechain,
    legacyFilter: () => legacyFilter,
    lfo: () => lfo,
    limiter: () => limiter,
    linearBlend: () => linearBlend,
    listPrimitives: () => listPrimitives,
    loopCapture: () => loopCapture,
    mainVoiceBank: () => mainVoiceBank,
    midiArpeggiator: () => midiArpeggiator,
    midiInput: () => midiInput,
    midiNoteFilter: () => midiNoteFilter,
    midiScaleQuantizer: () => midiScaleQuantizer,
    midiTranspose: () => midiTranspose,
    midiVelocityMapper: () => midiVelocityMapper,
    mixer: () => mixer,
    mixer9: () => mixer9,
    modulatedGain: () => modulatedGain,
    modulatedSvf: () => modulatedSvf,
    multitapDelay: () => multitapDelay,
    noise: () => noise,
    oscillator: () => oscillator,
    oscillatorPreviewCurves: () => oscillatorPreviewCurves,
    output: () => output,
    parameterValue: () => parameterValue,
    phaseVocoder: () => phaseVocoder,
    phaser: () => phaser,
    phraseGain: () => phraseGain,
    pitchShifter: () => pitchShifter,
    pulseOscillator: () => pulseOscillator,
    resonator: () => resonator,
    retrospectiveCapture: () => retrospectiveCapture,
    reverb: () => reverb,
    reverseDelay: () => reverseDelay,
    ringModulator: () => ringModulator,
    sampleHold: () => sampleHold,
    sampleInstrument: () => sampleInstrument,
    sampleRegion: () => sampleRegion,
    shimmer: () => shimmer,
    slewAudio: () => slewAudio,
    slewControl: () => slewControl,
    spectrumAnalyzer: () => spectrumAnalyzer,
    stereoDelay: () => stereoDelay,
    stereoWidener: () => stereoWidener,
    stutter: () => stutter,
    sum2: () => sum2,
    svf: () => svf,
    threeBandEq: () => threeBandEq,
    transientShaper: () => transientShaper,
    validateHostAssignments: () => validateHostAssignments,
    validateHostBindings: () => validateHostBindings,
    validateIoLayout: () => validateIoLayout,
    validateNamedInstances: () => validateNamedInstances,
    validateParameterEndpoints: () => validateParameterEndpoints,
    validateProjectControls: () => validateProjectControls,
    voiceSynth: () => voiceSynth,
    waveShaper: () => waveShaper
  });

  // packages/manifold-author/catalog.generated.js
  var PORT_CATALOG = {
    "adsr": {
      "args": {},
      "code": 12,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.05,
          "discrete": false,
          "id": 0,
          "max": 5,
          "min": 1e-3
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 1,
          "max": 5,
          "min": 1e-3
        },
        {
          "default": 0.7,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 3,
          "max": 10,
          "min": 1e-3
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 5,
          "max": 1e6,
          "min": 0
        }
      ]
    },
    "attenuverter-bias": {
      "args": {
        "a": 1,
        "b": 0
      },
      "code": 31,
      "configuration": {},
      "inputs": [
        {
          "name": "cv",
          "signal": "control"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "control"
        }
      ],
      "parameters": [
        {
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": -1
        }
      ]
    },
    "audio-fm": {
      "args": {},
      "code": 71,
      "configuration": {},
      "inputs": [
        {
          "name": "carrier",
          "signal": "audio"
        },
        {
          "name": "modulator",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        }
      ]
    },
    "audio-sync": {
      "args": {},
      "code": 72,
      "configuration": {},
      "inputs": [
        {
          "name": "carrier",
          "signal": "audio"
        },
        {
          "name": "modulator",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        }
      ]
    },
    "bit-crusher": {
      "args": {},
      "code": 44,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        },
        {
          "name": "sidechain",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 8,
          "discrete": false,
          "id": 0,
          "max": 16,
          "min": 2
        },
        {
          "default": 4,
          "discrete": false,
          "id": 1,
          "max": 64,
          "min": 1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.8,
          "discrete": false,
          "id": 3,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 2,
          "min": 0
        }
      ]
    },
    "chorus": {
      "args": {
        "a": 0.6,
        "b": 0.45
      },
      "code": 35,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.6,
          "discrete": false,
          "id": 0,
          "max": 10,
          "min": 0.05
        },
        {
          "default": 0.45,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 3,
          "discrete": true,
          "id": 2,
          "max": 4,
          "min": 1
        },
        {
          "default": 0.7,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.1,
          "discrete": false,
          "id": 4,
          "max": 0.95,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 6,
          "max": 1,
          "min": 0
        }
      ]
    },
    "compressor": {
      "args": {
        "a": -12,
        "b": 4
      },
      "code": 24,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": -12,
          "discrete": false,
          "id": 0,
          "max": 0,
          "min": -60
        },
        {
          "default": 4,
          "discrete": false,
          "id": 1,
          "max": 100,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 5,
          "max": 40,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 10,
          "max": 1,
          "min": 0
        }
      ]
    },
    "constant": {
      "args": {
        "a": 0
      },
      "code": 2,
      "configuration": {},
      "inputs": [],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": -1
        }
      ]
    },
    "crossfader": {
      "args": {
        "a": 0,
        "b": 1
      },
      "code": 8,
      "configuration": {},
      "inputs": [
        {
          "name": "a",
          "signal": "audio"
        },
        {
          "name": "b",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": -1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        }
      ]
    },
    "cv-compare": {
      "args": {},
      "code": 68,
      "configuration": {},
      "inputs": [
        {
          "name": "cv",
          "signal": "control"
        }
      ],
      "outputs": [
        {
          "name": "gate",
          "signal": "control"
        },
        {
          "name": "trig",
          "signal": "control"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": -1
        },
        {
          "default": 0.05,
          "discrete": false,
          "id": 2,
          "max": 0.5,
          "min": 0
        }
      ]
    },
    "cv-mix": {
      "args": {
        "a": 1,
        "b": 0.5
      },
      "code": 33,
      "configuration": {},
      "inputs": [
        {
          "name": "in-1",
          "signal": "control"
        },
        {
          "name": "in-2",
          "signal": "control"
        },
        {
          "name": "in-3",
          "signal": "control"
        },
        {
          "name": "in-4",
          "signal": "control"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "control"
        }
      ],
      "parameters": [
        {
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": -1
        }
      ]
    },
    "cv-range": {
      "args": {},
      "code": 69,
      "configuration": {},
      "inputs": [
        {
          "name": "cv",
          "signal": "control"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "control"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 2,
          "max": 1,
          "min": 0
        }
      ]
    },
    "distortion": {
      "args": {
        "a": 4,
        "b": 0.7
      },
      "code": 17,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 4,
          "discrete": false,
          "id": 0,
          "max": 30,
          "min": 1
        },
        {
          "default": 0.7,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.8,
          "discrete": false,
          "id": 2,
          "max": 2,
          "min": 0
        }
      ]
    },
    "effect-slot-legacy": {
      "args": {
        "a": 0,
        "b": 0
      },
      "code": 52,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 20,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.6,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 6,
          "max": 1,
          "min": 0
        }
      ]
    },
    "envelope-control": {
      "args": {
        "a": 10,
        "b": 120
      },
      "code": 23,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "control"
        }
      ],
      "parameters": [
        {
          "default": 10,
          "discrete": false,
          "id": 0,
          "max": 500,
          "min": 0.01
        },
        {
          "default": 120,
          "discrete": false,
          "id": 1,
          "max": 5e3,
          "min": 0.1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 16,
          "min": 0.01
        },
        {
          "default": 80,
          "discrete": false,
          "id": 3,
          "max": 4e3,
          "min": 5
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 2,
          "min": 0
        }
      ]
    },
    "envelope-follower": {
      "args": {
        "a": 10,
        "b": 120
      },
      "code": 22,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 10,
          "discrete": false,
          "id": 0,
          "max": 500,
          "min": 0.01
        },
        {
          "default": 120,
          "discrete": false,
          "id": 1,
          "max": 5e3,
          "min": 0.1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 16,
          "min": 0.01
        },
        {
          "default": 80,
          "discrete": false,
          "id": 3,
          "max": 4e3,
          "min": 5
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 2,
          "min": 0
        }
      ]
    },
    "eq8": {
      "args": {},
      "code": 36,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 1,
          "max": 6,
          "min": 0
        },
        {
          "default": 60,
          "discrete": false,
          "id": 2,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 4,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 6,
          "max": 6,
          "min": 0
        },
        {
          "default": 120,
          "discrete": false,
          "id": 7,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 8,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 9,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 10,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 11,
          "max": 6,
          "min": 0
        },
        {
          "default": 250,
          "discrete": false,
          "id": 12,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 13,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 14,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 15,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 16,
          "max": 6,
          "min": 0
        },
        {
          "default": 500,
          "discrete": false,
          "id": 17,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 18,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 19,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 20,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 21,
          "max": 6,
          "min": 0
        },
        {
          "default": 1e3,
          "discrete": false,
          "id": 22,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 23,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 24,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 25,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 26,
          "max": 6,
          "min": 0
        },
        {
          "default": 2500,
          "discrete": false,
          "id": 27,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 28,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 29,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 30,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 31,
          "max": 6,
          "min": 0
        },
        {
          "default": 6e3,
          "discrete": false,
          "id": 32,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 33,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 34,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 35,
          "max": 1,
          "min": 0
        },
        {
          "default": 2,
          "discrete": true,
          "id": 36,
          "max": 6,
          "min": 0
        },
        {
          "default": 12e3,
          "discrete": false,
          "id": 37,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 38,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 39,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 40,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 41,
          "max": 1,
          "min": 0
        }
      ]
    },
    "extended-oscillator": {
      "args": {
        "a": 220,
        "b": 0
      },
      "code": 73,
      "configuration": {},
      "inputs": [
        {
          "name": "sync",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 1,
          "discrete": true,
          "id": 0,
          "max": 7,
          "min": 0
        },
        {
          "default": 220,
          "discrete": false,
          "id": 1,
          "max": 16e3,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 4,
          "max": 0.99,
          "min": 0.01
        },
        {
          "default": 0,
          "discrete": false,
          "id": 5,
          "max": 20,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 6,
          "max": 3,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": -1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 8,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 9,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 10,
          "max": 8,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 11,
          "max": 100,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 12,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 13,
          "max": 1,
          "min": 0
        },
        {
          "default": 8,
          "discrete": false,
          "id": 14,
          "max": 32,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 15,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 16,
          "max": 1,
          "min": 0
        }
      ]
    },
    "fft-spectrum": {
      "args": {
        "a": 0.45,
        "b": -72
      },
      "code": 28,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.45,
          "discrete": false,
          "id": 0,
          "max": 0.99,
          "min": 0
        },
        {
          "default": -72,
          "discrete": false,
          "id": 1,
          "max": -24,
          "min": -96
        }
      ]
    },
    "fixed-gain": {
      "args": {
        "a": 4
      },
      "code": 67,
      "configuration": {
        "gain": {
          "argument": "a",
          "default": 4,
          "max": 4,
          "min": 0
        }
      },
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": []
    },
    "formant-filter": {
      "args": {},
      "code": 46,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 4,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 12,
          "min": -12
        },
        {
          "default": 6,
          "discrete": false,
          "id": 2,
          "max": 20,
          "min": 1
        },
        {
          "default": 1.2,
          "discrete": false,
          "id": 3,
          "max": 8,
          "min": 0.5
        },
        {
          "default": 1,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        }
      ]
    },
    "gain": {
      "args": {
        "a": 0.7
      },
      "code": 3,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.7,
          "discrete": false,
          "id": 0,
          "max": 8,
          "min": 0
        }
      ]
    },
    "granulator": {
      "args": {},
      "code": 51,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 80,
          "discrete": false,
          "id": 0,
          "max": 500,
          "min": 1
        },
        {
          "default": 20,
          "discrete": false,
          "id": 1,
          "max": 100,
          "min": 1
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 24,
          "min": -24
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 6,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 7,
          "max": 4,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 8,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 9,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 10,
          "max": 1,
          "min": 0
        }
      ]
    },
    "input.raw": {
      "args": {},
      "code": 0,
      "configuration": {},
      "inputs": [],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": []
    },
    "input.sidechain": {
      "args": {},
      "code": 65,
      "configuration": {},
      "inputs": [],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": []
    },
    "legacy-filter": {
      "args": {},
      "code": 39,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 1400,
          "discrete": false,
          "id": 0,
          "max": 18e3,
          "min": 20
        },
        {
          "default": 0.1,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        }
      ]
    },
    "lfo": {
      "args": {
        "a": 2
      },
      "code": 14,
      "configuration": {},
      "inputs": [],
      "outputs": [
        {
          "name": "out",
          "signal": "control"
        },
        {
          "name": "inv",
          "signal": "control"
        },
        {
          "name": "uni",
          "signal": "control"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 2,
          "min": 0
        },
        {
          "default": 2,
          "discrete": false,
          "id": 1,
          "max": 20,
          "min": 0.05
        }
      ]
    },
    "limiter": {
      "args": {
        "a": -1,
        "b": 60
      },
      "code": 25,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": -1,
          "discrete": false,
          "id": 0,
          "max": 0,
          "min": -24
        },
        {
          "default": 60,
          "discrete": false,
          "id": 1,
          "max": 500,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 18,
          "min": 0
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        }
      ]
    },
    "linear-blend": {
      "args": {
        "a": 0.5
      },
      "code": 5,
      "configuration": {},
      "inputs": [
        {
          "name": "a",
          "signal": "audio"
        },
        {
          "name": "b",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.5,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        }
      ]
    },
    "loop-capture": {
      "args": {
        "a": 2,
        "b": 1
      },
      "code": 20,
      "configuration": {
        "capacitySeconds": {
          "argument": "a",
          "default": 2,
          "min": 0
        }
      },
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 3,
          "max": 2,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 6,
          "max": 1,
          "min": 0
        }
      ]
    },
    "main-voice-bank": {
      "args": {
        "a": 9
      },
      "code": 64,
      "configuration": {},
      "inputs": [
        {
          "name": "midi",
          "signal": "midi"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 4,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": -1
        },
        {
          "default": 60,
          "discrete": false,
          "id": 2,
          "max": 84,
          "min": 36
        },
        {
          "default": 2,
          "discrete": true,
          "id": 3,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 4,
          "max": 24,
          "min": -24
        },
        {
          "default": 0,
          "discrete": true,
          "id": 5,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 6,
          "max": 5,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 8,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 9,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 10,
          "max": 1,
          "min": 0
        },
        {
          "default": 5e-3,
          "discrete": false,
          "id": 11,
          "max": 0.5,
          "min": 1e-3
        },
        {
          "default": 0.08,
          "discrete": false,
          "id": 12,
          "max": 1,
          "min": 1e-3
        },
        {
          "default": 0.8,
          "discrete": false,
          "id": 13,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.16,
          "discrete": false,
          "id": 14,
          "max": 2,
          "min": 1e-3
        },
        {
          "default": 1,
          "discrete": false,
          "id": 15,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 16,
          "max": 4,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": false,
          "id": 17,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 18,
          "max": 0.6,
          "min": 0.05
        },
        {
          "default": 0,
          "discrete": true,
          "id": 19,
          "max": 1,
          "min": 0
        }
      ]
    },
    "midi-arpeggiator": {
      "args": {
        "a": 8,
        "b": 0
      },
      "code": 59,
      "configuration": {},
      "inputs": [
        {
          "name": "midi",
          "signal": "midi"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "midi"
        }
      ],
      "parameters": [
        {
          "default": 8,
          "discrete": false,
          "id": 0,
          "max": 20,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": true,
          "id": 1,
          "max": 3,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 2,
          "max": 4,
          "min": 1
        },
        {
          "default": 0.6,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0.05
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
        }
      ]
    },
    "midi-input": {
      "args": {},
      "code": 54,
      "configuration": {},
      "inputs": [],
      "outputs": [
        {
          "name": "out",
          "signal": "midi"
        }
      ],
      "parameters": []
    },
    "midi-note-filter": {
      "args": {
        "a": 36,
        "b": 96
      },
      "code": 56,
      "configuration": {},
      "inputs": [
        {
          "name": "midi",
          "signal": "midi"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "midi"
        }
      ],
      "parameters": [
        {
          "default": 36,
          "discrete": true,
          "id": 0,
          "max": 127,
          "min": 0
        },
        {
          "default": 96,
          "discrete": true,
          "id": 1,
          "max": 127,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 2,
          "max": 1,
          "min": 0
        }
      ]
    },
    "midi-scale-quantizer": {
      "args": {
        "a": 0,
        "b": 1
      },
      "code": 57,
      "configuration": {},
      "inputs": [
        {
          "name": "midi",
          "signal": "midi"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "midi"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 11,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 1,
          "max": 6,
          "min": 1
        },
        {
          "default": 1,
          "discrete": true,
          "id": 2,
          "max": 3,
          "min": 1
        }
      ]
    },
    "midi-transpose": {
      "args": {
        "a": 0
      },
      "code": 55,
      "configuration": {},
      "inputs": [
        {
          "name": "midi",
          "signal": "midi"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "midi"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 24,
          "min": -24
        }
      ]
    },
    "midi-velocity-mapper": {
      "args": {
        "a": 1,
        "b": 0
      },
      "code": 58,
      "configuration": {},
      "inputs": [
        {
          "name": "midi",
          "signal": "midi"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "midi"
        }
      ],
      "parameters": [
        {
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 1,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": -1
        }
      ]
    },
    "mixer": {
      "args": {
        "a": 32,
        "b": 1
      },
      "code": 9,
      "configuration": {
        "inputs": {
          "argument": "a",
          "default": 32,
          "min": 1
        }
      },
      "inputs": [
        {
          "name": "in-1",
          "signal": "audio"
        },
        {
          "name": "in-2",
          "signal": "audio"
        },
        {
          "name": "in-3",
          "signal": "audio"
        },
        {
          "name": "in-4",
          "signal": "audio"
        },
        {
          "name": "in-5",
          "signal": "audio"
        },
        {
          "name": "in-6",
          "signal": "audio"
        },
        {
          "name": "in-7",
          "signal": "audio"
        },
        {
          "name": "in-8",
          "signal": "audio"
        },
        {
          "name": "in-9",
          "signal": "audio"
        },
        {
          "name": "in-10",
          "signal": "audio"
        },
        {
          "name": "in-11",
          "signal": "audio"
        },
        {
          "name": "in-12",
          "signal": "audio"
        },
        {
          "name": "in-13",
          "signal": "audio"
        },
        {
          "name": "in-14",
          "signal": "audio"
        },
        {
          "name": "in-15",
          "signal": "audio"
        },
        {
          "name": "in-16",
          "signal": "audio"
        },
        {
          "name": "in-17",
          "signal": "audio"
        },
        {
          "name": "in-18",
          "signal": "audio"
        },
        {
          "name": "in-19",
          "signal": "audio"
        },
        {
          "name": "in-20",
          "signal": "audio"
        },
        {
          "name": "in-21",
          "signal": "audio"
        },
        {
          "name": "in-22",
          "signal": "audio"
        },
        {
          "name": "in-23",
          "signal": "audio"
        },
        {
          "name": "in-24",
          "signal": "audio"
        },
        {
          "name": "in-25",
          "signal": "audio"
        },
        {
          "name": "in-26",
          "signal": "audio"
        },
        {
          "name": "in-27",
          "signal": "audio"
        },
        {
          "name": "in-28",
          "signal": "audio"
        },
        {
          "name": "in-29",
          "signal": "audio"
        },
        {
          "name": "in-30",
          "signal": "audio"
        },
        {
          "name": "in-31",
          "signal": "audio"
        },
        {
          "name": "in-32",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 1,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 3,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 4,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 5,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 6,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 7,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 8,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 9,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 10,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 11,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 12,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 13,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 14,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 15,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 16,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 17,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 18,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 19,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 20,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 21,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 22,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 23,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 24,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 25,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 26,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 27,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 28,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 29,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 30,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 31,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 32,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 33,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 34,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 35,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 36,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 37,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 38,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 39,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 40,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 41,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 42,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 43,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 44,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 45,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 46,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 47,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 48,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 49,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 50,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 51,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 52,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 53,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 54,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 55,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 56,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 57,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 58,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 59,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 60,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 61,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 62,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 63,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 64,
          "max": 1,
          "min": -1
        }
      ]
    },
    "mixer9": {
      "args": {
        "a": 9,
        "b": 1
      },
      "code": 9,
      "configuration": {},
      "inputs": [
        {
          "name": "in-1",
          "signal": "audio"
        },
        {
          "name": "in-2",
          "signal": "audio"
        },
        {
          "name": "in-3",
          "signal": "audio"
        },
        {
          "name": "in-4",
          "signal": "audio"
        },
        {
          "name": "in-5",
          "signal": "audio"
        },
        {
          "name": "in-6",
          "signal": "audio"
        },
        {
          "name": "in-7",
          "signal": "audio"
        },
        {
          "name": "in-8",
          "signal": "audio"
        },
        {
          "name": "in-9",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 2,
          "min": 0
        }
      ]
    },
    "modulated-gain": {
      "args": {
        "a": 0.5,
        "b": 0.4
      },
      "code": 15,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        },
        {
          "name": "cv",
          "signal": "control"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.5,
          "discrete": false,
          "id": 0,
          "max": 2,
          "min": 0
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 1,
          "max": 2,
          "min": -2
        }
      ]
    },
    "modulated-svf": {
      "args": {
        "a": 2e3
      },
      "code": 16,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        },
        {
          "name": "cv",
          "signal": "control"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 3,
          "min": 0
        },
        {
          "default": 3200,
          "discrete": false,
          "id": 1,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0.75,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0.1
        },
        {
          "default": 2e3,
          "discrete": false,
          "id": 3,
          "max": 2e4,
          "min": 0
        }
      ]
    },
    "multitap-delay": {
      "args": {},
      "code": 41,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 4,
          "discrete": true,
          "id": 0,
          "max": 8,
          "min": 1
        },
        {
          "default": 0.3,
          "discrete": false,
          "id": 1,
          "max": 0.95,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 120,
          "discrete": false,
          "id": 3,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": -0.5,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": -1
        },
        {
          "default": 240,
          "discrete": false,
          "id": 6,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.25,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 8,
          "max": 1,
          "min": -1
        },
        {
          "default": 360,
          "discrete": false,
          "id": 9,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.16666666666666666,
          "discrete": false,
          "id": 10,
          "max": 1,
          "min": 0
        },
        {
          "default": -0.5,
          "discrete": false,
          "id": 11,
          "max": 1,
          "min": -1
        },
        {
          "default": 480,
          "discrete": false,
          "id": 12,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.125,
          "discrete": false,
          "id": 13,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 14,
          "max": 1,
          "min": -1
        },
        {
          "default": 600,
          "discrete": false,
          "id": 15,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.1,
          "discrete": false,
          "id": 16,
          "max": 1,
          "min": 0
        },
        {
          "default": -0.5,
          "discrete": false,
          "id": 17,
          "max": 1,
          "min": -1
        },
        {
          "default": 720,
          "discrete": false,
          "id": 18,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.08333333333333333,
          "discrete": false,
          "id": 19,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 20,
          "max": 1,
          "min": -1
        },
        {
          "default": 840,
          "discrete": false,
          "id": 21,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.07142857142857142,
          "discrete": false,
          "id": 22,
          "max": 1,
          "min": 0
        },
        {
          "default": -0.5,
          "discrete": false,
          "id": 23,
          "max": 1,
          "min": -1
        },
        {
          "default": 960,
          "discrete": false,
          "id": 24,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.0625,
          "discrete": false,
          "id": 25,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 26,
          "max": 1,
          "min": -1
        }
      ]
    },
    "noise": {
      "args": {
        "a": 0.08,
        "b": 0.5
      },
      "code": 13,
      "configuration": {},
      "inputs": [],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.08,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        }
      ]
    },
    "oscillator": {
      "args": {
        "a": 220,
        "b": 0.4
      },
      "code": 11,
      "configuration": {},
      "inputs": [
        {
          "name": "sync",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 4,
          "min": 0
        },
        {
          "default": 220,
          "discrete": false,
          "id": 1,
          "max": 16e3,
          "min": 20
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        }
      ]
    },
    "output": {
      "args": {},
      "code": 7,
      "configuration": {},
      "inputs": [
        {
          "name": "in",
          "signal": "audio"
        }
      ],
      "outputs": [],
      "parameters": []
    },
    "phase-vocoder": {
      "args": {},
      "code": 62,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 4,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 11,
          "discrete": true,
          "id": 4,
          "max": 12,
          "min": 9
        }
      ]
    },
    "phaser": {
      "args": {
        "a": 0.4,
        "b": 0.7
      },
      "code": 34,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.4,
          "discrete": false,
          "id": 0,
          "max": 10,
          "min": 0.1
        },
        {
          "default": 0.7,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 6,
          "discrete": true,
          "id": 2,
          "max": 12,
          "min": 6
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 3,
          "max": 0.95,
          "min": -0.95
        },
        {
          "default": 90,
          "discrete": false,
          "id": 4,
          "max": 180,
          "min": 0
        }
      ]
    },
    "phrase-gain": {
      "args": {
        "a": 1,
        "b": 0.2
      },
      "code": 63,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        },
        {
          "name": "cv",
          "signal": "control"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 1,
          "max": 0.6,
          "min": 0.05
        }
      ]
    },
    "pitch-shifter": {
      "args": {},
      "code": 49,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 24,
          "min": -24
        },
        {
          "default": 80,
          "discrete": false,
          "id": 1,
          "max": 200,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 0.95,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        }
      ]
    },
    "pulse-oscillator": {
      "args": {
        "a": 220,
        "b": 0.4
      },
      "code": 70,
      "configuration": {},
      "inputs": [
        {
          "name": "sync",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 220,
          "discrete": false,
          "id": 1,
          "max": 16e3,
          "min": 20
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.25,
          "discrete": false,
          "id": 4,
          "max": 0.99,
          "min": 0.01
        }
      ]
    },
    "resonator": {
      "args": {},
      "code": 60,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 4,
          "min": 0
        },
        {
          "default": 1e3,
          "discrete": false,
          "id": 1,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 10,
          "discrete": false,
          "id": 2,
          "max": 500,
          "min": 0.01
        }
      ]
    },
    "retrospective-capture": {
      "args": {
        "a": 30,
        "b": 0
      },
      "code": 66,
      "configuration": {
        "capacitySeconds": {
          "argument": "a",
          "default": 30,
          "min": 0
        }
      },
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": []
    },
    "reverb": {
      "args": {},
      "code": 40,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.5,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.33,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        }
      ]
    },
    "reverse-delay": {
      "args": {},
      "code": 47,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 420,
          "discrete": false,
          "id": 0,
          "max": 2e3,
          "min": 50
        },
        {
          "default": 120,
          "discrete": false,
          "id": 1,
          "max": 400,
          "min": 20
        },
        {
          "default": 0.35,
          "discrete": false,
          "id": 2,
          "max": 0.95,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        }
      ]
    },
    "ring-modulator": {
      "args": {},
      "code": 42,
      "configuration": {},
      "inputs": [
        {
          "name": "carrier",
          "signal": "audio"
        },
        {
          "name": "modulator",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 180,
          "discrete": false,
          "id": 0,
          "max": 8e3,
          "min": 0.1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 180,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
        }
      ]
    },
    "sample-hold": {
      "args": {
        "a": 0
      },
      "code": 32,
      "configuration": {},
      "inputs": [
        {
          "name": "cv",
          "signal": "control"
        },
        {
          "name": "trigger",
          "signal": "control"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "control"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 2,
          "min": 0
        }
      ]
    },
    "sample-instrument": {
      "args": {},
      "code": 27,
      "configuration": {},
      "inputs": [
        {
          "name": "midi",
          "signal": "midi"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 60,
          "discrete": false,
          "id": 0,
          "max": 84,
          "min": 36
        },
        {
          "default": 1,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.25,
          "discrete": false,
          "id": 2,
          "max": 0.5,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 3,
          "max": 2,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 6,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 8,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.08,
          "discrete": false,
          "id": 9,
          "max": 0.5,
          "min": 0
        },
        {
          "default": 0.01,
          "discrete": false,
          "id": 10,
          "max": 0.2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 11,
          "max": 4,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 12,
          "max": 100,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 13,
          "max": 1,
          "min": 0
        }
      ]
    },
    "sample-region": {
      "args": {},
      "code": 26,
      "configuration": {},
      "inputs": [
        {
          "name": "midi",
          "signal": "midi"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 2,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": true,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.08,
          "discrete": false,
          "id": 8,
          "max": 0.5,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 9,
          "max": 8,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 10,
          "max": 100,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 11,
          "max": 1,
          "min": 0
        }
      ]
    },
    "shimmer": {
      "args": {},
      "code": 50,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.6,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 12,
          "discrete": false,
          "id": 1,
          "max": 12,
          "min": -12
        },
        {
          "default": 0.65,
          "discrete": false,
          "id": 2,
          "max": 0.99,
          "min": 0
        },
        {
          "default": 0.45,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.25,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 6e3,
          "discrete": false,
          "id": 5,
          "max": 12e3,
          "min": 100
        }
      ]
    },
    "slew-audio": {
      "args": {
        "a": 64,
        "b": 64
      },
      "code": 29,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 64,
          "discrete": false,
          "id": 0,
          "max": 96e3,
          "min": 1
        },
        {
          "default": 64,
          "discrete": false,
          "id": 1,
          "max": 96e3,
          "min": 1
        }
      ]
    },
    "slew-control": {
      "args": {
        "a": 16,
        "b": 16
      },
      "code": 30,
      "configuration": {},
      "inputs": [
        {
          "name": "cv",
          "signal": "control"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "control"
        }
      ],
      "parameters": [
        {
          "default": 16,
          "discrete": false,
          "id": 0,
          "max": 1024,
          "min": 1
        },
        {
          "default": 16,
          "discrete": false,
          "id": 1,
          "max": 1024,
          "min": 1
        }
      ]
    },
    "spectrum-analyzer": {
      "args": {
        "a": 1,
        "b": 0.85
      },
      "code": 21,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 8,
          "min": 0.1
        },
        {
          "default": 0.85,
          "discrete": false,
          "id": 1,
          "max": 0.999,
          "min": 0
        },
        {
          "default": -72,
          "discrete": false,
          "id": 2,
          "max": -12,
          "min": -96
        }
      ]
    },
    "stereo-delay": {
      "args": {
        "a": 250,
        "b": 375
      },
      "code": 18,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 250,
          "discrete": false,
          "id": 0,
          "max": 5e3,
          "min": 1
        },
        {
          "default": 375,
          "discrete": false,
          "id": 1,
          "max": 5e3,
          "min": 1
        },
        {
          "default": 0.3,
          "discrete": false,
          "id": 2,
          "max": 1.2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 4e3,
          "discrete": false,
          "id": 5,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 8,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 9,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 10,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 11,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 12,
          "max": 1,
          "min": 0
        },
        {
          "default": 3,
          "discrete": true,
          "id": 13,
          "max": 10,
          "min": 0
        },
        {
          "default": 6,
          "discrete": true,
          "id": 14,
          "max": 10,
          "min": 0
        },
        {
          "default": 120,
          "discrete": false,
          "id": 15,
          "max": 300,
          "min": 20
        }
      ]
    },
    "stereo-widener": {
      "args": {},
      "code": 38,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 2,
          "min": 0
        },
        {
          "default": 120,
          "discrete": false,
          "id": 1,
          "max": 500,
          "min": 20
        },
        {
          "default": 1,
          "discrete": true,
          "id": 2,
          "max": 1,
          "min": 0
        }
      ]
    },
    "stutter": {
      "args": {},
      "code": 48,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.5,
          "discrete": false,
          "id": 0,
          "max": 8,
          "min": 0.125
        },
        {
          "default": 0.8,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.3,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 255,
          "discrete": true,
          "id": 5,
          "max": 255,
          "min": 0
        },
        {
          "default": 120,
          "discrete": false,
          "id": 6,
          "max": 300,
          "min": 20
        },
        {
          "default": 1,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": 0
        }
      ]
    },
    "sum2": {
      "args": {
        "a": 1,
        "b": 1
      },
      "code": 4,
      "configuration": {},
      "inputs": [
        {
          "name": "a",
          "signal": "audio"
        },
        {
          "name": "b",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": []
    },
    "svf": {
      "args": {},
      "code": 6,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 3,
          "min": 0
        },
        {
          "default": 3200,
          "discrete": false,
          "id": 1,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0.75,
          "discrete": false,
          "id": 2,
          "max": 2,
          "min": 0.1
        }
      ]
    },
    "three-band-eq": {
      "args": {},
      "code": 45,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 24,
          "min": -24
        },
        {
          "default": 120,
          "discrete": false,
          "id": 1,
          "max": 400,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 24,
          "min": -24
        },
        {
          "default": 1e3,
          "discrete": false,
          "id": 3,
          "max": 8e3,
          "min": 120
        },
        {
          "default": 0.7,
          "discrete": false,
          "id": 4,
          "max": 12,
          "min": 0.2
        },
        {
          "default": 0,
          "discrete": false,
          "id": 5,
          "max": 24,
          "min": -24
        },
        {
          "default": 8e3,
          "discrete": false,
          "id": 6,
          "max": 16e3,
          "min": 2e3
        },
        {
          "default": 0,
          "discrete": false,
          "id": 7,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 8,
          "max": 1,
          "min": 0
        }
      ]
    },
    "transient-shaper": {
      "args": {},
      "code": 43,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0.5,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": -1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 4,
          "min": 0.1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        }
      ]
    },
    "voice-synth": {
      "args": {},
      "code": 10,
      "configuration": {},
      "inputs": [
        {
          "name": "midi",
          "signal": "midi"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 3,
          "min": 0
        },
        {
          "default": 0.01,
          "discrete": false,
          "id": 1,
          "max": 2,
          "min": 1e-3
        },
        {
          "default": 0.12,
          "discrete": false,
          "id": 2,
          "max": 2,
          "min": 1e-3
        },
        {
          "default": 0.65,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.18,
          "discrete": false,
          "id": 4,
          "max": 3,
          "min": 1e-3
        },
        {
          "default": 0.25,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": 0
        }
      ]
    },
    "wave-shaper": {
      "args": {},
      "code": 37,
      "configuration": {},
      "inputs": [
        {
          "name": "audio",
          "signal": "audio"
        }
      ],
      "outputs": [
        {
          "name": "out",
          "signal": "audio"
        }
      ],
      "parameters": [
        {
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 6,
          "min": 0
        },
        {
          "default": 12,
          "discrete": false,
          "id": 1,
          "max": 40,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 20,
          "min": -20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 2e4,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 4,
          "max": 2e4,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": -1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 6,
          "max": 1,
          "min": 0
        },
        {
          "default": 2,
          "discrete": true,
          "id": 7,
          "max": 4,
          "min": 1
        }
      ]
    }
  };

  // packages/manifold-author/node-metadata.js
  var NODE_METADATA = {
    "input.sidechain": {
      category: "Sources & voices",
      description: "Reads an auxiliary host audio input for sidechain processing."
    },
    oscillator: {
      category: "Sources & voices",
      description: "Generates basic pitched waveforms with frequency and level control."
    },
    "extended-oscillator": {
      category: "Sources & voices",
      description: "Generates pitched audio with unison, sync, shaping and additive modes."
    },
    "pulse-oscillator": {
      category: "Sources & voices",
      description: "Generates a pitched pulse wave with adjustable width."
    },
    noise: {
      category: "Sources & voices",
      description: "Generates colored noise as an audio source."
    },
    "midi-input": {
      category: "MIDI",
      description: "Receives host MIDI notes and sends them along MIDI connections."
    },
    "voice-synth": {
      category: "Sources & voices",
      description: "Renders a playable synth voice from note events."
    },
    "sample-instrument": {
      category: "Sources & voices",
      description: "Plays a prepared sample instrument from note events."
    },
    "sample-region": {
      category: "Sources & voices",
      description: "Plays an addressed region of prepared sample audio."
    },
    "main-voice-bank": {
      category: "Sources & voices",
      description: "Combines the voices used by the authored Main instrument."
    },
    adsr: {
      category: "Modulation & CV",
      description: "Generates a control envelope with attack, decay, sustain and release."
    },
    lfo: {
      category: "Modulation & CV",
      description: "Generates a repeating low frequency modulation signal."
    },
    "modulated-gain": {
      category: "Modulation & CV",
      description: "Applies gain controlled by an incoming CV signal."
    },
    "slew-control": {
      category: "Modulation & CV",
      description: "Smooths changes in a control signal over time."
    },
    "attenuverter-bias": {
      category: "Modulation & CV",
      description: "Scales, inverts and offsets a control signal."
    },
    "sample-hold": {
      category: "Modulation & CV",
      description: "Samples or tracks a control signal on trigger events."
    },
    "cv-mix": {
      category: "Modulation & CV",
      description: "Blends control signals together."
    },
    "cv-compare": {
      category: "Modulation & CV",
      description: "Compares control signals and emits the result."
    },
    "cv-range": {
      category: "Modulation & CV",
      description: "Maps a control signal into a chosen range."
    },
    gain: {
      category: "Mix & routing",
      description: "Changes audio level with a live gain parameter."
    },
    "fixed-gain": {
      category: "Mix & routing",
      description: "Multiplies audio by a fixed gain factor."
    },
    sum2: {
      category: "Mix & routing",
      description: "Adds two audio signals together."
    },
    mixer9: {
      category: "Mix & routing",
      description: "Mixes up to nine audio inputs into one output."
    },
    mixer: {
      category: "Mix & routing",
      description: "Mixes multiple audio inputs with level and pan controls."
    },
    crossfader: {
      category: "Mix & routing",
      description: "Blends two audio sources with an equal power curve."
    },
    "stereo-widener": {
      category: "Mix & routing",
      description: "Adjusts the perceived width of a stereo signal."
    },
    "midi-transpose": {
      category: "MIDI",
      description: "Shifts incoming MIDI note pitches."
    },
    svf: {
      category: "Filters & EQ",
      description: "Filters audio with selectable modes, cutoff and resonance."
    },
    "modulated-svf": {
      category: "Filters & EQ",
      description: "Filters audio while CV moves the cutoff frequency."
    },
    "legacy-filter": {
      category: "Filters & EQ",
      description: "Runs the legacy filter response with cutoff and resonance."
    },
    eq8: {
      category: "Filters & EQ",
      description: "Shapes audio with eight configurable EQ bands."
    },
    "phase-vocoder": {
      category: "Time & spectral",
      description: "Shifts pitch or stretches time in the spectral domain."
    },
    granulator: {
      category: "Time & spectral",
      description: "Resynthesizes audio as overlapping grains."
    },
    "loop-capture": {
      category: "Time & spectral",
      description: "Records, plays and overdubs a live audio loop."
    },
    "retrospective-capture": {
      category: "Time & spectral",
      description: "Keeps a rolling audio history for later capture."
    },
    "wave-shaper": {
      category: "Shape & FX",
      description: "Transforms waveform shape with selectable curves and drive."
    },
    distortion: {
      category: "Shape & FX",
      description: "Adds nonlinear saturation with drive and wet mix controls."
    },
    "effect-slot-legacy": {
      category: "Shape & FX",
      description: "Hosts a selectable effect in the legacy Main FX slot."
    },
    "ring-modulator": {
      category: "Shape & FX",
      description: "Multiplies audio by a carrier to create sidebands."
    },
    "audio-fm": {
      category: "Shape & FX",
      description: "Uses an audio signal to modulate another signal's frequency."
    },
    "audio-sync": {
      category: "Shape & FX",
      description: "Synchronizes one audio oscillator to another signal."
    },
    "input.raw": {
      category: "Sources & voices",
      description: "Reads the audio supplied to the device by its host."
    },
    output: {
      category: "Mix & routing",
      description: "Sends the connected audio to the device output."
    },
    compressor: {
      category: "Dynamics",
      description: "Reduces audio above a threshold, with ratio, makeup gain and wet mix. Uses a fixed 10 ms attack and 100 ms release."
    },
    limiter: {
      category: "Dynamics",
      description: "Limits audio peaks to a threshold, with release, makeup gain and soft clipping."
    },
    "stereo-delay": {
      category: "Time & spectral",
      description: "Repeats left and right audio with independent timing, feedback, filtering and tempo sync."
    },
    phaser: {
      category: "Shape & FX",
      description: "Sweeps six or twelve all-pass stages to create moving notches in the sound."
    },
    chorus: {
      category: "Shape & FX",
      description: "Layers modulated delays to thicken audio, with voice count and stereo spread."
    },
    reverb: {
      category: "Time & spectral",
      description: "Adds a stereo room tail with size, damping and independent wet and dry levels."
    },
    "multitap-delay": {
      category: "Time & spectral",
      description: "Repeats audio through up to eight taps, each with its own time, gain and pan."
    },
    "transient-shaper": {
      category: "Dynamics",
      description: "Emphasizes or softens attacks and sustains without changing the input routing."
    },
    "bit-crusher": {
      category: "Shape & FX",
      description: "Reduces sample precision and rate, with optional XOR or gate processing."
    },
    "three-band-eq": {
      category: "Filters & EQ",
      description: "Shapes lows, mids and highs, with mid-band Q, output gain and wet mix."
    },
    "formant-filter": {
      category: "Filters & EQ",
      description: "Shapes audio with vowel resonances, pitch shift, resonance and drive."
    },
    resonator: {
      category: "Filters & EQ",
      description: "Emphasizes a tuned frequency with adjustable gain and resonance."
    },
    "reverse-delay": {
      category: "Time & spectral",
      description: "Replays overlapping sections of audio backwards, with feedback and wet mix."
    },
    stutter: {
      category: "Time & spectral",
      description: "Repeats short rhythmic fragments using a gate, probability and eight-step pattern."
    },
    "pitch-shifter": {
      category: "Time & spectral",
      description: "Shifts audio pitch using overlapping delay windows, with feedback and wet mix."
    },
    shimmer: {
      category: "Time & spectral",
      description: "Adds pitched, modulated delay feedback for a sustained shimmering tail."
    },
    "spectrum-analyzer": {
      category: "Sound analysis",
      description: "Passes audio through and measures eight frequency bands. Per-node graph meters are not yet available."
    },
    "fft-spectrum": {
      category: "Sound analysis",
      description: "Passes audio through and measures its FFT spectrum. Per-node graph meters are not yet available."
    },
    "envelope-follower": {
      category: "Sound analysis",
      description: "Passes audio through while measuring its level. Use Audio envelope when you need a connectable control output."
    },
    "envelope-control": {
      category: "Modulation & CV",
      description: "Turns audio level into a control signal, with attack, release and peak or RMS detection."
    },
    "midi-note-filter": {
      category: "MIDI",
      description: "Passes notes inside or outside a chosen pitch range while tracking held notes."
    },
    "midi-scale-quantizer": {
      category: "MIDI",
      description: "Moves incoming notes onto a musical scale with a chosen root and direction."
    },
    "midi-velocity-mapper": {
      category: "MIDI",
      description: "Reshapes note velocity with amount, curve and offset."
    },
    "midi-arpeggiator": {
      category: "MIDI",
      description: "Turns held notes into a repeating pattern with rate, direction, octaves and gate length."
    },
    constant: {
      category: "Sources & voices",
      description: "Produces a constant-valued audio signal for offsets and signal calculations."
    },
    "linear-blend": {
      category: "Mix & routing",
      description: "Crossfades linearly between two audio inputs."
    },
    "slew-audio": {
      category: "Shape & FX",
      description: "Smooths rising and falling audio samples independently."
    },
    "phrase-gain": {
      category: "Modulation & CV",
      description: "Shapes audio gain from a control envelope relative to a chosen reference level."
    }
  };

  // packages/manifold-author/additional-nodes.js
  var ADDITIONAL_NODES = {
    compressor: {
      label: "Compressor",
      parameters: [
        { id: 0, label: "Threshold (dB)" },
        { id: 1, label: "Ratio" },
        { id: 5, label: "Makeup (dB)" },
        { id: 10, label: "Wet mix" }
      ]
    },
    limiter: {
      label: "Limiter",
      parameters: [
        { id: 0, label: "Threshold (dB)" },
        { id: 1, label: "Release (ms)" },
        { id: 2, label: "Makeup (dB)" },
        { id: 3, label: "Soft clip" },
        { id: 4, label: "Wet mix" }
      ]
    },
    "stereo-delay": {
      label: "Stereo delay",
      parameters: [
        { id: 0, label: "Left time \xB7 ms" },
        { id: 1, label: "Right time \xB7 ms" },
        { id: 2, label: "Feedback" },
        { id: 3, label: "Crossfeed" },
        { id: 4, label: "Feedback lowpass", discrete: true, choices: ["Off", "On"] },
        { id: 5, label: "Filter cutoff (Hz)" },
        { id: 7, label: "Wet mix" },
        { id: 8, label: "Swap tap times", discrete: true, choices: ["Off", "On"] },
        { id: 9, label: "Stereo width" },
        { id: 10, label: "Freeze input", discrete: true, choices: ["Off", "On"] },
        { id: 11, label: "Ducking" },
        { id: 12, label: "Time mode", choices: ["Free", "Sync"], discrete: true },
        {
          id: 13,
          label: "Left division",
          choices: [
            "1/32",
            "1/16",
            "1/8",
            "1/4",
            "1/2",
            "1",
            "dotted 1/8",
            "dotted 1/4",
            "triplet 1/16",
            "triplet 1/8",
            "triplet 1/4"
          ],
          discrete: true
        },
        {
          id: 14,
          label: "Right division",
          choices: [
            "1/32",
            "1/16",
            "1/8",
            "1/4",
            "1/2",
            "1",
            "dotted 1/8",
            "dotted 1/4",
            "triplet 1/16",
            "triplet 1/8",
            "triplet 1/4"
          ],
          discrete: true
        },
        { id: 15, label: "Tempo \xB7 BPM" }
      ]
    },
    phaser: {
      label: "Phaser",
      parameters: [
        { id: 0, label: "Sweep rate" },
        { id: 1, label: "Depth" },
        {
          id: 2,
          label: "Stages",
          choices: ["6 stages", "12 stages"],
          choiceValues: [6, 12],
          discrete: true
        },
        { id: 3, label: "Feedback" },
        { id: 4, label: "Stereo spread" }
      ]
    },
    chorus: {
      label: "Chorus",
      parameters: [
        { id: 0, label: "Sweep rate" },
        { id: 1, label: "Depth" },
        { id: 2, label: "Voices", discrete: true },
        { id: 3, label: "Stereo spread" },
        { id: 4, label: "Feedback" },
        {
          id: 5,
          label: "LFO waveform",
          choices: ["Sine", "Triangle"],
          choiceValues: [0, 1],
          discrete: true
        },
        { id: 6, label: "Dry / wet" }
      ]
    },
    reverb: {
      label: "Reverb",
      parameters: [
        { id: 0, label: "Room size" },
        { id: 1, label: "Damping" },
        { id: 2, label: "Wet" },
        { id: 3, label: "Dry" },
        { id: 4, label: "Wet width" }
      ]
    },
    "multitap-delay": {
      label: "Multitap delay",
      parameters: [
        { id: 0, label: "Active taps", discrete: true },
        { id: 1, label: "Feedback" },
        { id: 2, label: "Wet mix" },
        { id: 3, label: "Tap 1 Time \xB7 ms" },
        { id: 4, label: "Tap 1 Gain" },
        { id: 5, label: "Tap 1 Pan" },
        { id: 6, label: "Tap 2 Time \xB7 ms" },
        { id: 7, label: "Tap 2 Gain" },
        { id: 8, label: "Tap 2 Pan" },
        { id: 9, label: "Tap 3 Time (ms)" },
        { id: 10, label: "Tap 3 Gain" },
        { id: 11, label: "Tap 3 Pan" },
        { id: 12, label: "Tap 4 Time (ms)" },
        { id: 13, label: "Tap 4 Gain" },
        { id: 14, label: "Tap 4 Pan" },
        { id: 15, label: "Tap 5 Time (ms)" },
        { id: 16, label: "Tap 5 Gain" },
        { id: 17, label: "Tap 5 Pan" },
        { id: 18, label: "Tap 6 Time (ms)" },
        { id: 19, label: "Tap 6 Gain" },
        { id: 20, label: "Tap 6 Pan" },
        { id: 21, label: "Tap 7 Time (ms)" },
        { id: 22, label: "Tap 7 Gain" },
        { id: 23, label: "Tap 7 Pan" },
        { id: 24, label: "Tap 8 Time (ms)" },
        { id: 25, label: "Tap 8 Gain" },
        { id: 26, label: "Tap 8 Pan" }
      ]
    },
    "transient-shaper": {
      label: "Transient shaper",
      parameters: [
        { id: 0, label: "Attack" },
        { id: 1, label: "Sustain" },
        { id: 2, label: "Sensitivity" },
        { id: 3, label: "Wet mix" }
      ]
    },
    "bit-crusher": {
      label: "Bit crusher",
      parameters: [
        { id: 0, label: "Bit depth" },
        { id: 1, label: "Sample hold" },
        { id: 2, label: "Wet mix" },
        { id: 3, label: "Output gain" },
        { id: 4, label: "Logic mode", choices: ["Normal", "XOR", "Gate"], discrete: true }
      ]
    },
    "three-band-eq": {
      label: "Three-band EQ",
      parameters: [
        { id: 0, label: "Low gain" },
        { id: 1, label: "Low frequency" },
        { id: 2, label: "Mid gain" },
        { id: 3, label: "Mid frequency" },
        { id: 4, label: "Mid Q" },
        { id: 5, label: "High gain" },
        { id: 6, label: "High frequency" },
        { id: 7, label: "Output trim" },
        { id: 8, label: "Wet mix" }
      ]
    },
    "formant-filter": {
      label: "Formant filter",
      parameters: [
        { id: 0, label: "Vowel position" },
        { id: 1, label: "Shift (semitones)" },
        { id: 2, label: "Resonance Q" },
        { id: 3, label: "Drive" },
        { id: 4, label: "Wet mix" }
      ]
    },
    resonator: {
      label: "Resonator",
      parameters: [
        { id: 0, label: "Gain" },
        { id: 1, label: "Frequency (Hz)" },
        { id: 2, label: "Q" }
      ]
    },
    "reverse-delay": {
      label: "Reverse delay",
      parameters: [
        { id: 0, label: "Delay time (ms)" },
        { id: 1, label: "Reverse window (ms)" },
        { id: 2, label: "Feedback" },
        { id: 3, label: "Wet mix" }
      ]
    },
    stutter: {
      label: "Stutter",
      parameters: [
        { id: 0, label: "Length" },
        { id: 1, label: "Gate" },
        { id: 2, label: "Filter decay" },
        { id: 3, label: "Pitch decay" },
        { id: 4, label: "Probability" },
        { id: 5, label: "Pattern mask", discrete: true },
        { id: 6, label: "Tempo" },
        { id: 7, label: "Wet mix" }
      ]
    },
    "pitch-shifter": {
      label: "Pitch shifter",
      parameters: [
        { id: 0, label: "Pitch (semitones)" },
        { id: 1, label: "Window (ms)" },
        { id: 2, label: "Feedback" },
        { id: 3, label: "Wet mix" }
      ]
    },
    shimmer: {
      label: "Shimmer",
      parameters: [
        { id: 0, label: "Delay size" },
        { id: 1, label: "Pitch" },
        { id: 2, label: "Feedback" },
        { id: 3, label: "Wet mix" },
        { id: 4, label: "Modulation" },
        { id: 5, label: "Feedback filter (Hz)" }
      ]
    },
    "spectrum-analyzer": {
      label: "Spectrum analyzer",
      parameters: [
        { id: 0, label: "Sensitivity" },
        { id: 1, label: "Smoothing" },
        { id: 2, label: "Floor (dB)" }
      ]
    },
    "fft-spectrum": {
      label: "FFT spectrum",
      parameters: [
        { id: 0, label: "Smoothing" },
        { id: 1, label: "Floor (dB)" }
      ]
    },
    "envelope-follower": {
      label: "Envelope follower",
      parameters: [
        { id: 0, label: "Attack (ms)" },
        { id: 1, label: "Release (ms)" },
        { id: 2, label: "Sensitivity" },
        { id: 3, label: "Highpass (Hz)" },
        { id: 4, label: "Detector", choices: ["Peak", "RMS", "Hybrid"], discrete: true }
      ]
    },
    "envelope-control": {
      label: "Audio envelope",
      parameters: [
        { id: 0, label: "Attack (ms)" },
        { id: 1, label: "Release (ms)" },
        { id: 2, label: "Sensitivity" },
        { id: 3, label: "Highpass (Hz)" },
        { id: 4, label: "Detector", choices: ["Peak", "RMS", "Hybrid"], discrete: true }
      ]
    },
    "midi-note-filter": {
      label: "MIDI note filter",
      parameters: [
        { id: 0, label: "Low note", discrete: true },
        { id: 1, label: "High note", discrete: true },
        {
          id: 2,
          label: "Pass range",
          choices: ["Inside", "Outside"],
          choiceValues: [0, 1],
          discrete: true
        }
      ]
    },
    "midi-scale-quantizer": {
      label: "MIDI scale quantizer",
      parameters: [
        {
          id: 0,
          label: "Root note",
          choices: ["C", "C\u266F", "D", "D\u266F", "E", "F", "F\u266F", "G", "G\u266F", "A", "A\u266F", "B"],
          choiceValues: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
          discrete: true
        },
        {
          id: 1,
          label: "Scale",
          choices: ["Major", "Minor", "Dorian", "Mixolydian", "Pentatonic", "Chromatic"],
          choiceValues: [1, 2, 3, 4, 5, 6],
          discrete: true
        },
        {
          id: 2,
          label: "Direction",
          choices: ["Nearest", "Up", "Down"],
          choiceValues: [1, 2, 3],
          discrete: true
        }
      ]
    },
    "midi-velocity-mapper": {
      label: "MIDI velocity mapper",
      parameters: [
        { id: 0, label: "Amount" },
        {
          id: 1,
          label: "Curve",
          choices: ["Linear", "Soft", "Hard"],
          choiceValues: [0, 1, 2],
          discrete: true
        },
        { id: 2, label: "Offset" }
      ]
    },
    "midi-arpeggiator": {
      label: "MIDI arpeggiator",
      parameters: [
        { id: 0, label: "Rate" },
        {
          id: 1,
          label: "Mode",
          choices: ["Up", "Down", "Ping-pong", "Random"],
          choiceValues: [0, 1, 2, 3],
          discrete: true
        },
        {
          id: 2,
          label: "Octaves",
          choices: ["1", "2", "3", "4"],
          choiceValues: [1, 2, 3, 4],
          discrete: true
        },
        { id: 3, label: "Gate length" },
        { id: 4, label: "Hold", choices: ["Off", "On"], choiceValues: [0, 1], discrete: true }
      ]
    },
    constant: {
      label: "Constant signal",
      parameters: [{ id: 0, label: "Value" }]
    },
    "linear-blend": {
      label: "Linear blend",
      parameters: [{ id: 0, label: "Mix" }]
    },
    "slew-audio": {
      label: "Audio slew",
      parameters: [
        { id: 0, label: "Rise samples" },
        { id: 1, label: "Fall samples" }
      ]
    },
    "phrase-gain": {
      label: "Phrase gain",
      parameters: [
        { id: 0, label: "Amount" },
        { id: 1, label: "Reference level" }
      ]
    }
  };

  // packages/manifold-author/parameter-names.js
  var PARAMETER_NAMES = {
    "adsr": {
      "0": "attack",
      "1": "decay",
      "2": "sustain",
      "3": "release",
      "4": "gate",
      "5": "retriggerSequence"
    },
    "gain": {
      "0": "level"
    },
    "distortion": {
      "0": "drive",
      "1": "wetMix",
      "2": "output"
    },
    "svf": {
      "0": "mode",
      "1": "cutoff",
      "2": "resonance"
    },
    "modulated-svf": {
      "0": "mode",
      "1": "cutoff",
      "2": "resonance",
      "3": "cvDepthHz"
    },
    "effect-slot-legacy": {
      "0": "effect",
      "1": "mix",
      "2": "p1",
      "3": "p2",
      "4": "p3",
      "5": "p4",
      "6": "p5"
    },
    "eq8": {
      "0": "band1Enabled",
      "1": "band1Curve",
      "2": "band1Frequency",
      "3": "band1GainDb",
      "4": "band1Q",
      "5": "band2Enabled",
      "6": "band2Curve",
      "7": "band2Frequency",
      "8": "band2GainDb",
      "9": "band2Q",
      "10": "band3Enabled",
      "11": "band3Curve",
      "12": "band3Frequency",
      "13": "band3GainDb",
      "14": "band3Q",
      "15": "band4Enabled",
      "16": "band4Curve",
      "17": "band4Frequency",
      "18": "band4GainDb",
      "19": "band4Q",
      "20": "band5Enabled",
      "21": "band5Curve",
      "22": "band5Frequency",
      "23": "band5GainDb",
      "24": "band5Q",
      "25": "band6Enabled",
      "26": "band6Curve",
      "27": "band6Frequency",
      "28": "band6GainDb",
      "29": "band6Q",
      "30": "band7Enabled",
      "31": "band7Curve",
      "32": "band7Frequency",
      "33": "band7GainDb",
      "34": "band7Q",
      "35": "band8Enabled",
      "36": "band8Curve",
      "37": "band8Frequency",
      "38": "band8GainDb",
      "39": "band8Q",
      "40": "outputDb",
      "41": "mix"
    },
    "wave-shaper": {
      "0": "curve",
      "1": "driveDb",
      "2": "outputDb",
      "3": "preFilterHz",
      "4": "postFilterHz",
      "5": "bias",
      "6": "wetMix",
      "7": "legacyToneFactor"
    },
    "legacy-filter": {
      "0": "cutoffHz",
      "1": "resonance",
      "2": "wetMix"
    },
    "mixer9": {
      "0": "masterLevel"
    },
    "mixer": {
      "0": "masterLevel",
      "1": "input1Gain",
      "2": "input2Gain",
      "3": "input3Gain",
      "4": "input4Gain",
      "5": "input5Gain",
      "6": "input6Gain",
      "7": "input7Gain",
      "8": "input8Gain",
      "9": "input9Gain",
      "10": "input10Gain",
      "11": "input11Gain",
      "12": "input12Gain",
      "13": "input13Gain",
      "14": "input14Gain",
      "15": "input15Gain",
      "16": "input16Gain",
      "17": "input17Gain",
      "18": "input18Gain",
      "19": "input19Gain",
      "20": "input20Gain",
      "21": "input21Gain",
      "22": "input22Gain",
      "23": "input23Gain",
      "24": "input24Gain",
      "25": "input25Gain",
      "26": "input26Gain",
      "27": "input27Gain",
      "28": "input28Gain",
      "29": "input29Gain",
      "30": "input30Gain",
      "31": "input31Gain",
      "32": "input32Gain",
      "33": "input1Pan",
      "34": "input2Pan",
      "35": "input3Pan",
      "36": "input4Pan",
      "37": "input5Pan",
      "38": "input6Pan",
      "39": "input7Pan",
      "40": "input8Pan",
      "41": "input9Pan",
      "42": "input10Pan",
      "43": "input11Pan",
      "44": "input12Pan",
      "45": "input13Pan",
      "46": "input14Pan",
      "47": "input15Pan",
      "48": "input16Pan",
      "49": "input17Pan",
      "50": "input18Pan",
      "51": "input19Pan",
      "52": "input20Pan",
      "53": "input21Pan",
      "54": "input22Pan",
      "55": "input23Pan",
      "56": "input24Pan",
      "57": "input25Pan",
      "58": "input26Pan",
      "59": "input27Pan",
      "60": "input28Pan",
      "61": "input29Pan",
      "62": "input30Pan",
      "63": "input31Pan",
      "64": "input32Pan"
    },
    "phase-vocoder": {
      "0": "mode",
      "1": "pitchSemitones",
      "2": "timeStretch",
      "3": "wetMix",
      "4": "fftOrder"
    },
    "crossfader": {
      "0": "position",
      "1": "curve",
      "2": "wetMix"
    },
    "ring-modulator": {
      "0": "carrierHz",
      "1": "depth",
      "2": "wetMix",
      "3": "spread",
      "4": "enabled"
    },
    "audio-fm": {
      "0": "amount",
      "1": "wetMix"
    },
    "audio-sync": {
      "0": "hardness",
      "1": "wetMix"
    },
    "loop-capture": {
      "0": "record",
      "1": "play",
      "2": "overdub",
      "3": "speed",
      "4": "reverse",
      "5": "loopMix",
      "6": "overdubLevel"
    },
    "oscillator": {
      "0": "waveform",
      "1": "frequency",
      "2": "level"
    },
    "extended-oscillator": {
      "0": "waveform",
      "1": "frequency",
      "2": "level",
      "3": "syncEnabled",
      "4": "pulseWidth",
      "5": "drive",
      "6": "driveShape",
      "7": "driveBias",
      "8": "driveMix",
      "9": "retriggerOnLevelRise",
      "10": "unisonVoices",
      "11": "detuneCents",
      "12": "stereoSpread",
      "13": "renderMode",
      "14": "additivePartials",
      "15": "additiveTilt",
      "16": "additiveDrift"
    },
    "pulse-oscillator": {
      "1": "frequency",
      "2": "level",
      "4": "pulseWidth"
    },
    "noise": {
      "0": "level",
      "1": "color"
    },
    "lfo": {
      "0": "waveform",
      "1": "rate"
    },
    "modulated-gain": {
      "0": "base",
      "1": "depth"
    },
    "slew-control": {
      "0": "riseSamples",
      "1": "fallSamples"
    },
    "attenuverter-bias": {
      "0": "amount",
      "1": "bias"
    },
    "sample-hold": {
      "0": "mode"
    },
    "cv-mix": {
      "0": "input1",
      "1": "input2",
      "2": "input3",
      "3": "input4",
      "4": "offset"
    },
    "cv-compare": {
      "0": "direction",
      "1": "threshold",
      "2": "hysteresis"
    },
    "cv-range": {
      "0": "minimum",
      "1": "maximum",
      "2": "mode"
    },
    "stereo-widener": {
      "0": "width",
      "1": "monoLowCutoff",
      "2": "monoLow"
    },
    "midi-transpose": {
      "0": "semitones"
    },
    "voice-synth": {
      "0": "waveform",
      "1": "attack",
      "2": "decay",
      "3": "sustain",
      "4": "release",
      "5": "level"
    },
    "sample-instrument": {
      "0": "rootNote",
      "1": "keyTracking",
      "2": "level",
      "3": "speed",
      "4": "reverse",
      "5": "oneShot",
      "6": "playStart",
      "7": "loopStart",
      "8": "loopEnd",
      "9": "crossfade",
      "10": "release",
      "11": "unison",
      "12": "detune",
      "13": "spread"
    },
    "sample-region": {
      "0": "speed",
      "1": "reverse",
      "2": "oneShot",
      "3": "playStart",
      "4": "loopStart",
      "5": "loopEnd",
      "8": "crossfade",
      "9": "unison",
      "10": "detune",
      "11": "spread"
    },
    "granulator": {
      "0": "grainSize",
      "1": "density",
      "2": "position",
      "3": "pitch",
      "4": "spray",
      "5": "wetMix",
      "6": "freeze",
      "7": "envelope",
      "8": "enabled",
      "9": "regionStart",
      "10": "regionEnd"
    },
    "main-voice-bank": {
      "0": "waveShape",
      "1": "waveSample",
      "2": "sampleRoot",
      "3": "keytrack",
      "4": "samplePitch",
      "5": "pitchEngine",
      "6": "blendMode",
      "7": "directionDepth",
      "8": "waveToSample",
      "9": "sampleToWave",
      "10": "syncRetrigger",
      "11": "attack",
      "12": "decay",
      "13": "sustain",
      "14": "release",
      "15": "output",
      "16": "vocoderTime",
      "17": "phraseContour",
      "18": "phraseReference",
      "19": "addWaveSource"
    },
    "compressor": {
      "0": "thresholdDb",
      "1": "ratio",
      "5": "makeupDb",
      "10": "mix"
    },
    "limiter": {
      "0": "thresholdDb",
      "1": "releaseMs",
      "2": "makeupDb",
      "3": "softClip",
      "4": "mix"
    },
    "stereo-delay": {
      "0": "leftTimeMs",
      "1": "rightTimeMs",
      "2": "feedback",
      "3": "crossfeed",
      "4": "lowpassEnabled",
      "5": "cutoffHz",
      "7": "mix",
      "8": "pingPong",
      "9": "width",
      "10": "freeze",
      "11": "ducking",
      "12": "tempoSync",
      "13": "leftDivision",
      "14": "rightDivision",
      "15": "tempoBpm"
    },
    "phaser": {
      "0": "rateHz",
      "1": "depth",
      "2": "stages",
      "3": "feedback",
      "4": "spreadDegrees"
    },
    "chorus": {
      "0": "rateHz",
      "1": "depth",
      "2": "voices",
      "3": "spread",
      "4": "feedback",
      "5": "waveform",
      "6": "mix"
    },
    "reverb": {
      "0": "roomSize",
      "1": "damping",
      "2": "wet",
      "3": "dry",
      "4": "width"
    },
    "multitap-delay": {
      "0": "taps",
      "1": "feedback",
      "2": "mix",
      "3": "tap1TimeMs",
      "4": "tap1Gain",
      "5": "tap1Pan",
      "6": "tap2TimeMs",
      "7": "tap2Gain",
      "8": "tap2Pan",
      "9": "tap3TimeMs",
      "10": "tap3Gain",
      "11": "tap3Pan",
      "12": "tap4TimeMs",
      "13": "tap4Gain",
      "14": "tap4Pan",
      "15": "tap5TimeMs",
      "16": "tap5Gain",
      "17": "tap5Pan",
      "18": "tap6TimeMs",
      "19": "tap6Gain",
      "20": "tap6Pan",
      "21": "tap7TimeMs",
      "22": "tap7Gain",
      "23": "tap7Pan",
      "24": "tap8TimeMs",
      "25": "tap8Gain",
      "26": "tap8Pan"
    },
    "transient-shaper": {
      "0": "attack",
      "1": "sustain",
      "2": "sensitivity",
      "3": "mix"
    },
    "bit-crusher": {
      "0": "bits",
      "1": "rateReduction",
      "2": "mix",
      "3": "output",
      "4": "logic"
    },
    "three-band-eq": {
      "0": "lowGainDb",
      "1": "lowFrequencyHz",
      "2": "midGainDb",
      "3": "midFrequencyHz",
      "4": "midQ",
      "5": "highGainDb",
      "6": "highFrequencyHz",
      "7": "outputDb",
      "8": "mix"
    },
    "formant-filter": {
      "0": "vowel",
      "1": "shiftSemitones",
      "2": "resonance",
      "3": "drive",
      "4": "mix"
    },
    "resonator": {
      "0": "gain",
      "1": "frequencyHz",
      "2": "q"
    },
    "reverse-delay": {
      "0": "timeMs",
      "1": "windowMs",
      "2": "feedback",
      "3": "mix"
    },
    "stutter": {
      "0": "lengthBeats",
      "1": "gate",
      "2": "filterDecay",
      "3": "pitchDecay",
      "4": "probability",
      "5": "pattern",
      "6": "tempoBpm",
      "7": "mix"
    },
    "pitch-shifter": {
      "0": "pitchSemitones",
      "1": "windowMs",
      "2": "feedback",
      "3": "mix"
    },
    "shimmer": {
      "0": "size",
      "1": "pitchSemitones",
      "2": "feedback",
      "3": "mix",
      "4": "modulation",
      "5": "cutoffHz"
    },
    "spectrum-analyzer": {
      "0": "sensitivity",
      "1": "smoothing",
      "2": "floorDb"
    },
    "fft-spectrum": {
      "0": "smoothing",
      "1": "floorDb"
    },
    "envelope-follower": {
      "0": "attackMs",
      "1": "releaseMs",
      "2": "sensitivity",
      "3": "highpassHz",
      "4": "mode"
    },
    "envelope-control": {
      "0": "attackMs",
      "1": "releaseMs",
      "2": "sensitivity",
      "3": "highpassHz",
      "4": "mode"
    },
    "midi-note-filter": {
      "0": "lowNote",
      "1": "highNote",
      "2": "rangeMode"
    },
    "midi-scale-quantizer": {
      "0": "root",
      "1": "scale",
      "2": "direction"
    },
    "midi-velocity-mapper": {
      "0": "amount",
      "1": "curve",
      "2": "offset"
    },
    "midi-arpeggiator": {
      "0": "rateHz",
      "1": "direction",
      "2": "octaves",
      "3": "gate",
      "4": "hold"
    },
    "constant": {
      "0": "value"
    },
    "linear-blend": {
      "0": "mix"
    },
    "slew-audio": {
      "0": "riseSamples",
      "1": "fallSamples"
    },
    "phrase-gain": {
      "0": "amount",
      "1": "reference"
    }
  };

  // packages/manifold-author/workspace-types.js
  var VISUAL_NAMES = [
    "CHORUS",
    "PHASER",
    "WAVESHAPER",
    "COMPRESSOR",
    "STEREO WIDENER",
    "FILTER",
    "SVF FILTER",
    "REVERB",
    "STEREO DELAY",
    "MULTITAP",
    "PITCH SHIFT",
    "GRANULATOR",
    "RING MOD",
    "FORMANT",
    "EQ",
    "LIMITER",
    "TRANSIENT",
    "BITCRUSHER",
    "SHIMMER",
    "REVERSE DELAY",
    "STUTTER"
  ];
  var EQ_CURVES = ["Bell", "Low shelf", "High shelf", "Low pass", "High pass", "Notch", "Band pass"];
  var EQ_PARAMETERS = Array.from({ length: 8 }, (_, band) => [
    { id: band * 5, label: `Band ${band + 1} on`, choices: ["Off", "On"] },
    { id: band * 5 + 1, label: `Band ${band + 1} curve`, choices: EQ_CURVES },
    { id: band * 5 + 2, label: `Band ${band + 1} Hz` },
    { id: band * 5 + 3, label: `Band ${band + 1} dB` },
    { id: band * 5 + 4, label: `Band ${band + 1} Q` }
  ]).flat().concat([
    { id: 40, label: "Output dB" },
    { id: 41, label: "Mix" }
  ]);
  var NODE_PRESENTATION = {
    ...ADDITIONAL_NODES,
    adsr: { label: "ADSR", parameters: [{ id: 0, label: "Attack" }, { id: 1, label: "Decay" }, { id: 2, label: "Sustain" }, { id: 3, label: "Release" }, { id: 4, label: "Gate", choices: ["Off", "On"] }, { id: 5, label: "Retrigger sequence", discrete: true }] },
    "input.raw": { label: "Live input", fixedId: 1 },
    "input.sidechain": { label: "Sidechain input" },
    output: { label: "Output", fixedId: 3 },
    gain: {
      label: "Gain",
      parameters: [{ id: 0, name: "level", label: "Level" }]
    },
    "fixed-gain": { label: "Fixed gain \xD74" },
    distortion: {
      label: "Distortion",
      parameters: [
        { id: 0, label: "Drive" },
        { id: 1, label: "Wet mix" },
        { id: 2, label: "Output" }
      ]
    },
    svf: {
      label: "SVF filter",
      parameters: [
        { id: 0, label: "Mode", choices: ["Low pass", "Band pass", "High pass", "Notch"] },
        { id: 1, label: "Cutoff" },
        { id: 2, label: "Resonance" }
      ]
    },
    "modulated-svf": { label: "CV filter", parameters: [
      { id: 0, label: "Mode", choices: ["Low pass", "Band pass", "High pass", "Notch"] },
      { id: 1, label: "Cutoff" },
      { id: 2, label: "Resonance" },
      { id: 3, label: "CV depth Hz" }
    ] },
    "effect-slot-legacy": { label: "Main FX slot", parameters: [
      { id: 0, label: "Effect", choices: VISUAL_NAMES },
      { id: 1, label: "Mix" },
      ...Array.from({ length: 5 }, (_, index) => ({
        id: index + 2,
        label: `P${index + 1}`
      }))
    ] },
    eq8: {
      label: "Eight-band EQ",
      parameters: EQ_PARAMETERS
    },
    "wave-shaper": { label: "WaveShaper", parameters: [
      { id: 0, label: "Curve", choices: ["Tanh", "Asymmetric", "Arctangent", "Hard clip", "Fold", "Soft clip", "Diode"] },
      { id: 1, label: "Drive dB" },
      { id: 2, label: "Output dB" },
      { id: 3, label: "Pre-filter Hz (0 disables)" },
      { id: 4, label: "Post-filter Hz (0 disables)" },
      { id: 5, label: "Bias" },
      { id: 6, label: "Wet mix" },
      { id: 7, label: "Legacy tone factor (source: 1, 2 or 4)", discrete: true }
    ] },
    "legacy-filter": { label: "Legacy Filter", parameters: [
      { id: 0, label: "Cutoff Hz" },
      { id: 1, label: "Resonance" },
      { id: 2, label: "Wet mix" }
    ] },
    sum2: { label: "Audio sum" },
    mixer9: { label: "Nine-input mixer", parameters: [{ id: 0, label: "Master level" }] },
    mixer: { label: "Mixer", parameters: [
      { id: 0, label: "Master level" },
      ...Array.from({ length: 32 }, (_, index) => ({ id: index + 1, label: `Input ${index + 1} gain` })),
      ...Array.from({ length: 32 }, (_, index) => ({ id: index + 33, label: `Input ${index + 1} pan` }))
    ] },
    "phase-vocoder": { label: "Phase vocoder", parameters: [
      { id: 0, label: "Mode", choices: ["Bin mapping", "Stretch then resample"] },
      { id: 1, label: "Pitch semitones" },
      { id: 2, label: "Time stretch" },
      { id: 3, label: "Wet mix" },
      {
        id: 4,
        label: "FFT order (prepare only)",
        choices: ["512", "1024", "2048", "4096"],
        choiceValues: [9, 10, 11, 12]
      }
    ] },
    crossfader: { label: "Equal-power crossfader", parameters: [
      { id: 0, label: "Position" },
      { id: 1, label: "Curve" },
      { id: 2, label: "Wet mix" }
    ] },
    "ring-modulator": { label: "Ring modulator", parameters: [
      { id: 0, label: "Carrier Hz" },
      { id: 1, label: "Depth" },
      { id: 2, label: "Wet mix" },
      { id: 3, label: "Spread" },
      { id: 4, label: "Enabled", choices: ["Off", "On"] }
    ] },
    "audio-fm": { label: "Audio FM", parameters: [
      { id: 0, label: "Amount" },
      { id: 1, label: "Wet mix" }
    ] },
    "audio-sync": { label: "Audio sync", parameters: [
      { id: 0, label: "Hardness" },
      { id: 1, label: "Wet mix" }
    ] },
    "loop-capture": {
      label: "Loop capture",
      parameters: [
        { id: 0, label: "Record", choices: ["Stopped", "Recording"] },
        { id: 1, label: "Play", choices: ["Off", "On"] },
        { id: 2, label: "Overdub", choices: ["Off", "On"] },
        { id: 3, label: "Speed" },
        { id: 4, label: "Reverse", choices: ["Forward", "Reverse"] },
        { id: 5, label: "Loop mix" },
        { id: 6, label: "Overdub level" }
      ]
    },
    "retrospective-capture": { label: "Retrospective capture" },
    oscillator: {
      label: "Oscillator",
      parameters: [
        { id: 0, name: "waveform", label: "Waveform", choices: ["Sine", "Saw", "Square", "Triangle", "Blend"] },
        { id: 1, name: "frequency", label: "Frequency" },
        { id: 2, name: "level", label: "Level" }
      ]
    },
    "extended-oscillator": {
      label: "Extended oscillator",
      parameters: [
        { id: 0, label: "Waveform", choices: ["Sine", "Saw", "Square", "Triangle", "Blend", "Noise", "Pulse", "Supersaw"] },
        { id: 1, label: "Frequency" },
        { id: 2, label: "Level" },
        { id: 3, label: "Sync enabled", choices: ["Free", "Sync"] },
        { id: 4, label: "Pulse width" },
        { id: 5, label: "Drive" },
        { id: 6, label: "Drive shape", choices: ["Tanh", "Atan", "Clip", "Fold"] },
        { id: 7, label: "Drive bias" },
        { id: 8, label: "Drive mix" },
        { id: 9, label: "Retrigger on level rise", choices: ["Off", "On"] },
        { id: 10, label: "Unison voices" },
        { id: 11, label: "Detune cents" },
        { id: 12, label: "Stereo spread" },
        { id: 13, label: "Render mode", choices: ["Standard", "Additive"] },
        { id: 14, label: "Additive partials" },
        { id: 15, label: "Additive tilt" },
        { id: 16, label: "Additive drift" }
      ]
    },
    "pulse-oscillator": {
      label: "Pulse oscillator",
      parameters: [
        { id: 1, label: "Frequency" },
        { id: 2, label: "Level" },
        { id: 4, label: "Pulse width" }
      ]
    },
    noise: {
      label: "Noise",
      parameters: [
        { id: 0, label: "Level" },
        { id: 1, label: "Color" }
      ]
    },
    lfo: {
      label: "LFO",
      parameters: [
        { id: 0, name: "waveform", label: "Waveform", choices: ["Sine", "Triangle", "Square"] },
        { id: 1, name: "rate", label: "Rate" }
      ]
    },
    "modulated-gain": {
      label: "CV gain",
      parameters: [
        { id: 0, name: "base", label: "Base" },
        { id: 1, name: "depth", label: "Depth" }
      ]
    },
    "slew-control": {
      label: "CV slew",
      parameters: [{ id: 0, label: "Rise samples" }, { id: 1, label: "Fall samples" }]
    },
    "attenuverter-bias": {
      label: "Attenuverter / bias",
      parameters: [{ id: 0, label: "Amount" }, { id: 1, label: "Bias" }]
    },
    "sample-hold": {
      label: "Sample / hold",
      parameters: [{ id: 0, label: "Mode", choices: ["Sample", "Track", "12-step"] }]
    },
    "cv-mix": {
      label: "CV mixer",
      parameters: [
        { id: 0, label: "Input 1" },
        { id: 1, label: "Input 2" },
        { id: 2, label: "Input 3" },
        { id: 3, label: "Input 4" },
        { id: 4, label: "Offset" }
      ]
    },
    "cv-compare": {
      label: "CV compare",
      parameters: [
        { id: 0, label: "Direction", choices: ["Rise", "Fall", "Both"] },
        { id: 1, label: "Threshold" },
        { id: 2, label: "Hysteresis" }
      ]
    },
    "cv-range": {
      label: "CV range",
      parameters: [
        { id: 0, label: "Minimum" },
        { id: 1, label: "Maximum" },
        { id: 2, label: "Mode", choices: ["Clamp", "Remap"] }
      ]
    },
    "stereo-widener": {
      label: "Stereo widener",
      parameters: [
        { id: 0, label: "Width" },
        { id: 1, label: "Mono low cutoff" },
        { id: 2, label: "Mono low", choices: ["Off", "On"] }
      ]
    },
    "midi-input": { label: "MIDI input" },
    "midi-transpose": {
      label: "MIDI transpose",
      parameters: [{ id: 0, label: "Semitones" }]
    },
    "voice-synth": {
      label: "Voice synth",
      parameters: [
        { id: 0, label: "Waveform", choices: ["Sine", "Saw", "Square", "Triangle"] },
        { id: 1, label: "Attack" },
        { id: 2, label: "Decay" },
        { id: 3, label: "Sustain" },
        { id: 4, label: "Release" },
        { id: 5, label: "Level" }
      ]
    },
    "sample-instrument": {
      label: "Sample instrument",
      parameters: [
        { id: 0, label: "Root note" },
        { id: 1, label: "Key tracking" },
        { id: 2, label: "Level" },
        { id: 3, label: "Speed" },
        { id: 4, label: "Reverse", choices: ["Forward", "Reverse"] },
        { id: 5, label: "One shot", choices: ["Loop", "One shot"] },
        { id: 6, label: "Play start" },
        { id: 7, label: "Loop start" },
        { id: 8, label: "Loop end" },
        { id: 9, label: "Crossfade" },
        { id: 10, label: "Release" },
        { id: 11, label: "Unison" },
        { id: 12, label: "Detune" },
        { id: 13, label: "Spread" }
      ]
    },
    "sample-region": {
      label: "Sample region",
      parameters: [
        { id: 0, label: "Speed" },
        { id: 1, label: "Reverse", choices: ["Forward", "Reverse"] },
        { id: 2, label: "One shot", choices: ["Loop", "One shot"] },
        { id: 3, label: "Play start" },
        { id: 4, label: "Loop start" },
        { id: 5, label: "Loop end" },
        { id: 8, label: "Crossfade" },
        { id: 9, label: "Unison", choices: ["1", "2", "3", "4", "5", "6", "7", "8"], choiceValues: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: 10, label: "Detune" },
        { id: 11, label: "Spread" }
      ]
    },
    granulator: {
      label: "Granulator",
      parameters: [
        { id: 0, label: "Grain size" },
        { id: 1, label: "Density" },
        { id: 2, label: "Position" },
        { id: 3, label: "Pitch" },
        { id: 4, label: "Spray" },
        { id: 5, label: "Wet mix" },
        { id: 6, label: "Freeze", choices: ["Capture", "Freeze"] },
        { id: 7, label: "Envelope", choices: ["Hann", "Triangle", "Blackman", "Tukey", "Rectangle"] },
        { id: 8, label: "Enabled", choices: ["Off", "On"] },
        { id: 9, label: "Region start" },
        { id: 10, label: "Region end" }
      ]
    },
    "main-voice-bank": {
      label: "Main voice bank",
      parameters: [
        { id: 0, label: "Wave shape", choices: ["Sine", "Saw", "Square", "Triangle", "Sine + saw"] },
        { id: 1, label: "Wave / sample" },
        { id: 2, label: "Sample root" },
        { id: 3, label: "Keytrack", choices: ["Wave", "Sample", "Both"] },
        { id: 4, label: "Sample pitch" },
        { id: 5, label: "Pitch engine", choices: ["Classic", "Vocoder", "Vocoder HQ"] },
        { id: 6, label: "Blend mode", choices: ["Normal", "Ring", "FM", "Sync", "Add", "Morph"] },
        { id: 7, label: "Direction depth" },
        { id: 8, label: "Wave to sample" },
        { id: 9, label: "Sample to wave" },
        { id: 10, label: "Sync retrigger", choices: ["Off", "On"] },
        { id: 11, label: "Attack" },
        { id: 12, label: "Decay" },
        { id: 13, label: "Sustain" },
        { id: 14, label: "Release" },
        { id: 15, label: "Output" },
        { id: 16, label: "Vocoder time" },
        { id: 17, label: "Phrase contour" },
        { id: 18, label: "Phrase reference" },
        { id: 19, label: "Add wave source", choices: ["Prepared partials", "Original additive"] }
      ]
    }
  };
  if (Object.keys(NODE_PRESENTATION).length !== Object.keys(PORT_CATALOG).length) {
    throw new Error("Presentation and Rust primitive catalogs differ");
  }
  var WORKSPACE_TYPES = Object.fromEntries(Object.entries(NODE_PRESENTATION).map(([id, spec]) => {
    const ports = PORT_CATALOG[id];
    if (!ports) throw new Error(`Missing Rust port metadata for ${id}`);
    const labels = new Map((spec.parameters ?? []).map((parameter2) => [parameter2.id, parameter2]));
    if (labels.size !== ports.parameters.length) throw new Error(`Parameter count differs for ${id}`);
    const parameters = ports.parameters.map((contract) => {
      const display = labels.get(contract.id);
      const choiceValues = display?.choices?.map((_, index) => display.choiceValues?.[index] ?? index);
      if (!display || Boolean(display.choices || display.discrete) !== contract.discrete || choiceValues && (choiceValues.length !== display.choices.length || choiceValues[0] !== contract.min || choiceValues.at(-1) !== contract.max || choiceValues.some((value, index) => !Number.isInteger(value) || value < contract.min || value > contract.max || index > 0 && value <= choiceValues[index - 1]))) {
        throw new Error(`Parameter contract differs for ${id}:${contract.id}`);
      }
      const name3 = PARAMETER_NAMES[id]?.[contract.id];
      if (!name3) throw new Error(`Missing author parameter name for ${id}:${contract.id}`);
      return { ...contract, ...display, name: name3 };
    });
    if (!NODE_METADATA[id]) throw new Error(`Missing node description for ${id}`);
    return [id, {
      ...NODE_METADATA[id],
      label: spec.label,
      ...spec.fixedId === void 0 ? {} : { fixedId: spec.fixedId },
      ...parameters.length ? { parameters } : {},
      code: ports.code,
      args: ports.args,
      configuration: ports.configuration,
      inputs: ports.inputs.map((port2) => port2.signal),
      inputNames: ports.inputs.map((port2) => port2.name),
      output: ports.outputs[0]?.signal ?? null,
      outputs: ports.outputs.map((port2) => port2.signal),
      outputNames: ports.outputs.map((port2) => port2.name)
    }];
  }));
  var mixerParameterId = (index, pan) => index < 32 ? index + (pan ? 33 : 1) : 67 + (index - 32) * 2 + Number(pan);
  var validMixerInputs = (inputs) => Number.isInteger(inputs) && inputs >= 1 && Math.fround(inputs) === inputs && mixerParameterId(inputs - 1, true) <= 4294967295;
  function configuredWorkspaceType(node) {
    const base = WORKSPACE_TYPES[node.type];
    if (node.type !== "mixer") return base;
    const count = node.a ?? base.args.a;
    if (!validMixerInputs(count)) throw new Error("Mixer inputs must fit the graph port and parameter representation");
    const inputNames = Array.from({ length: count }, (_, index) => `in-${index + 1}`);
    const parameter2 = (index, pan) => ({
      ...base.parameters.find((entry) => entry.id === (pan ? 33 : 1)),
      id: mixerParameterId(index, pan),
      name: `input${index + 1}${pan ? "Pan" : "Gain"}`,
      label: `Input ${index + 1} ${pan ? "pan" : "gain"}`
    });
    return {
      ...base,
      inputs: inputNames.map(() => "audio"),
      inputNames,
      parameters: [
        base.parameters[0],
        ...Array.from({ length: count }, (_, i2) => parameter2(i2, false)),
        ...Array.from({ length: count }, (_, i2) => parameter2(i2, true))
      ]
    };
  }

  // packages/manifold-author/sample-assets.js
  var SAMPLE_TYPES = /* @__PURE__ */ new Set(["sample-region", "sample-instrument", "granulator", "main-voice-bank"]);
  var PCM_ASSET_TYPES = /* @__PURE__ */ new Set([...SAMPLE_TYPES, "loop-capture"]);
  var VALIDATED_PAYLOAD_BUDGET = 8 * 1024 * 1024;
  var validatedPayloads = /* @__PURE__ */ new Map();
  var validatedPayloadBytes = 0;
  function rememberPayload(payload) {
    if (validatedPayloads.has(payload)) return;
    const bytes = payload.length * 2;
    if (bytes > VALIDATED_PAYLOAD_BUDGET) return;
    while (validatedPayloads.size >= 8 || validatedPayloadBytes + bytes > VALIDATED_PAYLOAD_BUDGET) {
      const oldest = validatedPayloads.keys().next().value;
      validatedPayloads.delete(oldest);
      validatedPayloadBytes -= oldest.length * 2;
    }
    validatedPayloads.set(payload, true);
    validatedPayloadBytes += bytes;
  }
  function encodedBytes(bytes) {
    const parts = [];
    for (let start = 0; start < bytes.length; start += 8190) {
      const chunk = bytes.subarray(start, start + 8190);
      if (typeof btoa === "function") parts.push(btoa(String.fromCharCode(...chunk)));
      else {
        const encoded = new Uint8Array(4 * Math.ceil(chunk.length / 3));
        let position = 0;
        for (let index = 0; index < chunk.length; index += 3) {
          const value = chunk[index] << 16 | (chunk[index + 1] ?? 0) << 8 | (chunk[index + 2] ?? 0);
          for (const shift of [18, 12]) encoded[position++] = BASE64.charCodeAt(value >>> shift & 63);
          encoded[position++] = index + 1 < chunk.length ? BASE64.charCodeAt(value >>> 6 & 63) : 61;
          encoded[position++] = index + 2 < chunk.length ? BASE64.charCodeAt(value & 63) : 61;
        }
        let part = "";
        for (let offset2 = 0; offset2 < encoded.length; offset2 += 8190) {
          part += String.fromCharCode(...encoded.subarray(offset2, offset2 + 8190));
        }
        parts.push(part);
      }
    }
    return parts.join("");
  }
  var BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function validMetadata({ sourceRate, frames, label: label2 }) {
    return Number.isInteger(sourceRate) && sourceRate >= 8e3 && sourceRate <= 384e3 && Number.isSafeInteger(frames) && frames >= 1 && Number.isSafeInteger(frames * 8) && typeof label2 === "string";
  }
  function encodeSampleAsset(nodeId, stereo, sourceRate, label2) {
    const frames = stereo?.length / 2;
    if (!(stereo instanceof Float32Array) || !validMetadata({ sourceRate, frames, label: label2 }) || stereo.some((sample) => !Number.isFinite(sample))) {
      throw new TypeError("Invalid decoded stereo sample");
    }
    const bytes = new Uint8Array(stereo.length * 4);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < stereo.length; index++) view.setFloat32(index * 4, stereo[index], true);
    return { nodeId, sourceRate, frames, label: label2, pcmF32Base64: encodedBytes(bytes) };
  }
  function checkAssetMetadata(asset) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset) || Object.keys(asset).length !== 5 || !["nodeId", "sourceRate", "frames", "label", "pcmF32Base64"].every((key) => Object.hasOwn(asset, key))) {
      throw new TypeError("Invalid portable sample asset");
    }
    const value = {
      nodeId: asset.nodeId,
      sourceRate: asset.sourceRate,
      frames: asset.frames,
      label: asset.label,
      pcmF32Base64: asset.pcmF32Base64
    };
    if (!Number.isInteger(value.nodeId) || value.nodeId < 1 || value.nodeId > 4294967295 || !validMetadata(value) || typeof value.pcmF32Base64 !== "string" || value.pcmF32Base64.length !== 4 * Math.ceil(value.frames * 8 / 3)) {
      throw new TypeError("Invalid portable sample asset");
    }
    return value;
  }
  function decodeBytes(asset, knownValid) {
    if (!knownValid && !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.pcmF32Base64)) {
      throw new TypeError("Invalid portable sample asset");
    }
    let bytes;
    if (typeof atob === "function") {
      const binary = atob(asset.pcmF32Base64);
      if (binary.length !== asset.frames * 8) throw new TypeError("Invalid PCM byte count");
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    } else {
      bytes = new Uint8Array(asset.frames * 8);
      let position = 0;
      for (let index = 0; index < asset.pcmF32Base64.length; index += 4) {
        const part = asset.pcmF32Base64.slice(index, index + 4);
        const value = BASE64.indexOf(part[0]) << 18 | BASE64.indexOf(part[1]) << 12 | (part[2] === "=" ? 0 : BASE64.indexOf(part[2])) << 6 | (part[3] === "=" ? 0 : BASE64.indexOf(part[3]));
        bytes[position++] = value >>> 16;
        if (part[2] !== "=") bytes[position++] = value >>> 8;
        if (part[3] !== "=") bytes[position++] = value;
      }
      if (position !== bytes.length) throw new TypeError("Invalid PCM byte count");
    }
    if (!knownValid && encodedBytes(bytes) !== asset.pcmF32Base64) {
      throw new TypeError("Noncanonical PCM encoding");
    }
    return bytes;
  }
  function validateSampleAsset(asset) {
    asset = checkAssetMetadata(asset);
    if (validatedPayloads.has(asset.pcmF32Base64)) return asset;
    const bytes = decodeBytes(asset, false);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < asset.frames * 2; index++) {
      if (!Number.isFinite(view.getFloat32(index * 4, true))) throw new TypeError("Nonfinite PCM sample");
    }
    rememberPayload(asset.pcmF32Base64);
    return asset;
  }
  function decodeSampleAsset(asset) {
    asset = checkAssetMetadata(asset);
    const knownValid = validatedPayloads.has(asset.pcmF32Base64);
    const bytes = decodeBytes(asset, knownValid);
    const view = new DataView(bytes.buffer);
    const stereo = new Float32Array(asset.frames * 2);
    for (let index = 0; index < stereo.length; index++) {
      const value = view.getFloat32(index * 4, true);
      if (!Number.isFinite(value)) throw new TypeError("Nonfinite PCM sample");
      stereo[index] = value;
    }
    rememberPayload(asset.pcmF32Base64);
    return { nodeId: asset.nodeId, sourceRate: asset.sourceRate, stereo };
  }

  // packages/manifold-author/index.js
  var GraphContractError = class extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "GraphContractError";
      this.code = code;
      this.details = details;
    }
  };
  var fail = (code, message, details) => {
    throw new GraphContractError(code, message, details);
  };
  var stable = (value) => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) stable(child);
      Object.freeze(value);
    }
    return value;
  };
  var copy = (value) => structuredClone(value);
  var nodePorts = (node) => {
    if (node.type !== "mixer") return PORT_CATALOG[node.type];
    const spec = configuredWorkspaceType(node);
    return {
      inputs: spec.inputNames.map((name3, i2) => ({ name: name3, signal: spec.inputs[i2] })),
      outputs: PORT_CATALOG.mixer.outputs
    };
  };
  var nodeParameters = (node) => configuredWorkspaceType(node).parameters ?? [];
  var compareEdge = (a, b) => a.to - b.to || a.inputPort - b.inputPort;
  var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var utf8ByteLength = (value) => {
    let length = 0;
    for (const char of value) {
      const code = char.codePointAt(0);
      if (code >= 55296 && code <= 57343) return Infinity;
      length += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    }
    return length;
  };
  var exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
  var describe = (type, spec) => stable({
    type,
    ...copy(spec),
    inputs: copy(PORT_CATALOG[type].inputs),
    outputs: copy(PORT_CATALOG[type].outputs)
  });
  var endpointPath = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
  var comparePath = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  var validArguments = (type, node) => Object.entries(PORT_CATALOG[type].args).every(([key, value]) => {
    const field2 = Object.values(PORT_CATALOG[type].configuration).find((field3) => field3.argument === key);
    return field2 ? Number.isFinite(node[key]) && node[key] >= field2.min && node[key] <= (field2.max ?? Infinity) && (type !== "mixer" || key !== "a" || validMixerInputs(node[key])) && (!["loop-capture", "retrospective-capture"].includes(type) || key !== "a" || node[key] > 0) : node[key] === value;
  });
  var configuredNode = (type, node, config) => {
    if (!record(config)) fail("invalid-configuration", "Constructor configuration must be an object");
    const result = { ...node };
    for (const [name3, value] of Object.entries(config)) {
      const field2 = PORT_CATALOG[type].configuration[name3];
      if (!Object.hasOwn(PORT_CATALOG[type].configuration, name3) || !Number.isFinite(value) || value < field2.min || value > (field2.max ?? Infinity) || type === "mixer" && name3 === "inputs" && !validMixerInputs(value) || name3 === "capacitySeconds" && value <= 0) fail("invalid-configuration", `Invalid ${type} constructor field ${name3}`);
      result[field2.argument] = value;
    }
    return result;
  };
  function validateIoLayout(layout, nodes) {
    if (!exactKeys(layout, ["version", "inputs", "outputs", "inputBindings", "outputBindings"]) || layout.version !== 1) {
      fail("invalid-io", "Expected an I/O layout version 1");
    }
    const types2 = new Map(nodes.map((node) => [node.id, node.type]));
    for (const [direction, buses] of [["inputs", layout.inputs], ["outputs", layout.outputs]]) {
      if (!Array.isArray(buses)) fail("invalid-io", "Expected audio buses");
      const ids = /* @__PURE__ */ new Set();
      let total = 0;
      for (const bus of buses) {
        if (!exactKeys(bus, ["id", "name", "channels", "optional"]) || typeof bus.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(bus.id) || ids.has(bus.id) || typeof bus.name !== "string" || !bus.name || bus.name.trim() !== bus.name || !Number.isFinite(utf8ByteLength(bus.name)) || !Number.isSafeInteger(bus.channels) || bus.channels < 1 || typeof bus.optional !== "boolean" || direction === "outputs" && bus.optional) {
          fail("invalid-io", "Invalid or duplicate bus declaration");
        }
        ids.add(bus.id);
        total += bus.channels;
      }
      if (!Number.isSafeInteger(total)) fail("invalid-io", "Channel count cannot be represented exactly");
    }
    if (!Array.isArray(layout.inputBindings) || layout.inputBindings.length > nodes.length || !Array.isArray(layout.outputBindings) || layout.outputBindings.length !== layout.outputs.reduce((sum, bus) => sum + bus.channels, 0)) {
      fail("invalid-io", "I/O bindings do not match declared channels");
    }
    const bound = /* @__PURE__ */ new Set();
    for (const binding of layout.inputBindings) {
      if (!exactKeys(binding, ["nodeId", "channels"]) || !Number.isInteger(binding.nodeId) || !["input.raw", "input.sidechain", "input.monitor"].includes(types2.get(binding.nodeId)) || bound.has(binding.nodeId) || !Array.isArray(binding.channels) || binding.channels.length !== 2) {
        fail("invalid-io", "Input binding needs two explicit kernel lanes");
      }
      bound.add(binding.nodeId);
      for (const route of binding.channels) {
        if (route === null) continue;
        if (!exactKeys(route, ["bus", "channel"]) || !Number.isInteger(route.bus) || route.bus < 0 || !Number.isInteger(route.channel) || route.channel < 0 || !layout.inputs[route.bus] || route.channel >= layout.inputs[route.bus].channels) {
          fail("invalid-io", "Input channel route is outside its declared bus");
        }
      }
    }
    for (const node of nodes) if (["input.raw", "input.sidechain", "input.monitor"].includes(node.type) && !bound.has(node.id)) {
      fail("invalid-io", "Every host input node needs an explicit binding, including silence");
    }
    for (const route of layout.outputBindings) {
      if (route === null) continue;
      if (!exactKeys(route, ["nodeId", "outputPort", "channel"]) || !Number.isInteger(route.nodeId) || !Number.isInteger(route.outputPort) || route.outputPort < 0 || !Number.isInteger(route.channel) || route.channel < 0 || route.channel > 1 || PORT_CATALOG[types2.get(route.nodeId)]?.outputs[route.outputPort]?.signal !== "audio") {
        fail("invalid-io", "Output route needs an existing audio port and kernel lane");
      }
    }
    return stable(copy(layout));
  }
  var CAPTURE_WINDOW_FIELDS = [
    "captureWindowSeconds",
    "captureWindowMode",
    "captureWindowBars",
    "captureTempoBpm",
    "captureTimeSignatureNumerator",
    "captureTimeSignatureDenominator"
  ];
  var validCaptureWindow = (settings) => {
    if (!record(settings) || Object.keys(settings).some((key) => !CAPTURE_WINDOW_FIELDS.includes(key))) return false;
    const mode = settings.captureWindowMode ?? "seconds";
    const seconds = settings.captureWindowSeconds;
    const bars = settings.captureWindowBars;
    const tempo = settings.captureTempoBpm;
    const numerator = settings.captureTimeSignatureNumerator;
    const denominator = settings.captureTimeSignatureDenominator;
    return ["seconds", "bars", "free"].includes(mode) && (seconds === void 0 || Number.isFinite(seconds) && seconds > 0) && (bars === void 0 || Number.isFinite(bars) && bars > 0) && (tempo === void 0 || Number.isFinite(tempo) && tempo >= 20 && tempo <= 300) && (mode !== "bars" || bars !== void 0 && tempo !== void 0) && (numerator === void 0 && denominator === void 0 || Number.isInteger(numerator) && numerator >= 1 && numerator <= 128 && Number.isInteger(denominator) && denominator >= 1 && denominator <= 128);
  };
  function validateNamedInstances(signal, instances) {
    if (!Array.isArray(instances)) {
      fail("invalid-instances", "Expected named instances");
    }
    const nodes = new Set(signal.nodes.map((node) => node.id));
    const paths = /* @__PURE__ */ new Set();
    const targets = /* @__PURE__ */ new Set();
    return stable(instances.map((entry) => {
      if (!exactKeys(entry, ["path", "nodeId"]) || typeof entry.path !== "string" || !endpointPath.test(entry.path) || !Number.isInteger(entry.nodeId) || !nodes.has(entry.nodeId) || paths.has(entry.path) || targets.has(entry.nodeId)) {
        fail("invalid-instance", "Named instance must bind one unique path to one existing node");
      }
      paths.add(entry.path);
      targets.add(entry.nodeId);
      return copy(entry);
    }).sort(comparePath));
  }
  function validateParameterEndpoints(signal, endpoints) {
    if (!Array.isArray(endpoints)) {
      fail("invalid-endpoints", "Expected parameter endpoints");
    }
    const nodes = new Map(signal.nodes.map((node) => [node.id, node]));
    const parameters = new Map(signal.initialParameters.map((entry) => [`${entry.nodeId}:${entry.id}`, entry.value]));
    const paths = /* @__PURE__ */ new Set();
    const targets = /* @__PURE__ */ new Set();
    const result = [];
    for (const entry of endpoints) {
      if (!exactKeys(entry, ["path", "kind", "nodeId", "id", "min", "max", "default"]) || entry.kind !== "parameter" || typeof entry.path !== "string" || !endpointPath.test(entry.path) || !Number.isInteger(entry.nodeId) || !Number.isInteger(entry.id) || !Number.isFinite(entry.min) || !Number.isFinite(entry.max) || !Number.isFinite(entry.default) || Math.fround(entry.min) >= Math.fround(entry.max) || entry.default < entry.min || entry.default > entry.max) {
        fail("invalid-endpoint", "Parameter endpoint has an invalid path, shape, or range");
      }
      const target = `${entry.nodeId}:${entry.id}`;
      const node = nodes.get(entry.nodeId);
      const spec = node && nodeParameters(node).find((parameter2) => parameter2.id === entry.id);
      if (!spec || !parameters.has(target) || entry.min < spec.min || entry.max > spec.max || Math.fround(parameters.get(target)) < Math.fround(entry.min) || Math.fround(parameters.get(target)) > Math.fround(entry.max) || spec.discrete && [entry.min, entry.max, entry.default].some((value) => !Number.isInteger(value))) {
        fail("invalid-endpoint-target", `Endpoint ${entry.path} does not bind a compatible graph parameter`);
      }
      if (paths.has(entry.path) || targets.has(target)) {
        fail("duplicate-endpoint", "Endpoint paths and parameter targets must be unique");
      }
      paths.add(entry.path);
      targets.add(target);
      result.push(copy(entry));
    }
    return stable(result.sort(comparePath));
  }
  function validateHostAssignments(assignments) {
    if (!Array.isArray(assignments)) fail("invalid-host-assignments", "Expected host assignments");
    const slots = /* @__PURE__ */ new Set(), paths = /* @__PURE__ */ new Set();
    return stable(assignments.map((entry) => {
      if (!exactKeys(entry, ["slot", "path"]) && !exactKeys(entry, ["slot"]) || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot > 4294967295 - 16777216 || entry.path !== void 0 && (typeof entry.path !== "string" || !endpointPath.test(entry.path) || paths.has(entry.path)) || slots.has(entry.slot)) {
        fail("invalid-host-assignment", "Host assignments need unique slots and authored paths");
      }
      slots.add(entry.slot);
      if (entry.path !== void 0) paths.add(entry.path);
      return copy(entry);
    }).sort((a, b) => a.slot - b.slot));
  }
  function validateHostBindings(signal, bindings) {
    if (!Array.isArray(bindings)) {
      fail("invalid-host-bindings", "Expected host bindings");
    }
    const parameters = new Set(signal.initialParameters.map((entry) => `${entry.nodeId}:${entry.id}`));
    const slots = /* @__PURE__ */ new Set();
    const targets = /* @__PURE__ */ new Set();
    return stable(bindings.map((entry) => {
      if (!exactKeys(entry, ["slot", "nodeId", "id"]) || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot > 4294967295 - 16777216 || !Number.isInteger(entry.nodeId) || !Number.isInteger(entry.id)) {
        fail("invalid-host-binding", "Host binding has invalid fields");
      }
      const target = `${entry.nodeId}:${entry.id}`;
      if (!parameters.has(target) || slots.has(entry.slot) || targets.has(target)) {
        fail("invalid-host-binding", "Host slot and graph parameter must each be unique");
      }
      slots.add(entry.slot);
      targets.add(target);
      return copy(entry);
    }).sort((a, b) => a.slot - b.slot));
  }
  function validateProjectControls(controls, endpoints = []) {
    if (!Array.isArray(controls)) {
      fail("invalid-controls", "Expected project controls");
    }
    const paths = new Set(endpoints.map((entry) => entry.path));
    return stable(controls.map((entry) => {
      if (!exactKeys(entry, ["path", "min", "max", "default", "value", "discrete"]) || typeof entry.path !== "string" || !endpointPath.test(entry.path) || !Number.isFinite(entry.min) || !Number.isFinite(entry.max) || !Number.isFinite(entry.default) || !Number.isFinite(entry.value) || [entry.min, entry.max, entry.default, entry.value].some((value) => Math.abs(value) > 34028234663852886e22) || Math.fround(entry.min) >= Math.fround(entry.max) || entry.default < entry.min || entry.default > entry.max || entry.value < entry.min || entry.value > entry.max || typeof entry.discrete !== "boolean" || entry.discrete && [entry.min, entry.max, entry.default, entry.value].some((value) => !Number.isInteger(value)) || paths.has(entry.path)) {
        fail("invalid-control", "Project control has an invalid path, range, or value");
      }
      paths.add(entry.path);
      return copy(entry);
    }).sort(comparePath));
  }
  function listPrimitives() {
    return stable(Object.entries(WORKSPACE_TYPES).map(([type, spec]) => describe(type, spec)));
  }
  function getPrimitive(type) {
    const spec = Object.hasOwn(WORKSPACE_TYPES, type) ? WORKSPACE_TYPES[type] : void 0;
    if (!spec) fail("unknown-type", `Unknown primitive: ${type}`, { type });
    return describe(type, spec);
  }
  var PortRef = class {
    constructor(graph, id, generation, direction, index, description) {
      Object.defineProperty(this, "graph", { value: graph });
      this.nodeId = id;
      this.generation = generation;
      this.direction = direction;
      this.index = index;
      this.name = description.name;
      this.signal = description.signal;
      Object.freeze(this);
    }
  };
  var ParameterRef = class {
    constructor(node, name3) {
      Object.defineProperty(this, "node", { value: node });
      this.name = name3;
      Object.freeze(this);
    }
    get description() {
      const description = this.node.graph.describeNode(this.node).parameters.find((p) => p.name === this.name);
      if (!description) fail("unknown-parameter", `${this.node.type} has no named parameter ${this.name}`);
      return description;
    }
    set(value) {
      this.node.graph.setParameter(this.node, this.description.id, value);
      return this;
    }
    expose({ path, min, max, default: initial }) {
      const id = this.description.id;
      const candidate = this.node.graph.fork();
      const node = candidate.find(this.node.id);
      candidate.setParameter(node, id, initial);
      candidate.registerParameter(path, node, id, { min, max, default: initial });
      this.node.graph.setParameter(this.node, id, initial);
      this.node.graph.registerParameter(path, this.node, id, { min, max, default: initial });
      return this;
    }
  };
  var _NodeHandle_instances, port_fn;
  var NodeHandle = class {
    constructor(graph, id, generation, type) {
      __privateAdd(this, _NodeHandle_instances);
      Object.defineProperty(this, "graph", { value: graph });
      this.id = id;
      this.generation = generation;
      this.type = type;
      Object.freeze(this);
    }
    input(name3) {
      return __privateMethod(this, _NodeHandle_instances, port_fn).call(this, "inputs", name3);
    }
    output(name3) {
      return __privateMethod(this, _NodeHandle_instances, port_fn).call(this, "outputs", name3);
    }
    parameter(name3) {
      const names = this.graph.describeNode(this).parameters.map((p) => p.name).filter(Boolean);
      if (!names.includes(name3)) fail("unknown-parameter", `${this.type} has no named parameter ${name3}; available: ${names.join(", ") || "numeric parameters only"}`);
      return new ParameterRef(this, name3);
    }
  };
  _NodeHandle_instances = new WeakSet();
  port_fn = function(direction, name3) {
    this.graph.assertHandle(this);
    const ports = this.graph.describeNode(this)[direction];
    const index = ports.findIndex((port2) => port2.name === name3);
    if (index < 0) fail(
      "unknown-port",
      `${this.type} has no ${direction} port ${name3}`,
      { nodeId: this.id, direction, name: name3 }
    );
    return new PortRef(this.graph, this.id, this.generation, direction, index, ports[index]);
  };
  function parameterValue(project, path) {
    const endpoint = project.endpoints?.find((entry) => entry.path === path);
    if (!endpoint) fail("missing-endpoint", `Unknown parameter ${path}`);
    const parameter2 = project.signal.initialParameters.find((entry) => entry.nodeId === endpoint.nodeId && entry.id === endpoint.id);
    if (!parameter2) fail("missing-parameter", `No accepted value for ${path}`);
    return parameter2.value;
  }
  var _nodes, _edges, _parameters, _omittedParameters, _endpoints, _hostBindings, _hostAssignments, _explicitHostBindings, _controls, _instances, _assets, _sampleBindings, _generations, _revision, _inputSource, _captureSources, _defaultCaptureSourceId, _selectedCaptureSourceId, _selectedCaptureNodeId, _sidechainSource, _captureWindow, _io, _GraphWorkspace_instances, insert_fn, assertPort_fn;
  var _GraphWorkspace = class _GraphWorkspace {
    constructor() {
      __privateAdd(this, _GraphWorkspace_instances);
      __privateAdd(this, _nodes, /* @__PURE__ */ new Map());
      __privateAdd(this, _edges, /* @__PURE__ */ new Map());
      __privateAdd(this, _parameters, /* @__PURE__ */ new Map());
      __privateAdd(this, _omittedParameters, /* @__PURE__ */ new Set());
      __privateAdd(this, _endpoints, /* @__PURE__ */ new Map());
      __privateAdd(this, _hostBindings, /* @__PURE__ */ new Map());
      __privateAdd(this, _hostAssignments, /* @__PURE__ */ new Map());
      __privateAdd(this, _explicitHostBindings, false);
      __privateAdd(this, _controls, /* @__PURE__ */ new Map());
      __privateAdd(this, _instances, /* @__PURE__ */ new Map());
      __privateAdd(this, _assets, /* @__PURE__ */ new Map());
      __privateAdd(this, _sampleBindings, /* @__PURE__ */ new Map());
      __privateAdd(this, _generations, /* @__PURE__ */ new Map());
      __privateAdd(this, _revision, 0);
      __privateAdd(this, _inputSource, "none");
      __privateAdd(this, _captureSources, []);
      __privateAdd(this, _defaultCaptureSourceId, null);
      __privateAdd(this, _selectedCaptureSourceId, null);
      __privateAdd(this, _selectedCaptureNodeId, null);
      __privateAdd(this, _sidechainSource);
      __privateAdd(this, _captureWindow, {});
      __privateAdd(this, _io, null);
      __privateMethod(this, _GraphWorkspace_instances, insert_fn).call(this, 1, "input.raw");
      __privateMethod(this, _GraphWorkspace_instances, insert_fn).call(this, 3, "output");
    }
    get revision() {
      return __privateGet(this, _revision);
    }
    get input() {
      return this.find(1);
    }
    get output() {
      return this.find(3);
    }
    get ioLayout() {
      return __privateGet(this, _io);
    }
    setIoLayout(layout) {
      const checked = validateIoLayout(layout, [...__privateGet(this, _nodes).values()]);
      __privateSet(this, _io, checked);
      __privateWrapper(this, _revision)._++;
      return this;
    }
    setInputSource(source3) {
      if (__privateGet(this, _io)) fail("declared-io", "Use declared input buses instead of the legacy input recipe");
      if (!["none", "external"].includes(source3)) {
        fail("invalid-input-source", "Input source must be external or none");
      }
      if (__privateGet(this, _inputSource) !== source3) {
        __privateSet(this, _inputSource, source3);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    setSidechainSource(source3) {
      if (__privateGet(this, _io)) fail("declared-io", "Use declared input buses instead of the legacy sidechain recipe");
      if (!["none", "oscillator", "microphone"].includes(source3)) {
        fail("invalid-sidechain-source", "Sidechain source must be none, oscillator, or microphone");
      }
      if (__privateGet(this, _sidechainSource) !== source3) {
        __privateSet(this, _sidechainSource, source3);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    configureCaptureWindow(settings) {
      if (!validCaptureWindow(settings)) {
        fail("invalid-capture-window", "Capture window settings are outside the supported range");
      }
      __privateSet(this, _captureWindow, copy(settings));
      __privateWrapper(this, _revision)._++;
      return this;
    }
    registerCaptureSource(handle, name3, kind = "custom", id = null) {
      this.assertHandle(handle);
      if (!["loop-capture", "retrospective-capture"].includes(handle.type) || typeof name3 !== "string" || !name3 || name3.trim() !== name3 || name3.length > 80 || !["input", "sidechain", "layer", "custom"].includes(kind) || __privateGet(this, _captureSources).some((source3) => source3.nodeId === handle.id)) {
        fail("invalid-capture-source", "Capture source needs a unique prepared capture node, name, and kind");
      }
      const used = new Set(__privateGet(this, _captureSources).map((source3) => source3.id));
      const sourceId = id ?? Array.from({ length: 256 }, (_, candidate) => candidate).find((candidate) => !used.has(candidate));
      if (!Number.isInteger(sourceId) || sourceId < 0 || sourceId > 255 || used.has(sourceId)) {
        fail("invalid-capture-source", "Capture source ID must be a unique byte");
      }
      __privateGet(this, _captureSources).push({ id: sourceId, nodeId: handle.id, name: name3, kind });
      __privateGet(this, _defaultCaptureSourceId) ?? __privateSet(this, _defaultCaptureSourceId, sourceId);
      __privateGet(this, _selectedCaptureSourceId) ?? __privateSet(this, _selectedCaptureSourceId, sourceId);
      __privateSet(this, _selectedCaptureNodeId, __privateGet(this, _captureSources).find((source3) => source3.id === __privateGet(this, _selectedCaptureSourceId)).nodeId);
      __privateWrapper(this, _revision)._++;
      return this;
    }
    selectCaptureSource(id) {
      if (!__privateGet(this, _captureSources).some((source3) => source3.id === id)) {
        fail("unknown-capture-source", "Capture source ID is not registered");
      }
      if (__privateGet(this, _selectedCaptureSourceId) !== id) {
        __privateSet(this, _selectedCaptureSourceId, id);
        __privateSet(this, _selectedCaptureNodeId, __privateGet(this, _captureSources).find((source3) => source3.id === id).nodeId);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    listCaptureSources() {
      return stable(__privateGet(this, _captureSources).map(copy));
    }
    static fromProject(project) {
      if (!record(project) || Object.keys(project).some((key) => !["format", "schemaVersion", "projectId", "signal", "endpoints", "hostBindings", "hostAssignments", "controls", "instances", "assets", "sampleBindings", "liveAuthoring"].includes(key)) || ["format", "schemaVersion", "projectId", "signal"].some((key) => !Object.hasOwn(project, key)) || project.format !== "manifold.project" || project.schemaVersion !== 1 || project.projectId !== "manifold.graph-workspace") {
        fail("unsupported-project", "Expected a plain graph-workspace project version 1");
      }
      const signal = project.signal;
      const required = ["inputs", "outputs", "nodes", "connections", "initialParameters"];
      const keys = Object.keys(signal ?? {});
      if (!record(signal) || required.some((key) => !Object.hasOwn(signal, key)) || keys.some((key) => ![
        ...required,
        "io",
        "inputSource",
        "sidechainSource",
        "captureSources",
        "defaultCaptureSourceId",
        "selectedCaptureSourceId",
        "selectedCaptureNodeId",
        ...CAPTURE_WINDOW_FIELDS
      ].includes(key)) || signal.io === void 0 && (signal.inputs !== 2 || signal.outputs !== 2) || !["none", "external"].includes(signal.inputSource ?? "none") || signal.sidechainSource !== void 0 && !["none", "oscillator", "microphone"].includes(signal.sidechainSource) || !Array.isArray(signal.nodes) || !Array.isArray(signal.connections) || !Array.isArray(signal.initialParameters)) {
        fail("unsupported-project-fields", "Expected a stereo graph with supported project fields");
      }
      if (signal.nodes.length < 2) {
        fail("project-size", "Graph needs input and output boundaries");
      }
      const graph = new _GraphWorkspace();
      __privateSet(graph, _inputSource, signal.inputSource ?? "none");
      __privateSet(graph, _sidechainSource, signal.sidechainSource);
      __privateSet(graph, _captureWindow, Object.fromEntries(CAPTURE_WINDOW_FIELDS.filter((key) => signal[key] !== void 0).map((key) => [key, signal[key]])));
      if (!validCaptureWindow(__privateGet(graph, _captureWindow))) {
        fail("invalid-capture-window", "Project capture window settings are invalid");
      }
      const seen = /* @__PURE__ */ new Set();
      for (const node of signal.nodes) {
        const spec = record(node) && Object.hasOwn(WORKSPACE_TYPES, node.type) ? WORKSPACE_TYPES[node.type] : void 0;
        if (!spec || !Number.isInteger(node.id) || node.id < 1 || node.id > 4294967295 || seen.has(node.id) || !exactKeys(node, ["id", "type", ...Object.keys(spec.args)]) || !validArguments(node.type, node)) {
          fail("invalid-project-node", "Project has an unknown, duplicate, or invalid graph node");
        }
        seen.add(node.id);
        if (node.id === 1 || node.id === 3) {
          if (node.type !== (node.id === 1 ? "input.raw" : "output")) {
            fail("invalid-project-boundary", "Project boundary IDs have the wrong type");
          }
        } else {
          const config = Object.fromEntries(Object.entries(PORT_CATALOG[node.type].configuration).map(([name3, field2]) => [name3, node[field2.argument]]));
          graph.add(node.type, { id: node.id, config });
        }
      }
      if (!seen.has(1) || !seen.has(3)) fail("missing-project-boundary", "Project needs input and output boundary nodes");
      if (signal.captureSources !== void 0 || signal.defaultCaptureSourceId !== void 0 || signal.selectedCaptureSourceId !== void 0) {
        if (!Array.isArray(signal.captureSources) || signal.captureSources.length < 1) {
          fail("invalid-capture-sources", "Project capture registry must contain a source");
        }
        for (const source3 of signal.captureSources) {
          if (!exactKeys(source3, ["id", "nodeId", "name", "kind"])) {
            fail("invalid-capture-source", "Project capture source has invalid fields");
          }
          const handle = graph.find(source3.nodeId);
          if (!handle) fail("invalid-capture-source", "Project capture source node is missing");
          graph.registerCaptureSource(handle, source3.name, source3.kind, source3.id);
        }
        if (!__privateGet(graph, _captureSources).some((source3) => source3.id === signal.defaultCaptureSourceId) || !__privateGet(graph, _captureSources).some((source3) => source3.id === signal.selectedCaptureSourceId && source3.nodeId === signal.selectedCaptureNodeId)) {
          fail("invalid-capture-source", "Project capture selection does not match its registry");
        }
        __privateSet(graph, _defaultCaptureSourceId, signal.defaultCaptureSourceId);
        graph.selectCaptureSource(signal.selectedCaptureSourceId);
      } else if (signal.selectedCaptureNodeId !== void 0) {
        const handle = graph.find(signal.selectedCaptureNodeId);
        if (!handle || !["loop-capture", "retrospective-capture"].includes(handle.type)) {
          fail("invalid-capture-source", "Selected capture node is missing");
        }
        __privateSet(graph, _selectedCaptureNodeId, signal.selectedCaptureNodeId);
      }
      if (project.assets !== void 0) {
        if (!Array.isArray(project.assets)) {
          fail("invalid-assets", "Expected PCM assets");
        }
        for (const asset of project.assets) {
          const node = graph.find(asset?.nodeId);
          if (!node || !PCM_ASSET_TYPES.has(node.type) || __privateGet(graph, _assets).has(node.id)) {
            fail("invalid-asset-node", "PCM asset needs a unique compatible graph node");
          }
          let portable;
          try {
            portable = validateSampleAsset(asset);
          } catch {
            fail("invalid-asset", "Sample asset has invalid metadata or PCM");
          }
          if (portable.nodeId !== node.id) fail("invalid-asset-node", "PCM asset node changed during validation");
          __privateGet(graph, _assets).set(node.id, portable);
        }
      }
      if (project.sampleBindings !== void 0) {
        if (!Array.isArray(project.sampleBindings)) {
          fail("invalid-sample-bindings", "Expected sample bindings");
        }
        for (const binding of project.sampleBindings) {
          if (!exactKeys(binding, ["sourceNodeId", "nodeId"]) || !Number.isInteger(binding.sourceNodeId) || !Number.isInteger(binding.nodeId) || !__privateGet(graph, _assets).has(binding.sourceNodeId) || graph.find(binding.sourceNodeId)?.type !== "sample-region" || graph.find(binding.nodeId)?.type !== "sample-region" || binding.sourceNodeId === binding.nodeId || __privateGet(graph, _assets).has(binding.nodeId) || __privateGet(graph, _sampleBindings).has(binding.nodeId)) {
            fail("invalid-sample-binding", "Sample binding needs one source asset and a distinct unbound region");
          }
          __privateGet(graph, _sampleBindings).set(binding.nodeId, binding.sourceNodeId);
        }
      }
      for (const edge of signal.connections) {
        if (!(exactKeys(edge, ["from", "to", "inputPort"]) || exactKeys(edge, ["from", "outputPort", "to", "inputPort"])) || !Number.isInteger(edge.from) || !Number.isInteger(edge.to) || !Number.isInteger(edge.inputPort) || !Number.isInteger(edge.outputPort ?? 0)) {
          fail("invalid-project-edge", "Project connection has invalid indices or fields");
        }
        const from = graph.find(edge.from);
        const to = graph.find(edge.to);
        const output2 = from && graph.describeNode(from).outputs[edge.outputPort ?? 0];
        const input = to && graph.describeNode(to).inputs[edge.inputPort];
        if (!output2 || !input) fail("invalid-project-edge", "Project connection refers to a missing node or port");
        graph.connect(from.output(output2.name), to.input(input.name));
      }
      const parameters = /* @__PURE__ */ new Set();
      for (const entry of signal.initialParameters) {
        if (!exactKeys(entry, ["nodeId", "id", "value"]) || !Number.isInteger(entry.nodeId) || !Number.isInteger(entry.id)) {
          fail("invalid-project-parameter", "Project parameter has invalid fields");
        }
        const handle = graph.find(entry.nodeId);
        const key = `${entry.nodeId}:${entry.id}`;
        if (!handle || parameters.has(key) || !__privateGet(graph, _parameters).has(key)) {
          fail("invalid-project-parameter", "Project parameter is unknown or repeated");
        }
        parameters.add(key);
        graph.setParameter(handle, entry.id, entry.value);
      }
      for (const key of __privateGet(graph, _parameters).keys()) {
        if (parameters.has(key)) continue;
        const [nodeId, id] = key.split(":").map(Number);
        if (graph.find(nodeId)?.type === "sample-region" && id >= 9 && id <= 11) {
          __privateGet(graph, _omittedParameters).add(key);
        } else {
          fail("missing-project-parameter", "Project must specify every initial parameter");
        }
      }
      for (const endpoint of validateParameterEndpoints(graph.snapshot(), project.endpoints ?? [])) {
        __privateGet(graph, _endpoints).set(endpoint.path, endpoint);
      }
      __privateSet(graph, _explicitHostBindings, Object.hasOwn(project, "hostBindings") || Object.hasOwn(project, "hostAssignments"));
      for (const assignment of validateHostAssignments(project.hostAssignments ?? [])) {
        __privateGet(graph, _hostAssignments).set(assignment.slot, assignment);
      }
      for (const binding of validateHostBindings(graph.snapshot(), project.hostBindings ?? [])) {
        const assignment = __privateGet(graph, _hostAssignments).get(binding.slot);
        const endpoint = assignment && graph.findParameter(assignment.path);
        if (assignment?.path !== void 0 && (!endpoint || endpoint.nodeId !== binding.nodeId || endpoint.id !== binding.id))
          fail("reserved-host-slot", `Automation slot belongs to ${assignment.path}`);
        __privateGet(graph, _hostBindings).set(binding.slot, binding);
      }
      for (const control of validateProjectControls(project.controls ?? [], project.endpoints ?? [])) {
        __privateGet(graph, _controls).set(control.path, control);
      }
      for (const instance of validateNamedInstances(graph.snapshot(), project.instances ?? [])) {
        __privateGet(graph, _instances).set(instance.path, instance.nodeId);
      }
      if (signal.io !== void 0) {
        graph.setIoLayout(signal.io);
        if (signal.inputs !== signal.io.inputs.reduce((sum, b) => sum + b.channels, 0) || signal.outputs !== signal.io.outputs.reduce((sum, b) => sum + b.channels, 0)) fail("invalid-io", "I/O channel totals disagree");
      }
      graph.toProject();
      __privateSet(graph, _revision, 0);
      return graph;
    }
    /** Clone document state without decoding immutable sample assets again. */
    fork() {
      const next = new _GraphWorkspace();
      __privateSet(next, _nodes, new Map(__privateGet(this, _nodes)));
      __privateSet(next, _edges, new Map(__privateGet(this, _edges)));
      __privateSet(next, _parameters, new Map(__privateGet(this, _parameters)));
      __privateSet(next, _omittedParameters, new Set(__privateGet(this, _omittedParameters)));
      __privateSet(next, _endpoints, new Map(__privateGet(this, _endpoints)));
      __privateSet(next, _hostBindings, new Map(__privateGet(this, _hostBindings)));
      __privateSet(next, _hostAssignments, new Map(__privateGet(this, _hostAssignments)));
      __privateSet(next, _explicitHostBindings, __privateGet(this, _explicitHostBindings));
      __privateSet(next, _controls, new Map(__privateGet(this, _controls)));
      __privateSet(next, _instances, new Map(__privateGet(this, _instances)));
      __privateSet(next, _assets, new Map(__privateGet(this, _assets)));
      __privateSet(next, _sampleBindings, new Map(__privateGet(this, _sampleBindings)));
      __privateSet(next, _generations, new Map(__privateGet(this, _generations)));
      __privateSet(next, _revision, __privateGet(this, _revision));
      __privateSet(next, _inputSource, __privateGet(this, _inputSource));
      __privateSet(next, _captureSources, __privateGet(this, _captureSources).map(copy));
      __privateSet(next, _defaultCaptureSourceId, __privateGet(this, _defaultCaptureSourceId));
      __privateSet(next, _selectedCaptureSourceId, __privateGet(this, _selectedCaptureSourceId));
      __privateSet(next, _selectedCaptureNodeId, __privateGet(this, _selectedCaptureNodeId));
      __privateSet(next, _sidechainSource, __privateGet(this, _sidechainSource));
      __privateSet(next, _captureWindow, copy(__privateGet(this, _captureWindow)));
      __privateSet(next, _io, __privateGet(this, _io));
      return next;
    }
    setSampleAsset(handle, stereo, sourceRate, label2 = "") {
      this.assertHandle(handle);
      if (!PCM_ASSET_TYPES.has(handle.type)) {
        fail("invalid-asset-node", "PCM needs a compatible sample or loop node");
      }
      if (__privateGet(this, _sampleBindings).has(handle.id)) {
        fail("invalid-asset-node", "Remove the shared sample binding before assigning PCM");
      }
      let asset;
      try {
        asset = encodeSampleAsset(handle.id, stereo, sourceRate, label2);
      } catch {
        fail("invalid-asset", "Sample asset has invalid metadata or PCM");
      }
      __privateGet(this, _assets).set(handle.id, asset);
      __privateWrapper(this, _revision)._++;
      return this;
    }
    removeSampleAsset(handle) {
      this.assertHandle(handle);
      if (__privateGet(this, _assets).delete(handle.id)) {
        for (const [target, source3] of __privateGet(this, _sampleBindings)) {
          if (source3 === handle.id) __privateGet(this, _sampleBindings).delete(target);
        }
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    bindSampleAsset(source3, target) {
      this.assertHandle(source3);
      this.assertHandle(target);
      if (source3.type !== "sample-region" || target.type !== "sample-region" || source3.id === target.id || !__privateGet(this, _assets).has(source3.id) || __privateGet(this, _assets).has(target.id)) {
        fail("invalid-sample-binding", "Bind a region with PCM to a distinct unowned region");
      }
      if (__privateGet(this, _sampleBindings).get(target.id) !== source3.id) {
        __privateGet(this, _sampleBindings).set(target.id, source3.id);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    unbindSampleAsset(target) {
      this.assertHandle(target);
      if (__privateGet(this, _sampleBindings).delete(target.id)) __privateWrapper(this, _revision)._++;
      return this;
    }
    listSampleBindings() {
      return stable([...__privateGet(this, _sampleBindings)].sort((a, b) => a[0] - b[0]).map(([nodeId, sourceNodeId]) => ({ sourceNodeId, nodeId })));
    }
    listSampleAssets() {
      return stable([...__privateGet(this, _assets).values()].sort((a, b) => a.nodeId - b.nodeId).map(copy));
    }
    assertHandle(handle) {
      if (!(handle instanceof NodeHandle) || handle.graph !== this || __privateGet(this, _generations).get(handle.id) !== handle.generation || __privateGet(this, _nodes).get(handle.id)?.type !== handle.type) {
        fail("stale-handle", "Node handle does not refer to a current graph instance");
      }
    }
    /** Actual configured ports and parameters, shared by lookup and mutation. */
    describeNode(handle) {
      this.assertHandle(handle);
      const node = __privateGet(this, _nodes).get(handle.id);
      return stable({ ...copy(node), ...copy(nodePorts(node)), parameters: copy(nodeParameters(node)) });
    }
    add(type, { id, config = {} } = {}) {
      getPrimitive(type);
      if (!Number.isInteger(id) || id < 1 || id > 4294967295 || __privateGet(this, _nodes).has(id)) {
        fail("invalid-id", "Node ID must be an unused integer in the unsigned 32-bit node ID format", { id });
      }
      if (type === "output" || id === 1 || id === 3) {
        fail("reserved-boundary", "Input and output boundary nodes have fixed IDs");
      }
      const node = configuredNode(type, { id, type, ...PORT_CATALOG[type].args }, config);
      const handle = __privateMethod(this, _GraphWorkspace_instances, insert_fn).call(this, id, type);
      __privateGet(this, _nodes).set(id, node);
      if (type === "mixer") {
        const supported = new Set(nodeParameters(node).map((parameter2) => parameter2.id));
        for (const [key, parameter2] of __privateGet(this, _parameters)) {
          if (parameter2.nodeId === id && !supported.has(parameter2.id)) __privateGet(this, _parameters).delete(key);
        }
        for (const parameter2 of nodeParameters(node)) {
          const key = `${id}:${parameter2.id}`;
          if (!__privateGet(this, _parameters).has(key)) __privateGet(this, _parameters).set(key, { nodeId: id, id: parameter2.id, value: parameter2.default });
        }
      }
      __privateWrapper(this, _revision)._++;
      return handle;
    }
    /** Structural configuration: publish through a graph transaction while running. */
    configure(handle, config) {
      this.assertHandle(handle);
      const previous = __privateGet(this, _nodes).get(handle.id), next = configuredNode(handle.type, previous, config);
      if (Object.keys(next).some((key) => next[key] !== previous[key])) {
        if (handle.type === "mixer") {
          const supported = new Set(nodeParameters(next).map((parameter2) => parameter2.id));
          if ([...__privateGet(this, _edges).values()].some((edge) => edge.to === handle.id && edge.inputPort >= next.a) || [...__privateGet(this, _endpoints).values(), ...__privateGet(this, _hostBindings).values()].some((entry) => entry.nodeId === handle.id && !supported.has(entry.id))) {
            fail("configuration-in-use", "Remove cables and published parameters before removing their ports");
          }
          for (const [key, parameter2] of __privateGet(this, _parameters)) if (parameter2.nodeId === handle.id && !supported.has(parameter2.id)) {
            __privateGet(this, _parameters).delete(key);
            __privateGet(this, _omittedParameters).delete(key);
          }
          for (const parameter2 of nodeParameters(next)) {
            const key = `${handle.id}:${parameter2.id}`;
            if (!__privateGet(this, _parameters).has(key)) __privateGet(this, _parameters).set(key, { nodeId: handle.id, id: parameter2.id, value: parameter2.default });
          }
        }
        __privateGet(this, _nodes).set(handle.id, next);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    /** Capture rings only; PCM, staging and other kernels add host-specific costs. */
    captureRingBytes(sampleRate) {
      if (!Number.isFinite(sampleRate) || sampleRate <= 1 || !Number.isFinite(Math.fround(sampleRate))) {
        fail("invalid-sample-rate", "Resource preparation requires a finite sample rate");
      }
      let bytes = 0;
      for (const node of __privateGet(this, _nodes).values()) if (["loop-capture", "retrospective-capture"].includes(node.type)) {
        bytes += Math.max(1, Math.round(Math.fround(Math.fround(sampleRate) * Math.fround(node.a)))) * 8;
        if (!Number.isSafeInteger(bytes)) fail("resource-size-overflow", "Capture storage size cannot be represented");
      }
      return bytes;
    }
    find(id) {
      const node = __privateGet(this, _nodes).get(id);
      return node ? new NodeHandle(this, id, __privateGet(this, _generations).get(id), node.type) : void 0;
    }
    connect(from, to) {
      __privateMethod(this, _GraphWorkspace_instances, assertPort_fn).call(this, from, "outputs");
      __privateMethod(this, _GraphWorkspace_instances, assertPort_fn).call(this, to, "inputs");
      if (from.signal !== to.signal) {
        fail(
          "signal-mismatch",
          `${from.signal} cannot connect to ${to.signal}`,
          { from: from.nodeId, to: to.nodeId, inputPort: to.index }
        );
      }
      const key = `${to.nodeId}:${to.index}`;
      if (__privateGet(this, _edges).has(key)) fail("occupied-input", "Graph input is already connected", { to: to.nodeId, inputPort: to.index });
      const descendants = /* @__PURE__ */ new Set([to.nodeId]);
      const queue = [to.nodeId];
      for (let i2 = 0; i2 < queue.length; i2++) {
        for (const edge of __privateGet(this, _edges).values()) {
          if (edge.from === queue[i2] && !descendants.has(edge.to)) {
            descendants.add(edge.to);
            queue.push(edge.to);
          }
        }
      }
      if (descendants.has(from.nodeId)) fail("cycle", "Connection would create a graph cycle");
      __privateGet(this, _edges).set(key, { from: from.nodeId, outputPort: from.index, to: to.nodeId, inputPort: to.index });
      __privateWrapper(this, _revision)._++;
      return this;
    }
    disconnect(to) {
      __privateMethod(this, _GraphWorkspace_instances, assertPort_fn).call(this, to, "inputs");
      if (__privateGet(this, _edges).delete(`${to.nodeId}:${to.index}`)) __privateWrapper(this, _revision)._++;
      return this;
    }
    remove(handle) {
      this.assertHandle(handle);
      if (__privateGet(this, _io) && (__privateGet(this, _io).inputBindings.some((b) => b.nodeId === handle.id) || __privateGet(this, _io).outputBindings.some((b) => b?.nodeId === handle.id))) {
        fail("io-in-use", "Remove host channel bindings before removing this node");
      }
      if (handle.id === 1 || handle.id === 3) fail("reserved-boundary", "Boundary nodes cannot be removed");
      for (const [slot, binding] of __privateGet(this, _hostBindings)) if (binding.nodeId === handle.id) {
        const endpoint = this.listParameters().find((p) => p.nodeId === handle.id && p.id === binding.id);
        if (!__privateGet(this, _hostAssignments).has(slot)) this.reserveHostSlots([{ slot, ...endpoint ? { path: endpoint.path } : {} }]);
      }
      __privateGet(this, _nodes).delete(handle.id);
      if (__privateGet(this, _captureSources).some((source3) => source3.nodeId === handle.id)) {
        __privateSet(this, _captureSources, __privateGet(this, _captureSources).filter((source3) => source3.nodeId !== handle.id));
        if (__privateGet(this, _defaultCaptureSourceId) !== null && !__privateGet(this, _captureSources).some((source3) => source3.id === __privateGet(this, _defaultCaptureSourceId))) {
          __privateSet(this, _defaultCaptureSourceId, __privateGet(this, _captureSources)[0]?.id ?? null);
        }
        if (__privateGet(this, _selectedCaptureSourceId) !== null && !__privateGet(this, _captureSources).some((source3) => source3.id === __privateGet(this, _selectedCaptureSourceId))) {
          __privateSet(this, _selectedCaptureSourceId, __privateGet(this, _defaultCaptureSourceId));
        }
        __privateSet(this, _selectedCaptureNodeId, __privateGet(this, _captureSources).find((source3) => source3.id === __privateGet(this, _selectedCaptureSourceId))?.nodeId ?? null);
      }
      if (__privateGet(this, _selectedCaptureNodeId) === handle.id) __privateSet(this, _selectedCaptureNodeId, null);
      __privateGet(this, _assets).delete(handle.id);
      for (const [target, source3] of __privateGet(this, _sampleBindings)) {
        if (source3 === handle.id || target === handle.id) __privateGet(this, _sampleBindings).delete(target);
      }
      for (const key of __privateGet(this, _parameters).keys()) {
        if (key.startsWith(`${handle.id}:`)) {
          __privateGet(this, _parameters).delete(key);
          __privateGet(this, _omittedParameters).delete(key);
        }
      }
      for (const [path, endpoint] of __privateGet(this, _endpoints)) {
        if (endpoint.nodeId === handle.id) __privateGet(this, _endpoints).delete(path);
      }
      for (const [slot, binding] of __privateGet(this, _hostBindings)) {
        if (binding.nodeId === handle.id) __privateGet(this, _hostBindings).delete(slot);
      }
      for (const [path, nodeId] of __privateGet(this, _instances)) {
        if (nodeId === handle.id) __privateGet(this, _instances).delete(path);
      }
      for (const [key, edge] of __privateGet(this, _edges)) {
        if (edge.from === handle.id || edge.to === handle.id) __privateGet(this, _edges).delete(key);
      }
      __privateWrapper(this, _revision)._++;
      return this;
    }
    setParameter(handle, id, value) {
      this.assertHandle(handle);
      const spec = nodeParameters(__privateGet(this, _nodes).get(handle.id)).find((parameter2) => parameter2.id === id);
      if (!spec || !Number.isFinite(value) || spec.discrete && !Number.isInteger(value) || (spec.choices ? !Number.isInteger(value) || !(spec.choiceValues ?? spec.choices.map((_, index) => index)).includes(value) : value < spec.min || value > spec.max)) {
        fail("invalid-parameter", `Invalid ${handle.type} parameter ${id}`, { nodeId: handle.id, id, value });
      }
      const key = `${handle.id}:${id}`;
      const endpoint = [...__privateGet(this, _endpoints).values()].find((entry) => entry.nodeId === handle.id && entry.id === id);
      if (endpoint && (value < endpoint.min || value > endpoint.max)) {
        fail("invalid-parameter", `Value exceeds published range for ${endpoint.path}`);
      }
      const wasOmitted = __privateGet(this, _omittedParameters).delete(key);
      if (__privateGet(this, _parameters).get(key).value !== value || wasOmitted) {
        __privateGet(this, _parameters).set(key, { nodeId: handle.id, id, value });
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    registerParameter(path, handle, id, { min, max, default: defaultValue }) {
      this.assertHandle(handle);
      if (__privateGet(this, _controls).has(path)) fail("duplicate-endpoint", `Path already belongs to a project control: ${path}`);
      const endpoint = { path, kind: "parameter", nodeId: handle.id, id, min, max, default: defaultValue };
      const checked = validateParameterEndpoints(this.snapshot(), [...__privateGet(this, _endpoints).values(), endpoint]);
      __privateSet(this, _endpoints, new Map(checked.map((entry) => [entry.path, entry])));
      __privateWrapper(this, _revision)._++;
      return this;
    }
    findParameter(path) {
      return __privateGet(this, _endpoints).get(path) ?? null;
    }
    listParameters() {
      return stable([...__privateGet(this, _endpoints).values()].sort(comparePath).map(copy));
    }
    registerInstance(path, handle) {
      this.assertHandle(handle);
      const checked = validateNamedInstances(this.snapshot(), [
        ...this.listInstances(),
        { path, nodeId: handle.id }
      ]);
      __privateSet(this, _instances, new Map(checked.map((entry) => [entry.path, entry.nodeId])));
      __privateWrapper(this, _revision)._++;
      return this;
    }
    findInstance(path) {
      const id = __privateGet(this, _instances).get(path);
      return id === void 0 ? void 0 : this.find(id);
    }
    listInstances() {
      return stable([...__privateGet(this, _instances)].map(([path, nodeId]) => ({ path, nodeId })).sort(comparePath));
    }
    unregisterInstance(path) {
      if (__privateGet(this, _instances).delete(path)) __privateWrapper(this, _revision)._++;
      return this;
    }
    unregisterParameter(path) {
      if (__privateGet(this, _endpoints).delete(path)) __privateWrapper(this, _revision)._++;
      return this;
    }
    bindHostSlot(slot, handle, id) {
      this.assertHandle(handle);
      const candidate = { slot, nodeId: handle.id, id };
      const checked = validateHostBindings(this.snapshot(), [...__privateGet(this, _hostBindings).values(), candidate]);
      const endpoint = this.listParameters().find((p) => p.nodeId === handle.id && p.id === id);
      if (endpoint) this.reserveHostSlots([{ slot, path: endpoint.path }]);
      else if (__privateGet(this, _hostAssignments).has(slot)) fail("reserved-host-slot", "Automation slot is reserved");
      __privateSet(this, _explicitHostBindings, true);
      __privateSet(this, _hostBindings, new Map(checked.map((entry) => [entry.slot, entry])));
      __privateWrapper(this, _revision)._++;
      return this;
    }
    hostSlotForPath(path) {
      const endpoint = this.findParameter(path);
      if (!endpoint) return null;
      const explicit = [...__privateGet(this, _hostBindings).values()].find((binding) => binding.nodeId === endpoint.nodeId && binding.id === endpoint.id);
      if (explicit) return explicit.slot;
      if (__privateGet(this, _explicitHostBindings)) return null;
      const occupied = new Set(__privateGet(this, _hostBindings).keys());
      const targets = new Set([...__privateGet(this, _hostBindings).values()].map((binding) => `${binding.nodeId}:${binding.id}`));
      for (const parameter2 of this.snapshot().initialParameters) {
        const key = `${parameter2.nodeId}:${parameter2.id}`;
        if (targets.has(key)) continue;
        let slot = 0;
        while (occupied.has(slot)) slot++;
        if (parameter2.nodeId === endpoint.nodeId && parameter2.id === endpoint.id) return slot;
        occupied.add(slot);
      }
      return null;
    }
    reserveHostSlots(assignments) {
      const merged = new Map(__privateGet(this, _hostAssignments));
      for (const entry of validateHostAssignments(assignments)) {
        const previous = merged.get(entry.slot);
        if (previous && previous.path !== entry.path)
          fail("reserved-host-slot", `Automation slot belongs to ${previous.path}`);
        merged.set(entry.slot, entry);
      }
      const checked = validateHostAssignments([...merged.values()]);
      __privateSet(this, _hostAssignments, new Map(checked.map((entry) => [entry.slot, entry])));
      __privateSet(this, _explicitHostBindings, true);
      return this;
    }
    listHostAssignments() {
      return stable([...__privateGet(this, _hostAssignments).values()].sort((a, b) => a.slot - b.slot).map(copy));
    }
    listHostBindings() {
      return stable([...__privateGet(this, _hostBindings).values()].sort((a, b) => a.slot - b.slot).map(copy));
    }
    unbindHostSlot(slot) {
      if (__privateGet(this, _hostBindings).has(slot) && !__privateGet(this, _hostAssignments).has(slot)) {
        const binding = __privateGet(this, _hostBindings).get(slot);
        const endpoint = this.listParameters().find((p) => p.nodeId === binding.nodeId && p.id === binding.id);
        this.reserveHostSlots([{ slot, ...endpoint ? { path: endpoint.path } : {} }]);
      }
      if (__privateGet(this, _hostBindings).delete(slot)) __privateWrapper(this, _revision)._++;
      return this;
    }
    registerControl(path, { min, max, default: defaultValue, discrete = false }) {
      const control = { path, min, max, default: defaultValue, value: defaultValue, discrete };
      const checked = validateProjectControls([...__privateGet(this, _controls).values(), control], this.listParameters());
      __privateSet(this, _controls, new Map(checked.map((entry) => [entry.path, entry])));
      __privateWrapper(this, _revision)._++;
      return this;
    }
    setControl(path, value) {
      const previous = __privateGet(this, _controls).get(path);
      if (!previous) fail("unknown-control", `Unknown project control: ${path}`);
      const [next] = validateProjectControls([{ ...previous, value }]);
      if (previous.value !== next.value) {
        __privateGet(this, _controls).set(path, next);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    findControl(path) {
      return __privateGet(this, _controls).get(path) ?? null;
    }
    listControls() {
      return stable([...__privateGet(this, _controls).values()].sort(comparePath).map(copy));
    }
    unregisterControl(path) {
      if (__privateGet(this, _controls).delete(path)) __privateWrapper(this, _revision)._++;
      return this;
    }
    snapshot() {
      return stable({
        revision: __privateGet(this, _revision),
        nodes: [...__privateGet(this, _nodes).values()].sort((a, b) => a.id - b.id).map(copy),
        connections: [...__privateGet(this, _edges).values()].sort(compareEdge).map(copy),
        initialParameters: [...__privateGet(this, _parameters).values()].sort((a, b) => a.nodeId - b.nodeId || a.id - b.id).map(copy),
        endpoints: this.listParameters(),
        hostBindings: this.listHostBindings(),
        hostAssignments: this.listHostAssignments(),
        controls: this.listControls(),
        instances: this.listInstances()
      });
    }
    toProject({ inputSource = __privateGet(this, _inputSource) } = {}) {
      if (!["external", "none"].includes(inputSource)) fail("invalid-input-source", "Input source must be external or none");
      const graph = this.snapshot();
      if (__privateGet(this, _io)) validateIoLayout(__privateGet(this, _io), graph.nodes);
      else {
        if (graph.nodes.filter((n) => n.type === "input.raw").length !== 1) fail("invalid-io", "Additional input nodes need an explicit I/O layout");
        if (!graph.connections.some((edge) => edge.to === 3)) fail("unconnected-output", "Connect an audio source to the output before export");
      }
      return stable({
        format: "manifold.project",
        schemaVersion: 1,
        projectId: "manifold.graph-workspace",
        signal: {
          inputs: __privateGet(this, _io) ? __privateGet(this, _io).inputs.reduce((sum, b) => sum + b.channels, 0) : 2,
          outputs: __privateGet(this, _io) ? __privateGet(this, _io).outputs.reduce((sum, b) => sum + b.channels, 0) : 2,
          ...!__privateGet(this, _io) ? { inputSource } : {},
          ...__privateGet(this, _io) ? { io: __privateGet(this, _io) } : {},
          ...__privateGet(this, _io) || __privateGet(this, _sidechainSource) === void 0 ? {} : { sidechainSource: __privateGet(this, _sidechainSource) },
          nodes: graph.nodes.map(copy),
          connections: graph.connections.map(copy),
          initialParameters: graph.initialParameters.filter((entry) => !__privateGet(this, _omittedParameters).has(`${entry.nodeId}:${entry.id}`)).map(copy),
          ...copy(__privateGet(this, _captureWindow)),
          ...__privateGet(this, _captureSources).length ? {
            captureSources: this.listCaptureSources(),
            defaultCaptureSourceId: __privateGet(this, _defaultCaptureSourceId),
            selectedCaptureSourceId: __privateGet(this, _selectedCaptureSourceId),
            selectedCaptureNodeId: __privateGet(this, _selectedCaptureNodeId)
          } : __privateGet(this, _selectedCaptureNodeId) === null ? {} : {
            selectedCaptureNodeId: __privateGet(this, _selectedCaptureNodeId)
          }
        },
        ...graph.endpoints.length ? { endpoints: graph.endpoints.map(copy) } : {},
        ...__privateGet(this, _explicitHostBindings) || graph.hostBindings.length ? { hostBindings: graph.hostBindings.map(copy) } : {},
        ...graph.hostAssignments.length ? { hostAssignments: graph.hostAssignments.map(copy) } : {},
        ...graph.controls.length ? { controls: graph.controls.map(copy) } : {},
        ...graph.instances.length ? { instances: graph.instances.map(copy) } : {},
        ...__privateGet(this, _assets).size ? { assets: this.listSampleAssets() } : {},
        ...__privateGet(this, _sampleBindings).size ? { sampleBindings: this.listSampleBindings() } : {}
      });
    }
  };
  _nodes = new WeakMap();
  _edges = new WeakMap();
  _parameters = new WeakMap();
  _omittedParameters = new WeakMap();
  _endpoints = new WeakMap();
  _hostBindings = new WeakMap();
  _hostAssignments = new WeakMap();
  _explicitHostBindings = new WeakMap();
  _controls = new WeakMap();
  _instances = new WeakMap();
  _assets = new WeakMap();
  _sampleBindings = new WeakMap();
  _generations = new WeakMap();
  _revision = new WeakMap();
  _inputSource = new WeakMap();
  _captureSources = new WeakMap();
  _defaultCaptureSourceId = new WeakMap();
  _selectedCaptureSourceId = new WeakMap();
  _selectedCaptureNodeId = new WeakMap();
  _sidechainSource = new WeakMap();
  _captureWindow = new WeakMap();
  _io = new WeakMap();
  _GraphWorkspace_instances = new WeakSet();
  insert_fn = function(id, type) {
    const generation = (__privateGet(this, _generations).get(id) ?? 0) + 1;
    __privateGet(this, _generations).set(id, generation);
    __privateGet(this, _nodes).set(id, { id, type, ...copy(PORT_CATALOG[type].args) });
    for (const parameter2 of WORKSPACE_TYPES[type].parameters ?? []) {
      __privateGet(this, _parameters).set(`${id}:${parameter2.id}`, { nodeId: id, id: parameter2.id, value: parameter2.default });
    }
    return new NodeHandle(this, id, generation, type);
  };
  assertPort_fn = function(ref2, direction) {
    if (!(ref2 instanceof PortRef) || ref2.graph !== this || ref2.direction !== direction || __privateGet(this, _generations).get(ref2.nodeId) !== ref2.generation || !__privateGet(this, _nodes).has(ref2.nodeId) || nodePorts(__privateGet(this, _nodes).get(ref2.nodeId))[direction][ref2.index]?.name !== ref2.name) {
      fail("stale-port", `Expected a current ${direction} port from this graph`);
    }
  };
  var GraphWorkspace = _GraphWorkspace;
  function createGraphWorkspace() {
    return new GraphWorkspace();
  }
  var _graph, _applyRoute, _applyParameter, _applyParameterBatch, _applyGraph, _readPublishedParameters, _pending, _revision2, _LiveGraphSession_instances, enqueue_fn, adoptParameters_fn, routeChange_fn, parameterBatch_fn, parameterChange_fn;
  var LiveGraphSession = class {
    constructor(graph, applyRoute, applyParameter = null, applyGraph = null, applyParameterBatch = null, readPublishedParameters = null) {
      __privateAdd(this, _LiveGraphSession_instances);
      __privateAdd(this, _graph);
      __privateAdd(this, _applyRoute);
      __privateAdd(this, _applyParameter);
      __privateAdd(this, _applyParameterBatch);
      __privateAdd(this, _applyGraph);
      __privateAdd(this, _readPublishedParameters);
      __privateAdd(this, _pending, Promise.resolve());
      __privateAdd(this, _revision2, 0);
      if (!(graph instanceof GraphWorkspace) || typeof applyRoute !== "function") {
        fail("invalid-live-session", "Live routing needs an authored graph and a host route adapter");
      }
      if (applyParameter !== null && typeof applyParameter !== "function") {
        fail("invalid-live-session", "Parameter adapter must be a function");
      }
      if (applyGraph !== null && typeof applyGraph !== "function") {
        fail("invalid-live-session", "Graph publication adapter must be a function");
      }
      if (applyParameterBatch !== null && typeof applyParameterBatch !== "function") {
        fail("invalid-live-session", "Parameter batch adapter must be a function");
      }
      if (readPublishedParameters !== null && typeof readPublishedParameters !== "function") {
        fail("invalid-live-session", "Published parameter reader must be a function");
      }
      graph.toProject();
      __privateSet(this, _graph, graph.fork());
      __privateSet(this, _applyRoute, applyRoute);
      __privateSet(this, _applyParameter, applyParameter);
      __privateSet(this, _applyGraph, applyGraph);
      __privateSet(this, _applyParameterBatch, applyParameterBatch);
      __privateSet(this, _readPublishedParameters, readPublishedParameters);
    }
    snapshot() {
      return stable({ ...__privateGet(this, _graph).snapshot(), revision: __privateGet(this, _revision2) });
    }
    toProject() {
      return __privateGet(this, _graph).toProject();
    }
    forkGraph() {
      return __privateGet(this, _graph).fork();
    }
    /** Save new PCM only after the prepared host accepts the same shared source. */
    sampleAsset(nodeId, stereo, sourceRate, label2, applySample) {
      if (typeof applySample !== "function") fail("sample-unavailable", "Prepared host has no sample adapter");
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, async () => {
        const staged = __privateGet(this, _graph).fork();
        const node = staged.find(nodeId);
        if (!node) fail("missing-node", `Sample node ${nodeId} is unavailable`);
        staged.setSampleAsset(node, stereo, sourceRate, label2);
        const project = staged.toProject();
        const bindingTargets = staged.listSampleBindings().filter((binding) => binding.sourceNodeId === nodeId).map((binding) => binding.nodeId);
        const accepted = await applySample(nodeId, sourceRate, stereo, bindingTargets);
        if (accepted === false) fail("host-rejected-sample", "Prepared host rejected the Sample source");
        __privateSet(this, _graph, staged);
        __privateWrapper(this, _revision2)._++;
        return project;
      });
    }
    configureCaptureWindow(settings) {
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => {
        const staged = __privateGet(this, _graph).fork();
        staged.configureCaptureWindow(settings);
        const project = staged.toProject();
        __privateSet(this, _graph, staged);
        __privateWrapper(this, _revision2)._++;
        return project;
      });
    }
    selectCaptureSource(id) {
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => {
        const staged = __privateGet(this, _graph).fork();
        staged.selectCaptureSource(id);
        const project = staged.toProject();
        __privateSet(this, _graph, staged);
        __privateWrapper(this, _revision2)._++;
        return project;
      });
    }
    /** Adopt DSP targets already accepted by this host; never submit audio work.
     * Queue with edits so a host snapshot cannot overwrite a pending transaction.
     * Authored controls, instance paths, routes and script-local state survive.
     */
    adoptPublishedParameters(edits) {
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => __privateMethod(this, _LiveGraphSession_instances, adoptParameters_fn).call(this, edits));
    }
    route({ to, input, from = null, output: output2 } = {}) {
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => __privateMethod(this, _LiveGraphSession_instances, routeChange_fn).call(this, { to, input, from, output: output2 }));
    }
    /** Commit one saved project control with the route acknowledged by a prepared host. */
    routeWithControl(route, { path, value } = {}) {
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => __privateMethod(this, _LiveGraphSession_instances, routeChange_fn).call(this, route, { path, value }));
    }
    parameter({ nodeId, id, value } = {}) {
      if (!__privateGet(this, _applyParameter)) fail("parameter-unavailable", "Prepared host has no parameter adapter");
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => __privateMethod(this, _LiveGraphSession_instances, parameterChange_fn).call(this, nodeId, id, value));
    }
    /** Commit a project control and its derived DSP parameter after host acknowledgement. */
    parameterWithControl(parameter2, { path, value } = {}) {
      if (!__privateGet(this, _applyParameter)) fail("parameter-unavailable", "Prepared host has no parameter adapter");
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => __privateMethod(this, _LiveGraphSession_instances, parameterChange_fn).call(this, parameter2?.nodeId, parameter2?.id, parameter2?.value, { path, value }));
    }
    /** Apply a bounded group between blocks and save its control on one host acknowledgement. */
    parametersWithControl(edits, { path, value } = {}) {
      return __privateMethod(this, _LiveGraphSession_instances, parameterBatch_fn).call(this, edits, { path, value });
    }
    /** Apply direct parameter targets as one acknowledged, bounded group. */
    parameters(edits) {
      return __privateMethod(this, _LiveGraphSession_instances, parameterBatch_fn).call(this, edits);
    }
    parameterPath(path, value) {
      if (!__privateGet(this, _applyParameter)) fail("parameter-unavailable", "Prepared host has no parameter adapter");
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => {
        const endpoint = __privateGet(this, _graph).findParameter(path);
        if (!endpoint) fail("unknown-parameter-path", `Unknown project parameter: ${path}`);
        if (!Number.isFinite(value) || value < endpoint.min || value > endpoint.max) {
          fail("invalid-parameter", `Invalid project parameter: ${path}`);
        }
        return __privateMethod(this, _LiveGraphSession_instances, parameterChange_fn).call(this, endpoint.nodeId, endpoint.id, value);
      });
    }
    transaction(edit) {
      if (!__privateGet(this, _applyGraph)) fail("structural-unavailable", "Prepared host has no graph publication adapter");
      if (typeof edit !== "function") fail("invalid-graph-edit", "Graph edit must be a function");
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, async () => {
        const staged = __privateGet(this, _graph).fork();
        await edit(staged);
        const project = staged.toProject();
        const accepted = await __privateGet(this, _applyGraph).call(this, project);
        if (accepted === false) fail("host-rejected-graph", "Prepared host rejected the graph transaction");
        __privateSet(this, _graph, staged);
        __privateWrapper(this, _revision2)._++;
        return project;
      });
    }
  };
  _graph = new WeakMap();
  _applyRoute = new WeakMap();
  _applyParameter = new WeakMap();
  _applyParameterBatch = new WeakMap();
  _applyGraph = new WeakMap();
  _readPublishedParameters = new WeakMap();
  _pending = new WeakMap();
  _revision2 = new WeakMap();
  _LiveGraphSession_instances = new WeakSet();
  enqueue_fn = function(change) {
    const result = __privateGet(this, _pending).then(async () => {
      if (__privateGet(this, _readPublishedParameters)) {
        __privateMethod(this, _LiveGraphSession_instances, adoptParameters_fn).call(this, await __privateGet(this, _readPublishedParameters).call(this));
      }
      const changed = await change();
      if (__privateGet(this, _readPublishedParameters)) {
        __privateMethod(this, _LiveGraphSession_instances, adoptParameters_fn).call(this, await __privateGet(this, _readPublishedParameters).call(this));
      }
      return changed?.format === "manifold.project" ? __privateGet(this, _graph).toProject() : changed;
    });
    __privateSet(this, _pending, result.then(() => {
    }, () => {
    }));
    return result;
  };
  adoptParameters_fn = function(edits) {
    if (!Array.isArray(edits)) fail("invalid-parameter-snapshot", "Published parameters must be an array");
    const staged = __privateGet(this, _graph).fork();
    const seen = /* @__PURE__ */ new Set();
    for (const { nodeId, id, value } of edits) {
      const key = `${nodeId}:${id}`;
      if (seen.has(key)) fail("invalid-parameter-snapshot", `Duplicate published parameter: ${key}`);
      seen.add(key);
      const node = staged.find(nodeId);
      if (!node) fail("missing-node", `Published parameter node ${nodeId} is unavailable`);
      staged.setParameter(node, id, value);
    }
    const project = staged.toProject();
    if (JSON.stringify(project.signal.initialParameters) !== JSON.stringify(__privateGet(this, _graph).toProject().signal.initialParameters)) {
      __privateSet(this, _graph, staged);
      __privateWrapper(this, _revision2)._++;
    }
    return __privateGet(this, _graph).toProject();
  };
  routeChange_fn = async function({ to, input, from = null, output: output2 } = {}, control = null) {
    const staged = __privateGet(this, _graph).fork();
    if (control) staged.setControl(control.path, control.value);
    const target = staged.find(to);
    if (!target) fail("missing-node", `Target node ${to} is unavailable`);
    const targetPort = target.input(input);
    staged.disconnect(targetPort);
    let sourcePort;
    if (from !== null) {
      const source3 = staged.find(from);
      if (!source3) fail("missing-node", `Source node ${from} is unavailable`);
      sourcePort = source3.output(output2);
      staged.connect(sourcePort, targetPort);
    }
    staged.toProject();
    const accepted = await __privateGet(this, _applyRoute).call(this, {
      to,
      inputPort: targetPort.index,
      from,
      outputPort: sourcePort?.index ?? 0
    });
    if (accepted === false) fail("host-rejected-route", "Prepared host rejected the route");
    __privateSet(this, _graph, staged);
    __privateWrapper(this, _revision2)._++;
    return __privateGet(this, _graph).toProject();
  };
  parameterBatch_fn = function(edits, control = null) {
    if (!__privateGet(this, _applyParameterBatch)) fail("batch-unavailable", "Prepared host has no parameter batch adapter");
    return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, async () => {
      if (!Array.isArray(edits) || edits.length < 1) {
        fail("invalid-parameter-batch", "Parameter batch must contain at least one edit");
      }
      const staged = __privateGet(this, _graph).fork();
      if (control) staged.setControl(control.path, control.value);
      for (const edit of edits) {
        const node = staged.find(edit.nodeId);
        if (!node) fail("missing-node", `Parameter node ${edit.nodeId} is unavailable`);
        staged.setParameter(node, edit.id, edit.value);
      }
      const project = staged.toProject();
      const accepted = await __privateGet(this, _applyParameterBatch).call(this, edits.map((edit) => ({
        nodeId: edit.nodeId,
        id: edit.id,
        value: edit.value
      })));
      if (accepted === false) fail("host-rejected-parameter-batch", "Prepared host rejected the parameter batch");
      __privateSet(this, _graph, staged);
      __privateWrapper(this, _revision2)._++;
      return project;
    });
  };
  parameterChange_fn = async function(nodeId, id, value, control = null) {
    const staged = __privateGet(this, _graph).fork();
    if (control) staged.setControl(control.path, control.value);
    const node = staged.find(nodeId);
    if (!node) fail("missing-node", `Parameter node ${nodeId} is unavailable`);
    staged.setParameter(node, id, value);
    const project = staged.toProject();
    const accepted = await __privateGet(this, _applyParameter).call(this, { nodeId, id, value });
    if (accepted === false) fail("host-rejected-parameter", "Prepared host rejected the parameter");
    __privateSet(this, _graph, staged);
    __privateWrapper(this, _revision2)._++;
    return project;
  };
  function createLiveGraphSession(graph, applyRoute, applyParameter, applyGraph, applyParameterBatch, readPublishedParameters) {
    return new LiveGraphSession(graph, applyRoute, applyParameter, applyGraph, applyParameterBatch, readPublishedParameters);
  }

  // packages/manifold-author/primitives.js
  var primitives_exports = {};
  __export(primitives_exports, {
    adsr: () => adsr,
    attenuverterBias: () => attenuverterBias,
    audioFm: () => audioFm,
    audioSync: () => audioSync,
    bitCrusher: () => bitCrusher,
    chorus: () => chorus,
    compressor: () => compressor,
    constant: () => constant,
    crossfader: () => crossfader,
    cvCompare: () => cvCompare,
    cvMix: () => cvMix,
    cvRange: () => cvRange,
    distortion: () => distortion,
    effectSlotLegacy: () => effectSlotLegacy,
    envelopeControl: () => envelopeControl,
    envelopeFollower: () => envelopeFollower,
    eq8: () => eq8,
    extendedOscillator: () => extendedOscillator,
    fftSpectrum: () => fftSpectrum,
    fixedGain: () => fixedGain,
    formantFilter: () => formantFilter,
    gain: () => gain,
    granulator: () => granulator,
    inputRaw: () => inputRaw,
    inputSidechain: () => inputSidechain,
    legacyFilter: () => legacyFilter,
    lfo: () => lfo,
    limiter: () => limiter,
    linearBlend: () => linearBlend,
    loopCapture: () => loopCapture,
    mainVoiceBank: () => mainVoiceBank,
    midiArpeggiator: () => midiArpeggiator,
    midiInput: () => midiInput,
    midiNoteFilter: () => midiNoteFilter,
    midiScaleQuantizer: () => midiScaleQuantizer,
    midiTranspose: () => midiTranspose,
    midiVelocityMapper: () => midiVelocityMapper,
    mixer: () => mixer,
    mixer9: () => mixer9,
    modulatedGain: () => modulatedGain,
    modulatedSvf: () => modulatedSvf,
    multitapDelay: () => multitapDelay,
    noise: () => noise,
    oscillator: () => oscillator,
    output: () => output,
    phaseVocoder: () => phaseVocoder,
    phaser: () => phaser,
    phraseGain: () => phraseGain,
    pitchShifter: () => pitchShifter,
    pulseOscillator: () => pulseOscillator,
    resonator: () => resonator,
    retrospectiveCapture: () => retrospectiveCapture,
    reverb: () => reverb,
    reverseDelay: () => reverseDelay,
    ringModulator: () => ringModulator,
    sampleHold: () => sampleHold,
    sampleInstrument: () => sampleInstrument,
    sampleRegion: () => sampleRegion,
    shimmer: () => shimmer,
    slewAudio: () => slewAudio,
    slewControl: () => slewControl,
    spectrumAnalyzer: () => spectrumAnalyzer,
    stereoDelay: () => stereoDelay,
    stereoWidener: () => stereoWidener,
    stutter: () => stutter,
    sum2: () => sum2,
    svf: () => svf,
    threeBandEq: () => threeBandEq,
    transientShaper: () => transientShaper,
    voiceSynth: () => voiceSynth,
    waveShaper: () => waveShaper
  });
  var adsr = getPrimitive("adsr");
  var attenuverterBias = getPrimitive("attenuverter-bias");
  var audioFm = getPrimitive("audio-fm");
  var audioSync = getPrimitive("audio-sync");
  var bitCrusher = getPrimitive("bit-crusher");
  var chorus = getPrimitive("chorus");
  var compressor = getPrimitive("compressor");
  var constant = getPrimitive("constant");
  var crossfader = getPrimitive("crossfader");
  var cvCompare = getPrimitive("cv-compare");
  var cvMix = getPrimitive("cv-mix");
  var cvRange = getPrimitive("cv-range");
  var distortion = getPrimitive("distortion");
  var effectSlotLegacy = getPrimitive("effect-slot-legacy");
  var envelopeControl = getPrimitive("envelope-control");
  var envelopeFollower = getPrimitive("envelope-follower");
  var eq8 = getPrimitive("eq8");
  var extendedOscillator = getPrimitive("extended-oscillator");
  var fftSpectrum = getPrimitive("fft-spectrum");
  var fixedGain = getPrimitive("fixed-gain");
  var formantFilter = getPrimitive("formant-filter");
  var gain = getPrimitive("gain");
  var granulator = getPrimitive("granulator");
  var inputRaw = getPrimitive("input.raw");
  var inputSidechain = getPrimitive("input.sidechain");
  var legacyFilter = getPrimitive("legacy-filter");
  var lfo = getPrimitive("lfo");
  var limiter = getPrimitive("limiter");
  var linearBlend = getPrimitive("linear-blend");
  var loopCapture = getPrimitive("loop-capture");
  var mainVoiceBank = getPrimitive("main-voice-bank");
  var midiArpeggiator = getPrimitive("midi-arpeggiator");
  var midiInput = getPrimitive("midi-input");
  var midiNoteFilter = getPrimitive("midi-note-filter");
  var midiScaleQuantizer = getPrimitive("midi-scale-quantizer");
  var midiTranspose = getPrimitive("midi-transpose");
  var midiVelocityMapper = getPrimitive("midi-velocity-mapper");
  var mixer = getPrimitive("mixer");
  var mixer9 = getPrimitive("mixer9");
  var modulatedGain = getPrimitive("modulated-gain");
  var modulatedSvf = getPrimitive("modulated-svf");
  var multitapDelay = getPrimitive("multitap-delay");
  var noise = getPrimitive("noise");
  var oscillator = getPrimitive("oscillator");
  var output = getPrimitive("output");
  var phaseVocoder = getPrimitive("phase-vocoder");
  var phaser = getPrimitive("phaser");
  var phraseGain = getPrimitive("phrase-gain");
  var pitchShifter = getPrimitive("pitch-shifter");
  var pulseOscillator = getPrimitive("pulse-oscillator");
  var resonator = getPrimitive("resonator");
  var retrospectiveCapture = getPrimitive("retrospective-capture");
  var reverb = getPrimitive("reverb");
  var reverseDelay = getPrimitive("reverse-delay");
  var ringModulator = getPrimitive("ring-modulator");
  var sampleHold = getPrimitive("sample-hold");
  var sampleInstrument = getPrimitive("sample-instrument");
  var sampleRegion = getPrimitive("sample-region");
  var shimmer = getPrimitive("shimmer");
  var slewAudio = getPrimitive("slew-audio");
  var slewControl = getPrimitive("slew-control");
  var spectrumAnalyzer = getPrimitive("spectrum-analyzer");
  var stereoDelay = getPrimitive("stereo-delay");
  var stereoWidener = getPrimitive("stereo-widener");
  var stutter = getPrimitive("stutter");
  var sum2 = getPrimitive("sum2");
  var svf = getPrimitive("svf");
  var threeBandEq = getPrimitive("three-band-eq");
  var transientShaper = getPrimitive("transient-shaper");
  var voiceSynth = getPrimitive("voice-synth");
  var waveShaper = getPrimitive("wave-shaper");

  // packages/manifold-author/network-definition.js
  var _handler;
  var NetworkDefinition = class {
    constructor(settings) {
      __privateAdd(this, _handler, null);
      this.settings = settings;
    }
    onEvent(handler) {
      if (typeof handler !== "function") throw new TypeError("Network event handler must be a function");
      __privateSet(this, _handler, handler);
      return this;
    }
    get handler() {
      return __privateGet(this, _handler);
    }
  };
  _handler = new WeakMap();
  function defineNetwork(settings) {
    return new NetworkDefinition(settings);
  }
  function unpackNetwork(value) {
    return value instanceof NetworkDefinition ? { settings: value.settings, handler: value.handler } : null;
  }

  // packages/manifold-author/examples/main-voice-control.mjs
  function chooseMainVoice(voices) {
    const idle = voices.findIndex((v) => !v.active || v.envelopeStage === "idle");
    if (idle >= 0) return idle;
    let release = -1;
    for (let index = 0; index < voices.length; index++) {
      if (voices[index].envelopeStage === "release" && (release < 0 || voices[index].envelopeLevel < voices[release].envelopeLevel))
        release = index;
    }
    if (release >= 0) return release;
    return voices.reduce((oldest, v, index) => v.stamp < voices[oldest].stamp ? index : oldest, 0);
  }

  // packages/manifold-author/examples/oscillator-preview.mjs
  var previewClamp = (v, a, b) => Math.max(a, Math.min(b, v));
  var previewFract = (v) => v - Math.floor(v);
  function oscillatorPreviewWave(type, p, width) {
    p = previewFract(p);
    switch (type) {
      case 0:
        return Math.sin(p * 2 * Math.PI);
      case 1:
        return 2 * p - 1;
      case 2:
        return p < 0.5 ? 1 : -1;
      case 3:
        return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
      case 4:
        return (2 * p - 1 + Math.sin(p * 2 * Math.PI)) * 0.5;
      case 5:
        return (previewFract(Math.sin(p * 43758.5453)) * 2 - 1) * 0.5;
      case 6:
        return p < width ? 1 : -1;
      case 7:
        return (2 * p - 1 + (2 * previewFract(p * 1.01) - 1) * 0.5 + (2 * previewFract(p * 0.99) - 1) * 0.5) * 0.5;
    }
    return 0;
  }
  function oscillatorPreviewRecipe(type, width) {
    const out = [], add = (ratio, amplitude, phase = 0) => {
      if (amplitude > 1e-6 && out.length < 12) out.push({ ratio, amplitude, phase });
    };
    if (type === 0) add(1, 1);
    else if (type === 1 || type === 4)
      for (let h = 1; h <= 12; h++) add(h, type === 1 ? 1 / h : (h === 1 ? 0.45 : 0) + 0.55 / h);
    else if (type === 2 || type === 3)
      for (let i2 = 0; i2 < 12; i2++) {
        const h = 2 * i2 + 1;
        add(h, type === 2 ? 1 / h : 1 / (h * h), type === 2 ? 0 : (i2 % 2 ? 1 : -1) * Math.PI * 0.5);
      }
    else if (type === 5) {
      const r = [1, 1.37, 1.93, 2.58, 3.11, 3.93, 5.17, 6.44, 8.13, 10.37, 13.11, 16.51], a = [1, 0.91, 0.82, 0.74, 0.67, 0.6, 0.52, 0.45, 0.38, 0.31, 0.25, 0.2], p = [0, 0.63, 1.42, 2.17, 0.88, 2.74, 1.11, 2.49, 0.37, 1.96, 2.81, 0.94];
      r.forEach((v, i2) => add(v, a[i2], p[i2]));
    } else if (type === 6)
      for (let h = 1; h <= 12; h++) {
        const c = Math.sin(Math.PI * h * width);
        add(h, Math.abs(c) / h, c < 0 ? Math.PI : 0);
      }
    else if (type === 7) {
      const d = [-18, -7, 0, 8, 19], g = [0.55, 0.82, 1, 0.79, 0.5], p = [0.17, 0.51, 0, 0.33, 0.74];
      d.forEach((v, i2) => add(2 ** (v / 1200), g[i2], p[i2]));
    }
    return out;
  }
  function oscillatorPreviewDrive(x, drive, shape, bias) {
    const clip = (v) => previewClamp(v, -1, 1);
    if (drive <= 1e-4) return clip(x);
    const transfer = (value) => {
      if (shape === 1) {
        const g2 = 1 + drive * 1.35;
        return Math.atan(value * g2) / Math.atan(g2);
      }
      if (shape === 2) return clip(value * (1 + drive * 1.2));
      if (shape === 3) {
        let v = previewClamp(value * (1 + drive * 1.1), -32, 32);
        while (v > 1 || v < -1) v = v > 1 ? 2 - v : -2 - v;
        return v;
      }
      const g = 1 + drive * 0.85;
      return Math.tanh(value * g) / Math.tanh(g);
    };
    const offset2 = bias * 0.75, center = transfer(offset2), normal = Math.max(
      1e-6,
      Math.abs(transfer(1 + offset2) - center),
      Math.abs(transfer(-1 + offset2) - center)
    );
    return clip((transfer(x + offset2) - center) / normal);
  }
  function oscillatorPreviewCurves(controls) {
    const type = controls.waveform ?? 1, width = controls.pulseWidth ?? 0.5, add = controls.renderMode === 1;
    const recipe = oscillatorPreviewRecipe(type, width).slice(
      0,
      Math.max(1, Math.round(controls.additivePartials ?? 8))
    );
    const tilt = controls.additiveTilt ?? 0, drift = controls.additiveDrift ?? 0;
    const partials = recipe.map((p) => ({
      ratio: Math.max(
        0.1,
        p.ratio * (1 + Math.sin(p.ratio * 2.173 + type * 0.53) * drift * 0.035 * (1 + p.ratio * 0.05))
      ),
      phase: p.phase + Math.sin(p.ratio * 1.618 + type * 0.37) * drift * 0.85,
      amp: p.amplitude * Math.max(0.12, p.ratio ** (tilt * 0.85))
    }));
    const sum = partials.reduce((s, p) => s + p.amp, 0), trim = [1, 0.96, 0.98, 1.06, 0.94, 0.78, 1, 0.84][type];
    const shape = (x) => oscillatorPreviewDrive(
      x,
      controls.drive ?? 0,
      controls.driveShape ?? 0,
      controls.driveBias ?? 0
    );
    const count = add ? 96 : 200, wave = Array.from({ length: count + 1 }, (_, i2) => {
      const x = i2 / count;
      const sample = add ? sum > 1e-6 ? partials.reduce(
        (s, p) => s + Math.sin(2 * Math.PI * x * p.ratio + p.phase) * p.amp,
        0
      ) / sum * trim : 0 : oscillatorPreviewWave(type, x, width);
      return [x, 0.5 - shape(sample) * 0.425];
    });
    const drive = Array.from({ length: 129 }, (_, i2) => [i2 / 128, 0.5 - shape(i2 / 64 - 1) * 0.5]);
    return {
      wave,
      drive,
      color: ["#7dd3fc", "#38bdf8", "#22d3ee", "#2dd4bf", "#a78bfa", "#94a3b8", "#f472b6", "#fbbf24"][type],
      label: ["SINE", "SAW", "SQUARE", "TRIANGLE", "BLEND", "NOISE", "PULSE", "SUPERSAW"][type] + (add ? " ADD" : "") + " MODE"
    };
  }

  // packages/manifold-author/creative.js
  var creative_exports = {};
  __export(creative_exports, {
    adsr: () => adsr,
    attenuverterBias: () => attenuverterBias,
    audio: () => audio,
    audioFm: () => audioFm,
    audioSync: () => audioSync,
    bitCrusher: () => bitCrusher,
    chorus: () => chorus,
    compressor: () => compressor,
    constant: () => constant,
    createDevice: () => createDevice,
    createEffect: () => createEffect,
    createInstrument: () => createInstrument,
    crossfader: () => crossfader,
    cvCompare: () => cvCompare,
    cvMix: () => cvMix,
    cvRange: () => cvRange,
    distortion: () => distortion,
    effectSlotLegacy: () => effectSlotLegacy,
    envelopeControl: () => envelopeControl,
    envelopeFollower: () => envelopeFollower,
    eq8: () => eq8,
    extendedOscillator: () => extendedOscillator,
    fftSpectrum: () => fftSpectrum,
    fixedGain: () => fixedGain,
    formantFilter: () => formantFilter,
    gain: () => gain,
    granulator: () => granulator,
    imageFrames: () => imageFrames,
    imageLayer: () => imageLayer,
    inputRaw: () => inputRaw,
    inputSidechain: () => inputSidechain,
    legacyFilter: () => legacyFilter,
    lfo: () => lfo,
    limiter: () => limiter,
    linearBlend: () => linearBlend,
    loopCapture: () => loopCapture,
    lowPassFilter: () => lowPassFilter,
    mainVoiceBank: () => mainVoiceBank,
    midi: () => midi,
    midiArpeggiator: () => midiArpeggiator,
    midiInput: () => midiInput,
    midiNoteFilter: () => midiNoteFilter,
    midiScaleQuantizer: () => midiScaleQuantizer,
    midiTranspose: () => midiTranspose,
    midiVelocityMapper: () => midiVelocityMapper,
    mixer: () => mixer,
    mixer9: () => mixer9,
    modulatedGain: () => modulatedGain,
    modulatedSvf: () => modulatedSvf,
    multitapDelay: () => multitapDelay,
    noise: () => noise,
    oscillator: () => oscillator,
    output: () => output,
    phaseVocoder: () => phaseVocoder,
    phaser: () => phaser,
    phraseGain: () => phraseGain,
    pitchShifter: () => pitchShifter,
    pulseOscillator: () => pulseOscillator,
    resonator: () => resonator,
    retrospectiveCapture: () => retrospectiveCapture,
    reverb: () => reverb,
    reverseDelay: () => reverseDelay,
    ringModulator: () => ringModulator,
    sampleHold: () => sampleHold,
    sampleInstrument: () => sampleInstrument,
    sampleRegion: () => sampleRegion,
    sawOscillator: () => sawOscillator,
    selectImageFrame: () => selectImageFrame,
    shimmer: () => shimmer,
    sineOscillator: () => sineOscillator,
    slewAudio: () => slewAudio,
    slewControl: () => slewControl,
    spectrumAnalyzer: () => spectrumAnalyzer,
    stereoDelay: () => stereoDelay,
    stereoWidener: () => stereoWidener,
    stutter: () => stutter,
    sum2: () => sum2,
    svf: () => svf,
    threeBandEq: () => threeBandEq,
    transformImage: () => transformImage,
    transientShaper: () => transientShaper,
    voiceSynth: () => voiceSynth,
    waveShaper: () => waveShaper
  });

  // packages/manifold-author/audio-graphs.js
  var AUDIO_CATALOG = Object.fromEntries(
    listPrimitives().map((p) => [p.type, { ...p, parameters: p.parameters ?? [] }])
  );
  var configuredCatalog = /* @__PURE__ */ new Map();
  var constructorConfig = (node, catalog = AUDIO_CATALOG) => Object.fromEntries(
    Object.entries(catalog[node.type].configuration ?? {}).map(([name3, field2]) => [
      name3,
      node[field2.argument]
    ])
  );
  function primitiveSpec(node) {
    const config = node.config ?? {}, key = JSON.stringify([node.type, config]);
    if (!Object.keys(AUDIO_CATALOG[node.type].configuration ?? {}).length)
      return AUDIO_CATALOG[node.type];
    if (!configuredCatalog.has(key)) {
      const graph = createGraphWorkspace();
      const described = graph.describeNode(graph.add(node.type, { id: 4, config }));
      if (configuredCatalog.size >= 256) configuredCatalog.clear();
      configuredCatalog.set(key, {
        ...AUDIO_CATALOG[node.type],
        inputs: described.inputs,
        outputs: described.outputs,
        parameters: described.parameters
      });
    }
    return configuredCatalog.get(key);
  }
  var clone = (value) => structuredClone(value);
  var fail2 = (message) => {
    throw new Error(message);
  };
  var name = (value) => typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value);
  var label = (value) => typeof value === "string" && !!value.trim() && value.length <= 128;
  var hash = (value) => {
    let h = 2166136261;
    for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  var graphCanvasId = (path) => 1073741824 + (hash(path) & 1073741823);
  var leafId = (path) => 4 + hash(path) % 65532;
  var empty2 = () => ({ version: 1, definitions: [], instances: [] });
  var namedPort = (ports, value) => ports.find((p) => p.name === value) ?? fail2(`Unknown audio graph port ${value}`);
  function validateAudioGraphs(value = empty2()) {
    const audio2 = clone(value);
    if (audio2.version !== 1 || !Array.isArray(audio2.definitions) || !Array.isArray(audio2.instances))
      fail2("Expected version 1 audio graphs with definitions and instances");
    const defs = /* @__PURE__ */ new Map();
    for (const d of audio2.definitions) {
      if (!name(d.id) || defs.has(d.id) || !label(d.label))
        fail2("Audio graph definitions need unique IDs and labels");
      if (!Array.isArray(d.nodes) || !d.nodes.length || !Array.isArray(d.connections) || !Array.isArray(d.inputs) || !Array.isArray(d.outputs) || !Array.isArray(d.parameters ?? []))
        fail2("Expected audio graph nodes, connections and interface arrays");
      defs.set(d.id, d);
      const keys = /* @__PURE__ */ new Set();
      for (const n of d.nodes) {
        if (!name(n.key) || keys.has(n.key) || Boolean(n.type) === Boolean(n.definition))
          fail2("Audio graph children need unique keys and a primitive type or graph definition");
        if (n.type && (!AUDIO_CATALOG[n.type] || ["input.raw", "output", "monitor", "input.sidechain"].includes(n.type)))
          fail2(`Unsupported contained audio primitive ${n.type}`);
        keys.add(n.key);
      }
      for (const direction of ["inputs", "outputs", "parameters"]) {
        const names = /* @__PURE__ */ new Set();
        for (const p of d[direction] ?? []) {
          if (!name(p.name) || names.has(p.name) || !keys.has(p.node) && !(direction !== "parameters" && p.node === null && typeof p.signal === "string") || typeof p[direction === "parameters" ? "parameter" : "port"] !== "string")
            fail2(`Invalid audio graph ${direction} binding`);
          names.add(p.name);
        }
      }
      const destinations = /* @__PURE__ */ new Set();
      for (const e of d.connections) {
        if (!keys.has(e.from) || !keys.has(e.to) || typeof e.input !== "string" || typeof e.output !== "string")
          fail2("Audio graph cable needs named children and ports");
        const key = e.to + ":" + e.input;
        if (destinations.has(key)) fail2("An audio input accepts only one source");
        destinations.add(key);
      }
      const inputs = /* @__PURE__ */ new Set();
      for (const p of d.inputs) {
        if (p.node === null) continue;
        const key = p.node + ":" + p.port;
        if (inputs.has(key) || destinations.has(key))
          fail2("An exposed audio input cannot also have an inner source");
        inputs.add(key);
      }
    }
    const depths = /* @__PURE__ */ new Map();
    const visit = (id, stack = []) => {
      if (stack.includes(id)) fail2("Recursive audio graph");
      if (depths.has(id)) return depths.get(id);
      const d = defs.get(id) ?? fail2(`Unknown audio graph definition ${id}`);
      let depth = 1;
      for (const n of d.nodes)
        if (n.definition) depth = Math.max(depth, 1 + visit(n.definition, [...stack, id]));
      depths.set(id, depth);
      return depth;
    };
    for (const id of defs.keys()) visit(id);
    const paths = /* @__PURE__ */ new Set();
    for (const instance of audio2.instances) {
      if (typeof instance.path !== "string" || !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(instance.path) || paths.has(instance.path) || !defs.has(instance.definition) || instance.label !== void 0 && !label(instance.label))
        fail2("Audio graph instances need unique absolute paths and a definition");
      paths.add(instance.path);
    }
    return audio2;
  }
  function expand(value, project = {}) {
    const audio2 = validateAudioGraphs(value), defs = new Map(audio2.definitions.map((d) => [d.id, d]));
    const roots = [], groups = [], leaves = [], ids = /* @__PURE__ */ new Set(), paths = /* @__PURE__ */ new Set();
    const previous = new Map((project.instances ?? []).map((node) => [node.path, node.nodeId]));
    const occupied = /* @__PURE__ */ new Set([
      1,
      3,
      ...(project.signal?.nodes ?? []).map((node) => node.id),
      ...audio2.instances.flatMap((root) => Object.values(root.nodes ?? {}).map((node) => node.id))
    ]);
    const available = (preferred) => {
      let id = preferred;
      while (occupied.has(id) || ids.has(id)) {
        id = id === 4294967295 ? 4 : id + 1;
        if (id === preferred) fail2("The node ID format has no unused identity");
      }
      return id;
    };
    function reserve(id, path) {
      if (ids.has(id) || paths.has(path))
        fail2("Audio graph identity collision; use a different instance path");
      ids.add(id);
      paths.add(path);
    }
    function group(definition2, path, scope, root, prefix = "") {
      const d = defs.get(definition2), g = {
        id: available(graphCanvasId(path)),
        path,
        scope,
        definition: definition2,
        root,
        prefix,
        children: /* @__PURE__ */ new Map(),
        inputs: [],
        outputs: [],
        parameters: [],
        wires: []
      };
      reserve(g.id, path);
      groups.push(g);
      for (const n of d.nodes) {
        const key = prefix + n.key;
        if (n.definition) {
          g.children.set(n.key, group(n.definition, path + "/" + n.key, path, root, key + "/"));
          continue;
        }
        const binding = root.nodes?.[key];
        const leaf = {
          ...n,
          id: binding?.id ?? previous.get(root.path + "/" + key) ?? available(leafId(root.path + "/" + key)),
          path: binding?.path ?? root.path + "/" + key,
          scope: path,
          root,
          key,
          adopt: binding?.adopt === true
        };
        if (!Number.isInteger(leaf.id) || leaf.id < 4 || leaf.id > 4294967295 || typeof leaf.path !== "string")
          fail2("Audio graph leaf needs a stable DSP ID and path");
        reserve(leaf.id, leaf.path);
        leaves.push(leaf);
        g.children.set(n.key, leaf);
      }
      const port2 = (key, direction, portName) => {
        const child = g.children.get(key) ?? fail2("Missing audio graph child");
        if (child.children) return namedPort(child[direction], portName).target;
        const spec = namedPort(primitiveSpec(child)[direction], portName);
        return { id: child.id, port: spec.name, signal: spec.signal, leaf: child };
      };
      for (const direction of ["inputs", "outputs"])
        for (const p of d[direction])
          g[direction].push({
            ...p,
            target: p.node === null ? null : port2(p.node, direction, p.port)
          });
      for (const p of d.parameters ?? []) {
        const child = g.children.get(p.node);
        let target;
        if (child.children) target = namedPort(child.parameters, p.parameter).target;
        else {
          const spec = namedPort(primitiveSpec(child).parameters, p.parameter);
          target = { leaf: child, spec };
        }
        g.parameters.push({ ...p, target });
      }
      for (const e of d.connections)
        g.wires.push({ from: port2(e.from, "outputs", e.output), to: port2(e.to, "inputs", e.input) });
      for (const wire of g.wires)
        if (wire.from && wire.to && wire.from.signal !== wire.to.signal)
          fail2("Incompatible audio graph port types");
      return g;
    }
    for (const root of audio2.instances) roots.push(group(root.definition, root.path, "", root));
    return { audio: audio2, defs, roots, groups, leaves };
  }
  function applyAudioGraphs(graph, value) {
    const snapshot = graph.snapshot();
    const result = expand(value, { instances: snapshot.instances, signal: { nodes: snapshot.nodes } });
    for (const leaf of result.leaves) {
      let handle = graph.find(leaf.id);
      if (leaf.adopt) {
        if (!handle || handle.type !== leaf.type || graph.findInstance(leaf.path)?.id !== leaf.id)
          fail2(`The adopted audio node ${leaf.path} no longer matches its graph definition`);
        graph.configure(handle, leaf.config ?? {});
      } else {
        if (handle || graph.findInstance(leaf.path))
          fail2(`Audio graph DSP identity collision at ${leaf.path}`);
        handle = graph.add(leaf.type, { id: leaf.id, config: leaf.config ?? {} });
        graph.registerInstance(leaf.path, handle);
        for (const p of leaf.values ?? []) handle.parameter(p.name).set(p.value);
      }
      for (const p of graph.describeNode(handle).inputs) graph.disconnect(handle.input(p.name));
    }
    for (const g of result.groups)
      for (const e of g.wires)
        if (e.from && e.to)
          graph.connect(
            graph.find(e.from.id).output(e.from.port),
            graph.find(e.to.id).input(e.to.port)
          );
    for (const g of result.roots)
      for (const p of g.parameters) {
        const { leaf, spec } = p.target;
        if (leaf.adopt) continue;
        if (graph.listParameters().some((e) => e.nodeId === leaf.id && e.id === spec.id)) continue;
        graph.find(leaf.id).parameter(spec.name).expose({
          path: `${g.path}/${p.name}`,
          min: p.min ?? spec.min,
          max: p.max ?? spec.max,
          default: p.default ?? spec.default
        });
      }
    return new Map(
      result.groups.map((g) => [
        g.path,
        {
          input: (port2) => {
            const t = namedPort(g.inputs, port2).target;
            return t ? graph.find(t.id).input(t.port) : null;
          },
          output: (port2) => {
            const t = namedPort(g.outputs, port2).target;
            return t ? graph.find(t.id).output(t.port) : null;
          }
        }
      ])
    );
  }
  function primitiveDescriptor(node, project, catalog, layout) {
    const spec = primitiveSpec({ type: node.type, config: constructorConfig(node, catalog) }), instance = project.instances?.find((i2) => i2.nodeId === node.id)?.path ?? `/${node.type}/${node.id}`;
    const placement = layout.find((p) => p.path === instance);
    return {
      id: node.id,
      type: node.type,
      label: spec.label ?? node.type,
      category: spec.category,
      description: spec.description,
      instance,
      domain: "audio",
      scope: "",
      inputs: spec.inputs,
      outputs: node.type === "output" ? [{ name: "analysis", signal: "analysis" }] : spec.outputs,
      parameters: spec.parameters.map((p) => {
        const endpoint = project.endpoints?.find((e) => e.nodeId === node.id && e.id === p.id);
        return {
          ...p,
          label: p.label ?? p.name,
          min: endpoint?.min ?? p.min,
          max: endpoint?.max ?? p.max,
          default: project.signal.initialParameters.find((v) => v.nodeId === node.id && v.id === p.id)?.value ?? p.default,
          path: endpoint?.path ?? ""
        };
      }),
      position: placement ? [placement.x, placement.y] : null,
      positionSpace: placement?.space ?? ""
    };
  }
  function audioGraphPresentation(value, project, catalog, layout = []) {
    const io = project.signal.io;
    const usedNodes = new Set(project.signal.connections.flatMap((e) => [e.from, e.to]));
    for (const binding of io?.inputBindings ?? [])
      if (binding.channels.some((channel) => channel !== null)) usedNodes.add(binding.nodeId);
    for (const binding of io?.outputBindings ?? []) if (binding) usedNodes.add(binding.nodeId);
    const authoredNodes = new Set(project.instances?.map((instance) => instance.nodeId));
    const x = expand(value, project), nodes = project.signal.nodes.filter((n) => n.type !== "monitor").filter(
      (n) => !io || authoredNodes.has(n.id) || usedNodes.has(n.id) || !["input.raw", "input.sidechain", "output"].includes(n.type)
    ).map((n) => primitiveDescriptor(n, project, catalog, layout));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const sourceLink = [
      { role: "definition", label: "Audio graph definition", path: "/audio-graphs.json" }
    ];
    for (const g of x.groups)
      if (nodes.some((n) => n.instance === g.path)) fail2("Audio graph instance path already exists");
    const interfaceIds = new Set(nodes.map((n) => n.id));
    for (const leaf of x.leaves) {
      const n = byId.get(leaf.id) ?? fail2(`Missing contained DSP node ${leaf.id}`);
      n.scope = leaf.scope;
      n.ownerDefinition = x.groups.find((g) => g.path === leaf.scope).definition;
      if (!leaf.adopt)
        n.sourceLinks = sourceLink.map((link) => ({
          ...link,
          sharedInstances: x.groups.filter((g) => g.definition === n.ownerDefinition).length
        }));
    }
    for (const g of x.groups) {
      const d = x.defs.get(g.definition), placement = layout.find((p) => p.path === g.path);
      const parameters = g.parameters.map((p) => {
        const { leaf, spec } = p.target;
        const actual = byId.get(leaf.id).parameters.find((v) => v.name === spec.name);
        return { ...actual, name: p.name, label: p.label ?? p.name };
      });
      const sharedInstances = x.groups.filter((other) => other.definition === g.definition).length;
      nodes.push({
        id: g.id,
        type: g.definition,
        label: g.scope ? d.label : g.root.label ?? d.label,
        instance: g.path,
        domain: "audio",
        scope: g.scope,
        implementationKind: "composition",
        ownerDefinition: g.scope ? x.groups.find((p) => p.path === g.scope).definition : "",
        parameters,
        inputs: g.inputs.map((p) => ({ name: p.name, signal: p.target?.signal ?? p.signal })),
        outputs: g.outputs.map((p) => ({ name: p.name, signal: p.target?.signal ?? p.signal })),
        sourceLinks: sourceLink.map((l) => ({ ...l, sharedInstances })),
        position: placement ? [placement.x, placement.y] : null,
        positionSpace: placement?.space ?? ""
      });
      for (const direction of ["inputs", "outputs"]) {
        const path = g.path + (direction === "inputs" ? "/@inputs" : "/@outputs"), id = graphCanvasId(path);
        if (interfaceIds.has(id) || x.groups.some((g2) => g2.id === id))
          fail2("Audio graph canvas identity collision");
        interfaceIds.add(id);
        g[direction + "Id"] = id;
        nodes.push({
          id,
          type: "audio-interface",
          label: direction === "inputs" ? "Graph inputs" : "Graph outputs",
          instance: path,
          domain: "audio",
          scope: g.path,
          implementationKind: direction === "inputs" ? "interface-input" : "interface-output",
          parameters: [],
          ownerDefinition: g.definition,
          inputs: direction === "outputs" ? g.outputs.map((p) => ({ name: p.name, signal: p.target?.signal ?? p.signal })) : [],
          outputs: direction === "inputs" ? g.inputs.map((p) => ({ name: p.name, signal: p.target?.signal ?? p.signal })) : [],
          sourceLinks: sourceLink
        });
      }
    }
    const edges = [];
    for (const g of x.groups) {
      const d = x.defs.get(g.definition);
      const child = (key, direction, port2) => {
        const c = g.children.get(key);
        return {
          id: c.id,
          index: (c.children ? c[direction] : primitiveSpec(c)[direction]).findIndex(
            (p) => p.name === port2
          )
        };
      };
      for (const e of d.connections) {
        const a = child(e.from, "outputs", e.output), b = child(e.to, "inputs", e.input);
        edges.push({ from: a.id, outputPort: a.index, to: b.id, inputPort: b.index });
      }
      g.inputs.forEach((p, i2) => {
        if (p.node === null) return;
        const b = child(p.node, "inputs", p.port);
        edges.push({ from: g.inputsId, outputPort: i2, to: b.id, inputPort: b.index });
      });
      g.outputs.forEach((p, i2) => {
        if (p.node === null) return;
        const a = child(p.node, "outputs", p.port);
        edges.push({ from: a.id, outputPort: a.index, to: g.outputsId, inputPort: i2 });
      });
    }
    const owner = new Map(
      x.leaves.map((leaf) => [leaf.id, x.roots.find((g) => g.root === leaf.root)])
    );
    const projectPort = (id, direction, index) => catalog[project.signal.nodes.find((n) => n.id === id).type][direction][index]?.name;
    for (const e of project.signal.connections) {
      const from = owner.get(e.from), to = owner.get(e.to);
      if (from && from === to) continue;
      const boundary = (g, direction, id, index) => g[direction].findIndex(
        (p) => p.target?.id === id && p.target.port === projectPort(id, direction, index)
      );
      const outputPort = from ? boundary(from, "outputs", e.from, e.outputPort) : e.outputPort, inputPort = to ? boundary(to, "inputs", e.to, e.inputPort) : e.inputPort;
      if (outputPort < 0 || inputPort < 0)
        fail2("Audio cable crosses a graph boundary without an exposed port");
      edges.push({ from: from?.id ?? e.from, outputPort, to: to?.id ?? e.to, inputPort });
    }
    let channelOffset = 0;
    for (const bus of io?.outputs ?? []) {
      const bindings = io.outputBindings.slice(channelOffset, channelOffset + bus.channels);
      channelOffset += bus.channels;
      const combined = bindings.every(
        (b, index) => b && b.nodeId === bindings[0]?.nodeId && b.outputPort === bindings[0]?.outputPort && b.channel === index
      );
      const instance = `/@outputs/${bus.id}`, id = graphCanvasId(instance);
      if (nodes.some((node) => node.id === id)) fail2("Audio output canvas identity collision");
      nodes.push({
        id,
        type: "audio-interface",
        label: `Output \xB7 ${bus.name}`,
        instance,
        domain: "audio",
        scope: "",
        implementationKind: "interface-output",
        parameters: [],
        inputs: (combined ? ["audio"] : Array.from({ length: bus.channels }, (_, i2) => `channel-${i2 + 1}`)).map((name3) => ({ name: name3, signal: "audio" })),
        outputs: bus === io.outputs[0] ? [{ name: "analysis", signal: "analysis" }] : [],
        sourceLinks: [{ role: "declaration", label: "Device source", path: "/project.mjs" }]
      });
      (combined ? bindings.slice(0, 1) : bindings).forEach((binding, inputPort) => {
        if (!binding) return;
        const group = owner.get(binding.nodeId);
        const outputPort = group ? group.outputs.findIndex(
          (port2) => port2.target?.id === binding.nodeId && port2.target.port === projectPort(binding.nodeId, "outputs", binding.outputPort)
        ) : binding.outputPort;
        if (outputPort < 0) fail2("Audio output crosses a graph boundary without an exposed port");
        edges.push({ from: group?.id ?? binding.nodeId, outputPort, to: id, inputPort });
      });
    }
    return {
      audioNodes: nodes,
      audioEdges: edges,
      audioPalette: x.audio.definitions.map((d) => ({
        type: d.id,
        label: d.label,
        kind: "audio-graph",
        inputs: d.inputs.length,
        outputs: d.outputs.length,
        parameters: d.parameters?.length ?? 0,
        input_ports: d.inputs.map((p) => ({ name: p.name })),
        output_ports: d.outputs.map((p) => ({ name: p.name }))
      }))
    };
  }
  function writeBindings(x) {
    for (const root of x.audio.instances) {
      root.nodes = {};
      for (const leaf of x.leaves.filter((l) => l.root.path === root.path))
        root.nodes[leaf.key] = {
          id: leaf.id,
          path: leaf.path,
          ...leaf.adopt ? { adopt: true } : {}
        };
    }
  }
  function uniqueName(base, used) {
    base = base.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 52);
    if (!/^[a-zA-Z]/.test(base)) base = "graph-" + base;
    let n = base, i2 = 2;
    while (used.has(n)) n = base + "-" + i2++;
    used.add(n);
    return n;
  }
  function extract(nodes, connections, inputs, outputs, parameters, selected, id, label2) {
    const d = {
      id,
      label: label2,
      nodes: nodes.filter((n) => selected.has(n.key)),
      connections: connections.filter((e) => selected.has(e.from) && selected.has(e.to)),
      inputs: [],
      outputs: [],
      parameters: []
    };
    const inNames = /* @__PURE__ */ new Set(), outNames = /* @__PURE__ */ new Set(), paramNames = /* @__PURE__ */ new Set();
    const bind = (direction, node, port2, signal) => {
      const found = d[direction].find((p) => p.node === node && p.port === port2);
      if (found) {
        if (signal) found.signal = signal;
        return found.name;
      }
      const n = uniqueName(node + "-" + port2, direction === "inputs" ? inNames : outNames);
      d[direction].push({ name: n, node, port: port2, ...signal ? { signal } : {} });
      return n;
    };
    for (const e of connections) {
      if (selected.has(e.to) && !selected.has(e.from)) bind("inputs", e.to, e.input);
      if (selected.has(e.from) && !selected.has(e.to)) bind("outputs", e.from, e.output);
    }
    for (const p of inputs) if (selected.has(p.node)) bind("inputs", p.node, p.port, p.signal);
    for (const p of outputs) if (selected.has(p.node)) bind("outputs", p.node, p.port, p.signal);
    for (const p of parameters)
      if (selected.has(p.node)) d.parameters.push({ ...p, name: uniqueName(p.name, paramNames) });
    return { d, bind };
  }
  function editAudioGraphs(edits, command, project, catalog = AUDIO_CATALOG) {
    const x = expand(edits.audioGraphs, project), view = audioGraphPresentation(edits.audioGraphs, project, catalog, edits.layout), nodes = view.audioNodes;
    const get = (path) => nodes.find(
      (n) => n.instance === path || path === "@input" && n.id === 1 || path === "@output" && n.id === 3
    );
    const selected = command.ids?.map((id) => nodes.find((n) => n.id === id));
    const persist = () => {
      edits.audioGraphs = validateAudioGraphs(x.audio);
    };
    if (command.operation === "graph.audio.replace") {
      edits.audioGraphs = validateAudioGraphs(command.value);
      return true;
    }
    if (command.operation === "graph.addInstance") {
      if (!x.defs.has(command.definitionId)) fail2("Unknown reusable audio graph");
      if (command.scope) {
        const d = x.defs.get(command.scope) ?? fail2("Unknown containing audio graph");
        d.nodes.push({
          key: uniqueName(command.definitionId, new Set(d.nodes.map((n) => n.key))),
          definition: command.definitionId
        });
        persist();
        return true;
      }
      const used = new Set(x.audio.instances.map((i3) => i3.path));
      let i2 = 1, path = command.path;
      if (!path) {
        do {
          path = `/audio/${command.definitionId}/${i2++}`;
        } while (used.has(path));
      }
      if (used.has(path)) fail2("Audio graph instance path already exists");
      x.audio.instances.push({
        definition: command.definitionId,
        path,
        label: command.label ?? `${x.defs.get(command.definitionId).label} ${x.audio.instances.filter((i3) => i3.definition === command.definitionId).length + 1}`
      });
      persist();
      return true;
    }
    if (command.operation === "graph.add" && command.scope) {
      const d = x.defs.get(command.scope) ?? fail2("Unknown containing audio graph");
      d.nodes.push({
        key: uniqueName(command.type, new Set(d.nodes.map((n) => n.key))),
        type: command.type
      });
      persist();
      return true;
    }
    if (command.operation === "graph.wrap") {
      if (!selected?.length || selected.some(
        (n) => !n || n.id === 1 || n.id === 3 || n.implementationKind?.startsWith("interface-")
      ) || new Set(command.ids).size !== selected.length || selected.some((n) => n.scope !== selected[0].scope))
        fail2("Select audio nodes from one graph to wrap");
      const labels = new Set(x.audio.definitions.map((d) => d.id));
      const id = command.definitionId ?? uniqueName((command.label ?? "audio-graph").toLowerCase(), new Set(labels));
      if (!name(id) || labels.has(id)) fail2("Use a new audio graph definition ID");
      const label2 = command.label?.trim() || "Audio graph";
      const scope = selected[0].scope, parent = x.groups.find((g) => g.path === scope);
      writeBindings(x);
      if (parent) {
        const d = x.defs.get(parent.definition), keys = new Set(
          [...parent.children].filter(([, c]) => selected.some((n) => n.id === c.id)).map(([k]) => k)
        );
        const { d: inner, bind } = extract(
          d.nodes,
          d.connections,
          d.inputs,
          d.outputs,
          d.parameters ?? [],
          keys,
          id,
          label2
        );
        for (const direction of ["inputs", "outputs"])
          for (const p of inner[direction]) {
            const child = parent.children.get(p.node), port2 = namedPort(
              child.children ? child[direction] : primitiveSpec(child)[direction],
              p.port
            );
            p.signal = port2.target?.signal ?? port2.signal;
          }
        const key = uniqueName(id, new Set(d.nodes.map((n) => n.key)));
        for (const g of x.groups.filter((g2) => g2.definition === parent.definition)) {
          const root = x.audio.instances.find((r) => r.path === g.root.path), next = {};
          for (const [k, b] of Object.entries(root.nodes)) {
            const local = k.startsWith(g.prefix) ? k.slice(g.prefix.length) : null;
            next[local !== null && keys.has(local.split("/")[0]) ? g.prefix + key + "/" + local : k] = b;
          }
          root.nodes = next;
        }
        d.nodes = [...d.nodes.filter((n) => !keys.has(n.key)), { key, definition: id }];
        d.connections = d.connections.filter((e) => !(keys.has(e.from) && keys.has(e.to))).map((e) => ({
          ...e,
          ...keys.has(e.from) ? { from: key, output: bind("outputs", e.from, e.output) } : {},
          ...keys.has(e.to) ? { to: key, input: bind("inputs", e.to, e.input) } : {}
        }));
        for (const direction of ["inputs", "outputs"])
          d[direction] = d[direction].map(
            (p) => keys.has(p.node) ? { ...p, node: key, port: bind(direction, p.node, p.port, p.signal) } : p
          );
        d.parameters = (d.parameters ?? []).map(
          (p) => keys.has(p.node) ? {
            ...p,
            node: key,
            parameter: inner.parameters.find(
              (v) => v.node === p.node && v.parameter === p.parameter
            ).name
          } : p
        );
        x.audio.definitions.push(inner);
      } else {
        const rootNodes = nodes.filter((n) => !n.scope), keyOf = (n) => "n" + n.id, keys = new Set(selected.map(keyOf));
        const defs = selected.map((n) => {
          const g = x.roots.find((g2) => g2.id === n.id);
          if (g) return { key: keyOf(n), definition: g.definition };
          const actual = project.signal.nodes.find((v) => v.id === n.id);
          if (project.assets?.some?.((a) => a.nodeId === n.id) || project.sampleBindings?.some?.(
            (a) => a.nodeId === n.id || a.sourceNodeId === n.id || a.targetNodeId === n.id
          ) || project.signal.captureSources?.some((a) => a.nodeId === n.id) || project.signal.selectedCaptureNodeId === n.id || project.signal.io?.inputBindings?.some((b) => b.nodeId === n.id) || project.signal.io?.outputBindings?.some((b) => b.nodeId === n.id))
            fail2(
              "Resource and host-channel bound nodes need explicit resource authoring before cloning"
            );
          return {
            key: keyOf(n),
            type: actual.type,
            config: constructorConfig(actual, catalog),
            values: n.parameters.map((p) => ({
              name: p.name,
              value: project.signal.initialParameters.find((v) => v.nodeId === n.id && v.id === p.id)?.value ?? p.default
            }))
          };
        });
        const rootIds = new Map(rootNodes.map((n) => [n.id, n]));
        const edges = view.audioEdges.filter((e) => rootIds.has(e.from) && rootIds.has(e.to));
        const connections = edges.map((e) => ({
          from: keyOf(rootIds.get(e.from)),
          output: rootIds.get(e.from).outputs[e.outputPort].name,
          to: keyOf(rootIds.get(e.to)),
          input: rootIds.get(e.to).inputs[e.inputPort].name
        }));
        const inputs = [], outputs = [], parameters = [];
        for (const n of selected) {
          for (const p of n.inputs)
            if (!connections.some((e) => e.to === keyOf(n) && e.input === p.name && keys.has(e.from)))
              inputs.push({ node: keyOf(n), port: p.name, signal: p.signal });
          for (const p of n.outputs)
            if (!connections.some((e) => e.from === keyOf(n) && e.output === p.name) || connections.some((e) => e.from === keyOf(n) && e.output === p.name && !keys.has(e.to)))
              outputs.push({ node: keyOf(n), port: p.name, signal: p.signal });
          for (const p of n.parameters.filter((p2) => p2.path))
            parameters.push({
              name: keyOf(n) + "-" + p.name,
              node: keyOf(n),
              parameter: p.name,
              label: p.label,
              min: p.min,
              max: p.max,
              default: p.default,
              ...p.choices ? { choices: p.choices } : {},
              ...p.choiceValues ? { choiceValues: p.choiceValues } : {}
            });
        }
        const { d, bind } = extract(defs, connections, inputs, outputs, parameters, keys, id, label2);
        const path = "/audio/" + id + "/1";
        if (x.audio.instances.some((i2) => i2.path === path))
          fail2("Audio graph instance path already exists");
        const instance = { path, definition: id, nodes: {} };
        for (const n of selected) {
          const g = x.roots.find((g2) => g2.id === n.id);
          if (g) {
            for (const [key, binding] of Object.entries(g.root.nodes))
              instance.nodes[keyOf(n) + "/" + key] = binding;
          } else instance.nodes[keyOf(n)] = { id: n.id, path: n.instance, adopt: true };
        }
        x.audio.instances = x.audio.instances.filter(
          (i2) => !selected.some((n) => n.instance === i2.path)
        );
        x.audio.instances.push(instance);
        x.audio.definitions.push(d);
        const reference2 = (n) => n.id === 1 ? "@input" : n.id === 3 ? "@output" : n.instance;
        edits.connections = [];
        for (const n of rootNodes)
          for (const p of n.inputs) {
            const e = connections.find((e2) => e2.to === keyOf(n) && e2.input === p.name);
            if (keys.has(keyOf(n)) && e && keys.has(e.from)) continue;
            const from = e && rootNodes.find((n2) => keyOf(n2) === e.from);
            edits.connections.push({
              to: keys.has(keyOf(n)) ? path : reference2(n),
              input: keys.has(keyOf(n)) ? bind("inputs", keyOf(n), p.name, p.signal) : p.name,
              from: from ? keys.has(keyOf(from)) ? path : reference2(from) : null,
              ...from ? {
                output: keys.has(keyOf(from)) ? bind(
                  "outputs",
                  keyOf(from),
                  e.output,
                  from.outputs.find((p2) => p2.name === e.output).signal
                ) : e.output
              } : {}
            });
          }
      }
      persist();
      return true;
    }
    const node = nodes.find((n) => n.id === command.id || n.instance === command.path);
    if (command.operation === "graph.position" && node && (node.scope || node.implementationKind === "composition")) {
      const world = command.space === "world";
      if (command.space && !world) fail2("Unknown graph position space");
      if (!Number.isFinite(command.x) || !Number.isFinite(command.y) || ![command.x, command.y].every((v) => world ? Math.abs(v) <= 1e6 : v >= 0 && v <= 1))
        fail2("Invalid graph position");
      edits.layout = [
        ...edits.layout.filter((p) => p.path !== node.instance),
        {
          path: node.instance,
          x: command.x,
          y: command.y,
          ...command.space ? { space: command.space } : {}
        }
      ];
      return true;
    }
    if (["graph.connect", "graph.disconnect"].includes(command.operation)) {
      const to = get(command.to), from = command.from && get(command.from);
      if (!to?.scope && !from?.scope) return false;
      if (!to?.scope || from && from.scope !== to.scope)
        fail2("Connect through the audio graph interface");
      const g = x.groups.find((g2) => g2.path === to.scope), d = x.defs.get(g.definition);
      const key = (n) => [...g.children].find(([, c]) => c.id === n?.id)?.[0];
      if (to.implementationKind === "interface-output") {
        const p = namedPort(d.outputs, command.input);
        if (command.operation === "graph.disconnect") p.node = null;
        else {
          if (!key(from)) fail2("Connect a child output to the graph output");
          p.node = key(from);
          p.port = command.output;
        }
      } else {
        if (!key(to)) fail2("Select an audio input");
        d.connections = d.connections.filter((e) => e.to !== key(to) || e.input !== command.input);
        const bound = d.inputs.find((p) => p.node === key(to) && p.port === command.input);
        if (bound) bound.node = null;
        if (from?.implementationKind === "interface-input") {
          const p = namedPort(d.inputs, command.output);
          p.node = key(to);
          p.port = command.input;
        } else if (command.operation === "graph.connect") {
          if (!key(from)) fail2("Select an audio output");
          d.connections.push({
            from: key(from),
            output: command.output,
            to: key(to),
            input: command.input
          });
        }
      }
      persist();
      return true;
    }
    if (command.operation === "graph.remove" && node && (node.scope || node.implementationKind === "composition")) {
      if (node.implementationKind?.startsWith("interface-"))
        fail2("Edit the named interface in audio-graphs.json");
      let removed = [];
      if (node.scope) {
        const g = x.groups.find((g2) => g2.path === node.scope), d = x.defs.get(g.definition);
        const key = [...g.children].find(([, c]) => c.id === node.id)[0];
        removed = x.leaves.filter(
          (l) => x.groups.some(
            (p) => p.definition === g.definition && l.root === p.root && (l.key === p.prefix + key || l.key.startsWith(p.prefix + key + "/"))
          )
        );
        d.nodes = d.nodes.filter((n) => n.key !== key);
        d.connections = d.connections.filter((e) => e.from !== key && e.to !== key);
        for (const direction of ["inputs", "outputs"])
          for (const p of d[direction]) if (p.node === key) p.node = null;
        d.parameters = (d.parameters ?? []).filter((p) => p.node !== key);
      } else {
        removed = x.leaves.filter((l) => l.root.path === node.instance);
        x.audio.instances = x.audio.instances.filter((i2) => i2.path !== node.instance);
        edits.connections = edits.connections.filter(
          (e) => e.from !== node.instance && e.to !== node.instance
        );
      }
      for (const leaf of removed) {
        if (leaf.adopt) {
          if (edits.nodes.some((n) => n.path === leaf.path))
            edits.nodes = edits.nodes.filter((n) => n.path !== leaf.path);
          else if (!edits.removed.includes(leaf.path)) edits.removed.push(leaf.path);
        }
        for (const instance of x.audio.instances)
          if (instance.path === leaf.root.path) delete instance.nodes?.[leaf.key];
      }
      edits.layout = edits.layout.filter(
        (p) => p.path !== node.instance && !removed.some((l) => l.path === p.path)
      );
      persist();
      return true;
    }
    return false;
  }

  // packages/manifold-author/device.js
  var devices = /* @__PURE__ */ new WeakMap();
  var references = /* @__PURE__ */ new WeakMap();
  var fail3 = (message) => {
    throw new GraphContractError("invalid-device", message);
  };
  var named = (value) => {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value))
      fail3("Use a stable name containing letters, digits, underscores or hyphens");
    return value;
  };
  var ordered = (map) => [...map.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  var reference = (data2, visible) => {
    const ref2 = Object.freeze(visible);
    references.set(ref2, data2);
    return ref2;
  };
  var ownerOf = (ref2, owner) => {
    const data2 = references.get(ref2);
    if (!data2 || data2.owner !== owner) fail3("References must belong to this device");
    return data2;
  };
  var audio = Object.freeze({ stereo: Object.freeze({ signal: "audio", channels: 2 }) });
  var midi = Object.freeze({ events: Object.freeze({ signal: "midi" }) });
  var lowPassFilter = Object.freeze({
    ...svf,
    label: "Low-pass filter",
    defaults: Object.freeze({ mode: 0 })
  });
  var sawOscillator = Object.freeze({
    ...oscillator,
    label: "Saw oscillator",
    defaults: Object.freeze({ waveform: 1 })
  });
  var sineOscillator = Object.freeze({
    ...oscillator,
    label: "Sine oscillator",
    defaults: Object.freeze({ waveform: 0 })
  });
  function createDevice({ id, name: name3 } = {}) {
    named(id);
    if (typeof name3 !== "string" || !name3.trim() || name3 !== name3.trim())
      fail3("Give the device a display name");
    const state = {
      id,
      name: name3,
      nodes: /* @__PURE__ */ new Map(),
      inputs: /* @__PURE__ */ new Map(),
      outputs: /* @__PURE__ */ new Map(),
      controls: /* @__PURE__ */ new Map(),
      connections: [],
      layout: [],
      groups: []
    };
    const boundary = (direction, key, kind) => {
      named(key);
      if (kind !== audio.stereo && kind !== midi.events)
        fail3("Device boundaries support stereo audio and MIDI event inputs");
      if (direction === "outputs" && kind !== audio.stereo)
        fail3("MIDI output lowering is not implemented");
      if (state[direction].has(key)) fail3(`Duplicate ${direction} name: ${key}`);
      if (kind === midi.events && [...state.inputs.values()].some((ref3) => ref3.signal === "midi"))
        fail3("The current host exposes one MIDI event input");
      const ref2 = reference(
        {
          owner: device,
          boundary: direction,
          key,
          direction: direction === "inputs" ? "outputs" : "inputs",
          signal: kind.signal
        },
        { name: key, ...kind }
      );
      state[direction].set(key, ref2);
      return ref2;
    };
    const device = Object.freeze({
      id,
      name: name3,
      get inputs() {
        return Object.freeze(Object.fromEntries(state.inputs));
      },
      get outputs() {
        return Object.freeze(Object.fromEntries(state.outputs));
      },
      input: (key, kind) => boundary("inputs", key, kind),
      output: (key, kind) => boundary("outputs", key, kind),
      add(key, definition2, options = {}) {
        named(key);
        if (state.nodes.has(key)) fail3(`Duplicate processor name: ${key}`);
        if (devices.has(definition2)) {
          if (Object.keys(options).length)
            fail3("Configure a nested Device through its instance.configure method");
          return addDevice(device, state, key, definition2);
        }
        if (!definition2 || typeof definition2 !== "object" || typeof definition2.type !== "string")
          fail3("Import a processor definition and pass it directly to add");
        const canonical = getPrimitive(definition2.type);
        if (definition2.code !== canonical.code) fail3("Expected a known rich processor definition");
        if (["input.raw", "input.sidechain", "midi-input", "output"].includes(definition2.type))
          fail3("Declare device boundaries with input/output");
        const config = options.config ?? {};
        if (Object.keys(options).some((key2) => key2 !== "config")) fail3("Unknown processor option");
        const described = new GraphWorkspace();
        const spec = described.describeNode(described.add(canonical.type, { id: 4, config }));
        const node = {
          key,
          definition: canonical,
          config: structuredClone(config),
          values: { ...definition2.defaults ?? {} }
        };
        const parameters = Object.fromEntries(
          (spec.parameters ?? []).filter((p) => p.name).map((p) => [p.name, reference({ owner: device, node, parameter: p.name }, { ...p })])
        );
        const ports = (direction) => Object.freeze(
          Object.fromEntries(
            spec[direction].map((port2) => [
              port2.name,
              reference(
                { owner: device, node, direction, name: port2.name, signal: port2.signal },
                { ...port2 }
              )
            ])
          )
        );
        const instance = Object.freeze({
          name: key,
          definition: definition2,
          parameters: Object.freeze(parameters),
          inputs: ports("inputs"),
          outputs: ports("outputs"),
          configure(values) {
            if (!values || Array.isArray(values) || typeof values !== "object")
              fail3("configure expects named initial parameter values");
            for (const name4 of Object.keys(values))
              if (!Object.hasOwn(parameters, name4)) fail3(`Unknown ${key} parameter: ${name4}`);
            Object.assign(node.values, values);
            return instance;
          }
        });
        references.set(instance, { owner: device, node });
        state.nodes.set(key, node);
        return instance;
      },
      control(key, parameter2, options) {
        named(key);
        if (state.controls.has(key)) fail3(`Duplicate control name: ${key}`);
        const target = ownerOf(parameter2, device);
        if (!target.parameter) fail3("Controls target processor parameters");
        options ?? (options = references.get(parameter2)?.options);
        if (options && references.get(parameter2)?.options === options)
          options = Object.fromEntries(
            Object.entries(options).filter(
              ([key2]) => ["label", "min", "max", "default", "unit", "style"].includes(key2)
            )
          );
        if ([...state.controls.values()].some(
          (c) => c.target.node === target.node && c.target.parameter === target.parameter
        ))
          fail3("Reuse the existing control reference for this parameter");
        if (!options || typeof options.label !== "string" || !options.label.trim())
          fail3("Give the control a label");
        if (Object.keys(options).some(
          (k) => !["label", "min", "max", "default", "unit", "style"].includes(k)
        ))
          fail3("Unknown control option");
        if (options.unit !== void 0 && typeof options.unit !== "string")
          fail3("Control units must be text");
        if (options.style !== void 0 && (!options.style || typeof options.style !== "object" || Array.isArray(options.style) || Object.entries(options.style).some(
          ([key2, value]) => !["accent", "background", "text"].includes(key2) || typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)
        )))
          fail3("Style accepts accent, background and text as six-digit hex colors");
        options = {
          ...options,
          ...options.style ? { style: Object.freeze({ ...options.style }) } : {}
        };
        const control = reference(
          { owner: device, target },
          { id: key, path: `/${key}`, parameter: parameter2, ...options }
        );
        state.controls.set(key, { target, control });
        return control;
      },
      group(id2, instances, { label: label2 } = {}) {
        named(id2);
        if (!Array.isArray(instances) || instances.length < 2 || new Set(instances).size !== instances.length || typeof label2 !== "string" || !label2.trim() || state.groups.some((group) => group.id === id2))
          fail3("Group needs a unique name, label and at least two distinct processors");
        const keys = instances.map((instance) => ownerOf(instance, device).node?.key);
        if (keys.some((key) => !key)) fail3("Group members must be processors in this Device");
        state.groups.push({ id: id2, label: label2, keys });
        return device;
      },
      place(instance, position) {
        const { node } = ownerOf(instance, device);
        if (!node || !position || ![position.x, position.y].every(Number.isFinite) || Math.abs(position.x) > 1e6 || Math.abs(position.y) > 1e6 || position.space !== void 0 && position.space !== "world")
          fail3("Place a processor with finite world coordinates");
        state.layout = [
          ...state.layout.filter((item) => item.key !== node.key),
          { key: node.key, ...position, space: "world" }
        ];
        return device;
      },
      connect(from, to) {
        const source3 = ownerOf(from, device), target = ownerOf(to, device);
        if (source3.direction !== "outputs" || target.direction !== "inputs" || source3.signal !== target.signal)
          fail3("Connect an output to an input of the same signal type");
        if (state.connections.some((edge) => edge.to === to)) fail3("Input is already connected");
        state.connections.push({ from, to });
        return device;
      }
    });
    devices.set(device, state);
    return device;
  }
  function createEffect(identity) {
    const device = createDevice(identity);
    device.input("audio", audio.stereo);
    device.output("audio", audio.stereo);
    return device;
  }
  function createInstrument(identity) {
    const device = createDevice(identity);
    device.input("midi", midi.events);
    device.output("audio", audio.stereo);
    return device;
  }
  var isDevice = (value) => devices.has(value);
  function addDevice(owner, state, key, definition2) {
    const child = devices.get(definition2);
    const node = { key, device: definition2, values: {} };
    const ports = (direction) => Object.freeze(
      Object.fromEntries(
        ordered(child[direction]).map(([name3, ref2]) => [
          name3,
          reference(
            { owner, node, direction, name: name3, signal: ref2.signal },
            { name: name3, signal: ref2.signal }
          )
        ])
      )
    );
    const controls = Object.freeze(
      Object.fromEntries(
        ordered(child.controls).map(([name3, entry]) => {
          const data2 = { owner, node, parameter: name3, options: entry.control };
          const parameter2 = reference(data2, { name: name3, ...entry.control });
          return [
            name3,
            reference(
              { ...data2, target: data2 },
              { ...entry.control, id: name3, path: `/${key}/${name3}`, parameter: parameter2 }
            )
          ];
        })
      )
    );
    const instance = Object.freeze({
      name: key,
      definition: definition2,
      inputs: ports("inputs"),
      outputs: ports("outputs"),
      controls,
      parameters: controls,
      configure(values) {
        if (!values || Array.isArray(values) || typeof values !== "object" || Object.keys(values).some((name3) => !Object.hasOwn(controls, name3)))
          fail3("Configure a nested Device using its declared control names");
        for (const [name3, value] of Object.entries(values)) {
          const control = controls[name3];
          if (!Number.isFinite(value) || value < control.min || value > control.max)
            fail3(`Invalid initial value for ${name3}`);
        }
        Object.assign(node.values, values);
        return instance;
      }
    });
    references.set(instance, { owner, node });
    state.nodes.set(key, node);
    return instance;
  }
  function lowerDevice(device, { previous } = {}) {
    const state = devices.get(device);
    if (!state) fail3("Expected a Device declaration");
    if (previous) GraphWorkspace.fromProject(previous);
    const graph = new GraphWorkspace();
    const oldIds = new Map((previous?.instances ?? []).map((i2) => [i2.path, i2.nodeId]));
    const occupied = /* @__PURE__ */ new Set([1, 3, ...(previous?.signal.nodes ?? []).map((n) => n.id)]);
    let nextId = 4;
    const allocate = (path) => {
      if (oldIds.has(path)) return oldIds.get(path);
      while (occupied.has(nextId)) nextId++;
      const id = nextId++;
      if (id > 4294967295) fail3("Device node identity capacity exceeded");
      occupied.add(id);
      return id;
    };
    const contexts = [], declarations = [], definitions2 = /* @__PURE__ */ new Map();
    function expand2(value, path, parent = null, instance = null, ancestors = []) {
      if (ancestors.includes(value)) fail3("A Device cannot contain itself recursively");
      const state2 = devices.get(value);
      if (definitions2.has(state2.id) && definitions2.get(state2.id) !== value)
        fail3("Different Device definitions need distinct IDs");
      definitions2.set(state2.id, value);
      const context = {
        state: state2,
        path,
        parent,
        instance,
        children: /* @__PURE__ */ new Map(),
        handles: /* @__PURE__ */ new Map(),
        inputs: /* @__PURE__ */ new Map()
      };
      contexts.push(context);
      for (const [key, node] of ordered(state2.nodes)) {
        if (node.device)
          context.children.set(
            node,
            expand2(node.device, `${path}/processors/${key}`, context, node, [...ancestors, value])
          );
        else
          declarations.push({
            context,
            node,
            path: `${path}/processors/${key}`,
            type: node.definition.type,
            config: node.config
          });
      }
      if (!parent)
        for (const [key, ref2] of ordered(state2.inputs))
          declarations.push({
            context,
            ref: ref2,
            path: `${path}/inputs/${key}`,
            type: ref2.signal === "audio" ? "input.raw" : "midi-input"
          });
      return context;
    }
    const root = expand2(device, `/device/${state.id}`);
    for (const declaration of declarations.sort(
      (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0
    )) {
      const handle = graph.add(declaration.type, {
        id: allocate(declaration.path),
        config: declaration.config ?? {}
      });
      graph.registerInstance(declaration.path, handle);
      if (declaration.node) {
        declaration.context.handles.set(declaration.node, handle);
        for (const [name3, value] of Object.entries(declaration.node.values))
          handle.parameter(name3).set(value);
      } else declaration.context.inputs.set(declaration.ref, handle);
    }
    const incoming = (context, ref2) => context.state.connections.find((edge) => edge.to === ref2)?.from;
    function source3(context, ref2, visiting = /* @__PURE__ */ new Set()) {
      if (!ref2) return null;
      const token = context.path + ":" + context.state.connections.findIndex((e) => e.from === ref2);
      if (visiting.has(token)) fail3("Recursive Device boundary connection");
      const trail = /* @__PURE__ */ new Set([...visiting, token]);
      const data2 = references.get(ref2);
      if (data2.boundary === "inputs") {
        if (!context.parent) return context.inputs.get(ref2).output("out");
        const edge = context.parent.state.connections.find((e) => {
          const to = references.get(e.to);
          return to.node === context.instance && to.name === data2.key;
        });
        return source3(context.parent, edge?.from, trail);
      }
      if (data2.node?.device) {
        const child = context.children.get(data2.node);
        return source3(child, incoming(child, child.state.outputs.get(data2.name)), trail);
      }
      return context.handles.get(data2.node).output(data2.name);
    }
    function parameter2(context, target) {
      if (target.node.device) {
        const child = context.children.get(target.node);
        return parameter2(child, child.state.controls.get(target.parameter).target);
      }
      return context.handles.get(target.node).parameter(target.parameter);
    }
    for (const context of contexts) {
      for (const edge of context.state.connections) {
        const to = references.get(edge.to);
        if (to.boundary || to.node.device) continue;
        const from = source3(context, edge.from);
        if (from) graph.connect(from, context.handles.get(to.node).input(to.name));
      }
    }
    const audioInputs = ordered(state.inputs).filter(([, ref2]) => ref2.signal === "audio");
    const outputs = ordered(state.outputs);
    graph.setIoLayout({
      version: 1,
      inputs: audioInputs.map(([id]) => ({ id, name: id, channels: 2, optional: false })),
      outputs: outputs.map(([id]) => ({ id, name: id, channels: 2, optional: false })),
      inputBindings: [
        { nodeId: graph.input.id, channels: [null, null] },
        ...audioInputs.map(([, ref2], bus) => ({
          nodeId: root.inputs.get(ref2).id,
          channels: [
            { bus, channel: 0 },
            { bus, channel: 1 }
          ]
        }))
      ],
      outputBindings: outputs.flatMap(([, ref2]) => {
        const from = source3(root, incoming(root, ref2));
        return [0, 1].map(
          (channel) => from ? { nodeId: from.nodeId, outputPort: from.index, channel } : null
        );
      })
    });
    const assignments = new Map((previous?.hostAssignments ?? []).filter((a) => a.path !== void 0).map((a) => [a.path, a.slot]));
    for (const endpoint of previous?.endpoints ?? []) {
      const binding = previous.hostBindings?.find((b) => b.nodeId === endpoint.nodeId && b.id === endpoint.id);
      if (binding && !assignments.has(endpoint.path)) assignments.set(endpoint.path, binding.slot);
    }
    const anonymousSlots = new Set((previous?.hostAssignments ?? []).filter((a) => a.path === void 0).map((a) => a.slot));
    for (const binding of previous?.hostBindings ?? []) if (![...assignments.values()].includes(binding.slot)) anonymousSlots.add(binding.slot);
    graph.reserveHostSlots([...assignments].map(([path, slot]) => ({ slot, path })).concat([...anonymousSlots].map((slot) => ({ slot }))));
    const oldSlots = assignments;
    const usedSlots = /* @__PURE__ */ new Set([...assignments.values(), ...anonymousSlots, ...(previous?.hostBindings ?? []).map((b) => b.slot)]);
    const view = [], exposed = /* @__PURE__ */ new Set();
    for (const context of contexts) {
      const controlPrefix = context === root ? "" : context.path.slice(root.path.length).replaceAll("/processors/", "/");
      for (const [key, { target, control }] of ordered(context.state.controls)) {
        const targetParameter = parameter2(context, target);
        const targetKey = targetParameter.node.id + ":" + targetParameter.description.id;
        if (exposed.has(targetKey)) continue;
        exposed.add(targetKey);
        const initial = context.instance?.values[key] ?? control.default;
        const path = `${controlPrefix}/${key}`;
        const definition2 = { ...control, path, default: initial };
        targetParameter.expose(definition2);
        const previousEndpoint = previous?.endpoints?.find((endpoint) => endpoint.path === path);
        const intentionallyUnbound = previousEndpoint && Object.hasOwn(previous, "hostBindings") && !previous.hostBindings.some((binding) => binding.nodeId === previousEndpoint.nodeId && binding.id === previousEndpoint.id);
        let slot = oldSlots.get(path);
        if (slot === void 0) {
          slot = 0;
          while (usedSlots.has(slot)) slot++;
        }
        if (!intentionallyUnbound) {
          usedSlots.add(slot);
          graph.bindHostSlot(slot, targetParameter.node, targetParameter.description.id);
        }
        view.push({
          id: controlPrefix ? path : control.id,
          type: "parameter",
          path,
          label: control.label,
          ...targetParameter.description.choices ? {
            choices: [...targetParameter.description.choices],
            choiceValues: targetParameter.description.choices.map((_, index) => targetParameter.description.choiceValues?.[index] ?? index),
            disabledChoices: targetParameter.description.choices.flatMap((_, index) => {
              const value = targetParameter.description.choiceValues?.[index] ?? index;
              return value < control.min || value > control.max ? [index] : [];
            })
          } : {},
          ...control.unit ? { unit: control.unit } : {},
          ...control.style ? { style: { ...control.style } } : {}
        });
      }
    }
    const project = graph.toProject();
    const layout = contexts.flatMap(
      (context) => context.state.layout.map(({ key, ...position }) => ({
        path: `${context.path}/processors/${key}`,
        ...position
      }))
    );
    const hierarchy = contexts.map((context) => ({
      path: context.path,
      scope: context.parent?.path === root.path ? "" : context.parent?.path ?? "",
      root: context === root,
      definition: context.state.id,
      label: context.state.name,
      inputs: ordered(context.state.inputs).map(([name3, ref2]) => ({ name: name3, signal: ref2.signal })),
      outputs: ordered(context.state.outputs).map(([name3, ref2]) => ({ name: name3, signal: ref2.signal })),
      nodes: ordered(context.state.nodes).map(([key, node]) => ({
        key,
        path: `${context.path}/processors/${key}`,
        id: node.device ? graphCanvasId(`${context.path}/processors/${key}`) : context.handles.get(node).id,
        definition: node.device ? devices.get(node.device).id : null
      })),
      edges: context.state.connections.map((edge) => {
        const endpoint = (ref2) => {
          const data2 = references.get(ref2);
          if (data2.boundary) return { boundary: data2.boundary, name: data2.key };
          return { key: data2.node.key, direction: data2.direction, name: data2.name };
        };
        return { from: endpoint(edge.from), to: endpoint(edge.to) };
      })
    }));
    return {
      graph,
      project,
      view,
      editorGraph: {
        deviceHierarchy: hierarchy,
        layout,
        groups: contexts.flatMap(
          (context) => context.state.groups.map(({ keys, ...group }) => ({
            ...group,
            id: context.path + "/" + group.id,
            paths: keys.map((key) => `${context.path}/processors/${key}`)
          }))
        )
      },
      identity: Object.freeze({ id: state.id, name: state.name })
    };
  }

  // packages/manifold-author/visual-primitives.js
  var freeze = (value) => {
    for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child);
    return Object.freeze(value);
  };
  var equivalent = (left, right) => {
    if (left === right) return true;
    if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right))
      return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equivalent(left[key], right[key]));
  };
  var port = (name3, type, unit) => ({ name: name3, type, ...unit ? { unit } : {} });
  var parameter = (name3, label2, min, max, value) => ({ name: name3, label: label2, min, max, default: value });
  var definition = (name3, label2, description, inputs, outputs, parameters) => ({
    id: `manifold-${name3}`,
    version: 1,
    label: label2,
    description,
    category: "Colour & layers",
    keywords: ["image", "animation", "asset"],
    implementation: { kind: "visual-primitive", name: name3 },
    inputs,
    outputs,
    parameters
  });
  function imageFrames({
    id = "manifold-image-frames",
    label: label2 = "Image frames",
    frames = []
  } = {}) {
    return {
      ...definition(
        "image-frames",
        label2,
        "Provides an ordered set of project images. Connect it to Select image frame to choose the visible pose.",
        [],
        [port("frames", "image-sequence")],
        []
      ),
      id,
      implementation: { kind: "visual-primitive", name: "image-frames", frames: [...frames] }
    };
  }
  var selectImageFrame = definition(
    "select-image-frame",
    "Select image frame",
    "Chooses one image from a sequence. Frame 0 is the first image; a connected value overrides the Frame control.",
    [port("frames", "image-sequence"), port("frame", "scalar")],
    [port("image", "image2d")],
    [parameter("frame", "Frame", 0, 255, 0)]
  );
  var transformImage = definition(
    "transform-image",
    "Transform image",
    "Moves, rotates, scales and fades an image. Connected values override the matching controls. Position is measured in image widths.",
    [
      port("image", "image2d"),
      port("rotation", "scalar", "\xB0"),
      port("scale", "scalar"),
      port("opacity", "scalar")
    ],
    [port("image", "image2d")],
    [
      parameter("x", "Horizontal position", -2, 2, 0),
      parameter("y", "Vertical position", -2, 2, 0),
      parameter("rotation", "Rotation \xB7 degrees", -180, 180, 0),
      parameter("scale", "Scale", 0, 4, 1),
      parameter("opacity", "Opacity", 0, 1, 1)
    ]
  );
  var imageLayer = definition(
    "image-layer",
    "Image layer",
    "Draws a connected image in the Presenter, preserving its aspect ratio and transparency. Its output carries the same image for reuse and inspection.",
    [port("image", "image2d")],
    [port("image", "image2d")],
    []
  );
  var visualPrimitives = freeze([
    imageFrames(),
    selectImageFrame,
    transformImage,
    imageLayer
  ]);
  var isImageType = (type) => type === "image2d" || type === "image-sequence";
  var isVisualSurface = (definition2) => definition2.implementation.kind === "web-surface" || definition2.implementation.kind === "visual-primitive" && definition2.implementation.name === "image-layer";
  function validateVisualPrimitive(value, files) {
    const canonical = visualPrimitives.find(
      (item) => item.implementation.name === value.implementation.name
    );
    if (!canonical) throw new Error("Unknown Manifold visual primitive");
    for (const key of ["inputs", "outputs", "parameters"])
      if (!equivalent(value[key], canonical[key]))
        throw new Error(`${canonical.label}: ${key} must match the library definition`);
    const frames = value.implementation.frames;
    if (canonical.implementation.name !== "image-frames") {
      if (frames !== void 0) throw new Error("Only Image frames declares asset paths");
      return;
    }
    if (!Array.isArray(frames))
      throw new Error("Expected image frames");
    for (const path of frames) {
      projectFilePath(path);
      if (!files.some((file) => file.path === path && file.mediaType.startsWith("image/")))
        throw new Error(`Missing project image: ${path}`);
    }
  }

  // packages/manifold-author/creative-graph.js
  var creative_graph_exports = {};
  __export(creative_graph_exports, {
    GraphContractError: () => GraphContractError,
    GraphWorkspace: () => GraphWorkspace,
    LiveGraphSession: () => LiveGraphSession,
    NodeHandle: () => NodeHandle,
    ParameterRef: () => ParameterRef,
    createGraphWorkspace: () => createGraphWorkspace,
    createLiveGraphSession: () => createLiveGraphSession,
    decodeSampleAsset: () => decodeSampleAsset,
    encodeSampleAsset: () => encodeSampleAsset,
    getPrimitive: () => getPrimitive,
    listPrimitives: () => listPrimitives,
    lowerDevice: () => lowerDevice,
    parameterValue: () => parameterValue,
    validateHostAssignments: () => validateHostAssignments,
    validateHostBindings: () => validateHostBindings,
    validateIoLayout: () => validateIoLayout,
    validateNamedInstances: () => validateNamedInstances,
    validateParameterEndpoints: () => validateParameterEndpoints,
    validateProjectControls: () => validateProjectControls
  });

  // packages/manifold-author/device-presentation.js
  function devicePresentation(editor, project, catalog) {
    const base = audioGraphPresentation(void 0, project, catalog, editor.layout);
    const nodes = base.audioNodes;
    const processors = [...nodes];
    const contexts = editor.deviceHierarchy;
    const used = new Set(nodes.map((n) => n.id));
    const add = (node) => {
      if (used.has(node.id)) throw new Error("Device canvas identity collision");
      used.add(node.id);
      nodes.push(node);
    };
    const link = (path, definition2) => [
      {
        role: "declaration",
        label: "Device source",
        path: "/project.mjs",
        declarationPath: `/device/${definition2}/processors/${path.split("/").at(-1)}`
      }
    ];
    for (const context of contexts) {
      const scope = context.root ? "" : context.path;
      for (const child of context.nodes) {
        const leaf = nodes.find((n) => n.id === child.id);
        if (leaf) {
          leaf.scope = scope;
          leaf.ownerDefinition = context.root ? "" : context.definition;
          leaf.label = child.key;
          leaf.sourceLinks = link(child.path, context.definition);
        }
      }
      if (context.root) continue;
      const placement = editor.layout.find((p) => p.path === context.path);
      add({
        id: graphCanvasId(context.path),
        type: context.definition,
        label: context.label,
        instance: context.path,
        scope: context.scope,
        domain: "audio",
        implementationKind: "composition",
        ownerDefinition: context.scope ? contexts.find((c) => c.path === context.scope)?.definition ?? "" : "",
        inputs: context.inputs,
        outputs: context.outputs,
        parameters: processors.filter((n) => n.instance.startsWith(context.path + "/processors/")).flatMap((n) => n.parameters),
        sourceLinks: link(
          context.path,
          contexts.find((c) => c.nodes.some((n) => n.path === context.path)).definition
        ),
        position: placement ? [placement.x, placement.y] : null,
        positionSpace: placement?.space ?? ""
      });
      for (const direction of ["inputs", "outputs"])
        add({
          id: graphCanvasId(context.path + "/@" + direction),
          type: "audio-interface",
          label: direction === "inputs" ? "Device inputs" : "Device outputs",
          instance: context.path + "/@" + direction,
          scope: context.path,
          domain: "audio",
          implementationKind: direction === "inputs" ? "interface-input" : "interface-output",
          inputs: direction === "outputs" ? context.outputs : [],
          outputs: direction === "inputs" ? context.inputs : [],
          parameters: [],
          sourceLinks: link(context.path, context.definition)
        });
    }
    const edges = [];
    for (const context of contexts) {
      const endpoint = (value) => {
        if (value.boundary) {
          if (context.root) {
            const node2 = nodes.find(
              (n) => n.instance === (value.boundary === "inputs" ? `${context.path}/inputs/${value.name}` : `/@outputs/${value.name}`)
            );
            return { id: node2.id, index: 0 };
          }
          return {
            id: graphCanvasId(context.path + "/@" + value.boundary),
            index: context[value.boundary].findIndex((p) => p.name === value.name)
          };
        }
        const child = context.nodes.find((n) => n.key === value.key), node = nodes.find((n) => n.id === child.id);
        return { id: child.id, index: node[value.direction].findIndex((p) => p.name === value.name) };
      };
      for (const edge of context.edges) {
        const from = endpoint(edge.from), to = endpoint(edge.to);
        edges.push({ from: from.id, outputPort: from.index, to: to.id, inputPort: to.index });
      }
    }
    return {
      audioNodes: nodes,
      audioEdges: edges,
      audioPalette: [
        ...new Map(
          contexts.filter((c) => !c.root).map((c) => [
            c.definition,
            {
              type: c.definition,
              label: c.label,
              kind: "audio-graph",
              inputs: c.inputs.length,
              outputs: c.outputs.length,
              parameters: 0,
              input_ports: c.inputs,
              output_ports: c.outputs
            }
          ])
        ).values()
      ]
    };
  }

  // packages/manifold-author/project-source.js
  function evaluateSource(source3, modules, legacyBindings, fail7) {
    const tree2 = parse3(source3, {
      ecmaVersion: 2022,
      sourceType: "module",
      allowReturnOutsideFunction: true
    });
    const isModule = tree2.body.some((node) => node.type.startsWith("Import") || node.type.startsWith("Export"));
    if (!isModule) return new Function("manifold", `"use strict";
${source3}
`)(legacyBindings);
    parse3(source3, { ecmaVersion: 2022, sourceType: "module" });
    const unsupported = (node) => {
      if (node.type === "ImportExpression" || node.type === "MetaProperty") {
        fail7("unsupported-import", "Live modules currently support static built-in imports; dynamic imports and import.meta need a module host");
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach((child) => {
          if (child?.type) unsupported(child);
        });
        else if (value?.type) unsupported(value);
      }
    };
    unsupported(tree2);
    let entry = "__manifoldProjectDefault";
    while (source3.includes(entry)) entry += "_";
    let resolver = "__manifoldResolveImport";
    while (source3.includes(resolver)) resolver += "_";
    const replacements = [];
    let hasDefault = false;
    for (const node of tree2.body) {
      if (node.type === "ImportDeclaration") {
        const name3 = node.source.value;
        if (!Object.hasOwn(modules, name3)) fail7("unsupported-import", `Live module ${name3} is unavailable; supported: ${Object.keys(modules).join(", ")}`);
        const bindings = modules[name3];
        const lines = node.specifiers.map((specifier) => {
          if (specifier.type === "ImportNamespaceSpecifier") return `const ${specifier.local.name} = ${resolver}(${JSON.stringify(name3)});`;
          const imported = specifier.type === "ImportDefaultSpecifier" ? "default" : specifier.imported.name ?? specifier.imported.value;
          if (!Object.hasOwn(bindings, imported)) fail7("unknown-import", `${name3} does not export ${imported}`);
          return `const ${specifier.local.name} = ${resolver}(${JSON.stringify(name3)})[${JSON.stringify(imported)}];`;
        });
        replacements.push({ start: node.start, end: node.end, text: lines.join("\n") });
      } else if (node.type === "ExportDefaultDeclaration") {
        hasDefault = true;
        const declaration = node.declaration;
        if (declaration.type === "FunctionDeclaration" && declaration.id) {
          replacements.push({ start: node.start, end: declaration.start, text: "" });
          replacements.push({ start: node.end, end: node.end, text: `
const ${entry} = ${declaration.id.name};` });
        } else {
          replacements.push({ start: node.start, end: declaration.start, text: `const ${entry} = ` });
          replacements.push({ start: node.end, end: node.end, text: ";" });
        }
      } else if (node.type === "ExportNamedDeclaration" && node.declaration) {
        replacements.push({ start: node.start, end: node.declaration.start, text: "" });
      } else if (node.type.startsWith("Export")) {
        fail7("unsupported-export", "Live modules use a default project factory and optional exported declarations; re-exports are not yet supported");
      }
    }
    if (!hasDefault) fail7("missing-project-export", "Export a default synchronous project factory");
    let body = source3;
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      body = body.slice(0, replacement.start) + replacement.text + body.slice(replacement.end);
    }
    const result = new Function(resolver, `"use strict";
${body}
return typeof ${entry} === 'function' ? ${entry}() : ${entry};`)((name3) => modules[name3]);
    if (result?.then) fail7("async-project", "Project factories must return synchronously; prepare resources through host services");
    return result;
  }

  // packages/manifold-author/midi-control.js
  function decodeMidiControl(data2, owner = "midi") {
    const status = data2[0], a = data2[1] ?? 0, b = data2[2] ?? 0;
    if (!Number.isInteger(status) || status < 128 || status >= 240) return null;
    const channel = status & 15, type = status & 240;
    if ([128, 144, 176, 224].includes(type) && (data2[1] === void 0 || data2[2] === void 0)) return null;
    if (!Number.isInteger(a) || a < 0 || a > 127 || !Number.isInteger(b) || b < 0 || b > 127) return null;
    if (type === 144 && b > 0) return { type: "note-on", note: a, velocity: b, channel, owner };
    if (type === 128 || type === 144) return { type: "note-off", note: a, channel, owner };
    if (type === 224) return { type: "pitch-bend", value: a | b << 7, channel, owner };
    if (type === 176 && a === 64) return { type: "sustain", down: b >= 64, channel, owner };
    if (type === 176 && a === 120) return { type: "panic", channel, owner };
    if (type === 176 && a === 123) return { type: "all-notes-off", channel, owner };
    return null;
  }

  // packages/manifold-author/midi-event.js
  function encodeMidiEvent(nodeId, event) {
    const kind = { noteOn: 0, noteOff: 1, allNotesOff: 2, pitchBend: 3 }[event?.type];
    if (!Number.isInteger(nodeId) || nodeId < 1 || kind === void 0)
      throw new Error("Use a declared MIDI input and a named MIDI event");
    let { channel = 0, note = 0, velocity = event.type === "noteOn" ? 100 : 0, offset: offset2 = 0 } = event;
    if (event.type === "pitchBend") {
      if (!Number.isInteger(event.value) || event.value < 0 || event.value > 16383)
        throw new Error("Pitch bend uses a 14-bit value from 0 to 16383; 8192 is the centre");
      note = event.value & 127;
      velocity = event.value >> 7;
    }
    if (!Number.isInteger(channel) || channel < 0 || channel > 15 || !Number.isInteger(note) || note < 0 || note > 127 || !Number.isInteger(velocity) || velocity < 0 || velocity > 127 || !Number.isInteger(offset2) || offset2 < 0 || offset2 > 4096)
      throw new Error("MIDI needs channel 0\u201315, note and velocity 0\u2013127, and frame offset 0\u20134096");
    return { nodeId, kind, channel, note, velocity, offset: offset2 };
  }

  // packages/manifold-author/device-midi.js
  var _notes, _pedals;
  var DeviceMidiInput = class {
    constructor() {
      __privateAdd(this, _notes, /* @__PURE__ */ new Map());
      __privateAdd(this, _pedals, /* @__PURE__ */ new Set());
    }
    async send(host, nodeId, event) {
      if (!event || typeof event !== "object") throw new Error("Expected a MIDI event");
      const { owner = "studio", channel = 0, offset: offset2 = 0 } = event;
      if (typeof owner !== "string" || !owner || owner.length > 128 || owner.includes("\0"))
        throw new Error("Give the performance input a short owner name");
      encodeMidiEvent(nodeId, { type: "noteOff", channel, offset: offset2 });
      const pedal = `${owner}\0${channel}`;
      const key = `${pedal}\0${event.note}`;
      const send = async (value) => {
        if (!host?.ready || !host.sendEvent) throw new Error("Start audio before playing MIDI");
        if (await host.sendEvent(encodeMidiEvent(nodeId, value)) === false)
          throw new Error("Audio host rejected the MIDI event");
      };
      const release = async (key2, note) => {
        const other = [...__privateGet(this, _notes)].some(
          ([id, n]) => id !== key2 && n.channel === note.channel && n.note === note.note
        );
        if (!other && host?.ready)
          await send({ type: "noteOff", note: note.note, channel: note.channel, offset: offset2 });
        __privateGet(this, _notes).delete(key2);
      };
      if (event.type === "note-on" && event.velocity !== 0) {
        if (!__privateGet(this, _notes).has(key) && __privateGet(this, _notes).size >= 512)
          throw new Error("Release held notes before adding another performance owner");
        await send({ ...event, type: "noteOn" });
        __privateGet(this, _notes).set(key, { owner, channel, note: event.note, held: true });
      } else if (event.type === "note-off" || event.type === "note-on") {
        encodeMidiEvent(nodeId, { ...event, type: "noteOff" });
        const note = __privateGet(this, _notes).get(key);
        if (!note) return;
        if (__privateGet(this, _pedals).has(pedal)) note.held = false;
        else await release(key, note);
      } else if (event.type === "sustain") {
        if (typeof event.down !== "boolean") throw new Error("Sustain needs a boolean down value");
        if (event.down) {
          if (__privateGet(this, _pedals).size >= 512 && !__privateGet(this, _pedals).has(pedal))
            throw new Error("Too many sustain owners");
          __privateGet(this, _pedals).add(pedal);
        } else {
          for (const [key2, note] of __privateGet(this, _notes))
            if (note.owner === owner && note.channel === channel && !note.held)
              await release(key2, note);
          __privateGet(this, _pedals).delete(pedal);
        }
      } else if (event.type === "panic" || event.type === "all-notes-off") {
        const matches = (note) => (event.owner === void 0 || note.owner === owner) && (event.channel === void 0 || note.channel === channel);
        for (const [key2, note] of __privateGet(this, _notes)) if (matches(note)) await release(key2, note);
        for (const pedal2 of __privateGet(this, _pedals)) {
          const [heldOwner, heldChannel] = pedal2.split("\0");
          if (matches({ owner: heldOwner, channel: Number(heldChannel) })) __privateGet(this, _pedals).delete(pedal2);
        }
      } else if (event.type === "pitch-bend") {
        await send({ ...event, type: "pitchBend" });
      } else throw new Error("Device MIDI supports notes, sustain, pitch bend and panic");
    }
  };
  _notes = new WeakMap();
  _pedals = new WeakMap();

  // packages/manifold-author/studio-graph.js
  var parsedSources = /* @__PURE__ */ new Map();
  function studioTree(source3) {
    if (parsedSources.has(source3)) return parsedSources.get(source3);
    const tree2 = parse3(source3, { ecmaVersion: 2022, sourceType: "module" });
    if (parsedSources.size >= 2) parsedSources.delete(parsedSources.keys().next().value);
    parsedSources.set(source3, tree2);
    return tree2;
  }
  function validateStudioModule(definition2) {
    if (!definition2 || typeof definition2 !== "object" || Array.isArray(definition2) || !/^[a-z][a-z0-9-]{0,63}$/.test(definition2.id ?? "") || typeof definition2.label !== "string" || !definition2.label.trim() || !Number.isInteger(definition2.version) || definition2.version < 1 || !Array.isArray(definition2.nodes) || definition2.nodes.length < 1 || !Array.isArray(definition2.connections) || !Array.isArray(definition2.inputs) || !Array.isArray(definition2.outputs) || !Array.isArray(definition2.parameters ?? []))
      throw new Error("Module needs an ID, label, version, 1\u201332 primitive nodes and declared ports");
    const keys = /* @__PURE__ */ new Set();
    for (const node of definition2.nodes) {
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(node.key ?? "") || keys.has(node.key) || typeof node.type !== "string") throw new Error("Module primitive keys must be unique names");
      keys.add(node.key);
    }
    for (const edge of definition2.connections) if (!keys.has(edge.from) || !keys.has(edge.to) || typeof edge.output !== "string" || typeof edge.input !== "string")
      throw new Error("Module cable must reference named primitive ports");
    for (const [ports, direction] of [[definition2.inputs, "input"], [definition2.outputs, "output"]]) {
      const names = /* @__PURE__ */ new Set();
      for (const port2 of ports) {
        if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(port2.name ?? "") || names.has(port2.name) || !keys.has(port2.node) || typeof port2.port !== "string")
          throw new Error(`Module ${direction} ports need unique names and primitive targets`);
        names.add(port2.name);
      }
    }
    for (const parameter2 of definition2.parameters ?? []) if (!keys.has(parameter2.node) || typeof parameter2.name !== "string" || typeof parameter2.parameter !== "string" || !Number.isFinite(parameter2.min) || !Number.isFinite(parameter2.max) || !Number.isFinite(parameter2.default)) throw new Error("Module parameters need valid primitive bindings");
    return structuredClone(definition2);
  }
  function applyStudioGraph(graph, edits) {
    for (const path of edits.removed ?? []) {
      const node = graph.findInstance(path);
      if (!node) throw new Error(`Unknown graph instance ${path}`);
      graph.remove(node);
    }
    for (const { type, id, path } of edits.nodes ?? []) {
      const node = graph.add(type, { id });
      graph.registerInstance(path, node);
    }
    const modules = /* @__PURE__ */ new Map();
    for (const item of edits.modules ?? []) {
      const definition2 = validateStudioModule(item.definition);
      const children = /* @__PURE__ */ new Map();
      for (const [index, node] of definition2.nodes.entries()) {
        const handle = graph.add(node.type, { id: item.id + index, config: node.config ?? {} });
        graph.registerInstance(`${item.path}/${node.key}`, handle);
        children.set(node.key, handle);
      }
      for (const edge of definition2.connections)
        graph.connect(children.get(edge.from).output(edge.output), children.get(edge.to).input(edge.input));
      for (const parameter2 of definition2.parameters ?? []) {
        children.get(parameter2.node).parameter(parameter2.parameter).expose({
          path: `${item.path}/${parameter2.name}`,
          label: parameter2.label ?? parameter2.name,
          min: parameter2.min,
          max: parameter2.max,
          default: parameter2.default,
          ...parameter2.choices ? { choices: parameter2.choices } : {}
        });
      }
      modules.set(item.path, { definition: definition2, children });
    }
    const audioGraphs = applyAudioGraphs(graph, edits.audioGraphs);
    const reference2 = (path, direction, port2) => {
      if (audioGraphs.has(path)) return audioGraphs.get(path)[direction === "inputs" ? "input" : "output"](port2);
      const module = modules.get(path);
      if (module) {
        const binding = module.definition[direction].find((item) => item.name === port2);
        if (!binding) throw new Error(`Unknown module port ${path}:${port2}`);
        return module.children.get(binding.node)[direction === "inputs" ? "input" : "output"](binding.port);
      }
      const instance = path === "@input" ? graph.input : path === "@output" ? graph.output : graph.findInstance(path);
      if (!instance) throw new Error(`Unknown graph instance ${path}`);
      return instance[direction === "inputs" ? "input" : "output"](port2);
    };
    for (const edge of edits.connections ?? []) {
      const input = reference2(edge.to, "inputs", edge.input);
      if (!input) continue;
      graph.disconnect(input);
      if (edge.from !== null) {
        const output2 = reference2(edge.from, "outputs", edge.output);
        if (output2) graph.connect(output2, input);
      }
    }
    return graph;
  }
  function literal2(node) {
    if (node.type === "Literal") return node.value;
    if (node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+") && node.argument.type === "Literal" && typeof node.argument.value === "number")
      return node.operator === "-" ? -node.argument.value : node.argument.value;
    if (node.type === "ArrayExpression") return node.elements.map(literal2);
    if (node.type === "ObjectExpression") return Object.fromEntries(node.properties.map((property2) => {
      if (property2.type !== "Property" || property2.computed || property2.method || property2.kind !== "init")
        throw new Error("Visual graph edits require a literal studioGraph declaration");
      return [property2.key.name ?? property2.key.value, literal2(property2.value)];
    }));
    throw new Error("Visual graph edits require a literal studioGraph declaration");
  }
  function readStudioGraph(source3) {
    const tree2 = studioTree(source3);
    const declaration = tree2.body.flatMap((node) => node.declarations ?? []).find((node) => node.id.name === "studioGraph");
    if (!declaration?.init) throw new Error("Add a literal studioGraph declaration and call applyStudioGraph(graph, studioGraph) before returning your project");
    let applied = false;
    const walk2 = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "CallExpression" && node.callee?.name === "applyStudioGraph" && node.arguments?.[1]?.name === "studioGraph") applied = true;
      for (const value2 of Object.values(node)) {
        if (Array.isArray(value2)) value2.forEach(walk2);
        else if (value2 && typeof value2 === "object") walk2(value2);
      }
    };
    walk2(tree2);
    if (!applied) throw new Error("Call applyStudioGraph(graph, studioGraph) in the project factory before returning the graph");
    const value = literal2(declaration.init);
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("studioGraph must be an object");
    for (const key of ["nodes", "connections", "removed", "layout"]) {
      if (!Array.isArray(value[key])) throw new Error(`studioGraph.${key} must be an array`);
    }
    return { declaration, value };
  }
  function studioGraphMetadataOnly(source3) {
    const tree2 = studioTree(source3);
    let safe = true;
    const walk2 = (node, parent) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "Identifier" && node.name === "studioGraph") {
        const declaration = parent?.type === "VariableDeclarator" && parent.id === node;
        const graphApplication = parent?.type === "CallExpression" && parent.callee?.name === "applyStudioGraph" && parent.arguments?.[1] === node;
        const editorSnapshot = parent?.type === "Property" && parent.value === node && !parent.computed && (parent.key?.name ?? parent.key?.value) === "editorGraph";
        if (!declaration && !graphApplication && !editorSnapshot) safe = false;
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach((child) => walk2(child, node));
        else if (value && typeof value === "object") walk2(value, node);
      }
    };
    walk2(tree2, null);
    return safe;
  }
  function planStudioGraphEdit(source3, command, project) {
    const { declaration, value } = readStudioGraph(source3);
    const next = structuredClone(value);
    next.modules ?? (next.modules = []);
    next.groups ?? (next.groups = []);
    if (editAudioGraphs(next, command, project)) {
      return source3.slice(0, declaration.init.start) + JSON.stringify(next, null, 2) + source3.slice(declaration.init.end);
    }
    const pathOf = (id) => id === 1 ? "@input" : id === 3 ? "@output" : project.instances?.find((item) => item.nodeId === id)?.path;
    const placement = () => {
      if (command.x === void 0 !== (command.y === void 0)) throw new Error("Provide both graph position coordinates");
      if (command.x === void 0) return null;
      const values = [command.x, command.y];
      const world = command.space === "world";
      if (command.space && !world) throw new Error("Unknown graph position space");
      if (!values.every((value2) => typeof value2 === "number" && Number.isFinite(value2) && (world ? Math.abs(value2) <= 1e6 : value2 >= 0 && value2 <= 1)))
        throw new Error(world ? "Graph position exceeds the supported world range" : "Graph position must be within the canvas");
      return { x: command.x, y: command.y, ...world ? { space: "world" } : {} };
    };
    if (command.operation === "graph.add") {
      const id = command.id ?? project.signal.nodes.reduce((last, node) => Math.max(last, node.id), 3) + 1;
      const path = command.path ?? `/studio/${command.type}/${id}`;
      if (!Number.isInteger(id) || id < 4 || id > 4294967295) throw new Error("Use an available graph node ID in the unsigned 32-bit node ID format");
      if (project.signal.nodes.some((node) => node.id === id) || project.instances?.some((item) => item.path === path)) throw new Error("Graph node ID or path already exists");
      next.nodes.push({ type: command.type, id, path });
      const point = placement();
      if (point) next.layout.push({ path, ...point });
    } else if (command.operation === "graph.addModule") {
      const definition2 = validateStudioModule(command.definition);
      const id = command.id ?? project.signal.nodes.reduce((last, node) => Math.max(last, node.id), 3) + 1;
      const path = command.path ?? `/studio/${definition2.id}/${id}`;
      if (!Number.isInteger(id) || id < 4 || id + definition2.nodes.length - 1 > 4294967295 || project.signal.nodes.some((node) => node.id >= id && node.id < id + definition2.nodes.length) || project.instances?.some((item) => item.path === path)) throw new Error("Module needs unused graph IDs and a unique path");
      next.modules.push({ id, path, definition: definition2 });
      const point = placement();
      if (point) for (const [index, node] of definition2.nodes.entries())
        next.layout.push({
          path: `${path}/${node.key}`,
          x: point.x + (point.space === "world" ? index * 220 : 0),
          y: point.y,
          ...point.space ? { space: point.space } : {}
        });
    } else if (command.operation === "graph.remove") {
      const id = command.id;
      const module = next.modules.find((item) => id >= item.id && id < item.id + item.definition.nodes.length);
      if (module) {
        next.modules = next.modules.filter((item) => item !== module);
        next.connections = next.connections.filter((edge) => edge.from !== module.path && edge.to !== module.path);
        next.layout = next.layout.filter((item) => item.path !== module.path && !item.path.startsWith(`${module.path}/`));
        next.groups = next.groups.map((group) => ({ ...group, paths: group.paths.filter((path2) => !path2.startsWith(`${module.path}/`)) })).filter((group) => group.paths.length > 1);
        return source3.slice(0, declaration.init.start) + JSON.stringify(next, null, 2) + source3.slice(declaration.init.end);
      }
      const path = pathOf(id);
      if (!path || id === 1 || id === 3) throw new Error("Select a removable named graph node");
      const added = next.nodes.some((node) => node.path === path);
      next.nodes = next.nodes.filter((node) => node.path !== path);
      next.connections = next.connections.filter((edge) => edge.from !== path && edge.to !== path);
      next.layout = next.layout.filter((item) => item.path !== path);
      next.groups = next.groups.map((group) => ({ ...group, paths: group.paths.filter((member3) => member3 !== path) })).filter((group) => group.paths.length > 1);
      if (!added && !next.removed.includes(path)) next.removed.push(path);
    } else if (command.operation === "graph.connect" || command.operation === "graph.disconnect") {
      const to = command.to, input = command.input;
      if (typeof to !== "string" || typeof input !== "string") throw new Error("Use named graph ports");
      next.connections = next.connections.filter((edge) => edge.to !== to || edge.input !== input);
      next.connections.push(command.operation === "graph.disconnect" ? { to, input, from: null } : { from: command.from, output: command.output, to, input });
    } else if (command.operation === "graph.position") {
      const path = command.path;
      if (!project.instances?.some((item) => item.path === path) && !next.modules.some((item) => item.path === path) && !project.signal.nodes.some((node) => path === `/${node.type}/${node.id}`)) throw new Error("Unknown graph instance");
      const point = placement();
      if (!point) throw new Error("Provide both graph position coordinates");
      next.layout = [...next.layout.filter((item) => item.path !== path), { path, ...point }];
    } else if (command.operation === "graph.group") {
      const paths = command.paths;
      if (!Array.isArray(paths) || paths.length < 2 || new Set(paths).size !== paths.length || !paths.every((path) => typeof path === "string" && project.instances?.some((item) => item.path === path)))
        throw new Error("Group needs 2\u201364 distinct named graph nodes");
      const label2 = String(command.label ?? "").trim();
      if (!label2 || label2.length > 64) throw new Error("Group label must be 1\u201364 characters");
      const used = new Set(next.groups.map((group) => group.id));
      let index = 1;
      while (used.has(`group-${index}`)) index++;
      next.groups.push({ id: `group-${index}`, label: label2, paths });
    } else if (command.operation === "graph.ungroup") {
      if (typeof command.id !== "string" || !next.groups.some((group) => group.id === command.id))
        throw new Error("Unknown graph group");
      next.groups = next.groups.filter((group) => group.id !== command.id);
    } else throw new Error(`Unknown graph edit ${command.operation}`);
    return source3.slice(0, declaration.init.start) + JSON.stringify(next, null, 2) + source3.slice(declaration.init.end);
  }

  // packages/manifold-author/studio-source.js
  function literal3(node) {
    if (node.type === "Literal") return node.value;
    if (node.type === "UnaryExpression" && node.operator === "-") return -literal3(node.argument);
    if (node.type === "ArrayExpression") return node.elements.map(literal3);
    if (node.type === "ObjectExpression") return Object.fromEntries(node.properties.map((property2) => {
      if (property2.type !== "Property" || property2.computed || property2.method || property2.kind !== "init")
        throw new Error("Visual editing requires literal declarations");
      return [property2.key.name ?? property2.key.value, literal3(property2.value)];
    }));
    throw new Error("Visual editing requires literal declarations; edit this expression in source");
  }
  function readStudioParameters(source3) {
    const tree2 = parse3(source3, { ecmaVersion: 2022, sourceType: "module" });
    const definition2 = tree2.body.flatMap((node) => node.declarations ?? []).find((node) => node.id.name === "studioParameters");
    if (!definition2?.init) throw new Error("This project needs a studioParameters declaration for visual exposure");
    return { definition: definition2, values: literal3(definition2.init) };
  }
  function exposeStudioParameter(source3, definition2) {
    const { definition: declaration, values } = readStudioParameters(source3);
    if (values.some((value) => value.path === definition2.path)) throw new Error("This parameter path already exists");
    const { instance, parameter: parameter2, path, label: label2, min, max, default: initial, choices, choiceValues } = definition2;
    const named2 = { instance, parameter: parameter2, path, label: label2, min, max, default: initial, ...choices?.length ? { choices, ...choiceValues ? { choiceValues } : {} } : {} };
    return source3.slice(0, declaration.init.start) + JSON.stringify([...values, named2], null, 2) + source3.slice(declaration.init.end);
  }
  function editStudioLayout(source3, layout, command) {
    let next;
    if (command.operation === "presentation.insert") {
      if (layout.some((item) => item.path === command.path)) throw new Error("This parameter is already placed in the face");
      next = [...layout, {
        id: command.id ?? command.path,
        path: command.path,
        x: command.x ?? 3,
        y: command.y ?? 35,
        width: command.width ?? 30,
        label: command.label ?? "",
        accent: command.accent ?? "#dfae77"
      }];
    } else {
      if (!layout.some((item) => (item.id ?? item.path) === command.id)) throw new Error("Unknown presentation component");
      const allowed = ["x", "y", "width", "label", "accent", "compact"];
      if (Object.keys(command.changes ?? {}).some((key) => !allowed.includes(key))) throw new Error("Unsupported presentation property");
      next = layout.map((item) => (item.id ?? item.path) === command.id ? { ...item, ...command.changes } : item);
    }
    return replacePresentationLayout(source3, next);
  }

  // packages/manifold-author/device-source.js
  var definitions = { lowPassFilter, ...primitives_exports };
  var quote = (value) => JSON.stringify(value);
  var objectCode = (value) => "{ " + Object.entries(value).map(([key, value2]) => `${key}: ${JSON.stringify(value2)}`).join(", ") + " }";
  function compactGaps(source3) {
    const tree2 = parse3(source3, { ecmaVersion: 2022, sourceType: "module" }), edits = [];
    let end = 0;
    for (const node of tree2.body) {
      const gap = source3.slice(end, node.start);
      if (/^\s*$/.test(gap) && gap.includes("\n\n\n"))
        edits.push({ start: end, end: node.start, text: "\n\n" });
      end = node.end;
    }
    return replace(source3, edits);
  }
  var access = (base, key) => /^[a-zA-Z_$][\w$]*$/.test(key) ? `${base}.${key}` : `${base}[${quote(key)}]`;
  var fail4 = (message) => {
    throw new Error(message);
  };
  var member = (node, name3) => node?.type === "MemberExpression" && !node.computed && node.property.name === name3;
  var field = (node, name3) => node?.properties?.find((p) => !p.computed && (p.key.name ?? p.key.value) === name3)?.value;
  var baseCall = (node) => node?.type === "CallExpression" && member(node.callee, "configure") ? node.callee.object : node;
  var statements = (tree2) => tree2.body.map((node) => ({
    statement: node,
    node: node.type === "ExportNamedDeclaration" ? node.declaration : node
  }));
  var replace = (source3, edits) => edits.sort((a, b) => b.start - a.start || b.end - a.end).reduce((text, e) => text.slice(0, e.start) + e.text + text.slice(e.end), source3);
  var uses = (node, name3) => {
    if (!node?.type) return false;
    if (node.type === "Identifier" && node.name === name3) return true;
    return Object.entries(node).some(
      ([key, value]) => !["start", "end"].includes(key) && (Array.isArray(value) ? value.some((n) => uses(n, name3)) : uses(value, name3))
    );
  };
  function readDeviceSource(source3) {
    const tree2 = parse3(source3, { ecmaVersion: 2022, sourceType: "module" });
    const imports = /* @__PURE__ */ new Map(), factories = /* @__PURE__ */ new Set(), names = /* @__PURE__ */ new Set();
    for (const node of tree2.body)
      if (node.type === "ImportDeclaration" && node.source.value === "manifold") {
        for (const spec of node.specifiers)
          if (spec.type === "ImportSpecifier") {
            imports.set(spec.imported.name, spec.local.name);
            names.add(spec.local.name);
            if (["createDevice", "createEffect", "createInstrument"].includes(spec.imported.name))
              factories.add(spec.local.name);
          }
      }
    const devices2 = /* @__PURE__ */ new Map(), variables = /* @__PURE__ */ new Map(), calls = [];
    for (const { statement, node } of statements(tree2)) {
      for (const declaration of node?.declarations ?? []) {
        if (declaration.id.type !== "Identifier") continue;
        const name3 = declaration.id.name;
        names.add(name3);
        const call2 = baseCall(declaration.init);
        variables.set(name3, { name: name3, statement, declaration, call: call2 });
        if (call2?.type === "CallExpression" && factories.has(call2.callee.name)) {
          const id = field(call2.arguments[0], "id")?.value;
          if (typeof id === "string")
            devices2.set(name3, { name: name3, id, statement, declaration, nodes: /* @__PURE__ */ new Map() });
        }
      }
      const call = node?.type === "ExpressionStatement" ? node.expression : node?.declarations?.length === 1 ? node.declarations[0].init : null;
      if (call?.type === "CallExpression") calls.push({ call, statement, node });
    }
    for (const variable of variables.values())
      if (member(variable.call?.callee, "add")) {
        const device = devices2.get(variable.call.callee.object.name), key = variable.call.arguments[0]?.value;
        if (device && typeof key === "string") device.nodes.set(key, variable);
      }
    const exported = tree2.body.find((n) => n.type === "ExportDefaultDeclaration");
    const root = devices2.get(exported?.declaration?.name);
    if (!root)
      fail4(
        "Edit this project in source: graph tools need an explicit top-level Device declaration and default export"
      );
    return { tree: tree2, imports, devices: devices2, variables, calls, names, root };
  }
  function planDeviceEdit(source3, command, project, editor) {
    const model = readDeviceSource(source3), edits = [], additions = [], identityMoves = [];
    const text = (node) => source3.slice(node.start, node.end);
    const fresh = (preferred) => {
      const base = preferred.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9_$]/g, "_").replace(/^[0-9]/, "_$&") || "processor";
      let name3 = base, n = 2;
      while (model.names.has(name3)) name3 = base + n++;
      model.names.add(name3);
      return name3;
    };
    const importName = (name3) => {
      if (model.imports.has(name3)) return model.imports.get(name3);
      const local = fresh(name3);
      model.imports.set(name3, local);
      additions.push(`${name3}${local === name3 ? "" : ` as ${local}`}`);
      return local;
    };
    const contexts = editor.deviceHierarchy;
    const rootContext = contexts.find((c) => c.root);
    const context = command.scope ? contexts.find((c) => c.path === command.scope || c.definition === command.scope) : command.operation === "graph.wrap" ? contexts.find((c) => c.nodes.some((n) => n.id === command.ids?.[0])) : rootContext;
    if (!context) fail4("Unknown Device graph scope");
    const device = [...model.devices.values()].find((d) => d.id === context.definition);
    if (!device) fail4("This Device is built dynamically; edit its declaration in source");
    const insert = (code, at2 = device.statement.end) => edits.push({ start: at2, end: at2, text: "\n" + code + "\n" });
    const drop = (statement) => {
      if (!edits.some((e) => e.start === statement.start && e.end === statement.end))
        edits.push({ start: statement.start, end: statement.end, text: "" });
    };
    const ownerContext = (path) => contexts.find((c) => c.nodes.some((n) => n.path === path));
    const nodeAt = (path) => {
      const c = ownerContext(path), d = [...model.devices.values()].find((d2) => d2.id === c?.definition);
      const key = c?.nodes.find((n) => n.path === path)?.key;
      const node = d?.nodes.get(key);
      if (!node) fail4("This node is built dynamically; edit its declaration in source");
      if ((node.statement.declaration ?? node.statement).declarations?.length !== 1)
        fail4("Split combined variable declarations before editing this node visually");
      return { ...node, device: d, context: c, key };
    };
    const portExpression = (path, direction, port2) => {
      if (path.startsWith("/@outputs/"))
        return access(`${model.root.name}.outputs`, path.slice("/@outputs/".length));
      const boundaryContext = contexts.find(
        (c) => path === `${c.path}/@inputs` || path === `${c.path}/@outputs`
      );
      if (boundaryContext) {
        const d = [...model.devices.values()].find((d2) => d2.id === boundaryContext.definition);
        return access(`${d.name}.${direction === "outputs" ? "inputs" : "outputs"}`, port2);
      }
      const input = rootContext.inputs.find((p) => path === `${rootContext.path}/inputs/${p.name}`);
      if (input) return access(`${model.root.name}.inputs`, input.name);
      return access(`${nodeAt(path).name}.${direction}`, port2);
    };
    const normalized = (value) => value.replace(/\[['"]([\w-]+)['"]\]/g, ".$1").replace(/\s/g, "");
    const canonical = (node, seen = /* @__PURE__ */ new Set()) => {
      if (node?.type === "Identifier" && !seen.has(node.name)) {
        const variable = model.variables.get(node.name);
        if (variable) {
          const call = variable.declaration.init;
          for (const [method, direction] of [
            ["input", "inputs"],
            ["output", "outputs"]
          ])
            if (member(call?.callee, method) && typeof call.arguments[0]?.value === "string")
              return normalized(
                access(call.callee.object.name + "." + direction, call.arguments[0].value)
              );
          if (call?.type === "Identifier" || call?.type === "MemberExpression")
            return canonical(call, /* @__PURE__ */ new Set([...seen, node.name]));
        }
      }
      return normalized(text(node));
    };
    const point = (nodeName) => {
      if (command.x === void 0 && command.y === void 0) return "";
      if (![command.x, command.y].every(Number.isFinite)) fail4("Provide both graph coordinates");
      return `${device.name}.place(${nodeName}, ${JSON.stringify({ x: command.x, y: command.y, space: "world" })});`;
    };
    const addInstance = (definitionName, keyBase) => {
      if (command.id !== void 0)
        fail4("Device source owns numeric allocation; provide a named path or omit identity");
      if (command.label !== void 0) fail4("Edit the Device display name in source");
      const prefix = context.path + "/processors/";
      if (command.path !== void 0 && (!command.path.startsWith(prefix) || !/^[A-Za-z0-9_-]{1,64}$/.test(command.path.slice(prefix.length))))
        fail4("Use a Device instance path under " + prefix);
      if (command.path !== void 0 && device.nodes.has(command.path.slice(prefix.length)))
        fail4("Device instance path already exists");
      let key = command.path?.slice(prefix.length) ?? keyBase, n = 2;
      while (device.nodes.has(key)) key = keyBase + "-" + n++;
      const name3 = fresh(
        {
          lowPassFilter: "filter",
          gain: "level",
          phaseVocoder: "spectral",
          voiceSynth: "voice",
          ringModulator: "modulator"
        }[keyBase] ?? keyBase + "Node"
      );
      insert(`const ${name3} = ${device.name}.add(${quote(key)}, ${definitionName});
${point(name3)}`);
    };
    if (command.operation === "graph.add") {
      const entry = Object.entries(definitions).find(([, d]) => d.type === command.type);
      if (!entry) fail4("Unknown processor definition");
      addInstance(importName(entry[0]), entry[0]);
    } else if (command.operation === "graph.addModule") {
      const module = validateStudioModule(command.definition);
      let definitionId = module.id, index = 2;
      while ([...model.devices.values()].some((d) => d.id === definitionId))
        definitionId = module.id + "-" + index++;
      const local = fresh(definitionId + "Device"), factory = importName("createDevice");
      const nodes = new Map(module.nodes.map((node) => [node.key, { local: fresh(node.key), node }]));
      const lines = [
        `// ${module.label}, module version ${module.version}.`,
        `const ${local} = ${factory}(${JSON.stringify({ id: definitionId, name: module.label })});`
      ];
      for (const { local: name3, node } of nodes.values()) {
        const entry = Object.entries(definitions).find(([, d]) => d.type === node.type);
        if (!entry) fail4("Unknown module processor");
        lines.push(
          `const ${name3} = ${local}.add(${quote(node.key)}, ${importName(entry[0])}${node.config ? ", " + JSON.stringify({ config: node.config }) : ""});`
        );
      }
      for (const [direction, method] of [
        ["inputs", "input"],
        ["outputs", "output"]
      ])
        for (const port2 of module[direction]) {
          const child = nodes.get(port2.node), spec = Object.values(definitions).find((d) => d.type === child.node.type);
          const signal = spec[direction].find((p) => p.name === port2.port)?.signal;
          if (signal !== "audio" && (signal !== "midi" || direction === "outputs"))
            fail4(
              "Device modules currently expose audio inputs/outputs and MIDI inputs; retain this module in its expert graph"
            );
          const kind = importName(signal === "midi" ? "midi" : "audio") + (signal === "midi" ? ".events" : ".stereo");
          lines.push(`${local}.${method}(${quote(port2.name)}, ${kind});`);
          const boundary = access(`${local}.${direction}`, port2.name), processor = access(`${child.local}.${direction}`, port2.port);
          lines.push(
            `${local}.connect(${direction === "inputs" ? boundary : processor}, ${direction === "inputs" ? processor : boundary});`
          );
        }
      for (const wire of module.connections)
        lines.push(
          `${local}.connect(${access(nodes.get(wire.from).local + ".outputs", wire.output)}, ${access(nodes.get(wire.to).local + ".inputs", wire.input)});`
        );
      for (const control of module.parameters ?? []) {
        const options = {
          label: control.label ?? control.name,
          min: control.min,
          max: control.max,
          default: control.default
        };
        lines.push(
          `${local}.control(${quote(control.name)}, ${access(nodes.get(control.node).local + ".parameters", control.parameter)}, ${JSON.stringify(options, null, 2)});`
        );
      }
      edits.push({
        start: device.statement.start,
        end: device.statement.start,
        text: lines.join("\n") + "\n\n"
      });
      addInstance(local, definitionId);
    } else if (command.operation === "graph.addInstance") {
      const definition2 = [...model.devices.values()].find((d) => d.id === command.definitionId);
      if (!definition2) fail4("Unknown reusable Device definition");
      addInstance(definition2.name, definition2.id);
    } else if (["graph.connect", "graph.disconnect"].includes(command.operation)) {
      const target = portExpression(command.to, "inputs", command.input);
      for (const entry of model.calls)
        if (member(entry.call.callee, "connect") && canonical(entry.call.arguments[1]) === normalized(target))
          drop(entry.statement);
      if (command.operation === "graph.connect") {
        const from = portExpression(command.from, "outputs", command.output);
        const targetContext = ownerContext(command.to) ?? (command.to.startsWith("/@outputs/") ? rootContext : contexts.find((c) => command.to.startsWith(c.path + "/@")));
        const d = [...model.devices.values()].find((d2) => d2.id === targetContext?.definition) ?? device;
        insert(
          `${d.name}.connect(${from}, ${target});`,
          model.tree.body.find((n) => n.type === "ExportDefaultDeclaration").start
        );
      }
    } else if (command.operation === "graph.position") {
      const node = nodeAt(command.path);
      for (const entry of model.calls)
        if (member(entry.call.callee, "place") && entry.call.arguments[0]?.name === node.name)
          drop(entry.statement);
      insert(
        `${node.device.name}.place(${node.name}, ${JSON.stringify({ x: command.x, y: command.y, space: "world" })});`,
        node.statement.end
      );
    } else if (command.operation === "parameter.expose") {
      const definition2 = command.definition, node = nodeAt(definition2.instance);
      const key = definition2.path.replace(/^\//, "");
      if (!/^[\w-]+$/.test(key)) fail4("Give this Device control a simple path such as /brightness");
      const options = Object.fromEntries(
        ["label", "min", "max", "default", "unit"].filter((k) => definition2[k] !== void 0).map((k) => [k, definition2[k]])
      );
      insert(
        `${node.device.name}.control(${quote(key)}, ${node.name}.parameters[${quote(definition2.parameter)}], ${JSON.stringify(options, null, 2)});`,
        node.statement.end
      );
    } else if (command.operation === "graph.remove") {
      const path = project.instances?.find((n) => n.nodeId === command.id)?.path ?? contexts.find((c) => !c.root && graphCanvasId(c.path) === command.id)?.path;
      const node = nodeAt(path);
      for (const { statement, node: statementNode } of statements(model.tree))
        if (uses(statementNode, node.name)) {
          const entry = model.calls.find((c) => c.statement === statement);
          const allowed = statement === node.statement || entry && ["connect", "control", "place", "configure", "group"].some(
            (m) => member(entry.call.callee, m)
          );
          if (!allowed)
            fail4(`The variable ${node.name} is used by custom logic; remove it in source`);
          drop(statement);
        }
    } else if (command.operation === "graph.wrap") {
      wrapDevice({
        source: source3,
        command,
        model,
        context,
        device,
        project,
        edits,
        importName,
        fresh,
        nodeAt,
        identityMoves,
        contexts
      });
    } else if (command.operation === "graph.group") {
      const members = (command.paths ?? []).map(nodeAt);
      if (members.length < 2 || members.some((n) => n.device !== members[0].device))
        fail4("Group processors in the same Device");
      let key = "group", index = 2;
      while (editor.groups.some((g) => g.id.endsWith("/" + key))) key = "group-" + index++;
      insert(
        `${members[0].device.name}.group(${quote(key)}, [${members.map((n) => n.name).join(", ")}], ${JSON.stringify({ label: command.label })});`,
        model.tree.body.find((n) => n.type === "ExportDefaultDeclaration").start
      );
    } else if (command.operation === "graph.ungroup") {
      const key = command.id?.split("/").at(-1), path = command.id?.slice(0, -key.length - 1);
      const c = contexts.find((c2) => c2.path === path), d = [...model.devices.values()].find((d2) => d2.id === c?.definition);
      const entry = model.calls.find(
        (e) => member(e.call.callee, "group") && e.call.callee.object.name === d?.name && e.call.arguments[0]?.value === key
      );
      if (!entry) fail4("Unknown Device group");
      drop(entry.statement);
    } else fail4("This operation needs source editing for a Device project");
    if (additions.length) {
      const existing = model.tree.body.find(
        (n) => n.type === "ImportDeclaration" && n.source.value === "manifold" && n.specifiers.every((s) => s.type === "ImportSpecifier")
      );
      if (existing) {
        const names = existing.specifiers.map(
          (s) => s.imported.name + (s.local.name === s.imported.name ? "" : ` as ${s.local.name}`)
        );
        edits.push({
          start: existing.start,
          end: existing.end,
          text: `import { ${[...names, ...additions].join(", ")} } from 'manifold';`
        });
      } else
        edits.push({
          start: 0,
          end: 0,
          text: `import { ${additions.join(", ")} } from 'manifold';
`
        });
    }
    return { source: compactGaps(replace(source3, edits)), identityMoves };
  }
  function wrapDevice({
    source: source3,
    command,
    model,
    context,
    device,
    project,
    edits,
    importName,
    fresh,
    nodeAt,
    identityMoves,
    contexts
  }) {
    const paths = (command.ids ?? []).map((id) => context.nodes.find((n) => n.id === id)?.path);
    if (!paths.length || paths.some((p) => !p || !context.nodes.some((n) => n.path === p)))
      fail4("Select processors from one Device graph");
    const selected = paths.map(nodeAt), names = new Set(selected.map((n) => n.name));
    const label2 = String(command.label ?? "Sound design").trim();
    const key = command.definitionId ?? (label2.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sound-design");
    if (device.nodes.has(key)) fail4("Choose a new Device name");
    const definition2 = fresh(key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + "Device");
    const instance = fresh(key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
    const factory = importName("createDevice"), audioName = () => importName("audio"), midiName = () => importName("midi");
    const inner = [], outer = [], inputs = [], outputs = [];
    const code = (n) => source3.slice(n.start, n.end);
    const selectedPort = (node) => node?.type === "MemberExpression" && node.object?.type === "MemberExpression" && names.has(node.object.object?.name);
    const signal = (node) => {
      const variable = selected.find((n) => n.name === node.object.object.name);
      const childContext = contexts.find((c) => c.path === paths[selected.indexOf(variable)]);
      const portName = node.computed ? node.property.value : node.property.name;
      const direction = node.object.property.name;
      if (childContext) return childContext[direction].find((p) => p.name === portName)?.signal;
      const id = project.instances.find((n) => n.path === paths[selected.indexOf(variable)]).nodeId;
      const type = project.signal.nodes.find((n) => n.id === id).type;
      return Object.values(definitions).find((d) => d.type === type)[direction].find((p) => p.name === portName)?.signal;
    };
    const boundary = (list2, expression, domain) => {
      let entry = list2.find((p) => p.expression === expression);
      if (!entry) {
        const name3 = domain === "midi" ? "midi" : "audio";
        entry = { expression, name: list2.length ? name3 + (list2.length + 1) : name3, domain };
        list2.push(entry);
      }
      return entry.name;
    };
    for (const { statement, node } of statements(model.tree)) {
      if (![...names].some((name3) => uses(node, name3))) continue;
      const entry = model.calls.find((c) => c.statement === statement), call = entry?.call;
      if (selected.some((n) => n.statement === statement))
        inner.push(code(statement).replace(`${device.name}.add`, `${definition2}.add`));
      else if (member(call?.callee, "configure") && names.has(call.callee.object.name))
        inner.push(code(statement));
      else if (member(call?.callee, "place"))
        inner.push(code(statement).replace(`${device.name}.place`, `${definition2}.place`));
      else if (member(call?.callee, "control")) {
        const controlKey = call.arguments[0]?.value;
        if (typeof controlKey !== "string") fail4("Wrap requires named control declarations");
        inner.push(`${definition2}.control(${call.arguments.map(code).join(", ")});`);
        const declaration = entry.node.declarations?.[0];
        outer.push(
          `${declaration ? `const ${declaration.id.name} = ` : ""}${device.name}.control(${quote(controlKey)}, ${access(instance + ".controls", controlKey)});`
        );
      } else if (member(call?.callee, "connect")) {
        const [from, to] = call.arguments, fromInside = selectedPort(from), toInside = selectedPort(to);
        if (fromInside && toInside) inner.push(`${definition2}.connect(${code(from)}, ${code(to)});`);
        else if (toInside) {
          const domain = signal(to);
          if (!["audio", "midi"].includes(domain))
            fail4("Wrap supports audio and MIDI boundaries; edit other interfaces in source");
          const port2 = boundary(inputs, code(from), domain);
          inner.push(`${definition2}.connect(${access(definition2 + ".inputs", port2)}, ${code(to)});`);
        } else if (fromInside) {
          const domain = signal(from);
          if (domain !== "audio") fail4("Device outputs currently support audio");
          const port2 = boundary(outputs, code(from), domain);
          outer.push(`${device.name}.connect(${access(instance + ".outputs", port2)}, ${code(to)});`);
        } else fail4("Wrap cannot infer this custom connection; edit it in source");
      } else
        fail4("Selected processors have custom logic; extract that logic in source before wrapping");
      edits.push({ start: statement.start, end: statement.end, text: "" });
    }
    const boundaries = [
      ...inputs.map(
        (p) => `${definition2}.input(${quote(p.name)}, ${p.domain === "midi" ? midiName() + ".events" : audioName() + ".stereo"});`
      ),
      ...outputs.map((p) => `${definition2}.output(${quote(p.name)}, ${audioName()}.stereo);`)
    ];
    inner.push(
      ...outputs.map(
        (p) => `${definition2}.connect(${p.expression}, ${access(definition2 + ".outputs", p.name)});`
      )
    );
    outer.unshift(
      ...inputs.map(
        (p) => `${device.name}.connect(${p.expression}, ${access(instance + ".inputs", p.name)});`
      )
    );
    edits.push({
      start: device.statement.start,
      end: device.statement.start,
      text: `const ${definition2} = ${factory}(${objectCode({ id: key, name: label2 })});
${boundaries.join("\n")}
${inner.join("\n")}

`
    });
    const exportAt = Math.min(
      model.tree.body.find((n) => n.type === "ExportDefaultDeclaration").start,
      ...[...model.variables.values()].filter((v) => member(v.call?.callee, "add") && v.call.arguments[1]?.name === device.name).map((v) => v.statement.start)
    );
    for (const c of contexts.filter((c2) => c2.definition === context.definition))
      for (const n of selected)
        identityMoves.push({
          from: `${c.path}/processors/${n.key}`,
          to: `${c.path}/processors/${key}/processors/${n.key}`
        });
    edits.push({
      start: exportAt,
      end: exportAt,
      text: `const ${instance} = ${device.name}.add(${quote(key)}, ${definition2});
${outer.join("\n")}

`
    });
  }

  // packages/manifold-author/composition-graph.js
  var fail5 = (message) => {
    throw new GraphContractError("invalid-composition", message);
  };
  var isGraph = (definition2) => definition2.implementation.kind === "composition";
  function expandComposition(composition, reservedIds = []) {
    const definitions2 = new Map(composition.definitions.map((d) => [d.id, d]));
    const used = /* @__PURE__ */ new Set([...reservedIds, ...composition.nodes.map((n) => n.id)]);
    const nodes = [], objects = [], edges = [], groups = [], contexts = /* @__PURE__ */ new Map();
    const handle = (path) => {
      let hash2 = 2166136261;
      for (let i2 = 0; i2 < path.length; i2++) hash2 = Math.imul(hash2 ^ path.charCodeAt(i2), 16777619);
      const id = (hash2 >>> 0) % 1073741824 + 1073741824;
      if (used.has(id)) fail5(`Nested canvas identity collision at ${path}`);
      used.add(id);
      return id;
    };
    function instantiate(body, parent = null, ancestors = []) {
      const scope = parent?.path ?? "";
      const owner = parent && definitions2.get(parent.definition);
      const context = { body, parent, local: /* @__PURE__ */ new Map(), input: null, output: null };
      contexts.set(scope, context);
      for (const saved of body.nodes) {
        const definition2 = definitions2.get(saved.definition);
        if (!definition2) fail5(`Unknown definition ${saved.definition}`);
        const path = parent ? `${scope}/${saved.id}` : `/visual/${saved.id}`;
        const node = {
          ...saved,
          parameters: { ...saved.parameters },
          id: parent ? handle(path) : saved.id,
          path,
          scope,
          localId: saved.id,
          ownerDefinition: owner?.id ?? "",
          boundParameters: {}
        };
        for (const binding of body.bindings ?? [])
          if (binding.to === saved.id) {
            node.parameters[binding.parameter] = parent.parameters[binding.name];
            node.boundParameters[binding.parameter] = `${parent.label}.${binding.name}`;
          }
        if (node.bounds && parent) {
          const outer = parent.bounds ?? { x: 0, y: 0, width: 100, height: 100 };
          node.bounds = {
            x: outer.x + node.bounds.x * outer.width / 100,
            y: outer.y + node.bounds.y * outer.height / 100,
            width: node.bounds.width * outer.width / 100,
            height: node.bounds.height * outer.height / 100
          };
        }
        context.local.set(saved.id, node);
        objects.push(node);
        if (isGraph(definition2)) {
          if (ancestors.includes(definition2.id))
            fail5("Recursive composition definitions are not allowed");
          instantiate(definition2.implementation.graph, node, [...ancestors, definition2.id]);
        } else nodes.push(node);
      }
      for (const group of body.groups ?? [])
        groups.push({
          id: `${scope || "/visual"}/groups/${group.id}`,
          localId: group.id,
          scope,
          ownerDefinition: owner?.id ?? "",
          kind: "visual",
          label: group.label,
          ids: group.nodes.map((id) => context.local.get(id).id)
        });
      if (parent) {
        for (const direction of ["input", "output"]) {
          const path = `${scope}/@${direction}`;
          const ports = direction === "input" ? owner.inputs : owner.outputs ?? [];
          const node = {
            id: handle(path),
            path,
            scope,
            localId: 0,
            ownerDefinition: owner.id,
            definition: owner.id,
            label: direction === "input" ? "Graph inputs" : "Graph outputs",
            parameters: {},
            position: direction === "input" ? [-260, 0] : [960, 0],
            interface: direction,
            inputs: direction === "output" ? ports : [],
            outputs: direction === "input" ? ports : [],
            boundParameters: {}
          };
          context[direction] = node;
          objects.push(node);
        }
      }
      for (const edge of body.connections) {
        const from = edge.from === 0 && parent ? context.input : context.local.get(edge.from);
        const to = edge.to === 0 && parent ? context.output : context.local.get(edge.to);
        const outputs = from?.interface ? from.outputs : definitions2.get(from?.definition)?.outputs ?? [{ name: "analysis" }];
        const inputs = to?.interface ? to.inputs : definitions2.get(to?.definition)?.inputs ?? [];
        edges.push({
          from: from?.id ?? edge.from,
          to: to?.id ?? edge.to,
          outputPort: outputs.findIndex((p) => p.name === edge.output),
          inputPort: inputs.findIndex((p) => p.name === edge.input)
        });
      }
    }
    instantiate(composition);
    function input(node, port2) {
      const context = contexts.get(node.scope);
      const edge = context.body.connections.find((e) => e.to === node.localId && e.input === port2);
      return edge ? source3(context, edge) : null;
    }
    function source3(context, edge) {
      if (edge.from === 0 && context.parent) return input(context.parent, edge.output);
      const from = context.local.get(edge.from);
      return from ? output2(from, edge.output) : { from: edge.from, output: edge.output };
    }
    function output2(node, port2) {
      if (!isGraph(definitions2.get(node.definition))) return { from: node.id, output: port2 };
      const context = contexts.get(node.path);
      const edge = context.body.connections.find((e) => e.to === 0 && e.input === port2);
      return edge ? source3(context, edge) : null;
    }
    const connections = [];
    for (const node of nodes)
      for (const port2 of definitions2.get(node.definition).inputs) {
        const endpoint = input(node, port2.name);
        if (endpoint) connections.push({ ...endpoint, to: node.id, input: port2.name });
      }
    const compositeOutputs = {};
    const compositeMembers = {};
    for (const node of objects)
      if (!node.interface && isGraph(definitions2.get(node.definition))) {
        compositeOutputs[node.id] = Object.fromEntries(
          (definitions2.get(node.definition).outputs ?? []).map((p) => [p.name, output2(node, p.name)])
        );
        compositeMembers[node.id] = nodes.filter((child) => child.path.startsWith(`${node.path}/`)).map((child) => child.id);
      }
    return { nodes, connections, objects, edges, groups, compositeOutputs, compositeMembers };
  }
  function wrapComposition(composition, body, command, audioNodes) {
    const ids = new Set(command.ids);
    if (!ids.size || ids.size !== command.ids?.length || [...ids].some((id2) => !body.nodes.some((n) => n.id === id2)))
      fail5("Wrap requires existing nodes in one graph");
    let suffix = 1;
    while (composition.definitions.some((d) => d.id === `graph-${suffix}`)) suffix++;
    const definitionId = command.definitionId ?? `graph-${suffix}`;
    if (composition.definitions.some((d) => d.id === definitionId))
      fail5("Wrap requires a new definition ID");
    const definitions2 = new Map(composition.definitions.map((d) => [d.id, d]));
    const children = body.nodes.filter((n) => ids.has(n.id));
    const exposed = command.exposeParameters;
    if (exposed !== void 0 && (!Array.isArray(exposed) || exposed.some((entry) => {
      const node = children.find((node2) => node2.id === entry?.id);
      return !node || !definitions2.get(node.definition).parameters.some((p) => p.name === entry.parameter);
    })))
      fail5("Exposed controls must name a selected node and one of its parameters");
    const definition2 = {
      id: definitionId,
      version: 1,
      label: command.label || "Custom graph",
      implementation: {
        kind: "composition",
        graph: { nodes: structuredClone(children), connections: [], bindings: [] }
      },
      inputs: [],
      outputs: [],
      parameters: []
    };
    const nested = definition2.implementation.graph;
    const fresh = (base, entries) => {
      let value = base, suffix2 = 2;
      while (entries.some((p) => p.name === value)) value = `${base}-${suffix2++}`;
      return value;
    };
    const names = { input: /* @__PURE__ */ new Map(), output: /* @__PURE__ */ new Map() };
    const port2 = (direction, edge) => {
      const incoming2 = direction === "input";
      const key = `${edge.from}:${edge.output}`;
      if (names[direction].has(key)) return names[direction].get(key);
      const node = body.nodes.find((n) => n.id === (incoming2 ? edge.to : edge.from));
      const sourcePort = (incoming2 ? definitions2.get(node.definition).inputs : definitions2.get(node.definition).outputs).find((p) => p.name === (incoming2 ? edge.input : edge.output));
      const ports = incoming2 ? definition2.inputs : definition2.outputs;
      const name3 = fresh(sourcePort.name, ports);
      ports.push({ name: name3, type: sourcePort.type });
      names[direction].set(key, name3);
      return name3;
    };
    const used = new Set([...body.nodes, ...audioNodes].map((n) => n.id));
    let id = 2147483648;
    while (used.has(id)) id++;
    const outer = [], incoming = /* @__PURE__ */ new Set();
    for (const edge of body.connections) {
      const from = ids.has(edge.from), to = ids.has(edge.to);
      if (from && to) nested.connections.push(edge);
      else if (!from && to) {
        const name3 = port2("input", edge);
        nested.connections.push({ from: 0, output: name3, to: edge.to, input: edge.input });
        if (!incoming.has(name3)) outer.push({ ...edge, to: id, input: name3 });
        incoming.add(name3);
      } else if (from && !to) {
        const name3 = port2("output", edge);
        if (!nested.connections.some((e) => e.to === 0 && e.input === name3))
          nested.connections.push({ from: edge.from, output: edge.output, to: 0, input: name3 });
        outer.push({ ...edge, from: id, output: name3 });
      } else outer.push(edge);
    }
    for (const node of children)
      for (const p of definitions2.get(node.definition).outputs ?? [])
        if (!body.connections.some((e) => e.from === node.id && e.output === p.name)) {
          const name3 = port2("output", { from: node.id, output: p.name });
          nested.connections.push({ from: node.id, output: p.name, to: 0, input: name3 });
        }
    const parameters = {};
    for (const node of children)
      for (const p of definitions2.get(node.definition).parameters) {
        if (exposed && !exposed.some((entry) => entry.id === node.id && entry.parameter === p.name) && !(body.bindings ?? []).some(
          (binding) => binding.to === node.id && binding.parameter === p.name
        ))
          continue;
        const name3 = fresh(p.name, definition2.parameters);
        definition2.parameters.push({
          ...p,
          name: name3,
          label: `${node.label} \xB7 ${p.label}`,
          default: node.parameters[p.name]
        });
        parameters[name3] = node.parameters[p.name];
        nested.bindings.push({ name: name3, to: node.id, parameter: p.name });
      }
    for (const binding of body.bindings ?? [])
      if (ids.has(binding.to)) {
        const inner = nested.bindings.find(
          (b) => b.to === binding.to && b.parameter === binding.parameter
        );
        binding.to = id;
        binding.parameter = inner.name;
      }
    const position = [
      Math.min(...children.map((n) => n.position[0])),
      Math.min(...children.map((n) => n.position[1]))
    ];
    for (const child of nested.nodes)
      child.position = [child.position[0] - position[0], child.position[1] - position[1]];
    if (body.groups) {
      nested.groups = body.groups.filter((group) => group.nodes.every((id2) => ids.has(id2)));
      body.groups = body.groups.filter((group) => !nested.groups.includes(group)).map((group) => ({
        ...group,
        nodes: [...new Set(group.nodes.map((member3) => ids.has(member3) ? id : member3))]
      })).filter((group) => group.nodes.length > 1);
    }
    body.nodes = body.nodes.filter((n) => !ids.has(n.id));
    body.nodes.push({ id, definition: definitionId, label: definition2.label, parameters, position });
    body.connections = outer;
    composition.definitions.push(definition2);
    composition.version = Math.max(composition.version, 3);
  }

  // packages/manifold-author/node-sources.js
  var cachedSource;
  var cachedTree;
  var cachedIndex;
  function syntax(source3) {
    if (source3 !== cachedSource) {
      cachedSource = source3;
      cachedIndex = null;
      try {
        cachedTree = parse3(source3, { ecmaVersion: 2022, sourceType: "module" });
      } catch {
        cachedTree = null;
      }
    }
    return cachedTree;
  }
  function walk(node, visit, statement = node) {
    if (!node?.type) return;
    if (node.type.endsWith("Statement") || node.type === "VariableDeclaration") statement = node;
    visit(node, statement);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((child) => walk(child, visit, statement));
      else if (value?.type) walk(value, visit, statement);
    }
  }
  var property = (node, name3) => node?.properties?.find((p) => !p.computed && (p.key?.name ?? p.key?.value) === name3)?.value;
  var member2 = (node, name3) => node?.type === "MemberExpression" && !node.computed && node.property.name === name3;
  function createsGraph(node) {
    return node?.type === "CallExpression" && (node.callee?.name === "createGraphWorkspace" || node.callee?.type === "MemberExpression" && (node.callee.property.name === "createGraphWorkspace" || createsGraph(node.callee.object)));
  }
  function declarationIndex(source3) {
    const tree2 = syntax(source3);
    if (cachedIndex) return cachedIndex;
    const graphs = /* @__PURE__ */ new Set(), devices2 = /* @__PURE__ */ new Map(), metadata = /* @__PURE__ */ new Set();
    const ids = /* @__PURE__ */ new Map(), paths = /* @__PURE__ */ new Map(), kinds = /* @__PURE__ */ new Map();
    const add = (map, key, rank, statement) => {
      if (key === void 0) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push([rank, statement]);
    };
    const factories = /* @__PURE__ */ new Set();
    for (const declaration of tree2?.body ?? []) {
      if (declaration.type !== "ImportDeclaration" || !["manifold", "@manifold/author/creative"].includes(declaration.source.value))
        continue;
      for (const specifier of declaration.specifiers) {
        if (specifier.type === "ImportSpecifier" && ["createDevice", "createEffect", "createInstrument"].includes(specifier.imported.name))
          factories.add(specifier.local.name);
      }
    }
    walk(tree2, (n) => {
      if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && createsGraph(n.init))
        graphs.add(n.id.name);
      if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init?.type === "CallExpression" && factories.has(n.init.callee?.name)) {
        const identity = property(n.init.arguments[0], "id")?.value;
        if (typeof identity === "string") devices2.set(n.id.name, `/device/${identity}`);
      }
      if (n.type === "VariableDeclarator" && n.id.name === "studioGraph")
        walk(n.init, (child) => metadata.add(child));
    });
    walk(tree2, (n, statement) => {
      if (n.type === "CallExpression" && n.callee?.type === "MemberExpression") {
        const scope = devices2.get(n.callee.object?.name), key = n.arguments[0]?.value;
        if (scope && typeof key === "string") {
          if (member2(n.callee, "add")) add(paths, `${scope}/processors/${key}`, 0, statement);
          if (member2(n.callee, "input")) add(paths, `${scope}/inputs/${key}`, 0, statement);
        }
        if (graphs.has(n.callee.object?.name)) {
          if (member2(n.callee, "add")) add(ids, property(n.arguments[1], "id")?.value, 0, statement);
          if (member2(n.callee, "registerInstance") && typeof key === "string")
            add(paths, key, 1, statement);
        }
      }
      if (n.type === "MemberExpression" && graphs.has(n.object?.name)) {
        if (member2(n, "input")) add(kinds, "input.raw", 2, statement);
        if (member2(n, "output")) add(kinds, "output", 2, statement);
      }
      if (metadata.has(n) && n.type === "ObjectExpression" && (property(n, "type") || property(n, "definition")))
        add(paths, property(n, "path")?.value, 0, n);
    });
    cachedIndex = { ids, paths, kinds };
    return cachedIndex;
  }
  function nodeDeclaration(source3, node, graph, declarationPath) {
    const index = declarationIndex(source3);
    const path = declarationPath ?? graph.instances?.find((i2) => i2.nodeId === node.id)?.path;
    const candidates = [
      ...index.ids.get(node.id) ?? [],
      ...path ? index.paths.get(path) ?? [] : [],
      ...index.kinds.get(node.type) ?? []
    ];
    candidates.sort((a, b) => a[0] - b[0] || a[1].start - b[1].start);
    const best = candidates.filter(([rank]) => rank === candidates[0]?.[0]);
    const distinct = [...new Map(best.map(([, n]) => [n.start, n])).values()];
    const target = distinct.length === 1 ? distinct[0] : null;
    return {
      role: "declaration",
      label: target ? "Declaration" : "Project source",
      path: "/project.mjs",
      ...target ? { from: target.start, to: target.end, excerpt: source3.slice(target.start, target.end) } : {}
    };
  }
  function describeNodeSources(source3, graph, composition, definitions2) {
    const links = {};
    for (const node of graph.signal.nodes) links[node.id] = [nodeDeclaration(source3, node, graph)];
    const objects = expandComposition(composition).objects;
    for (const node of objects) {
      const definition2 = definitions2.find((d) => d.id === node.definition);
      if (definition2.implementation.kind === "parameter") {
        const endpoint = graph.endpoints.find((endpoint2) => endpoint2.path === definition2.implementation.path);
        const target = graph.signal.nodes.find((node2) => node2.id === endpoint?.nodeId);
        links[node.id] = target ? [nodeDeclaration(source3, target, graph)] : [{ role: "declaration", label: "Control source", path: "/project.mjs" }];
        continue;
      }
      if (definition2.implementation.kind === "visual-primitive") {
        links[node.id] = [
          { role: "definition", label: "Image graph definition", path: "/composition.json" },
          ...(definition2.implementation.frames ?? []).map((path) => ({ role: "asset", label: "Image frame", path }))
        ];
        continue;
      }
      if (definition2.implementation.kind === "composition" || node.interface) {
        links[node.id] = [
          {
            role: "definition",
            label: "Graph definition",
            path: "/composition.json",
            sharedInstances: objects.filter((n) => !n.interface && n.definition === node.definition).length
          }
        ];
        continue;
      }
      const entry = definition2.implementation.entry;
      const paths = [
        entry,
        ...Object.keys(definition2.sources).filter((path) => path !== entry).sort()
      ];
      links[node.id] = paths.map((path) => ({
        role: path === entry ? "definition" : "helper",
        label: path === entry ? "Definition" : "Imported helper",
        path,
        sharedInstances: objects.filter(
          (instance) => !instance.interface && definitions2.find((d) => d.id === instance.definition)?.sources[path] !== void 0
        ).length
      }));
      links[node.id].push({
        role: "instance",
        label: "Instance settings",
        path: "/composition.json"
      });
    }
    return links;
  }

  // packages/manifold-author/visual-metadata.js
  var visualCategories = Object.freeze([
    "Sound analysis",
    "Values & motion",
    "Fields",
    "Colour & layers",
    "Objects & layout",
    "Reusable graphs",
    "Custom scripts"
  ]);
  function visualCategory(definition2) {
    if (definition2.category) return definition2.category;
    if (definition2.implementation.kind === "parameter") return "Values & motion";
    if (definition2.implementation.kind === "composition") return "Reusable graphs";
    if (definition2.outputs?.some((port2) => port2.type === "field2d")) return "Fields";
    if (definition2.implementation.kind === "presentation-script") return "Custom scripts";
    return "Objects & layout";
  }
  function visualPreviewPort(definition2) {
    const ports = definition2.outputs ?? [];
    return ports.find((port2) => port2.name === definition2.preview) ?? ports.find(
      (port2) => ["scalar", "vector2", "vector3", "field2d", "image2d", "image-sequence"].includes(port2.type)
    );
  }

  // packages/manifold-author/project-modules.js
  var preparedFiles = /* @__PURE__ */ new WeakMap();
  function prepareFile(file) {
    const previous = preparedFiles.get(file);
    if (previous?.content === file.content) return previous;
    const ast = tree(file.content);
    const imports = [];
    for (const node of ast.body) {
      if (node.type.startsWith("Export") && node.source)
        throw new Error("Re-exports are not yet supported in project visual modules");
      if (node.type === "ImportDeclaration") imports.push(node.source.value);
    }
    compile(file.content, ast);
    const prepared = {
      content: file.content,
      imports,
      hasDefault: ast.body.some((node) => node.type === "ExportDefaultDeclaration")
    };
    preparedFiles.set(file, prepared);
    return prepared;
  }
  function tree(source3) {
    const ast = parse3(source3, { ecmaVersion: 2022, sourceType: "module" });
    function visit(node) {
      if (["ImportExpression", "MetaProperty"].includes(node.type))
        throw new Error(
          "Project visual modules use static imports; dynamic imports and import.meta are not supported"
        );
      for (const value of Object.values(node)) {
        if (Array.isArray(value))
          value.forEach((child) => {
            if (child?.type) visit(child);
          });
        else if (value?.type) visit(value);
      }
    }
    visit(ast);
    return ast;
  }
  function resolve(from, name3) {
    if (!name3.startsWith(".")) return name3.startsWith("/") ? projectFilePath(name3) : name3;
    const parts = from.split("/");
    parts.pop();
    for (const part of name3.split("/")) {
      if (part === ".") continue;
      if (part === "..") {
        if (parts.length <= 1) throw new Error("Module import escapes the project");
        parts.pop();
      } else parts.push(part);
    }
    return projectFilePath(parts.join("/"));
  }
  function prepareProjectModules(entry, files, dependencies = {}) {
    const sources = {}, active = /* @__PURE__ */ new Set();
    let entryHasDefault = false;
    function collect(path) {
      if (active.has(path)) throw new Error(`Recursive visual module import: ${path}`);
      if (Object.hasOwn(sources, path)) return;
      const file = files.find((file2) => file2.path === path);
      if (!file || file.mediaType !== "text/javascript" || file.encoding !== "utf8")
        throw new Error(`Missing JavaScript module: ${path}`);
      active.add(path);
      const prepared = prepareFile(file);
      if (path === entry) entryHasDefault = prepared.hasDefault;
      for (const name3 of prepared.imports) {
        const target = resolve(path, name3);
        if (target.startsWith("/")) collect(target);
        else if (!Object.hasOwn(dependencies, target))
          throw new Error(`Declare visual dependency ${target}`);
      }
      sources[path] = file.content;
      active.delete(path);
    }
    collect(projectFilePath(entry));
    if (!entryHasDefault) throw new Error("A visual entry must export a default view factory");
    return sources;
  }
  function compile(source3, ast = tree(source3)) {
    const replacements = [], exports = [];
    let resolver = "__manifoldImport";
    while (source3.includes(resolver)) resolver += "_";
    let defaultName = "__manifoldDefault";
    while (source3.includes(defaultName)) defaultName += "_";
    for (const node of ast.body) {
      if (node.type === "ImportDeclaration") {
        const expression = `${resolver}(${JSON.stringify(node.source.value)})`;
        const bindings = node.specifiers.map((specifier) => {
          if (specifier.type === "ImportNamespaceSpecifier")
            return `const ${specifier.local.name} = ${expression};`;
          const name3 = specifier.type === "ImportDefaultSpecifier" ? "default" : specifier.imported.name ?? specifier.imported.value;
          return `const ${specifier.local.name} = ${resolver}(${JSON.stringify(node.source.value)},${JSON.stringify(name3)});`;
        });
        replacements.push({
          start: node.start,
          end: node.end,
          text: bindings.length ? bindings.join("\n") : `${expression};`
        });
      } else if (node.type === "ExportDefaultDeclaration") {
        const named2 = ["FunctionDeclaration", "ClassDeclaration"].includes(node.declaration.type) ? node.declaration.id?.name : null;
        replacements.push({
          start: node.start,
          end: node.declaration.start,
          text: named2 ? "" : `const ${defaultName} = `
        });
        replacements.push({ start: node.end, end: node.end, text: ";" });
        exports.push(`default:${named2 ?? defaultName}`);
      } else if (node.type === "ExportNamedDeclaration") {
        if (node.source) throw new Error("Project visual modules do not support re-exports");
        if (node.declaration) {
          const declaration = node.declaration;
          const names = declaration.type === "VariableDeclaration" ? declaration.declarations.map(
            (item) => item.id.type === "Identifier" ? item.id.name : null
          ) : [declaration.id?.name];
          if (names.some((name3) => !name3))
            throw new Error("Export named visual declarations without destructuring");
          exports.push(...names.map((name3) => `${JSON.stringify(name3)}:${name3}`));
          replacements.push({ start: node.start, end: declaration.start, text: "" });
        } else {
          exports.push(
            ...node.specifiers.map(
              (item) => `${JSON.stringify(item.exported.name ?? item.exported.value)}:${item.local.name}`
            )
          );
          replacements.push({ start: node.start, end: node.end, text: "" });
        }
      } else if (node.type.startsWith("Export")) throw new Error("Unsupported visual module export");
    }
    for (const edit of replacements.sort((a, b) => b.start - a.start))
      source3 = source3.slice(0, edit.start) + edit.text + source3.slice(edit.end);
    return new Function(
      resolver,
      `"use strict";
${source3}
return Object.freeze({${exports.join(",")}});`
    );
  }

  // packages/manifold-author/presentation-types.js
  var isResourceType = (type) => /^resource:[a-z][a-z0-9.-]{0,79}$/.test(type);
  var isPresentationType = (type) => ["analysis", "scalar", "field2d", "vector2", "vector3", "image2d", "image-sequence"].includes(
    type
  ) || isResourceType(type);
  function projectParameterValue(graph, path) {
    const control = graph?.controls?.find((control2) => control2.path === path);
    if (control) return control.value;
    const endpoint = graph?.endpoints?.find((endpoint2) => endpoint2.path === path);
    return endpoint && graph.signal.initialParameters.find(
      (parameter2) => parameter2.nodeId === endpoint.nodeId && parameter2.id === endpoint.id
    )?.value;
  }

  // packages/manifold-author/composition.js
  var fail6 = (message) => {
    throw new GraphContractError("invalid-composition", message);
  };
  var clone2 = (value) => structuredClone(value);
  var emptyComposition = () => ({ version: 1, definitions: [], nodes: [], connections: [] });
  var name2 = (value) => typeof value === "string" && /^[a-zA-Z][\w.-]{0,63}$/.test(value);
  var finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  function object(value, keys, label2) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key)))
      fail6(`Invalid ${label2} fields`);
  }
  function unique(entries, key, label2) {
    if (!Array.isArray(entries) || new Set(entries.map((entry) => entry?.[key])).size !== entries.length)
      fail6(`Expected unique ${label2}`);
  }
  function validateComposition(value, files, graph) {
    value ?? (value = emptyComposition());
    object(value, ["version", "definitions", "nodes", "connections", "groups"], "composition");
    if (![1, 2, 3, 4].includes(value.version)) fail6("Unsupported composition version");
    unique(value.definitions, "id", "definitions");
    unique(value.nodes, "id", "visual nodes");
    if (!Array.isArray(value.connections))
      fail6("Expected visual connections");
    const definitions2 = /* @__PURE__ */ new Map();
    for (const definition2 of value.definitions) {
      object(
        definition2,
        [
          "id",
          "version",
          "label",
          "description",
          "category",
          "keywords",
          "preview",
          "implementation",
          "inputs",
          "outputs",
          "parameters"
        ],
        "definition"
      );
      if (!name2(definition2.id) || !Number.isSafeInteger(definition2.version) || definition2.version < 1 || typeof definition2.label !== "string" || !definition2.label.trim())
        fail6("Invalid definition identity");
      if (definition2.category !== void 0 && !visualCategories.includes(definition2.category))
        fail6("Choose a visual category: " + visualCategories.join(", "));
      if (definition2.keywords !== void 0 && (!Array.isArray(definition2.keywords) || definition2.keywords.some(
        (term) => typeof term !== "string" || !term.trim()
      )))
        fail6("Expected non-empty search terms");
      if (definition2.preview !== void 0 && !definition2.outputs?.some(
        (port2) => port2.name === definition2.preview && (["scalar", "vector2", "vector3", "field2d"].includes(port2.type) || isImageType(port2.type))
      ))
        fail6("Preview must name a scalar, vector, field or image output");
      const implementation = definition2.implementation;
      const nested = implementation?.kind === "composition";
      const primitive = implementation?.kind === "visual-primitive";
      const parameterSource = implementation?.kind === "parameter";
      object(
        implementation,
        primitive ? ["kind", "name", "frames"] : nested ? ["kind", "graph"] : parameterSource ? ["kind", "path"] : ["kind", "entry", "dependencies", "targets"],
        "implementation"
      );
      if (![
        "web-surface",
        "presentation-script",
        "scene-object",
        "parameter",
        "composition",
        "visual-primitive"
      ].includes(implementation.kind))
        fail6("Unknown presentation implementation");
      if ((primitive || parameterSource || implementation.kind === "scene-object") && value.version < 4)
        fail6("Scene objects and parameter sources require composition version 4");
      if (nested && value.version < 3) fail6("Nested graphs require composition version 3");
      if (definition2.description !== void 0 && typeof definition2.description !== "string")
        fail6("Expected a short component description");
      if (value.version === 1 && (implementation.kind !== "web-surface" || definition2.outputs?.length || definition2.inputs?.some?.((port2) => port2.type !== "analysis")))
        fail6("Typed presentation computation requires composition version 2");
      if (!nested && !parameterSource && !primitive) {
        projectFilePath(implementation.entry);
        if (!Array.isArray(implementation.targets) || !implementation.targets.length || implementation.targets.some((target) => !["browser", "webview"].includes(target)) || new Set(implementation.targets).size !== implementation.targets.length)
          fail6("Declare browser and/or webview targets");
        if (!implementation.dependencies || typeof implementation.dependencies !== "object" || Array.isArray(implementation.dependencies))
          fail6("Expected exact dependency versions");
        for (const [key, version2] of Object.entries(implementation.dependencies))
          if (!key || key.startsWith(".") || key.startsWith("/") || typeof version2 !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version2))
            fail6("Visual dependencies require exact versions");
      }
      unique(definition2.inputs, "name", "visual inputs");
      for (const port2 of definition2.inputs) {
        object(port2, ["name", "type", "unit"], "visual input");
        if (port2.unit !== void 0 && typeof port2.unit !== "string")
          fail6("Expected a short port unit");
        if (!name2(port2.name) || !isPresentationType(port2.type)) fail6("Invalid presentation input");
        if (value.version < 4 && !["analysis", "scalar", "field2d"].includes(port2.type))
          fail6("This port type requires composition version 4");
      }
      unique(definition2.outputs ?? [], "name", "presentation outputs");
      for (const port2 of definition2.outputs ?? []) {
        object(port2, ["name", "type", "unit"], "presentation output");
        if (port2.unit !== void 0 && typeof port2.unit !== "string")
          fail6("Expected a short port unit");
        if (!name2(port2.name) || !isPresentationType(port2.type) || !nested && port2.type === "analysis")
          fail6("Invalid presentation output");
        if (value.version < 4 && !(nested ? ["analysis", "scalar", "field2d"] : ["scalar", "field2d"]).includes(port2.type))
          fail6("This port type requires composition version 4");
        if (implementation.kind === "presentation-script" && isResourceType(port2.type))
          fail6("Renderer resources belong to surfaces and scene objects");
      }
      if (value.version < 4 && implementation.kind === "web-surface" && definition2.outputs?.length)
        fail6("Web surfaces consume values; use a presentation script to produce them");
      if (parameterSource && (definition2.inputs.length || definition2.parameters.length || definition2.outputs?.length !== 1 || definition2.outputs[0].name !== "value" || definition2.outputs[0].type !== "scalar" || !Number.isFinite(projectParameterValue(graph, implementation.path))))
        fail6("A parameter source reads an existing project parameter and outputs its scalar value");
      if (implementation.kind === "scene-object" && !definition2.inputs.some((port2) => isResourceType(port2.type)))
        fail6("A scene object requires a renderer resource input");
      if (implementation.kind === "presentation-script" && !definition2.outputs?.length)
        fail6("A presentation script needs a named output");
      unique(definition2.parameters, "name", "visual parameters");
      for (const parameter2 of definition2.parameters) {
        object(parameter2, ["name", "label", "min", "max", "default"], "visual parameter");
        if (!name2(parameter2.name) || typeof parameter2.label !== "string" || !Number.isFinite(parameter2.min) || !Number.isFinite(parameter2.max) || parameter2.min >= parameter2.max || !finite(parameter2.default, parameter2.min, parameter2.max))
          fail6("Invalid visual parameter range");
      }
      if (!nested && !parameterSource && !primitive)
        prepareProjectModules(implementation.entry, files, implementation.dependencies);
      if (primitive) validateVisualPrimitive(definition2, files);
      definitions2.set(definition2.id, definition2);
    }
    const audioIds = new Set(graph.signal.nodes.map((node) => node.id));
    function validateGraph(body, owner) {
      if (owner) {
        object(body, ["nodes", "connections", "bindings", "groups"], "nested graph");
        unique(body.nodes, "id", "nested nodes");
        if (!Array.isArray(body.connections))
          fail6("Expected nested connections");
      }
      unique(body.groups ?? [], "id", "graph groups");
      for (const group of body.groups ?? []) {
        object(group, ["id", "label", "nodes"], "graph group");
        if (!name2(group.id) || typeof group.label !== "string" || !group.label.trim() || !Array.isArray(group.nodes) || group.nodes.length < 2 || new Set(group.nodes).size !== group.nodes.length || !group.nodes.every((id) => body.nodes.some((node) => node.id === id)))
          fail6("A group needs a name and at least two distinct nodes in the same graph");
      }
      const nodes = /* @__PURE__ */ new Map();
      for (const node of body.nodes) {
        object(
          node,
          ["id", "definition", "label", "parameters", "position", "bounds"],
          "visual node"
        );
        if (!Number.isInteger(node.id) || node.id < 1 || node.id > 4294967295 || !owner && audioIds.has(node.id))
          fail6("Visual node IDs must be unique and distinct from audio nodes");
        const definition2 = definitions2.get(node.definition);
        if (!definition2) fail6(`Unknown visual definition ${node.definition}`);
        if (typeof node.label !== "string" || !node.label.trim())
          fail6("Invalid visual node label");
        object(
          node.parameters,
          definition2.parameters.map((parameter2) => parameter2.name),
          "visual values"
        );
        for (const parameter2 of definition2.parameters)
          if (!finite(node.parameters[parameter2.name], parameter2.min, parameter2.max))
            fail6(`Invalid visual value ${parameter2.name}`);
        if (!Array.isArray(node.position) || node.position.length !== 2 || node.position.some((coordinate) => !finite(coordinate, -1e5, 1e5)))
          fail6("Invalid visual graph position");
        if (!isVisualSurface(definition2) && node.bounds === void 0) {
          nodes.set(node.id, node);
          continue;
        }
        object(node.bounds, ["x", "y", "width", "height"], "visual bounds");
        const { x, y, width, height } = node.bounds;
        if (!finite(x, 0, 100) || !finite(y, 0, 100) || !finite(width, 1, 100) || !finite(height, 1, 100) || x + width > 100 || y + height > 100)
          fail6("Visual bounds must fit the Presenter (percent)");
        nodes.set(node.id, node);
      }
      const destinations = /* @__PURE__ */ new Set();
      for (const edge of body.connections) {
        object(edge, ["from", "output", "to", "input"], "visual connection");
        const source3 = nodes.get(edge.from);
        const output2 = source3 ? definitions2.get(source3.definition).outputs?.find((port2) => port2.name === edge.output) : owner && edge.from === 0 ? owner.inputs.find((port2) => port2.name === edge.output) : !owner && graph.signal.nodes.some((node2) => node2.id === edge.from && node2.type === "output") && edge.output === "analysis" ? { type: "analysis" } : null;
        if (!output2) fail6("Unknown presentation output (audio analysis is available on Output)");
        const node = nodes.get(edge.to), definition2 = definitions2.get(node?.definition);
        const input = owner && edge.to === 0 ? owner.outputs?.find((port2) => port2.name === edge.input) : definition2?.inputs.find((port2) => port2.name === edge.input);
        if (!input) fail6("Unknown visual input");
        if (input.type !== output2.type)
          fail6(`Incompatible presentation ports: ${output2.type} to ${input.type}`);
        const key = `${edge.to}:${edge.input}`;
        if (destinations.has(key)) fail6("A visual input accepts one connection");
        destinations.add(key);
      }
      compositionOrder(body);
      if (owner) {
        if (!Array.isArray(body.bindings))
          fail6("Expected parameter bindings");
        const targets = /* @__PURE__ */ new Set();
        for (const binding of body.bindings) {
          object(binding, ["name", "to", "parameter"], "parameter binding");
          const exposed = owner.parameters.find((p) => p.name === binding.name);
          const target = definitions2.get(nodes.get(binding.to)?.definition)?.parameters.find((p) => p.name === binding.parameter);
          if (!exposed || !target || exposed.min < target.min || exposed.max > target.max)
            fail6("Parameter binding must target a compatible child parameter range");
          const key = `${binding.to}:${binding.parameter}`;
          if (targets.has(key)) fail6("A child parameter accepts one binding");
          targets.add(key);
        }
      }
    }
    for (const definition2 of definitions2.values())
      if (definition2.implementation.kind === "composition")
        validateGraph(definition2.implementation.graph, definition2);
    validateGraph(value, null);
    const depths = /* @__PURE__ */ new Map(), visiting = /* @__PURE__ */ new Set();
    const visit = (id) => {
      if (visiting.has(id)) fail6("Recursive composition definitions are not allowed");
      if (depths.has(id)) return depths.get(id);
      visiting.add(id);
      const definition2 = definitions2.get(id);
      const depth = definition2.implementation.kind === "composition" ? 1 + Math.max(
        0,
        ...definition2.implementation.graph.nodes.map((node) => visit(node.definition))
      ) : 0;
      visiting.delete(id);
      depths.set(id, depth);
      return depth;
    };
    for (const id of definitions2.keys()) visit(id);
    expandComposition(value, [...audioIds]);
    return clone2(value);
  }
  function compositionOrder(composition) {
    const remaining = new Set(composition.nodes.map((node) => node.id)), order = [];
    while (remaining.size) {
      const ready = [...remaining].filter(
        (id) => !composition.connections.some((edge) => edge.to === id && remaining.has(edge.from))
      );
      if (!ready.length) fail6("Presentation connections must be acyclic");
      for (const id of ready) {
        remaining.delete(id);
        order.push(id);
      }
    }
    return order;
  }
  var visualStarterSource = `export default function createVisual() {
  return {
    mount(element, api) {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;height:100%;display:block';
      element.append(canvas);
      const context = canvas.getContext('2d');
      let frame;
      function draw() {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(element.clientWidth * ratio));
        const height = Math.max(1, Math.round(element.clientHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width; canvas.height = height;
        }
        const signal = api.input('signal');
        const level = signal?.rms ?? 0;
        const size = api.parameter('size');
        context.clearRect(0, 0, width, height);
        context.fillStyle = 'hsl(' + api.parameter('hue') + ' 65% 65%)';
        context.beginPath();
        context.arc(width / 2, height / 2,
          Math.min(width, height) * Math.min(0.45, (0.12 + level * 0.8) * size), 0, Math.PI * 2);
        context.fill();
        canvas.dataset.rms = String(level);
        frame = requestAnimationFrame(draw);
      }
      draw();
      return { dispose() { cancelAnimationFrame(frame); canvas.remove(); } };
    },
  };
}
`;
  function editComposition(composition, files, graph, command) {
    const next = clone2(composition), nextFiles = files.map((file) => ({ ...file }));
    const owner = command.scope && next.definitions.find((d) => d.id === command.scope);
    if (command.scope && owner?.implementation.kind !== "composition")
      fail6("Unknown composition edit scope");
    const body = owner ? owner.implementation.graph : next;
    if (command.operation === "component.wrap") {
      wrapComposition(next, body, command, graph.signal.nodes);
      return { composition: validateComposition(next, nextFiles, graph), files: nextFiles };
    }
    if (command.operation === "component.group") {
      const label2 = String(command.label ?? "").trim();
      let index = 1;
      while (body.groups?.some((group) => group.id === `group-${index}`)) index++;
      body.groups = [...body.groups ?? [], { id: `group-${index}`, label: label2, nodes: command.ids }];
      return { composition: validateComposition(next, nextFiles, graph), files: nextFiles };
    }
    if (command.operation === "component.ungroup") {
      if (!body.groups?.some((group) => group.id === command.group)) fail6("Unknown graph group");
      body.groups = body.groups.filter((group) => group.id !== command.group);
      return { composition: validateComposition(next, nextFiles, graph), files: nextFiles };
    }
    if (command.operation === "component.reference") {
      const parameter2 = [...graph.controls ?? [], ...graph.endpoints ?? []].find(
        (item) => item.path === command.path
      );
      if (!parameter2) fail6("Choose an existing project parameter");
      let definition3 = next.definitions.find(
        (item) => item.implementation.kind === "parameter" && item.implementation.path === command.path
      );
      if (!definition3) {
        const base = `reference-${command.path.split("/").filter(Boolean).join("-")}`.replace(/[^a-zA-Z0-9.-]/g, "-").slice(0, 55);
        let id = base, index = 2;
        while (next.definitions.some((item) => item.id === id)) id = `${base}-${index++}`;
        definition3 = {
          id,
          version: 1,
          label: parameter2.label || command.path,
          implementation: { kind: "parameter", path: command.path },
          inputs: [],
          outputs: [{ name: "value", type: "scalar" }],
          parameters: []
        };
        next.definitions.push(definition3);
      }
      next.version = 4;
      if (command.id !== void 0) {
        const node = body.nodes.find((node2) => node2.id === command.id);
        if (!node || next.definitions.find((item) => item.id === node.definition)?.implementation.kind !== "parameter")
          fail6("Select a parameter reference to change its target");
        node.definition = definition3.id;
        node.label = definition3.label;
        return { composition: validateComposition(next, nextFiles, graph), files: nextFiles };
      }
      return editComposition(next, nextFiles, graph, {
        ...command,
        operation: "component.add",
        definitionId: definition3.id
      });
    }
    if (command.operation === "component.frames") {
      const definition3 = next.definitions.find((item) => item.id === command.definitionId);
      if (definition3?.implementation.kind !== "visual-primitive" || definition3.implementation.name !== "image-frames")
        fail6("Choose an Image frames definition");
      definition3.implementation.frames = clone2(command.frames);
      return { composition: validateComposition(next, nextFiles, graph), files: nextFiles };
    }
    let definition2;
    if (command.operation === "component.create") {
      let suffix = 1;
      while (next.definitions.some((item) => item.id === `visual-${suffix}`) || nextFiles.some((item) => item.path === `/nodes/visual-${suffix}.mjs`))
        suffix++;
      definition2 = {
        id: `visual-${suffix}`,
        version: 1,
        label: `Custom visual ${suffix}`,
        description: "Draws a circle that grows with the audio level. Edit its script to change the drawing.",
        implementation: {
          kind: "web-surface",
          entry: `/nodes/visual-${suffix}.mjs`,
          dependencies: {},
          targets: ["browser", "webview"]
        },
        inputs: [{ name: "signal", type: "analysis" }],
        parameters: [
          { name: "size", label: "Size", min: 0.1, max: 3, default: 1 },
          { name: "hue", label: "Hue", min: 0, max: 360, default: 195 }
        ]
      };
      next.definitions.push(definition2);
      nextFiles.push({
        path: definition2.implementation.entry,
        mediaType: "text/javascript",
        encoding: "utf8",
        content: visualStarterSource
      });
    } else if (command.operation === "component.define") {
      if (command.definition?.implementation?.kind === "presentation-script" || command.definition?.inputs?.some((port2) => port2.type !== "analysis"))
        next.version = Math.max(next.version, 2);
      if (command.definition?.implementation?.kind === "composition")
        next.version = Math.max(next.version, 3);
      if (["scene-object", "parameter", "visual-primitive"].includes(
        command.definition?.implementation?.kind
      ) || [...command.definition?.inputs ?? [], ...command.definition?.outputs ?? []].some(
        (port2) => ["vector2", "vector3"].includes(port2.type) || isImageType(port2.type) || isResourceType(port2.type)
      ) || command.definition?.implementation?.kind === "web-surface" && command.definition?.outputs?.length)
        next.version = 4;
      const index = next.definitions.findIndex((item) => item.id === command.definition?.id);
      if (index < 0) next.definitions.push(clone2(command.definition));
      else next.definitions[index] = clone2(command.definition);
      for (const file of command.files ?? []) {
        const index2 = nextFiles.findIndex((item) => item.path === file.path);
        if (index2 < 0) nextFiles.push(clone2(file));
        else nextFiles[index2] = clone2(file);
      }
    }
    if (command.operation === "component.add" || command.operation === "component.create") {
      definition2 ?? (definition2 = next.definitions.find((item) => item.id === command.definitionId));
      if (!definition2) {
        definition2 = visualPrimitives.find((item) => item.id === command.definitionId);
        if (!definition2) fail6("Unknown visual definition");
        definition2 = clone2(definition2);
        next.definitions.push(definition2);
        next.version = 4;
      }
      const ids = new Set([...graph.signal.nodes, ...body.nodes].map((node) => node.id));
      let id = 2147483648;
      while (ids.has(id) && id <= 4294967295) id++;
      const count = body.nodes.filter((node) => node.definition === definition2.id).length;
      body.nodes.push({
        id,
        definition: definition2.id,
        label: count ? `${definition2.label} (${count + 1})` : definition2.label,
        parameters: Object.fromEntries(
          definition2.parameters.map((parameter2) => [parameter2.name, parameter2.default])
        ),
        position: [command.x ?? 760, command.y ?? body.nodes.length * 170],
        ...isVisualSurface(definition2) ? { bounds: { x: body.nodes.length % 2 * 50, y: 0, width: 50, height: 100 } } : {}
      });
    } else if (command.operation === "component.remove") {
      if (!body.nodes.some((node) => node.id === command.id)) fail6("Unknown visual node");
      body.nodes = body.nodes.filter((node) => node.id !== command.id);
      if (body.groups)
        body.groups = body.groups.map((group) => ({ ...group, nodes: group.nodes.filter((id) => id !== command.id) })).filter((group) => group.nodes.length > 1);
      if (owner) body.bindings = body.bindings.filter((binding) => binding.to !== command.id);
      body.connections = body.connections.filter(
        (edge) => edge.to !== command.id && edge.from !== command.id
      );
    } else if (command.operation === "component.update") {
      const node = body.nodes.find((node2) => node2.id === command.id);
      if (!node) fail6("Unknown visual node");
      object(command.changes, ["label", "parameters", "position", "bounds"], "visual edit");
      Object.assign(
        node,
        clone2(command.changes),
        command.changes.parameters ? { parameters: { ...node.parameters, ...command.changes.parameters } } : {}
      );
    } else if (command.operation === "component.connect" || command.operation === "component.disconnect") {
      const { from, output: output2, to, input } = command;
      const node = body.nodes.find((node2) => node2.id === to), definition3 = next.definitions.find((definition4) => definition4.id === node?.definition);
      const ports = owner && to === 0 ? owner.outputs : definition3?.inputs;
      if (!ports?.some((port2) => port2.name === input)) fail6("Unknown visual input");
      body.connections = body.connections.filter((edge) => !(edge.to === to && edge.input === input));
      if (command.operation === "component.connect")
        body.connections.push({ from, output: output2, to, input });
    } else if (!["component.create", "component.add", "component.define"].includes(command.operation))
      fail6("Unknown component operation");
    const validatedFiles = validateProjectFiles(nextFiles);
    return { composition: validateComposition(next, validatedFiles, graph), files: validatedFiles };
  }
  function compositionPresentation(composition, files) {
    const prepared = composition.definitions.map((definition2) => ({
      ...definition2,
      sources: ["composition", "parameter", "visual-primitive"].includes(
        definition2.implementation.kind
      ) ? {} : prepareProjectModules(
        definition2.implementation.entry,
        files,
        definition2.implementation.dependencies
      )
    }));
    const byId = new Map(prepared.map((definition2) => [definition2.id, definition2]));
    const expanded = expandComposition(composition);
    return {
      visualDefinitions: prepared,
      presentationExecution: {
        nodes: expanded.nodes,
        connections: expanded.connections,
        compositeOutputs: expanded.compositeOutputs,
        compositeMembers: expanded.compositeMembers
      },
      componentNodes: expanded.objects.map((node) => {
        const definition2 = byId.get(node.definition);
        const inputs = node.interface ? node.inputs : definition2.inputs;
        const outputs = node.interface ? node.outputs : definition2.outputs ?? [];
        return {
          id: node.id,
          localId: node.localId,
          scope: node.scope,
          ownerDefinition: node.ownerDefinition,
          boundParameters: node.boundParameters,
          type: definition2.id,
          ...definition2.implementation.name === "image-frames" ? { imageFrames: definition2.implementation.frames } : {},
          category: visualCategory(definition2),
          preview: visualPreviewPort(definition2)?.name ?? "",
          domain: "visual",
          label: node.label,
          instance: node.path,
          sourcePath: definition2.implementation.entry ?? "/composition.json",
          referencePath: definition2.implementation.kind === "parameter" ? definition2.implementation.path : "",
          implementationKind: node.interface ? `interface-${node.interface}` : definition2.implementation.kind,
          description: node.interface ? "Named boundary of this reusable graph." : definition2.description ?? "",
          inputs: inputs.map((port2) => ({
            name: port2.name,
            signal: port2.type,
            unit: port2.unit ?? ""
          })),
          outputs: outputs.map((port2) => ({
            name: port2.name,
            signal: port2.type,
            unit: port2.unit ?? ""
          })),
          parameters: node.interface ? [] : definition2.parameters.map((parameter2) => ({
            ...parameter2,
            default: node.parameters[parameter2.name]
          })),
          position: node.position,
          positionSpace: "world"
        };
      }),
      componentEdges: expanded.edges.map((edge) => {
        const source3 = expanded.objects.find((node) => node.id === edge.from);
        const outputs = source3?.interface ? source3.outputs : byId.get(source3?.definition)?.outputs;
        const type = outputs?.[edge.outputPort]?.type ?? "analysis";
        return { ...edge, reference: type === "analysis" || isResourceType(type) };
      }),
      componentGroups: expanded.groups,
      componentPalette: [...prepared, ...visualPrimitives.filter((item) => !byId.has(item.id))].map(
        (definition2) => ({
          type: definition2.id,
          label: definition2.label,
          category: visualCategory(definition2),
          keywords: definition2.keywords ?? [],
          description: definition2.description ?? "",
          implementationKind: definition2.implementation.kind,
          sourcePath: definition2.implementation.entry ?? "",
          referencePath: definition2.implementation.kind === "parameter" ? definition2.implementation.path : "",
          kind: definition2.implementation.kind === "composition" ? "visual-graph" : "visual",
          inputs: definition2.inputs.length,
          outputs: definition2.outputs?.length ?? 0,
          input_ports: definition2.inputs.map((port2) => ({
            name: port2.name,
            signal: port2.type,
            unit: port2.unit ?? ""
          })),
          output_ports: (definition2.outputs ?? []).map((port2) => ({
            name: port2.name,
            signal: port2.type,
            unit: port2.unit ?? ""
          })),
          parameters: definition2.parameters.length
        })
      )
    };
  }

  // packages/manifold-author/live-project.js
  var copy2 = (value) => structuredClone(value);
  var metadataEditToken = /* @__PURE__ */ Symbol("studio metadata edit");
  var deviceEditToken = /* @__PURE__ */ Symbol("Device source edit");
  function moveDeviceIdentities(project, moves) {
    if (!moves?.length) return project;
    const next = copy2(project);
    for (const instance of next.instances ?? []) for (const move of moves)
      if (instance.path === move.from || instance.path.startsWith(move.from + "/")) {
        instance.path = move.to + instance.path.slice(move.from.length);
        break;
      }
    for (const entry of [...next.endpoints ?? [], ...next.hostAssignments ?? []]) for (const move of moves) {
      const controlPath = (path) => path.replace(/^\/device\/[^/]+/, "").replaceAll("/processors/", "/");
      const from = controlPath(move.from);
      if (entry.path?.startsWith(from + "/")) {
        entry.path = controlPath(move.to) + entry.path.slice(from.length);
        break;
      }
    }
    return next;
  }
  var canonicalJSON = (text) => JSON.stringify(JSON.parse(text), (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
  var failure = (code, message) => {
    throw new GraphContractError(code, message);
  };
  var publicCatalog = Object.fromEntries(listPrimitives().map((primitive) => [primitive.type, {
    ...PORT_CATALOG[primitive.type],
    label: primitive.label,
    category: primitive.category,
    description: primitive.description,
    parameters: primitive.parameters ?? []
  }]));
  function freezePresentationMetadata(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freezePresentationMetadata(child);
      Object.freeze(value);
    }
    return value;
  }
  var frameCatalog = freezePresentationMetadata(copy2(publicCatalog));
  function validateView(view, project) {
    if (!Array.isArray(view)) failure("invalid-view", "Expected presentation components");
    const paths = new Set(project.endpoints?.map((entry) => entry.path)), ids = /* @__PURE__ */ new Set();
    const controls = new Set(project.controls?.map((entry) => entry.path));
    for (const component of view) {
      if (!component || typeof component.id !== "string" || !component.id || ids.has(component.id)) failure("invalid-view", "Component IDs must be unique strings");
      ids.add(component.id);
      if (component.style !== void 0 && (!["parameter", "control", "label", "curve"].includes(component.type) || !component.style || typeof component.style !== "object" || Array.isArray(component.style) || Object.entries(component.style).some(([key, value]) => !["accent", "background", "text"].includes(key) || typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)))) failure("invalid-view", "Style accepts accent, background and text as six-digit hex colors");
      if (component.height !== void 0 && (component.type !== "curve" || !Number.isFinite(component.height) || component.height < 64 || component.height > 320)) failure("invalid-view", "Curve height must be 64\u2013320 pixels");
      if (component.fontSize !== void 0 && (component.type !== "label" || !Number.isFinite(component.fontSize) || component.fontSize < 10 || component.fontSize > 32)) failure("invalid-view", "Label fontSize must be 10\u201332 pixels");
      for (const field2 of ["label", "path", "base", "unit", "group"]) if (component[field2] !== void 0 && typeof component[field2] !== "string") failure("invalid-view", `${field2} must be a string`);
      if (!["parameter", "control", "label", "filter-response", "keyboard", "curve"].includes(component.type)) failure("invalid-view", `Unknown component ${component.type}`);
      if (component.type === "curve" && (!Array.isArray(component.points) || component.points.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) || !/^#[0-9a-f]{6}$/i.test(component.color ?? "#a78bfa"))) failure("invalid-view", "Curve requires up to 1024 normalized points and a hex color");
      if (component.type === "control" && !controls.has(component.path)) failure("invalid-view", `Missing control ${component.path}`);
      if (component.type === "parameter" && !paths.has(component.path)) failure("invalid-view", `Missing endpoint ${component.path}`);
      if (component.type === "filter-response" && !["type", "cutoff", "resonance"].every((name3) => paths.has(`${component.base ?? "/plugin/params"}/${name3}`))) failure("invalid-view", "Filter response requires mode, cutoff and resonance endpoints");
      if (component.type === "keyboard" && (!Number.isInteger(component.firstNote ?? 48) || (component.firstNote ?? 48) < 0 || !Number.isInteger(component.noteCount ?? 25) || (component.noteCount ?? 25) < 1 || (component.noteCount ?? 25) > 49 || (component.firstNote ?? 48) + (component.noteCount ?? 25) > 128)) failure("invalid-view", "Keyboard range must contain 1\u201349 valid MIDI notes");
      if (component.choices !== void 0 && (!Array.isArray(component.choices) || component.choices.some((choice) => typeof choice !== "string"))) failure("invalid-view", "Choices must be strings");
      if (component.type === "parameter" && component.choices && component.choiceValues === void 0) {
        const endpoint = project.endpoints?.find((entry) => entry.path === component.path);
        const node = project.signal.nodes.find((entry) => entry.id === endpoint?.nodeId);
        const parameter2 = publicCatalog[node?.type]?.parameters.find((entry) => entry.id === endpoint?.id);
        if (parameter2?.choiceValues && JSON.stringify(component.choices) === JSON.stringify(parameter2.choices))
          component.choiceValues = [...parameter2.choiceValues];
      }
      if (component.choiceValues !== void 0 && (!Array.isArray(component.choiceValues) || component.choiceValues.length !== component.choices?.length || component.choiceValues.some((value) => !Number.isFinite(value)) || new Set(component.choiceValues).size !== component.choiceValues.length)) failure("invalid-view", "Choice values must be distinct numbers matching the labels");
    }
    return view;
  }
  function retainUnchangedTargets(previous, accepted, next) {
    const oldNames = new Map((previous.instances ?? []).map((e) => [e.path, e.nodeId]));
    const oldNamedIds = new Set(oldNames.values());
    const newNames = new Map((next.project.instances ?? []).map((e) => [e.nodeId, e.path]));
    const oldNodes = new Map(previous.signal.nodes.map((n) => [n.id, n.type]));
    const key = (p) => p.nodeId + ":" + p.id;
    const authoredTargets = new Map(previous.signal.initialParameters.map((p) => [key(p), p]));
    const liveTargets = new Map(accepted.signal.initialParameters.map((p) => [key(p), p]));
    const oldEndpoints = new Map((previous.endpoints ?? []).map((p) => [key(p), p]));
    const newEndpoints = new Map((next.project.endpoints ?? []).map((p) => [key(p), p]));
    const byNode = /* @__PURE__ */ new Map();
    for (const p of next.project.signal.initialParameters) {
      if (!byNode.has(p.nodeId)) byNode.set(p.nodeId, []);
      byNode.get(p.nodeId).push(p);
    }
    for (const node of next.project.signal.nodes) {
      const oldId = newNames.has(node.id) ? oldNames.get(newNames.get(node.id)) : oldNamedIds.has(node.id) ? void 0 : node.id;
      if (oldId === void 0 || oldNodes.get(oldId) !== node.type) continue;
      for (const parameter2 of byNode.get(node.id) ?? []) {
        const oldKey = oldId + ":" + parameter2.id;
        const authored = authoredTargets.get(oldKey);
        const live = liveTargets.get(oldKey);
        const before = oldEndpoints.get(oldKey);
        const after = newEndpoints.get(key(parameter2));
        const compatibleRange = before?.min === after?.min && before?.max === after?.max || before && after && after.min <= before.min && after.max >= before.max;
        if (authored && live && live.value !== parameter2.value && authored.value === parameter2.value && compatibleRange) {
          next.graph.setParameter(next.graph.find(node.id), parameter2.id, live.value);
        }
      }
    }
    next.project = next.graph.toProject();
    for (const control of next.project.controls ?? []) {
      const before = previous.controls?.find((c) => c.path === control.path);
      const live = accepted.controls?.find((c) => c.path === control.path);
      if (before && live && before.value === control.value && before.min === control.min && before.max === control.max && before.discrete === control.discrete)
        next.graph.setControl(control.path, live.value);
    }
    next.project = next.graph.toProject();
  }
  function structure(project) {
    const value = copy2(project);
    delete value.signal.initialParameters;
    for (const control of value.controls ?? []) delete control.value;
    return JSON.stringify(value);
  }
  function reconcileProject(result, previous) {
    if (result.reconcile) {
      const draft = result.graph.fork();
      const outcome = result.reconcile(draft, copy2(previous));
      if (outcome?.then) failure("invalid-control", "Graph reconciliation must be synchronous");
      result.graph = GraphWorkspace.fromProject(draft.toProject());
      result.project = result.graph.toProject();
      validateView(result.view, result.project);
    }
  }
  function paintFrame(paint, snapshot, view) {
    if (!paint) return copy2(view);
    const frame = [], add = (component) => frame.push(component);
    const result = paint(Object.freeze({
      parameter: (path, options = {}) => add({ ...options, id: options.id ?? path, type: "parameter", path }),
      control: (path, options = {}) => add({ ...options, id: options.id ?? path, type: "control", path }),
      label: (text, id = `label-${frame.length}`, options = {}) => add({ ...options, id, type: "label", label: String(text) }),
      keyboard: (options = {}) => add({ ...options, id: options.id ?? "keyboard", type: "keyboard" }),
      curve: (options) => add({ ...options, type: "curve" }),
      filterResponse: (base = "/plugin/params", id = "response") => add({ id, type: "filter-response", base })
    }), snapshot);
    if (result?.then) failure("invalid-view", "Immediate paint must be synchronous");
    for (const component of view) {
      if (component.group?.startsWith("Module \xB7 ") && !frame.some((item) => item.path === component.path)) frame.push(component);
    }
    return validateView(frame, snapshot.graph);
  }
  function jsonState(value) {
    const serialized = JSON.stringify(value, (_key, entry) => {
      if (typeof entry === "number" && !Number.isFinite(entry) || ["function", "undefined", "symbol", "bigint"].includes(typeof entry)) failure("invalid-event-state", "Controller state must be finite JSON");
      return entry;
    });
    if (!serialized) failure("invalid-event-state", "Controller state must be serializable");
    return JSON.parse(serialized);
  }
  function networkSettings(value) {
    if (value === null) return null;
    const config = jsonState(value);
    if (!config || Array.isArray(config) || Object.keys(config).some((key) => !["tcp", "udp", "osc", "oscQuery", "link"].includes(key))) failure("invalid-network", "Unknown network setting");
    for (const key of ["tcp", "udp", "osc", "oscQuery"]) if (config[key] !== void 0 && (typeof config[key] !== "string" || config[key].length > 128)) failure("invalid-network", "Expected an IP:port address");
    if (config.link !== void 0) {
      if (!config.link || Array.isArray(config.link) || typeof config.link !== "object") failure("invalid-network", "Expected Link settings");
      const allowed = ["enabled", "tempoSync", "startStopSync", "playing", "tempo", "quantum"];
      for (const [key, value2] of Object.entries(config.link)) {
        if (!allowed.includes(key)) failure("invalid-network", "Unknown Link setting");
        if (["tempo", "quantum"].includes(key)) {
          const [min, max] = key === "tempo" ? [20, 300] : [0.25, 64];
          if (!Number.isFinite(value2) || value2 < min || value2 > max) failure("invalid-network", "Invalid Link " + key);
        } else if (typeof value2 !== "boolean") failure("invalid-network", "Expected boolean Link setting");
      }
    }
    return config;
  }
  function evaluateProjectSource(source3, { previous } = {}) {
    if (typeof source3 !== "string") failure("invalid-source", "Expected project source text");
    const authoredDevice = evaluateSource(source3, {
      "manifold": Object.freeze({ ...creative_exports }),
      "manifold/graph": Object.freeze({ ...creative_graph_exports }),
      "@manifold/author": Object.freeze({ ...author_exports }),
      "@manifold/author/primitives": Object.freeze({ ...primitives_exports }),
      "@manifold/author/host-services": Object.freeze({ defineNetwork }),
      "@manifold/author/studio-graph": Object.freeze({ applyStudioGraph }),
      "@manifold/author/examples/main-voice-control": Object.freeze({ chooseMainVoice }),
      "@manifold/author/examples/oscillator-preview": Object.freeze({ oscillatorPreviewCurves })
    }, author_exports, failure);
    const result = isDevice(authoredDevice) ? lowerDevice(authoredDevice, { previous }) : authoredDevice;
    const graph = result?.graph instanceof GraphWorkspace ? result.graph : GraphWorkspace.fromProject(result?.graph);
    const project = graph.toProject();
    audioGraphPresentation(result.editorGraph?.audioGraphs, project, publicCatalog, result.editorGraph?.layout ?? []);
    const view = copy2(result.view ?? []);
    for (const module of result.editorGraph?.modules ?? []) {
      for (const parameter2 of module.definition.parameters ?? []) {
        const path = `${module.path}/${parameter2.name}`;
        if (!view.some((component) => component.path === path)) view.push({
          id: path,
          type: "parameter",
          path,
          label: parameter2.label ?? parameter2.name,
          group: `Module \xB7 ${module.definition.label}`,
          ...parameter2.style ? { style: copy2(parameter2.style) } : {}
        });
      }
    }
    validateView(view, project);
    if (result.paint !== void 0 && typeof result.paint !== "function") failure("invalid-view", "paint must be a function");
    if (result.onControl !== void 0 && typeof result.onControl !== "function") failure("invalid-control", "onControl must be a function");
    if (result.reconcile !== void 0 && typeof result.reconcile !== "function") failure("invalid-control", "reconcile must be a function");
    if (result.onEvent !== void 0 && typeof result.onEvent !== "function") failure("invalid-event", "onEvent must be a function");
    if (result.onEvent && (typeof result.eventStateSchema !== "string" || !result.eventStateSchema)) failure("invalid-event", "An event controller requires eventStateSchema");
    if (result.onNetwork !== void 0 && typeof result.onNetwork !== "function") failure("invalid-network", "onNetwork must be a function");
    const declaration = unpackNetwork(result.network);
    if (declaration && result.onNetwork !== void 0) failure("invalid-network", "Register the handler with network.onEvent only");
    const network = networkSettings(declaration ? declaration.settings : result.network ?? null);
    return { webView: validateWebView(result.webView), editorGraph: result.editorGraph ?? null, network, onNetwork: declaration ? declaration.handler : result.onNetwork ?? null, reconcile: result.reconcile ?? null, onEvent: result.onEvent ?? null, eventStateSchema: result.eventStateSchema ?? null, eventState: jsonState(result.eventState ?? null), graph, project, view, paint: result.paint ?? null, onControl: result.onControl ?? null };
  }
  function observationStructure(presentation) {
    const execution = presentation.presentationExecution;
    return JSON.stringify({
      nodes: execution.nodes.map(({ id, path, definition: definition2 }) => ({ id, path, definition: definition2 })),
      connections: execution.connections,
      compositeOutputs: execution.compositeOutputs,
      compositeMembers: execution.compositeMembers,
      definitions: presentation.visualDefinitions.filter((d) => d.implementation.kind !== "composition").map(({ id, implementation, sources, inputs, outputs, preview }) => ({ id, implementation, sources, inputs, outputs, preview }))
    });
  }
  var _onEvent, _eventState, _eventStateSchema, _deviceMidi, _network, _onNetwork, _declaredNetwork, _webView, _editorGraph, _files, _composition, _visualPresentation, _sourceIndex, _observationRevision, _observationStructure, _host, _graph2, _source, _view, _paint, _onControl, _authored, _revision3, _tail, _listeners, _history, _events, _LiveProjectRuntime_instances, emit_fn, remember_fn, fileManifest_fn, adoptPresentation_fn, acceptComposition_fn, apply_fn;
  var LiveProjectRuntime = class {
    constructor(host, source3, saved = null) {
      __privateAdd(this, _LiveProjectRuntime_instances);
      __privateAdd(this, _onEvent);
      __privateAdd(this, _eventState);
      __privateAdd(this, _eventStateSchema);
      __privateAdd(this, _deviceMidi, new DeviceMidiInput());
      __privateAdd(this, _network);
      __privateAdd(this, _onNetwork);
      __privateAdd(this, _declaredNetwork);
      __privateAdd(this, _webView);
      __privateAdd(this, _editorGraph);
      __privateAdd(this, _files, []);
      __privateAdd(this, _composition, emptyComposition());
      __privateAdd(this, _visualPresentation);
      __privateAdd(this, _sourceIndex);
      __privateAdd(this, _observationRevision, 0);
      __privateAdd(this, _observationStructure);
      __privateAdd(this, _host);
      __privateAdd(this, _graph2);
      __privateAdd(this, _source);
      __privateAdd(this, _view);
      __privateAdd(this, _paint);
      __privateAdd(this, _onControl);
      __privateAdd(this, _authored);
      __privateAdd(this, _revision3, 0);
      __privateAdd(this, _tail, Promise.resolve());
      __privateAdd(this, _listeners, /* @__PURE__ */ new Set());
      __privateAdd(this, _history, []);
      __privateAdd(this, _events, []);
      __privateSet(this, _host, host);
      const result = evaluateProjectSource(source3, { previous: saved?.graph });
      __privateSet(this, _webView, result.webView);
      __privateSet(this, _editorGraph, result.editorGraph);
      __privateSet(this, _authored, result.project);
      if (saved) {
        result.graph = GraphWorkspace.fromProject(saved.graph);
        result.project = result.graph.toProject();
        reconcileProject(result, saved.graph);
      }
      __privateSet(this, _graph2, result.graph);
      __privateSet(this, _source, source3);
      __privateSet(this, _view, validateView(saved?.view ? copy2(saved.view) : result.view, this.project));
      __privateSet(this, _files, validateProjectFiles(saved?.files ?? []));
      __privateSet(this, _composition, validateComposition(saved?.composition, __privateGet(this, _files), this.project));
      __privateSet(this, _visualPresentation, compositionPresentation(__privateGet(this, _composition), __privateGet(this, _files)));
      __privateSet(this, _observationStructure, observationStructure(__privateGet(this, _visualPresentation)));
      if (host) __privateSet(this, _host, {
        ...Object.fromEntries(["setParameter", "setParameterBatch", "readPublishedParameters", "sendEvent"].filter((key) => typeof host[key] === "function").map((key) => [key, host[key].bind(host)])),
        get ready() {
          return host.ready;
        },
        get diagnostics() {
          return host.diagnostics;
        },
        ...host.replaceGraph ? { replaceGraph: (graph, metadata) => host.replaceGraph(graph, { files: __privateGet(this, _files), composition: __privateGet(this, _composition), ...metadata }) } : {},
        ...host.updateMetadata ? { updateMetadata: (graph, metadata) => host.updateMetadata(graph, { files: __privateGet(this, _files), composition: __privateGet(this, _composition), ...metadata }) } : {}
      });
      __privateSet(this, _paint, result.paint);
      __privateSet(this, _onControl, result.onControl);
      __privateSet(this, _network, result.network);
      __privateSet(this, _declaredNetwork, result.network);
      __privateSet(this, _onNetwork, result.onNetwork);
      __privateSet(this, _onEvent, result.onEvent);
      __privateSet(this, _eventStateSchema, result.eventStateSchema);
      if (saved?.network && result.network) __privateSet(this, _network, networkSettings(saved.network));
      __privateSet(this, _eventState, jsonState(saved?.eventStateSchema === result.eventStateSchema && saved?.eventState !== void 0 ? saved.eventState : result.eventState));
      this.frame();
    }
    subscribe(listener) {
      __privateGet(this, _listeners).add(listener);
      return () => __privateGet(this, _listeners).delete(listener);
    }
    get project() {
      return __privateGet(this, _graph2).toProject();
    }
    get source() {
      return __privateGet(this, _source);
    }
    get revision() {
      return __privateGet(this, _revision3);
    }
    snapshot() {
      const graph = this.project;
      const audio2 = __privateGet(this, _editorGraph)?.deviceHierarchy ? devicePresentation(__privateGet(this, _editorGraph), graph, publicCatalog) : audioGraphPresentation(__privateGet(this, _editorGraph)?.audioGraphs, graph, publicCatalog, __privateGet(this, _editorGraph)?.layout ?? []);
      for (const node of audio2.audioNodes) if (node.sourceLinks) node.sourceLinks = node.sourceLinks.map((link) => link.declarationPath ? nodeDeclaration(__privateGet(this, _source), node, graph, link.declarationPath) : link);
      const key = JSON.stringify([graph.signal.nodes.map((n) => [n.id, n.type]), graph.instances]);
      if (!__privateGet(this, _sourceIndex) || __privateGet(this, _sourceIndex).source !== __privateGet(this, _source) || __privateGet(this, _sourceIndex).visual !== __privateGet(this, _visualPresentation) || __privateGet(this, _sourceIndex).key !== key) {
        __privateSet(this, _sourceIndex, {
          source: __privateGet(this, _source),
          visual: __privateGet(this, _visualPresentation),
          key,
          links: describeNodeSources(__privateGet(this, _source), graph, __privateGet(this, _composition), __privateGet(this, _visualPresentation).visualDefinitions)
        });
      }
      return copy2({
        revision: __privateGet(this, _revision3),
        observationRevision: __privateGet(this, _observationRevision),
        source: __privateGet(this, _source),
        graph,
        ...audio2,
        nodeSources: { ...__privateGet(this, _sourceIndex).links, ...Object.fromEntries(audio2.audioNodes.filter((n) => n.sourceLinks).map((n) => [n.id, n.sourceLinks])) },
        webView: __privateGet(this, _webView),
        editorGraph: __privateGet(this, _editorGraph),
        composition: __privateGet(this, _composition),
        ...__privateGet(this, _visualPresentation),
        componentReferences: __privateGet(this, _visualPresentation).componentNodes.filter((node) => node.referencePath).flatMap((node) => {
          const endpoint = graph.endpoints?.find((parameter2) => parameter2.path === node.referencePath);
          const source3 = audio2.audioNodes.find((item) => item.id === endpoint?.nodeId);
          const label2 = source3?.parameters.find((parameter2) => parameter2.path === node.referencePath)?.label;
          return source3 ? [{ from: source3.id, to: node.id, label: label2 || node.referencePath, path: node.referencePath }] : [];
        }),
        componentEdges: __privateGet(this, _visualPresentation).componentEdges.map((edge) => edge.from === graph.signal.nodes.find((n) => n.type === "output")?.id && graph.signal.io ? { ...edge, from: audio2.audioNodes.find((n) => n.instance === `/@outputs/${graph.signal.io.outputs[0]?.id}`)?.id ?? edge.from } : edge),
        files: __privateMethod(this, _LiveProjectRuntime_instances, fileManifest_fn).call(this),
        network: __privateGet(this, _network),
        view: __privateGet(this, _view),
        eventState: copy2(__privateGet(this, _eventState)),
        eventStateSchema: __privateGet(this, _eventStateSchema),
        history: __privateGet(this, _events),
        undoDepth: __privateGet(this, _history).length,
        running: Boolean(__privateGet(this, _host)?.ready),
        diagnostics: __privateGet(this, _host)?.diagnostics ?? null
      });
    }
    /** JS-authored immediate declarations, evaluated outside audio processing. */
    frame() {
      return paintFrame(__privateGet(this, _paint), this.snapshot(), __privateGet(this, _view));
    }
    /** A renderer can reuse the accepted snapshot delivered by subscribe().
     * Paint and host status remain live; no file/source copy is needed per frame.
     * Treat the supplied snapshot and the returned shared document as read-only.
     * With no argument, callers retain the existing detached-snapshot contract. */
    presentation(accepted) {
      const state = accepted ? { ...accepted, running: Boolean(__privateGet(this, _host)?.ready), diagnostics: __privateGet(this, _host)?.diagnostics ?? null } : this.snapshot();
      const types2 = new Map(state.graph.signal.nodes.map((node) => [node.id, configuredWorkspaceType(node)]));
      return { ...state, catalog: accepted ? frameCatalog : copy2(publicCatalog), components: paintFrame(__privateGet(this, _paint), state, __privateGet(this, _view)), parameters: [
        ...(state.graph.endpoints ?? []).map((endpoint) => ({
          ...endpoint,
          discrete: types2.get(endpoint.nodeId)?.parameters.find((p) => p.id === endpoint.id)?.discrete ?? false,
          value: state.graph.signal.initialParameters.find((p) => p.nodeId === endpoint.nodeId && p.id === endpoint.id)?.value
        })),
        ...(state.graph.controls ?? []).map((control) => ({ ...control, operation: "control.set" }))
      ] };
    }
    request(request) {
      const apply = () => __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, request);
      const result = __privateGet(this, _tail).then(apply);
      __privateSet(this, _tail, result.catch(() => {
      }));
      return result;
    }
    save() {
      return {
        format: "manifold.live-project",
        version: 1,
        source: __privateGet(this, _source),
        files: __privateGet(this, _files).map((file) => ({ ...file })),
        composition: copy2(__privateGet(this, _composition)),
        graph: this.project,
        ...__privateGet(this, _network) ? { network: copy2(__privateGet(this, _network)) } : {},
        view: copy2(__privateGet(this, _view)),
        eventState: copy2(__privateGet(this, _eventState)),
        eventStateSchema: __privateGet(this, _eventStateSchema)
      };
    }
    /** Host automation/readback updates accepted targets without a second DSP bank. */
    adoptPublishedParameters(edits) {
      for (const edit of edits) __privateGet(this, _graph2).setParameter(__privateGet(this, _graph2).find(edit.nodeId), edit.id, edit.value);
      if (edits.length) for (const listener of __privateGet(this, _listeners)) {
        try {
          listener(this.snapshot());
        } catch (error) {
          console.error("Project view listener failed", error);
        }
      }
      return this.project;
    }
  };
  _onEvent = new WeakMap();
  _eventState = new WeakMap();
  _eventStateSchema = new WeakMap();
  _deviceMidi = new WeakMap();
  _network = new WeakMap();
  _onNetwork = new WeakMap();
  _declaredNetwork = new WeakMap();
  _webView = new WeakMap();
  _editorGraph = new WeakMap();
  _files = new WeakMap();
  _composition = new WeakMap();
  _visualPresentation = new WeakMap();
  _sourceIndex = new WeakMap();
  _observationRevision = new WeakMap();
  _observationStructure = new WeakMap();
  _host = new WeakMap();
  _graph2 = new WeakMap();
  _source = new WeakMap();
  _view = new WeakMap();
  _paint = new WeakMap();
  _onControl = new WeakMap();
  _authored = new WeakMap();
  _revision3 = new WeakMap();
  _tail = new WeakMap();
  _listeners = new WeakMap();
  _history = new WeakMap();
  _events = new WeakMap();
  _LiveProjectRuntime_instances = new WeakSet();
  emit_fn = function(event) {
    __privateGet(this, _events).push({ ...event, revision: __privateGet(this, _revision3), at: (/* @__PURE__ */ new Date()).toISOString() });
    if (__privateGet(this, _events).length > 100) __privateGet(this, _events).shift();
    for (const listener of __privateGet(this, _listeners)) {
      try {
        listener(this.snapshot());
      } catch (error) {
        console.error("Project view listener failed", error);
      }
    }
  };
  remember_fn = function() {
    __privateGet(this, _history).push({ source: __privateGet(this, _source), graph: this.project, files: __privateGet(this, _files), composition: copy2(__privateGet(this, _composition)), view: copy2(__privateGet(this, _view)), network: copy2(__privateGet(this, _network)), authored: __privateGet(this, _authored), eventState: copy2(__privateGet(this, _eventState)), eventStateSchema: __privateGet(this, _eventStateSchema) });
    if (__privateGet(this, _history).length > 32) __privateGet(this, _history).shift();
  };
  fileManifest_fn = function() {
    return [
      ...projectFileManifest(__privateGet(this, _files), __privateGet(this, _source), __privateGet(this, _webView)?.source),
      ...__privateGet(this, _editorGraph)?.audioGraphs ? [{ path: "/audio-graphs.json", mediaType: "application/json", virtual: true, bytes: JSON.stringify(__privateGet(this, _editorGraph).audioGraphs).length }] : [],
      { path: "/composition.json", mediaType: "application/json", virtual: true, bytes: JSON.stringify(__privateGet(this, _composition)).length }
    ];
  };
  adoptPresentation_fn = function(presentation, force = false) {
    const structure2 = observationStructure(presentation);
    if (force || structure2 !== __privateGet(this, _observationStructure)) __privateSet(this, _observationRevision, __privateGet(this, _revision3) + 1);
    __privateSet(this, _observationStructure, structure2);
    __privateSet(this, _visualPresentation, presentation);
  };
  acceptComposition_fn = async function(composition, files, origin, operation) {
    const next = validateComposition(composition, files, this.project);
    const presentation = compositionPresentation(next, files);
    const { graph, ...metadata } = this.save();
    if (__privateGet(this, _host)?.ready && __privateGet(this, _host).updateMetadata) {
      if (await __privateGet(this, _host).updateMetadata(graph, { ...metadata, files, composition: next }) === false) failure("host-rejected", "Host rejected project metadata");
    }
    __privateMethod(this, _LiveProjectRuntime_instances, remember_fn).call(this);
    __privateSet(this, _composition, next);
    __privateSet(this, _files, files);
    __privateMethod(this, _LiveProjectRuntime_instances, adoptPresentation_fn).call(this, presentation);
    __privateWrapper(this, _revision3)._++;
    __privateMethod(this, _LiveProjectRuntime_instances, emit_fn).call(this, { origin, operation, publicationMs: 0 });
    return this.snapshot();
  };
  apply_fn = async function({ operation, expectedRevision, origin = "human", ...args }) {
    if (operation === "project.inspect") return this.presentation();
    if (operation === "file.list") return __privateMethod(this, _LiveProjectRuntime_instances, fileManifest_fn).call(this);
    if (operation === "file.read") {
      const path = projectFilePath(args.path);
      if (path === "/composition.json") return { path, mediaType: "application/json", encoding: "utf8", content: JSON.stringify(__privateGet(this, _composition), null, 2) };
      if (path === "/audio-graphs.json") return { path, mediaType: "application/json", encoding: "utf8", content: JSON.stringify(__privateGet(this, _editorGraph)?.audioGraphs ?? { version: 1, definitions: [], instances: [] }, null, 2) };
      if (path === "/project.mjs") return { path, mediaType: "text/javascript", encoding: "utf8", content: __privateGet(this, _source) };
      if (path === "/presentation.mjs" && __privateGet(this, _webView)) return { path, mediaType: "text/javascript", encoding: "utf8", content: __privateGet(this, _webView).source };
      const file = __privateGet(this, _files).find((item) => item.path === path);
      if (!file) failure("missing-file", `Unknown project file ${path}`);
      return copy2(file);
    }
    if (operation === "catalog.list") return copy2(publicCatalog);
    if (operation === "project.save") return { ...this.project, liveAuthoring: {
      format: "manifold.live-project",
      version: 1,
      source: __privateGet(this, _source),
      files: copy2(__privateGet(this, _files)),
      composition: copy2(__privateGet(this, _composition)),
      ...__privateGet(this, _network) ? { network: __privateGet(this, _network) } : {},
      view: copy2(__privateGet(this, _view)),
      eventState: copy2(__privateGet(this, _eventState)),
      eventStateSchema: __privateGet(this, _eventStateSchema)
    } };
    if (expectedRevision !== void 0 && expectedRevision !== __privateGet(this, _revision3)) {
      failure("revision-conflict", `Expected revision ${expectedRevision}; current revision is ${__privateGet(this, _revision3)}`);
    }
    if (operation.startsWith("component.")) {
      if (!args.scope && args.id !== void 0) {
        const node = __privateGet(this, _visualPresentation).componentNodes.find((node2) => node2.id === args.id);
        if (node?.ownerDefinition) args = { ...args, id: node.localId, scope: node.ownerDefinition };
      }
      const next = editComposition(__privateGet(this, _composition), __privateGet(this, _files), this.project, { operation, ...args });
      return __privateMethod(this, _LiveProjectRuntime_instances, acceptComposition_fn).call(this, next.composition, next.files, origin, operation);
    }
    if (operation.startsWith("graph.")) {
      if (operation === "graph.group" && Array.isArray(args.paths)) {
        const nodes = args.paths.map((path) => __privateGet(this, _visualPresentation).componentNodes.find((node) => node.instance === path));
        const first = nodes.find(Boolean);
        if (first) {
          if (nodes.some((node) => !node || node.implementationKind.startsWith("interface-") || node.scope !== first.scope))
            failure("invalid-composition", "Select visual nodes in the same graph to group them");
          return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, {
            operation: "component.group",
            ids: nodes.map((node) => node.localId),
            scope: nodes[0].ownerDefinition || void 0,
            label: args.label,
            expectedRevision,
            origin
          });
        }
      }
      if (operation === "graph.ungroup") {
        const group = __privateGet(this, _visualPresentation).componentGroups.find((group2) => group2.id === args.id);
        if (group) return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, {
          operation: "component.ungroup",
          group: group.localId,
          scope: group.ownerDefinition || void 0,
          expectedRevision,
          origin
        });
      }
      const visual = __privateGet(this, _visualPresentation).componentNodes.find((node) => node.id === args.id || node.instance === args.path);
      if (visual && operation === "graph.remove") return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, { operation: "component.remove", id: visual.id, expectedRevision, origin });
      if (visual && operation === "graph.position") return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, { operation: "component.update", id: visual.id, changes: { position: [args.x, args.y] }, expectedRevision, origin });
      const to = __privateGet(this, _visualPresentation).componentNodes.find((node) => node.instance === args.to);
      if (to && ["graph.connect", "graph.disconnect"].includes(operation)) {
        const source3 = __privateGet(this, _visualPresentation).componentNodes.find((node) => node.instance === args.from);
        if (source3 && source3.scope !== to.scope) failure("invalid-composition", "Connect through the named graph interface");
        const from = args.from === "@output" || args.from === `/@outputs/${this.project.signal.io?.outputs[0]?.id}` ? this.project.signal.nodes.find((node) => node.type === "output")?.id : source3?.localId ?? this.project.instances?.find((node) => node.path === args.from)?.nodeId;
        return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, { operation: operation.replace("graph.", "component."), scope: to.ownerDefinition || void 0, from, output: args.output, to: to.localId, input: args.input, expectedRevision, origin });
      }
    }
    if (operation === "file.write") {
      const path = projectFilePath(args.path);
      if (args.expectedContent !== void 0) {
        const current2 = await __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, { operation: "file.read", path });
        const same = ["/composition.json", "/audio-graphs.json"].includes(path) ? canonicalJSON(current2.content) === canonicalJSON(args.expectedContent) : current2.content === args.expectedContent;
        if (!same) failure("file-conflict", "Accepted file changed. Merge or reload your draft before saving.");
      }
      if (path === "/composition.json") {
        if (args.encoding !== "utf8" || args.mediaType !== "application/json") failure("invalid-file", "Composition is JSON text");
        return __privateMethod(this, _LiveProjectRuntime_instances, acceptComposition_fn).call(this, JSON.parse(args.content), __privateGet(this, _files), origin, operation);
      }
      if (path === "/audio-graphs.json") {
        if (args.encoding !== "utf8" || args.mediaType !== "application/json") failure("invalid-file", "Audio graphs are JSON text");
        return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, { operation: "graph.audio.replace", value: JSON.parse(args.content), expectedRevision, origin });
      }
      if (path === "/project.mjs") {
        if (args.encoding !== "utf8" || args.mediaType !== "text/javascript") failure("invalid-file", "Project source is JavaScript text");
        return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, { operation: "source.apply", source: args.content, expectedRevision, origin });
      }
      if (path === "/presentation.mjs") {
        if (!__privateGet(this, _webView) || args.encoding !== "utf8" || args.mediaType !== "text/javascript") failure("invalid-file", "No editable JavaScript presentation");
        return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, { operation: "source.apply", source: replaceWebViewSource(__privateGet(this, _source), args.content), expectedRevision, origin });
      }
      const files = __privateGet(this, _files).filter((item) => item.path !== path);
      files.push({ path, mediaType: args.mediaType, encoding: args.encoding, content: args.content });
      const next = validateProjectFiles(files);
      return __privateMethod(this, _LiveProjectRuntime_instances, acceptComposition_fn).call(this, __privateGet(this, _composition), next, origin, operation);
    }
    if (operation === "file.remove") {
      const path = projectFilePath(args.path);
      if (["/project.mjs", "/presentation.mjs", "/composition.json", "/audio-graphs.json"].includes(path)) failure("invalid-file", "Root project files cannot be removed");
      if (!__privateGet(this, _files).some((item) => item.path === path)) failure("missing-file", `Unknown project file ${path}`);
      return __privateMethod(this, _LiveProjectRuntime_instances, acceptComposition_fn).call(this, __privateGet(this, _composition), __privateGet(this, _files).filter((item) => item.path !== path), origin, operation);
    }
    if (["graph.wrap", "graph.addInstance", "graph.audio.replace", "graph.add", "graph.addModule", "graph.remove", "graph.connect", "graph.disconnect", "graph.position", "graph.group", "graph.ungroup"].includes(operation)) {
      const editedSource = __privateGet(this, _editorGraph)?.deviceHierarchy ? planDeviceEdit(__privateGet(this, _source), { operation, ...args }, this.project, __privateGet(this, _editorGraph)) : planStudioGraphEdit(__privateGet(this, _source), { operation, ...args }, this.project);
      if (["graph.position", "graph.group", "graph.ungroup"].includes(operation) && !__privateGet(this, _editorGraph)?.deviceHierarchy && studioGraphMetadataOnly(__privateGet(this, _source)) && __privateGet(this, _editorGraph) && JSON.stringify(__privateGet(this, _editorGraph)) === JSON.stringify(readStudioGraph(__privateGet(this, _source)).value)) {
        return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, {
          operation: "studio.metadata",
          source: editedSource,
          expectedRevision,
          origin,
          semanticOperation: operation,
          metadataEditToken
        });
      }
      return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, {
        operation: "source.apply",
        source: editedSource.source ?? editedSource,
        expectedRevision,
        origin,
        semanticOperation: operation,
        deviceEditToken,
        identityMoves: editedSource.identityMoves
      });
    }
    if (operation === "parameter.expose") {
      const definition2 = args.definition;
      const instance = this.project.instances?.find((item) => item.path === definition2?.instance);
      const node = this.project.signal.nodes.find((item) => item.id === instance?.nodeId);
      const parameter2 = publicCatalog[node?.type]?.parameters.find((item) => item.name === definition2?.parameter);
      if (!parameter2) failure("missing-parameter", "Unknown named primitive parameter");
      if (this.project.endpoints?.some((item) => item.nodeId === node.id && item.id === parameter2.id))
        failure("parameter-exposed", "Parameter is already exposed; place its existing binding");
      if (this.project.endpoints?.some((item) => item.path === definition2.path)) failure("duplicate-path", "Parameter path already exists");
      const editedSource = __privateGet(this, _editorGraph)?.deviceHierarchy ? planDeviceEdit(__privateGet(this, _source), { operation, definition: definition2 }, this.project, __privateGet(this, _editorGraph)) : exposeStudioParameter(__privateGet(this, _source), definition2);
      return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, { operation: "source.apply", source: editedSource.source ?? editedSource, expectedRevision, origin, semanticOperation: operation });
    }
    if (operation === "presentation.insert" || operation === "presentation.update") {
      if (operation === "presentation.insert" && !this.presentation().parameters.some((item) => item.path === args.path))
        failure("missing-parameter", "Unknown parameter binding");
      const editedSource = editStudioLayout(__privateGet(this, _source), __privateGet(this, _webView)?.layout ?? [], { operation, ...args });
      return __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, { operation: "source.apply", source: editedSource.source ?? editedSource, expectedRevision, origin, semanticOperation: operation });
    }
    if (operation === "network.configure") {
      const started2 = performance.now();
      if (!__privateGet(this, _network)) failure("missing-network", "Project has no network service declaration");
      const next = { ...__privateGet(this, _network), ...args.settings };
      if (args.settings?.link) next.link = { ...__privateGet(this, _network).link, ...args.settings.link };
      __privateSet(this, _network, networkSettings(next));
      __privateWrapper(this, _revision3)._++;
      __privateMethod(this, _LiveProjectRuntime_instances, emit_fn).call(this, { origin, operation, publicationMs: performance.now() - started2 });
      return this.snapshot();
    }
    if (operation === "network.receive") {
      if (!__privateGet(this, _onNetwork)) return this.snapshot();
      const mapping = __privateGet(this, _onNetwork).call(this, Object.freeze(jsonState(args.event)), this.snapshot());
      if (mapping?.then) failure("invalid-network", "Network mapping must be synchronous");
      if (!mapping) return this.snapshot();
      const command = mapping.command;
      if (!["parameter.set", "parameter.batch", "control.set", "control.batch"].includes(command?.operation)) {
        failure("invalid-network", "Network handlers return a parameter/control command");
      }
      const reply = jsonState(mapping.reply ?? null);
      const accepted = await __privateMethod(this, _LiveProjectRuntime_instances, apply_fn).call(this, { ...command, origin });
      return { ...accepted, networkReply: reply };
    }
    const started = performance.now();
    if (operation === "parameter.set" || operation === "parameter.batch") {
      const edits = operation === "parameter.set" ? [{ path: args.path, value: args.value }] : args.edits;
      if (!Array.isArray(edits) || !edits.length || new Set(edits.map((edit) => edit.path)).size !== edits.length) failure("invalid-parameters", "Expected nonempty distinct parameter edits");
      const project = this.project, candidate = __privateGet(this, _graph2).fork();
      const resolved = edits.map((edit) => {
        const endpoint = project.endpoints?.find((entry) => entry.path === edit.path);
        if (!endpoint) failure("missing-endpoint", `Unknown parameter ${edit.path}`);
        candidate.setParameter(candidate.find(endpoint.nodeId), endpoint.id, edit.value);
        return { nodeId: endpoint.nodeId, id: endpoint.id, value: edit.value };
      });
      if (__privateGet(this, _host)?.ready) {
        if (resolved.length > 1 && !__privateGet(this, _host).setParameterBatch) failure("host-capability", "Host does not support atomic parameter batches");
        const accepted = __privateGet(this, _host).setParameterBatch ? await __privateGet(this, _host).setParameterBatch(resolved) : await __privateGet(this, _host).setParameter(resolved[0]);
        if (accepted === false) failure("host-rejected", "Audio host rejected the parameter edit");
      }
      __privateSet(this, _graph2, candidate);
    } else if (operation === "control.set" || operation === "control.batch") {
      if (!__privateGet(this, _onControl)) failure("missing-controller", "Project source must define onControl");
      const edits = operation === "control.set" ? [{ path: args.path, value: args.value }] : args.edits;
      if (!Array.isArray(edits) || !edits.length || new Set(edits.map((e) => e.path)).size !== edits.length) failure("invalid-controls", "Expected nonempty distinct control edits");
      let candidate = __privateGet(this, _graph2).fork();
      const before = this.project;
      for (const edit of edits) {
        candidate.setControl(edit.path, edit.value);
        const stage = (parameters, control) => {
          if (control?.path !== edit.path || control.value !== edit.value) failure("invalid-control", "Mapping must commit the requested control");
          for (const p of parameters) candidate.setParameter(candidate.find(p.nodeId), p.id, p.value);
        };
        const result = __privateGet(this, _onControl).call(this, Object.freeze({
          toProject: () => candidate.toProject(),
          transaction: (update) => {
            const draft = candidate.fork(), outcome = update(draft);
            if (outcome?.then) failure("invalid-control", "Graph transaction must be synchronous");
            candidate = GraphWorkspace.fromProject(draft.toProject());
          },
          parameterWithControl: (p, c) => stage([p], c),
          parametersWithControl: stage
        }), edit.path, edit.value);
        if (result?.then) failure("invalid-control", "Control mapping must be synchronous");
        if (candidate.findControl(edit.path)?.value !== edit.value) failure("invalid-control", "Mapping must retain the requested control value");
      }
      const project = candidate.toProject(), structural = structure(project) !== structure(before);
      validateView(__privateGet(this, _view), project);
      paintFrame(__privateGet(this, _paint), { ...this.snapshot(), graph: project, revision: __privateGet(this, _revision3) + 1 }, __privateGet(this, _view));
      const resolved = project.signal.initialParameters.filter((p) => before.signal.initialParameters.find((old) => old.nodeId === p.nodeId && old.id === p.id)?.value !== p.value);
      if (__privateGet(this, _host)?.ready && structural) {
        if (!__privateGet(this, _host).replaceGraph) failure("host-capability", "Host does not support prepared graph transactions");
        if (await __privateGet(this, _host).replaceGraph(project, { source: __privateGet(this, _source), view: __privateGet(this, _view), eventState: __privateGet(this, _eventState), eventStateSchema: __privateGet(this, _eventStateSchema) }) === false) failure("host-rejected", "Audio host rejected the graph transaction");
      } else if (__privateGet(this, _host)?.ready && resolved.length) {
        if (resolved.length > 1 && !__privateGet(this, _host).setParameterBatch) failure("host-capability", "Host does not support atomic parameter batches");
        const accepted = __privateGet(this, _host).setParameterBatch ? await __privateGet(this, _host).setParameterBatch(resolved) : await __privateGet(this, _host).setParameter(resolved[0]);
        if (accepted === false) failure("host-rejected", "Audio host rejected the control edit");
      }
      __privateSet(this, _graph2, candidate);
    } else if (operation === "event.send" || operation === "event.midi") {
      const decoded = operation === "event.midi" ? decodeMidiControl(args.bytes ?? [], args.owner) : args.event;
      if (__privateGet(this, _editorGraph)?.deviceHierarchy && !__privateGet(this, _onEvent)) {
        const input = this.project.signal.nodes.find((node) => node.type === "midi-input");
        if (!input) failure("missing-midi-input", "Declare a MIDI input before playing this Device");
        await __privateGet(this, _deviceMidi).send(__privateGet(this, _host), input.id, decoded);
      } else {
        if (!__privateGet(this, _onEvent)) failure("missing-controller", "Project source must define onEvent");
        const candidate = __privateGet(this, _graph2).fork(), before = this.project;
        const parameters = (edits) => {
          for (const p of edits) candidate.setParameter(candidate.find(p.nodeId), p.id, p.value);
        };
        const withControl = (edits, control) => {
          candidate.setControl(control.path, control.value);
          parameters(edits);
        };
        const session = Object.freeze({
          toProject: () => candidate.toProject(),
          parameters,
          parameterWithControl: (p, c) => withControl([p], c),
          parametersWithControl: withControl
        });
        if (!decoded) failure("invalid-event", "Unsupported or incomplete MIDI event");
        const event = jsonState({ ...decoded, at: performance.now() / 1e3 });
        const nextState = __privateGet(this, _onEvent).call(this, session, event, copy2(__privateGet(this, _eventState)));
        if (nextState?.then) failure("invalid-event", "Event mapping must be synchronous");
        const state = jsonState(nextState);
        const resolved = candidate.toProject().signal.initialParameters.filter((p) => before.signal.initialParameters.find((old) => old.nodeId === p.nodeId && old.id === p.id)?.value !== p.value);
        if (__privateGet(this, _host)?.ready && resolved.length) {
          if (resolved.length > 1 && !__privateGet(this, _host).setParameterBatch) failure("host-capability", "Host does not support atomic event targets");
          const accepted = __privateGet(this, _host).setParameterBatch ? await __privateGet(this, _host).setParameterBatch(resolved) : await __privateGet(this, _host).setParameter(resolved[0]);
          if (accepted === false) failure("host-rejected", "Audio host rejected the event");
        }
        __privateSet(this, _graph2, candidate);
        __privateSet(this, _eventState, state);
      }
    } else if (operation === "studio.metadata") {
      if (args.metadataEditToken !== metadataEditToken) failure("invalid-operation", "Metadata edit must be planned from a graph command");
      const previous = readStudioGraph(__privateGet(this, _source)).value;
      const next = readStudioGraph(args.source).value;
      const dspShape = (value) => {
        const shape = copy2(value);
        delete shape.layout;
        delete shape.groups;
        return JSON.stringify(shape);
      };
      if (dspShape(previous) !== dspShape(next)) failure("invalid-operation", "Metadata edit changed the authored DSP graph");
      if (__privateGet(this, _host)?.ready) {
        const metadata = {
          source: args.source,
          view: copy2(__privateGet(this, _view)),
          eventState: copy2(__privateGet(this, _eventState)),
          eventStateSchema: __privateGet(this, _eventStateSchema),
          ...__privateGet(this, _network) ? { network: copy2(__privateGet(this, _network)) } : {}
        };
        const accepted = __privateGet(this, _host).updateMetadata ? await __privateGet(this, _host).updateMetadata(this.project, metadata) : await __privateGet(this, _host).replaceGraph(this.project, metadata);
        if (accepted === false) failure("host-rejected", "Audio host rejected the metadata edit");
      }
      __privateMethod(this, _LiveProjectRuntime_instances, remember_fn).call(this);
      __privateSet(this, _source, args.source);
      __privateSet(this, _editorGraph, next);
    } else if (operation === "source.apply") {
      const moves = args.deviceEditToken === deviceEditToken ? args.identityMoves : null;
      const previous = moveDeviceIdentities(this.project, moves);
      const result = evaluateProjectSource(args.source, { previous });
      const authored = result.project;
      const nextNetwork = JSON.stringify(result.network) === JSON.stringify(__privateGet(this, _declaredNetwork)) ? __privateGet(this, _network) : result.network;
      const eventState = result.eventStateSchema === __privateGet(this, _eventStateSchema) ? __privateGet(this, _eventState) : result.eventState;
      retainUnchangedTargets(moveDeviceIdentities(__privateGet(this, _authored), moves), previous, result);
      reconcileProject(result, this.project);
      validateComposition(__privateGet(this, _composition), __privateGet(this, _files), result.project);
      paintFrame(result.paint, { ...this.snapshot(), graph: result.project, source: args.source, view: result.view, eventState, eventStateSchema: result.eventStateSchema, revision: __privateGet(this, _revision3) + 1 }, result.view);
      const presentationOnly = ["graph.wrap", "graph.audio.replace", "graph.position", "graph.group", "graph.ungroup"].includes(args.semanticOperation) && JSON.stringify(result.project) === JSON.stringify(this.project);
      if (__privateGet(this, _host)?.ready) {
        const accepted = presentationOnly && __privateGet(this, _host).updateMetadata ? await __privateGet(this, _host).updateMetadata(result.project, { source: args.source, view: result.view, eventState, eventStateSchema: result.eventStateSchema, ...nextNetwork ? { network: nextNetwork } : {} }) : await __privateGet(this, _host).replaceGraph(result.project, { source: args.source, view: result.view, eventState, eventStateSchema: result.eventStateSchema, ...nextNetwork ? { network: nextNetwork } : {} });
        if (accepted === false) failure("host-rejected", "Audio host rejected the project update");
      }
      __privateMethod(this, _LiveProjectRuntime_instances, remember_fn).call(this);
      const keepController = presentationOnly && ["graph.wrap", "graph.audio.replace"].includes(args.semanticOperation) && !__privateGet(this, _editorGraph)?.deviceHierarchy && studioGraphMetadataOnly(__privateGet(this, _source));
      __privateSet(this, _source, args.source);
      __privateSet(this, _editorGraph, result.editorGraph);
      if (!keepController) {
        __privateSet(this, _graph2, result.graph);
        __privateSet(this, _view, result.view);
        __privateSet(this, _paint, result.paint);
        __privateSet(this, _webView, result.webView);
        __privateSet(this, _onControl, result.onControl);
        __privateSet(this, _network, nextNetwork);
        __privateSet(this, _declaredNetwork, result.network);
        __privateSet(this, _onNetwork, result.onNetwork);
        __privateSet(this, _onEvent, result.onEvent);
        __privateSet(this, _eventStateSchema, result.eventStateSchema);
        __privateSet(this, _eventState, jsonState(eventState));
      }
      __privateSet(this, _authored, authored);
    } else if (operation === "project.restore") {
      const saved = args.project?.format === "manifold.project" && args.project.liveAuthoring ? { ...args.project.liveAuthoring, graph: args.project } : args.project;
      if (saved?.format !== "manifold.live-project" || saved.version !== 1) failure("invalid-project", "Expected a saved live project");
      const files = validateProjectFiles(saved.files ?? []);
      const result = evaluateProjectSource(saved.source, { previous: saved.graph });
      const restoredNetwork = networkSettings(saved.network ?? result.network);
      result.graph = GraphWorkspace.fromProject(saved.graph);
      result.project = result.graph.toProject();
      reconcileProject(result, saved.graph);
      const graph = result.graph;
      const composition = validateComposition(saved.composition, files, graph.toProject());
      const eventState = jsonState(saved.eventStateSchema === result.eventStateSchema && saved.eventState !== void 0 ? saved.eventState : result.eventState);
      validateView(saved.view ?? result.view, graph.toProject());
      paintFrame(result.paint, { ...this.snapshot(), graph: graph.toProject(), source: saved.source, view: saved.view ?? result.view, eventState, eventStateSchema: result.eventStateSchema, revision: __privateGet(this, _revision3) + 1 }, saved.view ?? result.view);
      if (__privateGet(this, _host)?.ready && await __privateGet(this, _host).replaceGraph(graph.toProject(), { source: saved.source, files, composition, view: saved.view ?? result.view, eventState, eventStateSchema: result.eventStateSchema, ...restoredNetwork ? { network: restoredNetwork } : {} }) === false) failure("host-rejected", "Audio host rejected the project");
      if (args.newDocument === true) __privateSet(this, _history, []);
      else __privateMethod(this, _LiveProjectRuntime_instances, remember_fn).call(this);
      __privateSet(this, _deviceMidi, new DeviceMidiInput());
      __privateSet(this, _graph2, graph);
      __privateSet(this, _source, saved.source);
      __privateSet(this, _files, files);
      __privateSet(this, _view, copy2(saved.view ?? result.view));
      __privateSet(this, _paint, result.paint);
      __privateSet(this, _webView, result.webView);
      __privateSet(this, _editorGraph, result.editorGraph);
      __privateSet(this, _composition, composition);
      __privateMethod(this, _LiveProjectRuntime_instances, adoptPresentation_fn).call(this, compositionPresentation(composition, files), true);
      __privateSet(this, _onControl, result.onControl);
      __privateSet(this, _network, restoredNetwork);
      __privateSet(this, _declaredNetwork, result.network);
      __privateSet(this, _onNetwork, result.onNetwork);
      __privateSet(this, _onEvent, result.onEvent);
      __privateSet(this, _eventStateSchema, result.eventStateSchema);
      __privateSet(this, _eventState, eventState);
      __privateSet(this, _authored, result.project);
    } else if (operation === "project.undo") {
      const previous = __privateGet(this, _history).at(-1);
      if (!previous) failure("empty-history", "No authored edit to undo");
      const result = evaluateProjectSource(previous.source);
      const graph = GraphWorkspace.fromProject(previous.graph);
      const restoredAssignments = graph.listHostAssignments();
      graph.reserveHostSlots(__privateGet(this, _graph2).listHostAssignments().filter((entry) => !restoredAssignments.some((previous2) => previous2.slot === entry.slot || entry.path !== void 0 && previous2.path === entry.path)));
      const visualPresentation = compositionPresentation(previous.composition, previous.files);
      const filesOnly = previous.source === __privateGet(this, _source) && JSON.stringify(previous.graph) === JSON.stringify(this.project) && JSON.stringify(previous.view) === JSON.stringify(__privateGet(this, _view)) && JSON.stringify(previous.network) === JSON.stringify(__privateGet(this, _network));
      if (__privateGet(this, _host)?.ready && (!filesOnly || __privateGet(this, _host).updateMetadata)) {
        const publish = filesOnly && __privateGet(this, _host).updateMetadata ? __privateGet(this, _host).updateMetadata : __privateGet(this, _host).replaceGraph;
        if (await publish(graph.toProject(), { source: previous.source, files: previous.files, composition: previous.composition, view: previous.view, eventState: previous.eventState, eventStateSchema: previous.eventStateSchema, ...previous.network ? { network: previous.network } : {} }) === false) failure("host-rejected", "Audio host rejected undo");
      }
      __privateGet(this, _history).pop();
      __privateSet(this, _graph2, graph);
      __privateSet(this, _source, previous.source);
      __privateSet(this, _files, previous.files);
      __privateSet(this, _view, previous.view);
      __privateSet(this, _paint, result.paint);
      __privateSet(this, _webView, result.webView);
      __privateSet(this, _editorGraph, result.editorGraph);
      __privateSet(this, _composition, previous.composition);
      __privateMethod(this, _LiveProjectRuntime_instances, adoptPresentation_fn).call(this, visualPresentation);
      __privateSet(this, _onControl, result.onControl);
      __privateSet(this, _network, previous.network ?? result.network);
      __privateSet(this, _declaredNetwork, result.network);
      __privateSet(this, _onNetwork, result.onNetwork);
      __privateSet(this, _onEvent, result.onEvent);
      __privateSet(this, _eventStateSchema, previous.eventStateSchema);
      __privateSet(this, _eventState, copy2(previous.eventState));
      __privateSet(this, _authored, previous.authored);
    } else failure("unknown-operation", `Unknown live operation ${operation}`);
    if (__privateGet(this, _host)?.ready && __privateGet(this, _host).readPublishedParameters) {
      for (const p of __privateGet(this, _host).readPublishedParameters()) {
        __privateGet(this, _graph2).setParameter(__privateGet(this, _graph2).find(p.nodeId), p.id, p.value);
      }
    }
    __privateWrapper(this, _revision3)._++;
    __privateMethod(this, _LiveProjectRuntime_instances, emit_fn).call(this, { origin, operation: args.semanticOperation ?? operation, path: args.path, publicationMs: performance.now() - started });
    return this.snapshot();
  };

  // packages/manifold-author/native-project.js
  globalThis.performance ?? (globalThis.performance = { now: () => Date.now() });
  globalThis.console ?? (globalThis.console = { error() {
  } });
  function createLiveCreatorProject(host, defaultSource, saved = null) {
    const metadata = saved?.liveAuthoring;
    const runtime = new LiveProjectRuntime(
      {
        ready: true,
        sendEvent: (event) => host.sendEvent(event),
        setParameter: (edit) => host.setParameter(edit),
        setParameterBatch: (edits) => host.setParameterBatch(edits),
        replaceGraph: (project, metadata2) => host.replaceGraph({
          ...project,
          liveAuthoring: {
            format: "manifold.live-project",
            version: 1,
            ...metadata2
          }
        }),
        updateMetadata: (project, metadata2) => host.updateMetadata({
          ...project,
          liveAuthoring: {
            format: "manifold.live-project",
            version: 1,
            ...metadata2
          }
        })
      },
      metadata?.source ?? defaultSource,
      metadata ? { ...metadata, graph: saved } : null
    );
    const toProject = () => {
      const { graph, ...metadata2 } = runtime.save();
      return { ...graph, liveAuthoring: metadata2 };
    };
    return {
      toProject,
      async request(command) {
        await runtime.request(command);
        return toProject();
      },
      async set(path, value) {
        await runtime.request({
          operation: runtime.project.controls?.some((c) => c.path === path) ? "control.set" : "parameter.set",
          path,
          value,
          origin: "native"
        });
        return toProject();
      },
      adoptPublishedParameters(edits) {
        runtime.adoptPublishedParameters(edits);
        return toProject();
      },
      presentation: () => runtime.presentation()
    };
  }

  // packages/manifold-author/examples/standalone-oscillator-source.generated.mjs
  var source2 = "// Imports \u2014 public tools, primitive definitions and reusable orchestration.\n// Examples name imports so you can trace each tool to its module.\n// Alternative: import * as manifold from '@manifold/author';\n// Then use manifold.createGraphWorkspace(), manifold.gain, etc.\nimport {\n  extendedOscillator as extendedOscillatorDefinition,\n  gain as gainDefinition,\n  mixer9 as mixer9Definition,\n} from '@manifold/author/primitives';\nimport { GraphContractError, createGraphWorkspace, createLiveGraphSession } from '@manifold/author';\nimport { chooseMainVoice } from '@manifold/author/examples/main-voice-control';\nimport { oscillatorPreviewCurves } from '@manifold/author/examples/oscillator-preview';\nimport { adsr as adsrDefinition } from '@manifold/author/primitives';\n\n// Reusable graph definition \u2014 inspect and edit the authored voice factory below.\nconst OSC_BASE = '/midi/synth/rack/osc/1';\nconst hz = (note) => 440 * 2 ** ((note - 69) / 12);\nconst voicePath = (index) => `${OSC_BASE}/voice/${index}`;\nconst oscillatorPath = (index) => `${OSC_BASE}/nodes/${index === 9 ? 'manual' : `voice_${index}`}`;\n/** Add the original eight voices, manual voice, nine-input mixer, and output gain. */\nfunction addRackOscillatorModule(\n  graph,\n  { firstVoiceId = 4, mixerId = 13, outputId = 21, connectOutput = false } = {},\n) {\n  const oscillators = [];\n  for (let index = 1; index <= 9; index++) {\n    const oscillator = graph.add(extendedOscillatorDefinition.type, {\n      id: firstVoiceId + index - 1,\n    });\n    graph.registerInstance(oscillatorPath(index), oscillator);\n    oscillator.parameter('waveform').set(1);\n    oscillator.parameter('frequency').set(index === 9 ? hz(60) : 220);\n    oscillator.parameter('level').set(0);\n    if (index <= 8) oscillator.parameter('retriggerOnLevelRise').set(1);\n    oscillators.push(oscillator);\n  }\n  const mixer = graph.add(mixer9Definition.type, { id: mixerId });\n  graph.registerInstance(`${OSC_BASE}/nodes/mixer`, mixer);\n  for (let index = 0; index < oscillators.length; index++) {\n    graph.connect(oscillators[index].output('out'), mixer.input(`in-${index + 1}`));\n  }\n  const output = graph.add(gainDefinition.type, { id: outputId });\n  graph.registerInstance(`${OSC_BASE}/nodes/output`, output);\n  output.parameter('level').set(0.2);\n  graph.connect(mixer.output('out'), output.input('audio'));\n  if (connectOutput) graph.connect(output.output('out'), graph.output.input('in'));\n  for (const [suffix, range] of Object.entries({\n    waveform: { min: 0, max: 7, default: 1, discrete: true },\n    drive: { min: 0, max: 20, default: 0 },\n    driveShape: { min: 0, max: 3, default: 0, discrete: true },\n    driveBias: { min: -1, max: 1, default: 0 },\n    pulseWidth: { min: 0.01, max: 0.99, default: 0.5 },\n    unison: { min: 1, max: 8, default: 1, discrete: true },\n    detune: { min: 0, max: 100, default: 0 },\n    spread: { min: 0, max: 1, default: 0 },\n    renderMode: { min: 0, max: 1, default: 0, discrete: true },\n    additivePartials: { min: 1, max: 32, default: 8, discrete: true },\n    additiveTilt: { min: -1, max: 1, default: 0 },\n    additiveDrift: { min: 0, max: 1, default: 0 },\n    manualPitch: { min: 0, max: 127, default: 60 },\n    manualLevel: { min: 0, max: 1, default: 0 },\n    output: { min: 0, max: 2, default: 0.8 },\n  }))\n    graph.registerControl(`${OSC_BASE}/${suffix}`, range);\n  for (let index = 1; index <= 8; index++) {\n    for (const [suffix, range] of Object.entries({\n      gate: { min: 0, max: 1, default: 0 },\n      vOct: { min: 0, max: 127, default: 60 },\n      fm: { min: -1, max: 1, default: 0 },\n      pwCv: { min: 0, max: 1, default: 0.5 },\n    }))\n      graph.registerControl(`${voicePath(index)}/${suffix}`, range);\n  }\n  return output;\n}\n// Graph definition \u2014 construct inspectable primitives with stable identities.\nfunction buildGraph() {\n  const graph = createGraphWorkspace();\n  addRackOscillatorModule(graph, { connectOutput: true });\n  return graph;\n}\n/** Interpret old path controls against any prepared graph containing this module. */\nfunction setRackOscillatorControl(session, path, value) {\n  const project = session.toProject();\n  const values = new Map(project.controls.map((entry) => [entry.path, entry.value]));\n  if (!values.has(path))\n    throw new GraphContractError('unknown-control', `Unknown oscillator control: ${path}`);\n  const instances = new Map(project.instances.map((entry) => [entry.path, entry.nodeId]));\n  const node = (index) => instances.get(oscillatorPath(index));\n  const output = instances.get(`${OSC_BASE}/nodes/output`);\n  if (!output || Array.from({ length: 9 }, (_, index) => node(index + 1)).some((id) => !id)) {\n    throw new GraphContractError('unsupported-project', 'Rack oscillator nodes are missing');\n  }\n  const suffix = path.slice(path.lastIndexOf('/') + 1);\n  const control = { path, value };\n  if (suffix === 'output')\n    return session.parameterWithControl({ nodeId: output, id: 0, value: value * 0.25 }, control);\n  if (suffix === 'manualPitch')\n    return session.parameterWithControl(\n      {\n        nodeId: node(9),\n        id: 1,\n        value: Math.max(20, Math.min(8000, hz(value))),\n      },\n      control,\n    );\n  if (suffix === 'manualLevel')\n    return session.parameterWithControl({ nodeId: node(9), id: 2, value: value * 0.4 }, control);\n  const match = path.match(/\\/voice\\/(\\d+)\\/(gate|vOct|fm|pwCv)$/);\n  if (match) {\n    const index = Number(match[1]);\n    const base = voicePath(index);\n    const get = (key) => (key === suffix ? value : values.get(`${base}/${key}`));\n    const edit =\n      suffix === 'gate'\n        ? {\n            nodeId: node(index),\n            id: 2,\n            value: Math.min(0.4, Math.max(0, value)),\n          }\n        : suffix === 'pwCv'\n          ? {\n              nodeId: node(index),\n              id: 4,\n              value: Math.max(\n                0.01,\n                Math.min(0.99, values.get(`${OSC_BASE}/pulseWidth`) + value - 0.5),\n              ),\n            }\n          : {\n              nodeId: node(index),\n              id: 1,\n              value: Math.max(20, Math.min(8000, hz(get('vOct') + get('fm') * 12))),\n            };\n    return session.parameterWithControl(edit, control);\n  }\n  const ids = {\n    waveform: 0,\n    drive: 5,\n    driveShape: 6,\n    driveBias: 7,\n    pulseWidth: 4,\n    unison: 10,\n    detune: 11,\n    spread: 12,\n    renderMode: 13,\n    additivePartials: 14,\n    additiveTilt: 15,\n    additiveDrift: 16,\n  };\n  if (Object.hasOwn(ids, suffix)) {\n    const edits = Array.from({ length: 9 }, (_, index) => ({\n      nodeId: node(index + 1),\n      id: ids[suffix],\n      value:\n        suffix === 'pulseWidth' && index < 8\n          ? Math.max(0.01, Math.min(0.99, value + values.get(`${voicePath(index + 1)}/pwCv`) - 0.5))\n          : value,\n    }));\n    return session.parametersWithControl(edits, control);\n  }\n  throw new GraphContractError('unknown-control', `Unsupported oscillator control: ${path}`);\n}\n// Host integration \u2014 the session publishes edits only after audio acceptance.\n\nexport default function createProject() {\n  // Audio interface and composition \u2014 host input/output are graph boundaries.\n  const graph = createGraphWorkspace();\n  addRackOscillatorModule(graph, { connectOutput: true });\n  // Eight reusable core envelopes, composed through the public graph contract.\n  for (let index = 1; index <= 8; index++) {\n    const envelope = graph.add(adsrDefinition.type, { id: 30 + index });\n    graph.registerInstance(OSC_BASE + '/envelopes/' + index, envelope);\n    const input = graph.find(13).input('in-' + index);\n    graph.disconnect(input);\n    graph.connect(graph.find(3 + index).output('out'), envelope.input('audio'));\n    graph.connect(envelope.output('out'), input);\n  }\n  const ADSR_BASE = '/keyboard/adsr';\n  for (const [name, min, max, value] of [\n    ['attack', 0.001, 5, 0.05],\n    ['decay', 0.001, 5, 0.2],\n    ['sustain', 0, 1, 0.7],\n    ['release', 0.001, 10, 0.4],\n  ])\n    graph.registerControl(ADSR_BASE + '/' + name, { min, max, default: value });\n  const control = (name, label, group, choices) => ({\n    id: name,\n    type: 'control',\n    path: OSC_BASE + '/' + name,\n    label,\n    group,\n    ...(choices ? { choices } : {}),\n  });\n  // Presentation \u2014 one declared UI serves retained and immediate renderers.\n  const view = [\n    {\n      id: 'oscillator-preview',\n      type: 'curve',\n      points: [],\n      label: 'WAVE MODE',\n      color: '#38bdf8',\n      group: 'Preview',\n    },\n    {\n      id: 'drive-preview',\n      type: 'curve',\n      points: [],\n      label: 'DRIVE',\n      color: '#f97316',\n      group: 'Preview',\n    },\n    control('waveform', 'Waveform', 'Source', [\n      'Sine',\n      'Saw',\n      'Square',\n      'Triangle',\n      'Blend',\n      'Noise',\n      'Pulse',\n      'SuperSaw',\n    ]),\n    control('pulseWidth', 'Pulse width', 'Source'),\n    control('drive', 'Drive', 'Source'),\n    control('driveShape', 'Drive shape', 'Source', ['Soft', 'Hard', 'Clip', 'Fold']),\n    control('driveBias', 'Bias', 'Source'),\n    control('unison', 'Unison', 'Unison'),\n    control('detune', 'Detune (cents)', 'Unison'),\n    control('spread', 'Stereo spread', 'Unison'),\n    control('renderMode', 'Render mode', 'Additive', ['Standard', 'Additive']),\n    control('additivePartials', 'Partials', 'Additive'),\n    control('additiveTilt', 'Tilt', 'Additive'),\n    control('additiveDrift', 'Drift', 'Additive'),\n    control('manualPitch', 'Pitch (MIDI)', 'Manual'),\n    control('manualLevel', 'Level', 'Manual'),\n    control('output', 'Output', 'Manual'),\n    ...['attack', 'decay', 'sustain', 'release'].map((name) => ({\n      id: name,\n      type: 'control',\n      path: ADSR_BASE + '/' + name,\n      label: name[0].toUpperCase() + name.slice(1),\n      group: 'ADSR',\n    })),\n    { id: 'keyboard', type: 'keyboard', firstNote: 48, noteCount: 25, group: 'Play' },\n  ];\n  let previewKey = '',\n    previewModel;\n  function paint(ui, snapshot) {\n    const controls = Object.fromEntries(\n      snapshot.graph.controls\n        .filter((c) => c.path.startsWith(OSC_BASE + '/'))\n        .map((c) => [c.path.slice(OSC_BASE.length + 1), c.value]),\n    );\n    const key = JSON.stringify(\n      [\n        'waveform',\n        'pulseWidth',\n        'renderMode',\n        'additivePartials',\n        'additiveTilt',\n        'additiveDrift',\n        'drive',\n        'driveShape',\n        'driveBias',\n      ].map((k) => controls[k]),\n    );\n    if (key !== previewKey) {\n      previewKey = key;\n      previewModel = oscillatorPreviewCurves(controls);\n    }\n    const preview = previewModel;\n    for (const { path, type, ...options } of view) {\n      if (type === 'curve')\n        ui.curve({\n          ...options,\n          points: options.id === 'drive-preview' ? preview.drive : preview.wave,\n          color: options.id === 'drive-preview' ? '#f97316' : preview.color,\n          label: options.id === 'drive-preview' ? 'DRIVE' : preview.label,\n        });\n      else if (type === 'keyboard')\n        ui.keyboard({\n          ...options,\n          activeNotes: (snapshot.eventState?.voices ?? []).filter((v) => v.gate).map((v) => v.note),\n        });\n      else ui.control(path, options);\n    }\n  }\n  // Live controls \u2014 the host invokes this mapper for accepted UI gestures.\n  function onControl(session, path, value) {\n    if (path.startsWith(ADSR_BASE + '/')) {\n      const id = ['attack', 'decay', 'sustain', 'release'].indexOf(path.split('/').at(-1));\n      return session.parametersWithControl(\n        Array.from({ length: 8 }, (_, i) => ({ nodeId: 31 + i, id, value })),\n        { path, value },\n      );\n    }\n    return setRackOscillatorControl(session, path, value);\n  }\n  // Live events \u2014 keyboard/MIDI enter through the returned onEvent hook.\n  const eventStateSchema = 'manifold.rack-oscillator.keyboard.v1';\n  const envelopeId = (index) => 31 + index;\n  const startVoice = (session, index, note, amplitude) => {\n    setRackOscillatorControl(session, voicePath(index + 1) + '/vOct', note);\n    setRackOscillatorControl(session, voicePath(index + 1) + '/gate', amplitude);\n  };\n  const releaseVoice = (session, index) =>\n    session.parameters([{ nodeId: envelopeId(index), id: 4, value: 0 }]);\n  const silenceVoice = (session, index) =>\n    setRackOscillatorControl(session, voicePath(index + 1) + '/gate', 0);\n\n  // Allocation is project orchestration; envelopes and oscillator samples run in Rust.\n  const emptyVoice = () => ({\n    active: false,\n    note: null,\n    gate: 0,\n    stamp: 0,\n    owner: '',\n    channel: 0,\n    startedAt: 0,\n    releasedAt: 0,\n    releaseLevel: 0,\n    velocity: 0,\n    keyDown: 0,\n    envelopeStage: 'idle',\n    envelopeLevel: 0,\n  });\n  const eventState = { stamp: 0, sustain: {}, voices: Array.from({ length: 8 }, emptyVoice) };\n  function onEvent(session, event, state) {\n    const project = session.toProject(),\n      controls = new Map(project.controls.map((c) => [c.path, c.value]));\n    const get = (name) => controls.get(ADSR_BASE + '/' + name);\n    const owner = String(event.owner ?? 'user'),\n      channel = event.channel ?? 0;\n    if (!Number.isInteger(channel) || channel < 0 || channel > 15)\n      throw new GraphContractError('invalid-event', 'Invalid MIDI channel');\n    const next = structuredClone(state);\n    for (const voice of next.voices) {\n      const age = Math.max(0, event.at - voice.startedAt);\n      if (voice.gate) {\n        voice.envelopeLevel =\n          age < get('attack')\n            ? age / get('attack')\n            : age < get('attack') + get('decay')\n              ? 1 - ((1 - get('sustain')) * (age - get('attack'))) / get('decay')\n              : get('sustain');\n        voice.envelopeStage = 'sustain';\n      } else if (voice.active) {\n        voice.envelopeLevel =\n          voice.releaseLevel * Math.max(0, 1 - (event.at - voice.releasedAt) / get('release'));\n        voice.envelopeStage = voice.envelopeLevel > 0 ? 'release' : 'idle';\n        if (voice.envelopeStage === 'idle') voice.active = false;\n      }\n    }\n    if (event.type === 'panic') {\n      for (const [index, voice] of next.voices.entries()) {\n        if (\n          (event.owner == null || voice.owner === owner) &&\n          (event.channel == null || voice.channel === channel)\n        ) {\n          silenceVoice(session, index);\n          session.parameters([{ nodeId: envelopeId(index), id: 4, value: 0 }]);\n          next.voices[index] = emptyVoice();\n        }\n      }\n      for (const key of Object.keys(next.sustain)) {\n        const separator = key.lastIndexOf(':');\n        if (\n          (event.owner == null || key.slice(0, separator) === owner) &&\n          (event.channel == null || Number(key.slice(separator + 1)) === channel)\n        )\n          delete next.sustain[key];\n      }\n      return next;\n    }\n    if (event.type === 'all-notes-off') {\n      for (const [index, voice] of next.voices.entries()) {\n        if (voice.gate && voice.owner === owner && voice.channel === channel) {\n          voice.keyDown = 0;\n          if (next.sustain?.[owner + ':' + channel]) continue;\n          releaseVoice(session, index);\n          voice.gate = 0;\n          voice.releasedAt = event.at;\n          voice.releaseLevel = voice.envelopeLevel;\n          voice.envelopeStage = 'release';\n        }\n      }\n      return next;\n    }\n    if (event.type === 'sustain') {\n      if (typeof event.down !== 'boolean')\n        throw new GraphContractError('invalid-event', 'Sustain must be boolean');\n      next.sustain ??= {};\n      next.sustain[owner + ':' + channel] = event.down;\n      if (!event.down)\n        for (const [index, voice] of next.voices.entries()) {\n          if (voice.gate && !voice.keyDown && voice.owner === owner && voice.channel === channel) {\n            releaseVoice(session, index);\n            voice.gate = 0;\n            voice.releasedAt = event.at;\n            voice.releaseLevel = voice.envelopeLevel;\n            voice.envelopeStage = 'release';\n          }\n        }\n      return next;\n    }\n    if (\n      !['note-on', 'note-off'].includes(event.type) ||\n      !Number.isInteger(event.note) ||\n      event.note < 0 ||\n      event.note > 127\n    )\n      throw new GraphContractError('invalid-event', 'Expected a MIDI note-on, note-off or panic');\n    if (event.type === 'note-on') {\n      const velocity = event.velocity ?? 100;\n      if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127)\n        throw new GraphContractError('invalid-event', 'Invalid note velocity');\n      const index = chooseMainVoice(next.voices),\n        stamp = (next.stamp % 1000000) + 1;\n      startVoice(session, index, event.note, Math.min(0.4, 0.03 + (velocity / 127) * 0.37));\n      session.parameters([\n        { nodeId: envelopeId(index), id: 4, value: 1 },\n        { nodeId: envelopeId(index), id: 5, value: stamp },\n      ]);\n      next.stamp = stamp;\n      next.voices[index] = {\n        ...emptyVoice(),\n        active: true,\n        note: event.note,\n        gate: 1,\n        stamp,\n        owner,\n        channel,\n        startedAt: event.at,\n        velocity,\n        keyDown: 1,\n        envelopeStage: 'attack',\n      };\n    } else\n      for (const [index, voice] of next.voices.entries()) {\n        if (\n          voice.gate &&\n          voice.note === event.note &&\n          voice.owner === owner &&\n          voice.channel === channel\n        ) {\n          voice.keyDown = 0;\n          if (next.sustain?.[owner + ':' + channel]) continue;\n          releaseVoice(session, index);\n          voice.gate = 0;\n          voice.releasedAt = event.at;\n          voice.releaseLevel = voice.envelopeLevel;\n          voice.envelopeStage = 'release';\n        }\n      }\n    return next;\n  }\n\n  return { graph, view, paint, onControl, onEvent, eventState, eventStateSchema };\n}\n";

  // packages/manifold-author/examples/live-oscillator-controller.mjs
  function createProject(host, saved = null) {
    return createLiveCreatorProject(host, source2, saved);
  }
  function restoreProject(host, saved) {
    return createProject(host, saved);
  }
  return __toCommonJS(live_oscillator_controller_exports);
})();
